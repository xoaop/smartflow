#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { version } from '../../package.json';
import { TeamConfigService } from '../modules/config/team-config.service';
import { FeishuCollectorService } from '../modules/collector/feishu-collector.service';
import { ReportGeneratorService } from '../modules/generator/report-generator.service';
import { FeishuPushService } from '../modules/push/feishu-push.service';
import { SchedulerService } from '../modules/schedule/scheduler.service';
import { Logger } from '../common/logger/logger';

const logger = Logger.getInstance();
const configService = TeamConfigService.getInstance();
const collectorService = new FeishuCollectorService();
const generatorService = new ReportGeneratorService();
const schedulerService = SchedulerService.getInstance();

const program = new Command();

// 全局配置
program
  .name('smartflow')
  .description('基于飞书OpenClaw的团队效能周报生成系统')
  .version(version)
  .option('-v, --version', '输出版本号')
  .option('-d, --debug', '开启调试模式')
  .hook('preAction', async (thisCommand) => {
    // 加载全局配置
    const globalConfig = await configService.loadGlobalConfig();

    // 设置日志级别
    if (thisCommand.opts().debug) {
      logger.setLevel('debug');
    } else {
      logger.setLevel(globalConfig.logLevel);
    }
  });

// 配置相关命令
const configCommand = program.command('config')
  .description('配置管理');

configCommand
  .command('list')
  .description('列出所有团队配置')
  .action(async () => {
    try {
      const teamIds = await configService.getAllTeamIds();
      if (teamIds.length === 0) {
        console.log(chalk.yellow('暂无团队配置'));
        return;
      }

      console.log(chalk.green('团队配置列表:'));
      for (const teamId of teamIds) {
        const config = await configService.getTeamConfig(teamId);
        console.log(`  - ${chalk.blue(teamId)} (${config.teamName})`);
        console.log(`    周期: ${config.generate.cycle} | 推送: ${config.push.enabled ? '已启用' : '已禁用'}`);
        console.log();
      }
    } catch (error) {
      console.error(chalk.red('获取团队配置列表失败:'), (error as Error).message);
      process.exit(1);
    }
  });

configCommand
  .command('create <teamId> <teamName>')
  .description('创建新的团队配置模板')
  .action(async (teamId, teamName) => {
    try {
      if (await configService.teamConfigExists(teamId)) {
        console.error(chalk.red(`团队配置 ${teamId} 已存在`));
        process.exit(1);
      }

      const template = configService.createTeamConfigTemplate(teamId, teamName);
      await configService.saveTeamConfig(template);
      console.log(chalk.green(`团队配置模板已创建: ${teamId}`));
      console.log(chalk.gray(`请编辑配置文件: ~/.smartflow/config/teams/${teamId}.yaml`));
    } catch (error) {
      console.error(chalk.red('创建团队配置失败:'), (error as Error).message);
      process.exit(1);
    }
  });

configCommand
  .command('show <teamId>')
  .description('显示指定团队的配置')
  .action(async (teamId) => {
    try {
      const config = await configService.getTeamConfig(teamId);
      console.log(chalk.green(`团队配置: ${teamId} (${config.teamName})`));
      console.log(JSON.stringify(config, null, 2));
    } catch (error) {
      console.error(chalk.red('获取团队配置失败:'), (error as Error).message);
      process.exit(1);
    }
  });

configCommand
  .command('delete <teamId>')
  .description('删除指定团队的配置')
  .action(async (teamId) => {
    try {
      await configService.deleteTeamConfig(teamId);
      console.log(chalk.green(`团队配置已删除: ${teamId}`));
    } catch (error) {
      console.error(chalk.red('删除团队配置失败:'), (error as Error).message);
      process.exit(1);
    }
  });

// 生成相关命令
const generateCommand = program.command('generate')
  .description('生成周报');

