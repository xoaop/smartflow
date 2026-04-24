/**
 * 周报生成系统提示词
 */
export const WEEKLY_REPORT_SYSTEM_PROMPT = `你是一个专业的团队效能分析师，擅长从海量数据中提炼高价值信息，生成专业、准确、有洞察力的团队周报。

## 核心原则
1. **真实性**：所有内容必须基于提供的原始数据，禁止编造、虚构信息。如果某个板块没有相关数据，请明确说明"本周暂无相关数据"。
2. **准确性**：客观呈现事实，不添加主观评价，不夸大或缩小成果。
3. **简洁性**：重点突出，避免冗余信息，每句话都要有价值。
4. **结构化**：严格按照要求的格式和板块生成内容。
5. **溯源性**：每个要点后面必须标注来源链接，格式为 [来源](url)，可以是文档链接、任务链接或会议链接。

## 风险识别规则
请重点识别以下风险点，并标注风险等级：
- **高风险**：任务延期超过3天、重要会议决议超过7天未跟进、核心项目无进展超过2周
- **中风险**：任务延期1-3天、会议决议3-7天未跟进、项目进展明显慢于预期
- **低风险**：任务可能延期、文档长期未更新、待办事项无明确负责人

## 输出要求
请严格按照以下JSON格式输出，不要返回任何其他内容：
\`\`\`json
{
  "overview": "本周工作整体概述，1-2句话概括",
  "keyWork": [
    {
      "title": "工作项标题",
      "description": "详细描述，2-3句话",
      "sourceUrl": "来源链接",
      "author": "负责人/修改人姓名"
    }
  ],
  "projectProgress": [
    {
      "projectName": "项目名称",
      "progress": "进展描述，说明完成度、遇到的问题等",
      "tasks": [
        // 关联的任务列表，可以复用原始任务数据结构
      ]
    }
  ],
  "pendingItems": [
    {
      "content": "待办事项内容",
      "assignee": "负责人姓名",
      "deadline": "截止时间，ISO格式字符串，没有则为null",
      "sourceUrl": "来源链接"
    }
  ],
  "riskWarnings": [
    {
      "level": "low/medium/high",
      "content": "风险描述",
      "sourceUrl": "来源链接"
    }
  ],
  "nextWeekPlan": [
    {
      "content": "下周计划内容",
      "responsible": "负责人姓名"
    }
  ]
}
\`\`\`
`;

/**
 * 周报生成用户提示词模板
 * @param params 模板参数
 */
export function buildWeeklyReportPrompt(params: {
  teamName: string;
  startTime: string;
  endTime: string;
  docs: string;
  tasks: string;
  meetings: string;
  includeRisks: boolean;
  includeNextWeekPlan: boolean;
  detailLevel: 'low' | 'medium' | 'high';
}): string {
  const detailDesc = {
    low: '内容简洁，重点突出，每个板块只列最重要的3-5项',
    medium: '内容适中，涵盖主要工作，每个板块列5-10项',
    high: '内容详细，包含所有重要信息，不限制项数'
  };

  return `请基于以下飞书数据，为【${params.teamName}】生成${params.startTime}至${params.endTime}的周报。

【内容要求】：
- 详细程度：${detailDesc[params.detailLevel]}
- 是否包含风险预警：${params.includeRisks ? '是，请详细识别所有潜在风险' : '否'}
- 是否包含下周计划：${params.includeNextWeekPlan ? '是，基于本周工作推导合理的下周计划' : '否'}

【原始数据】：

=== 文档变更（本周修改的文档） ===
${params.docs || '本周无文档变更'}

=== 任务动态（本周状态变化的任务） ===
${params.tasks || '本周无任务动态'}

=== 会议纪要（本周的会议和Action Items） ===
${params.meetings || '本周无会议记录'}

请按照系统提示的JSON格式生成周报内容，确保所有内容都有来源链接支撑。
`;
}

/**
 * 格式化文档数据为提示词内容
 */
export function formatDocsForPrompt(docs: Array<{
  title: string;
  url: string;
  modifiedTime: string;
  modifier: { name: string };
  contentSummary: string;
}>): string {
  if (docs.length === 0) return '';
  return docs.map(doc => `
- 标题：${doc.title}
  修改人：${doc.modifier.name}
  修改时间：${doc.modifiedTime}
  内容摘要：${doc.contentSummary}
  链接：${doc.url}
`).join('\n');
}

/**
 * 格式化任务数据为提示词内容
 */
export function formatTasksForPrompt(tasks: Array<{
  title: string;
  url: string;
  status: string;
  statusChangedTime: string;
  assignee: { name: string };
  projectName: string;
  description: string;
}>): string {
  if (tasks.length === 0) return '';
  return tasks.map(task => `
- 任务标题：${task.title}
  所属项目：${task.projectName}
  当前状态：${task.status}
  状态变更时间：${task.statusChangedTime}
  负责人：${task.assignee.name}
  描述：${task.description}
  链接：${task.url}
`).join('\n');
}

/**
 * 格式化会议数据为提示词内容
 */
export function formatMeetingsForPrompt(meetings: Array<{
  title: string;
  url: string;
  startTime: string;
  organizer: { name: string };
  minutesContent: string;
  actionItems: Array<{ content: string; assignee?: string }>;
}>): string {
  if (meetings.length === 0) return '';
  return meetings.map(meeting => `
- 会议主题：${meeting.title}
  组织者：${meeting.organizer.name}
  会议时间：${meeting.startTime}
  纪要摘要：${meeting.minutesContent}
  Action Items：
    ${meeting.actionItems.map(item => `- ${item.content} ${item.assignee ? `(负责人：${item.assignee})` : ''}`).join('\n    ')}
  链接：${meeting.url}
`).join('\n');
}
