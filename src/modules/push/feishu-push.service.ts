import { PushResult, TeamConfig, WeeklyReport } from '../../types';
import { FeishuClient, FeishuClientFactory } from '../../common/feishu/client';
import { FeishuCardBuilder } from './card-builder';
import { Logger } from '../../common/logger/logger';

const logger = Logger.getInstance();

/**
 * 飞书推送服务
 */
export class FeishuPushService {
  private feishuClient: FeishuClient;
  private teamConfig: TeamConfig;

  constructor(teamConfig: TeamConfig) {
    this.teamConfig = teamConfig;
    this.feishuClient = FeishuClientFactory.getClient(teamConfig);
  }

  /**
   * 推送周报
   * @param report 周报数据
   */
  async pushWeeklyReport(report: WeeklyReport): Promise<PushResult> {
    if (!this.teamConfig.push.enabled) {
      logger.info('推送未启用，跳过推送', { teamId: this.teamConfig.teamId });
      return {
        status: 'success',
        results: [],
      };
    }

    if (this.teamConfig.push.channels.length === 0) {
      logger.warn('未配置推送渠道，跳过推送', { teamId: this.teamConfig.teamId });
      return {
        status: 'success',
        results: [],
      };
    }

    logger.info('开始推送周报', {
      teamId: this.teamConfig.teamId,
      channelCount: this.teamConfig.push.channels.length,
    });

    try {
      // 构建飞书卡片
      const card = FeishuCardBuilder.buildWeeklyReportCard(report, this.teamConfig.teamName);

      // 如果需要审核，先推送给审核人
      if (this.teamConfig.push.needAudit && this.teamConfig.push.auditorId) {
        await this.pushToUser(this.teamConfig.push.auditorId, card, true);
        logger.info('周报已推送给审核人，等待审核', {
          teamId: this.teamConfig.teamId,
          auditorId: this.teamConfig.push.auditorId,
        });
        return {
          status: 'pending_audit',
          results: [],
        };
      }

      // 推送到所有配置的渠道
      const results = await Promise.all(
        this.teamConfig.push.channels.map(async (channel) => {
          try {
            let messageId: string;
            if (channel.type === 'group') {
              messageId = await this.pushToGroup(channel.id, card);
            } else {
              messageId = await this.pushToUser(channel.id, card);
            }

            logger.debug('推送成功', {
              teamId: this.teamConfig.teamId,
              channelType: channel.type,
              channelId: channel.id,
              messageId,
            });

            return {
              channelType: channel.type as 'group' | 'user',
              channelId: channel.id,
              success: true,
              messageId,
            };
          } catch (error) {
            logger.error('推送失败', {
              teamId: this.teamConfig.teamId,
              channelType: channel.type,
              channelId: channel.id,
              error: (error as Error).message,
            });
            return {
              channelType: channel.type as 'group' | 'user',
              channelId: channel.id,
              success: false,
              error: (error as Error).message,
            };
          }
        })
      );

      const successCount = results.filter(r => r.success).length;
      logger.info('推送完成', {
        teamId: this.teamConfig.teamId,
        successCount,
        totalCount: results.length,
      });

      return {
        status: successCount > 0 ? 'success' : 'failed',
        results,
        pushedAt: new Date(),
      };
    } catch (error) {
      logger.error('推送周报失败', {
        teamId: this.teamConfig.teamId,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * 推送测试消息
   */
  async pushTest(): Promise<{ success: boolean; message?: string }> {
    try {
      const card = FeishuCardBuilder.buildTestCard();

      // 推送给第一个渠道作为测试
      const firstChannel = this.teamConfig.push.channels[0];
      if (!firstChannel) {
        return { success: false, message: '未配置推送渠道' };
      }

      let messageId: string;
      if (firstChannel.type === 'group') {
        messageId = await this.pushToGroup(firstChannel.id, card);
      } else {
        messageId = await this.pushToUser(firstChannel.id, card);
      }

      return { success: true, message: `测试推送成功，消息ID: ${messageId}` };
    } catch (error) {
      return { success: false, message: (error as Error).message };
    }
  }

  /**
   * 推送错误通知
   */
  async pushErrorNotification(error: Error): Promise<void> {
    try {
      // 推送给管理员或配置的通知接收人
      if (this.teamConfig.push.auditorId) {
        const card = FeishuCardBuilder.buildErrorCard(error, this.teamConfig.teamName);
        await this.pushToUser(this.teamConfig.push.auditorId, card);
      }
    } catch (pushError) {
      logger.error('推送错误通知失败', { error: (pushError as Error).message });
    }
  }

  /**
   * 推送到群聊
   */
  private async pushToGroup(chatId: string, card: any): Promise<string> {
    const response: any = await this.feishuClient.request('POST', '/im/v1/messages', {
      params: {
        receive_id_type: 'chat_id',
      },
      data: {
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      },
    });

    return response.message_id;
  }

  /**
   * 推送给用户
   */
  private async pushToUser(userId: string, card: any, isAudit: boolean = false): Promise<string> {
    // 如果是审核消息，添加审核按钮
    if (isAudit) {
      card.actions = card.actions || [];
      card.actions.push(
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: '审核通过',
          },
          type: 'primary',
          value: {
            action: 'approve_report',
          },
        },
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: '驳回',
          },
          type: 'danger',
          value: {
            action: 'reject_report',
          },
        }
      );
    }

    const response: any = await this.feishuClient.request('POST', '/im/v1/messages', {
      params: {
        receive_id_type: 'user_id',
      },
      data: {
        receive_id: userId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      },
    });

    return response.message_id;
  }
}
