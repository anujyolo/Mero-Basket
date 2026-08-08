#!/bin/bash
# Hourly snapshot of the working tree to GitHub.
#
# Installed as a launchd user agent (see scripts/install-hourly-push.sh).
# Deliberately conservative: it skips rather than guesses whenever the repo
# is in a state a snapshot could damage.

set -uo pipefail

REPO="/Users/anujadhikari/Documents/Hackathon"
TARGET_BRANCH="codex/frontend-backend-structure"
LOG="$REPO/.git/hourly-push.log"

# launchd starts with a bare PATH; git and its keychain helper live here.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >>"$LOG"; }

cd "$REPO" || { log "FAIL: cannot cd to $REPO"; exit 1; }

# Never snapshot mid-rebase/merge/bisect — committing then would corrupt the operation.
if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ] || [ -f .git/MERGE_HEAD ] || [ -f .git/BISECT_LOG ]; then
  log "SKIP: repo is mid rebase/merge/bisect"
  exit 0
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
if [ "$BRANCH" != "$TARGET_BRANCH" ]; then
  log "SKIP: on '$BRANCH', job only snapshots '$TARGET_BRANCH'"
  exit 0
fi

if [ -z "$(git status --porcelain)" ]; then
  # Nothing new locally, but a previous run may have failed to push.
  if [ -n "$(git log --oneline "origin/$TARGET_BRANCH..$TARGET_BRANCH" 2>/dev/null)" ]; then
    log "No local changes, but unpushed commits exist — pushing"
  else
    log "SKIP: nothing to commit or push"
    exit 0
  fi
else
  git add -A

  # .gitignore already excludes .env*, but a newly added secret file would sail
  # through unnoticed. Refuse the whole snapshot rather than publish a key.
  SECRETS="$(git diff --cached --name-only | grep -Ei '(^|/)\.env($|\.)|\.pem$|\.p12$|id_rsa|(^|/)secrets?\.(json|ya?ml|txt)$|service-account.*\.json$' || true)"
  if [ -n "$SECRETS" ]; then
    git reset -q
    log "ABORT: refusing to commit possible secrets:"
    echo "$SECRETS" | sed 's/^/    /' >>"$LOG"
    exit 1
  fi

  FILES="$(git diff --cached --name-only | wc -l | tr -d ' ')"
  git commit -q -m "Hourly snapshot $(date '+%Y-%m-%d %H:%M') ($FILES files)" \
    -m "Automated working-tree snapshot from the hourly launchd job." || {
      log "FAIL: commit failed"
      exit 1
    }
  log "Committed $FILES changed file(s)"
fi

if PUSH_OUT="$(git push origin "$TARGET_BRANCH" 2>&1)"; then
  log "Pushed to origin/$TARGET_BRANCH"
else
  # Most likely the remote moved ahead. Auto-rebasing unattended risks conflicts
  # that would leave the tree wedged, so surface it and stop.
  log "FAIL: push rejected — resolve manually (git pull --rebase)"
  echo "$PUSH_OUT" | sed 's/^/    /' >>"$LOG"
  exit 1
fi

# Keep the log from growing without bound.
if [ "$(wc -l <"$LOG" | tr -d ' ')" -gt 2000 ]; then
  tail -n 500 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
