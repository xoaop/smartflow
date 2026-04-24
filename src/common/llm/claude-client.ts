import Anthropic from '@anthropic-ai/sdk';
import { TeamConfigService } from '../../modules/config/team-config.service';
import { Logger } from '../logger/logger';

const logger = Logger.getInstance();

/**
 * Claude API客户端封装
 */
export class ClaudeClient {
  private static instance: ClaudeClient;
  private client: Anthropic;
  private configService: TeamConfigService;

  private constructor() {
    this.configService = TeamConfigService.getInstance();
    const globalConfig = this.configService.getGlobalConfig();

    if (!globalConfig.llm.apiKey) {
      logger.warn('Claude API Key未配置，部分功能可能不可用');
    }

    this.client = new Anthropic({
      apiKey: globalConfig.llm.apiKey,
      baseURL: globalConfig.llm.baseUrl,
    });
  }

  public static getInstance(): ClaudeClient {
    if (!ClaudeClient.instance) {
      ClaudeClient.instance = new ClaudeClient();
    }
    return ClaudeClient.instance;
  }

  /**
   * 生成内容
   * @param prompt 用户提示词
   * @param systemPrompt 系统提示词
   * @param model 模型名称
   * @param maxTokens 最大生成token数
   */
  async generate(
    prompt: string,
    systemPrompt: string = '',
    model?: string,
    maxTokens: number = 4096
  ): Promise<string> {
    const globalConfig = this.configService.getGlobalConfig();
    const useModel = model || globalConfig.llm.model;

    logger.debug('调用Claude API', {
      model: useModel,
      maxTokens,
      promptLength: prompt.length,
    });

    try {
      const response = await this.client.messages.create({
        model: useModel,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0].type === 'text' ? response.content[0].text : '';

      logger.debug('Claude API调用成功', {
        model: useModel,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      });

      return content;
    } catch (error) {
      logger.error('Claude API调用失败', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 生成结构化JSON内容
   * @param prompt 用户提示词
   * @param systemPrompt 系统提示词
   * @param model 模型名称
   * @param maxTokens 最大生成token数
   */
  async generateJson<T = any>(
    prompt: string,
    systemPrompt: string = '',
    model?: string,
    maxTokens: number = 4096
  ): Promise<T> {
    const jsonSystemPrompt = `${systemPrompt}\n\n请严格按照JSON格式返回结果，不要返回任何其他内容。确保JSON格式正确，可以被JSON.parse()直接解析。`;

    const content = await this.generate(prompt, jsonSystemPrompt, model, maxTokens);

    try {
      // 尝试提取JSON内容（处理可能的markdown格式包裹）
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content;
      return JSON.parse(jsonStr.trim()) as T;
    } catch (error) {
      logger.error('解析Claude返回的JSON失败', { content, error: (error as Error).message });
      throw new Error(`解析JSON失败: ${(error as Error).message}\n返回内容: ${content}`);
    }
  }
}
