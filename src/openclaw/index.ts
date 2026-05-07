import { OpenClawAgent, SkillContext, CardActionContext } from '@openclaw/sdk';
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

// 初始化OpenClaw Agent
const agent = new OpenClawAgent({
  manifest: require('../../skill.json'),
});

/**
 * 生成周报技能
 */
agent.skill('generate', async (context: SkillContext) => {
  try {
    const { team, range = 'lastweek', push = false, output } = context.parameters;
    const currentUserId = context.user.id;

    // 如果没有指定team，尝试获取用户的默认团队
    let targetTeamId = team;
    // 临时强制使用dev团队，排查路由问题
    targetTeamId = 'dev';
    if (!targetTeamId) {
      const globalConfig = await configService.loadGlobalConfig();
      targetTeamId = globalConfig.defaultTeamId;
      if (!targetTeamId) {
        // 如果没有默认团队，返回卡片让用户选择
        return await renderTeamSelectionCard(range, push);
      }
    }

    // 处理all情况，生成所有团队的周报
    if (targetTeamId === 'all') {
      const teamIds = await configService.getAllTeamIds();
      const results = [];

      for (const tid of teamIds) {
        try {
          const result = await generateSingleTeamReport(tid, range, push, context, false);
          results.push(result);
        } catch (error) {
          results.push({
            teamId: tid,
            success: false,
            error: (error as Error).message
          });
        }
      }

      // 生成汇总卡片
      return {
        card: {
          title: '📊 多团队周报生成汇总',
          elements: results.map(result => ({
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: result.success
                ? `✅ **${(result as any).teamName}**：生成成功，${(result as any).docCount}篇文档 ${(result as any).taskCount}个任务 ${(result as any).meetingCount}个会议`
                : `❌ **${result.teamId}**：生成失败 - ${(result as any).error}`
            }
          }))
        }
      };
    }

    // 获取团队配置
    const teamConfig = await configService.getTeamConfig(targetTeamId);

    // 解析时间范围
    const timeRange = collectorService.parseTimeRange(range);

    // 发送加载中卡片
    await context.sendCard({
      title: '⏳ 正在生成周报',
      content: `正在为 ${teamConfig.teamName} 生成 ${timeRange.start.toLocaleDateString()} ~ ${timeRange.end.toLocaleDateString()} 的周报，请稍候...`,
    });

    // 1. 采集数据
    const collectedData = await collectorService.collect(teamConfig, timeRange);

    // 2. 生成周报
    const report = await generatorService.generate(collectedData, teamConfig, context);

    // 3. 构建周报卡片
    const reportCard = FeishuCardBuilder.buildWeeklyReportCard(report, teamConfig.teamName);

    // 4. 添加卡片交互按钮
    reportCard.actions = [
      {
        tag: 'button',
        text: { tag: 'plain_text', content: '🔄 重新生成' },
        type: 'primary',
        value: {
          action: 'regenerate-report',
          teamId: targetTeamId,
          range: range,
        },
      },
      {
        tag: 'button',
        text: { tag: 'plain_text', content: '📤 推送到群' },
        type: 'default',
        value: {
          action: 'push-report',
          teamId: targetTeamId,
          reportId: report.teamId + '-' + Date.now(),
        },
      },
    ];

    // 5. 如果需要推送，直接推送
    if (push) {
      const pushService = new FeishuPushService(teamConfig);
      const pushResult = await pushService.pushWeeklyReport(report);

      if (pushResult.status === 'success') {
        const successCount = pushResult.results.filter(r => r.success).length;
        reportCard.elements.push({
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `✅ 已成功推送到 ${successCount} 个渠道`,
          },
        });
      } else if (pushResult.status === 'pending_audit') {
        reportCard.elements.push({
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: '⏳ 周报已推送给审核人，等待审核后推送',
          },
        });
      }
    }

    // 输出到文件（如果需要）
    if (output) {
      const fs = await import('fs-extra');
      await fs.writeJson(output as string, report, { spaces: 2 });
      reportCard.elements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `💾 周报已保存到文件: ${output}`,
        },
      });
    }

    // 返回最终卡片
    return {
      card: reportCard,
      context: {
        report,
        teamId: targetTeamId,
        range,
      },
    };

  } catch (error) {
    logger.error('生成周报失败', { error: (error as Error).message });
    return {
      card: {
        title: '❌ 生成周报失败',
        content: (error as Error).message,
      },
    };
  }
});

