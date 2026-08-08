#!/bin/bash
# Install (or reinstall) the hourly GitHub snapshot as a launchd user agent.
# Safe to re-run: it unloads any previous copy first.

set -euo pipefail

LABEL="com.padhaiyatra.hourly-push"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="/Users/anujadhikari/Documents/Hackathon"

mkdir -p "$HOME/Library/LaunchAgents"
chmod +x "$REPO/scripts/hourly-push.sh"

cat >"$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$REPO/scripts/hourly-push.sh</string>
  </array>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>WorkingDirectory</key>
  <string>$REPO</string>
  <key>StandardOutPath</key>
  <string>$REPO/.git/hourly-push.out.log</string>
  <key>StandardErrorPath</key>
  <string>$REPO/.git/hourly-push.err.log</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
PLIST_EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "Installed $LABEL (runs every 3600s)."
echo "Status:  launchctl list | grep hourly-push"
echo "Run now: launchctl kickstart gui/$(id -u)/$LABEL"
echo "Log:     tail -f $REPO/.git/hourly-push.log"
echo "Remove:  launchctl bootout gui/$(id -u)/$LABEL && rm $PLIST"
