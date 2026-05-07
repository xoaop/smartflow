import * as fs from 'fs-extra';
import * as path from 'path';
import * as yaml from 'yaml';
import { ZodError } from 'zod';
import { homedir } from 'os';
import { TeamConfigSchema, GlobalConfigSchema, TeamConfig, GlobalConfig } from './config.schema';
import { Logger } from '../../common/logger/logger';

const logger = Logger.getInstance();

/**
 * 配置管理服务
 * Skill模式下使用OpenClaw内置KV存储，本地开发模式使用文件系统
 */
export class TeamConfigService {
  private static instance: TeamConfigService;
  private globalConfig: GlobalConfig | null = null;
  private teamConfigs: Map<string, TeamConfig> = new Map();

  // 本地文件存储配置
  private readonly configRoot: string;
  private readonly teamsConfigDir: string;
  private readonly globalConfigPath: string;

  private readonly isOpenClawEnvironment: boolean;

  private constructor() {
    this.isOpenClawEnvironment = !!process.env.OPENCLAW_AGENT_ID;

    // 本地文件存储路径
    this.configRoot = path.join(homedir(), '.smartflow', 'config');
    this.teamsConfigDir = path.join(this.configRoot, 'teams');
    this.globalConfigPath = path.join(this.configRoot, 'config.yaml');

    if (!this.isOpenClawEnvironment) {
      this.initConfigDirs();
    }
  }

  public static getInstance(): TeamConfigService {
    if (!TeamConfigService.instance) {
      TeamConfigService.instance = new TeamConfigService();
    }
    return TeamConfigService.instance;
  }

  /**
   * 初始化配置目录
   */
  private initConfigDirs(): void {
    fs.mkdirpSync(this.teamsConfigDir, { mode: 0o700 });
  }

  /**
   * 加载全局配置
   */
  public async loadGlobalConfig(context?: any): Promise<GlobalConfig> {
    if (this.globalConfig) {
      return this.globalConfig;
    }

    try {
      // 优先尝试从文件系统读取配置，不管是否是OpenClaw环境
      if (await fs.pathExists(this.globalConfigPath)) {
        const content = await fs.readFile(this.globalConfigPath, 'utf-8');
        const config = yaml.parse(content);
        this.globalConfig = GlobalConfigSchema.parse(config);
        logger.info('从文件系统加载全局配置成功', { path: this.globalConfigPath });
      }
      // 如果文件不存在，再尝试从OpenClaw KV存储读取
      else if (this.isOpenClawEnvironment && context) {
        // OpenClaw模式下从内置KV存储读取
        const globalConfigStr = await context.kv.get('global_config');
        if (globalConfigStr) {
          this.globalConfig = GlobalConfigSchema.parse(JSON.parse(globalConfigStr));
          logger.info('从OpenClaw KV存储加载全局配置成功');
        } else {
          // 使用默认配置
          this.globalConfig = GlobalConfigSchema.parse({});
          logger.info('未找到全局配置文件，使用默认配置');
        }
      }
      // 本地模式下创建默认配置文件
      else {
        // 创建默认配置文件
        this.globalConfig = GlobalConfigSchema.parse({});
        await this.saveGlobalConfig(this.globalConfig);
        logger.info('已创建默认全局配置文件', { path: this.globalConfigPath });
      }

      return this.globalConfig;
    } catch (error) {
      logger.error('加载全局配置失败', { error: (error as Error).message });
      throw new Error(`全局配置加载失败: ${(error as Error).message}`);
    }
  }

  /**
   * 获取全局配置（必须先调用loadGlobalConfig）
   */
  public getGlobalConfig(): GlobalConfig {
    if (!this.globalConfig) {
      throw new Error('全局配置未加载，请先调用loadGlobalConfig()');
    }
    return this.globalConfig;
  }

