#!/usr/bin/env bash
# Makes a throwaway project with a small beads queue for the README demo.
# Usage: demo/setup.sh [dir]   (default: a fresh temp dir; prints its path)
set -euo pipefail
dir="${1:-$(mktemp -d -t beads-band-demo)}"
mkdir -p "$dir"
cd "$dir"
# br stamps records with the acting user; the demo acts as "demo".
export BD_ACTOR=demo
git init -q
printf '.beads/\n' > .gitignore
br init >/dev/null 2>&1
add() { br create --title "$1" -t task -p "$2" >/dev/null 2>&1; }
add "Add a dark mode toggle to settings" 2
add "Cache the search index between runs" 1
add "Write a migration guide for v2" 2
add "Fix flaky upload test on CI" 1
add "Rate-limit the public API" 2
add "Profile cold start on mobile" 3
add "Remove the legacy export path" 3
add "Document the plugin config options" 2
echo "$dir"