/**
 * 采集数据技能
 */
agent.skill('collect', async (context: SkillContext) => {
  try {
    const { team, range = 'lastweek', output } = context.parameters;
    const teamConfig = await configService.getTeamConfig(team as string);
    const timeRange = collectorService.parseTimeRange(range as string);

    // 发送加载中卡片
    await context.sendCard({
      title: '⏳ 正在采集数据',
      content: `正在为 ${teamConfig.teamName} 采集 ${timeRange.start.toLocaleDateString()} ~ ${timeRange.end.toLocaleDateString()} 的数据，请稍候...`,
    });

    // 采集数据
    const collectedData = await collectorService.collect(teamConfig, timeRange);

    // 输出到文件
    if (output) {
      const fs = await import('fs-extra');
      await fs.writeJson(output as string, collectedData, { spaces: 2 });
    }

    // 返回采集结果卡片
    return {
      card: {
        title: '✅ 数据采集完成',
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**团队：** ${teamConfig.teamName}
**时间范围：** ${timeRange.start.toLocaleDateString()} ~ ${timeRange.end.toLocaleDateString()}
**文档：** ${collectedData.docs.length} 篇
**任务：** ${collectedData.tasks.length} 个
**会议：** ${collectedData.meetings.length} 个
**群聊消息：** ${collectedData.messages?.length || 0} 条
${output ? `\n💾 数据已保存到文件: ${output}` : ''}`
            }
          }
        ]
      }
    };
  } catch (error) {
    logger.error('采集数据失败', { error: (error as Error).message });
    return {
      card: {
        title: '❌ 采集数据失败',
        content: (error as Error).message,
      },
    };
  }
});

/**
 * 列出团队配置技能
 */
agent.skill('config-list', async (context: SkillContext) => {
  try {
    const teamIds = await configService.getAllTeamIds();
    const teams = await Promise.all(
      teamIds.map(id => configService.getTeamConfig(id))
    );

    return {
      card: {
        title: '📋 团队配置列表',
        elements: teams.map(team => ({
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**${team.teamName}** (${team.teamId})\n推送状态：${team.push.enabled ? '✅ 已启用' : '❌ 已禁用'}\n生成周期：${team.generate.cycle}`,
          },
          actions: [
            {
              tag: 'button',
              text: { tag: 'plain_text', content: '生成周报' },
              type: 'primary',
              value: {
                action: 'generate-report',
                teamId: team.teamId,
              },
            },
          ],
        })),
      },
    };
  } catch (error) {
    return {
      card: {
        title: '❌ 获取团队列表失败',
        content: (error as Error).message,
      },
    };
  }
});

/**
 * 创建团队配置技能
 */
agent.skill('create-team-config', async (context: SkillContext) => {
  try {
    const { teamId, teamName } = context.parameters;

    if (await configService.teamConfigExists(teamId)) {
      return {
        card: {
          title: '❌ 团队配置已存在',
          content: `团队ID ${teamId} 已存在，请使用其他ID`,
        },
      };
    }

    const template = configService.createTeamConfigTemplate(teamId, teamName);
    await configService.saveTeamConfig(template);

    // 跳转到配置引导流程
    return await renderTeamConfigWizardCard(teamId, 'datasource');
  } catch (error) {
    return {
      card: {
        title: '❌ 创建团队配置失败',
        content: (error as Error).message,
      },
    };
  }
});

/**
 * 配置引导技能
 */
