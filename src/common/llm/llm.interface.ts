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
 * 大模型配置（OpenClaw统一管理，此处仅为类型定义）
 */
export interface AnyLLMConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  [key: string]: any;
}