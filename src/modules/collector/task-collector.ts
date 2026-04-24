import * as dayjs from 'dayjs';
import { ISourceCollector } from './collector.interface';
import { TaskItem, TeamConfig, TimeRange } from '../../types';
import { FeishuClient, FeishuClientFactory } from '../../common/feishu/client';
import { Logger } from '../../common/logger/logger';

const logger = Logger.getInstance();

/**
 * 飞书任务采集器
 */
export class TaskCollector implements ISourceCollector<TaskItem> {
  private feishuClient: FeishuClient;

  constructor(teamConfig: TeamConfig) {
    this.feishuClient = FeishuClientFactory.getClient(teamConfig);
  }

  /**
   * 采集指定时间范围内状态变化的任务
   */
  async collect(teamConfig: TeamConfig, timeRange: TimeRange): Promise<TaskItem[]> {
    if (!teamConfig.dataSources.tasks.enabled) {
      logger.info('任务采集未启用，跳过', { teamId: teamConfig.teamId });
      return [];
    }

    if (teamConfig.dataSources.tasks.projectIds.length === 0) {
      logger.warn('未配置任务项目ID，跳过任务采集', { teamId: teamConfig.teamId });
      return [];
    }

    logger.info('开始采集任务数据', {
      teamId: teamConfig.teamId,
      startTime: dayjs(timeRange.start).format('YYYY-MM-DD HH:mm:ss'),
      endTime: dayjs(timeRange.end).format('YYYY-MM-DD HH:mm:ss'),
      projectIds: teamConfig.dataSources.tasks.projectIds
    });

    const tasks: TaskItem[] = [];

    try {
      for (const projectId of teamConfig.dataSources.tasks.projectIds) {
        const projectTasks = await this.collectTasksFromProject(projectId, timeRange, teamConfig);
        tasks.push(...projectTasks);
      }

      logger.info('任务采集完成', { teamId: teamConfig.teamId, count: tasks.length });
      return tasks;
    } catch (error) {
      logger.error('任务采集失败', { teamId: teamConfig.teamId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 采集指定项目中的任务
   */
  private async collectTasksFromProject(
    projectId: string,
    timeRange: TimeRange,
    teamConfig: TeamConfig
  ): Promise<TaskItem[]> {
    const tasks: TaskItem[] = [];
    let pageToken = '';

    do {
      const response: any = await this.feishuClient.request('GET', `/task/v2/tasks`, {
        params: {
          project_id: projectId,
          page_size: 100,
          page_token: pageToken,
        },
      });

      if (!response.items || response.items.length === 0) {
        break;
      }

      for (const task of response.items) {
        // 获取任务的动态历史，检查在时间范围内是否有状态变更
        const statusChanged = await this.checkTaskStatusChangedInRange(task.id, timeRange);

        if (!statusChanged) {
          continue;
        }

        // 过滤排除的用户
        if (teamConfig.filters.excludeUsers.includes(task.creator.id) ||
            (task.assignee && teamConfig.filters.excludeUsers.includes(task.assignee.id))) {
          continue;
        }

        // 过滤排除的关键词
        if (teamConfig.filters.excludeKeywords.some(keyword =>
          task.name.includes(keyword) || (task.description && task.description.includes(keyword))
        )) {
          continue;
        }

        tasks.push({
          id: task.id,
          title: task.name,
          url: `https://applink.feishu.cn/client/task/detail/${task.id}`,
          status: task.status,
          statusChangedTime: statusChanged,
          assignee: task.assignee ? {
            id: task.assignee.id,
            name: task.assignee.name || '',
          } : { id: '', name: '未分配' },
          creator: {
            id: task.creator.id,
            name: task.creator.name || '',
          },
          dueTime: task.due ? new Date(task.due) : undefined,
          projectId,
          projectName: task.project?.name || '',
          description: task.description || '',
        });
      }

      pageToken = response.page_token;
    } while (pageToken);

    return tasks;
  }

  /**
   * 检查任务在指定时间范围内是否有状态变更
   */
  private async checkTaskStatusChangedInRange(taskId: string, timeRange: TimeRange): Promise<Date | null> {
    try {
      let pageToken = '';
      do {
        const response: any = await this.feishuClient.request('GET', `/task/v2/tasks/${taskId}/activity_logs`, {
          params: {
            page_size: 100,
            page_token: pageToken,
          },
        });

        if (!response.items || response.items.length === 0) {
          break;
        }

        // 查找状态变更的记录
        for (const log of response.items) {
          if (log.field === 'status') {
            const changeTime = new Date(log.created_at);
            if (changeTime >= timeRange.start && changeTime <= timeRange.end) {
              return changeTime;
            }
          }
        }

        pageToken = response.page_token;
      } while (pageToken);

      return null;
    } catch (error) {
      logger.warn('获取任务动态失败', { taskId, error: (error as Error).message });
      return null;
    }
  }
}