agent.skill('setup', async (context: SkillContext) => {
  try {
    const globalConfig = await configService.loadGlobalConfig();

    // 检查是否已配置飞书应用
    if (!globalConfig.feishu?.appId || !globalConfig.feishu?.appSecret) {
      return await renderFeishuAppConfigCard();
    }

    // 检查是否有团队配置
    const teamIds = await configService.getAllTeamIds();
    if (teamIds.length === 0) {
      return await renderCreateTeamCard();
    }

    // 显示配置主菜单
    return {
      card: {
        title: '⚙️ SmartFlow 配置中心',
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `欢迎使用 SmartFlow 配置向导！你可以：
- 📝 管理团队配置
- 🔑 修改全局飞书应用配置
- 🤖 调整大模型参数
- 📅 设置定时推送任务`
            }
          }
        ],
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '管理团队' },
            type: 'primary',
            value: { action: 'list-teams' },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '飞书应用配置' },
            value: { action: 'config-feishu-app' },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '大模型配置' },
            value: { action: 'config-llm' },
          },
        ],
      },
    };
  } catch (error) {
    logger.error('配置引导失败', { error: (error as Error).message });
    return {
      card: {
        title: '❌ 配置引导失败',
        content: (error as Error).message,
      },
    };
  }
});

/**
 * 健康检查技能
 */
agent.skill('health', async (context: SkillContext) => {
  try {
    const teamCount = (await configService.getAllTeamIds()).length;
    const globalConfig = await configService.loadGlobalConfig();

    return {
      card: {
        title: '✅ SmartFlow 运行正常',
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `**状态：** 运行正常
**团队配置数量：** ${teamCount} 个
**飞书应用配置：** ${globalConfig.feishu?.appId ? '✅ 已配置' : '❌ 未配置'}
**大模型配置：** ${globalConfig.llm.model || '平台默认模型'}
**配置目录：** ${process.env.SMARTFLOW_CONFIG_DIR || '~/.smartflow/config'}
**数据目录：** ${process.env.SMARTFLOW_DATA_DIR || '~/.smartflow/data'}
**日志级别：** ${globalConfig.logLevel}`
            }
          }
        ]
      }
    };
  } catch (error) {
    return {
      card: {
        title: '❌ 健康检查失败',
        content: (error as Error).message,
      },
    };
  }
});

/**
 * 测试推送技能
 */
agent.skill('test-push', async (context: SkillContext) => {
  try {
    const { team } = context.parameters;
    const teamConfig = await configService.getTeamConfig(team as string);
    const pushService = new FeishuPushService(teamConfig);

    const result = await pushService.pushTest();

    if (result.success) {
      return {
        card: {
          title: '✅ 测试推送成功',
          content: result.message,
        },
      };
    } else {
      return {
        card: {
          title: '❌ 测试推送失败',
          content: result.message,
        },
      };
    }
  } catch (error) {
    return {
      card: {
        title: '❌ 测试推送失败',
        content: (error as Error).message,
      },
    };
  }
});

/**
 * 卡片动作：重新生成周报
 */
agent.action('regenerate-report', async (context: CardActionContext) => {
  const { teamId, range } = context.action.value;
  // 重新调用生成周报技能
  return agent.invokeSkill('generate-weekly-report', {
    user: context.user,
    conversation: context.conversation,
    sendCard: context.sendCard,
    parameters: {
      teamId,
      range,
      push: false,
    },
  });
});

/**
 * 卡片动作：推送周报
 */
agent.action('push-report', async (context: CardActionContext) => {
  const { teamId, reportId } = context.action.value;
  const { report } = context.card.context;

  try {
    const teamConfig = await configService.getTeamConfig(teamId);
    const pushService = new FeishuPushService(teamConfig);
    const pushResult = await pushService.pushWeeklyReport(report);

    if (pushResult.status === 'success') {
      const successCount = pushResult.results.filter(r => r.success).length;
      return {
        card: {
          ...context.card,
          elements: [
            ...context.card.elements,
            {
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: `✅ 已成功推送到 ${successCount} 个渠道`,
              },
            },
          ],
        },
      };
    } else {
      return {
        card: {
          ...context.card,
          elements: [
            ...context.card.elements,
            {
              tag: 'div',
              text: {
                tag: 'lark_md',
                content: `❌ 推送失败：${pushResult.results[0]?.error || '未知错误'}`,
              },
            },
          ],
        },
      };
    }
  } catch (error) {
    return {
      card: {
        ...context.card,
        elements: [
          ...context.card.elements,
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: `❌ 推送失败：${(error as Error).message}`,
            },
          },
        ],
      },
    };
  }
});

/**
 * 卡片动作：保存飞书应用配置
 */
