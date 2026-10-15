#!/usr/bin/env bash
# Unattended batch runner. Usage: scripts/run-batches.sh [--until N]
#
# Each batch is built in up to three time windows (6h, 4h, 2h of session time). A session that ends
# early gets an error check (/check-batch error) and the work goes on in the same window; a window that
# runs out gets a progress check (/check-batch window) before the next one. A built batch gets up to 8
# reviews, and each rejection is fixed in the same three windows. An accepted batch is then documented
# in docs/user-guide/ (/document-batch). Usage-limit waits are not counted.
# The runner stops (needs_human) only when the windows or the reviews run out, Claude is logged out,
# or a session sets needs_human. While it runs, the latest build is served on http://localhost:5300.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

UNTIL=50
while [[ $# -gt 0 ]]; do
  case "$1" in
    --until) UNTIL="$2"; shift 2;;
    *) echo "unknown arg $1"; exit 2;;
  esac
done

read -ra WINDOWS <<< "${WINDOWS_SECS:-21600 14400 7200}"  # session time per window: 6h, 4h, 2h
MAX_REVIEWS=8                                 # reviews per batch before needs_human
REVIEW_BUDGET="${REVIEW_BUDGET:-7200}"        # session time one review may take, reruns included
CHECK_CAP="${CHECK_CAP:-3600}"                # session time one progress check may take
DOCS_BUDGET="${DOCS_BUDGET:-7200}"            # session time the documentation of one batch may take
FIRST_AUTO_BATCH=2                            # earlier batches were built by hand and are not reviewed
PREVIEW_PORT=5300
HEARTBEAT_EVERY="${HEARTBEAT_EVERY:-300}"     # seconds between "still ..." lines
LIMIT_RECHECK="${LIMIT_RECHECK:-900}"         # seconds between retries while a usage limit is active
FAST_FAIL_PAUSE="${FAST_FAIL_PAUSE:-300}"     # pause after a session that failed within 2 minutes
LOG=docs/auto-run.log
OUT=docs/last-session.log                     # latest session's output (*.log is gitignored)
PREVIEW_LOG=docs/preview-server.log
LIMIT_RE="^You.{1,3}ve hit your [a-z ]*limit"
AUTH_RE="Please run /login|Invalid API key|OAuth token has expired"

