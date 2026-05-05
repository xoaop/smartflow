// 调试配置加载问题
const { TeamConfigService } = require('./dist/modules/config/team-config.service');

async function debugConfig() {
  console.log('🔍 调试配置加载...\n');

  try {
    const configService = TeamConfigService.getInstance();
    await configService.loadGlobalConfig();
    const teamConfig = await configService.getTeamConfig('dev');

    console.log('✅ 加载的配置：');
    console.log('团队ID:', teamConfig.teamId);
    console.log('团队名称:', teamConfig.teamName);
    console.log('\n数据源配置:');
    console.log('文档采集:', teamConfig.dataSources.docs.enabled, teamConfig.dataSources.docs.rootFolderToken);
    console.log('任务采集:', teamConfig.dataSources.tasks.enabled, 'projectIds:', teamConfig.dataSources.tasks.projectIds, 'taskListIds:', teamConfig.dataSources.tasks.taskListIds);
    console.log('会议采集:', teamConfig.dataSources.meetings.enabled, teamConfig.dataSources.meetings.calendarIds);
    console.log('消息采集:', teamConfig.dataSources.messages.enabled, teamConfig.dataSources.messages.chatIds);

    // 检查配置文件内容
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(process.cwd(), 'config/teams/dev.yaml');
    const content = fs.readFileSync(configPath, 'utf-8');
    console.log('\n📄 配置文件原始内容:');
    console.log(content);

  } catch (error) {
    console.error('❌ 加载失败:', error.message);
  }
}

debugConfig().catch(console.error);