agent.action('save-feishu-app-config', async (context: CardActionContext) => {
  const { appId, appSecret } = context.formData || {};

  if (!appId || !appSecret) {
    return {
      card: {
        title: '❌ 配置失败',
        content: 'App ID 和 App Secret 不能为空',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '返回重新配置' },
            value: { action: 'config-feishu-app' }
          }
        ]
      }
    };
  }

  try {
    // 先加载现有配置，再合并更新，避免丢失其他字段
    const existingConfig = await configService.loadGlobalConfig();
    await configService.saveGlobalConfig({
      ...existingConfig,
      feishu: {
        ...existingConfig.feishu,
        appId,
        appSecret,
        scopes: []
      }
    });

    // 检查是否有团队配置
    const teamIds = await configService.getAllTeamIds();
    if (teamIds.length === 0) {
      return await renderCreateTeamCard();
    }

    return {
      card: {
        title: '✅ 飞书应用配置成功',
        content: '飞书应用信息已保存，接下来可以配置团队数据源了。',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '前往配置中心' },
            value: { action: 'setup' }
          }
        ]
      }
    };
  } catch (error) {
    return {
      card: {
        title: '❌ 保存配置失败',
        content: (error as Error).message,
      },
    };
  }
});

/**
 * 卡片动作：创建团队（从配置引导）
 */
agent.action('create-team-from-setup', async (context: CardActionContext) => {
  const { teamId, teamName } = context.formData || {};

  if (!teamId || !teamName) {
    return {
      card: {
        title: '❌ 创建失败',
        content: '团队ID和团队名称不能为空',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '返回重新输入' },
            value: { action: 'create-team' }
          }
        ]
      }
    };
  }

  try {
    if (await configService.teamConfigExists(teamId)) {
      return {
        card: {
          title: '❌ 团队配置已存在',
          content: `团队ID ${teamId} 已存在，请使用其他ID`,
          actions: [
            {
              tag: 'button',
              text: { tag: 'plain_text', content: '返回重新输入' },
              value: { action: 'create-team' }
            }
          ]
        },
      };
    }

    const template = configService.createTeamConfigTemplate(teamId, teamName);
    await configService.saveTeamConfig(template);

    // 进入团队配置引导
    return await renderTeamConfigWizardCard(teamId, 'datasource');
  } catch (error) {
    return {
      card: {
        title: '❌ 创建团队配置失败',
        content: (error as Error).message,
      },
    };
  }
});

/**
 * 卡片动作：团队配置步骤切换
 */
agent.action('team-config-step', async (context: CardActionContext) => {
  const { teamId, step } = context.action.value;
  return await renderTeamConfigWizardCard(teamId, step);
});

/**
 * 卡片动作：配置文档数据源
 */
agent.action('config-docs', async (context: CardActionContext) => {
  const { teamId } = context.action.value;

  try {
    const teamConfig = await configService.getTeamConfig(teamId);
    const client = await FeishuClientFactory.getClient(teamConfig);
    const folders = await client.scanFolders('root');

    return await renderResourceSelectionCard(
      teamId,
      'docs',
      folders.map((f: { token: string; name: string }) => ({ id: f.token, name: f.name })),
      teamConfig.dataSources.docs.rootFolderToken ? [teamConfig.dataSources.docs.rootFolderToken] : []
    );
  } catch (error) {
    return {
      card: {
        title: '❌ 加载文档列表失败',
        content: (error as Error).message,
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '返回' },
            value: { action: 'back-to-datasource-config', teamId }
          }
        ]
      }
    };
  }
});

/**
 * 卡片动作：配置任务数据源
 */
agent.action('config-tasks', async (context: CardActionContext) => {
  const { teamId } = context.action.value;

  try {
    const teamConfig = await configService.getTeamConfig(teamId);
    const client = await FeishuClientFactory.getClient(teamConfig);
    const projects = await client.scanProjects();

    return await renderResourceSelectionCard(
      teamId,
      'tasks',
      projects,
      teamConfig.dataSources.tasks.projectIds
    );
  } catch (error) {
    return {
      card: {
        title: '❌ 加载项目列表失败',
        content: (error as Error).message,
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '返回' },
            value: { action: 'back-to-datasource-config', teamId }
          }
        ]
      }
    };
  }
});

/**
 * 卡片动作：配置会议数据源
 */
