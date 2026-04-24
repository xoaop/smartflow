# SmartFlow - 基于飞书的团队效能周报生成系统

SmartFlow 是一个自动化的团队效能周报生成系统，基于飞书OpenClaw和Claude大模型，能够自动采集飞书文档、任务、会议数据，智能提炼生成高信息密度的工作总结和风险洞察，定时推送到飞书群，大幅提升团队信息流转效率。

## ✨ 核心功能

- **多源数据采集**：自动拉取飞书文档、任务、会议多源数据
- **智能内容生成**：基于Claude 3.5 Sonnet大模型，专业提炼总结
- **多周期支持**：支持周/双周/月度等多种生成周期
- **多团队隔离**：支持多个团队独立配置，数据完全隔离
- **定时自动推送**：灵活的定时任务配置，到点自动推送飞书卡片
- **智能风险识别**：自动识别任务延期、决议未跟进等潜在风险
- **来源溯源**：所有内容都标注原始来源链接，支持点击跳转

## 🚀 快速开始

### 环境要求
- Node.js >= 20.0.0
- 飞书企业自建应用权限
- Claude API Key

### 安装部署
```bash
# 1. 安装依赖
npm install

# 2. 编译
npm run build

# 3. 全局安装CLI
npm link

# 4. 健康检查
smartflow health
```

### 配置使用
1. 复制 `config/config.example.yaml` 到 `~/.smartflow/config/config.yaml`，配置Claude API Key
2. 创建团队配置：`smartflow config create my-team "我的团队"`
3. 编辑团队配置文件，填写飞书应用信息和数据源
4. 测试推送：`smartflow push test my-team`
5. 手动生成周报：`smartflow generate run --team my-team --range lastweek --push`
6. 启动定时任务：`smartflow schedule start`

## 📖 详细文档
- [使用手册](docs/使用手册.md) - 完整的使用说明和配置指南
- [配置模板](config/) - 配置文件示例

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
- **飞书开放平台SDK** - 飞书API对接
- **Anthropic Claude SDK** - 大模型集成
- **node-schedule** - 定时任务调度
- **SQLite** - 轻量级数据存储
- **Commander.js** - CLI框架

## 📄 许可证
MIT License
