#!/bin/bash
# 停止所有SmartFlow相关服务

echo "🛑 正在停止所有SmartFlow服务..."

# 停止Webhook服务
pkill -f "node smartflow-server.js" > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ Webhook服务已停止"
fi

# 停止WebSocket服务
pkill -f "node smartflow-websocket.js" > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ WebSocket长连接服务已停止"
fi

# 停止OpenClaw相关进程
pkill -f "openclaw" > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ OpenClaw服务已停止"
fi

# 停止消息处理进程
pkill -f "process-message.js" > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ 消息处理进程已停止"
fi

echo "🎉 所有SmartFlow服务已停止"
