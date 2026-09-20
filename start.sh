#!/bin/bash
cd "$(dirname "$0")"

# node:sqlite needs Node.js 22.13+. Check up front so an old or missing Node
# shows a message here instead of a server that dies behind an open browser tab.
if ! node -e "require('node:sqlite')" >/dev/null 2>&1; then
  echo "Trenching Journal needs Node.js 22.13 or newer."
  echo "Get the current LTS from https://nodejs.org and run this again."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies, this only happens once..."
  npm install
fi

node server/index.js &
SERVER_PID=$!

sleep 2
if command -v open >/dev/null 2>&1; then
  open http://localhost:3000
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open http://localhost:3000
fi

wait $SERVER_PID
