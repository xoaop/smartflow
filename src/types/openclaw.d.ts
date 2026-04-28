/**
 * OpenClaw SDK 类型声明
 * 仅用于编译时类型检查，实际实现由OpenClaw运行环境提供
 */
declare module '@openclaw/sdk' {
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
    sendCard(card: any): Promise<void>;
    [key: string]: any;
  }

  export interface CardActionContext {
    action: {
      value: Record<string, any>;
      [key: string]: any;
    };
    card: {
      context: Record<string, any>;
      elements: any[];
      [key: string]: any;
    };
    [key: string]: any;
  }

  export interface ScheduleOptions {
    id: string;
    name: string;
    cron: string;
    enabled: boolean;
    action: {
      skill: string;
      parameters: Record<string, any>;
    };
    [key: string]: any;
  }

  export const storage: {
    get<T = any>(key: string): Promise<T | null>;
    set<T = any>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    listKeys(prefix?: string): Promise<string[]>;
    exists(key: string): Promise<boolean>;
  };

  export const schedule: {
    create(options: ScheduleOptions): Promise<void>;
    delete(id: string): Promise<void>;
    list(): Promise<ScheduleOptions[]>;
    enable(id: string): Promise<void>;
    disable(id: string): Promise<void>;
  };

  export class OpenClawAgent {
    constructor(options: { manifest: any; [key: string]: any });
    skill(id: string, handler: (context: SkillContext) => Promise<any>): void;
    action(id: string, handler: (context: CardActionContext) => Promise<any>): void;
    invokeSkill(skillId: string, context: SkillContext): Promise<any>;
    start(): Promise<void>;
  }
}
