# SmartFlow OpenClaw Agent 部署指南

## 🚀 概述

SmartFlow 现在可以作为原生 OpenClaw Agent 运行在飞书生态中，获得飞书原生级别的交互体验。用户可以直接在飞书中@机器人，通过自然语言交互生成周报，无需使用命令行。

## ✨ OpenClaw 版本特性

1. **自然语言交互**：直接在飞书中@机器人说"生成上周团队周报"即可
2. **可视化卡片交互**：生成的周报支持"重新生成"、"推送到群"等按钮操作
3. **自动定时触发**：基于OpenClaw平台的定时能力，无需自己部署定时服务
4. **托管式运行**：不需要自己维护服务器，OpenClaw平台负责运行和扩容
5. **权限无缝集成**：直接使用飞书账号体系和权限控制

## 📋 部署步骤

### 前提条件
1. 已安装 OpenClaw 飞书官方插件
2. 拥有飞书机器人应用的创建权限
3. 已准备好 Claude API Key

### 步骤1：本地打包
```bash
# 克隆项目
git clone <your-repo-url>
cd smartflow

# 安装依赖
npm install

# 编译代码
npm run build
```

### 步骤2：配置Manifest
编辑 `openclaw/manifest.json` 文件，根据你的需求修改配置：
```json
{
  "id": "com.yourcompany.smartflow",  // 修改为你的唯一ID
  "name": "你的团队 周报助手",         // 修改为你的机器人名称
  "description": "自动生成团队效能周报",  // 修改描述
  "author": "你的团队名称",              // 修改作者
  "homepage": "https://your-website.com", // 修改主页
  // ... 其他配置按需修改
}
```

### 步骤3：本地调试
```bash
# 启动本地开发服务器
npm run openclaw:dev

# 在飞书中添加本地调试的Agent
# 参考OpenClaw官方文档：https://openclaw.ai/docs/development/local-debug
```

### 步骤4：配置环境变量
在OpenClaw平台的Agent配置页面，添加以下环境变量：
```bash
# Claude API配置
CLAUDE_API_KEY=your-claude-api-key
CLAUDE_BASE_URL=https://api.anthropic.com (可选)

# 飞书配置（如果使用SDK模式）
FEISHU_APP_ID=your-feishu-app-id
FEISHU_APP_SECRET=your-feishu-app-secret

# 全局配置
LOG_LEVEL=info
DEFAULT_TEAM_ID=your-default-team-id (可选)
```

### 步骤5：发布到OpenClaw平台
```bash
# 构建Agent包
npm run openclaw:build

# 发布到OpenClaw平台
npm run openclaw:publish

# 或者手动上传dist目录和manifest.json到OpenClaw平台
```

### 步骤6：配置飞书权限
在飞书开放平台，为你的机器人应用申请以下权限：
- `im:message:send_as_bot` - 发送消息
- `im:message:readonly` - 读取消息
- `docx:document:readonly` - 读取云文档
- `drive:drive.metadata:readonly` - 读取云空间文件元数据
- `task:task:read` - 读取任务
- `calendar:calendar.event:read` - 读取日历事件
- `vc:meeting:readonly` - 读取会议信息

### 步骤7：创建团队配置
在飞书中@你的机器人，发送消息：
```
创建团队配置 team-id "我的团队"
```
然后按照提示完成飞书数据源配置。

## 🎯 使用方式

### 基本使用
在飞书中@机器人，直接发送自然语言指令：
```
@周报助手 生成上周的团队周报
@周报助手 生成本月的团队周报并推送到群
@周报助手 测试推送
@周报助手 查看所有团队
```

### 技能列表
| 技能 | 说明 | 示例 |
|------|------|------|
| 生成周报 | 生成指定时间范围的团队周报 | `生成上周周报` / `生成2024-01-01~2024-01-07的周报` |
| 查看团队列表 | 查看所有已配置的团队 | `查看团队列表` |
| 创建团队配置 | 创建新的团队配置 | `创建团队配置 tech "技术团队"` |
| 测试推送 | 测试飞书推送功能 | `测试推送 tech` |

