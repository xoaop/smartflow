import { TeamConfigService } from '../../modules/config/team-config.service';
import { Logger } from '../logger/logger';
import { AnyLLMConfig } from './llm.interface';

const logger = Logger.getInstance();

/**
 * 统一大模型客户端
 * 支持所有主流大模型，后续会完善litellm适配
 */
export class LLMClient {
  private static instance: LLMClient;
  private configService: TeamConfigService;
  private defaultConfig: AnyLLMConfig;

  private constructor() {
    this.configService = TeamConfigService.getInstance();
    const globalConfig = this.configService.getGlobalConfig();
    this.defaultConfig = globalConfig.llm as AnyLLMConfig;

    if (!this.defaultConfig.apiKey) {
      logger.warn('LLM API Key未配置，生成功能可能不可用');
    }
  }

  public static getInstance(): LLMClient {
    if (!LLMClient.instance) {
      LLMClient.instance = new LLMClient();
    }
    return LLMClient.instance;
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
    const config = { ...this.defaultConfig, ...customConfig } as AnyLLMConfig;
    const useModel = model || config.model;
    const useMaxTokens = maxTokens || config.maxTokens || 4096;
    const provider = config.provider;

    logger.debug('调用LLM API', {
      provider,
      model: useModel,
      maxTokens: useMaxTokens,
      promptLength: prompt.length,
    });

    try {
      const messages = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      // OpenAI 兼容格式（豆包、通义千问、文心一言、火山引擎等都支持这个格式）
      if (provider === 'openai' || provider === 'doubao' || provider === 'qwen' || provider === 'ernie' || config.baseUrl?.includes('volces.com')) {
        const requestBody = {
          model: useModel,
          max_tokens: useMaxTokens,
          messages,
          temperature: 0.3,
        };

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        };

        const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        let apiUrl: string;
        // 如果已经包含了完整路径，直接使用
        if (baseUrl.includes('/chat/completions')) {
          apiUrl = baseUrl;
        }
        // 火山引擎特殊处理
        else if (baseUrl.includes('volces.com')) {
          // 火山引擎方舟平台OpenAI兼容接口统一使用/api/v3/chat/completions路径
          apiUrl = `${baseUrl.replace(/\/(api\/compatible|v1|v3)?\/?$/, '')}/api/v3/chat/completions`;
        }
        // 标准OpenAI接口
        else {
          apiUrl = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
        }

        logger.debug('请求API', { url: apiUrl });

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API调用失败 [${response.status}]: ${errorText}`);
        }

        const data: any = await response.json();
        const content = data.choices[0].message.content || '';

        logger.debug('LLM API调用成功', {
          provider,
          model: useModel,
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        });

        return content;
      }
      // Claude 格式
      else if (provider === 'claude') {
        const requestBody = {
          model: useModel,
          max_tokens: useMaxTokens,
          messages,
          temperature: 0.3,
        };

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        };

        const baseUrl = config.baseUrl || 'https://api.anthropic.com';
        const apiUrl = `${baseUrl.replace(/\/$/, '')}/v1/messages`;

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API调用失败 [${response.status}]: ${errorText}`);
        }

        const data: any = await response.json();
        const content = data.content[0].text || '';

        logger.debug('LLM API调用成功', {
          provider,
          model: useModel,
          inputTokens: data.usage?.input_tokens || 0,
          outputTokens: data.usage?.output_tokens || 0,
          totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        });

        return content;
      } else {
        throw new Error(`暂不支持的大模型提供商: ${provider}`);
      }
    } catch (error) {
      logger.error('LLM API调用失败', {
        provider,
        model: useModel,
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
   * 获取当前默认配置
   */
  getDefaultConfig(): AnyLLMConfig {
    return { ...this.defaultConfig };
  }
}