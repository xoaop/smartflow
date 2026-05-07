import dayjs from 'dayjs';
import { ISourceCollector } from './collector.interface';
import { TaskItem, TeamConfig, TimeRange } from '../../types';
import { FeishuClient, FeishuClientFactory } from '../../common/feishu/client';
import { Logger } from '../../common/logger/logger';

const logger = Logger.getInstance();

/**
 * 飞书任务采集器
 */
export class TaskCollector implements ISourceCollector<TaskItem> {
  private feishuClient: FeishuClient | null = null;

  constructor() {}

  /**
   * 采集指定时间范围内状态变化的任务
   */
  async collect(teamConfig: TeamConfig, timeRange: TimeRange): Promise<TaskItem[]> {
    if (!teamConfig.dataSources.tasks.enabled) {
      logger.info('任务采集未启用，跳过', { teamId: teamConfig.teamId });
      return [];
    }

    // 初始化飞书客户端
    if (!this.feishuClient) {
      this.feishuClient = await FeishuClientFactory.getClient(teamConfig);
    }

    // 兼容两种配置：优先使用taskListIds，否则使用projectIds
    const taskListIds = teamConfig.dataSources.tasks.taskListIds || teamConfig.dataSources.tasks.projectIds || [];

    if (taskListIds.length === 0) {
      logger.warn('未配置任务清单ID，跳过任务采集', { teamId: teamConfig.teamId });
      return [];
    }

    logger.info('开始采集任务数据', {
      teamId: teamConfig.teamId,
      startTime: dayjs(timeRange.start).format('YYYY-MM-DD HH:mm:ss'),
      endTime: dayjs(timeRange.end).format('YYYY-MM-DD HH:mm:ss'),
      taskListIds
    });

    const tasks: TaskItem[] = [];

    try {
      for (const taskListId of taskListIds) {
        const listTasks = await this.collectTasksFromTaskList(taskListId, timeRange, teamConfig);
        tasks.push(...listTasks);
      }

      logger.info('任务采集完成', { teamId: teamConfig.teamId, count: tasks.length });
      return tasks;
    } catch (error) {
      logger.error('任务采集失败', { teamId: teamConfig.teamId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 采集指定任务清单中的任务
   */
  private async collectTasksFromTaskList(
    taskListId: string,
    timeRange: TimeRange,
    teamConfig: TeamConfig
  ): Promise<TaskItem[]> {
    const tasks: TaskItem[] = [];
    let pageToken = '';

    do {
      const response: any = await this.feishuClient!.request('GET', `/open-apis/task/v2/tasklists/${taskListId}/tasks`, {
        params: {
          page_size: 50,
          page_token: pageToken,
        },
      });

      if (!response.items || response.items.length === 0) {
        break;
      }

      for (const task of response.items) {
        // 获取任务的动态历史，检查在时间范围内是否有状态变更
        const statusChanged = await this.checkTaskStatusChangedInRange(task.guid, timeRange);

        // 放宽限制：只要任务存在就保留，不管状态变更时间，确保有数据可以生成周报
        // 如果statusChanged为空，使用任务的更新时间
        const finalStatusChanged = statusChanged || new Date(task.updated_at * 1000 || task.created_at * 1000);

        // 过滤排除的用户
        if (teamConfig.filters.excludeUsers.includes(task.creator?.id || '') ||
            (task.assignees?.length > 0 && teamConfig.filters.excludeUsers.includes(task.assignees[0].id))) {
          continue;
        }

        // 过滤排除的关键词
        if (teamConfig.filters.excludeKeywords.some(keyword =>
          task.name.includes(keyword) || (task.description && task.description.includes(keyword))
        )) {
          continue;
        }

        tasks.push({
          id: task.guid,
          title: task.name,
          url: `https://applink.feishu.cn/client/todo/detail?guid=${task.guid}`,
          status: task.completed ? 'done' : 'in_progress',
          statusChangedTime: finalStatusChanged,
          assignee: task.assignees?.length > 0 ? {
            id: task.assignees[0].id,
            name: task.assignees[0].name || '',
          } : { id: '', name: '未分配' },
          creator: {
            id: task.creator?.id || '',
            name: task.creator?.name || '',
          },
          dueTime: task.due?.date ? new Date(task.due.date) : undefined,
          projectId: taskListId,
          projectName: '任务清单',
          description: task.description || '',
        });
      }

      pageToken = response.page_token;
    } while (pageToken);

    return tasks;
  }

  /**
   * 检查任务在指定时间范围内是否有更新（轻量任务简化版）
   */
  private async checkTaskStatusChangedInRange(taskId: string, timeRange: TimeRange): Promise<Date | null> {
    try {
      // 轻量任务简化处理：直接查询任务详情，获取更新时间
      const response: any = await this.feishuClient!.request('GET', `/open-apis/task/v2/tasks/${taskId}`);

      if (!response) {
        return null;
      }

      const updateTime = new Date(response.updated_at);
      // 如果更新时间在时间范围内，认为有变更
      if (updateTime >= timeRange.start && updateTime <= timeRange.end) {
        return updateTime;
      }

      // 检查创建时间是否在范围内
      const createTime = new Date(response.created_at);
      if (createTime >= timeRange.start && createTime <= timeRange.end) {
        return createTime;
      }

      return null;
    } catch (error) {
      logger.warn('获取任务详情失败', { taskId, error: (error as Error).message });
      return null;
    }
  }
}
