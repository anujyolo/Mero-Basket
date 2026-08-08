#!/bin/bash
# Put the local dev server on a public HTTPS URL anyone can open.
#
#   npm run dev          # in one terminal
#   bash scripts/share-publicly.sh   # in another
#
# Prints a https://<random>.trycloudflare.com link. No Cloudflare account needed.
# The URL is new on every run and only lives while this script and the dev
# server are both running.

set -uo pipefail

PORT="${PORT:-3002}"
BIN_DIR="$HOME/.local/bin"
BIN="$BIN_DIR/cloudflared"

if [ ! -x "$BIN" ]; then
  ARCH="$(uname -m)"
  [ "$ARCH" = "arm64" ] && SUFFIX="arm64" || SUFFIX="amd64"
  echo "Downloading cloudflared (official Cloudflare release)…"
  mkdir -p "$BIN_DIR"
  TMP="$(mktemp -d)"
  curl -fsSL -o "$TMP/cloudflared.tgz" \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-$SUFFIX.tgz" || {
      echo "Download failed. Check your internet connection."; exit 1; }
  tar xzf "$TMP/cloudflared.tgz" -C "$TMP"
  mv "$TMP/cloudflared" "$BIN"
  chmod +x "$BIN"
  rm -rf "$TMP"
fi

if ! curl -sf -o /dev/null --max-time 5 "http://localhost:$PORT/"; then
  echo "Nothing is serving on port $PORT. Start it first:  npm run dev"
  exit 1
fi

echo "Starting public tunnel to http://localhost:$PORT …"
echo "Share the https://<name>.trycloudflare.com URL below. Ctrl-C to stop."
echo
exec "$BIN" tunnel --url "http://localhost:$PORT" --no-autoupdate
