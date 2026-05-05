#!/bin/bash
# SmartFlow Webhook模式一键启动脚本
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(dirname "$SCRIPT_DIR")

cd "$PROJECT_ROOT" || exit 1

# 停止已运行的Webhook服务
pkill -f "node smartflow-server.js" > /dev/null 2>&1

# 构建最新代码
echo "🔨 正在构建最新代码..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ 构建失败，请检查代码错误"
  exit 1
fi

# 启动Webhook服务
echo "🚀 启动Webhook服务..."
nohup node smartflow-server.js > logs/webhook.log 2>&1 &

echo "✅ Webhook服务已启动，监听端口 3000"
echo "📝 飞书回调地址：http://<服务器公网IP>:3000/feishu/webhook"
echo "📋 查看日志：tail -f logs/webhook.log"
