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
 */
export class TeamConfigService {
  private static instance: TeamConfigService;
  private globalConfig: GlobalConfig | null = null;
  private teamConfigs: Map<string, TeamConfig> = new Map();

  private readonly configRoot: string;
  private readonly teamsConfigDir: string;
  private readonly globalConfigPath: string;

  private constructor() {
    this.configRoot = path.join(homedir(), '.smartflow', 'config');
    this.teamsConfigDir = path.join(this.configRoot, 'teams');
    this.globalConfigPath = path.join(this.configRoot, 'config.yaml');

    this.initConfigDirs();
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
    fs.ensureDirSync(this.configRoot);
    fs.ensureDirSync(this.teamsConfigDir);

    // 如果全局配置文件不存在，创建默认配置
    if (!fs.existsSync(this.globalConfigPath)) {
      const defaultConfig: GlobalConfig = {
        logLevel: 'info',
        dataDir: path.join(homedir(), '.smartflow', 'data'),
        llm: {
          provider: 'claude',
          model: 'claude-3-5-sonnet-20240620',
        },
      };
      fs.writeFileSync(this.globalConfigPath, yaml.stringify(defaultConfig));
      logger.info('已创建默认全局配置文件', { path: this.globalConfigPath });
    }
  }

  /**
   * 加载全局配置
   */
  public async loadGlobalConfig(): Promise<GlobalConfig> {
    try {
      const content = await fs.readFile(this.globalConfigPath, 'utf-8');
      const config = yaml.parse(content);
      const validatedConfig = GlobalConfigSchema.parse(config);
      this.globalConfig = validatedConfig;
      return validatedConfig;
    } catch (error) {
      if (error instanceof ZodError) {
        logger.error('全局配置校验失败', { errors: error.errors });
        throw new Error(`全局配置校验失败: ${JSON.stringify(error.errors)}`);
      }
      logger.error('加载全局配置失败', { error: (error as Error).message });
      throw new Error(`加载全局配置失败: ${(error as Error).message}`);
    }
  }

  /**
   * 获取全局配置
   */
  public getGlobalConfig(): GlobalConfig {
    if (!this.globalConfig) {
      throw new Error('全局配置未加载，请先调用 loadGlobalConfig()');
    }
    return this.globalConfig;
  }

  /**
   * 保存全局配置
   */
  public async saveGlobalConfig(config: Partial<GlobalConfig>): Promise<void> {
    const currentConfig = await this.loadGlobalConfig();
    const newConfig = { ...currentConfig, ...config };
    const validatedConfig = GlobalConfigSchema.parse(newConfig);
    await fs.writeFile(this.globalConfigPath, yaml.stringify(validatedConfig));
    this.globalConfig = validatedConfig;
    logger.info('全局配置已保存');
  }

  /**
   * 加载所有团队配置
   */
  public async loadAllTeamConfigs(): Promise<TeamConfig[]> {
    this.teamConfigs.clear();

    const files = await fs.readdir(this.teamsConfigDir);
    const yamlFiles = files.filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));

    const configs: TeamConfig[] = [];
    for (const file of yamlFiles) {
      try {
        const content = await fs.readFile(path.join(this.teamsConfigDir, file), 'utf-8');
        const config = yaml.parse(content);
        const validatedConfig = TeamConfigSchema.parse(config);
        this.teamConfigs.set(validatedConfig.teamId, validatedConfig);
        configs.push(validatedConfig);
      } catch (error) {
        logger.error(`加载团队配置文件失败: ${file}`, { error: (error as Error).message });
      }
    }

    logger.info(`已加载 ${configs.length} 个团队配置`);
    return configs;
  }

  /**
   * 获取指定团队的配置
   */
  public async getTeamConfig(teamId: string): Promise<TeamConfig> {
    // 先检查内存中是否有
    if (this.teamConfigs.has(teamId)) {
      return this.teamConfigs.get(teamId)!;
    }

    // 从文件加载
    const configPath = path.join(this.teamsConfigDir, `${teamId}.yaml`);
    if (!fs.existsSync(configPath)) {
      throw new Error(`团队配置不存在: ${teamId}`);
    }

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = yaml.parse(content);
      const validatedConfig = TeamConfigSchema.parse(config);
      this.teamConfigs.set(teamId, validatedConfig);
      return validatedConfig;
    } catch (error) {
      if (error instanceof ZodError) {
        logger.error(`团队配置校验失败: ${teamId}`, { errors: error.errors });
        throw new Error(`团队配置校验失败: ${JSON.stringify(error.errors)}`);
      }
      logger.error(`加载团队配置失败: ${teamId}`, { error: (error as Error).message });
      throw new Error(`加载团队配置失败: ${(error as Error).message}`);
    }
  }

  /**
   * 保存团队配置
   */
  public async saveTeamConfig(config: TeamConfig): Promise<void> {
    try {
      const validatedConfig = TeamConfigSchema.parse(config);
      const configPath = path.join(this.teamsConfigDir, `${validatedConfig.teamId}.yaml`);
      await fs.writeFile(configPath, yaml.stringify(validatedConfig));
      this.teamConfigs.set(validatedConfig.teamId, validatedConfig);
      logger.info(`团队配置已保存: ${validatedConfig.teamId}`, { path: configPath });
    } catch (error) {
      if (error instanceof ZodError) {
        logger.error('团队配置校验失败', { errors: error.errors });
        throw new Error(`团队配置校验失败: ${JSON.stringify(error.errors)}`);
      }
      logger.error('保存团队配置失败', { error: (error as Error).message });
      throw new Error(`保存团队配置失败: ${(error as Error).message}`);
    }
  }

  /**
   * 删除团队配置
   */
  public async deleteTeamConfig(teamId: string): Promise<void> {
    const configPath = path.join(this.teamsConfigDir, `${teamId}.yaml`);
    if (fs.existsSync(configPath)) {
      await fs.remove(configPath);
      this.teamConfigs.delete(teamId);
      logger.info(`团队配置已删除: ${teamId}`);
    } else {
      throw new Error(`团队配置不存在: ${teamId}`);
    }
  }

  /**
   * 获取所有团队ID列表
   */
  public async getAllTeamIds(): Promise<string[]> {
    const files = await fs.readdir(this.teamsConfigDir);
    return files
      .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'))
      .map(file => file.replace(/\.(yaml|yml)$/, ''));
  }

  /**
   * 检查团队配置是否存在
   */
  public async teamConfigExists(teamId: string): Promise<boolean> {
    const configPath = path.join(this.teamsConfigDir, `${teamId}.yaml`);
    return fs.existsSync(configPath);
  }

  /**
   * 创建团队配置模板
   */
  public createTeamConfigTemplate(teamId: string, teamName: string): TeamConfig {
    return {
      teamId,
      teamName,
      feishu: {
        appId: '',
        appSecret: '',
        scopes: [],
      },
      dataSources: {
        docs: {
          enabled: false,
          rootFolderToken: '',
          includeUsers: [],
          excludeDirs: [],
        },
        tasks: {
          enabled: false,
          projectIds: [],
        },
        meetings: {
          enabled: false,
          calendarIds: [],
        },
      },
      generate: {
        cycle: 'weekly',
        template: 'default',
        includeRisks: true,
        includeNextWeekPlan: true,
        detailLevel: 'medium',
      },
      push: {
        enabled: false,
        cronExpression: '0 18 * * 5',
        channels: [],
        needAudit: false,
        auditorId: '',
      },
      filters: {
        excludeKeywords: [],
        excludeUsers: [],
      },
    };
  }
}
