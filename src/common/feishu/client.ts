import * as lark from '@larksuiteoapi/node-sdk';
import { TeamConfig } from '../../../src/types';
import { Logger } from '../logger/logger';
import { TeamConfigService } from '../../modules/config/team-config.service';

const logger = Logger.getInstance();

/**
 * 飞书API客户端封装
 * 使用官方Node SDK实现，稳定性更高
 */
export class FeishuClient {
  private client: lark.Client;
  private teamId: string;
  private appId: string;
  private appSecret: string;
  private userAccessToken?: string; // 用户AccessToken

  // 缓存机制
  private cache: Map<string, { data: any; expireAt: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

  constructor(options: {
    profile: string;
    teamId: string;
    appId: string;
    appSecret: string;
    scopes?: string[];
    userAccessToken?: string;
  }) {
    this.teamId = options.teamId;
    this.appId = options.appId;
    this.appSecret = options.appSecret;
    this.userAccessToken = options.userAccessToken;

    // 初始化飞书SDK客户端
    this.client = new lark.Client({
      appId: this.appId,
      appSecret: this.appSecret,
    });
  }

  /**
   * 获取租户访问令牌
   */
  public async getTenantAccessToken(): Promise<string> {
    // SDK自动处理token，这里不需要手动获取
    return '';
  }

  /**
   * 通用API调用方法，使用官方SDK执行
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

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retryTimes; attempt++) {
      try {
        logger.debug('执行飞书API调用', { method, path, params, attempt: attempt + 1 });

        // 处理路径参数（替换路径中的{param}）
        let processedPath = path;
        const pathParams = path.match(/\{([^}]+)\}/g) || [];
        for (const param of pathParams) {
          const paramName = param.slice(1, -1);
          if (params[paramName]) {
            processedPath = processedPath.replace(param, params[paramName]);
            delete params[paramName];
          }
        }

        // 构建请求选项
        const requestOptions: any = {
          path: processedPath,
          method: method as any,
        };

        if (Object.keys(params).length > 0) {
          requestOptions.query = params;
        }

        if (Object.keys(data).length > 0) {
          requestOptions.body = data;
        }

        // 合并请求头
        const headers: Record<string, string> = { ...options?.headers };

        // 如果配置了用户AccessToken，优先使用用户身份调用
        if (this.userAccessToken) {
          headers['Authorization'] = `Bearer ${this.userAccessToken}`;
        }

        if (Object.keys(headers).length > 0) {
          requestOptions.headers = headers;
        }

        // 执行API请求
        const response = await this.client.request(requestOptions);

        // 检查API错误
        if (response.code !== undefined && response.code !== 0) {
          const errorMessage = response.msg || response.message || '未知错误';
          logger.error('飞书API返回错误', {
            path,
            code: response.code,
            message: errorMessage,
            requestId: response.requestId,
          });
          throw new Error(`API调用失败: ${errorMessage} (code: ${response.code})`);
        }

        // 提取data字段
        const result = response.data !== undefined ? response.data : response;

        // 缓存结果
        if (cache) {
          this.cache.set(cacheKey, {
            data: result,
            expireAt: Date.now() + this.CACHE_TTL,
          });

          // 清理过期缓存（简单LRU策略，最多保留100条）
          if (this.cache.size > 100) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) {
              this.cache.delete(oldestKey);
            }
          }
        }

        logger.debug('飞书API调用成功', { path, attempt: attempt + 1 });
        return result as T;

      } catch (error) {
        lastError = error as Error;
        const errorMessage = lastError.message;

        // 可以重试的错误类型
        const retryableErrors = [
          'rate_limit',
          'timeout',
          '503',
          '504',
          '429',
          'connection',
          'network',
          'ECONNRESET',
          'ETIMEDOUT',
          'token expired',
          'Too Many Requests',
          'Service Unavailable',
        ];

        // 检查是否需要重试
        const shouldRetry = attempt < retryTimes - 1 &&
          retryableErrors.some(keyword => errorMessage.toLowerCase().includes(keyword));

        if (shouldRetry) {
          // 指数退避
          const delay = 1000 * Math.pow(2, attempt);
          logger.warn('飞书API调用失败，准备重试', {
            path,
            attempt: attempt + 1,
            nextAttemptIn: `${delay}ms`,
            error: errorMessage,
          });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        logger.error('飞书API调用最终失败', {
          path,
          attempt: attempt + 1,
          error: errorMessage,
        });
        break;
      }
    }

    throw lastError || new Error('飞书API调用失败');
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

      if (!feishuConfig.appId || !feishuConfig.appSecret) {
        throw new Error('飞书应用配置不完整，缺少appId或appSecret');
      }

      this.instances.set(key, new FeishuClient({
        profile: feishuConfig.appId,
        teamId: teamConfig.teamId,
        appId: feishuConfig.appId,
        appSecret: feishuConfig.appSecret,
        scopes: feishuConfig.scopes,
        userAccessToken: feishuConfig.userAccessToken,
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
