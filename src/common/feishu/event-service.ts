import express from 'express';
import bodyParser from 'body-parser';
import * as crypto from 'crypto';
import { TeamConfigService } from '../../modules/config/team-config.service';
import { FeishuPushService } from '../../modules/push/feishu-push.service';
import { SQLiteDatabase } from '../db/sqlite';
import { Logger } from '../logger/logger';
import { FeishuCardActionEvent, FeishuEventCallback, WeeklyReport } from '../../types';
import { FeishuCardBuilder } from '../../modules/push/card-builder';

const logger = Logger.getInstance();

/**
 * 飞书事件回调服务
 * 处理飞书卡片按钮点击等事件
 */
export class FeishuEventService {
  private static instance: FeishuEventService;
  private app: express.Express;
  private configService: TeamConfigService;
  private db: SQLiteDatabase;
  private server: any;

  private constructor() {
    this.configService = TeamConfigService.getInstance();
    this.db = SQLiteDatabase.getInstance();
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  public static getInstance(): FeishuEventService {
    if (!FeishuEventService.instance) {
      FeishuEventService.instance = new FeishuEventService();
    }
    return FeishuEventService.instance;
  }

  /**
   * 设置中间件
   */
  private setupMiddleware(): void {
    // 原始body解析用于签名验证
    this.app.use(bodyParser.json({
      verify: (req: express.Request & { rawBody?: Buffer }, res, buf) => {
        req.rawBody = buf;
      }
    }));
    this.app.use(bodyParser.urlencoded({ extended: true }));
  }

  /**
   * 设置路由
   */
  private setupRoutes(): void {
    // 飞书事件回调端点
    this.app.post('/webhook/feishu/event', async (req, res) => {
      try {
        const eventData = req.body as FeishuEventCallback;

        // 处理URL验证请求
        if (eventData.header?.event_type === 'url_verification') {
          const { challenge } = eventData.event as any;
          logger.debug('收到飞书URL验证请求', { challenge });
          return res.json({ challenge });
        }

        // 验证请求签名（可选但推荐）
        const globalConfig = this.configService.getGlobalConfig();
        if (globalConfig.feishu?.eventVerificationToken) {
          const signature = req.headers['x-lark-signature'] as string;
          const timestamp = req.headers['x-lark-request-timestamp'] as string;
          const nonce = req.headers['x-lark-request-nonce'] as string;
          const rawBody = (req as any).rawBody as Buffer;

          if (!this.verifySignature(
            globalConfig.feishu.eventVerificationToken,
            timestamp,
            nonce,
            rawBody,
            signature
          )) {
            logger.warn('飞书请求签名验证失败');
            return res.status(403).json({ error: 'Invalid signature' });
          }
        }

        // 处理卡片动作事件
        if (eventData.header?.event_type === 'card.action.trigger') {
          const actionEvent = eventData.event as FeishuCardActionEvent;
          await this.handleCardAction(actionEvent);
          return res.json({ success: true });
        }

        // 其他事件类型暂时忽略
        logger.debug('收到未处理的飞书事件类型', { eventType: eventData.header?.event_type });
        return res.json({ success: true });

      } catch (error) {
        logger.error('处理飞书事件失败', { error: (error as Error).message });
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    // 健康检查端点
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
  }

  /**
   * 验证飞书请求签名
   */
  private verifySignature(
    verificationToken: string,
    timestamp: string,
    nonce: string,
    body: Buffer,
    signature: string
  ): boolean {
    const stringToSign = `${timestamp}\n${nonce}\n${body.toString()}\n`;
    const hmac = crypto.createHmac('sha256', verificationToken);
    const calculatedSignature = hmac.update(stringToSign).digest('base64');
    return calculatedSignature === signature;
  }

  /**
   * 处理卡片动作事件
   */
  private async handleCardAction(event: FeishuCardActionEvent): Promise<void> {
    const { action, user_id: operatorUserId } = event;
    const { action: actionType, report_id: reportId, team_id: teamId } = action.value;

    logger.info('收到卡片动作事件', {
      actionType,
      reportId,
      teamId,
      operatorUserId
    });

    if (!reportId || !teamId) {
      logger.error('卡片动作缺少必要参数', { actionValue: action.value });
      return;
    }

    try {
      // 获取团队配置
      const teamConfig = await this.configService.getTeamConfig(teamId);

      // 验证操作者是否是审核人
      if (teamConfig.push.auditorId !== operatorUserId) {
        logger.warn('非审核人尝试操作审核', {
          teamId,
          reportId,
          operatorUserId,
          expectedAuditor: teamConfig.push.auditorId
        });
        return;
      }

      // 获取报告数据
      const report = this.db.queryOne(
        'SELECT * FROM reports WHERE id = ? AND team_id = ?',
        [reportId, teamId]
      );

      if (!report) {
        logger.error('报告不存在', { reportId, teamId });
        return;
      }

      if (report.audit_status !== 'pending') {
        logger.warn('报告已处理过审核', { reportId, status: report.audit_status });
        return;
      }

      // 解析报告内容
      const reportContent: WeeklyReport = {
        teamId: report.team_id,
        timeRange: {
          start: new Date(report.time_range_start),
          end: new Date(report.time_range_end)
        },
        generatedAt: new Date(report.generated_at),
        content: JSON.parse(report.content_json),
        sources: JSON.parse(report.sources_json || '[]')
      };

      if (actionType === 'approve_report') {
        await this.handleApproveReport(reportId, teamId, operatorUserId, reportContent, teamConfig);
      } else if (actionType === 'reject_report') {
        await this.handleRejectReport(reportId, teamId, operatorUserId);
      } else {
        logger.warn('未知的动作类型', { actionType });
      }

    } catch (error) {
      logger.error('处理卡片动作失败', { error: (error as Error).message });
    }
  }

  /**
   * 处理审核通过操作
   */
  private async handleApproveReport(
    reportId: number,
    teamId: string,
    auditorId: string,
    report: WeeklyReport,
    teamConfig: any
  ): Promise<void> {
    logger.info('审核通过报告', { reportId, teamId, auditorId });

    try {
      // 更新报告审核状态
      this.db.run(
        `UPDATE reports
         SET audit_status = 'approved', auditor_id = ?, audit_time = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [auditorId, reportId]
      );

      // 推送周报到配置的渠道
      const pushService = new FeishuPushService(teamConfig);

      // 临时关闭审核要求，直接推送
      const originalNeedAudit = teamConfig.push.needAudit;
      teamConfig.push.needAudit = false;

      const pushResult = await pushService.pushWeeklyReport(report);

      // 恢复原始配置
      teamConfig.push.needAudit = originalNeedAudit;

      // 给审核人发送审核成功通知
      await this.sendAuditResultNotification(
        auditorId,
        teamConfig,
        '✅ 周报审核通过',
        `已成功推送到 ${pushResult.results.filter(r => r.success).length} 个渠道`
      );

      logger.info('报告审核通过并推送完成', { reportId, pushStatus: pushResult.status });

    } catch (error) {
      logger.error('处理审核通过失败', { reportId, error: (error as Error).message });

      // 通知审核人失败
      await this.sendAuditResultNotification(
        auditorId,
        teamConfig,
        '❌ 审核通过后推送失败',
        `错误信息：${(error as Error).message}`
      );
    }
  }

  /**
   * 处理审核驳回操作
   */
  private async handleRejectReport(
    reportId: number,
    teamId: string,
    auditorId: string
  ): Promise<void> {
    logger.info('审核驳回报告', { reportId, teamId, auditorId });

    try {
      // 获取团队配置
      const teamConfig = await this.configService.getTeamConfig(teamId);

      // 更新报告审核状态
      this.db.run(
        `UPDATE reports
         SET audit_status = 'rejected', auditor_id = ?, audit_time = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [auditorId, reportId]
      );

      // 给审核人发送驳回成功通知
      await this.sendAuditResultNotification(
        auditorId,
        teamConfig,
        '⏹️ 周报已驳回',
        '该周报不会推送给团队成员，如有需要请手动调整后重新生成。'
      );

      logger.info('报告已驳回', { reportId });

    } catch (error) {
      logger.error('处理审核驳回失败', { reportId, error: (error as Error).message });
    }
  }

  /**
   * 发送审核结果通知
   */
  private async sendAuditResultNotification(
    userId: string,
    teamConfig: any,
    title: string,
    content: string
  ): Promise<void> {
    try {
      const pushService = new FeishuPushService(teamConfig);

      // 构建通知卡片
      const card = {
        config: {
          wide_screen_mode: true,
        },
        header: {
          title: {
            tag: 'plain_text',
            content: title,
          },
          template: title.includes('通过') ? 'green' : title.includes('驳回') ? 'orange' : 'red',
        },
        elements: [
          {
            tag: 'markdown',
            content: content,
          },
          {
            tag: 'note',
            elements: [
              {
                tag: 'plain_text',
                content: `团队：${teamConfig.teamName} | 操作时间：${new Date().toLocaleString()}`,
              },
            ],
          },
        ],
      };

      // 调用私有方法推送
      // @ts-ignore - 访问私有方法
      await pushService.pushToUser(userId, card);

    } catch (error) {
      logger.error('发送审核结果通知失败', { error: (error as Error).message });
    }
  }

  /**
   * 启动服务
   */
  start(port: number = 3000, host: string = '0.0.0.0'): void {
    if (this.server) {
      logger.warn('服务已经在运行中');
      return;
    }

    this.server = this.app.listen(port, host, () => {
      logger.info('飞书事件回调服务已启动', { port, host });
      console.log(`🚀 飞书事件回调服务已启动，监听地址：http://${host}:${port}`);
      console.log(`📡 回调地址：http://${host}:${port}/webhook/feishu/event`);
      console.log(`💡 请在飞书开放平台配置事件订阅，将上述地址填入"请求URL"`);
    });

    // 处理优雅退出
    process.on('SIGINT', () => {
      this.stop();
    });
  }

  /**
   * 停止服务
   */
  stop(): void {
    if (this.server) {
      this.server.close(() => {
        logger.info('飞书事件回调服务已停止');
        this.server = null;
      });
    }
  }
}