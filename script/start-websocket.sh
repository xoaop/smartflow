#!/bin/bash
# SmartFlow WebSocket长连接模式一键启动脚本
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(dirname "$SCRIPT_DIR")

cd "$PROJECT_ROOT" || exit 1

# 停止已运行的WebSocket服务
pkill -f "node smartflow-websocket.js" > /dev/null 2>&1

# 构建最新代码
echo "🔨 正在构建最新代码..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ 构建失败，请检查代码错误"
  exit 1
fi

# 启动WebSocket服务
echo "🚀 启动WebSocket长连接服务..."
nohup node smartflow-websocket.js > logs/websocket.log 2>&1 &

echo "✅ WebSocket长连接服务已启动"
echo "💡 无需配置公网IP和回调地址，直接在飞书群@机器人即可使用"
echo "📋 查看日志：tail -f logs/websocket.log"
