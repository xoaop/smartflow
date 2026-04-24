/**
 * 时间范围
 */
export interface TimeRange {
  start: Date;
  end: Date;
}

/**
 * 大模型配置
 */
export type LLMProvider = 'claude' | 'openai' | 'qwen' | 'ernie' | 'doubao';

export interface BaseLLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
}

export interface ClaudeConfig extends BaseLLMConfig {
  provider: 'claude';
}

export interface OpenAIConfig extends BaseLLMConfig {
  provider: 'openai';
  organization?: string;
}

export interface QwenConfig extends BaseLLMConfig {
  provider: 'qwen';
}

export interface ErnieConfig extends BaseLLMConfig {
  provider: 'ernie';
  secretKey?: string;
}

export interface DoubaoConfig extends BaseLLMConfig {
  provider: 'doubao';
}

export type LLMConfig = ClaudeConfig | OpenAIConfig | QwenConfig | ErnieConfig | DoubaoConfig;

/**
 * 团队配置
 */
export interface TeamConfig {
  teamId: string;
  teamName: string;
  // 飞书API配置
  feishu: {
    appId: string;
    appSecret: string;
    scopes: string[];
  };
  // 数据源配置
  dataSources: {
    docs: {
      enabled: boolean;
      rootFolderToken: string;
      includeUsers: string[];
      excludeDirs: string[];
    };
    tasks: {
      enabled: boolean;
      projectIds: string[];
    };
    meetings: {
      enabled: boolean;
      calendarIds: string[];
    };
  };
  // 生成配置
  generate: {
    cycle: 'weekly' | 'biweekly' | 'monthly';
    template: string;
    includeRisks: boolean;
    includeNextWeekPlan: boolean;
    detailLevel: 'low' | 'medium' | 'high';
  };
  // 推送配置
  push: {
    enabled: boolean;
    cronExpression: string;
    channels: Array<{
      type: 'group' | 'user';
      id: string;
    }>;
    needAudit: boolean;
    auditorId: string;
  };
  // 过滤规则
  filters: {
    excludeKeywords: string[];
    excludeUsers: string[];
  };
}

/**
 * 采集到的文档数据
 */
export interface DocItem {
  id: string;
  title: string;
  url: string;
  modifiedTime: Date;
  modifier: {
    id: string;
    name: string;
  };
  contentSummary: string;
  path: string;
}

/**
 * 采集到的任务数据
 */
export interface TaskItem {
  id: string;
  title: string;
  url: string;
  status: string;
  statusChangedTime: Date;
  assignee: {
    id: string;
    name: string;
  };
  creator: {
    id: string;
    name: string;
  };
  dueTime?: Date;
  projectId: string;
  projectName: string;
  description: string;
}

/**
 * 采集到的会议数据
 */
export interface MeetingItem {
  id: string;
  title: string;
  url: string;
  startTime: Date;
  endTime: Date;
  organizer: {
    id: string;
    name: string;
  };
  participants: Array<{
    id: string;
    name: string;
  }>;
  minutesContent: string;
  actionItems: Array<{
    content: string;
    assignee?: string;
    deadline?: Date;
  }>;
}

/**
 * 采集到的所有数据
 */
export interface CollectedData {
  teamId: string;
  timeRange: TimeRange;
  collectedAt: Date;
  docs: DocItem[];
  tasks: TaskItem[];
  meetings: MeetingItem[];
}

/**
 * 生成的周报内容
 */
export interface WeeklyReport {
  teamId: string;
  timeRange: TimeRange;
  generatedAt: Date;
  content: {
    overview: string;
    keyWork: Array<{
      title: string;
      description: string;
      sourceUrl: string;
      author: string;
    }>;
    projectProgress: Array<{
      projectName: string;
      progress: string;
      tasks: TaskItem[];
    }>;
    pendingItems: Array<{
      content: string;
      assignee: string;
      deadline?: Date;
      sourceUrl: string;
    }>;
    riskWarnings: Array<{
      level: 'low' | 'medium' | 'high';
      content: string;
      sourceUrl: string;
    }>;
    nextWeekPlan: Array<{
      content: string;
      responsible: string;
    }>;
  };
  sources: Array<{
    type: 'doc' | 'task' | 'meeting';
    title: string;
    url: string;
  }>;
}

/**
 * 推送结果
 */
export interface PushResult {
  status: 'success' | 'failed' | 'pending_audit';
  results: Array<{
    channelType: 'group' | 'user';
    channelId: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
  pushedAt?: Date;
}
