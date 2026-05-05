// 直接调用飞书CLI获取项目列表
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function getProjectList() {
  console.log('✅ 获取飞书项目列表...\n');

  try {
    // 直接调用飞书CLI，使用正确的profile名称
    const { stdout, stderr } = await execAsync(
      'feishu api get /open-apis/project/v1/projects --profile cli_a97eea6dd9b85bc2'
    );

    if (stderr) {
      throw new Error(stderr);
    }

    const response = JSON.parse(stdout);

    if (response.code !== 0) {
      throw new Error(`API错误: ${response.msg} (错误码: ${response.code})`);
    }

    const projects = response.data?.items || response.data?.projects || [];

    if (projects.length > 0) {
      console.log('✅ 成功获取到以下项目：\n');
      console.log('| 项目ID | 项目名称 | 状态 |');
      console.log('|--------|----------|------|');

      projects.forEach(project => {
        console.log(`| ${project.id} | ${project.name} | ${project.status_name || project.status || '正常'} |`);
      });

      console.log('\n💡 请将需要采集的项目ID复制到配置文件的 projectIds 字段中');
      console.log('示例配置：');
      console.log('projectIds: ["' + projects[0].id + '"]');

    } else {
      console.log('❌ 未获取到任何项目');
      console.log('请检查：');
      console.log('1. 飞书应用是否已申请 project:project:readonly 权限');
      console.log('2. 应用版本是否已发布并更新权限');
      console.log('3. 机器人是否已被添加到项目成员中');
    }

  } catch (error) {
    console.error('❌ 获取项目列表失败:', error.message);

    if (error.message.includes('99991663') || error.message.includes('PermissionDenied')) {
      console.log('\n💡 权限不足，请先在飞书开放平台申请 project:project:readonly 权限');
    }
  }
}

getProjectList().catch(console.error);
