const express = require('express');
const bodyParser = require('body-parser');
const { TeamConfigService } = require('./dist/modules/config/team-config.service');
const { FeishuCollectorService } = require('./dist/modules/collector/feishu-collector.service');
const { ReportGeneratorService } = require('./dist/modules/generator/report-generator.service');
const { FeishuPushService } = require('./dist/modules/push/feishu-push.service');
const { FeishuCardBuilder } = require('./dist/modules/push/card-builder');
const { Logger } = require('./dist/common/logger/logger');

const logger = Logger.getInstance();
const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 调试中间件：记录所有请求信息
app.use((req, res, next) => {
  console.log(`收到请求: ${req.method} ${req.path}`);
  console.log(`Content-Type: ${req.headers['content-type']}`);
  console.log(`请求体:`, req.body);
  next();
});

// 飞书事件回调
app.post('/feishu/webhook', async (req, res) => {
  try {
    // 检查请求体是否存在
    if (!req.body) {
      logger.error('请求体为空', {
        contentType: req.headers['content-type'],
        body: req.body
      });
      return res.json({ code: 1, msg: '请求体为空' });
    }

    const { header, event } = req.body;

    // 处理URL校验（兼容两种格式）
    if (req.body.type === 'url_verification' || header?.event_type === 'url_verification') {
      return res.json({ challenge: req.body.challenge });
    }

    // 处理消息接收事件
    if (header?.event_type === 'im.message.receive_v1') {
      const message = event.message;
      const sender = event.sender;

      // 只处理@机器人的消息
      const isMentioned = message.mentions?.some(m => m.id === 'ou_79af4a63c45b66b22ab47d3f19c51430') ||
                        JSON.parse(message.content).text.includes('@_user_1');

      if (!isMentioned) {
        return res.json({ code: 0 });
      }

      const content = JSON.parse(message.content).text.replace(/@_user_1/g, '').trim();
      const chatId = message.chat_id;

      logger.info('收到@消息', { content, chatId, sender: sender.sender_id.open_id });

      // 异步处理消息，不阻塞回调
      handleMessage(content, chatId).catch(err => {
        logger.error('处理消息失败', { error: err.message });
      });
    }

    res.json({ code: 0 });
  } catch (error) {
    logger.error('Webhook处理失败', { error: error.message });
    res.json({ code: 1, msg: error.message });
  }
});

