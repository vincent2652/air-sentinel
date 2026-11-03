#!/bin/bash
# 安装：把局域网服务器注册为开机自启、崩溃自拉的 launchd 任务。
# 可逆：用 tools/lan-uninstall.sh 卸载。
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
LABEL="com.airsentinel.lan"
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
    <string>${HERE}/lan-server.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>/tmp/airsentinel-lan.log</string>
  <key>StandardErrorPath</key><string>/tmp/airsentinel-lan.err</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "已安装并启动：${LABEL}"
echo "手机访问：http://$(ipconfig getifaddr en0 2>/dev/null || echo '<本机局域网IP>'):5177/"
