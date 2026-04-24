import * as winston from 'winston';
import * as path from 'path';
import { homedir } from 'os';
import * as fs from 'fs-extra';

/**
 * 日志服务
 */
export class Logger {
  private static instance: Logger;
  private logger: winston.Logger;
  private readonly logDir: string;

  private constructor() {
    this.logDir = path.join(homedir(), '.smartflow', 'logs');
    fs.ensureDirSync(this.logDir);

    const logFormat = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss',
      }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    );

    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({
        format: 'HH:mm:ss',
      }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let metaStr = '';
        if (Object.keys(meta).length > 0) {
          metaStr = ' ' + JSON.stringify(meta);
        }
        return `${timestamp} [${level}]: ${message}${metaStr}`;
      }),
    );

    this.logger = winston.createLogger({
      level: 'info',
      format: logFormat,
      transports: [
        // 错误日志
        new winston.transports.File({
          filename: path.join(this.logDir, 'error.log'),
          level: 'error',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
        // 所有日志
        new winston.transports.File({
          filename: path.join(this.logDir, 'combined.log'),
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 10,
        }),
      ],
    });

    // 开发环境输出到控制台
    if (process.env.NODE_ENV !== 'production') {
      this.logger.add(new winston.transports.Console({
        format: consoleFormat,
      }));
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * 设置日志级别
   */
  public setLevel(level: 'error' | 'warn' | 'info' | 'debug'): void {
    this.logger.level = level;
  }

  /**
   * 信息日志
   */
  public info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  /**
   * 警告日志
   */
  public warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  /**
   * 错误日志
   */
  public error(message: string, meta?: any): void {
    this.logger.error(message, meta);
  }

  /**
   * 调试日志
   */
  public debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  /**
   * 获取原始winston logger实例
   */
  public getLogger(): winston.Logger {
    return this.logger;
  }
}