// 处理消息
async function handleMessage(content, chatId) {
  try {
    const configService = TeamConfigService.getInstance();
    const collectorService = new FeishuCollectorService();
    const generatorService = new ReportGeneratorService();

    // 加载默认团队配置
    const globalConfig = await configService.loadGlobalConfig();
    const teamId = globalConfig.defaultTeamId;

    if (!teamId) {
      // 没有配置团队，发送引导消息
      await sendSimpleCard(chatId, '⚠️ 请先配置团队',
        '还没有配置团队信息，请先发送「配置」开始设置向导，或手动修改配置文件。',
        'red'
      );
      return;
    }

    const teamConfig = await configService.getTeamConfig(teamId);

    // 处理不同的命令
    if (content.match(/周报|生成|总结/)) {
      await sendSimpleCard(chatId, '⏳ 正在生成周报',
        '正在为您收集数据并生成周报，请稍候...',
        'blue'
      );

      // 解析时间范围
      let range = 'lastweek';
      if (content.includes('本周')) range = 'thisweek';
      if (content.includes('上月')) range = 'lastmonth';
      if (content.includes('本月')) range = 'thismonth';

      const timeRange = collectorService.parseTimeRange(range);

      // 采集数据
      const collectedData = await collectorService.collect(teamConfig, timeRange);

      // 发送采集结果
      await sendSimpleCard(chatId, '📊 数据采集完成',
        `**文档：** ${collectedData.docs.length} 篇\n**任务：** ${collectedData.tasks.length} 个\n**会议：** ${collectedData.meetings.length} 个\n**群聊消息：** ${collectedData.messages?.length || 0} 条\n\n正在调用AI生成周报内容...`,
        'green'
      );

      // 生成周报
      const report = await generatorService.generate(collectedData, teamConfig, {});

      // 直接给当前群返回周报卡片
      const reportCard = FeishuCardBuilder.buildWeeklyReportCard(report, teamConfig.teamName);
      await sendFeishuCard(chatId, reportCard);

      // 同时推送到配置的渠道
      const pushService = new FeishuPushService(teamConfig);
      await pushService.pushWeeklyReport(report);

    } else if (content.match(/帮助|怎么用|使用说明/)) {
      await sendSimpleCard(chatId, '🤖 使用说明',
        `## 常用命令
- **生成上周周报**：@我 生成上周周报
- **生成本周周报**：@我 生成本周周报
- **生成上月月报**：@我 生成上月月报
- **查看帮助**：@我 帮助
- **开始配置**：@我 配置
- **功能演示**：@我 演示
- **健康检查**：@我 状态

不需要严格按照命令格式，自然语言即可。`,
        'blue'
      );

    } else if (content.match(/配置|设置/)) {
      await sendSimpleCard(chatId, '⚙️ 配置引导',
        '配置功能正在开发中，请先手动修改 `config/config.yaml` 配置文件。',
        'grey'
      );

    } else if (content.match(/演示|demo|体验/)) {
      await sendSimpleCard(chatId, '🎬 功能演示',
        '演示功能正在开发中，敬请期待...',
        'grey'
      );

    } else if (content.match(/状态|健康检查|health/)) {
      await sendSimpleCard(chatId, '✅ 服务运行正常',
        'SmartFlow周报助手服务运行正常，可以正常生成周报！',
        'green'
      );

    } else {
      await sendSimpleCard(chatId, '👋 欢迎使用SmartFlow周报助手',
        '我是您的智能团队效能助手，可以帮您自动生成专业的团队周报。\n\n发送「帮助」查看完整使用说明。',
        'blue'
      );
    }

  } catch (error) {
    logger.error('处理消息失败', { error: error.message });
    await sendSimpleCard(chatId, '❌ 处理失败',
      error.message,
      'red'
    );
  }
}

// 发送飞书文本消息
async function sendFeishuText(chatId, content) {
  try {
    const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await getFeishuAccessToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: content })
      })
    });

    const result = await response.json();
    if (result.code !== 0) {
      logger.error('发送文本消息失败', { error: result.msg });
    }
  } catch (error) {
    logger.error('发送文本消息失败', { error: error.message });
  }
}

// 发送飞书卡片消息
async function sendFeishuCard(chatId, card) {
  try {
    const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await getFeishuAccessToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify(card)
      })
    });

    const result = await response.json();
    if (result.code !== 0) {
      logger.error('发送卡片消息失败', { error: result.msg });
    }
  } catch (error) {
    logger.error('发送卡片消息失败', { error: error.message });
  }
}

// 发送简单卡片
async function sendSimpleCard(chatId, title, content, theme = 'blue') {
  const templateColor = {
    blue: 'blue',
    green: 'green',
    red: 'red',
    grey: 'grey'
  }[theme];

  const card = {
    config: {
      wide_screen_mode: true
    },
    header: {
      title: {
        tag: 'plain_text',
        content: title
      },
      template: templateColor
    },
    elements: [
      {
        tag: 'markdown',
        content: content
      }
    ]
  };

  await sendFeishuCard(chatId, card);
}

// 获取飞书访问令牌
async function getFeishuAccessToken() {
  try {
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
  } catch (error) {
    logger.error('获取访问令牌失败', { error: error.message });
    throw error;
  }
}

// 启动服务，明确监听IPv4地址
app.listen(port, '0.0.0.0', () => {
  logger.info(`🚀 SmartFlow服务启动成功，监听端口 ${port} (所有IPv4地址)`);
  logger.info('📝 请在飞书开放平台配置事件回调地址为：http://111.228.21.107:3000/feishu/webhook');
  logger.info('🔧 确保服务器安全组开放了3000端口的入站访问');
});
