#!/usr/bin/env bash
# The zero-human loop: alternate the Sandcastle build cycle (issues -> ready
# feature PRs) with the gatekeeper (review -> remediate -> merge/escalate,
# then phase promotion). Runs until the gatekeeper reports the backlog fully
# shipped, or something crashes.
#
# Exit-code contract:
#   sandcastle:   0 cycle ran | 3 idle | else crash
#                 (limit hits are detected by grepping its output — the build
#                 side soft-fails agents internally and still exits 0/3)
#   gate:         0 did work  | 3 idle | 4 ALL PHASES COMPLETE
#                 | 5 HALTED: an issue needs a human chat
#                 | 6 LIMIT: usage window exhausted — sleep and retry
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

IDLE=3
COMPLETE=4
HALT=5
LIMIT=6
# Poll interval while the Claude usage window is exhausted. Each retry probe
# costs one failing agent call, so a modest interval converges within minutes
# of the window resetting.
LIMIT_SLEEP_SECONDS="${SANDCASTLE_LIMIT_SLEEP:-900}"
# Requires failure context on the same line: agents legitimately *talk about*
# rate limits (docs, code) — only a failed-agent line may trigger the nap.
LIMIT_SIGNATURE='(failed|error|⚠).*(usage limit|rate.?limit|limit reached|quota exceeded|overloaded)'
build_log="$(mktemp -t sandcastle-build-XXXXXX.log)"
trap 'rm -f "$build_log"' EXIT

limit_nap() {
  echo "=== Claude usage limit hit ($1); sleeping ${LIMIT_SLEEP_SECONDS}s before retrying ==="
  echo "=== (all state is on GitHub — Ctrl-C now and rerunning later is equally safe) ==="
  sleep "$LIMIT_SLEEP_SECONDS"
}
IDLE_SLEEP_SECONDS="${SANDCASTLE_IDLE_SLEEP:-30}"

run=0
while true; do
  run=$((run + 1))
  echo "=== autonomous run #$run: build cycle ==="
  npm run sandcastle 2>&1 | tee "$build_log"
  build="${PIPESTATUS[0]}"
  if [ "$build" -ne 0 ] && [ "$build" -ne "$IDLE" ]; then
    echo "=== build cycle crashed (exit $build); stopping ==="
    exit "$build"
  fi
  # The build side catches agent failures internally ("will retry next cycle")
  # and exits 0 — detect limit-struck agents from its output so the loop waits
  # for the window instead of busy-spinning through no-op cycles.
  if grep -qiE "$LIMIT_SIGNATURE" "$build_log"; then
    limit_nap "build cycle"
    continue
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
  if [ "$gate" -eq "$LIMIT" ]; then
    limit_nap "gatekeeper"
    continue
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