  /**
   * 保存全局配置
   */
  public async saveGlobalConfig(config: GlobalConfig, context?: any): Promise<void> {
    this.globalConfig = GlobalConfigSchema.parse(config);

    try {
      if (this.isOpenClawEnvironment && context) {
        // OpenClaw模式下保存到内置KV存储
        await context.kv.set('global_config', JSON.stringify(this.globalConfig));
      } else {
        // 本地模式下保存到文件
        const content = yaml.stringify(this.globalConfig);
        await fs.writeFile(this.globalConfigPath, content, 'utf-8');
      }

      logger.info('全局配置已保存');
    } catch (error) {
      logger.error('保存全局配置失败', { error: (error as Error).message });
      throw new Error(`全局配置保存失败: ${(error as Error).message}`);
    }
  }

  /**
   * 获取所有团队ID
   */
  public async getAllTeamIds(context?: any): Promise<string[]> {
    try {
      // 优先尝试从文件系统读取团队配置
      if (await fs.pathExists(this.teamsConfigDir)) {
        const files = await fs.readdir(this.teamsConfigDir);
        const fileTeamIds = files
          .filter((file: string) => file.endsWith('.yaml'))
          .map((file: string) => file.slice(0, -5));

        if (fileTeamIds.length > 0) {
          logger.info('从文件系统加载团队ID列表成功', { count: fileTeamIds.length });
          return fileTeamIds;
        }
      }

      // 如果文件系统没有配置，再尝试从OpenClaw KV存储读取
      if (this.isOpenClawEnvironment && context) {
        // OpenClaw模式下从KV存储获取
        const teamIdsStr = await context.kv.get('team_ids');
        if (teamIdsStr) {
          const kvTeamIds = JSON.parse(teamIdsStr);
          logger.info('从OpenClaw KV存储加载团队ID列表成功', { count: kvTeamIds.length });
          return kvTeamIds;
        }
      }

      // 都没有的话返回空数组
      logger.info('未找到任何团队配置');
      return [];
    } catch (error) {
      logger.error('获取团队ID列表失败', { error: (error as Error).message });
      throw new Error(`获取团队ID列表失败: ${(error as Error).message}`);
    }
  }

  /**
   * 检查团队配置是否存在
   */
  public async teamConfigExists(teamId: string, context?: any): Promise<boolean> {
    const teamIds = await this.getAllTeamIds(context);
    return teamIds.includes(teamId);
  }

