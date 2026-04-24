import * as dayjs from 'dayjs';
import { ISourceCollector } from './collector.interface';
import { MeetingItem, TeamConfig, TimeRange } from '../../types';
import { FeishuClient, FeishuClientFactory } from '../../common/feishu/client';
import { Logger } from '../../common/logger/logger';

const logger = Logger.getInstance();

/**
 * 飞书会议采集器
 */
export class MeetingCollector implements ISourceCollector<MeetingItem> {
  private feishuClient: FeishuClient;

  constructor(teamConfig: TeamConfig) {
    this.feishuClient = FeishuClientFactory.getClient(teamConfig);
  }

  /**
   * 采集指定时间范围内的会议和纪要
   */
  async collect(teamConfig: TeamConfig, timeRange: TimeRange): Promise<MeetingItem[]> {
    if (!teamConfig.dataSources.meetings.enabled) {
      logger.info('会议采集未启用，跳过', { teamId: teamConfig.teamId });
      return [];
    }

    if (teamConfig.dataSources.meetings.calendarIds.length === 0) {
      logger.warn('未配置日历ID，跳过会议采集', { teamId: teamConfig.teamId });
      return [];
    }

    logger.info('开始采集会议数据', {
      teamId: teamConfig.teamId,
      startTime: dayjs(timeRange.start).format('YYYY-MM-DD HH:mm:ss'),
      endTime: dayjs(timeRange.end).format('YYYY-MM-DD HH:mm:ss'),
      calendarIds: teamConfig.dataSources.meetings.calendarIds
    });

    const meetings: MeetingItem[] = [];

    try {
      for (const calendarId of teamConfig.dataSources.meetings.calendarIds) {
        const calendarMeetings = await this.collectMeetingsFromCalendar(calendarId, timeRange, teamConfig);
        meetings.push(...calendarMeetings);
      }

      logger.info('会议采集完成', { teamId: teamConfig.teamId, count: meetings.length });
      return meetings;
    } catch (error) {
      logger.error('会议采集失败', { teamId: teamConfig.teamId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 采集指定日历中的会议
   */
  private async collectMeetingsFromCalendar(
    calendarId: string,
    timeRange: TimeRange,
    teamConfig: TeamConfig
  ): Promise<MeetingItem[]> {
    const meetings: MeetingItem[] = [];
    let pageToken = '';

    do {
      const response: any = await this.feishuClient.request('GET', `/calendar/v4/calendars/${calendarId}/events`, {
        params: {
          start_time: Math.floor(timeRange.start.getTime() / 1000),
          end_time: Math.floor(timeRange.end.getTime() / 1000),
          page_size: 100,
          page_token: pageToken,
        },
      });

      if (!response.items || response.items.length === 0) {
        break;
      }

      for (const event of response.items) {
        // 过滤排除的用户
        if (teamConfig.filters.excludeUsers.includes(event.creator_id)) {
          continue;
        }

        // 过滤排除的关键词
        if (teamConfig.filters.excludeKeywords.some(keyword =>
          event.summary.includes(keyword) || (event.description && event.description.includes(keyword))
        )) {
          continue;
        }

        // 获取会议纪要和妙记内容
        const { minutesContent, actionItems } = await this.getMeetingMinutes(event.id);

        meetings.push({
          id: event.id,
          title: event.summary,
          url: `https://applink.feishu.cn/client/calendar/event/${event.id}`,
          startTime: new Date(event.start_time * 1000),
          endTime: new Date(event.end_time * 1000),
          organizer: {
            id: event.creator_id,
            name: event.creator_name || '',
          },
          participants: event.attendees?.map((attendee: any) => ({
            id: attendee.user_id,
            name: attendee.name || '',
          })) || [],
          minutesContent,
          actionItems,
        });
      }

      pageToken = response.page_token;
    } while (pageToken);

    return meetings;
  }

  /**
   * 获取会议纪要和妙记内容
   */
  private async getMeetingMinutes(eventId: string): Promise<{
    minutesContent: string;
    actionItems: Array<{ content: string; assignee?: string; deadline?: Date }>;
  }> {
    try {
      // 尝试获取会议关联的纪要
      const response: any = await this.feishuClient.request('GET', `/vc/v1/meetings`, {
        params: {
          calendar_event_id: eventId,
        },
      });

      if (!response.meetings || response.meetings.length === 0) {
        return { minutesContent: '', actionItems: [] };
      }

      const meeting = response.meetings[0];
      let minutesContent = '';
      const actionItems: Array<{ content: string; assignee?: string; deadline?: Date }> = [];

      // 如果有妙记，获取妙记内容
      if (meeting.minutes_url) {
        try {
          // 从妙记URL中提取妙记ID
          const minutesId = this.extractMinutesId(meeting.minutes_url);
          if (minutesId) {
            const minutesResponse: any = await this.feishuClient.request('GET', `/minutes/v1/minutes/${minutesId}`);
            minutesContent = minutesResponse.minutes?.content || '';

            // 提取Action Items
            actionItems.push(...this.extractActionItems(minutesContent));
          }
        } catch (error) {
          logger.warn('获取会议妙记失败', { eventId, error: (error as Error).message });
        }
      }

      return {
        minutesContent: minutesContent.slice(0, 2000) + (minutesContent.length > 2000 ? '...' : ''),
        actionItems,
      };
    } catch (error) {
      logger.warn('获取会议信息失败', { eventId, error: (error as Error).message });
      return { minutesContent: '', actionItems: [] };
    }
  }

  /**
   * 从妙记URL中提取妙记ID
   */
  private extractMinutesId(url: string): string | null {
    const match = url.match(/minutes\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }

  /**
   * 从纪要内容中提取Action Items
   */
  private extractActionItems(content: string): Array<{ content: string; assignee?: string; deadline?: Date }> {
    const actionItems: Array<{ content: string; assignee?: string; deadline?: Date }> = [];

    // 简单的Action Item匹配规则，可根据实际情况优化
    const actionItemRegex = /(?:Action|行动项|待办|TODO)(?:[:：]\s*)(.*?)(?:\n|$)/gi;
    let match: RegExpExecArray | null;

    while ((match = actionItemRegex.exec(content)) !== null) {
      const itemText = match[1].trim();
      if (itemText) {
        actionItems.push({
          content: itemText,
          // TODO: 更智能的提取负责人和截止时间
        });
      }
    }

    return actionItems;
  }
}