field() { grep -E "^$1:" docs/PROGRESS.md | head -1 | sed -E "s/^$1:[[:space:]]*//" | tr -d '\r'; }
# PROGRESS.md stores two-digit numbers ("08"); force base 10 so bash does not read them as octal.
last_done() { echo $((10#$(field last_completed_batch))); }
# Status lines go to the terminal on stderr and to the log.
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG" >&2; }
mins() { echo $(( $1 / 60 )); }
# The PROGRESS.md entry of batch $1, from its "### Batch NN" heading to the next heading.
entry() {
  awk -v h="### Batch $(printf %02d "$1")" 'index($0, h) == 1 { on = 1; print; next } on && /^### / { exit } on' \
    docs/PROGRESS.md | tr -d '\r'
}
review_count() { entry "$1" | grep -cE '^- review: (accepted|rejected)'; }
fix_count() { entry "$1" | grep -cE '^- fix-attempt'; }
docs_count() { entry "$1" | grep -cE '^- docs:'; }
# Latest review step of batch $1: accepted, rejected, fixed (a fix after the last rejection) or empty.
review_state() {
  entry "$1" | grep -oE '^- (review: (accepted|rejected)|fix-attempt)' | tail -1 \
    | sed -e 's/^- review: //' -e 's/^- fix-attempt$/fixed/'
}
stop_if_human() {
  local reason; reason="$(field needs_human)"
  [[ -z "$reason" || "$reason" == none ]] || { log "STOP: needs_human: $reason"; exit 3; }
}
needs_human() { sed -i -E "s|^needs_human:.*|needs_human: $1|" docs/PROGRESS.md; log "STOP: needs_human: $1"; exit 3; }

HEARTBEAT_PID=""; SESSION_PID=""; PREVIEW_PID=""; SESSION_SECS=0
# Logs "still <label> (<used> of <total> min)" every HEARTBEAT_EVERY seconds; $2 = seconds already used.
start_heartbeat() {
  local label="$1" base="$2" total="$3" started; started=$(date +%s)
  # The trap ends the pending sleep too, so no stray sleep keeps the terminal or a pipe open.
  ( trap 'kill "$sp" 2>/dev/null; exit 0' TERM
    while true; do
      sleep "$HEARTBEAT_EVERY" & sp=$!; wait "$sp"
      log "still $label ($(mins $(( base + $(date +%s) - started ))) of $(mins "$total") min)"
    done ) >&2 &
  HEARTBEAT_PID=$!
}
stop_heartbeat() {
  [[ -n "$HEARTBEAT_PID" ]] || return 0
  kill "$HEARTBEAT_PID" 2>/dev/null; wait "$HEARTBEAT_PID" 2>/dev/null; HEARTBEAT_PID=""
}
# Serves dist/ (rebuilt by every `npm run check`) so the user can follow progress; restarted if it died.
ensure_preview() {
  [[ -n "$PREVIEW_PID" ]] && kill -0 "$PREVIEW_PID" 2>/dev/null && return 0
  [[ -f dist/index.html ]] || return 0
  node node_modules/vite/bin/vite.js preview --port "$PREVIEW_PORT" --strictPort < /dev/null > "$PREVIEW_LOG" 2>&1 &
  PREVIEW_PID=$!
}
cleanup() {
  stop_heartbeat
  [[ -n "$SESSION_PID" ]] && kill "$SESSION_PID" 2>/dev/null
  [[ -n "$PREVIEW_PID" ]] && kill "$PREVIEW_PID" 2>/dev/null
}
trap cleanup EXIT
trap 'log "STOP: interrupted"; exit 130' INT
trap 'log "STOP: window closed"; exit 129' HUP
trap 'log "STOP: terminated"; exit 143' TERM

# Runs one step as Claude sessions until a session ends on its own or $3 seconds of session time are
# used ($4 = seconds of the window already used and $5 = window size, both for the heartbeat). Output
# ends up in $OUT and the session time used in SESSION_SECS; returns the exit code (124 = time used up).
# A usage-limit message pauses and reruns the step; the wait is not counted.
# MSYS_NO_PATHCONV stops Git Bash rewriting "/next-batch" into "C:/Program Files/Git/next-batch".
# The session runs in the background so Ctrl+C reaches the INT trap at once; cleanup ends it.
# Call it directly, never inside $(...): a subshell would lose SESSION_PID and the traps.
run_claude() {
  local prompt="$1" label="$2" budget="$3" base="${4:-0}" total="${5:-$3}" rc left started
  SESSION_SECS=0
  while true; do
    left=$(( budget - SESSION_SECS ))
    (( left > 0 )) || return 124
    ensure_preview
    start_heartbeat "$label" $(( base + SESSION_SECS )) "$total"
    started=$(date +%s)
    MSYS_NO_PATHCONV=1 timeout "${left}s" claude -p "$prompt" --dangerously-skip-permissions \
      --output-format text < /dev/null > "$OUT" 2>&1 &
    SESSION_PID=$!
    wait "$SESSION_PID"; rc=$?
    SESSION_PID=""
    stop_heartbeat
    SESSION_SECS=$(( SESSION_SECS + $(date +%s) - started ))
    cat "$OUT" >> "$LOG"
    if grep -qE "$LIMIT_RE" "$OUT"; then
      log "usage limit: $(grep -m1 -E "$LIMIT_RE" "$OUT" | tr -d '\r'); retrying every $(mins "$LIMIT_RECHECK") min (not counted)"
      sleep "$LIMIT_RECHECK"
      continue
    fi
    if (( rc != 0 )) && head -5 "$OUT" | grep -qE "$AUTH_RE"; then
      needs_human "Claude Code is logged out: run claude, then /login"
    fi
    return "$rc"
  done
}

# Whether the build (last_completed_batch reached $2) or fix (a "batch-NN: fixes" commit after $3, or a
# new fix-attempt line beyond $4) of batch $2 is finished.
work_done() {
  if [[ "$1" == build ]]; then (( $(last_done) >= $2 )); return; fi
  git log --format=%s "$3..HEAD" | grep -qE "^batch-0*$2: fixes" || (( $(fix_count "$2") > $4 ))
}

# Builds batch $2 (build) or fixes its rejected review (fix) in the time windows. Returns when the work
# is done; stops the runner with needs_human when every window is used up.
work_phase() {
  local kind="$1" n="$2" prompt verb w win budget spent rc head fixes
  if [[ "$kind" == build ]]; then prompt="/next-batch auto"; verb=building; else prompt="/next-batch auto fix"; verb=fixing; fi
  for w in "${!WINDOWS[@]}"; do
    budget=${WINDOWS[w]}; spent=0; win="window $(( w + 1 ))/${#WINDOWS[@]}"
    (( w > 0 )) && log "$verb batch $n: $win ($(mins "$budget") min)"
    while (( spent < budget )); do
      head=$(git rev-parse HEAD); fixes=$(fix_count "$n")
      run_claude "$prompt" "$verb batch $n, $win" $(( budget - spent )) "$spent" "$budget"; rc=$?
      spent=$(( spent + SESSION_SECS ))
      stop_if_human
      work_done "$kind" "$n" "$head" "$fixes" && return 0
      (( rc == 124 || spent >= budget )) && break
      log "$verb batch $n: session ended after $(mins "$SESSION_SECS") min without finishing (exit $rc); error check"
      if (( SESSION_SECS < 120 )); then log "pausing $(mins "$FAST_FAIL_PAUSE") min first"; sleep "$FAST_FAIL_PAUSE"; fi
      run_claude "/check-batch error" "checking batch $n after an error, $win" $(( budget - spent )) "$spent" "$budget"
      spent=$(( spent + SESSION_SECS ))
      stop_if_human
    done
    log "$verb batch $n: $win used up"
    (( w + 1 < ${#WINDOWS[@]} )) || break
    log "=== progress check of batch $n ==="
    run_claude "/check-batch window" "checking progress of batch $n" "$CHECK_CAP"
    stop_if_human
  done
  needs_human "batch $n: $verb not finished in any of the ${#WINDOWS[@]} time windows"
}

# Reviews batch $1 until a review accepts it, fixing each rejection first. Stops with needs_human after
# MAX_REVIEWS rejections, or when a review gives no verdict within REVIEW_BUDGET of session time.
review_phase() {
  local n="$1" k before spent tries reviewed=0
  while true; do
    case "$(review_state "$n")" in
      accepted) (( reviewed )) && log "batch $n accepted"; return 0;;
      rejected)
        k=$(review_count "$n")
        (( k < MAX_REVIEWS )) || needs_human "batch $n rejected in $k reviews"
        log "=== fix batch $n (rejected in review $k/$MAX_REVIEWS) ==="
        work_phase fix "$n";;
    esac
    before=$(review_count "$n"); k=$(( before + 1 )); spent=0; tries=0; reviewed=1
    log "=== review batch $n ($k/$MAX_REVIEWS) ==="
    while (( $(review_count "$n") == before )); do
      (( spent < REVIEW_BUDGET )) || needs_human "review $k of batch $n gave no verdict"
      (( tries++ > 0 )) && log "review $k of batch $n ended without a verdict; running it again"
      run_claude "/review-batch" "reviewing batch $n ($k/$MAX_REVIEWS)" $(( REVIEW_BUDGET - spent )) "$spent" "$REVIEW_BUDGET"
      spent=$(( spent + SESSION_SECS ))
      stop_if_human
      if (( SESSION_SECS < 120 && $(review_count "$n") == before )); then sleep "$FAST_FAIL_PAUSE"; fi
    done
  done
}

# Writes the user documentation of batch $1. A run that adds no `- docs:` line to the entry is rerun
# within DOCS_BUDGET of session time; after that the build goes on, and the next documentation run
# catches up because /document-batch also documents earlier batches that have no `- docs:` line.
docs_phase() {
  local n="$1" spent=0 tries=0
  (( $(docs_count "$n") > 0 )) && return 0
  log "=== document batch $n ==="
  while (( $(docs_count "$n") == 0 )); do
    if (( spent >= DOCS_BUDGET )); then
      log "documentation of batch $n not finished; the next documentation run catches up"; return 0
    fi
    (( tries++ > 0 )) && log "documentation of batch $n ended without a docs line; running it again"
    run_claude "/document-batch $n" "documenting batch $n" $(( DOCS_BUDGET - spent )) "$spent" "$DOCS_BUDGET"
    spent=$(( spent + SESSION_SECS ))
    stop_if_human
    if (( SESSION_SECS < 120 && $(docs_count "$n") == 0 )); then sleep "$FAST_FAIL_PAUSE"; fi
  done
  log "batch $n documented"
}

windows_text() { local s out=""; for s in "${WINDOWS[@]}"; do out+="${out:+/}$(mins "$s")"; done; echo "$out min"; }
log "runner started: up to batch $UNTIL; build windows $(windows_text); up to $MAX_REVIEWS reviews, then docs, per batch"
ensure_preview; sleep 3
if [[ -n "$PREVIEW_PID" ]] && kill -0 "$PREVIEW_PID" 2>/dev/null; then
  log "progress preview: http://localhost:$PREVIEW_PORT (latest passing build; refresh to update)"
else
  log "progress preview not running (no dist/ yet, or port $PREVIEW_PORT busy; see $PREVIEW_LOG)"
fi

while true; do
  stop_if_human
  last="$(last_done)"
  (( last >= FIRST_AUTO_BATCH )) && review_phase "$last"
  (( last >= 1 )) && docs_phase "$last"
  if (( last >= UNTIL )); then log "DONE: batch $last reached"; exit 0; fi
  next=$(( last + 1 ))
  log "=== build batch $next ==="
  work_phase build "$next"
done
