import * as lark from '@larksuiteoapi/node-sdk';
import { TeamConfig } from '../../../src/types';
import { Logger } from '../logger/logger';

const logger = Logger.getInstance();

/**
 * 飞书API客户端封装
 */
export class FeishuClient {
  private client: lark.Client;
  private teamConfig: TeamConfig;
  private tenantAccessToken: string | null = null;
  private tokenExpireTime: number = 0;

  constructor(teamConfig: TeamConfig) {
    this.teamConfig = teamConfig;
    this.client = new lark.Client({
      appId: teamConfig.feishu.appId,
      appSecret: teamConfig.feishu.appSecret,
      disableTokenCache: true, // 我们自己管理token缓存
    });
  }

  /**
   * 获取租户访问令牌，自动处理过期刷新
   */
  public async getTenantAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tenantAccessToken && now < this.tokenExpireTime - 60 * 1000) { // 提前1分钟刷新
      return this.tenantAccessToken;
    }

    try {
      const response = await this.client.auth.tenantAccessToken.internal({
        data: {
          app_id: this.teamConfig.feishu.appId,
          app_secret: this.teamConfig.feishu.appSecret,
        },
      });

      if (response.code !== 0) {
        throw new Error(`获取飞书租户Token失败: ${response.msg}`);
      }

      if (!response.data) {
        throw new Error('获取飞书租户Token失败：响应数据为空');
      }

      const tokenData = response.data as { tenant_access_token: string; expire: number };
      this.tenantAccessToken = tokenData.tenant_access_token;
      this.tokenExpireTime = now + tokenData.expire * 1000;
      logger.debug('飞书租户Token获取成功', {
        teamId: this.teamConfig.teamId,
        expireIn: tokenData.expire
      });

      if (!this.tenantAccessToken) {
        throw new Error('获取飞书租户Token失败：Token为空');
      }
      return this.tenantAccessToken;
    } catch (error) {
      logger.error('获取飞书租户Token失败', {
        teamId: this.teamConfig.teamId,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * 通用API调用方法，自动添加token，处理重试
   */
  public async request<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options?: {
      params?: Record<string, any>;
      data?: any;
      headers?: Record<string, string>;
      retryTimes?: number;
    }
  ): Promise<T> {
    const { params = {}, data = {}, headers = {}, retryTimes = 3 } = options || {};
    const token = await this.getTenantAccessToken();

    const defaultHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    };

    let lastError: Error | null = null;
    for (let i = 0; i < retryTimes; i++) {
      try {
        const response = await this.client.request({
          method,
          url: path,
          params,
          data,
          headers: defaultHeaders,
        });

        if (response.code !== 0) {
          // Token过期，重新获取并重试
          if (response.code === 99991663 || response.code === 99991664) {
            this.tenantAccessToken = null;
            if (i < retryTimes - 1) {
              logger.debug('飞书Token过期，重试请求', { path, retry: i + 1 });
              await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
              continue;
            }
          }
          throw new Error(`飞书API调用失败 [${response.code}]: ${response.msg}`);
        }

        return response.data as T;
      } catch (error) {
        lastError = error as Error;
        if (i < retryTimes - 1) {
          // 指数退避重试
          const delay = 1000 * Math.pow(2, i);
          logger.warn(`飞书API调用失败，${delay}ms后重试`, {
            path,
            retry: i + 1,
            error: lastError.message
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    logger.error('飞书API调用最终失败', { path, error: lastError?.message });
    throw lastError;
  }

  /**
   * 获取原始lark客户端实例
   */
  public getRawClient(): lark.Client {
    return this.client;
  }
}

/**
 * 飞书客户端工厂
 */
export class FeishuClientFactory {
  private static instances: Map<string, FeishuClient> = new Map();

  public static getClient(teamConfig: TeamConfig): FeishuClient {
    const key = teamConfig.teamId;
    if (!this.instances.has(key)) {
      this.instances.set(key, new FeishuClient(teamConfig));
    }
    return this.instances.get(key)!;
  }

  public static removeClient(teamId: string): void {
    this.instances.delete(teamId);
  }

  public static clearAll(): void {
    this.instances.clear();
  }
}