  /**
   * 获取团队配置
   */
  public async getTeamConfig(teamId: string, context?: any): Promise<TeamConfig> {
    // 先从缓存读取
    if (this.teamConfigs.has(teamId)) {
      return this.teamConfigs.get(teamId)!;
    }

    try {
      let config: TeamConfig;

      // 优先尝试从文件系统读取团队配置
      const configPath = path.join(this.teamsConfigDir, `${teamId}.yaml`);
      if (await fs.pathExists(configPath)) {
        const content = await fs.readFile(configPath, 'utf-8');
        const rawConfig = yaml.parse(content);
        config = TeamConfigSchema.parse(rawConfig);
        logger.info('从文件系统加载团队配置成功', { teamId, path: configPath });
      }
      // 如果文件不存在，再尝试从OpenClaw KV存储读取
      else if (this.isOpenClawEnvironment && context) {
        // OpenClaw模式下从KV存储读取
        const configStr = await context.kv.get(`team_config_${teamId}`);
        if (!configStr) {
          throw new Error(`团队配置 ${teamId} 不存在`);
        }
        config = TeamConfigSchema.parse(JSON.parse(configStr));
        logger.info('从OpenClaw KV存储加载团队配置成功', { teamId });
      } else {
        throw new Error(`团队配置文件不存在: ${configPath}`);
      }

      // 缓存配置
      this.teamConfigs.set(teamId, config);
      return config;
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.issues.map(issue =>
          `${issue.path.join('.')}: ${issue.message}`
        ).join(', ');
        logger.error('团队配置校验失败', { teamId, error: errorMessages });
        throw new Error(`团队配置校验失败: ${teamId} - ${errorMessages}`);
      }
      logger.error('加载团队配置失败', { teamId, error: (error as Error).message });
      throw new Error(`加载团队配置失败: ${teamId} - ${(error as Error).message}`);
    }
  }

  /**
   * 保存团队配置
   */
  public async saveTeamConfig(config: TeamConfig, context?: any): Promise<void> {
    const validatedConfig = TeamConfigSchema.parse(config);
    const teamId = validatedConfig.teamId;

    try {
      if (this.isOpenClawEnvironment && context) {
        // OpenClaw模式下保存到KV存储
        await context.kv.set(`team_config_${teamId}`, JSON.stringify(validatedConfig));

        // 更新团队ID列表
        const teamIds = await this.getAllTeamIds(context);
        if (!teamIds.includes(teamId)) {
          teamIds.push(teamId);
          await context.kv.set('team_ids', JSON.stringify(teamIds));
        }
      } else {
        // 本地模式下保存到文件
        const configPath = path.join(this.teamsConfigDir, `${teamId}.yaml`);
        const content = yaml.stringify(validatedConfig);
        await fs.writeFile(configPath, content, 'utf-8');
      }

      // 更新缓存
      this.teamConfigs.set(teamId, validatedConfig);
      logger.info('团队配置已保存', { teamId });
    } catch (error) {
      logger.error('保存团队配置失败', { teamId, error: (error as Error).message });
      throw new Error(`保存团队配置失败: ${teamId} - ${(error as Error).message}`);
    }
  }

  /**
   * 删除团队配置
   */
  public async deleteTeamConfig(teamId: string, context?: any): Promise<void> {
    try {
      if (this.isOpenClawEnvironment && context) {
        // OpenClaw模式下从KV存储删除
        await context.kv.delete(`team_config_${teamId}`);

        // 更新团队ID列表
        const teamIds = await this.getAllTeamIds(context);
        const updatedIds = teamIds.filter(id => id !== teamId);
        await context.kv.set('team_ids', JSON.stringify(updatedIds));
      } else {
        // 本地模式下删除文件
        const configPath = path.join(this.teamsConfigDir, `${teamId}.yaml`);
        if (await fs.pathExists(configPath)) {
          await fs.remove(configPath);
        }
      }

      // 清除缓存
      this.teamConfigs.delete(teamId);
      logger.info('团队配置已删除', { teamId });
    } catch (error) {
      logger.error('删除团队配置失败', { teamId, error: (error as Error).message });
      throw new Error(`删除团队配置失败: ${teamId} - ${(error as Error).message}`);
    }
  }

  /**
   * 创建团队配置模板
   */
  public createTeamConfigTemplate(teamId: string, teamName: string): TeamConfig {
    return TeamConfigSchema.parse({
      teamId,
      teamName,
      dataSources: {
        docs: { enabled: false, rootFolderToken: '' },
        tasks: { enabled: false, projectIds: [] },
        meetings: { enabled: false, calendarIds: [] },
        messages: { enabled: false, chatIds: [] }
      },
      generate: {
        cycle: 'weekly',
        template: 'default',
        includeRisks: true,
        includeNextWeekPlan: true,
        detailLevel: 'medium'
      },
      push: {
        enabled: false,
        cronExpression: '0 18 * * 5',
        channels: [],
        needAudit: false,
        auditorId: ''
      }
    });
  }

  /**
   * 获取合并后的飞书配置
   * 团队级配置优先于全局配置
   */
  public async getMergedFeishuConfig(teamId: string, context?: any) {
    const globalConfig = await this.loadGlobalConfig(context);
    const teamConfig = await this.getTeamConfig(teamId, context);

    return {
      ...globalConfig.feishu,
      ...teamConfig.feishu,
      scopes: [
        ...(globalConfig.feishu.scopes || []),
        ...(teamConfig.feishu.scopes || [])
      ]
    };
  }
}
