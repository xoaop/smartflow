import * as dayjs from 'dayjs';
import { ISourceCollector } from './collector.interface';
import { DocItem, TeamConfig, TimeRange } from '../../types';
import { FeishuClient, FeishuClientFactory } from '../../common/feishu/client';
import { Logger } from '../../common/logger/logger';

const logger = Logger.getInstance();

/**
 * 飞书文档采集器
 */
export class DocCollector implements ISourceCollector<DocItem> {
  private feishuClient: FeishuClient;

  constructor(teamConfig: TeamConfig) {
    this.feishuClient = FeishuClientFactory.getClient(teamConfig);
  }

  /**
   * 采集指定时间范围内修改的文档
   */
  async collect(teamConfig: TeamConfig, timeRange: TimeRange): Promise<DocItem[]> {
    if (!teamConfig.dataSources.docs.enabled) {
      logger.info('文档采集未启用，跳过', { teamId: teamConfig.teamId });
      return [];
    }

    logger.info('开始采集文档数据', {
      teamId: teamConfig.teamId,
      startTime: dayjs(timeRange.start).format('YYYY-MM-DD HH:mm:ss'),
      endTime: dayjs(timeRange.end).format('YYYY-MM-DD HH:mm:ss'),
      rootFolder: teamConfig.dataSources.docs.rootFolderToken
    });

    const docs: DocItem[] = [];

    try {
      // 递归遍历根目录下的所有文档
      const allDocs = await this.listAllDocsInFolder(
        teamConfig.dataSources.docs.rootFolderToken,
        timeRange,
        teamConfig.dataSources.docs.excludeDirs
      );

      // 过滤在时间范围内修改的文档
      const filteredDocs = allDocs.filter(doc => {
        // 过滤排除的用户
        if (teamConfig.filters.excludeUsers.includes(doc.modifier.id)) {
          return false;
        }
        // 过滤排除的关键词
        if (teamConfig.filters.excludeKeywords.some(keyword =>
          doc.title.includes(keyword) || doc.contentSummary.includes(keyword)
        )) {
          return false;
        }
        // 包含指定用户（如果配置了）
        if (teamConfig.dataSources.docs.includeUsers.length > 0 &&
            !teamConfig.dataSources.docs.includeUsers.includes(doc.modifier.id)) {
          return false;
        }
        return true;
      });

      docs.push(...filteredDocs);

      logger.info('文档采集完成', { teamId: teamConfig.teamId, count: docs.length });
      return docs;
    } catch (error) {
      logger.error('文档采集失败', { teamId: teamConfig.teamId, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 递归列出文件夹下的所有文档
   */
  private async listAllDocsInFolder(
    folderToken: string,
    timeRange: TimeRange,
    excludeDirs: string[],
    currentPath: string = ''
  ): Promise<DocItem[]> {
    if (!folderToken) {
      return [];
    }

    // 检查是否是排除的目录
    if (excludeDirs.some(dir => currentPath.includes(dir))) {
      logger.debug('跳过排除的目录', { path: currentPath });
      return [];
    }

    const docs: DocItem[] = [];
    let pageToken = '';

    do {
      const response: any = await this.feishuClient.request('GET', '/drive/v1/files', {
        params: {
          folder_token: folderToken,
          page_size: 100,
          page_token: pageToken,
          order_by: 'EditedTime',
        },
      });

      if (!response.files || response.files.length === 0) {
        break;
      }

      for (const file of response.files) {
        // 文件夹，继续递归
        if (file.type === 'folder') {
          const subFolderDocs = await this.listAllDocsInFolder(
            file.token,
            timeRange,
            excludeDirs,
            `${currentPath}/${file.name}`
          );
          docs.push(...subFolderDocs);
          continue;
        }

        // 只处理文档类型
        if (['docx', 'doc', 'sheet', 'slides'].includes(file.type)) {
          const modifiedTime = new Date(file.edited_time);
          // 检查是否在时间范围内
          if (modifiedTime >= timeRange.start && modifiedTime <= timeRange.end) {
            // 获取文档内容摘要
            const contentSummary = await this.getDocContentSummary(file.token, file.type);

            docs.push({
              id: file.token,
              title: file.name,
              url: file.url,
              modifiedTime,
              modifier: {
                id: file.modifier_id,
                name: file.modifier_name || '',
              },
              contentSummary,
              path: `${currentPath}/${file.name}`,
            });
          }
        }
      }

      pageToken = response.page_token;
    } while (pageToken);

    return docs;
  }

  /**
   * 获取文档内容摘要
   */
  private async getDocContentSummary(docToken: string, docType: string): Promise<string> {
    try {
      if (docType === 'docx') {
        // 获取文档的基本信息和前几段内容
        const response: any = await this.feishuClient.request('GET', `/docx/v1/documents/${docToken}/raw_content`);
        const content = response.content || '';
        // 返回前500个字符作为摘要
        return content.slice(0, 500) + (content.length > 500 ? '...' : '');
      }
      // 其他类型文档暂时返回空摘要
      return '';
    } catch (error) {
      logger.warn('获取文档内容失败', { docToken, error: (error as Error).message });
      return '';
    }
  }
}
