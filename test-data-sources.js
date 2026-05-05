// 数据源配置验证工具
const { TeamConfigService } = require('./dist/modules/config/team-config.service');
const { FeishuClientFactory } = require('./dist/common/feishu/client');
const { Logger } = require('./dist/common/logger/logger');

const logger = Logger.getInstance();

async function testDataSources() {
  console.log('🧪 数据源配置验证工具\n');

  try {
    // 加载配置
    const configService = TeamConfigService.getInstance();
    await configService.loadGlobalConfig();
    const teamConfig = await configService.getTeamConfig('dev');
    console.log(`✅ 加载团队配置成功: ${teamConfig.teamName}\n`);

    // 创建飞书客户端
    const feishuClient = await FeishuClientFactory.getClient(teamConfig);
    console.log('✅ 飞书客户端创建成功\n');

    // 验证文档配置
    if (teamConfig.dataSources.docs.enabled) {
      console.log('📄 正在验证文档配置...');
      const rootFolderToken = teamConfig.dataSources.docs.rootFolderToken;

      if (!rootFolderToken || !rootFolderToken.startsWith('folder_')) {
        console.log('❌ 文档根目录Token格式错误，应该以 folder_ 开头');
      } else {
        try {
          // 尝试获取文件夹元信息
          const response = await feishuClient.request({
            method: 'GET',
            url: `/drive/v1/files/${rootFolderToken}`,
          });

          if (response.data) {
            console.log(`✅ 文档根目录验证成功: ${response.data.name}`);
            console.log(`  文件夹类型: ${response.data.type}`);
            console.log(`  创建时间: ${new Date(response.data.created_time * 1000).toLocaleString()}`);
          }
        } catch (error) {
          console.log('❌ 文档根目录访问失败:', error.response?.data?.msg || error.message);
          console.log('  请检查：');
          console.log('  1. rootFolderToken 是否正确');
          console.log('  2. 飞书应用是否有 drive:drive:readonly 权限');
          console.log('  3. 机器人是否被添加为文件夹的可查看成员');
        }
      }
    } else {
      console.log('📄 文档采集已禁用，跳过验证');
    }
    console.log('');

    // 验证任务配置
    if (teamConfig.dataSources.tasks.enabled) {
      console.log('✅ 正在验证任务配置...');
      const projectIds = teamConfig.dataSources.tasks.projectIds || [];

      if (projectIds.length === 0) {
        console.log('❌ 任务项目ID列表为空');
      } else {
        for (const projectId of projectIds) {
          console.log(`\n  正在验证项目: ${projectId}`);
          try {
            // 尝试获取项目信息
            const response = await feishuClient.request({
              method: 'GET',
              url: `/project/v1/projects/${projectId}`,
            });

            if (response.data) {
              console.log(`  ✅ 项目验证成功: ${response.data.name}`);
              console.log(`    项目状态: ${response.data.status}`);
            }
          } catch (error) {
            console.log(`  ❌ 项目访问失败: ${error.response?.data?.msg || error.message}`);
            console.log('    请检查：');
            console.log('    1. projectId 是否正确');
            console.log('    2. 飞书应用是否有 project:project:readonly 权限');
            console.log('    3. 机器人是否被添加到项目成员中');
          }
        }
      }
    } else {
      console.log('✅ 任务采集已禁用，跳过验证');
    }
    console.log('');

    // 验证日历配置
    if (teamConfig.dataSources.meetings.enabled) {
      console.log('📅 正在验证日历配置...');
      const calendarIds = teamConfig.dataSources.meetings.calendarIds || [];

      if (calendarIds.length === 0) {
        console.log('❌ 日历ID列表为空');
      } else {
        for (const calendarId of calendarIds) {
          console.log(`\n  正在验证日历: ${calendarId}`);
          try {
            // 尝试获取日历信息
            const response = await feishuClient.request({
              method: 'GET',
              url: `/calendar/v4/calendars/${calendarId}`,
            });

            if (response.data) {
              console.log(`  ✅ 日历验证成功: ${response.data.summary}`);
              console.log(`    日历描述: ${response.data.description || '无'}`);
            }
          } catch (error) {
            console.log(`  ❌ 日历访问失败: ${error.response?.data?.msg || error.message}`);
            console.log('    请检查：');
            console.log('    1. calendarId 是否正确（只需要@前面的部分）');
            console.log('    2. 飞书应用是否有 calendar:calendar:readonly 权限');
            console.log('    3. 机器人是否有权限访问该日历');
          }
        }
      }
    } else {
      console.log('📅 会议采集已禁用，跳过验证');
    }

    console.log('\n🎉 数据源验证完成！');
    console.log('💡 如果有配置错误，请根据提示修正后重新运行验证');

  } catch (error) {
    console.error('❌ 验证过程出错:', error.message);
  }
}

testDataSources().catch(console.error);
