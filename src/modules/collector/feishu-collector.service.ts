import { IDataCollector } from './collector.interface';
import { DocCollector } from './doc-collector';
import { TaskCollector } from './task-collector';
import { MeetingCollector } from './meeting-collector';
import { CollectedData, TeamConfig, TimeRange } from '../../types';
import { Logger } from '../../common/logger/logger';
import * as dayjs from 'dayjs';

const logger = Logger.getInstance();

/**
 * 飞书数据采集主服务
 */
export class FeishuCollectorService implements IDataCollector {
  /**
   * 采集指定团队在指定时间范围内的所有数据
   */
  async collect(teamConfig: TeamConfig, timeRange: TimeRange): Promise<CollectedData> {
    logger.info('开始数据采集', {
      teamId: teamConfig.teamId,
      teamName: teamConfig.teamName,
      startTime: dayjs(timeRange.start).format('YYYY-MM-DD HH:mm:ss'),
      endTime: dayjs(timeRange.end).format('YYYY-MM-DD HH:mm:ss'),
    });

    const startTime = Date.now();

    try {
      // 并行采集三类数据
      const [docs, tasks, meetings] = await Promise.all([
        this.collectDocs(teamConfig, timeRange),
        this.collectTasks(teamConfig, timeRange),
        this.collectMeetings(teamConfig, timeRange),
      ]);

      const collectedData: CollectedData = {
        teamId: teamConfig.teamId,
        timeRange,
        collectedAt: new Date(),
        docs,
        tasks,
        meetings,
      };

      const costTime = Date.now() - startTime;
      logger.info('数据采集完成', {
        teamId: teamConfig.teamId,
        costTime: `${costTime}ms`,
        docCount: docs.length,
        taskCount: tasks.length,
        meetingCount: meetings.length,
      });

      return collectedData;
    } catch (error) {
      const costTime = Date.now() - startTime;
      logger.error('数据采集失败', {
        teamId: teamConfig.teamId,
        costTime: `${costTime}ms`,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * 采集文档数据
   */
  private async collectDocs(teamConfig: TeamConfig, timeRange: TimeRange) {
    try {
      const docCollector = new DocCollector(teamConfig);
      return await docCollector.collect(teamConfig, timeRange);
    } catch (error) {
      logger.error('文档采集失败，跳过该数据源', {
        teamId: teamConfig.teamId,
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * 采集任务数据
   */
  private async collectTasks(teamConfig: TeamConfig, timeRange: TimeRange) {
    try {
      const taskCollector = new TaskCollector(teamConfig);
      return await taskCollector.collect(teamConfig, timeRange);
    } catch (error) {
      logger.error('任务采集失败，跳过该数据源', {
        teamId: teamConfig.teamId,
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * 采集会议数据
   */
  private async collectMeetings(teamConfig: TeamConfig, timeRange: TimeRange) {
    try {
      const meetingCollector = new MeetingCollector(teamConfig);
      return await meetingCollector.collect(teamConfig, timeRange);
    } catch (error) {
      logger.error('会议采集失败，跳过该数据源', {
        teamId: teamConfig.teamId,
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * 解析时间范围参数
   * @param range 时间范围字符串，支持：lastweek, thisweek, lastmonth, thismonth, 或自定义如 2024-01-01~2024-01-07
   */
  public parseTimeRange(range: string): TimeRange {
    const now = dayjs();

    switch (range.toLowerCase()) {
      case 'lastweek':
        // 上周一到上周日
        const lastMonday = now.subtract(1, 'week').startOf('week');
        const lastSunday = now.subtract(1, 'week').endOf('week');
        return {
          start: lastMonday.toDate(),
          end: lastSunday.toDate(),
        };

      case 'thisweek':
        // 本周一到现在
        const thisMonday = now.startOf('week');
        return {
          start: thisMonday.toDate(),
          end: now.toDate(),
        };

      case 'lastmonth':
        // 上个月第一天到最后一天
        const lastMonthStart = now.subtract(1, 'month').startOf('month');
        const lastMonthEnd = now.subtract(1, 'month').endOf('month');
        return {
          start: lastMonthStart.toDate(),
          end: lastMonthEnd.toDate(),
        };

      case 'thismonth':
        // 本月第一天到现在
        const thisMonthStart = now.startOf('month');
        return {
          start: thisMonthStart.toDate(),
          end: now.toDate(),
        };

      default:
        // 自定义时间范围，格式：YYYY-MM-DD~YYYY-MM-DD
        const [startStr, endStr] = range.split('~');
        if (startStr && endStr) {
          const start = dayjs(startStr.trim()).startOf('day');
          const end = dayjs(endStr.trim()).endOf('day');
          if (start.isValid() && end.isValid()) {
            return {
              start: start.toDate(),
              end: end.toDate(),
            };
          }
        }

        throw new Error(`不支持的时间范围格式: ${range}，请使用 lastweek/thisweek/lastmonth/thismonth 或 YYYY-MM-DD~YYYY-MM-DD 格式`);
    }
  }
}
