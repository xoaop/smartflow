# SmartFlow - 基于飞书的团队效能周报生成系统

SmartFlow 是一个自动化的团队效能周报生成系统，基于飞书OpenClaw和Claude大模型，能够自动采集飞书文档、任务、会议数据，智能提炼生成高信息密度的工作总结和风险洞察，定时推送到飞书群，大幅提升团队信息流转效率。

## ✨ 核心功能

- **多源数据采集**：自动拉取飞书文档、任务、会议多源数据
- **智能内容生成**：基于Claude 3.5 Sonnet大模型，专业提炼总结
- **多周期支持**：支持周/双周/月度等多种生成周期
- **多团队隔离**：支持多个团队独立配置，数据完全隔离
- **定时自动推送**：灵活的定时任务配置，到点自动推送飞书卡片
- **审核流程支持**：支持周报审核机制，审核通过后再推送
- **智能风险识别**：自动识别任务延期、决议未跟进等潜在风险
- **来源溯源**：所有内容都标注原始来源链接，支持点击跳转
- **双模式支持**：v2.0新增支持飞书官方CLI模式，自动获得全量飞书API能力
- **OpenClaw原生支持**：可以作为OpenClaw Agent直接部署到飞书，支持自然语言交互和卡片操作

## 🚀 快速开始

### 环境要求
- Node.js >= 20.0.0
- 飞书企业自建应用权限
- Claude API Key

### 安装部署

#### 方式一：CLI版本（本地部署）
```bash
# 1. 安装依赖
npm install

# 2. 编译
npm run build

# 3. 全局安装CLI
npm link

# 4. 健康检查
smartflow health

# 可选：安装飞书官方CLI（使用CLI模式时需要）
npx -y @larksuite/openclaw-lark install
```

#### 方式二：OpenClaw Agent（飞书原生部署）
```bash
# 1. 克隆项目
git clone <your-repo-url>
cd smartflow

# 2. 安装依赖
npm install

# 3. 编译
npm run build

# 4. 本地调试
npm run openclaw:dev

# 5. 发布到OpenClaw平台
npm run openclaw:publish
```
详细部署指南请参考 [OpenClaw部署指南](文档/OPENCLAW-DEPLOY.md)

### 配置使用
1. 复制 `config/config.example.yaml` 到 `~/.smartflow/config/config.yaml`，配置Claude API Key
2. 创建团队配置：`smartflow config create my-team "我的团队"`
3. 编辑团队配置文件，填写飞书应用信息和数据源
4. 测试推送：`smartflow push test my-team`
5. 手动生成周报：`smartflow generate run --team my-team --range lastweek --push`
6. 启动定时任务：`smartflow schedule start`

### 审核功能配置
如果需要启用周报审核流程：

1. 在团队配置中开启审核：
```yaml
push:
  needAudit: true
  auditorId: "飞书用户ID"  # 审核人的飞书用户ID
  channels:
    - type: group
      id: "飞书群ID"       # 审核通过后推送的群聊
```

2. 启动事件回调服务：
```bash
smartflow server start --port 3000
```

3. 在飞书开放平台配置事件订阅：
   - 请求URL：`http(s)://你的服务器地址/webhook/feishu/event`
   - 订阅事件：`卡片按钮回传事件（card.action.trigger）`
   - 将飞书提供的 `Verification Token` 配置到全局配置的 `feishu.eventVerificationToken` 字段

## 📖 详细文档
- [使用手册](docs/使用手册.md) - 完整的使用说明和配置指南
- [配置模板](config/) - 配置文件示例
- [v2.0升级指南](文档/UPGRADE-2.0.md) - 从v1.x升级到v2.0的指南
- [CLI模式说明](文档/UPGRADE-2.0.md) - 飞书官方CLI模式使用说明
- [OpenClaw部署指南](文档/OPENCLAW-DEPLOY.md) - 作为OpenClaw Agent部署到飞书的指南

## 🎯 CLI命令说明

### 基础命令
```bash
smartflow health                    # 健康检查
smartflow config list               # 列出所有团队配置
smartflow config create <teamId> <teamName>  # 创建团队配置
smartflow generate run --team <teamId> --range lastweek  # 生成周报
smartflow push test <teamId>        # 测试推送功能
smartflow schedule start            # 启动定时任务
```

### 审核相关命令
```bash
smartflow server start              # 启动飞书事件回调服务
smartflow server start --port 8080  # 指定端口启动
```

## 📦 项目结构
```
src/
├── cli/                  # CLI命令入口
├── modules/              # 业务模块
│   ├── config/          # 配置管理
│   ├── collector/       # 飞书数据采集
│   ├── generator/       # 大模型内容生成
│   ├── push/            # 飞书消息推送
│   └── schedule/        # 定时任务调度
└── common/               # 通用工具层
```

## 🛠️ 技术栈
- **TypeScript** - 类型安全的开发语言
- **Node.js** - 运行时环境
- **飞书开放平台SDK** - 飞书API对接（SDK模式）
- **飞书官方CLI** - 官方全量API支持（CLI模式）
- **Anthropic Claude SDK** - 大模型集成
- **node-schedule** - 定时任务调度
- **SQLite** - 轻量级数据存储
- **Commander.js** - CLI框架

## 📄 许可证
MIT License
