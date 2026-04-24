import { z } from 'zod';

/**
 * 团队配置校验Schema
 */
export const TeamConfigSchema = z.object({
  teamId: z.string().min(1, '团队ID不能为空'),
  teamName: z.string().min(1, '团队名称不能为空'),

  feishu: z.object({
    appId: z.string().min(1, '飞书AppId不能为空'),
    appSecret: z.string().min(1, '飞书AppSecret不能为空'),
    scopes: z.array(z.string()).default([]),
  }),

  dataSources: z.object({
    docs: z.object({
      enabled: z.boolean().default(false),
      rootFolderToken: z.string().default(''),
      includeUsers: z.array(z.string()).default([]),
      excludeDirs: z.array(z.string()).default([]),
    }),
    tasks: z.object({
      enabled: z.boolean().default(false),
      projectIds: z.array(z.string()).default([]),
    }),
    meetings: z.object({
      enabled: z.boolean().default(false),
      calendarIds: z.array(z.string()).default([]),
    }),
  }),

  generate: z.object({
    cycle: z.enum(['weekly', 'biweekly', 'monthly']).default('weekly'),
    template: z.string().default('default'),
    includeRisks: z.boolean().default(true),
    includeNextWeekPlan: z.boolean().default(true),
    detailLevel: z.enum(['low', 'medium', 'high']).default('medium'),
  }),

  push: z.object({
    enabled: z.boolean().default(false),
    cronExpression: z.string().default('0 18 * * 5'), // 默认每周五18:00
    channels: z.array(z.object({
      type: z.enum(['group', 'user']),
      id: z.string(),
    })).default([]),
    needAudit: z.boolean().default(false),
    auditorId: z.string().default(''),
  }),

  filters: z.object({
    excludeKeywords: z.array(z.string()).default([]),
    excludeUsers: z.array(z.string()).default([]),
  }),
});

/**
 * 全局配置Schema
 */
export const GlobalConfigSchema = z.object({
  defaultTeamId: z.string().optional(),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  dataDir: z.string().default('~/.smartflow/data'),
  llm: z.discriminatedUnion('provider', [
    z.object({
      provider: z.literal('claude').default('claude'),
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
      model: z.string().default('claude-3-5-sonnet-20240620'),
      maxTokens: z.number().optional(),
    }),
    z.object({
      provider: z.literal('openai'),
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
      model: z.string().default('gpt-4o'),
      maxTokens: z.number().optional(),
      organization: z.string().optional(),
    }),
    z.object({
      provider: z.literal('qwen'), // 通义千问
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
      model: z.string().default('qwen-max'),
      maxTokens: z.number().optional(),
    }),
    z.object({
      provider: z.literal('ernie'), // 文心一言
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
      model: z.string().default('ernie-4.0'),
      maxTokens: z.number().optional(),
      secretKey: z.string().optional(),
    }),
    z.object({
      provider: z.literal('doubao'), // 豆包
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
      model: z.string().default('doubao-pro'),
      maxTokens: z.number().optional(),
    }),
  ]).default({
    provider: 'claude',
    model: 'claude-3-5-sonnet-20240620',
  }),
});

export type TeamConfig = z.infer<typeof TeamConfigSchema>;
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;