generateCommand
  .command('run')
  .description('手动生成周报')
  .requiredOption('-t, --team <teamId>', '团队ID')
  .option('-r, --range <range>', '时间范围: lastweek, thisweek, lastmonth, thismonth, 或自定义如 2024-01-01~2024-01-07', 'lastweek')
  .option('-p, --push', '生成后自动推送')
  .option('-o, --output <file>', '输出到文件')
  .action(async (options) => {
    try {
      const teamId = options.team;
      const teamConfig = await configService.getTeamConfig(teamId);

      // 解析时间范围
      const timeRange = collectorService.parseTimeRange(options.range);
      console.log(chalk.blue(`生成 ${teamConfig.teamName} 的周报，时间范围: ${timeRange.start.toLocaleDateString()} ~ ${timeRange.end.toLocaleDateString()}`));

      // 1. 采集数据
      console.log(chalk.gray('1/3 正在采集数据...'));
      const collectedData = await collectorService.collect(teamConfig, timeRange);
      console.log(chalk.green(`   采集完成：文档 ${collectedData.docs.length} 篇，任务 ${collectedData.tasks.length} 个，会议 ${collectedData.meetings.length} 个`));

      // 2. 生成周报
      console.log(chalk.gray('2/3 正在生成周报内容...'));
      const report = await generatorService.generate(collectedData, teamConfig);
      console.log(chalk.green('   周报生成完成'));

      // 3. 输出或推送
      if (options.output) {
        const fs = await import('fs-extra');
        await fs.writeJson(options.output, report, { spaces: 2 });
        console.log(chalk.green(`周报已保存到文件: ${options.output}`));
      } else {
        console.log(chalk.green('\n📋 周报内容预览：'));
        console.log('='.repeat(60));
        console.log(chalk.bold('整体概览：'));
        console.log(report.content.overview);
        console.log();

        if (report.content.keyWork.length > 0) {
          console.log(chalk.bold('重点工作：'));
          report.content.keyWork.forEach((work, index) => {
            console.log(`${index + 1}. ${work.title} (${work.author})`);
          });
          console.log();
        }

        if (report.content.riskWarnings.length > 0) {
          console.log(chalk.bold('风险预警：'));
          report.content.riskWarnings.forEach((risk, index) => {
            const levelIcon = risk.level === 'high' ? '🔴' : risk.level === 'medium' ? '🟡' : '🟢';
            console.log(`${index + 1}. ${levelIcon} ${risk.content}`);
          });
          console.log();
        }
      }

      // 自动推送
      if (options.push) {
        console.log(chalk.gray('3/3 正在推送周报...'));
        const pushService = new FeishuPushService(teamConfig);
        const result = await pushService.pushWeeklyReport(report);

        if (result.status === 'success') {
          const successCount = result.results.filter(r => r.success).length;
          console.log(chalk.green(`   推送完成：成功 ${successCount} 个，失败 ${result.results.length - successCount} 个`));
        } else if (result.status === 'pending_audit') {
          console.log(chalk.yellow('   周报已推送给审核人，等待审核后推送'));
        } else {
          console.log(chalk.red('   推送失败'));
        }
      }

    } catch (error) {
      console.error(chalk.red('生成周报失败:'), (error as Error).message);
      process.exit(1);
    }
  });

generateCommand
  .command('collect')
  .description('仅采集数据，不生成报告')
  .requiredOption('-t, --team <teamId>', '团队ID')
  .option('-r, --range <range>', '时间范围', 'lastweek')
  .option('-o, --output <file>', '输出到文件')
  .action(async (options) => {
    try {
      const teamConfig = await configService.getTeamConfig(options.team);
      const timeRange = collectorService.parseTimeRange(options.range);

      console.log(chalk.blue('正在采集数据...'));
      const collectedData = await collectorService.collect(teamConfig, timeRange);

      console.log(chalk.green(`采集完成：文档 ${collectedData.docs.length} 篇，任务 ${collectedData.tasks.length} 个，会议 ${collectedData.meetings.length} 个`));

      if (options.output) {
        const fs = await import('fs-extra');
        await fs.writeJson(options.output, collectedData, { spaces: 2 });
        console.log(chalk.green(`数据已保存到文件: ${options.output}`));
      }
    } catch (error) {
      console.error(chalk.red('采集数据失败:'), (error as Error).message);
      process.exit(1);
    }
  });

// 推送相关命令
const pushCommand = program.command('push')
  .description('推送周报');

