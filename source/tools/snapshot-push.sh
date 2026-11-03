#!/bin/bash
# 在本机（能直连 cnemc 官方源）生成零换算官方快照并推送到 GitHub 仓库。
# 推送后 GitHub Pages 公网面即显示官方原值；Actions 仅在快照超过 90 分钟未更新时用 WAQI 兜底。
set -eu
cd "$(dirname "$0")/.."

SNAP_OUT=github-deploy/data node github-deploy/scripts/build-snapshot.mjs

cd github-deploy
git add data
if git diff --cached --quiet; then
  echo "snapshot unchanged, nothing to push"
  exit 0
fi
git -c user.name="vincent2652" -c user.email="vincent2652@users.noreply.github.com" commit -q -m "snapshot: cnemc official raw $(date -u +%FT%TZ)"
git push -q origin main
echo "snapshot pushed (cnemc raw)"
