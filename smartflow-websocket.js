const lark = require('@larksuiteoapi/node-sdk');
const { TeamConfigService } = require('./dist/modules/config/team-config.service');
const { FeishuCollectorService } = require('./dist/modules/collector/feishu-collector.service');
const { ReportGeneratorService } = require('./dist/modules/generator/report-generator.service');
const { FeishuPushService } = require('./dist/modules/push/feishu-push.service');
const { Logger } = require('./dist/common/logger/logger');

const logger = Logger.getInstance();
const configService = TeamConfigService.getInstance();
const collectorService = new FeishuCollectorService();
const generatorService = new ReportGeneratorService();

// 飞书应用配置
const APP_ID = 'cli_a97eea6dd9b85bc2';
const APP_SECRET = 'PDEc02CERlwwHuw29GZu7d4USyKwZ8iN';
const BOT_OPEN_ID = 'ou_79af4a63c45b66b22ab47d3f19c51430';

// 初始化飞书客户端
const client = new lark.Client({
  appId: APP_ID,
  appSecret: APP_SECRET,
  appType: lark.AppType.SelfBuilt,
  // 开启长连接模式
  useEventCenter: true,
  logLevel: 'warn'
});

// 发送飞书消息
async function sendFeishuMessage(chatId, content) {
  try {
    const response = await client.im.message.create({
      params: {
        receive_id_type: 'chat_id'
      },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: content })
      }
    });

    if (response.code !== 0) {
      logger.error('发送消息失败', { error: response.msg });
    }
  } catch (error) {
    logger.error('发送消息失败', { error: error.message });
  }
}

// 处理消息
async function handleMessage(content, chatId) {
  try {
    // 加载默认团队配置
    const globalConfig = await configService.loadGlobalConfig();
    const teamId = globalConfig.defaultTeamId;

    if (!teamId) {
      // 没有配置团队，发送引导消息
      await sendFeishuMessage(chatId, '⚠️ 请先配置团队信息，发送「配置」开始设置向导。');
      return;
    }

    const teamConfig = await configService.getTeamConfig(teamId);

    // 处理不同的命令
    if (content.match(/周报|生成|总结/)) {
      await sendFeishuMessage(chatId, '⏳ 正在生成周报，请稍候...');

      // 解析时间范围
      let range = 'lastweek';
      if (content.includes('本周')) range = 'thisweek';
      if (content.includes('上月')) range = 'lastmonth';
      if (content.includes('本月')) range = 'thismonth';

      const timeRange = collectorService.parseTimeRange(range);

      // 采集数据
      const collectedData = await collectorService.collect(teamConfig, timeRange);

      // 发送采集结果
      await sendFeishuMessage(chatId, `📊 数据采集完成：
文档：${collectedData.docs.length} 篇
任务：${collectedData.tasks.length} 个
会议：${collectedData.meetings.length} 个
群聊消息：${collectedData.messages?.length || 0} 条
正在调用AI生成周报内容...`);

      // 生成周报
      const report = await generatorService.generate(collectedData, teamConfig, {});

      // 推送周报
      const pushService = new FeishuPushService(teamConfig);
      await pushService.pushWeeklyReport(report);

    } else if (content.match(/帮助|怎么用|使用说明/)) {
      await sendFeishuMessage(chatId, `🤖 SmartFlow周报助手使用说明：
- 生成上周周报：@我 生成上周周报
- 生成本周周报：@我 生成本周周报
- 查看帮助：@我 帮助
- 开始配置：@我 配置
- 功能演示：@我 演示
- 健康检查：@我 状态`);

    } else if (content.match(/配置|设置/)) {
      await sendFeishuMessage(chatId, '⚙️ 配置功能正在开发中，请先手动修改配置文件。');

    } else if (content.match(/演示|demo|体验/)) {
      await sendFeishuMessage(chatId, '🎬 演示功能正在开发中...');

    } else if (content.match(/状态|健康检查|health/)) {
      await sendFeishuMessage(chatId, '✅ SmartFlow服务运行正常！');

    } else {
      await sendFeishuMessage(chatId, '👋 你好！我是SmartFlow周报助手，发送「帮助」查看使用说明。');
    }

  } catch (error) {
    logger.error('处理消息失败', { error: error.message });
    await sendFeishuMessage(chatId, `❌ 处理失败：${error.message}`);
  }
}

// 监听消息接收事件
client.on('im.message.receive_v1', (data) => {
  try {
    const message = data.payload.message;
    const sender = data.payload.sender;

    // 只处理@机器人的消息
    const isMentioned = message.mentions?.some(m => m.id === BOT_OPEN_ID) ||
                      JSON.parse(message.content).text.includes('@_user_1');

    if (!isMentioned) {
      return;
    }

    const content = JSON.parse(message.content).text.replace(/@_user_1/g, '').trim();
    const chatId = message.chat_id;

    logger.info('收到@消息', { content, chatId, sender: sender.sender_id.open_id });

    // 异步处理消息
    handleMessage(content, chatId).catch(err => {
      logger.error('处理消息失败', { error: err.message });
    });

  } catch (error) {
    logger.error('事件处理失败', { error: error.message });
  }
});

// 启动长连接
client.start().then(() => {
  logger.info('🚀 SmartFlow长连接服务启动成功！');
  logger.info('🔌 已成功连接飞书服务器，可以正常接收消息了');
  logger.info('💡 现在直接去飞书群@机器人就可以使用所有功能了');
}).catch(err => {
  logger.error('长连接启动失败', { error: err.message });
  process.exit(1);
});

// 优雅退出
process.on('SIGINT', async () => {
  logger.info('收到退出信号，正在关闭服务...');
  await client.close();
  process.exit(0);
});

