import { ISourceCollector } from './collector.interface';
import { TeamConfig, TimeRange, MessageItem } from '../../types';
import { FeishuClient, FeishuClientFactory } from '../../common/feishu/client';
import { Logger } from '../../common/logger/logger';

const logger = Logger.getInstance();

/**
 * 飞书群聊消息采集器
 */
export class MessageCollector implements ISourceCollector<MessageItem> {
  private feishuClient: FeishuClient | null = null;

  constructor() {}

  /**
   * 采集指定时间范围内的群聊消息
   */
  async collect(teamConfig: TeamConfig, timeRange: TimeRange): Promise<MessageItem[]> {
    if (!teamConfig.dataSources.messages?.enabled) {
      logger.info('群聊消息采集未启用，跳过');
      return [];
    }

    // 初始化飞书客户端
    if (!this.feishuClient) {
      this.feishuClient = await FeishuClientFactory.getClient(teamConfig);
    }

    const { chatIds, includeKeywords = [] } = teamConfig.dataSources.messages;
    if (!chatIds || chatIds.length === 0) {
      logger.info('未配置需要采集的群聊ID，跳过群聊消息采集');
      return [];
    }

    logger.info('开始采集群聊消息', {
      chatCount: chatIds.length,
      startTime: timeRange.start,
      endTime: timeRange.end,
    });

    const allMessages: MessageItem[] = [];

    for (const chatId of chatIds) {
      try {
        const messages = await this.collectChatMessages(chatId, timeRange, includeKeywords);
        allMessages.push(...messages);
        logger.info(`群聊 ${chatId} 采集完成，共 ${messages.length} 条消息`);
      } catch (error) {
        logger.error(`群聊 ${chatId} 采集失败，跳过`, {
          error: (error as Error).message,
        });
      }
    }

    logger.info('群聊消息采集完成', { totalCount: allMessages.length });
    return allMessages;
  }

  /**
   * 采集单个群聊的消息
   */
  private async collectChatMessages(
    chatId: string,
    timeRange: TimeRange,
    includeKeywords: string[]
  ): Promise<MessageItem[]> {
    const messages: MessageItem[] = [];
    let pageToken = '';
    const startTime = Math.floor(timeRange.start.getTime() / 1000);
    const endTime = Math.floor(timeRange.end.getTime() / 1000);

    do {
      // 调用飞书获取群聊消息API
      const response = await this.feishuClient!.request(
        'GET',
        '/im/v1/messages',
        {
          params: {
            container_id_type: 'chat',
            container_id: chatId,
            start_time: startTime.toString(),
            end_time: endTime.toString(),
            page_token: pageToken,
            page_size: 50,
          },
        }
      );

      if (response.data?.items) {
        for (const item of response.data.items) {
          // 过滤消息内容
          const content = this.parseMessageContent(item.body.content);
          if (this.isMessageRelevant(content, includeKeywords)) {
            messages.push({
              id: item.message_id,
              chatId: chatId,
              chatName: item.chat_name || '',
              url: `https://applink.feishu.cn/client/chat/message/${item.message_id}`,
              sendTime: new Date(parseInt(item.create_time)),
              sender: {
                id: item.sender.id,
                name: item.sender.name || '',
              },
              content: content,
              mentions: (item.mentions || []).map((mention: any) => ({
                id: mention.id,
                name: mention.name,
              })),
              isImportant: this.isImportantMessage(content, includeKeywords),
            });
          }
        }
      }

      pageToken = response.data?.page_token || '';
    } while (pageToken);

    return messages;
  }

  /**
   * 解析消息内容
   */
  private parseMessageContent(content: string): string {
    try {
      // 飞书消息内容是JSON格式
      const parsed = JSON.parse(content);
      return parsed.text || content;
    } catch {
      return content;
    }
  }

  /**
   * 判断消息是否相关
   */
  private isMessageRelevant(content: string, includeKeywords: string[]): boolean {
    if (includeKeywords.length === 0) {
      return true; // 没有配置关键词时返回所有消息
    }

    const lowerContent = content.toLowerCase();
    return includeKeywords.some(keyword =>
      lowerContent.includes(keyword.toLowerCase())
    );
  }

  /**
   * 判断是否是重要消息
   */
  private isImportantMessage(content: string, includeKeywords: string[]): boolean {
    if (includeKeywords.length === 0) {
      return false;
    }

    const lowerContent = content.toLowerCase();
    // 包含多个关键词或者包含高优先级关键词的消息标记为重要
    const matchCount = includeKeywords.filter(keyword =>
      lowerContent.includes(keyword.toLowerCase())
    ).length;

    // 包含风险、问题、阻塞、延期、bug等关键词自动标记为重要
    const highPriorityKeywords = ['风险', '问题', '阻塞', '延期', 'bug', '错误', '失败', '紧急'];
    const hasHighPriority = highPriorityKeywords.some(keyword =>
      lowerContent.includes(keyword)
    );

    return matchCount >= 2 || hasHighPriority;
  }
}
