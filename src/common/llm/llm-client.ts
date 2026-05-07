import type { SkillContext } from '@openclaw/sdk';
import { Logger } from '../logger/logger';
import { AnyLLMConfig } from './llm.interface';
import { TeamConfigService } from '../../modules/config/team-config.service';
import Anthropic from '@anthropic-ai/sdk';

const logger = Logger.getInstance();
const configService = TeamConfigService.getInstance();

/**
 * 大模型客户端
 * 支持双模式：OpenClaw平台调用 和 原生API直接调用
 */
export class LLMClient {
  private static instance: LLMClient;
  private context?: SkillContext;
  private anthropicClient?: Anthropic;

  private constructor() {}

  public static getInstance(): LLMClient {
    if (!LLMClient.instance) {
      LLMClient.instance = new LLMClient();
    }
    return LLMClient.instance;
  }

  /**
   * 设置当前Skill上下文（仅OpenClaw模式需要）
   */
  setContext(context: SkillContext) {
    this.context = context;
  }

  /**
   * 初始化原生API客户端
   */
  private async initNativeClient(config: AnyLLMConfig) {
    if (config.provider === 'claude' && config.apiKey) {
      this.anthropicClient = new Anthropic({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
      });
    }
    // 其他厂商的初始化可以在这里添加
  }

  /**
   * 生成文本内容
   * @param prompt 用户提示词
   * @param systemPrompt 系统提示词
   * @param model 模型名称（可选，覆盖默认配置）
   * @param maxTokens 最大生成token数（可选，覆盖默认配置）
   * @param customConfig 自定义配置（可选，覆盖全局配置）
   * @param retryTimes 重试次数，默认3次
   */
  async generate(
    prompt: string,
    systemPrompt: string = '',
    model?: string,
    maxTokens: number = 4096,
    customConfig?: Partial<AnyLLMConfig>,
    retryTimes: number = 3
  ): Promise<string> {
    // 获取全局LLM配置（仅用于兼容，实际优先使用OpenClaw平台能力）
    const globalConfig = await configService.getGlobalConfig();
    const llmConfig = { ...globalConfig.llm, ...customConfig } as AnyLLMConfig;
    const targetModel = model || 'ep-20260423222711-8zfcd';

    const startTime = Date.now();
    let lastError: Error | null = null;

    logger.debug('调用大模型', {
      provider: llmConfig.provider,
      model: targetModel,
      maxTokens,
      promptLength: prompt.length,
    });

    for (let attempt = 0; attempt < retryTimes; attempt++) {
      try {
        // 强制使用OpenClaw模式，优先使用平台提供的LLM能力
        const useOpenClawMode = true;

        // OpenClaw 模式
        if (useOpenClawMode) {
          // 构建消息
          const messages = [];
          if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
          }
          messages.push({ role: 'user', content: prompt });

          // 调用OpenClaw大模型能力
          const response = await (this.context as any).llm.chat({
            model: targetModel,
            max_tokens: maxTokens,
            temperature: 0.3,
            messages,
            ...customConfig
          });

          const content = response.content || '';
          const costTime = Date.now() - startTime;

          logger.debug('OpenClaw大模型调用成功', {
            model: targetModel,
            attempt: attempt + 1,
            costTime: `${costTime}ms`,
            inputTokens: response.usage?.input_tokens || 0,
            outputTokens: response.usage?.output_tokens || 0,
            totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
          });

          return content;
        }
        // 原生API模式
        else {
          // 初始化客户端（如果还没初始化）
          if (!this.anthropicClient && llmConfig.provider === 'claude') {
            if (!llmConfig.apiKey) {
              throw new Error('Claude API Key 未配置，请在全局配置中设置 llm.apiKey');
            }
            await this.initNativeClient(llmConfig);
          }

          if (llmConfig.provider === 'claude' && this.anthropicClient) {
            // 适配火山引擎方舟兼容模式，不需要额外的参数
            const response = await this.anthropicClient.messages.create({
              model: targetModel as Anthropic.MessageCreateParams['model'],
              max_tokens: maxTokens,
              temperature: 0.3,
              system: systemPrompt,
              messages: [
                { role: 'user', content: prompt }
              ],
            });

            const content = response.content?.[0]?.type === 'text' ? response.content[0].text : '';
            const costTime = Date.now() - startTime;

            logger.debug('Claude API调用成功', {
              model: targetModel,
              attempt: attempt + 1,
              costTime: `${costTime}ms`,
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
              totalTokens: response.usage.input_tokens + response.usage.output_tokens,
            });

            return content;
          }

          throw new Error(`不支持的大模型厂商: ${llmConfig.provider} 或缺少必要配置`);
        }
      } catch (error) {
        lastError = error as Error;
        const errorMessage = (error as Error).message;

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
          'ETIMEDOUT'
        ];

        // 检查是否需要重试
        const shouldRetry = attempt < retryTimes - 1 &&
          retryableErrors.some(keyword => errorMessage.toLowerCase().includes(keyword));

        if (shouldRetry) {
          // 指数退避
          const delay = 1000 * Math.pow(2, attempt);
          logger.warn('大模型调用失败，准备重试', {
            attempt: attempt + 1,
            nextAttemptIn: `${delay}ms`,
            error: errorMessage
          });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        logger.error('大模型调用最终失败', {
          provider: llmConfig.provider,
          model: targetModel,
          attempt: attempt + 1,
          totalTime: `${Date.now() - startTime}ms`,
          error: errorMessage
        });
        break;
      }
    }

    throw lastError || new Error('大模型调用失败');
  }

  /**
   * 生成结构化JSON内容
   * @param prompt 用户提示词
   * @param systemPrompt 系统提示词
   * @param model 模型名称（可选，覆盖默认配置）
   * @param maxTokens 最大生成token数（可选，覆盖默认配置）
   * @param customConfig 自定义配置（可选，覆盖全局配置）
   */
  async generateJson<T = any>(
    prompt: string,
    systemPrompt: string = '',
    model?: string,
    maxTokens: number = 4096,
    customConfig?: Partial<AnyLLMConfig>
  ): Promise<T> {
    const jsonSystemPrompt = `${systemPrompt}\n\n请严格按照JSON格式返回结果，不要返回任何其他内容。确保JSON格式正确，可以被JSON.parse()直接解析。`;

    const content = await this.generate(prompt, jsonSystemPrompt, model, maxTokens, customConfig);

    try {
      // 尝试提取JSON内容（处理可能的markdown格式包裹）
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content;
      return JSON.parse(jsonStr.trim()) as T;
    } catch (error) {
      logger.error('解析LLM返回的JSON失败', { content, error: (error as Error).message });
      throw new Error(`解析JSON失败: ${(error as Error).message}\n返回内容: ${content}`);
    }
  }

  /**
   * 获取当前默认配置
   */
  async getDefaultConfig(): Promise<AnyLLMConfig> {
    const globalConfig = await configService.getGlobalConfig();
    return globalConfig.llm as AnyLLMConfig;
  }
}