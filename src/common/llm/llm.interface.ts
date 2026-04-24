/**
 * 大模型客户端抽象接口
 * 所有大模型客户端都需要实现这个接口
 */
export interface LLMClient {
  /**
   * 生成文本内容
   * @param prompt 用户提示词
   * @param systemPrompt 系统提示词
   * @param model 模型名称（可选，覆盖默认配置）
   * @param maxTokens 最大生成token数（可选，覆盖默认配置）
   */
  generate(
    prompt: string,
    systemPrompt?: string,
    model?: string,
    maxTokens?: number
  ): Promise<string>;

  /**
   * 生成结构化JSON内容
   * @param prompt 用户提示词
   * @param systemPrompt 系统提示词
   * @param model 模型名称（可选，覆盖默认配置）
   * @param maxTokens 最大生成token数（可选，覆盖默认配置）
   */
  generateJson<T = any>(
    prompt: string,
    systemPrompt?: string,
    model?: string,
    maxTokens?: number
  ): Promise<T>;
}

/**
 * 大模型配置基类
 */
export interface LLMConfig {
  provider: 'claude' | 'openai' | 'qwen' | 'ernie' | 'doubao';
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
}

/**
 * Claude 配置
 */
export interface ClaudeConfig extends LLMConfig {
  provider: 'claude';
}

/**
 * OpenAI 配置
 */
export interface OpenAIConfig extends LLMConfig {
  provider: 'openai';
  organization?: string;
}

/**
 * 通义千问 配置
 */
export interface QwenConfig extends LLMConfig {
  provider: 'qwen';
}

/**
 * 文心一言 配置
 */
export interface ErnieConfig extends LLMConfig {
  provider: 'ernie';
  secretKey?: string;
}

/**
 * 豆包 配置
 */
export interface DoubaoConfig extends LLMConfig {
  provider: 'doubao';
}

export type AnyLLMConfig = ClaudeConfig | OpenAIConfig | QwenConfig | ErnieConfig | DoubaoConfig;