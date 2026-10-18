#!/bin/sh
# Copy the on-device web demos from the sibling project repos into demos/<name>/.
# Each project's source of truth is its own repo's docs/ folder; this keeps a copy
# on the portfolio so the demos work at shawaiz.de/demos/<name>/ without extra setup.
# Usage: scripts/sync-demos.sh   (run from the repo root; sibling repos in ../)
set -eu
cd "$(dirname "$0")/.."
for pair in resume-ai:resume-ai spardose-analysis:spardose pixelmorph:pixelmorph; do
  repo=${pair%%:*}; name=${pair##*:}; src="../$repo/docs"
  [ -d "$src" ] || { echo "skip $repo (no $src)"; continue; }
  rm -rf "demos/$name"; mkdir -p "demos/$name"
  # copy everything except README screenshots and dotfiles
  (cd "$src" && find . -type f ! -name '.*' ! -name 'screenshot*') | while read -r f; do
    mkdir -p "demos/$name/$(dirname "$f")"; cp "$src/$f" "demos/$name/$f"
  done
  # keep navigation inside the portfolio
  sed -i.bak 's|href="https://shawaiz.de/projects/"|href="../../projects/index.html"|g' "demos/$name/index.html" && rm "demos/$name/index.html.bak"
  echo "synced $repo → demos/$name"
done
