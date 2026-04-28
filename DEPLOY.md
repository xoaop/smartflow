# SmartFlow 部署指南

## 三种部署方式

---

### 方式一：安装为 OpenClaw Skill（推荐，已验证）

适用于已运行 OpenClaw Agent 的用户（如飞书妙搭）

```bash
# 1. 下载项目包
# 下载 smartflow-weekly-xxx.tar.gz 到本地

# 2. 解压到 OpenClaw workspace skills 目录
tar -xzf smartflow-weekly-xxx.tar.gz
# 路径应为 ~/.openclaw/skills/smartflow-weekly/
# 或你的 OpenClaw workspace/skills/ 目录

# 3. 安装依赖
cd <skill-directory>
npm install --legacy-peer-deps

# 4. 重启 OpenClaw Gateway
openclaw restart

# 5. 验证 skill 已加载
openclaw skills list | grep smartflow
# 应显示 ✓ ready
```

---

### 方式二：从 ClawHub 安装（待发布）

```bash
# 安装（发布到 clawhub.com 后可用）
openclaw skills install smartflow-weekly

# 或
clawhub install smartflow-weekly
```

---

### 方式三：独立 CLI 运行（不需要 OpenClaw）

```bash
# 1. 克隆或解压项目
cd smartflow

# 2. 安装依赖
npm install --legacy-peer-deps

# 3. 编译 TypeScript
npm run build

# 4. 全局安装 CLI
npm link

# 5. 健康检查
smartflow health

# 6. 初始化配置（按提示填写）
smartflow setup
```

---

## 飞书权限配置（必须）

无论哪种部署方式，都需要在飞书开放平台开通权限：

1. 前往 [飞书开放平台](https://open.feishu.cn/app) 创建企业自建应用
2. 开通以下权限：

| 权限 | 用途 |
|------|------|
| `docx:document:readonly` | 读取文档 |
| `drive:drive.metadata:readonly` | 搜索文档 |
| `calendar:calendar.event:readonly` | 读取日历 |
| `task:task:read` | 读取任务 |
| `im:message:send_as_user` | 推送消息 |
| `im:message:readonly` | 读取群消息 |

3. 发布应用版本

---

## 配置团队信息

编辑 `config/team-config.example.yaml`，主要配置项：

```yaml
teamId: my-team
teamName: 我的团队
feishu:
  appId: cli_xxx      # 飞书应用 App ID
  appSecret: xxx       # 飞书应用 App Secret
generate:
  cycle: weekly        # 生成周期
  detailLevel: medium   # 详细程度 low/medium/high
push:
  enabled: true
  channels:
    - type: feishu_dm
      target: ou_xxx   # 推送目标的 open_id
```

---

## 常见问题

**Q: skill 安装成功但无法调用？**
```bash
openclaw skills list | grep smartflow
# 确认状态为 ✓ ready
```

**Q: 飞书 API 调用失败？**
- 检查应用权限是否开通并发布了版本
- 尝试在飞书里重新完成批量授权

**Q: 定时推送没有触发？**
- 检查 cron 任务：`openclaw cron list`
- 确认 nextRunAt 时间符合预期

---

## 项目结构

```
smartflow-weekly/
├── src/                      # TypeScript 源码
│   ├── common/               # 通用模块（LLM/Logger/DB）
│   └── modules/
│       ├── collector/        # 数据采集（文档/任务/会议/群聊）
│       ├── config/           # 配置管理
│       ├── generator/       # LLM 生成 + 幻觉校验
│       └── push/            # 飞书卡片构建 + 推送
├── dist/                     # 编译后的 JS
├── build-card.js             # 卡片构建脚本（独立可运行）
├── latest-report.json        # 最近一次报告数据
└── skill.json               # OpenClaw Skill 描述
```
