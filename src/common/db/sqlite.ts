import * as sqlite3 from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs-extra';
import { homedir } from 'os';
import { Logger } from '../logger/logger';
import { TeamConfigService } from '../../modules/config/team-config.service';

const logger = Logger.getInstance();

/**
 * SQLite数据库封装
 */
export class SQLiteDatabase {
  private static instance: SQLiteDatabase;
  private db: sqlite3.Database;

  private constructor() {
    const configService = TeamConfigService.getInstance();
    const globalConfig = configService.getGlobalConfig();

    // 确保数据目录存在
    const dataDir = globalConfig.dataDir.replace('~', homedir());
    fs.ensureDirSync(dataDir);

    const dbPath = path.join(dataDir, 'smartflow.db');
    logger.debug('打开数据库', { path: dbPath });

    this.db = new sqlite3(dbPath);
    this.initTables();
  }

  public static getInstance(): SQLiteDatabase {
    if (!SQLiteDatabase.instance) {
      SQLiteDatabase.instance = new SQLiteDatabase();
    }
    return SQLiteDatabase.instance;
  }

  /**
   * 初始化数据库表
   */
  private initTables(): void {
    // 定时任务表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id VARCHAR(255) NOT NULL UNIQUE,
        cron_expression VARCHAR(255) NOT NULL,
        enabled BOOLEAN DEFAULT 1,
        last_run_at DATETIME,
        next_run_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 历史周报表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id VARCHAR(255) NOT NULL,
        time_range_start DATETIME NOT NULL,
        time_range_end DATETIME NOT NULL,
        content_json TEXT NOT NULL,
        sources_json TEXT,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(team_id, time_range_start, time_range_end)
      )
    `);

    // 推送记录表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS push_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        channel_type VARCHAR(50) NOT NULL,
        channel_id VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        message_id VARCHAR(255),
        error_message TEXT,
        pushed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(report_id) REFERENCES reports(id)
      )
    `);

    // 运行日志表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS execution_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id VARCHAR(255) NOT NULL,
        task_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        error_message TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        finished_at DATETIME
      )
    `);

    logger.debug('数据库表初始化完成');
  }

  /**
   * 执行查询
   */
  query<T = any>(sql: string, params: any[] = []): T[] {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params) as T[];
    } catch (error) {
      logger.error('数据库查询失败', { sql, params, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 执行单条查询
   */
  queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.get(...params) as T | undefined;
    } catch (error) {
      logger.error('数据库单条查询失败', { sql, params, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 执行写入操作
   */
  run(sql: string, params: any[] = []): { changes: number; lastInsertRowid: number | bigint } {
    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...params);
      return {
        changes: result.changes,
        lastInsertRowid: result.lastInsertRowid,
      };
    } catch (error) {
      logger.error('数据库写入失败', { sql, params, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 执行事务
   */
  transaction<T>(fn: () => T): T {
    try {
      const transaction = this.db.transaction(fn);
      return transaction();
    } catch (error) {
      logger.error('事务执行失败', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
    logger.debug('数据库连接已关闭');
  }

  /**
   * 获取原始数据库实例
   */
  getRawDB(): sqlite3.Database {
    return this.db;
  }
}
