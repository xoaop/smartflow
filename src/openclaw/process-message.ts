// 独立的消息处理脚本，被OpenClaw钩子调用
import { TeamConfigService } from '../modules/config/team-config.service';
import { FeishuCollectorService } from '../modules/collector/feishu-collector.service';
import { ReportGeneratorService } from '../modules/generator/report-generator.service';
import { FeishuPushService } from '../modules/push/feishu-push.service';
import { FeishuCardBuilder } from '../modules/push/card-builder';
import { FeishuClientFactory } from '../common/feishu/client';
import { Logger } from '../common/logger/logger';

const logger = Logger.getInstance();
const configService = TeamConfigService.getInstance();
const collectorService = new FeishuCollectorService();
const generatorService = new ReportGeneratorService();

async function processMessage() {
  try {
    const messageData = JSON.parse(process.argv[2]);
    const { content, chatId } = messageData;

    // 验证必要参数
    if (!chatId) {
      logger.error('缺少chatId参数', { messageData });
      return;
    }

    logger.info('处理飞书消息', { content, chatId });

    // 业务逻辑处理，内层catch可以访问chatId
    try {
      // 加载飞书客户端
      const globalConfig = await configService.loadGlobalConfig();
      const teamId = globalConfig.defaultTeamId;

      if (!teamId) {
        await sendSimpleCard(chatId, '⚠️ 请先配置团队',
          '还没有配置团队信息，请先发送「配置」开始设置向导，或手动修改配置文件。',
          'red'
        );
        return;
      }

      const teamConfig = await configService.getTeamConfig(teamId);
      const feishuClient = await FeishuClientFactory.getClient(teamConfig);

      // 处理不同的命令
      if (content.match(/周报|生成|总结/)) {
        // 生成周报
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
        const report = await generatorService.generate(collectedData, teamConfig, {} as any);

        // 直接给当前群返回周报卡片
        const reportCard = FeishuCardBuilder.buildWeeklyReportCard(report, teamConfig.teamName);
        await sendCardReply(chatId, reportCard);

        // 同时推送到配置的渠道
        const pushService = new FeishuPushService(teamConfig);
        await pushService.pushWeeklyReport(report);
        return;

      } else if (content.match(/帮助|怎么用|使用说明/)) {
        // 帮助信息
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
        // 配置引导
        await sendSimpleCard(chatId, '⚙️ 配置引导',
          '配置功能正在开发中，请先手动修改 `config/config.yaml` 配置文件。',
          'grey'
        );

      } else if (content.match(/演示|demo|体验/)) {
        // 演示功能
        await sendSimpleCard(chatId, '🎬 功能演示',
          '演示功能正在开发中，敬请期待...',
          'grey'
        );

      } else if (content.match(/状态|健康检查|health/)) {
        // 健康检查
        await sendSimpleCard(chatId, '✅ 服务运行正常',
          'SmartFlow周报助手服务运行正常，可以正常生成周报！',
          'green'
        );

      } else {
        // 默认欢迎
        await sendSimpleCard(chatId, '👋 欢迎使用SmartFlow周报助手',
          '我是您的智能团队效能助手，可以帮您自动生成专业的团队周报。\n\n发送「帮助」查看完整使用说明。',
          'blue'
        );
      }

    } catch (innerError) {
      logger.error('处理消息失败', { error: (innerError as Error).message });
      await sendSimpleCard(chatId, '❌ 处理失败',
        (innerError as Error).message,
        'red'
      );
    }

  } catch (error) {
    logger.error('消息解析失败', { error: (error as Error).message });
  }
}

// 发送文本消息
async function sendTextReply(chatId: string, content: string) {
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

    const result = await response.json() as any;
    if (result.code !== 0) {
      logger.error('发送文本消息失败', { error: result.msg });
    }
  } catch (error) {
    logger.error('发送文本消息失败', { error: (error as Error).message });
  }
}

// 发送卡片消息
async function sendCardReply(chatId: string, card: any) {
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

    const result = await response.json() as any;
    if (result.code !== 0) {
      logger.error('发送卡片消息失败', { error: result.msg });
    }
  } catch (error) {
    logger.error('发送卡片消息失败', { error: (error as Error).message });
  }
}

// 发送简单文本卡片
async function sendSimpleCard(chatId: string, title: string, content: string, theme: 'blue' | 'green' | 'red' | 'grey' = 'blue') {
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

  await sendCardReply(chatId, card);
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

    const result = await response.json() as any;
    if (result.code === 0) {
      return result.tenant_access_token;
    }
    throw new Error(result.msg);
  } catch (error) {
    logger.error('获取访问令牌失败', { error: (error as Error).message });
    throw error;
  }
}

// 执行处理
processMessage().catch(console.error);
