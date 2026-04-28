---
name: smartflow-weekly
description: |
  SmartFlow 团队效能周报生成系统。
  整合飞书文档、任务、会议、群聊多源数据，通过大模型智能生成结构化周报，支持飞书卡片推送和定时自动发送。
  当用户说"生成周报"、"生成本周/上周/月报"时触发。
---

# SmartFlow 周报助手

## 完整生成流程

### 数据采集
- `feishu_calendar_event` — 采集日历事件
- `feishu_search_doc_wiki` — 搜索近期文档
- `feishu_fetch_doc` — 读取文档正文
- `feishu_im_user_get_messages` — 采集群聊消息（如有）

### 格式化（SmartFlow 模块）
```bash
node smartflow-format.js '<json>'
```
输入：{ docs, tasks, meetings, messages, teamName, startTime, endTime }
输出：格式化的 prompt 内容

### LLM 生成（使用 SmartFlow prompt 模板）
使用 `WEEKLY_REPORT_SYSTEM_PROMPT` + `buildWeeklyReportPrompt` 构建 prompt，
调用大模型生成结构化 JSON（overview / keyWork / projectProgress / pendingItems / riskWarnings / nextWeekPlan）

### 卡片构建（SmartFlow 模块）
```bash
node smartflow-card.js '<json>'
```
或直接调用 build-card.js（已预置报告数据）

### 推送
- `feishu_im_user_message` msg_type=interactive — 飞书卡片推送

---

## 定时任务

已注册 cron：`0 18 * * 5`（每周五 18:00 中国时间）
- jobId: `ec76aeb3-5988-46bd-b06d-5b2406491eb5`
- 下次触发：2026-05-01 18:00（周五）
- 触发后自动执行完整采集→生成→推送链路

---

## 时间范围参数

| range 值 | 日期范围 |
|---------|---------|
| `上周` / `lastweek` | 当前日期减 7 个自然日 |
| `本周` / `thisweek` | 当前自然周 |
| `YYYY-MM-DD~YYYY-MM-DD` | 自定义区间 |

---

## SmartFlow 模块路径

```
/home/gem/workspace/agent/workspace/skills/smartflow-weekly/
├── dist/modules/push/card-builder.js       # FeishuCardBuilder（已验证）
├── dist/modules/generator/prompt-templates.js  # 格式化函数
├── build-card.js                            # 卡片构建脚本（可直接运行）
├── run-weekly-report.js                     # 定时任务触发脚本
└── SKILL.md                                 # 本文件
```
