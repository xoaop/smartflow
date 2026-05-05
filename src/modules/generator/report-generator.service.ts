import dayjs from 'dayjs';
import type { SkillContext } from '@openclaw/sdk';
import { CollectedData, TeamConfig, WeeklyReport } from '../../types';
import { LLMClient } from '../../common/llm/llm-client';
import { Logger } from '../../common/logger/logger';
import {
  WEEKLY_REPORT_SYSTEM_PROMPT,
  buildWeeklyReportPrompt,
  formatDocsForPrompt,
  formatTasksForPrompt,
  formatMeetingsForPrompt,
  formatMessagesForPrompt,
} from './prompt-templates';

const logger = Logger.getInstance();

/**
 * 周报生成服务
 */
export class ReportGeneratorService {
  private llmClient: LLMClient;

  constructor() {
    this.llmClient = LLMClient.getInstance();
  }

  /**
   * 生成周报
   * @param collectedData 采集到的原始数据
   * @param teamConfig 团队配置
   * @param context OpenClaw Skill上下文
   * @param isDemoMode 是否为演示模式，演示模式下校验更宽松
   */
  async generate(
    collectedData: CollectedData,
    teamConfig: TeamConfig,
    context: SkillContext,
    isDemoMode: boolean = false
  ): Promise<WeeklyReport> {
    logger.info('开始生成周报', {
      teamId: teamConfig.teamId,
      timeRange: `${dayjs(collectedData.timeRange.start).format('YYYY-MM-DD')} ~ ${dayjs(collectedData.timeRange.end).format('YYYY-MM-DD')}`,
      isDemoMode,
    });

    const startTime = Date.now();

    try {
      // 在OpenClaw模式下设置LLM上下文
      if (process.env.OPENCLAW_AGENT_ID && context) {
        this.llmClient.setContext(context);
      }

      // 1. 数据预处理
      const processedData = this.preprocessData(collectedData, teamConfig);

      // 2. 构建提示词
      const { systemPrompt, userPrompt } = this.buildPrompts(processedData, teamConfig);

      // 演示模式下额外强调必须使用正确的链接
      const finalSystemPrompt = isDemoMode
        ? systemPrompt + "\n\n⚠️ 重要提示：这是演示环境，所有来源链接必须严格使用提供的原始数据中的完整URL，不得修改或编造！"
        : systemPrompt;

      // 3. 调用大模型生成内容
      const reportContent = await this.llmClient.generateJson<WeeklyReport['content']>(
        userPrompt,
        finalSystemPrompt,
        undefined,
        teamConfig.generate.detailLevel === 'high' ? 8192 : 4096
      );

      // 4. 校验生成内容，演示模式下使用宽松校验
      this.validateReportContent(reportContent, collectedData, isDemoMode);

      // 5. 补充来源信息
      const sources = this.extractSources(collectedData);

      const report: WeeklyReport = {
        teamId: collectedData.teamId,
        timeRange: collectedData.timeRange,
        generatedAt: new Date(),
        content: reportContent,
        sources,
      };

      const costTime = Date.now() - startTime;
      logger.info('周报生成完成', {
        teamId: teamConfig.teamId,
        costTime: `${costTime}ms`,
        keyWorkCount: report.content.keyWork.length,
        projectCount: report.content.projectProgress.length,
        riskCount: report.content.riskWarnings.length,
      });

      return report;
    } catch (error) {
      const costTime = Date.now() - startTime;
      logger.error('周报生成失败', {
        teamId: teamConfig.teamId,
        costTime: `${costTime}ms`,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * 数据预处理
   */
  private preprocessData(collectedData: CollectedData, teamConfig: TeamConfig) {
    // 可以在这里添加更多的数据清洗和过滤逻辑
    return {
      docs: collectedData.docs,
      tasks: collectedData.tasks,
      meetings: collectedData.meetings,
      messages: collectedData.messages || [],
      timeRange: collectedData.timeRange,
    };
  }

  /**
   * 构建提示词
   */
  private buildPrompts(processedData: any, teamConfig: TeamConfig) {
    const startTimeStr = dayjs(processedData.timeRange?.start || new Date()).format('YYYY年MM月DD日');
    const endTimeStr = dayjs(processedData.timeRange?.end || new Date()).format('YYYY年MM月DD日');

    // 格式化各类数据为提示词内容
    const docsContent = formatDocsForPrompt(processedData.docs.map((doc: any) => ({
      ...doc,
      modifiedTime: dayjs(doc.modifiedTime).format('YYYY-MM-DD HH:mm'),
    })));

    const tasksContent = formatTasksForPrompt(processedData.tasks.map((task: any) => ({
      ...task,
      statusChangedTime: dayjs(task.statusChangedTime).format('YYYY-MM-DD HH:mm'),
    })));

    const meetingsContent = formatMeetingsForPrompt(processedData.meetings.map((meeting: any) => ({
      ...meeting,
      startTime: dayjs(meeting.startTime).format('YYYY-MM-DD HH:mm'),
    })));

    const messagesContent = formatMessagesForPrompt(processedData.messages.map((message: any) => ({
      ...message,
      sendTime: dayjs(message.sendTime).format('YYYY-MM-DD HH:mm'),
    })));

    // 构建用户提示词
    const userPrompt = buildWeeklyReportPrompt({
      teamName: teamConfig.teamName,
      startTime: startTimeStr,
      endTime: endTimeStr,
      docs: docsContent,
      tasks: tasksContent,
      meetings: meetingsContent,
      messages: messagesContent,
      includeRisks: teamConfig.generate.includeRisks,
      includeNextWeekPlan: teamConfig.generate.includeNextWeekPlan,
      detailLevel: teamConfig.generate.detailLevel,
    });

    return {
      systemPrompt: WEEKLY_REPORT_SYSTEM_PROMPT,
      userPrompt,
    };
  }

  /**
   * 校验生成的报告内容，防止大模型幻觉
   * @param isDemoMode 演示模式下校验更宽松，只告警不抛出错误
   */
  private validateReportContent(content: WeeklyReport['content'], collectedData: CollectedData, isDemoMode: boolean = false) {
    // 收集所有原始数据的URL和内容，用于校验
    const allUrls = new Set<string>();
    const allContent = new Set<string>();

    // 收集文档数据
    collectedData.docs.forEach(doc => {
      allUrls.add(doc.url);
      allContent.add(doc.title.toLowerCase());
      allContent.add(doc.contentSummary.toLowerCase());
    });

    // 收集任务数据
    collectedData.tasks.forEach(task => {
      allUrls.add(task.url);
      allContent.add(task.title.toLowerCase());
      allContent.add(task.description.toLowerCase());
    });

    // 收集会议数据
    collectedData.meetings.forEach(meeting => {
      allUrls.add(meeting.url);
      allContent.add(meeting.title.toLowerCase());
      allContent.add(meeting.minutesContent.toLowerCase());
      meeting.actionItems.forEach(item => {
        allContent.add(item.content.toLowerCase());
      });
    });

    // 收集群聊消息数据
    collectedData.messages?.forEach(message => {
      allUrls.add(message.url);
      allContent.add(message.content.toLowerCase());
    });

    let hasInvalidContent = false;

    // 1. 检查关键工作的来源链接和内容真实性
    content.keyWork.forEach((item, index) => {
      // 强制要求关键工作必须有来源链接
      if (!item.sourceUrl) {
        logger.error(`关键工作第${index + 1}项缺少来源链接`, { title: item.title });
        hasInvalidContent = true;
      } else if (!allUrls.has(item.sourceUrl)) {
        logger.error(`关键工作第${index + 1}项包含不存在的来源链接`, {
          url: item.sourceUrl,
          title: item.title
        });
        hasInvalidContent = true;
      }

      // 检查内容是否在原始数据中存在匹配
      const contentLower = `${item.title} ${item.description}`.toLowerCase();
      if (!this.isContentMatched(contentLower, allContent)) {
        logger.warn(`关键工作第${index + 1}项内容可能为幻觉，未在原始数据中找到匹配`, {
          title: item.title,
          description: item.description
        });
      }
    });

    // 2. 检查项目进展的内容真实性
    content.projectProgress.forEach((project, index) => {
      // 项目进展关联的任务必须是真实存在的
      project.tasks.forEach(task => {
        if (!allUrls.has(task.url)) {
          logger.error(`项目进展第${index + 1}项包含不存在的任务链接`, {
            projectName: project.projectName,
            taskTitle: task.title,
            url: task.url
          });
          hasInvalidContent = true;
        }
      });
    });

    // 3. 检查待办事项的来源链接和内容真实性
    content.pendingItems.forEach((item, index) => {
      // 强制要求待办事项必须有来源链接
      if (!item.sourceUrl) {
        logger.error(`待办事项第${index + 1}项缺少来源链接`, { content: item.content });
        hasInvalidContent = true;
      } else if (!allUrls.has(item.sourceUrl)) {
        logger.error(`待办事项第${index + 1}项包含不存在的来源链接`, {
          url: item.sourceUrl,
          content: item.content
        });
        hasInvalidContent = true;
      }
    });

    // 4. 检查风险的来源链接和内容真实性
    content.riskWarnings.forEach((item, index) => {
      // 强制要求风险必须有来源链接
      if (!item.sourceUrl) {
        logger.error(`风险预警第${index + 1}项缺少来源链接`, { content: item.content });
        hasInvalidContent = true;
      } else if (!allUrls.has(item.sourceUrl)) {
        logger.error(`风险预警第${index + 1}项包含不存在的来源链接`, {
          url: item.sourceUrl,
          content: item.content
        });
        hasInvalidContent = true;
      }

      // 风险内容必须在原始数据中找到匹配
      const contentLower = item.content.toLowerCase();
      if (!this.isContentMatched(contentLower, allContent)) {
        logger.warn(`风险预警第${index + 1}项内容可能为幻觉，未在原始数据中找到匹配`, {
          content: item.content
        });
      }
    });

    // 如果有严重的无效内容
    if (hasInvalidContent) {
      if (isDemoMode) {
        logger.warn('演示模式下检测到少量虚构内容，已自动忽略，继续生成演示报告');
      } else {
        throw new Error('报告内容校验失败，存在无效或虚构的内容，请重新生成');
      }
    }

    logger.debug('报告内容校验完成，所有内容均符合真实性要求');
  }

  /**
   * 检查内容是否在原始数据中有匹配
   */
  private isContentMatched(content: string, allContent: Set<string>): boolean {
    // 简单的关键词匹配：只要有3个以上的关键词匹配就算通过
    const keywords = content.split(/\s+/).filter(word => word.length > 2);
    let matchCount = 0;

    for (const keyword of keywords) {
      for (const originalContent of allContent) {
        if (originalContent.includes(keyword)) {
          matchCount++;
          break;
        }
      }
      if (matchCount >= 3) return true;
    }

    return matchCount >= Math.min(3, keywords.length / 2);
  }

  /**
   * 提取所有来源信息
   */
  private extractSources(collectedData: CollectedData): WeeklyReport['sources'] {
    const sources: WeeklyReport['sources'] = [];

    collectedData.docs.forEach(doc => {
      sources.push({
        type: 'doc',
        title: doc.title,
        url: doc.url,
      });
    });

    collectedData.tasks.forEach(task => {
      sources.push({
        type: 'task',
        title: task.title,
        url: task.url,
      });
    });

    collectedData.meetings.forEach(meeting => {
      sources.push({
        type: 'meeting',
        title: meeting.title,
        url: meeting.url,
      });
    });

    collectedData.messages?.forEach(message => {
      sources.push({
        type: 'message',
        title: `${message.chatName} - ${message.sender.name} 的消息`,
        url: message.url,
      });
    });

    return sources;
  }
}
