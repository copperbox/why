#!/usr/bin/env bash
# One-shot bootstrap: local repo -> GitHub repo + labels + the full issue
# backlog from issues/*.md. Idempotent: safe to re-run; existing repo, labels,
# and already-filed issue titles are skipped.
#
# Usage: scripts/bootstrap-github.sh [owner/repo-name] [--public]
# Defaults to the copperbox org; pass an explicit owner/name to override.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

REPO_NAME="${1:-copperbox/why}"
VISIBILITY="--private"
[ "${2:-}" = "--public" ] && VISIBILITY="--public"

command -v gh >/dev/null || { echo "gh CLI is required"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not authenticated (gh auth login)"; exit 1; }
[ -f .sandcastle/.env ] || echo "⚠ .sandcastle/.env missing — copy .sandcastle/.env.example and fill in tokens before running the loop."

# --- git + remote ------------------------------------------------------------
if [ ! -d .git ]; then
  git init -b main
fi
if ! git rev-parse HEAD >/dev/null 2>&1; then
  git add -A
  git commit -m "bootstrap: why scaffold, .sandcastle autonomous pipeline, issue backlog

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
fi
if ! git remote get-url origin >/dev/null 2>&1; then
  gh repo create "$REPO_NAME" "$VISIBILITY" --source . --remote origin --push
else
  git push -u origin main
fi

# --- labels -------------------------------------------------------------------
make_label() { gh label create "$1" --color "$2" --description "$3" 2>/dev/null || true; }
make_label "Sandcastle" "1d76db" "queued for the autonomous build loop"
make_label "sandcastle:in-review" "c5def5" "parked: implemented, PR open"
make_label "sandcastle:in-progress" "fbca04" "actively being worked"
make_label "needs-chat" "b60205" "circuit breaker: spec needs a human chat before re-queueing"
for n in 1 2 3 4 5 6; do
  make_label "phase:$n" "0e8a16" "why build phase $n (PLAN.md)"
done

# --- issues -------------------------------------------------------------------
# File format: line 1 "# <title>", line 2 "Labels: a, b", body from line 4.
existing="$(gh issue list --state all --limit 500 --json title --jq '.[].title')"
filed=0 skipped=0
for f in issues/*.md; do
  title="$(head -1 "$f" | sed 's/^# //')"
  if grep -Fxq "$title" <<<"$existing"; then
    skipped=$((skipped + 1)); continue
  fi
  labels="$(sed -n '2s/^Labels:[[:space:]]*//p' "$f" | tr -d ' ')"
  tail -n +4 "$f" | gh issue create --title "$title" --label "$labels" --body-file - >/dev/null
  echo "  filed: $title [$labels]"
  filed=$((filed + 1))
done
echo "issues: $filed filed, $skipped already present"

# --- sandbox image ------------------------------------------------------------
[ -d node_modules ] || npm install
npx sandcastle docker build-image || echo "⚠ docker image build failed — build it manually before running the loop."

cat <<'EOF'

Bootstrap complete. Start the zero-human build with:

  npm run sandcastle:auto

Watch progress on GitHub (issues + PRs are the whole state). Stop any time
with Ctrl-C; every bit of state is on GitHub, so it resumes where it left off.
EOF
