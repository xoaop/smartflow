import * as dayjs from 'dayjs';
import { CollectedData, TeamConfig, WeeklyReport } from '../../types';
import { ClaudeClient } from '../../common/llm/claude-client';
import { Logger } from '../../common/logger/logger';
import {
  WEEKLY_REPORT_SYSTEM_PROMPT,
  buildWeeklyReportPrompt,
  formatDocsForPrompt,
  formatTasksForPrompt,
  formatMeetingsForPrompt,
} from './prompt-templates';

const logger = Logger.getInstance();

/**
 * 周报生成服务
 */
export class ReportGeneratorService {
  private claudeClient: ClaudeClient;

  constructor() {
    this.claudeClient = ClaudeClient.getInstance();
  }

  /**
   * 生成周报
   * @param collectedData 采集到的原始数据
   * @param teamConfig 团队配置
   */
  async generate(collectedData: CollectedData, teamConfig: TeamConfig): Promise<WeeklyReport> {
    logger.info('开始生成周报', {
      teamId: teamConfig.teamId,
      timeRange: `${dayjs(collectedData.timeRange.start).format('YYYY-MM-DD')} ~ ${dayjs(collectedData.timeRange.end).format('YYYY-MM-DD')}`,
    });

    const startTime = Date.now();

    try {
      // 1. 数据预处理
      const processedData = this.preprocessData(collectedData, teamConfig);

      // 2. 构建提示词
      const { systemPrompt, userPrompt } = this.buildPrompts(processedData, teamConfig);

      // 3. 调用大模型生成内容
      const reportContent = await this.claudeClient.generateJson<WeeklyReport['content']>(
        userPrompt,
        systemPrompt,
        undefined,
        teamConfig.generate.detailLevel === 'high' ? 8192 : 4096
      );

      // 4. 校验生成内容
      this.validateReportContent(reportContent, collectedData);

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

    // 构建用户提示词
    const userPrompt = buildWeeklyReportPrompt({
      teamName: teamConfig.teamName,
      startTime: startTimeStr,
      endTime: endTimeStr,
      docs: docsContent,
      tasks: tasksContent,
      meetings: meetingsContent,
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
   * 校验生成的报告内容
   */
  private validateReportContent(content: WeeklyReport['content'], collectedData: CollectedData) {
    // 校验所有链接都在原始数据中存在，防止幻觉
    const allUrls = new Set<string>();
    collectedData.docs.forEach(doc => allUrls.add(doc.url));
    collectedData.tasks.forEach(task => allUrls.add(task.url));
    collectedData.meetings.forEach(meeting => allUrls.add(meeting.url));

    // 检查关键工作的来源链接
    content.keyWork.forEach(item => {
      if (item.sourceUrl && !allUrls.has(item.sourceUrl)) {
        logger.warn('生成的内容包含不存在的来源链接', { url: item.sourceUrl, title: item.title });
        // 可以选择删除无效链接或抛出错误
      }
    });

    // 检查待办事项的来源链接
    content.pendingItems.forEach(item => {
      if (item.sourceUrl && !allUrls.has(item.sourceUrl)) {
        logger.warn('生成的待办事项包含不存在的来源链接', { url: item.sourceUrl, content: item.content });
      }
    });

    // 检查风险的来源链接
    content.riskWarnings.forEach(item => {
      if (item.sourceUrl && !allUrls.has(item.sourceUrl)) {
        logger.warn('生成的风险包含不存在的来源链接', { url: item.sourceUrl, content: item.content });
      }
    });

    logger.debug('报告内容校验完成');
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

    return sources;
  }
}
