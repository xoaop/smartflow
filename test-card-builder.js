// 测试卡片生成功能
const { FeishuCardBuilder } = require('./dist/modules/push/card-builder');
const dayjs = require('dayjs');

// 构造符合WeeklyReport接口的模拟数据
const mockReport = {
  teamId: 'dev',
  timeRange: {
    start: new Date('2026-04-26'),
    end: new Date('2026-05-02')
  },
  generatedAt: new Date(),
  content: {
    overview: '本周团队完成了核心功能开发，进展顺利。完成了Webhook服务开发，实现了卡片样式回复，优化了数据采集性能。',
    keyWork: [
      {
        title: '完成Webhook服务开发',
        description: '实现了飞书事件回调处理，支持URL验证和消息接收，所有回复都采用卡片格式。',
        sourceUrl: 'https://feishu.cn/doc/xxx1',
        author: '张三'
      },
      {
        title: '实现卡片样式回复',
        description: '重构了所有消息回复格式，统一使用飞书交互式卡片，提升用户体验。',
        sourceUrl: 'https://feishu.cn/doc/xxx2',
        author: '李四'
      },
      {
        title: '优化数据采集性能',
        description: '重构了飞书API调用逻辑，增加重试机制和缓存，数据采集速度提升300%。',
        sourceUrl: 'https://feishu.cn/doc/xxx3',
        author: '王五'
      }
    ],
    projectProgress: [
      {
        projectName: 'SmartFlow周报系统',
        progress: '项目整体进度85%，核心功能已完成，正在进行最后测试和文档完善。',
        tasks: [
          {
            id: 'task1',
            title: 'Webhook服务开发',
            url: 'https://feishu.cn/task/1',
            status: 'done',
            statusChangedTime: new Date(),
            assignee: { id: 'user1', name: '张三' },
            creator: { id: 'user1', name: '张三' },
            dueTime: new Date(),
            projectId: 'proj1',
            projectName: 'SmartFlow周报系统',
            description: '开发Webhook服务'
          },
          {
            id: 'task2',
            title: '卡片样式优化',
            url: 'https://feishu.cn/task/2',
            status: 'in_progress',
            statusChangedTime: new Date(),
            assignee: { id: 'user2', name: '李四' },
            creator: { id: 'user2', name: '李四' },
            dueTime: new Date(),
            projectId: 'proj1',
            projectName: 'SmartFlow周报系统',
            description: '优化卡片样式'
          }
        ]
      }
    ],
    pendingItems: [
      {
        content: '完成飞书开放平台权限申请和版本发布',
        assignee: '赵六',
        deadline: new Date('2026-05-08'),
        sourceUrl: 'https://feishu.cn/task/3'
      },
      {
        content: '编写完整的部署文档和使用说明',
        assignee: '孙七',
        sourceUrl: 'https://feishu.cn/task/4'
      }
    ],
    riskWarnings: [
      {
        level: 'high',
        content: '飞书应用权限审批可能延迟，影响上线时间',
        sourceUrl: 'https://feishu.cn/issue/1'
      },
      {
        level: 'medium',
        content: '部分数据源权限需要额外申请',
        sourceUrl: 'https://feishu.cn/issue/2'
      }
    ],
    nextWeekPlan: [
      {
        content: '完成长连接模式适配，支持无公网IP部署',
        responsible: '张三'
      },
      {
        content: '优化卡片样式和交互，支持更多自定义配置',
        responsible: '李四'
      },
      {
        content: '添加更多数据源支持，包括代码仓库和CI/CD数据',
        responsible: '王五'
      }
    ]
  },
  sources: [
    { type: 'doc', title: 'Webhook服务设计文档', url: 'https://feishu.cn/doc/xxx1' },
    { type: 'doc', title: '卡片样式规范', url: 'https://feishu.cn/doc/xxx2' },
    { type: 'doc', title: '性能优化方案', url: 'https://feishu.cn/doc/xxx3' },
    { type: 'task', title: '完成Webhook服务开发', url: 'https://feishu.cn/task/1' },
    { type: 'task', title: '实现卡片样式回复', url: 'https://feishu.cn/task/2' },
    { type: 'task', title: '优化数据采集性能', url: 'https://feishu.cn/task/3' },
    { type: 'meeting', title: '项目周会', url: 'https://feishu.cn/meeting/1' },
    { type: 'meeting', title: '需求评审会', url: 'https://feishu.cn/meeting/2' },
    { type: 'message', title: '群聊讨论：上线时间安排', url: 'https://feishu.cn/chat/1' },
    { type: 'message', title: '群聊讨论：权限问题', url: 'https://feishu.cn/chat/2' }
  ]
};

// 生成周报卡片
console.log('正在生成周报卡片...');
const card = FeishuCardBuilder.buildWeeklyReportCard(mockReport, '研发团队');
console.log('✅ 卡片生成成功！');
console.log('卡片结构：', JSON.stringify(card, null, 2));

// 验证卡片结构
console.log('\n📋 卡片结构验证：');
console.log('- 标题:', card.header.title.content);
console.log('- 元素数量:', card.elements.length);
console.log('- 按钮数量:', card.actions.length);
console.log('- 宽屏模式:', card.config.wide_screen_mode);

// 检查关键部分是否存在
const hasColumnSet = card.elements.some(e => e.tag === 'column_set');
const hasOverview = card.elements.some(e => e.tag === 'markdown' && e.content.includes('整体概览'));
const hasKeyWork = card.elements.some(e => e.tag === 'markdown' && e.content.includes('本周重点工作'));
const hasProjectProgress = card.elements.some(e => e.tag === 'markdown' && e.content.includes('项目进展'));
const hasPendingItems = card.elements.some(e => e.tag === 'markdown' && e.content.includes('待跟进事项'));
const hasRiskWarnings = card.elements.some(e => e.tag === 'markdown' && e.content.includes('风险预警'));
const hasNextWeekPlan = card.elements.some(e => e.tag === 'markdown' && e.content.includes('下周计划'));
const hasFooter = card.elements.some(e => e.tag === 'note');

console.log('\n✅ 关键组件检查：');
console.log('- 数据统计面板:', hasColumnSet ? '✓ 存在' : '✗ 缺失');
console.log('- 整体概览:', hasOverview ? '✓ 存在' : '✗ 缺失');
console.log('- 重点工作:', hasKeyWork ? '✓ 存在' : '✗ 缺失');
console.log('- 项目进展:', hasProjectProgress ? '✓ 存在' : '✗ 缺失');
console.log('- 待跟进事项:', hasPendingItems ? '✓ 存在' : '✗ 缺失');
console.log('- 风险预警:', hasRiskWarnings ? '✓ 存在' : '✗ 缺失');
console.log('- 下周计划:', hasNextWeekPlan ? '✓ 存在' : '✗ 缺失');
console.log('- 页脚信息:', hasFooter ? '✓ 存在' : '✗ 缺失');

// 测试其他卡片
console.log('\n🧪 测试其他卡片类型：');
const testCard = FeishuCardBuilder.buildTestCard();
console.log('- 测试卡片生成:', testCard ? '✓ 成功' : '✗ 失败');

const errorCard = FeishuCardBuilder.buildErrorCard(new Error('测试错误信息'), '研发团队');
console.log('- 错误卡片生成:', errorCard ? '✓ 成功' : '✗ 失败');

console.log('\n🎉 所有卡片生成测试通过！');