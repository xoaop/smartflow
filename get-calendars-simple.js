// 直接调用飞书CLI获取日历列表
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function getCalendarList() {
  console.log('📅 获取日历列表...\n');

  try {
    // 直接调用飞书CLI，使用正确的profile名称
    const { stdout, stderr } = await execAsync(
      'feishu api get /open-apis/calendar/v4/calendars --profile cli_a97eea6dd9b85bc2'
    );

    if (stderr) {
      throw new Error(stderr);
    }

    const response = JSON.parse(stdout);

    if (response.code !== 0) {
      throw new Error(`API错误: ${response.msg} (错误码: ${response.code})`);
    }

    const calendars = response.data?.calendars || [];

    if (calendars.length > 0) {
      console.log('✅ 成功获取到以下日历：\n');
      console.log('| 日历ID | 日历名称 | 描述 |');
      console.log('|--------|----------|------|');

      calendars.forEach(cal => {
        const id = cal.calendar_id.split('@')[0]; // 只取@前面的部分
        console.log(`| ${id} | ${cal.summary} | ${cal.description || '无'} |`);
      });

      console.log('\n💡 请将需要采集的日历ID复制到配置文件的 calendarIds 字段中');
      console.log('示例配置：');
      console.log('calendarIds: ["' + calendars[0].calendar_id.split('@')[0] + '"]');

    } else {
      console.log('❌ 未获取到任何日历');
      console.log('请检查：');
      console.log('1. 飞书应用是否已申请 calendar:calendar:readonly 权限');
      console.log('2. 应用版本是否已发布并更新权限');
      console.log('3. 机器人是否有权限访问日历');
    }

  } catch (error) {
    console.error('❌ 获取日历列表失败:', error.message);

    if (error.message.includes('99991663') || error.message.includes('PermissionDenied')) {
      console.log('\n💡 权限不足，请先在飞书开放平台申请 calendar:calendar:readonly 权限');
    }
  }
}

getCalendarList().catch(console.error);
