#!/bin/bash
# 停止SmartFlow Webhook服务

echo "🛑 正在停止Webhook服务..."
pkill -f "node smartflow-server.js"

if [ $? -eq 0 ]; then
  echo "✅ Webhook服务已停止"
else
  echo "ℹ️ Webhook服务未运行"
fi
