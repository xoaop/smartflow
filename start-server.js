const express = require('express');
const bodyParser = require('body-parser');
const { FeishuClientFactory } = require('./dist/common/feishu/client');
const { TeamConfigService } = require('./dist/modules/config/team-config.service');
const { FeishuCollectorService } = require('./dist/modules/collector/feishu-collector.service');
const { ReportGeneratorService } = require('./dist/modules/generator/report-generator.service');
const { FeishuPushService } = require('./dist/modules/push/feishu-push.service');
const { Logger } = require('./dist/common/logger/logger');

const logger = Logger.getInstance();
const app = express();
const port = 3000;

app.use(bodyParser.json());

// 飞书事件回调
app.post('/feishu/webhook', async (req, res) => {
  try {
    const { header, event } = req.body;

    // 处理URL校验
    if (header?.event_type === 'url_verification') {
      return res.json({ challenge: req.body.challenge });
    }

    // 处理消息接收事件
    if (header?.event_type === 'im.message.receive_v1') {
      const message = event.message;
      const sender = event.sender;

      // 只处理@机器人的消息
      if (message.mentions?.some(m => m.key === 'ou_79af4a63c45b66b22ab47d3f19c51430')) {
        const content = JSON.parse(message.content).text.replace(/@_user_1/g, '').trim();
        const chatId = message.chat_id;

        logger.info('收到@消息', { content, chatId, sender: sender.sender_id.open_id });

        // 初始化服务
        const configService = TeamConfigService.getInstance();
        const collectorService = new FeishuCollectorService();
        const generatorService = new ReportGeneratorService();

        try {
          // 加载默认团队配置
          const globalConfig = await configService.loadGlobalConfig();
          const teamId = globalConfig.defaultTeamId;

          if (!teamId) {
            // 没有配置团队，发送引导消息
            await sendFeishuMessage(chatId, '⚠️ 请先配置团队信息，发送「配置」开始设置向导。');
            return res.json({ code: 0 });
          }

          const teamConfig = await configService.getTeamConfig(teamId);
          const feishuClient = await FeishuClientFactory.getClient(teamConfig);

          // 处理不同的命令
          if (content.includes('生成') && content.includes('周报')) {
            await sendFeishuMessage(chatId, '⏳ 正在生成周报，请稍候...');

            // 解析时间范围
            let range = 'lastweek';
            if (content.includes('本周')) range = 'thisweek';
            if (content.includes('上月')) range = 'lastmonth';
            if (content.includes('本月')) range = 'thismonth';

            const timeRange = collectorService.parseTimeRange(range);

            // 采集数据
            const collectedData = await collectorService.collect(teamConfig, timeRange);

            // 生成周报
            const report = await generatorService.generate(collectedData, teamConfig);

            // 推送周报
            const pushService = new FeishuPushService(teamConfig);
            await pushService.pushWeeklyReport(report);

          } else if (content.includes('帮助') || content.includes('怎么用')) {
            await sendFeishuMessage(chatId, `🤖 SmartFlow周报助手使用说明：
- 生成上周周报：@我 生成上周周报
- 生成本周周报：@我 生成本周周报
- 查看帮助：@我 帮助
- 开始配置：@我 配置
- 功能演示：@我 演示
- 健康检查：@我 状态`);

          } else if (content.includes('配置') || content.includes('设置')) {
            await sendFeishuMessage(chatId, '⚙️ 配置功能正在开发中，请先手动修改配置文件。');

          } else if (content.includes('演示') || content.includes('demo')) {
            await sendFeishuMessage(chatId, '🎬 演示功能正在开发中...');

          } else if (content.includes('状态') || content.includes('健康检查')) {
            await sendFeishuMessage(chatId, '✅ SmartFlow服务运行正常！');

          } else {
            await sendFeishuMessage(chatId, '👋 你好！我是SmartFlow周报助手，发送「帮助」查看使用说明。');
          }

        } catch (error) {
          logger.error('处理消息失败', { error: error.message });
          await sendFeishuMessage(chatId, `❌ 处理失败：${error.message}`);
        }
      }
    }

    res.json({ code: 0 });
  } catch (error) {
    logger.error('Webhook处理失败', { error: error.message });
    res.json({ code: 1, msg: error.message });
  }
});

// 发送飞书消息
async function sendFeishuMessage(chatId, content) {
  try {
    // 使用飞书开放平台API发送消息
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
      logger.error('发送消息失败', { error: result.msg });
    }
  } catch (error) {
    logger.error('发送消息失败', { error: error.message });
  }
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

app.listen(port, () => {
  logger.info(`SmartFlow服务启动成功，监听端口 ${port}`);
  logger.info('请在飞书开放平台配置事件回调地址为：http://<你的服务器IP>:3000/feishu/webhook');
});
