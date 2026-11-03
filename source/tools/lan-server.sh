#!/bin/bash
# 空气哨兵 · 局域网常亮服务器
# 绑定 0.0.0.0:5177，供同一网络内的 iPhone 免登录访问便携单文件版。
# 同时用 caffeinate 阻止 Mac 闲置睡眠（仅接电源时生效），保证展示屏不断流。
set -u
cd "$(dirname "$0")/.."

export WEB_DIR=web-standalone
export HOST=0.0.0.0
export FN_PORT=8000

node dev/serve.mjs 5177 &
NODE_PID=$!

# -s 接电源时阻止睡眠；-w 跟随服务进程生命周期
caffeinate -s -w "$NODE_PID" 2>/dev/null &

wait "$NODE_PID"
