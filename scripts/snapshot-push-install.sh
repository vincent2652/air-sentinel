#!/bin/bash
# 安装：每小时在本机自动生成并推送零换算官方快照（launchd，开机自启）。
# 前提：本机能访问 air.cnemc.cn:18007（家庭宽带通常可以）。卸载：scripts/snapshot-push-uninstall.sh
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
LABEL="com.airsentinel.snapshot-push"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${HERE}/snapshot-push.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>3600</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>/tmp/airsentinel-snapshot.log</string>
  <key>StandardErrorPath</key><string>/tmp/airsentinel-snapshot.err</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "已安装每小时官方快照推送：${LABEL}"
