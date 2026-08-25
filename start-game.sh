#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if command -v node >/dev/null 2>&1; then
  exec node server.mjs
fi
if command -v xdg-open >/dev/null 2>&1; then
  exec xdg-open "$(pwd)/index.html"
fi
printf '%s\n' 'Ouvrez index.html dans un navigateur compatible WebGL 2.'
