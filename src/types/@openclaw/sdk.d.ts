/**
 * OpenClaw SDK 类型定义
 * 用于编译时类型检查，实际实现由OpenClaw运行时提供
 */

export interface SkillContext {
  parameters: Record<string, any>;
  user: {
    id: string;
    name: string;
    [key: string]: any;
  };
  conversation: {
    id: string;
    type: 'group' | 'p2p';
    [key: string]: any;
  };
  sendCard: (card: any) => Promise<void>;
  [key: string]: any;
}

export interface CardActionContext {
  action: {
    value: Record<string, any>;
    [key: string]: any;
  };
  card: {
    context: Record<string, any>;
    [key: string]: any;
  };
  user: {
    id: string;
    name: string;
    [key: string]: any;
  };
  formData?: Record<string, any>;
  [key: string]: any;
}

export interface OpenClawAgentOptions {
  manifest: any;
  [key: string]: any;
}

export declare class OpenClawAgent {
  constructor(options: OpenClawAgentOptions);

  skill(name: string, handler: (context: SkillContext) => Promise<any>): void;

  action(name: string, handler: (context: CardActionContext) => Promise<any>): void;

  invokeSkill(skillId: string, context: any): Promise<any>;

  start(): Promise<void>;
}

export * from 'openclaw/plugin-sdk/agent-runtime';