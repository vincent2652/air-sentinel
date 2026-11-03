#!/bin/bash
# 卸载每小时官方快照推送任务
set -u
LABEL="com.airsentinel.snapshot-push"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "已卸载：${LABEL}"
