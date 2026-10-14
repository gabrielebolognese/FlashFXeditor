#!/usr/bin/env bash
# Unattended batch runner. Usage: scripts/run-batches.sh [--until N] [--max-turns T]
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

UNTIL=50; MAX_TURNS=500
while [[ $# -gt 0 ]]; do
  case "$1" in
    --until) UNTIL="$2"; shift 2;;
    --max-turns) MAX_TURNS="$2"; shift 2;;
    *) echo "unknown arg $1"; exit 2;;
  esac
done

LOG=docs/auto-run.log
field() { grep -E "^$1:" docs/PROGRESS.md | head -1 | sed -E "s/^$1:[[:space:]]*//" | tr -d '\r'; }
# PROGRESS.md stores two-digit numbers ("08"); force base 10 so bash does not read them as octal.
last_done() { echo $((10#$(field last_completed_batch))); }
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }
run_claude() { claude -p "$1" --dangerously-skip-permissions --max-turns "$MAX_TURNS" --output-format text 2>&1 | tee -a "$LOG"; }

while true; do
  last="$(last_done)"
  needs="$(field needs_human)"
  if [[ -n "$needs" && "$needs" != "none" ]]; then log "STOP: needs_human: $needs"; exit 3; fi
  if (( last >= UNTIL )); then log "DONE: batch $last reached"; exit 0; fi

  next=$((last + 1))
  log "=== build batch $next ==="
  run_claude "/next-batch auto" > /dev/null

  needs="$(field needs_human)"
  if [[ -n "$needs" && "$needs" != "none" ]]; then log "STOP: needs_human: $needs"; exit 3; fi
  if (( $(last_done) != next )); then
    # A run that only fixed a rejected batch ends with a "batch-NN: fixes" commit; send it to review.
    if git log -1 --format=%s | grep -qE '^batch-[0-9]+: fixes$'; then :; else
      log "batch $next did not complete; retrying once"
      run_claude "/next-batch auto" > /dev/null
      (( $(last_done) == next )) || { log "STOP: batch $next incomplete after retry"; exit 4; }
    fi
  fi

  log "=== review batch $(last_done) ==="
  verdict="$(run_claude "/review-batch" | tail -1)"
  if [[ "$verdict" == *REJECTED* ]]; then
    log "rejected; one fix attempt"
    run_claude "/next-batch auto" > /dev/null
    verdict="$(run_claude "/review-batch" | tail -1)"
    if [[ "$verdict" == *REJECTED* ]]; then log "STOP: batch $(last_done) rejected twice"; exit 5; fi
  fi
  log "batch $(last_done) accepted"
done
