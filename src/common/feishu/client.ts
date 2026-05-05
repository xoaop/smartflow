import { exec } from 'child_process';
import { promisify } from 'util';
import { TeamConfig } from '../../../src/types';
import { Logger } from '../logger/logger';
import { TeamConfigService } from '../../modules/config/team-config.service';

const execAsync = promisify(exec);
const logger = Logger.getInstance();

/**
 * 飞书API客户端封装
 * 仅支持CLI模式，调用官方飞书CLI执行API请求
 */
export class FeishuClient {
  private cliProfile: string;
  private teamId: string;

  // 缓存机制
  private cache: Map<string, { data: any; expireAt: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

  constructor(options: {
    profile: string;
    teamId: string;
    appId?: string;
    appSecret?: string;
    scopes?: string[];
  }) {
    this.cliProfile = options.profile;
    this.teamId = options.teamId;
  }

  /**
   * 获取租户访问令牌，CLI模式下不需要手动管理
   */
  public async getTenantAccessToken(): Promise<string> {
    // CLI模式下由CLI自动处理token，这里返回空字符串
    return '';
  }

  /**
   * 通用API调用方法，通过飞书CLI执行
   */
  public async request<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options?: {
      params?: Record<string, any>;
      data?: any;
      headers?: Record<string, string>;
      retryTimes?: number;
      cache?: boolean; // 是否启用缓存，默认GET请求启用，其他请求禁用
    }
  ): Promise<T> {
    const { params = {}, data = {}, retryTimes = 3, cache = method === 'GET' } = options || {};

    // 生成缓存键
    const cacheKey = cache ? `${method}:${path}:${JSON.stringify(params)}` : '';

    // 尝试从缓存获取
    if (cache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (Date.now() < cached.expireAt) {
        logger.debug('飞书API缓存命中', { path, cacheKey });
        return cached.data as T;
      } else {
        this.cache.delete(cacheKey);
      }
    }

    // 构建CLI命令
    let cliCommand = `feishu api ${method.toLowerCase()} ${path}`;

    // 添加查询参数
    if (Object.keys(params).length > 0) {
      const paramsJson = JSON.stringify(params).replace(/'/g, "'\\''");
      cliCommand += ` --params '${paramsJson}'`;
    }

    // 添加请求体
    if (Object.keys(data).length > 0) {
      cliCommand += ` --data '${JSON.stringify(data).replace(/'/g, "'\\''")}'`;
    }

    // 指定profile
    cliCommand += ` --profile ${this.cliProfile}`;

    let lastError: Error | null = null;
    for (let i = 0; i < retryTimes; i++) {
      try {
        logger.debug('调用飞书CLI命令', { command: cliCommand, teamId: this.teamId });
        const { stdout, stderr } = await execAsync(cliCommand);

        if (stderr) {
          throw new Error(`CLI调用错误: ${stderr}`);
        }

        const response = JSON.parse(stdout);

        // CLI返回格式统一处理
        if (response.code !== undefined && response.code !== 0) {
          throw new Error(`飞书API调用失败 [${response.code}]: ${response.msg || response.message}`);
        }

        const result = (response.data || response) as T;

        // 写入缓存
        if (cache) {
          this.cache.set(cacheKey, {
            data: result,
            expireAt: Date.now() + this.CACHE_TTL
          });

          // 清理过期缓存（简单LRU策略，最多保留100条）
          if (this.cache.size > 100) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) {
              this.cache.delete(oldestKey);
            }
          }
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        if (i < retryTimes - 1) {
          // 指数退避重试
          const delay = 1000 * Math.pow(2, i);
          logger.warn(`飞书CLI调用失败，${delay}ms后重试`, {
            path,
            retry: i + 1,
            error: lastError.message
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    logger.error('飞书CLI调用最终失败', { path, error: lastError?.message || '未知错误' });
    throw lastError || new Error('飞书CLI调用失败');
  }

  /**
   * 扫描所有文档空间
   */
  public async scanDocSpaces(): Promise<Array<{ id: string; name: string }>> {
    const response = await this.request('GET', '/open-apis/drive/explorer/v2/space/list');
    return (response.spaces || []).map((space: any) => ({
      id: space.space_id,
      name: space.name
    }));
  }

  /**
   * 扫描文件夹下的子文件夹
   */
  public async scanFolders(folderToken: string = 'root'): Promise<Array<{ token: string; name: string }>> {
    const response = await this.request('GET', '/open-apis/drive/explorer/v2/folder/list', {
      params: { folder_token: folderToken }
    });
    return (response.files || [])
      .filter((file: any) => file.type === 'folder')
      .map((folder: any) => ({
        token: folder.token,
        name: folder.name
      }));
  }

  /**
   * 扫描所有项目（任务）
   */
  public async scanProjects(): Promise<Array<{ id: string; name: string }>> {
    const response = await this.request('GET', '/open-apis/project/v1/projects');
    return (response.projects || []).map((project: any) => ({
      id: project.id,
      name: project.name
    }));
  }

  /**
   * 扫描所有日历
   */
  public async scanCalendars(): Promise<Array<{ id: string; name: string }>> {
    const response = await this.request('GET', '/open-apis/calendar/v4/calendars');
    return (response.calendars || []).map((calendar: any) => ({
      id: calendar.calendar_id,
      name: calendar.summary
    }));
  }

  /**
   * 扫描用户所在的所有群聊
   */
  public async scanChats(): Promise<Array<{ id: string; name: string }>> {
    const response = await this.request('GET', '/open-apis/im/v1/chats', {
      params: { page_size: 100 }
    });
    return (response.items || []).map((chat: any) => ({
      id: chat.chat_id,
      name: chat.name
    }));
  }

  /**
   * 扫描所有用户
   */
  public async scanUsers(): Promise<Array<{ id: string; name: string; email: string }>> {
    const response = await this.request('GET', '/open-apis/contact/v3/users', {
      params: { page_size: 100 }
    });
    return (response.items || []).map((user: any) => ({
      id: user.user_id,
      name: user.name,
      email: user.email
    }));
  }
}

/**
 * 飞书客户端工厂
 */
export class FeishuClientFactory {
  private static instances: Map<string, FeishuClient> = new Map();
  private static configService: TeamConfigService = TeamConfigService.getInstance();

  /**
   * 获取飞书客户端实例
   */
  public static async getClient(teamConfig: TeamConfig): Promise<FeishuClient> {
    const key = teamConfig.teamId;
    if (!this.instances.has(key)) {
      // 获取合并后的飞书配置
      const feishuConfig = await this.configService.getMergedFeishuConfig(teamConfig.teamId);
      // 飞书CLI的profile名称使用appId，保持和全局配置一致
      const profile = feishuConfig.appId || 'default';
      this.instances.set(key, new FeishuClient({
        profile,
        teamId: teamConfig.teamId,
        appId: feishuConfig.appId || '',
        appSecret: feishuConfig.appSecret || '',
        scopes: feishuConfig.scopes,
      }));
    }
    return this.instances.get(key)!;
  }

  /**
   * 移除指定团队的客户端实例
   */
  public static removeClient(teamId: string): void {
    this.instances.delete(teamId);
  }

  /**
   * 清除所有客户端实例
   */
  public static clearAll(): void {
    this.instances.clear();
  }
}
