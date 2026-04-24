import * as schedule from 'node-schedule';
import dayjs from 'dayjs';
import { TeamConfigService } from '../config/team-config.service';
import { FeishuCollectorService } from '../collector/feishu-collector.service';
import { ReportGeneratorService } from '../generator/report-generator.service';
import { FeishuPushService } from '../push/feishu-push.service';
import { SQLiteDatabase } from '../../common/db/sqlite';
import { Logger } from '../../common/logger/logger';
import { TeamConfig } from '../../types';

const logger = Logger.getInstance();

interface ScheduledJob {
  teamId: string;
  job: schedule.Job;
  cronExpression: string;
}

/**
 * 定时任务调度服务
 */
export class SchedulerService {
  private static instance: SchedulerService;
  private jobs: Map<string, ScheduledJob> = new Map();
  private configService: TeamConfigService;
  private collectorService: FeishuCollectorService;
  private generatorService: ReportGeneratorService;
  private db: SQLiteDatabase;
  private isRunning: boolean = false;

  private constructor() {
    this.configService = TeamConfigService.getInstance();
    this.collectorService = new FeishuCollectorService();
    this.generatorService = new ReportGeneratorService();
    this.db = SQLiteDatabase.getInstance();
  }

  public static getInstance(): SchedulerService {
    if (!SchedulerService.instance) {
      SchedulerService.instance = new SchedulerService();
    }
    return SchedulerService.instance;
  }