### 卡片交互
生成的周报卡片支持以下操作：
- 🔄 **重新生成**：使用相同参数重新生成周报
- 📤 **推送到群**：将当前周报推送到配置的飞书群
- 💾 **保存到文档**：将周报保存到飞书云文档（可选功能）

## ⚙️ 配置说明

### 团队配置
每个团队可以独立配置以下内容：
```yaml
# 飞书配置
feishu:
  appId: cli_xxxxxx
  appSecret: xxxxxx
  clientMode: cli  # 推荐使用cli模式，自动获得全量API能力

# 数据源配置
dataSources:
  docs:
    enabled: true
    rootFolderToken: "文件夹token"
    includeUsers: ["user_id_1", "user_id_2"]
    excludeDirs: ["归档"]
  tasks:
    enabled: true
    projectIds: ["project_id_1"]
  meetings:
    enabled: true
    calendarIds: ["calendar_id_1"]

# 生成配置
generate:
  cycle: weekly
  includeRisks: true
  includeNextWeekPlan: true
  detailLevel: medium

# 推送配置
push:
  enabled: true
  cronExpression: "0 18 * * 5"  # 每周五18:00自动推送
  channels:
    - type: group
      id: "oc_xxxxxx"  # 飞书群ID
  needAudit: false
  auditorId: "user_id"
```

## 🔄 定时任务配置
OpenClaw平台会自动根据团队配置的`cronExpression`定时触发周报生成任务，不需要自己维护定时服务。

如果需要修改定时规则，直接修改团队配置中的`push.cronExpression`即可，平台会自动更新定时任务。

## 🔧 故障排查

### 常见问题
1. **生成周报失败，提示权限不足**
   - 检查飞书应用是否申请了对应的权限
   - 检查飞书CLI是否正确配置
   - 运行 `smartflow feishu doctor` 诊断配置

2. **定时任务没有触发**
   - 检查团队配置中`push.enabled`是否为true
   - 检查`cronExpression`是否正确
   - 查看OpenClaw平台的任务执行日志

3. **卡片按钮点击无反应**
   - 检查Agent的事件处理是否正常部署
   - 查看OpenClaw平台的错误日志

### 日志查看
在OpenClaw平台的Agent管理页面，可以查看：
- 实时运行日志
- 任务执行历史
- 错误堆栈信息

## 📈 最佳实践

1. **推荐使用CLI模式**：飞书官方CLI会自动维护API封装和权限处理，减少维护成本
2. **开启审核机制**：对于重要的推送，建议开启`needAudit`配置，由人工审核后再推送
3. **合理设置生成周期**：根据团队实际需求选择周/双周/月度生成周期
4. **配置过滤规则**：使用`excludeKeywords`和`excludeUsers`过滤不需要的内容
5. **分团队配置**：不同团队使用独立的配置，实现数据隔离

## 🤝 迁移指南

### 从CLI版本迁移到OpenClaw版本
1. 导出原有团队配置：`smartflow config show <teamId>`
2. 在OpenClaw版本中重新创建团队配置
3. 测试数据采集和推送功能
4. 关闭原有CLI版本的定时任务
5. 启用OpenClaw版本的定时推送

### 数据迁移
现有历史周报数据可以通过以下方式迁移：
```bash
# 导出历史报告
sqlite3 ~/.smartflow/data/smartflow.db ".dump reports" > reports.sql

# 在OpenClaw环境中导入（需要开启数据库访问权限）
cat reports.sql | sqlite3 /path/to/openclaw/storage/smartflow.db
```

## 📚 相关文档
- [OpenClaw官方文档](https://openclaw.ai/docs)
- [飞书开放平台文档](https://open.feishu.cn/documentation)
- [SmartFlow v2.0升级指南](./UPGRADE-2.0.md)
