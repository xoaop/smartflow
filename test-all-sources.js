// 所有数据源综合测试脚本
const { TeamConfigService } = require('./dist/modules/config/team-config.service');
const { FeishuCollectorService } = require('./dist/modules/collector/feishu-collector.service');
const { FeishuCardBuilder } = require('./dist/modules/push/card-builder');
const dayjs = require('dayjs');

async function testAllSources() {
  console.log('🧪 综合数据源测试\n');

  try {
    // 1. 加载配置
    console.log('1. 加载团队配置...');
    const configService = TeamConfigService.getInstance();
    await configService.loadGlobalConfig();
    const teamConfig = await configService.getTeamConfig('dev');
    console.log(`✅ 配置加载成功: ${teamConfig.teamName}`);
    console.log(`  文档采集: ${teamConfig.dataSources.docs.enabled ? '✅ 已启用' : '❌ 已禁用'}`);
    console.log(`  任务采集: ${teamConfig.dataSources.tasks.enabled ? '✅ 已启用' : '❌ 已禁用'}`);
    console.log(`  会议采集: ${teamConfig.dataSources.meetings.enabled ? '✅ 已启用' : '❌ 已禁用'}`);
    console.log(`  消息采集: ${teamConfig.dataSources.messages?.enabled ? '✅ 已启用' : '❌ 已禁用'}`);

    // 2. 初始化采集服务
    console.log('\n2. 初始化数据采集服务...');
    const collectorService = new FeishuCollectorService();

    // 测试时间范围：最近7天
    const timeRange = {
      start: dayjs().subtract(7, 'day').startOf('day').toDate(),
      end: dayjs().endOf('day').toDate()
    };
    console.log(`✅ 时间范围: ${dayjs(timeRange.start).format('YYYY-MM-DD')} 至 ${dayjs(timeRange.end).format('YYYY-MM-DD')}`);

    // 3. 执行数据采集
    console.log('\n3. 开始数据采集...');
    const collectedData = await collectorService.collect(teamConfig, timeRange);

    console.log('\n✅ 采集结果统计:');
    console.log(`  📄 文档: ${collectedData.docs.length} 篇`);
    console.log(`  ✅ 任务: ${collectedData.tasks.length} 个`);
    console.log(`  🎙️ 会议: ${collectedData.meetings.length} 个`);
    console.log(`  💬 消息: ${collectedData.messages?.length || 0} 条`);

    // 4. 打印采集到的部分数据供验证
    if (collectedData.docs.length > 0) {
      console.log('\n📄 最近更新的文档:');
      collectedData.docs.slice(0, 3).forEach(doc => {
        console.log(`  - ${doc.title} (${doc.modifier.name})`);
      });
    }

    if (collectedData.tasks.length > 0) {
      console.log('\n✅ 最近更新的任务:');
      collectedData.tasks.slice(0, 3).forEach(task => {
        console.log(`  - ${task.title} (${task.assignee.name}) [${task.status === 'done' ? '已完成' : '进行中'}]`);
      });
    }

    if (collectedData.meetings.length > 0) {
      console.log('\n🎙️ 最近的会议:');
      collectedData.meetings.slice(0, 3).forEach(meeting => {
        console.log(`  - ${meeting.title} (${dayjs(meeting.startTime).format('MM-DD HH:mm')})`);
      });
    }

    // 5. 测试周报生成
    console.log('\n4. 测试周报卡片生成...');

    // 模拟生成内容（实际使用时会经过LLM处理）
    const mockReport = {
      teamId: teamConfig.teamId,
      timeRange: collectedData.timeRange,
      generatedAt: new Date(),
      content: {
        overview: `本周团队共产生 ${collectedData.docs.length} 篇文档更新，完成 ${collectedData.tasks.length} 个任务，召开 ${collectedData.meetings.length} 场会议，整体进展顺利。`,
        keyWork: collectedData.docs.slice(0, 5).map(doc => ({
          title: doc.title,
          description: doc.contentSummary || '文档内容更新',
          sourceUrl: doc.url,
          author: doc.modifier.name
        })),
        projectProgress: [
          {
            projectName: '团队整体工作',
            progress: `本周共完成 ${collectedData.tasks.length} 个任务，项目进展符合预期。`,
            tasks: collectedData.tasks.slice(0, 3)
          }
        ],
        pendingItems: [],
        riskWarnings: [],
        nextWeekPlan: []
      },
      sources: [
        ...collectedData.docs.map(d => ({ type: 'doc', title: d.title, url: d.url })),
        ...collectedData.tasks.map(t => ({ type: 'task', title: t.title, url: t.url })),
        ...collectedData.meetings.map(m => ({ type: 'meeting', title: m.title, url: m.url }))
      ]
    };

    const reportCard = FeishuCardBuilder.buildWeeklyReportCard(mockReport, teamConfig.teamName);
    console.log('✅ 周报卡片生成成功');
    console.log(`  卡片标题: ${reportCard.header.title.content}`);
    console.log(`  卡片元素: ${reportCard.elements.length} 个`);
    console.log(`  数据统计: ${reportCard.elements[0].columns.map(c => c.elements[0].content.replace(/\n/g, ' ')).join(' | ')}`);

    console.log('\n🎉 所有数据源测试通过！');
    console.log('\n💡 下一步：');
    console.log('1. 启动Webhook服务: node smartflow-server.js');
    console.log('2. 在飞书群@机器人发送「测试」即可看到完整周报样例');
    console.log('3. 发送「生成上周周报」即可基于真实数据生成周报');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.log('\n💡 故障排查：');
    console.log('1. 检查飞书应用权限是否已申请并发布');
    console.log('2. 确认各个数据源ID是否正确');
    console.log('3. 确认机器人有访问这些数据源的权限');
  }
}

testAllSources().catch(console.error);
