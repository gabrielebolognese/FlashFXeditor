#!/usr/bin/env bash
# Unattended batch runner. Usage: scripts/run-batches.sh [--until N] [--timeout DURATION] [--max-turns T]
#   --timeout    wall-clock cap per Claude session (default 2h; e.g. 90m, 3h)
#   --max-turns  turn cap per session (default: none)
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

UNTIL=50; TIMEOUT=2h; MAX_TURNS=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --until) UNTIL="$2"; shift 2;;
    --timeout) TIMEOUT="$2"; shift 2;;
    --max-turns) MAX_TURNS="$2"; shift 2;;
    *) echo "unknown arg $1"; exit 2;;
  esac
done

LOG=docs/auto-run.log
OUT=docs/last-session.log                       # latest session's output (*.log is gitignored)
HEARTBEAT_EVERY="${HEARTBEAT_EVERY:-300}"       # seconds between "still ..." lines
LIMIT_RECHECK="${LIMIT_RECHECK:-900}"           # seconds between retries while a usage limit is active
LIMIT_RE="^You.{1,3}ve hit your [a-z ]*limit"

field() { grep -E "^$1:" docs/PROGRESS.md | head -1 | sed -E "s/^$1:[[:space:]]*//" | tr -d '\r'; }
# PROGRESS.md stores two-digit numbers ("08"); force base 10 so bash does not read them as octal.
last_done() { echo $((10#$(field last_completed_batch))); }
# Status lines go to the terminal on stderr so they never mix into a session's output (the verdict is read from it).
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG" >&2; }

HEARTBEAT_PID=""; SESSION_PID=""
start_heartbeat() {
  local label="$1" started; started=$(date +%s)
  ( while sleep "$HEARTBEAT_EVERY"; do log "still $label ($(( ($(date +%s) - started) / 60 )) min)"; done ) >&2 &
  HEARTBEAT_PID=$!
}
stop_heartbeat() {
  [[ -n "$HEARTBEAT_PID" ]] || return 0
  kill "$HEARTBEAT_PID" 2>/dev/null; wait "$HEARTBEAT_PID" 2>/dev/null; HEARTBEAT_PID=""
}
cleanup() {
  stop_heartbeat
  [[ -n "$SESSION_PID" ]] && kill "$SESSION_PID" 2>/dev/null
}
trap cleanup EXIT
trap 'log "STOP: interrupted"; exit 130' INT

# Runs one Claude session; its output ends up in $OUT. A session that hits the plan's usage limit is
# rerun every LIMIT_RECHECK seconds until the limit resets, so the build pauses instead of stopping.
# MSYS_NO_PATHCONV stops Git Bash rewriting "/next-batch" into "C:/Program Files/Git/next-batch".
# The session runs in the background so Ctrl+C reaches the INT trap at once; cleanup ends the session.
# Call it directly, never inside $(...): a subshell would lose SESSION_PID and the traps.
run_claude() {
  local prompt="$1" label="$2" rc turns=()
  [[ -n "$MAX_TURNS" ]] && turns=(--max-turns "$MAX_TURNS")
  while true; do
    start_heartbeat "$label"
    MSYS_NO_PATHCONV=1 timeout "$TIMEOUT" claude -p "$prompt" --dangerously-skip-permissions "${turns[@]}" \
      --output-format text < /dev/null > "$OUT" 2>&1 &
    SESSION_PID=$!
    wait "$SESSION_PID"; rc=$?
    SESSION_PID=""
    stop_heartbeat
    cat "$OUT" >> "$LOG"
    (( rc == 124 )) && log "$label: session stopped at the $TIMEOUT limit"
    if grep -qE "$LIMIT_RE" "$OUT"; then
      log "usage limit: $(grep -m1 -E "$LIMIT_RE" "$OUT" | tr -d '\r'); retrying every $(( LIMIT_RECHECK / 60 )) min"
      sleep "$LIMIT_RECHECK"
      continue
    fi
    return "$rc"
  done
}

# Sets VERDICT to the review's last output line. A review that ends without a verdict is run once more.
VERDICT=""
review() {
  run_claude "/review-batch" "reviewing batch $1"
  VERDICT="$(tail -1 "$OUT")"
  [[ "$VERDICT" == *"REVIEW: "* ]] && return
  log "review of batch $1 ended without a verdict; running it again"
  run_claude "/review-batch" "reviewing batch $1 (again)"
  VERDICT="$(tail -1 "$OUT")"
}

log "runner started: up to batch $UNTIL, $TIMEOUT max per session"
while true; do
  last="$(last_done)"
  needs="$(field needs_human)"
  if [[ -n "$needs" && "$needs" != "none" ]]; then log "STOP: needs_human: $needs"; exit 3; fi
  if (( last >= UNTIL )); then log "DONE: batch $last reached"; exit 0; fi

  next=$((last + 1))
  log "=== build batch $next ==="
  run_claude "/next-batch auto" "building batch $next"

  needs="$(field needs_human)"
  if [[ -n "$needs" && "$needs" != "none" ]]; then log "STOP: needs_human: $needs"; exit 3; fi
  if (( $(last_done) != next )); then
    # A run that only fixed a rejected batch ends with a "batch-NN: fixes" commit; send it to review.
    if git log -1 --format=%s | grep -qE '^batch-[0-9]+: fixes$'; then :; else
      log "batch $next did not complete; retrying once"
      run_claude "/next-batch auto" "building batch $next (retry)"
      (( $(last_done) == next )) || { log "STOP: batch $next incomplete after retry"; exit 4; }
    fi
  fi

  n="$(last_done)"
  log "=== review batch $n ==="
  review "$n"
  if [[ "$VERDICT" != *"REVIEW: "* ]]; then log "STOP: no review verdict for batch $n"; exit 6; fi
  if [[ "$VERDICT" == *REJECTED* ]]; then
    log "rejected; one fix attempt"
    run_claude "/next-batch auto" "fixing batch $n"
    review "$n"
    if [[ "$VERDICT" != *ACCEPTED* ]]; then log "STOP: batch $n rejected twice"; exit 5; fi
  fi
  log "batch $n accepted"
done
