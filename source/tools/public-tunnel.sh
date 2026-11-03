#!/bin/bash
# 空气哨兵 · 公网一键发布（零注册、零账号）
#
# 适用：本脚本所在机器能正常访问外网（家庭宽带等）。公司网络封了隧道出口，请勿在公司网跑。
# 作用：在本机起一个服务（静态单文件 + 国控站官方数据代理），再用 cloudflared 快速隧道
#       暴露成公网 HTTPS 地址（https://xxx.trycloudflare.com），手机 anywhere 可打开。
#
# 依赖：node、cloudflared（缺失时脚本会提示安装命令）
# 停止：Ctrl-C，或 pkill -f 'serve.mjs 5178' && pkill -f 'cloudflared tunnel'
set -u
cd "$(dirname "$0")/.."

command -v node >/dev/null 2>&1 || { echo "缺少 node，请先安装 Node.js 18+"; exit 1; }
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "缺少 cloudflared。macOS 安装：brew install cloudflared ；其他系统见 https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 1
fi

PORT=5178
pkill -f "serve.mjs $PORT" 2>/dev/null
pkill -f 'cloudflared tunnel' 2>/dev/null
sleep 1

mkdir -p tmp
WEB_DIR=web-standalone HOST=127.0.0.1 FN_PORT=8000 nohup node dev/serve.mjs "$PORT" > tmp/public-server.log 2>&1 &
SRV=$!
sleep 2
curl -s -m 5 -o /dev/null "http://127.0.0.1:$PORT/" || { echo "本地服务未起来，见 tmp/public-server.log"; exit 1; }

echo "本地服务已起（127.0.0.1:$PORT），正在申请公网隧道……"
cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate 2>&1 | tee tmp/public-tunnel.log | grep --line-buffered -E 'trycloudflare|https://|ERR' &
TUN=$!

echo ""
echo "公网地址会在上方日志里打印（形如 https://xxxx.trycloudflare.com）。"
echo "iPhone 使用：Safari 打开该地址 → 允许定位 → 分享 → 添加到主屏幕 → 自动锁定设永不。"
echo "数据源：中国环境监测总站官方实时发布（经本机代理）；代理不可用时自动降级为 Open-Meteo 并明确标注。"
echo "保持本终端或后台进程运行即可持续服务；停止：pkill -f 'serve.mjs $PORT' && pkill -f 'cloudflared tunnel'"

wait $SRV