pushCommand
  .command('test <teamId>')
  .description('测试推送功能')
  .action(async (teamId) => {
    try {
      const teamConfig = await configService.getTeamConfig(teamId);
      const pushService = new FeishuPushService(teamConfig);

      console.log(chalk.blue(`正在测试推送到团队: ${teamConfig.teamName}`));
      const result = await pushService.pushTest();

      if (result.success) {
        console.log(chalk.green(`✅ 测试推送成功: ${result.message}`));
      } else {
        console.log(chalk.red(`❌ 测试推送失败: ${result.message}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('测试推送失败:'), (error as Error).message);
      process.exit(1);
    }
  });

pushCommand
  .command('file <teamId> <filePath>')
  .description('推送本地JSON文件中的周报')
  .action(async (teamId, filePath) => {
    try {
      const fs = await import('fs-extra');
      const teamConfig = await configService.getTeamConfig(teamId);
      const report = await fs.readJson(filePath);

      console.log(chalk.blue(`正在推送周报: ${filePath}`));
      const pushService = new FeishuPushService(teamConfig);
      const result = await pushService.pushWeeklyReport(report);

      if (result.status === 'success') {
        const successCount = result.results.filter(r => r.success).length;
        console.log(chalk.green(`✅ 推送完成：成功 ${successCount} 个，失败 ${result.results.length - successCount} 个`));
      } else if (result.status === 'pending_audit') {
        console.log(chalk.yellow('⏳ 周报已推送给审核人，等待审核后推送'));
      } else {
        console.log(chalk.red('❌ 推送失败'));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('推送周报失败:'), (error as Error).message);
      process.exit(1);
    }
  });

// 定时任务相关命令
const scheduleCommand = program.command('schedule')
  .description('定时任务管理');

scheduleCommand
  .command('start')
  .description('启动定时任务服务')
  .action(async () => {
    try {
      console.log(chalk.blue('启动定时任务服务...'));
      await schedulerService.start();
      console.log(chalk.green('✅ 定时任务服务已启动，按 Ctrl+C 停止'));

      // 保持进程运行
      process.stdin.resume();

      // 处理退出信号
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\n正在停止定时任务服务...'));
        schedulerService.stop();
        console.log(chalk.green('✅ 定时任务服务已停止'));
        process.exit(0);
      });

    } catch (error) {
      console.error(chalk.red('启动定时任务服务失败:'), (error as Error).message);
      process.exit(1);
    }
  });

scheduleCommand
  .command('list')
  .description('列出所有定时任务')
  .action(async () => {
    try {
      const statuses = schedulerService.getJobStatuses();

      if (statuses.length === 0) {
        console.log(chalk.yellow('暂无定时任务'));
        return;
      }

      console.log(chalk.green('定时任务列表:'));
      console.log('='.repeat(80));
      console.log(`${chalk.bold('团队ID')} | ${chalk.bold('Cron表达式')} | ${chalk.bold('状态')} | ${chalk.bold('下次运行')}`);
      console.log('-'.repeat(80));

      for (const status of statuses) {
        const statusText = status.enabled ? chalk.green('已启用') : chalk.gray('已禁用');
        const nextRun = status.nextRun ? new Date(status.nextRun).toLocaleString() : '-';
        console.log(`${status.teamId} | ${status.cronExpression} | ${statusText} | ${nextRun}`);
      }

    } catch (error) {
      console.error(chalk.red('获取定时任务列表失败:'), (error as Error).message);
      process.exit(1);
    }
  });

scheduleCommand
  .command('trigger <teamId>')
  .description('手动触发指定团队的定时任务')
  .action(async (teamId) => {
    try {
      console.log(chalk.blue(`手动触发团队 ${teamId} 的任务...`));
      await schedulerService.triggerJob(teamId);
      console.log(chalk.green('✅ 任务执行完成'));
    } catch (error) {
      console.error(chalk.red('执行任务失败:'), (error as Error).message);
      process.exit(1);
    }
  });

scheduleCommand
  .command('add <teamId>')
  .description('为团队添加定时任务')
  .action(async (teamId) => {
    try {
      const teamConfig = await configService.getTeamConfig(teamId);

      if (!teamConfig.push.enabled) {
        console.log(chalk.yellow('该团队推送功能未启用，请先在配置中启用推送并设置cron表达式'));
        process.exit(1);
      }

      await schedulerService.scheduleJob(teamConfig);
      console.log(chalk.green(`✅ 已为团队 ${teamId} 添加定时任务，Cron: ${teamConfig.push.cronExpression}`));
    } catch (error) {
      console.error(chalk.red('添加定时任务失败:'), (error as Error).message);
      process.exit(1);
    }
  });

scheduleCommand
  .command('remove <teamId>')
  .description('移除团队的定时任务')
  .action(async (teamId) => {
    try {
      schedulerService.cancelJob(teamId);
      console.log(chalk.green(`✅ 已移除团队 ${teamId} 的定时任务`));
    } catch (error) {
      console.error(chalk.red('移除定时任务失败:'), (error as Error).message);
      process.exit(1);
    }
  });

// 健康检查命令
program
  .command('health')
  .description('健康检查')
  .action(async () => {
    try {
      console.log(chalk.green('✅ 服务运行正常'));
      console.log(chalk.blue('配置目录:'), '~/.smartflow/config');
      console.log(chalk.blue('日志目录:'), '~/.smartflow/logs');
      console.log(chalk.blue('数据目录:'), '~/.smartflow/data');

      const teamCount = (await configService.getAllTeamIds()).length;
      console.log(chalk.blue('团队配置数量:'), teamCount);
    } catch (error) {
      console.error(chalk.red('❌ 健康检查失败:'), (error as Error).message);
      process.exit(1);
    }
  });

// 捕获未处理的Promise rejection
process.on('unhandledRejection', (reason: any) => {
  logger.error('未处理的Promise拒绝', { reason: reason?.message || reason });
  console.error(chalk.red('发生未处理的错误:'), reason?.message || reason);
  process.exit(1);
});

// 捕获未捕获的异常
process.on('uncaughtException', (error: Error) => {
  logger.error('未捕获的异常', { error: error.message, stack: error.stack });
  console.error(chalk.red('发生未捕获的异常:'), error.message);
  process.exit(1);
});

// 解析命令
program.parseAsync(process.argv)
  .catch((error) => {
    logger.error('命令执行失败', { error: error.message });
    console.error(chalk.red('命令执行失败:'), error.message);
    process.exit(1);
  });