agent.action('config-meetings', async (context: CardActionContext) => {
  const { teamId } = context.action.value;

  try {
    const teamConfig = await configService.getTeamConfig(teamId);
    const client = await FeishuClientFactory.getClient(teamConfig);
    const calendars = await client.scanCalendars();

    return await renderResourceSelectionCard(
      teamId,
      'meetings',
      calendars,
      teamConfig.dataSources.meetings.calendarIds
    );
  } catch (error) {
    return {
      card: {
        title: '❌ 加载日历列表失败',
        content: (error as Error).message,
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '返回' },
            value: { action: 'back-to-datasource-config', teamId }
          }
        ]
      }
    };
  }
});

/**
 * 卡片动作：配置群聊数据源
 */
agent.action('config-messages', async (context: CardActionContext) => {
  const { teamId } = context.action.value;

  try {
    const teamConfig = await configService.getTeamConfig(teamId);
    const client = await FeishuClientFactory.getClient(teamConfig);
    const chats = await client.scanChats();

    return await renderResourceSelectionCard(
      teamId,
      'messages',
      chats,
      teamConfig.dataSources.messages.chatIds
    );
  } catch (error) {
    return {
      card: {
        title: '❌ 加载群聊列表失败',
        content: (error as Error).message,
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '返回' },
            value: { action: 'back-to-datasource-config', teamId }
          }
        ]
      }
    };
  }
});

/**
 * 卡片动作：切换文档选择
 */
agent.action('toggle-docs', async (context: CardActionContext) => {
  const { teamId, resourceId } = context.action.value;

  try {
    const teamConfig = await configService.getTeamConfig(teamId);
    teamConfig.dataSources.docs.rootFolderToken = resourceId;
    teamConfig.dataSources.docs.enabled = true;
    await configService.saveTeamConfig(teamConfig);

    // 重新加载文件夹列表
    const client = await FeishuClientFactory.getClient(teamConfig);
    const folders = await client.scanFolders('root');

    return await renderResourceSelectionCard(
      teamId,
      'docs',
      folders.map((f: { token: string; name: string }) => ({ id: f.token, name: f.name })),
      [resourceId]
    );
  } catch (error) {
    return {
      card: {
        title: '❌ 保存配置失败',
        content: (error as Error).message,
      },
    };
  }
});

/**
 * 卡片动作：切换任务选择
 */
agent.action('toggle-tasks', async (context: CardActionContext) => {
  const { teamId, resourceId } = context.action.value;

  try {
    const teamConfig = await configService.getTeamConfig(teamId);
    const projectIds = teamConfig.dataSources.tasks.projectIds;
    const index = projectIds.indexOf(resourceId);

    if (index > -1) {
      projectIds.splice(index, 1);
    } else {
      projectIds.push(resourceId);
    }

    teamConfig.dataSources.tasks.enabled = projectIds.length > 0;
    await configService.saveTeamConfig(teamConfig);

    // 重新加载项目列表
    const client = await FeishuClientFactory.getClient(teamConfig);
    const projects = await client.scanProjects();

    return await renderResourceSelectionCard(
      teamId,
      'tasks',
      projects,
      projectIds
    );
  } catch (error) {
    return {
      card: {
        title: '❌ 保存配置失败',
        content: (error as Error).message,
      },
    };
  }
});

/**
 * 卡片动作：切换会议选择
 */
agent.action('toggle-meetings', async (context: CardActionContext) => {
  const { teamId, resourceId } = context.action.value;

  try {
    const teamConfig = await configService.getTeamConfig(teamId);
    const calendarIds = teamConfig.dataSources.meetings.calendarIds;
    const index = calendarIds.indexOf(resourceId);

    if (index > -1) {
      calendarIds.splice(index, 1);
    } else {
      calendarIds.push(resourceId);
    }

    teamConfig.dataSources.meetings.enabled = calendarIds.length > 0;
    await configService.saveTeamConfig(teamConfig);

    // 重新加载日历列表
    const client = await FeishuClientFactory.getClient(teamConfig);
    const calendars = await client.scanCalendars();

    return await renderResourceSelectionCard(
      teamId,
      'meetings',
      calendars,
      calendarIds
    );
  } catch (error) {
    return {
      card: {
        title: '❌ 保存配置失败',
        content: (error as Error).message,
      },
    };
  }
});

