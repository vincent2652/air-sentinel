#!/bin/bash
# 卸载：停止并移除局域网服务器的 launchd 任务，删除 plist。
set -u
LABEL="com.airsentinel.lan"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
pkill -f 'dev/serve.mjs 5177' 2>/dev/null || true
echo "已卸载：${LABEL}"