  /**
   * 启动定时任务服务
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('定时任务服务已经在运行中');
      return;
    }

    logger.info('启动定时任务服务');

    // 加载所有团队配置
    const teamConfigs = await this.configService.loadAllTeamConfigs();

    // 为每个启用了推送的团队创建定时任务
    for (const teamConfig of teamConfigs) {
      if (teamConfig.push.enabled && teamConfig.push.cronExpression) {
        await this.scheduleJob(teamConfig);
      }
    }

    this.isRunning = true;
    logger.info(`定时任务服务启动完成，共加载 ${this.jobs.size} 个任务`);
  }

  /**
   * 停止定时任务服务
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('定时任务服务未运行');
      return;
    }

    logger.info('停止定时任务服务');

    // 取消所有任务
    this.jobs.forEach(job => {
      job.job.cancel();
    });
    this.jobs.clear();

    this.isRunning = false;
    logger.info('定时任务服务已停止');
  }

  /**
   * 为团队创建定时任务
   */
  async scheduleJob(teamConfig: TeamConfig): Promise<void> {
    // 如果已有相同团队的任务，先取消
    if (this.jobs.has(teamConfig.teamId)) {
      this.cancelJob(teamConfig.teamId);
    }

    try {
      // 验证cron表达式
      if (!schedule.cancelJob(teamConfig.teamId)) {
        try {
          // 尝试解析cron表达式来验证
          const testJob = schedule.scheduleJob(teamConfig.push.cronExpression, () => {});
          if (testJob) {
            testJob.cancel();
          }
        } catch (error) {
          logger.error('无效的cron表达式', {
            teamId: teamConfig.teamId,
            cron: teamConfig.push.cronExpression,
          });
          return;
        }
      }

      // 创建任务
      const job = schedule.scheduleJob(
        teamConfig.teamId,
        teamConfig.push.cronExpression,
        async () => {
          logger.info('触发定时任务', {
            teamId: teamConfig.teamId,
            cron: teamConfig.push.cronExpression,
          });
          await this.executeJob(teamConfig);
        }
      );

      if (!job) {
        logger.error('创建定时任务失败', { teamId: teamConfig.teamId });
        return;
      }

      this.jobs.set(teamConfig.teamId, {
        teamId: teamConfig.teamId,
        job,
        cronExpression: teamConfig.push.cronExpression,
      });

      // 保存到数据库
      this.upsertScheduledTask(teamConfig);

      const nextRun = job.nextInvocation();
      logger.info('定时任务已创建', {
        teamId: teamConfig.teamId,
        cron: teamConfig.push.cronExpression,
        nextRun: nextRun ? nextRun.toString() : '未知',
      });
    } catch (error) {
      logger.error('创建定时任务失败', {
        teamId: teamConfig.teamId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * 取消团队的定时任务
   */
  cancelJob(teamId: string): void {
    const job = this.jobs.get(teamId);
    if (job) {
      job.job.cancel();
      this.jobs.delete(teamId);

      // 更新数据库
      this.db.run(
        'UPDATE scheduled_tasks SET enabled = 0 WHERE team_id = ?',
        [teamId]
      );

      logger.info('定时任务已取消', { teamId });
    }
  }

  /**
   * 手动触发任务执行
   */
  async triggerJob(teamId: string): Promise<void> {
    const teamConfig = await this.configService.getTeamConfig(teamId);
    await this.executeJob(teamConfig);
  }

  /**
   * 获取所有定时任务状态
   */
  getJobStatuses(): Array<{
    teamId: string;
    cronExpression: string;
    enabled: boolean;
    nextRun?: string;
    lastRun?: string;
  }> {
    const statuses: any[] = [];

    // 从数据库获取所有任务
    const dbTasks = this.db.query('SELECT * FROM scheduled_tasks');

    for (const task of dbTasks) {
      const job = this.jobs.get(task.team_id);
      statuses.push({
        teamId: task.team_id,
        cronExpression: task.cron_expression,
        enabled: task.enabled === 1,
        nextRun: job?.job.nextInvocation()?.toString(),
        lastRun: task.last_run_at,
      });
    }

    return statuses;
  }

  /**
   * 执行任务
   */
  private async executeJob(teamConfig: TeamConfig): Promise<void> {
    const logId = this.startExecutionLog(teamConfig.teamId, 'weekly_report');

    try {
      logger.info('开始执行周报生成任务', { teamId: teamConfig.teamId });

      // 1. 解析时间范围（根据配置的周期）
      let timeRangeStr: string;
      switch (teamConfig.generate.cycle) {
        case 'weekly':
          timeRangeStr = 'lastweek';
          break;
        case 'biweekly':
          // 过去两周
          const twoWeeksAgo = dayjs().subtract(2, 'week').startOf('week').format('YYYY-MM-DD');
          const lastWeekEnd = dayjs().subtract(1, 'week').endOf('week').format('YYYY-MM-DD');
          timeRangeStr = `${twoWeeksAgo}~${lastWeekEnd}`;
          break;
        case 'monthly':
          timeRangeStr = 'lastmonth';
          break;
        default:
          timeRangeStr = 'lastweek';
      }

      const timeRange = this.collectorService.parseTimeRange(timeRangeStr);

      // 2. 采集数据
      const collectedData = await this.collectorService.collect(teamConfig, timeRange);

      // 3. 生成周报
      const report = await this.generatorService.generate(collectedData, teamConfig);

      // 4. 保存到数据库
      const reportId = this.saveReport(report);

      // 5. 推送
      const pushService = new FeishuPushService(teamConfig);
      const pushResult = await pushService.pushWeeklyReport(report);

      // 保存推送记录
      this.savePushRecords(reportId, pushResult);

      // 更新任务最后运行时间
      this.updateTaskLastRunTime(teamConfig.teamId);

      // 更新执行日志
      this.finishExecutionLog(logId, 'success');

      logger.info('周报任务执行完成', {
        teamId: teamConfig.teamId,
        reportId,
        pushStatus: pushResult.status,
      });
    } catch (error) {
      logger.error('周报任务执行失败', {
        teamId: teamConfig.teamId,
        error: (error as Error).message,
      });

      // 更新执行日志
      this.finishExecutionLog(logId, 'failed', (error as Error).message);

      // 推送错误通知
      try {
        const pushService = new FeishuPushService(teamConfig);
        await pushService.pushErrorNotification(error as Error);
      } catch (pushError) {
        logger.error('推送错误通知失败', { error: (pushError as Error).message });
      }
    }
  }

  /**
   * 插入或更新定时任务到数据库
   */
  private upsertScheduledTask(teamConfig: TeamConfig): void {
    const existing = this.db.queryOne(
      'SELECT id FROM scheduled_tasks WHERE team_id = ?',
      [teamConfig.teamId]
    );

    if (existing) {
      this.db.run(
        `UPDATE scheduled_tasks
         SET cron_expression = ?, enabled = 1, updated_at = CURRENT_TIMESTAMP
         WHERE team_id = ?`,
        [teamConfig.push.cronExpression, teamConfig.teamId]
      );
    } else {
      this.db.run(
        `INSERT INTO scheduled_tasks (team_id, cron_expression, enabled)
         VALUES (?, ?, 1)`,
        [teamConfig.teamId, teamConfig.push.cronExpression]
      );
    }
  }

  /**
   * 更新任务最后运行时间
   */
  private updateTaskLastRunTime(teamId: string): void {
    this.db.run(
      'UPDATE scheduled_tasks SET last_run_at = CURRENT_TIMESTAMP WHERE team_id = ?',
      [teamId]
    );
  }

  /**
   * 保存报告到数据库
   */
  private saveReport(report: any): number {
    const result = this.db.run(
      `INSERT INTO reports (team_id, time_range_start, time_range_end, content_json, sources_json)
       VALUES (?, ?, ?, ?, ?)`,
      [
        report.teamId,
        report.timeRange.start.toISOString(),
        report.timeRange.end.toISOString(),
        JSON.stringify(report.content),
        JSON.stringify(report.sources),
      ]
    );
    return result.lastInsertRowid as number;
  }

  /**
   * 保存推送记录
   */
  private savePushRecords(reportId: number, pushResult: any): void {
    if (!pushResult.results) return;

    for (const result of pushResult.results) {
      this.db.run(
        `INSERT INTO push_records (report_id, channel_type, channel_id, status, message_id, error_message)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          reportId,
          result.channelType,
          result.channelId,
          result.success ? 'success' : 'failed',
          result.messageId || null,
          result.error || null,
        ]
      );
    }
  }

  /**
   * 开始执行日志
   */
  private startExecutionLog(teamId: string, taskType: string): number {
    const result = this.db.run(
      `INSERT INTO execution_logs (team_id, task_type, status)
       VALUES (?, ?, 'running')`,
      [teamId, taskType]
    );
    return result.lastInsertRowid as number;
  }

  /**
   * 完成执行日志
   */
  private finishExecutionLog(logId: number, status: 'success' | 'failed', errorMessage?: string): void {
    this.db.run(
      `UPDATE execution_logs
       SET status = ?, error_message = ?, finished_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, errorMessage || null, logId]
    );
  }
}
