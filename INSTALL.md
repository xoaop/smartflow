# SmartFlow 安装配置指南

## 🚀 快速开始（推荐：Webhook模式）
这是最稳定、最容易配置的运行模式，适合有公网服务器的场景。

### 1. 环境准备
- Node.js >= 20.0.0
- 有公网IP的服务器
- 飞书企业自建应用（需要配置权限）

### 2. 安装步骤
```bash
# 1. 克隆项目
git clone <仓库地址>
cd smartflow

# 2. 安装依赖
npm install

# 3. 配置团队信息
# 复制配置模板并修改
cp config/config.example.yaml config/config.yaml
# 编辑 config.yaml，填写飞书应用凭证和团队配置

# 4. 启动Webhook服务
./script/start-webhook.sh
```

### 3. 飞书开放平台配置
1. 登录[飞书开放平台](https://open.feishu.cn/)，进入你的自建应用
2. 进入「事件订阅」页面：
   - **请求地址**：填写 `http://<你的服务器公网IP>:3000/feishu/webhook`
   - 点击「验证」，确认回调地址可以正常访问
3. 订阅事件：
   - 添加「消息与群组」→「接收消息v2.0（`im.message.receive_v1`）」事件
4. 权限申请：
   - 申请以下权限并发布版本：
     - `im:message`：发送与接收消息
     - `drive:document`：读取文档
     - `project:task`：读取任务
     - `calendar:calendar`：读取日历
     - `contact:user`：读取用户信息

### 4. 测试使用
在飞书群中@机器人，发送「生成上周周报」即可开始使用！

## 🔄 长连接模式（无需公网IP）
适合本地部署或没有公网IP的场景，不需要配置回调地址。

```bash
# 启动长连接服务
./script/start-websocket.sh

# 查看日志
tail -f logs/websocket.log
```

> 注意：长连接模式需要在飞书开放平台开启「长连接模式」，具体配置参考飞书文档。

## 📋 命令说明
```bash
# 启动Webhook模式
./script/start-webhook.sh

# 启动长连接模式
./script/start-websocket.sh

# 停止Webhook服务
./script/stop-webhook.sh

# 停止长连接服务
./script/stop-websocket.sh

# 停止所有服务
./script/stop-all.sh
```

## 🔧 OpenClaw Skill 安装
如果要作为OpenClaw技能使用：

1. **安装依赖**
```bash
npm install
npm run build
```

2. **配置OpenClaw**
```bash
# 1. 将项目链接到OpenClaw技能目录
ln -s /path/to/smartflow ~/.openclaw/skills/smartflow-weekly

# 2. 重启OpenClaw网关
openclaw gateway restart
```

3. **验证安装**
```bash
# 查看技能列表，确认smartflow-weekly已加载
openclaw skills list | grep smartflow
```

4. **配置触发规则**
在`skill.json`中已经配置了消息触发器，当用户在飞书群@机器人并发送相关关键词时，会自动触发对应技能。

## 📝 常用命令
```bash
# 查看帮助
npm run smartflow --help

# 健康检查
npm run smartflow health

# 手动生成周报
npm run smartflow generate run --team <teamId> --range lastweek

# 测试飞书推送
npm run smartflow push test <teamId>
```

## ❓ 常见问题
### 1. 飞书回调验证失败
- 检查服务器安全组是否开放了3000端口
- 确认公网IP可以正常访问
- 查看日志：`tail -f logs/webhook.log`

### 2. 机器人收到消息但不回复
- 检查是否已经@机器人
- 确认飞书应用已经发布并添加到群聊
- 查看日志确认消息是否到达服务

### 3. 数据采集为空
- 检查飞书应用权限是否已经申请并通过
- 确认配置的数据源（文档文件夹、项目、日历、群聊）ID正确
- 确认机器人有权限访问这些资源

## 🎯 支持的交互命令
- `@机器人 生成上周周报` → 生成上周团队周报
- `@机器人 生成本周周报` → 生成本周周报
- `@机器人 生成上月月报` → 生成上月月度总结
- `@机器人 帮助` → 查看使用说明
- `@机器人 状态` → 检查服务运行状态
- `@机器人 配置` → 启动配置向导
