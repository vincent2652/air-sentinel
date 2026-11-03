#!/bin/bash
# 在本机（能直连 cnemc 官方源的网络，如家庭宽带）生成零换算官方快照并推送。
# 推送后 GitHub Pages 公网面即显示官方原始值；Actions 仅在快照超过 90 分钟未更新时才用 WAQI 兜底。
set -eu
cd "$(dirname "$0")/.."

SNAP_OUT=data node scripts/build-snapshot.mjs

git add data
if git diff --cached --quiet; then
  echo "snapshot unchanged, nothing to push"
  exit 0
fi
git commit -q -m "snapshot: cnemc official raw $(date -u +%FT%TZ)"
git push -q origin main
echo "snapshot pushed (cnemc raw, zero conversion)"
