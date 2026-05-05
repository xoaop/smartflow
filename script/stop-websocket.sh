#!/bin/bash
# 停止SmartFlow WebSocket长连接服务

echo "🛑 正在停止WebSocket长连接服务..."
pkill -f "node smartflow-websocket.js"

if [ $? -eq 0 ]; then
  echo "✅ WebSocket长连接服务已停止"
else
  echo "ℹ️ WebSocket长连接服务未运行"
fi
