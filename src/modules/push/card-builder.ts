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
        content: '**✅ 本周重点工作**',
      });

      report.content.keyWork.slice(0, 10).forEach((work, index) => {
        elements.push({
          tag: 'markdown',
          content: `${index + 1}. **[${work.title}](${work.sourceUrl})**\n   ${work.description}\n   👤 负责人：${work.author}`,
        });
      });

      if (report.content.keyWork.length > 10) {
        elements.push({
          tag: 'markdown',
          content: `*还有 ${report.content.keyWork.length - 10} 项工作未展示，查看详情可点击来源链接*`,
        });
      }

      elements.push({ tag: 'hr' });
    }

    // 项目进展
    if (report.content.projectProgress.length > 0) {
      elements.push({
        tag: 'markdown',
        content: '**🚀 项目进展**',
      });

      report.content.projectProgress.forEach((project) => {
        elements.push({
          tag: 'markdown',
          content: `**${project.projectName}**\n${project.progress}`,
        });

        if (project.tasks.length > 0) {
          const taskList = project.tasks.slice(0, 3).map(task =>
            `- [${task.title}](${task.url}) (${task.status})`
          ).join('\n');

          elements.push({
            tag: 'markdown',
            content: `相关任务：\n${taskList}`,
          });
        }
      });

      elements.push({ tag: 'hr' });
    }

    // 待跟进事项
    if (report.content.pendingItems.length > 0) {
      elements.push({
        tag: 'markdown',
        content: '**⏳ 待跟进事项**',
      });

      report.content.pendingItems.forEach((item, index) => {
        const deadline = item.deadline ? `⏰ 截止时间：${dayjs(item.deadline).format('YYYY-MM-DD')}` : '';
        elements.push({
          tag: 'markdown',
          content: `${index + 1}. **[${item.content}](${item.sourceUrl})**\n   👤 负责人：${item.assignee} ${deadline}`,
        });
      });

      elements.push({ tag: 'hr' });
    }

    // 风险预警
    if (report.content.riskWarnings.length > 0) {
      elements.push({
        tag: 'markdown',
        content: '**⚠️ 风险预警**',
      });

      report.content.riskWarnings.forEach((risk, index) => {
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
        content: '**📅 下周计划**',
      });

      report.content.nextWeekPlan.forEach((plan, index) => {
        elements.push({
          tag: 'markdown',
          content: `${index + 1}. ${plan.content}\n   👤 负责人：${plan.responsible}`,
        });
      });

      elements.push({ tag: 'hr' });
    }

    // 页脚信息
    elements.push({
      tag: 'note',
      elements: [
        {
          tag: 'plain_text',
          content: `🤖 本报告由 SmartFlow 自动生成于 ${generateTime} | 所有内容均来自飞书原始数据`,
        },
      ],
    });

    // 交互按钮
    const actions = [
      {
        tag: 'button',
        text: {
          tag: 'plain_text',
          content: '查看所有来源',
        },
        type: 'default',
        multi_url: {
          url: 'https://github.com/your-repo/smartflow', // TODO: 替换为实际的详情页链接
          pc_url: 'https://github.com/your-repo/smartflow',
          android_url: 'https://github.com/your-repo/smartflow',
          ios_url: 'https://github.com/your-repo/smartflow',
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
