// 通过API获取所有日历列表
const { TeamConfigService } = require('./dist/modules/config/team-config.service');
const { FeishuClientFactory } = require('./dist/common/feishu/client');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function checkFeishuCLI() {
  try {
    await execAsync('feishu --version');
    return true;
  } catch (error) {
    return false;
  }
}

async function getCalendarList() {
  console.log('📅 获取日历列表...\n');

  // 检查飞书CLI是否安装
  const cliExists = await checkFeishuCLI();
  if (!cliExists) {
    console.log('❌ 飞书CLI未安装，请先安装飞书CLI并配置profile');
    console.log('安装指南：https://open.feishu.cn/documentation/home/developer-tools/cli');
    return;
  }

  try {
    // 加载配置
    const configService = TeamConfigService.getInstance();
    await configService.loadGlobalConfig();
    const teamConfig = await configService.getTeamConfig('dev');

    // 创建飞书客户端
    const feishuClient = await FeishuClientFactory.getClient(teamConfig);

    // 调用封装好的方法获取日历列表
    const calendars = await feishuClient.scanCalendars();

    if (calendars.length > 0) {
      console.log('✅ 成功获取到以下日历：\n');
      console.log('| 日历ID | 日历名称 |');
      console.log('|--------|----------|');

      calendars.forEach(cal => {
        const id = cal.id.split('@')[0]; // 只取@前面的部分
        console.log(`| ${id} | ${cal.name} |`);
      });

      console.log('\n💡 请将需要采集的日历ID复制到配置文件的 calendarIds 字段中');
      console.log('示例配置：');
      console.log('calendarIds: ["' + calendars[0].id.split('@')[0] + '"]');

    } else {
      console.log('❌ 未获取到任何日历');
      console.log('请检查：');
      console.log('1. 飞书应用是否已申请 calendar:calendar:readonly 权限');
      console.log('2. 应用版本是否已发布并更新权限');
      console.log('3. 机器人是否有权限访问日历');
      console.log('4. 飞书CLI profile是否正确配置');
    }

  } catch (error) {
    console.error('❌ 获取日历列表失败:', error.message);

    if (error.message.includes('profile')) {
      console.log('\n💡 飞书CLI profile未找到，请先配置profile：');
      console.log('feishu config add --profile default --app-id <your-app-id> --app-secret <your-app-secret>');
    } else if (error.message.includes('99991663') || error.message.includes('权限不足')) {
      console.log('\n💡 权限不足，请先在飞书开放平台申请 calendar:calendar:readonly 权限');
    }
  }
}

getCalendarList().catch(console.error);
