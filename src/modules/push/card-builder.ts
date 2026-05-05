import dayjs from 'dayjs';
import { WeeklyReport } from '../../types';
import { Logger } from '../../common/logger/logger';

const logger = Logger.getInstance();

/**
 * 飞书卡片构建器
 */
export class FeishuCardBuilder {
  /**
   * 构建周报备卡片
   * @param report 周报数据
   * @param teamName 团队名称
   */
  static buildWeeklyReportCard(report: WeeklyReport, teamName: string): any {
    const startTime = dayjs(report.timeRange.start).format('YYYY年MM月DD日');
    const endTime = dayjs(report.timeRange.end).format('YYYY年MM月DD日');
    const generateTime = dayjs(report.generatedAt).format('YYYY-MM-DD HH:mm');

    // 卡片标题
    const header = {
      title: {
        tag: 'plain_text',
        content: `${teamName} 周报 (${startTime} - ${endTime})`,
      },
      template: 'blue',
    };

    // 卡片内容元素
    const elements: any[] = [];

    // 数据统计面板（增加容错处理）
    const docCount = Array.isArray(report.sources) ? report.sources.filter(s => s.type === 'doc').length : 0;
    const taskCount = Array.isArray(report.sources) ? report.sources.filter(s => s.type === 'task').length : 0;
    const meetingCount = Array.isArray(report.sources) ? report.sources.filter(s => s.type === 'meeting').length : 0;
    const messageCount = Array.isArray(report.sources) ? report.sources.filter(s => s.type === 'message').length : 0;
    const riskCount = Array.isArray(report.content?.riskWarnings) ? report.content.riskWarnings.length : 0;

    elements.push({
      tag: 'column_set',
      columns: [
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          vertical_align: 'middle',
          elements: [
            {
              tag: 'markdown',
              content: `**📄 文档**\n${docCount} 篇更新`,
              text_align: 'center'
            }
          ]
        },
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          vertical_align: 'middle',
          elements: [
            {
              tag: 'markdown',
              content: `**✅ 任务**\n${taskCount} 项变更`,
              text_align: 'center'
            }
          ]
        },
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          vertical_align: 'middle',
          elements: [
            {
              tag: 'markdown',
              content: `**🎙️ 会议**\n${meetingCount} 场纪要`,
              text_align: 'center'
            }
          ]
        },
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          vertical_align: 'middle',
          elements: [
            {
              tag: 'markdown',
              content: `**💬 消息**\n${messageCount} 条讨论`,
              text_align: 'center'
            }
          ]
        },
        {
          tag: 'column',
          width: 'weighted',
          weight: 1,
          vertical_align: 'middle',
          elements: [
            {
              tag: 'markdown',
              content: `**⚠️ 风险**\n${riskCount} 个预警`,
              text_align: 'center'
            }
          ]
        }
      ]
    });

    elements.push({ tag: 'hr' });

    // 整体概览
    elements.push({
      tag: 'markdown',
      content: `**📊 整体概览**\n${report.content.overview}`,
    });

    elements.push({ tag: 'hr' });

    // 重点工作
    if (report.content.keyWork.length > 0) {
      elements.push({
        tag: 'markdown',
        content: `**✅ 本周重点工作 (${report.content.keyWork.length} 项)**`,
      });

      // 只展示最重要的5项，提升信息密度
      const displayCount = Math.min(5, report.content.keyWork.length);
      report.content.keyWork.slice(0, displayCount).forEach((work, index) => {
        elements.push({
          tag: 'markdown',
          content: `${index + 1}. **[${work.title}](${work.sourceUrl})** | 👤 ${work.author}\n   ${work.description.substring(0, 100)}${work.description.length > 100 ? '...' : ''}`,
        });
      });

      if (report.content.keyWork.length > displayCount) {
        elements.push({
          tag: 'markdown',
          content: `*... 还有 ${report.content.keyWork.length - displayCount} 项工作，点击标题链接查看详情*`,
        });
      }

      elements.push({ tag: 'hr' });
    }

    // 项目进展
    if (report.content.projectProgress.length > 0) {
      elements.push({
        tag: 'markdown',
        content: `**🚀 项目进展 (${report.content.projectProgress.length} 个)**`,
      });

      report.content.projectProgress.forEach((project) => {
        // 计算项目健康度
        const totalTasks = project.tasks.length;
        const completedTasks = project.tasks.filter(t => t.status === 'done' || t.status === '已完成').length;
        const progressRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        // 进度条样式
        const progressBar = '█'.repeat(Math.floor(progressRate / 10)) + '░'.repeat(10 - Math.floor(progressRate / 10));

        elements.push({
          tag: 'markdown',
          content: `**${project.projectName}** | ${progressBar} ${progressRate}%\n${project.progress.substring(0, 80)}${project.progress.length > 80 ? '...' : ''}`,
        });

        if (project.tasks.length > 0) {
          const taskList = project.tasks.slice(0, 2).map(task =>
            `- [${task.title.substring(0, 20)}${task.title.length > 20 ? '...' : ''}](${task.url}) ${task.status === 'done' ? '✅' : task.status === 'in_progress' ? '🚀' : '⏳'}`
          ).join(' ');

          elements.push({
            tag: 'markdown',
            content: `*相关任务：* ${taskList}${project.tasks.length > 2 ? ` ... 等 ${project.tasks.length} 项` : ''}`,
          });
        }
      });

      elements.push({ tag: 'hr' });
    }

    // 待跟进事项
    if (report.content.pendingItems.length > 0) {
      elements.push({
        tag: 'markdown',
        content: `**⏳ 待跟进事项 (${report.content.pendingItems.length} 项)**`,
      });

      // 只展示前5项
      report.content.pendingItems.slice(0, 5).forEach((item, index) => {
        const deadline = item.deadline ? ` ⏰ ${dayjs(item.deadline).format('MM-DD')}` : '';
        elements.push({
          tag: 'markdown',
          content: `${index + 1}. **[${item.content.substring(0, 50)}${item.content.length > 50 ? '...' : ''}](${item.sourceUrl})** | 👤 ${item.assignee}${deadline}`,
        });
      });

      if (report.content.pendingItems.length > 5) {
        elements.push({
          tag: 'markdown',
          content: `*... 还有 ${report.content.pendingItems.length - 5} 项待跟进*`,
        });
      }

      elements.push({ tag: 'hr' });
    }

    // 风险预警
    if (report.content.riskWarnings.length > 0) {
      const highRiskCount = report.content.riskWarnings.filter(r => r.level === 'high').length;
      const mediumRiskCount = report.content.riskWarnings.filter(r => r.level === 'medium').length;
      const lowRiskCount = report.content.riskWarnings.filter(r => r.level === 'low').length;

      let riskTitle = '**⚠️ 风险预警**';
      if (highRiskCount > 0) {
        riskTitle = `**🔴 风险预警 (高风险 ${highRiskCount} 个，中风险 ${mediumRiskCount} 个，低风险 ${lowRiskCount} 个)**`;
      }

      elements.push({
        tag: 'markdown',
        content: riskTitle,
      });

      // 先展示高风险，再展示中风险，最后低风险
      const sortedRisks = [...report.content.riskWarnings].sort((a, b) => {
        const levelOrder = { high: 0, medium: 1, low: 2 };
        return levelOrder[a.level] - levelOrder[b.level];
      });

      sortedRisks.forEach((risk, index) => {
        const levelMap = {
          low: '🟢 低风险',
          medium: '🟡 中风险',
          high: '🔴 高风险',
        };
        elements.push({
          tag: 'markdown',
          content: `${index + 1}. ${levelMap[risk.level]}: **[${risk.content}](${risk.sourceUrl})**`,
        });
      });

      elements.push({ tag: 'hr' });
    }

    // 下周计划
    if (report.content.nextWeekPlan.length > 0) {
      elements.push({
        tag: 'markdown',
        content: `**📅 下周计划 (${report.content.nextWeekPlan.length} 项)**`,
      });

      report.content.nextWeekPlan.slice(0, 5).forEach((plan, index) => {
        elements.push({
          tag: 'markdown',
          content: `${index + 1}. ${plan.content.substring(0, 60)}${plan.content.length > 60 ? '...' : ''} | 👤 ${plan.responsible}`,
        });
      });

      if (report.content.nextWeekPlan.length > 5) {
        elements.push({
          tag: 'markdown',
          content: `*... 还有 ${report.content.nextWeekPlan.length - 5} 项计划*`,
        });
      }

      elements.push({ tag: 'hr' });
    }

    // 页脚信息
    elements.push({
      tag: 'note',
      elements: [
        {
          tag: 'plain_text',
          content: `🤖 SmartFlow 自动生成 | ${generateTime} | 内容100%来自飞书原始数据`,
        },
      ],
    });

    // 交互按钮
    const actions = [
      {
        tag: 'button',
        text: {
          tag: 'plain_text',
          content: '📋 查看全部',
        },
        type: 'primary',
        multi_url: {
          url: 'https://github.com/xoaop/smartflow',
          pc_url: 'https://github.com/xoaop/smartflow',
          android_url: 'https://github.com/xoaop/smartflow',
          ios_url: 'https://github.com/xoaop/smartflow',
        },
      },
      {
        tag: 'button',
        text: {
          tag: 'plain_text',
          content: '➕ 创建任务',
        },
        type: 'default',
        multi_url: {
          url: 'https://applink.feishu.cn/client/task/create',
          pc_url: 'https://applink.feishu.cn/client/task/create',
          android_url: 'https://applink.feishu.cn/client/task/create',
          ios_url: 'https://applink.feishu.cn/client/task/create',
        },
      },
      {
        tag: 'button',
        text: {
          tag: 'plain_text',
          content: '⚙️ 配置',
        },
        type: 'default',
        multi_url: {
          url: 'https://github.com/xoaop/smartflow#config',
          pc_url: 'https://github.com/xoaop/smartflow#config',
          android_url: 'https://github.com/xoaop/smartflow#config',
          ios_url: 'https://github.com/xoaop/smartflow#config',
        },
      },
    ];

    // 构建完整卡片
    return {
      config: {
        wide_screen_mode: true,
        enable_forward: true,
      },
      header,
      elements,
      actions,
    };
  }

  /**
   * 构建测试卡片
   */
  static buildTestCard(): any {
    return {
      config: {
        wide_screen_mode: true,
      },
      header: {
        title: {
          tag: 'plain_text',
          content: 'SmartFlow 推送测试',
        },
        template: 'green',
      },
      elements: [
        {
          tag: 'markdown',
          content: '✅ 推送功能测试成功！\n\n系统已正常连接到飞书，可以正常推送周报消息。',
        },
        {
          tag: 'hr',
        },
        {
          tag: 'note',
          elements: [
            {
              tag: 'plain_text',
              content: `测试时间：${dayjs().format('YYYY-MM-DD HH:mm:ss')}`,
            },
          ],
        },
      ],
    };
  }

  /**
   * 构建错误通知卡片
   */
  static buildErrorCard(error: Error, teamName: string): any {
    return {
      config: {
        wide_screen_mode: true,
      },
      header: {
        title: {
          tag: 'plain_text',
          content: `⚠️ ${teamName} 周报生成失败`,
        },
        template: 'red',
      },
      elements: [
        {
          tag: 'markdown',
          content: `**错误信息：**\n${error.message}`,
        },
        {
          tag: 'hr',
        },
        {
          tag: 'note',
          elements: [
            {
              tag: 'plain_text',
              content: `发生时间：${dayjs().format('YYYY-MM-DD HH:mm:ss')}`,
            },
          ],
        },
      ],
    };
  }
}
