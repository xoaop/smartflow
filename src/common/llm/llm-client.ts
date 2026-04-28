import { SkillContext } from '@openclaw/sdk';
import { Logger } from '../logger/logger';
import { AnyLLMConfig } from './llm.interface';

const logger = Logger.getInstance();

/**
 * OpenClaw 大模型客户端
 * 通过OpenClaw平台统一调用大模型能力
 */
export class LLMClient {
  private static instance: LLMClient;
  private context?: SkillContext;

  private constructor() {}

  public static getInstance(): LLMClient {
    if (!LLMClient.instance) {
      LLMClient.instance = new LLMClient();
    }
    return LLMClient.instance;
  }

  /**
   * 设置当前Skill上下文，必须在调用生成方法前设置
   */
  setContext(context: SkillContext) {
    this.context = context;
  }

  /**
   * 生成文本内容
   * @param prompt 用户提示词
   * @param systemPrompt 系统提示词
   * @param model 模型名称（可选，覆盖默认配置）
   * @param maxTokens 最大生成token数（可选，覆盖默认配置）
   * @param customConfig 自定义配置（可选，覆盖全局配置）
   */
  async generate(
    prompt: string,
    systemPrompt: string = '',
    model?: string,
    maxTokens: number = 4096,
    customConfig?: Partial<AnyLLMConfig>
  ): Promise<string> {
    if (!this.context) {
      throw new Error('LLMClient未设置Skill上下文，请先调用setContext()');
    }

    logger.debug('调用OpenClaw大模型', {
      model,
      maxTokens,
      promptLength: prompt.length,
    });

    try {
      // 构建消息
      const messages = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      // 调用OpenClaw大模型能力
      const response = await this.context.llm.chat({
        model,
        max_tokens: maxTokens,
        temperature: 0.3,
        messages,
        ...customConfig
      });

      const content = response.content || '';

      logger.debug('OpenClaw大模型调用成功', {
        model,
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
        totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
      });

      return content;
    } catch (error) {
      logger.error('OpenClaw大模型调用失败', {
        model,
        error: (error as Error).message
      });
      throw error;
    }
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
   * 获取当前默认配置（OpenClaw模式下返回空配置，由平台统一管理）
   */
  getDefaultConfig(): AnyLLMConfig {
    return {};
  }
}