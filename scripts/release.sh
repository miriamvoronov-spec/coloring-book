#!/usr/bin/env bash
# Build all three copies: friends Artifact, private Artifact, and the installable PWA (pushed to gh-pages).
# Usage: VITE_SAMPLES_PRIVATE='[...]' scripts/release.sh "message"
set -euo pipefail
cd "$(dirname "$0")/.."
msg="${1:-Update installable app}"

npm run build:artifact >/dev/null
fixrc() { sed -i 's/"\xef\xbf\xbd"/"\\uFFFD"/g' "$1"; }
fixrc dist-artifact/index.html
mkdir -p dist-friends
cp dist-artifact/index.html dist-friends/miriam-coloring-books.html
if grep -q "classiques7" dist-friends/miriam-coloring-books.html; then echo "friends build references private files" >&2; exit 1; fi

VITE_SAMPLES="${VITE_SAMPLES_PRIVATE:?set VITE_SAMPLES_PRIVATE}" npm run build:artifact >/dev/null
fixrc dist-artifact/index.html

npm run build >/dev/null
if grep -rq "classiques7" dist; then echo "PWA build references private files" >&2; exit 1; fi

wt="${GHP_WORKTREE:?set GHP_WORKTREE}"
if [ ! -d "$wt/.git" ] && [ ! -f "$wt/.git" ]; then git worktree add "$wt" gh-pages >/dev/null; fi
git -C "$wt" pull -q origin gh-pages || true
git -C "$wt" rm -rqf . >/dev/null
cp -r dist/. "$wt"/
touch "$wt/.nojekyll"
git -C "$wt" add -A
git -C "$wt" commit -qm "$msg" || echo "gh-pages: nothing to commit"
git -C "$wt" push -q origin gh-pages
echo "built: dist-friends, dist-artifact (private), gh-pages pushed"
