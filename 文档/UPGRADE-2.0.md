# 升级指南：v2.0 - 支持飞书官方CLI模式

## 概述

v2.0版本新增了对飞书官方CLI的支持，你可以选择继续使用原有的SDK模式，或者切换到更强大的CLI模式，享受飞书官方提供的全量API能力和自动维护的优势。

## 新特性亮点

### 🚀 双模式支持
- **SDK模式（默认）**：原有实现，基于`@larksuiteoapi/node-sdk`封装
- **CLI模式**：调用飞书官方CLI，自动获得所有最新飞书API能力，无需手动封装

### 🎁 CLI模式优势
1. **自动更新**：飞书官方会持续更新CLI，支持所有新发布的飞书API
2. **认证简化**：支持机器人身份和用户身份两种运行模式
3. **内置重试**：官方CLI内置了完善的重试、限流、错误处理机制
4. **多租户隔离**：每个团队可以独立配置不同的CLI profile
5. **权限自动管理**：CLI自动处理token刷新、权限申请等问题

## 升级步骤

### 1. 升级SmartFlow版本
```bash
npm install -g smartflow@latest
```

### 2. 安装飞书官方CLI（可选，仅CLI模式需要）
```bash
npx -y @larksuite/openclaw-lark install
```

### 3. 配置CLI模式

#### 方式一：全局设置为CLI模式
```bash
# 查看当前模式
smartflow health

# 设置全局默认模式为CLI
smartflow feishu mode cli

# 查看状态
smartflow feishu status
```

#### 方式二：为单个团队设置CLI模式
```bash
# 为指定团队配置CLI（机器人模式，使用现有appId和appSecret）
smartflow feishu setup <teamId>

# 或者使用用户身份模式（需要在飞书中授权）
smartflow feishu setup <teamId> --mode user
```

### 4. 诊断配置
```bash
# 诊断CLI配置是否正确
smartflow feishu doctor
```

### 5. 测试功能
```bash
# 测试飞书推送
smartflow push test <teamId>

# 测试数据采集
smartflow generate collect --team <teamId> --range lastweek
```

## 配置说明

### 全局配置
全局配置文件位于 `~/.smartflow/config/config.yaml`，新增了`feishuDefaultMode`配置项：
```yaml
# 全局默认飞书客户端模式：sdk 或 cli
feishuDefaultMode: sdk
```

### 团队配置
每个团队的配置文件中新增了`feishu.clientMode`配置项，可单独指定该团队使用的模式：
```yaml
feishu:
  appId: cli_xxxxxx
  appSecret: xxxxxx
  scopes: []
  # 可选：指定该团队使用的客户端模式，覆盖全局配置
  clientMode: cli
```

## 模式对比

| 特性 | SDK模式 | CLI模式 |
|------|---------|---------|
| 部署复杂度 | 低，无需额外安装 | 中，需要安装飞书CLI |
| API覆盖度 | 仅实现了周报需要的API | 全量飞书API支持 |
| 维护成本 | 高，需要手动更新SDK和封装API | 低，官方自动维护 |
| 认证模式 | 仅支持机器人身份 | 支持机器人和用户两种身份 |
| 功能扩展 | 慢，需要自行封装新API | 快，官方更新即可用 |
| 性能 | 高，直接调用API | 中，有CLI进程启动开销 |

## 迁移建议

### 适合使用CLI模式的场景
1. 需要使用飞书的新功能（如妙记、知识库、OKR等数据源）
2. 不想维护飞书SDK版本和API封装
3. 需要以用户身份访问飞书数据（如读取个人日历、私人文档等）
4. 希望获得官方的技术支持和问题修复

### 适合继续使用SDK模式的场景
1. 对性能要求极高，需要减少CLI进程开销
2. 部署环境无法安装额外依赖
3. 需要高度定制飞书API调用逻辑
4. 现有功能已经满足需求，不需要扩展新功能

## 回滚方案

如果切换到CLI模式后遇到问题，可以随时切回SDK模式：

```bash
# 全局切回SDK模式
smartflow feishu mode sdk

# 或者为特定团队切回SDK模式
# 编辑团队配置文件 ~/.smartflow/config/teams/<teamId>.yaml
# 设置 feishu.clientMode: sdk
```

## 常见问题

### Q: 切换到CLI模式需要修改业务代码吗？
A: 不需要！CLI模式完全兼容原有接口，所有业务逻辑无需修改，只需修改配置即可切换。

### Q: CLI模式会影响现有功能的稳定性吗？
A: CLI模式经过了完整的测试，所有原有功能都能正常运行。官方CLI的稳定性甚至高于我们自己封装的SDK。

### Q: 可以同时使用两种模式吗？
A: 可以！你可以为不同的团队配置不同的模式，也可以全局使用SDK模式，仅为特定团队开启CLI模式。

### Q: CLI模式的性能如何？
A: CLI模式会有轻微的性能开销（每次调用需要启动CLI进程），对于周报生成这种低频操作完全可以忽略。如果需要高频调用API，建议继续使用SDK模式。

### Q: 如何升级飞书CLI版本？
A: 飞书CLI会自动更新，也可以手动运行以下命令升级：
```bash
npx -y @larksuite/openclaw-lark update
```

## 新命令参考

```bash
# 飞书CLI管理命令组
smartflow feishu --help

# 设置全局客户端模式
smartflow feishu mode <sdk|cli>

# 查看飞书CLI状态
smartflow feishu status

# 为指定团队配置CLI
smartflow feishu setup <teamId> [--mode <robot|user>]

# 诊断飞书CLI配置
smartflow feishu doctor
```

## 技术支持

如果在升级过程中遇到问题，可以：
1. 运行 `smartflow feishu doctor` 自动诊断问题
2. 查看日志文件 `~/.smartflow/logs/`
3. 提交Issue到项目仓库