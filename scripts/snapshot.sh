#!/usr/bin/env bash
# snapshot.sh – lightweight wrapper used by QCKFX agent to capture full
# repository checkpoints inside the E2B sandbox.  The logic is copied from
# @qckfx/agent/scripts/snapshot.sh so we don’t need to rely on
# node_modules being installed before the script is available at runtime.
#
# Usage:  snapshot.sh <shadowDir> <repoRoot> <commitMessage> <toolExecutionId>
#
# 1. Stages *all* files from <repoRoot> into the session-scoped shadow git
#    repository located at <shadowDir>.
# 2. Creates a commit with the provided <commitMessage> (even if there are no
#    changes, thanks to --allow-empty).
# 3. Tags the commit so we can later restore to it easily.
# 4. Bundles the entire repository (all refs) into a temporary git-bundle
#    written inside <repoRoot> so the host can pull it back via the execution
#    adapter.
# 5. Prints three marker lines that the TypeScript side parses:
#       SNAPSHA:<sha>
#       SNAPFILE:<tmp bundle path>
#       SNAPEND
#
# The script must be kept POSIX-compatible because busybox sh is used in some
# sandbox images.

set -euo pipefail

shadowDir="$1"
repoRoot="$2"
commitMessage="$3"
toolExecutionId="$4"

# Helper that forces every git invocation to operate on the shadow repo while
# treating <repoRoot> as the work-tree.  This keeps the user’s real .git dir
# untouched.
g() {
  git --git-dir="$shadowDir" --work-tree="$repoRoot" "$@"
}

# Stage everything and create a commit – even if nothing changed vs. the
# previous checkpoint.
g add -A .
g commit --quiet --allow-empty -m "$commitMessage"

# Tag the commit so restore() can reference it by the tool execution ID.
g tag -f "chkpt/${toolExecutionId}" HEAD

# Resolve commit SHA for the return value.
SHA=$(g rev-parse HEAD)

# Bundle *all* refs so the host can fetch the entire history in one go.
tmp=$(mktemp -p "$repoRoot" -t bundle.XXXXXX)
g bundle create "$tmp" --all

# Emit marker lines consumed by the TS/JS side.
echo "SNAPSHA:$SHA"
echo "SNAPFILE:$tmp"
echo "SNAPEND"

# End of snapshot.sh
