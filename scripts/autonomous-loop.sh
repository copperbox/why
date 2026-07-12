#!/usr/bin/env bash
# The zero-human loop: alternate the Sandcastle build cycle (issues -> ready
# feature PRs) with the gatekeeper (review -> remediate -> merge/escalate,
# then phase promotion). Runs until the gatekeeper reports the backlog fully
# shipped, or something crashes.
#
# Exit-code contract:
#   sandcastle:   0 cycle ran | 3 idle | else crash
#   gate:         0 did work  | 3 idle | 4 ALL PHASES COMPLETE
#                 | 5 HALTED: an issue needs a human chat | else crash
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

IDLE=3
COMPLETE=4
HALT=5
IDLE_SLEEP_SECONDS="${SANDCASTLE_IDLE_SLEEP:-30}"

run=0
while true; do
  run=$((run + 1))
  echo "=== autonomous run #$run: build cycle ==="
  npm run sandcastle
  build=$?
  if [ "$build" -ne 0 ] && [ "$build" -ne "$IDLE" ]; then
    echo "=== build cycle crashed (exit $build); stopping ==="
    exit "$build"
  fi

  echo "=== autonomous run #$run: gatekeeper ==="
  npm run sandcastle:gate
  gate=$?
  if [ "$gate" -eq "$COMPLETE" ]; then
    echo "=== all phases complete: backlog empty, no open feature PRs. Done. ==="
    exit 0
  fi
  if [ "$gate" -eq "$HALT" ]; then
    echo "=== HALTED: the gatekeeper tripped a circuit breaker. ==="
    echo "=== A spec needs rewriting in a chat session — the needs-chat issue(s) and"
    echo "=== their agenda comments are listed above. Re-arm the issue, then rerun. ==="
    command -v notify-send >/dev/null && notify-send "why autonomous build HALTED" "An issue needs a chat — see its needs-chat agenda on GitHub." || true
    exit "$HALT"
  fi
  if [ "$gate" -ne 0 ] && [ "$gate" -ne "$IDLE" ]; then
    echo "=== gatekeeper crashed (exit $gate); stopping ==="
    exit "$gate"
  fi

  if [ "$build" -eq "$IDLE" ] && [ "$gate" -eq "$IDLE" ]; then
    echo "=== both sides idle; sleeping ${IDLE_SLEEP_SECONDS}s ==="
    sleep "$IDLE_SLEEP_SECONDS"
  fi
done
