// 获取飞书任务清单列表
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function getTaskLists() {
  console.log('📋 获取飞书任务清单列表...\n');

  try {
    // 调用飞书任务API获取任务清单
    const { stdout, stderr } = await execAsync(
      'feishu api get /open-apis/task/v2/tasklists?page_size=50 --profile cli_a97eea6dd9b85bc2'
    );

    if (stderr) {
      throw new Error(stderr);
    }

    const response = JSON.parse(stdout);

    if (response.code !== 0) {
      throw new Error(`API错误: ${response.msg} (错误码: ${response.code})`);
    }

    const tasklists = response.data?.items || [];

    if (tasklists.length > 0) {
      console.log('✅ 成功获取到以下任务清单：\n');
      console.log('| 任务清单ID | 清单名称 | 任务数量 |');
      console.log('|-----------|----------|----------|');

      for (const list of tasklists) {
        // 获取每个清单的任务数量
        try {
          const countResult = await execAsync(
            `feishu api get /open-apis/task/v1/tasklists/${list.guid}/tasks?page_size=1 --profile cli_a97eea6dd9b85bc2`
          );
          const countData = JSON.parse(countResult.stdout);
          const total = countData.data?.total || 0;
          console.log(`| ${list.guid} | ${list.name} | ${total} |`);
        } catch (e) {
          console.log(`| ${list.guid} | ${list.name} | 未知 |`);
        }
      }

      console.log('\n💡 请将需要采集的任务清单ID复制到配置文件的 taskListIds 字段中');
      console.log('示例配置：');
      console.log('taskListIds: ["' + tasklists[0].guid + '"]');

    } else {
      console.log('❌ 未获取到任何任务清单');
      console.log('请检查：');
      console.log('1. 飞书应用是否已申请 task:tasklist:readonly 权限');
      console.log('2. 应用版本是否已发布并更新权限');
      console.log('3. 机器人是否有权限访问任务清单');
    }

  } catch (error) {
    console.error('❌ 获取任务清单失败:', error.message);

    if (error.message.includes('99991663') || error.message.includes('PermissionDenied')) {
      console.log('\n💡 权限不足，请先在飞书开放平台申请以下权限：');
      console.log('- task:task:readonly');
      console.log('- task:tasklist:readonly');
    }
  }
}

getTaskLists().catch(console.error);
