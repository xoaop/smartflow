import { z } from 'zod';

/**
 * 团队配置校验Schema
 */
export const TeamConfigSchema = z.object({
  teamId: z.string().min(1, '团队ID不能为空'),
  teamName: z.string().min(1, '团队名称不能为空'),

  feishu: z.object({
    // 团队级别的飞书配置（可选），如果配置了会覆盖全局配置
    appId: z.string().optional(),
    appSecret: z.string().optional(),
    encryptKey: z.string().optional(),
    verificationToken: z.string().optional(),
    scopes: z.array(z.string()).default([]),
  }).default({}),

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
    messages: z.object({
      enabled: z.boolean().default(false),
      chatIds: z.array(z.string()).default([]),
      includeKeywords: z.array(z.string()).default([]),
    }).default({
      enabled: false,
      chatIds: [],
      includeKeywords: [],
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

  // 全局飞书应用配置，所有团队共享
  feishu: z.object({
    appId: z.string().optional(),
    appSecret: z.string().optional(),
    encryptKey: z.string().optional(),
    verificationToken: z.string().optional(),
    scopes: z.array(z.string()).default([]),
  }).default({}),

  // OpenClaw 大模型配置（由平台统一管理，此处仅为自定义参数）
  llm: z.object({
    model: z.string().optional(), // 可选指定模型，不指定则使用平台默认
    maxTokens: z.number().optional(), // 最大生成token数
    temperature: z.number().default(0.3), // 生成温度
  }).default({
    temperature: 0.3,
  }),
});

export type TeamConfig = z.infer<typeof TeamConfigSchema>;
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;
