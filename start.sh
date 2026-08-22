#!/bin/bash
cd "$(dirname "$0")"

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
