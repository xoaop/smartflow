// 测试卡片发送功能
const { FeishuCardBuilder } = require('./dist/modules/push/card-builder');

// 构造一个模拟的周报数据
const mockReport = {
  teamId: 'dev',
  timeRange: {
    start: new Date('2026-04-26'),
    end: new Date('2026-05-02')
  },
  summary: '本周团队完成了核心功能开发，进展顺利。',
  workHighlights: [
    '完成了Webhook服务开发',
    '实现了卡片样式回复',
    '优化了数据采集性能'
  ],
  risks: [
    '部分数据源权限需要申请'
  ],
  nextWeekPlan: [
    '完成长连接模式适配',
    '优化卡片样式和交互',
    '添加更多数据源支持'
  ],
  statistics: {
    docs: 15,
    tasks: 23,
    meetings: 8,
    messages: 126
  }
};

// 生成周报卡片
const card = FeishuCardBuilder.buildWeeklyReportCard(mockReport, '研发团队');
console.log('生成的卡片结构：', JSON.stringify(card, null, 2));

// 测试发送卡片
async function testSendCard() {
  const token = await getToken();
  const chatId = 'oc_4c897c26ace4092fca3b6c75f03be51e';

  const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'interactive',
      content: JSON.stringify(card)
    })
  });

  const result = await response.json();
  console.log('发送结果：', result);
}

async function getToken() {
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      app_id: 'cli_a97eea6dd9b85bc2',
      app_secret: 'PDEc02CERlwwHuw29GZu7d4USyKwZ8iN'
    })
  });

  const result = await response.json();
  if (result.code === 0) {
    return result.tenant_access_token;
  }
  throw new Error(result.msg);
}

testSendCard().catch(console.error);