/**
 * 卡片动作：切换群聊选择
 */
agent.action('toggle-messages', async (context: CardActionContext) => {
  const { teamId, resourceId } = context.action.value;

  try {
    const teamConfig = await configService.getTeamConfig(teamId);
    const chatIds = teamConfig.dataSources.messages.chatIds;
    const index = chatIds.indexOf(resourceId);

    if (index > -1) {
      chatIds.splice(index, 1);
    } else {
      chatIds.push(resourceId);
    }

    teamConfig.dataSources.messages.enabled = chatIds.length > 0;
    await configService.saveTeamConfig(teamConfig);

    // 重新加载群聊列表
    const client = await FeishuClientFactory.getClient(teamConfig);
    const chats = await client.scanChats();

    return await renderResourceSelectionCard(
      teamId,
      'messages',
      chats,
      chatIds
    );
  } catch (error) {
    return {
      card: {
        title: '❌ 保存配置失败',
        content: (error as Error).message,
      },
    };
  }
});

/**
 * 卡片动作：返回数据源配置页面
 */
agent.action('back-to-datasource-config', async (context: CardActionContext) => {
  const { teamId } = context.action.value;
  return await renderTeamConfigWizardCard(teamId, 'datasource');
});

/**
 * 卡片动作：完成团队配置
 */
