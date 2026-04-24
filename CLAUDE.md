# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
SmartFlow 是基于飞书生态的团队效能周报自动生成系统，整合飞书文档、任务、会议多源数据，通过 Claude 大模型自动生成高信息密度的团队工作总结与风险洞察，支持定时推送到飞书群。原生支持多团队独立配置和数据隔离。

## Common Commands
### Development
```bash
# 安装依赖
npm install

# 开发模式（监听TypeScript文件变化自动编译）
npm run dev

# 生产构建
npm run build

# 全局链接（方便本地测试CLI命令）
npm link
```

### CLI Usage
```bash
# 查看帮助
smartflow --help

# 健康检查
smartflow health

# 配置管理
smartflow config list
smartflow config create <teamId> <teamName>

# 手动生成周报
smartflow generate run --team <teamId> --range lastweek

# 测试飞书推送
smartflow push test <teamId>

# 定时任务管理
smartflow schedule start
smartflow schedule list
```

### Testing
```bash
# 运行所有单元测试
npm test

# 运行指定模块测试
npm test -- src/modules/config/__tests__/

# 生成覆盖率报告
npm test -- --coverage
```

## High-Level Architecture
项目采用分层架构设计，各模块高度解耦：

```
┌─────────────────────────────────────────────────────┐
│  CLI Command Layer (src/cli/)                       │
│  命令行入口，定义所有用户交互命令                    │
├─────────────────────────────────────────────────────┤
│  Business Module Layer (src/modules/)               │
│  ┌──────────┬──────────┬──────────┬──────────┐      │
│  │  配置管理 │  数据采集 │  内容生成 │  推送分发 │      │
│  └──────────┴──────────┴──────────┴──────────┘      │
│  核心业务逻辑实现，各模块基于接口设计便于扩展       │
├─────────────────────────────────────────────────────┤
│  Common Service Layer (src/common/)                 │
│  ┌──────────┬──────────┬──────────┬──────────┐      │
│  │  飞书API  │  LLM调用  │  数据库  │  日志服务 │      │
│  └──────────┴──────────┴──────────┴──────────┘      │
│  通用基础服务封装，提供跨模块复用能力               │
└─────────────────────────────────────────────────────┘
```

### Key Design Characteristics
1. **多租户原生支持**：所有数据和配置按团队ID隔离，一套系统可同时服务多团队
2. **容错设计**：单个数据源/模块失败不影响整体流程，API调用自动指数退避重试
3. **幻觉校验机制**：生成内容所有信息必须能在原始数据中找到来源，降低大模型幻觉风险
4. **全自动化流程**：从数据采集、内容生成到推送分发全流程无需人工干预
5. **配置驱动**：所有业务逻辑通过YAML配置控制，无需修改代码即可适配不同场景

### Cross-Cutting Concerns
- 所有飞书API调用通过`FeishuClient`统一封装，自动处理token刷新和重试
- 大模型调用通过`ClaudeClient`统一封装，支持结构化JSON输出和token统计
- 配置统一通过`TeamConfigService`管理，内置Zod校验和内存缓存机制
- 定时任务基于`node-schedule`实现，支持任务持久化和服务重启自动恢复