agent.action('finish-team-config', async (context: CardActionContext) => {
  const { teamId } = context.action.value;
  const teamConfig = await configService.getTeamConfig(teamId);

  return {
    card: {
      title: '🎉 配置完成！',
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**${teamConfig.teamName}** 的配置已完成！
你现在可以：
- 📊 立即生成本周周报
- ⏰ 设置定时自动推送
- ⚙️ 随时调整配置参数`
          }
        }
      ],
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '生成周报' },
          type: 'primary',
          value: { action: 'generate-report', teamId, range: 'thisweek' }
        },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '返回配置中心' },
          value: { action: 'setup' }
        }
      ]
    }
  };
});

/**
 * 渲染飞书应用配置卡片
 */
async function renderFeishuAppConfigCard() {
  return {
    card: {
      title: '🔑 配置飞书应用',
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `请配置飞书企业自建应用信息：
1. 前往 [飞书开放平台](https://open.feishu.cn/) 创建企业自建应用
2. 复制 App ID 和 App Secret 填入下方
3. 为应用开通以下权限：
   - 文档: 查看、编辑、管理
   - 任务: 查看、编辑
   - 日历: 查看日历
   - 消息与群组: 读取群组消息、发送消息
`
          }
        },
        {
          tag: 'input',
          name: 'appId',
          placeholder: '请输入 App ID',
          required: true
        },
        {
          tag: 'input',
          name: 'appSecret',
          placeholder: '请输入 App Secret',
          required: true
        }
      ],
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '保存并下一步' },
          type: 'primary',
          value: {
            action: 'save-feishu-app-config'
          }
        }
      ]
    }
  };
}

/**
 * 渲染创建团队卡片
 */
async function renderCreateTeamCard() {
  return {
    card: {
      title: '👥 创建团队配置',
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: '请输入团队信息，创建第一个团队配置：'
          }
        },
        {
          tag: 'input',
          name: 'teamId',
          placeholder: '团队ID（英文标识，如：product-team）',
          required: true
        },
        {
          tag: 'input',
          name: 'teamName',
          placeholder: '团队名称（中文显示名，如：产品团队）',
          required: true
        }
      ],
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '创建团队' },
          type: 'primary',
          value: {
            action: 'create-team-from-setup'
          }
        }
      ]
    }
  };
}

/**
 * 渲染团队配置引导卡片
 */
async function renderTeamConfigWizardCard(teamId: string, step: 'datasource' | 'push' = 'datasource') {
  const teamConfig = await configService.getTeamConfig(teamId);

  if (step === 'datasource') {
    return {
      card: {
        title: `📊 配置 ${teamConfig.teamName} 的数据源`,
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: '请选择需要同步的数据源，我们会自动扫描你有权限的资源：'
            }
          }
        ],
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: `📁 文档 (${teamConfig.dataSources.docs.enabled ? '✅' : '❌'})` },
            value: { action: 'config-docs', teamId }
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: `✅ 任务 (${teamConfig.dataSources.tasks.enabled ? '✅' : '❌'})` },
            value: { action: 'config-tasks', teamId }
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: `📅 会议 (${teamConfig.dataSources.meetings.enabled ? '✅' : '❌'})` },
            value: { action: 'config-meetings', teamId }
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: `💬 群聊 (${teamConfig.dataSources.messages.enabled ? '✅' : '❌'})` },
            value: { action: 'config-messages', teamId }
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '下一步：配置推送' },
            type: 'primary',
            value: { action: 'team-config-step', teamId, step: 'push' }
          }
        ]
      }
    };
  } else if (step === 'push') {
    return {
      card: {
        title: `📤 配置 ${teamConfig.teamName} 的推送设置`,
        elements: [
          {
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: '配置周报推送的相关设置：'
            }
          }
        ],
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: `📢 推送渠道 (${teamConfig.push.channels.length}个)` },
            value: { action: 'config-push-channels', teamId }
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: `⏰ 定时推送 (${teamConfig.push.enabled ? '已启用' : '未启用'})` },
            value: { action: 'config-schedule', teamId }
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '完成配置' },
            type: 'primary',
            value: { action: 'finish-team-config', teamId }
          }
        ]
      }
    };
  }

  throw new Error('无效的配置步骤');
}

/**
 * 渲染资源选择卡片
 */
async function renderResourceSelectionCard(
  teamId: string,
  resourceType: 'docs' | 'tasks' | 'meetings' | 'messages',
  resources: Array<{ id: string; name: string }>,
  selectedIds: string[]
) {
  const typeConfig = {
    docs: { title: '选择文档文件夹', field: 'rootFolderToken', multi: false },
    tasks: { title: '选择项目', field: 'projectIds', multi: true },
    meetings: { title: '选择日历', field: 'calendarIds', multi: true },
    messages: { title: '选择群聊', field: 'chatIds', multi: true },
  };

  const config = typeConfig[resourceType];

  return {
    card: {
      title: config.title,
      elements: resources.map(resource => ({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `${selectedIds.includes(resource.id) ? '✅' : '⬜'} ${resource.name}`
        },
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: selectedIds.includes(resource.id) ? '取消选择' : '选择' },
            value: {
              action: `toggle-${resourceType}`,
              teamId,
              resourceId: resource.id,
              resourceName: resource.name
            }
          }
        ]
      })),
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '保存并返回' },
          type: 'primary',
          value: { action: 'back-to-datasource-config', teamId }
        }
      ]
    }
  };
}

/**
 * 渲染团队选择卡片
 */
async function renderTeamSelectionCard(range: string, push: boolean) {
  const teamIds = await configService.getAllTeamIds();
  const teams = await Promise.all(
    teamIds.map(id => configService.getTeamConfig(id))
  );

  return {
    card: {
      title: '请选择要生成周报的团队',
      elements: teams.map(team => ({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${team.teamName}** (${team.teamId})`,
        },
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '生成周报' },
            type: 'primary',
            value: {
              action: 'generate-report',
              teamId: team.teamId,
              range,
              push,
            },
          },
        ],
      })),
    },
  };
}

/**
 * 生成单个团队周报的公共方法
 */
async function generateSingleTeamReport(teamId: string, range: string, push: boolean, context: SkillContext, sendCard: boolean = false) {
  const teamConfig = await configService.getTeamConfig(teamId);
  const timeRange = collectorService.parseTimeRange(range);

  // 采集数据
  const collectedData = await collectorService.collect(teamConfig, timeRange);

  // 生成周报
  const report = await generatorService.generate(collectedData, teamConfig, context);

  // 推送（如果需要）
  let pushResult = null;
  if (push) {
    const pushService = new FeishuPushService(teamConfig);
    pushResult = await pushService.pushWeeklyReport(report);
  }

  return {
    success: true,
    teamId,
    teamName: teamConfig.teamName,
    docCount: collectedData.docs.length,
    taskCount: collectedData.tasks.length,
    meetingCount: collectedData.meetings.length,
    messageCount: collectedData.messages?.length || 0,
    report,
    pushResult
  };
}

/**
 * 演示功能
 */
agent.skill('demo', async (context: SkillContext) => {
  try {
    // 生成模拟周报
    const mockData = await import('../modules/generator/mock-data.js');
    const collectedData = mockData.generateMockData();

    // 创建模拟团队配置
    const mockTeamConfig: any = {
      teamId: 'demo-team',
      teamName: '演示团队',
      generate: {
        includeRisks: true,
        includeNextWeekPlan: true,
        detailLevel: 'medium',
      }
    };

    // 生成周报
    await context.sendCard({
      title: '🎬 功能演示：正在生成模拟周报',
      content: '正在为您生成模拟团队的周报，让您快速体验完整功能...',
    });

    // 生成周报
    const generatorService = new ReportGeneratorService();
    const report = await generatorService.generate(collectedData, mockTeamConfig, context, true);

    // 构建周报卡片
    const reportCard = FeishuCardBuilder.buildWeeklyReportCard(report, mockTeamConfig.teamName);

    // 添加演示水印
    reportCard.elements.unshift({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: '⚠️  **这是演示数据，所有内容均为模拟生成**'
      }
    });

    return {
      card: reportCard
    };

  } catch (error) {
    logger.error('演示功能失败', { error: (error as Error).message });
    return {
      card: {
        title: '❌ 演示失败',
        content: (error as Error).message,
      },
    };
  }
});

/**
 * 帮助技能
 */
agent.skill('help', async (context: SkillContext) => {
  return {
    card: {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: '🤖 智汇流周报助手使用说明' },
        template: 'blue'
      },
      elements: [
        {
          tag: 'markdown',
          content: '# 使用指南\n\n' +
                  '## 📝 生成周报\n' +
                  '- `生成上周周报` - 生成团队上周的周报\n' +
                  '- `生成本周周报` - 生成本周周报\n' +
                  '- `生成上月月报` - 生成上月月度总结\n' +
                  '- `生成2024-01-01~2024-01-07周报` - 生成指定时间范围的周报\n\n' +
                  '## ⚙️ 配置管理\n' +
                  '- `配置` - 启动配置向导\n' +
                  '- `团队列表` - 查看所有已配置的团队\n' +
                  '- `测试推送` - 测试飞书推送功能\n' +
                  '- `健康检查` - 查看服务运行状态\n\n' +
                  '## 🎯 高级功能\n' +
                  '- `定时推送设置` - 设置自动推送时间\n' +
                  '- `数据源管理` - 配置需要采集的数据源\n' +
                  '- `审核设置` - 开启/关闭周报审核流程\n\n' +
                  '## 💡 小技巧\n' +
                  '- 不需要严格按照命令格式，自然语言即可\n' +
                  '- 可以直接说「帮我总结一下上周研发团队的工作」\n' +
                  '- 生成的周报支持重新生成和直接推送'
        }
      ]
    }
  };
});

/**
 * 欢迎技能
 */
agent.skill('welcome', async (context: SkillContext) => {
  return {
    card: {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: '🎉 欢迎使用智汇流周报助手' },
        template: 'blue'
      },
      elements: [
        {
          tag: 'markdown',
          content: '我是您的智能团队效能助手，可以帮您自动生成专业的团队周报。\n\n' +
                  '**✨ 核心功能：**\n' +
                  '- 📝 自动生成周报/月报/季度总结\n' +
                  '- 📊 智能分析项目进度和风险\n' +
                  '- ⏰ 定时自动推送，无需人工干预\n' +
                  '- 🔍 多数据源自动整合（文档/任务/会议/群聊）\n\n' +
                  '**💡 您可以这样使用我：**\n' +
                  '- 说「生成上周周报」立即生成本周周报\n' +
                  '- 说「测试推送」测试飞书推送功能\n' +
                  '- 说「健康检查」查看服务运行状态\n' +
                  '- 说「配置」启动配置向导\n'
        }
      ],
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '📝 立即生成周报' },
          type: 'primary',
          value: { action: 'generate-report', range: 'lastweek' }
        },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '⚙️ 开始配置' },
          value: { action: 'setup' }
        },
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '🎬 功能演示' },
          value: { action: 'demo' }
        }
      ]
    }
  };
});

// 导出Agent供OpenClaw运行时使用
module.exports = agent;
