#!/usr/bin/env node

/**
 * 独立周报生成脚本：不依赖OpenClaw平台，直接生成并推送周报
 * 可以直接运行或设置为定时任务
 * 核心脚本，用于周报推送
 */
const lark = require('@larksuiteoapi/node-sdk');
const dayjs = require('dayjs');
const fs = require('fs-extra');
const path = require('path');
const yaml = require('yaml');
const os = require('os');
const { OpenAI } = require('openai');

// 加载配置文件
const CONFIG_DIR = path.join(os.homedir(), '.smartflow', 'config');
const GLOBAL_CONFIG_PATH = path.join(CONFIG_DIR, 'config.yaml');
const TEAM_CONFIG_PATH = path.join(CONFIG_DIR, 'teams', 'dev.yaml');

// 读取全局配置
const globalConfig = yaml.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf-8'));
// 读取团队配置
const teamConfig = yaml.parse(fs.readFileSync(TEAM_CONFIG_PATH, 'utf-8'));

// 合并配置
const FEISHU_CONFIG = {
  appId: teamConfig.feishu.appId || globalConfig.feishu.appId || 'cli_a97eea6dd9b85bc2',
  appSecret: teamConfig.feishu.appSecret || globalConfig.feishu.appSecret || 'PDEc02CERlwwHuw29GZu7d4USyKwZ8iN',
  userAccessToken: 'u-eDPFMMp3p4oqbEIB6orTit00nUSR5lMpXEGa6wS2y3VG',
  // 从推送配置中获取群ID
  groupId: teamConfig.push.channels.find(c => c.type === 'group')?.id || 'oc_4c897c26ace4092fca3b6c75f03be51e'
};

// LLM配置（火山引擎Ark）
const LLM_CONFIG = {
  baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
  apiKey: 'ark-027be850-bee6-4992-a83b-ac129a17df29-a8876',
  model: 'ep-20260423222933-n4v5g'
};

// 数据源配置从团队配置读取
const DATA_SOURCES = {
  taskListIds: teamConfig.dataSources.tasks.taskListIds,
  docFolderToken: teamConfig.dataSources.docs.rootFolderToken.replace('folder_v2_', ''), // 去掉前缀
  calendarIds: teamConfig.dataSources.meetings.calendarIds,
  chatIds: teamConfig.dataSources.messages?.chatIds || []
};

class WeeklyReportGenerator {
  constructor() {
    this.client = new lark.Client({
      appId: FEISHU_CONFIG.appId,
      appSecret: FEISHU_CONFIG.appSecret,
    });

    // 初始化LLM客户端
    this.llm = new OpenAI({
      baseURL: LLM_CONFIG.baseURL,
      apiKey: LLM_CONFIG.apiKey,
    });
  }

  /**
   * 获取应用级AccessToken（用于发送群消息）
   */
  async getAppAccessToken() {
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: FEISHU_CONFIG.appId,
        app_secret: FEISHU_CONFIG.appSecret
      })
    });

    const result = await response.json();

    if (result.code !== 0) {
      throw new Error(`获取应用AccessToken失败: ${result.msg || result.message} (code: ${result.code})`);
    }

    return result.tenant_access_token;
  }

  /**
   * 使用LLM分析数据，生成深度洞察
   */
  async analyzeDataWithLLM(data) {
    const { tasks, docs, meetings, timeRange } = data;

    // 准备分析提示词
    const prompt = `
你是专业的团队效能分析师，请基于以下团队近期工作数据，生成深度工作分析和洞察：

【时间范围】
${dayjs(timeRange.start).format('YYYY-MM-DD')} ~ ${dayjs(timeRange.end).format('YYYY-MM-DD')}

【任务数据】
${JSON.stringify(tasks, null, 2)}

【文档数据】
${JSON.stringify(docs, null, 2)}

【会议数据】
${JSON.stringify(meetings, null, 2)}

请生成以下内容，要求语言简洁专业，信息密度高，避免废话：

1. 【核心工作摘要】：用3-5句话总结团队近期核心工作方向和重点
2. 【进度分析】：分析当前任务完成情况，指出进展顺利的方面和存在的滞后风险
3. 【风险预警】：识别潜在的风险点（如任务逾期、资源不足、协作阻塞等），每个风险点要有具体的事实依据
4. 【下周建议】：给出3-5条具体可落地的工作建议，针对性解决当前问题
5. 【效能洞察】：从数据中发现的团队协作、工作模式的亮点或可优化点

注意：
- 所有分析必须基于提供的数据，不能编造信息
- 如果数据不足，可以说明"当前数据量有限，暂无法分析"
- 用Markdown格式输出，不要用任何多余的解释
`;

    try {
      console.log('正在进行AI智能分析...');
      const response = await this.llm.chat.completions.create({
        model: LLM_CONFIG.model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('LLM分析失败:', error.message);
      return '⚠️ AI分析暂时不可用，展示原始数据';
    }
  }

  /**
   * 通用API请求（直接使用fetch，避免SDK路径问题）
   */
  async request(method, path, params = {}, data = {}, useAppToken = false) {
    let url = `https://open.feishu.cn/open-apis${path}`;

    // 构建查询参数
    if (Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        searchParams.append(key, value);
      });
      url += `?${searchParams.toString()}`;
    }

    // 选择使用的token
    const token = useAppToken ? await this.getAppAccessToken() : FEISHU_CONFIG.userAccessToken;

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    if (Object.keys(data).length > 0) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    const result = await response.json();

    if (result.code !== 0) {
      throw new Error(`API请求失败: ${result.msg || result.message} (code: ${result.code})`);
    }

    return result.data || result;
  }

  /**
   * 采集所有数据
   */
  async collectData() {
    const now = dayjs();
    const startTime = now.subtract(30, 'day').startOf('day').toDate(); // 采集最近30天数据
    const endTime = now.endOf('day').toDate();

    console.log(`采集时间范围: ${dayjs(startTime).format('YYYY-MM-DD')} ~ ${dayjs(endTime).format('YYYY-MM-DD')}`);

    // 采集任务
    console.log('采集任务数据...');
    const tasks = [];
    for (const taskListId of DATA_SOURCES.taskListIds) {
      const response = await this.request('GET', `/task/v2/tasklists/${taskListId}/tasks`, { page_size: 50 });
      tasks.push(...(response.items || []));
    }
    console.log(`采集到 ${tasks.length} 个任务`);

    // 采集文档
    console.log('采集文档数据...');
    const files = await this.request('GET', '/drive/v1/files', {
      folder_token: DATA_SOURCES.docFolderToken,
      page_size: 50
    });
    console.log(`采集到 ${files.files?.length || 0} 个文档`);

    // 采集会议
    console.log('采集会议数据...');
    const meetings = [];
    for (const calendarId of DATA_SOURCES.calendarIds) {
      const response = await this.request('GET', `/calendar/v4/calendars/${calendarId}/events`, {
        start_time: String(Math.floor(startTime.getTime() / 1000)),
        end_time: String(Math.floor(endTime.getTime() / 1000)),
        page_size: 50
      });
      meetings.push(...(response.items || []));
    }
    console.log(`采集到 ${meetings.length} 个会议`);

    return {
      timeRange: { start: startTime, end: endTime },
      tasks: tasks.map(t => ({
        id: t.guid,
        title: t.summary,
        status: t.completed ? 'done' : 'in_progress',
        url: `https://applink.feishu.cn/client/todo/detail?guid=${t.guid}`,
        assignee: t.members?.find(m => m.role === 'assignee')?.name || '未分配'
      })),
      docs: files.files?.map(f => ({
        id: f.token,
        title: f.name,
        type: f.type,
        url: f.url,
        modifiedTime: new Date(Number(f.modified_time) * 1000)
      })) || [],
      meetings: meetings.map(m => ({
        id: m.event_id,
        title: m.summary,
        startTime: new Date(Number(m.start_time.timestamp) * 1000),
        url: m.app_link,
        organizer: m.event_organizer?.display_name || '未知'
      }))
    };
  }

  /**
   * 生成周报内容
   */
  generateReportContent(data, aiAnalysis) {
    const { tasks, docs, meetings, timeRange } = data;

    let content = `# 📊 团队周报 (${dayjs(timeRange.start).format('YYYY-MM-DD')} ~ ${dayjs(timeRange.end).format('YYYY-MM-DD')})

## 🤖 AI智能洞察
${aiAnalysis}
`;

    // 完成事项
    const completedTasks = tasks.filter(t => t.status === 'done');
    const inProgressTasks = tasks.filter(t => t.status === 'in_progress');

    content += `## ✅ 完成工作\n\n`;
    if (completedTasks.length > 0) {
      completedTasks.forEach(task => {
        content += `- [${task.title}](${task.url}) (负责人: ${task.assignee})\n`;
      });
    } else {
      content += "- 本周无已完成任务\n";
    }

    // 进行中工作
    content += `\n## 🚀 进行中工作\n\n`;
    if (inProgressTasks.length > 0) {
      inProgressTasks.forEach(task => {
        content += `- [${task.title}](${task.url}) (负责人: ${task.assignee})\n`;
      });
    } else {
      content += "- 本周无进行中任务\n";
    }

    // 文档更新
    content += `\n## 📄 文档更新\n\n`;
    if (docs.length > 0) {
      docs.slice(0, 10).forEach(doc => {
        content += `- [${doc.title}](${doc.url}) (更新时间: ${dayjs(doc.modifiedTime).format('MM-DD HH:mm')})\n`;
      });
    } else {
      content += "- 本周无文档更新\n";
    }

    // 会议记录
    content += `\n## 📅 会议记录\n\n`;
    if (meetings.length > 0) {
      meetings.slice(0, 10).forEach(meeting => {
        content += `- [${meeting.title}](${meeting.url}) (时间: ${dayjs(meeting.startTime).format('MM-DD HH:mm')}，组织者: ${meeting.organizer})\n`;
      });
    } else {
      content += "- 本周无会议记录\n";
    }

    // 数据统计
    content += `\n## 📈 数据统计\n\n`;
    content += `- 任务总数: ${tasks.length} (完成: ${completedTasks.length}, 进行中: ${inProgressTasks.length})\n`;
    content += `- 文档更新: ${docs.length} 篇\n`;
    content += `- 会议数量: ${meetings.length} 个\n`;

    return content;
  }

  /**
   * 推送到飞书群
   */
  async pushToFeishu(content) {
    try {
      console.log('正在推送周报到飞书群...');

      // 解析内容
      const sections = content.split('\n## ').filter(s => s.trim());
      const elements = [];

      // 统计数据模块（从原始数据提取）
      const taskStats = {
        total: this.currentData.tasks.length,
        completed: this.currentData.tasks.filter(t => t.status === 'done').length,
        inProgress: this.currentData.tasks.filter(t => t.status === 'in_progress').length,
        docs: this.currentData.docs.length,
        meetings: this.currentData.meetings.length
      };

      // 添加数据概览卡片
      elements.push({
        tag: "column_set",
        flex_mode: "equal",
        background_style: "grey",
        columns: [
          {
            tag: "column",
            elements: [
              {
                tag: "markdown",
                content: `**📝 任务总数**\n**<font color="blue" size="6">${taskStats.total}</font>**`
              }
            ]
          },
          {
            tag: "column",
            elements: [
              {
                tag: "markdown",
                content: `**✅ 已完成**\n**<font color="green" size="6">${taskStats.completed}</font>**`
              }
            ]
          },
          {
            tag: "column",
            elements: [
              {
                tag: "markdown",
                content: `**🚀 进行中**\n**<font color="orange" size="6">${taskStats.inProgress}</font>**`
              }
            ]
          }
        ]
      });

      elements.push({
        tag: "column_set",
        flex_mode: "equal",
        background_style: "grey",
        columns: [
          {
            tag: "column",
            elements: [
              {
                tag: "markdown",
                content: `**📄 文档更新**\n**<font color="purple" size="6">${taskStats.docs}</font>**`
              }
            ]
          },
          {
            tag: "column",
            elements: [
              {
                tag: "markdown",
                content: `**📅 会议数量**\n**<font color="indigo" size="6">${taskStats.meetings}</font>**`
              }
            ]
          },
          {
            tag: "column",
            elements: [
              {
                tag: "markdown",
                content: `**📊 完成率**\n**<font color="green" size="6">${taskStats.total > 0 ? Math.round(taskStats.completed / taskStats.total * 100) : 0}%</font>**`
              }
            ]
          }
        ]
      });

      elements.push({ tag: 'hr' });

      // 内容图标映射
      const iconMap = {
        '🤖 AI智能洞察': '🤖',
        '✅ 完成工作': '✅',
        '🚀 进行中工作': '🚀',
        '📄 文档更新': '📄',
        '📅 会议记录': '📅',
        '📈 数据统计': '📈'
      };

      // 处理每个内容部分
      sections.forEach((section, index) => {
        if (index === 0) return; // 跳过主标题

        const lines = section.split('\n');
        const title = lines[0].trim();
        const icon = iconMap[title] || '📌';

        // 模块标题
        elements.push({
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**<font color="#1565c0" size="4">${icon} ${title}</font>**`
          }
        });

        // 模块内容 - 处理各级标题和列表样式
        const contentLines = lines.slice(1).filter(l => l.trim());
        let processedContent = '\n' + contentLines.join('\n') + '\n';

        // 清理多余的#号
        processedContent = processedContent.replace(/#+ /g, '');

        // 处理三级标题（包含数字编号的情况，如 "1. 标题"、"3. 风险预警" 等）
        processedContent = processedContent.replace(/\n(\d+\. .*?)(\n|$)/g, (match, title) => {
          return `\n**<font color="#2e7d32" size="3">▸ ${title.trim()}</font>**\n`;
        });

        // 处理四级标题
        processedContent = processedContent.replace(/\n(亮点|可优化点|进展顺利.*?|滞后风险.*?)(\n|$)/gi, (match, title) => {
          return `\n**<font color="#689f38" size="2">▪ ${title.trim()}</font>**\n`;
        });

        // 处理无序列表 - 优化样式
        processedContent = processedContent.replace(/^- (.*?)(\n|$)/gm, (match, item) => {
          return `  <font color="#1976d2">•</font> ${item}\n`;
        });

        // 处理有序列表
        processedContent = processedContent.replace(/^(\d+)\. (.*?)(\n|$)/gm, (match, num, item) => {
          return `  <font color="#1976d2">${num}.</font> ${item}\n`;
        });

        // 处理引用块
        processedContent = processedContent.replace(/^> (.*?)(\n|$)/gm, (match, quote) => {
          return `> <font color="#757575">${quote}</font>\n`;
        });

        if (processedContent.trim()) {
          elements.push({
            tag: 'div',
            text: {
              tag: 'lark_md',
              content: processedContent
            },
            style: {
              margin: '10px 0 20px 20px'
            }
          });
        }

        elements.push({ tag: 'hr' });
      });

      // 移除最后一个多余的分隔线
      if (elements.length > 0 && elements[elements.length - 1].tag === 'hr') {
        elements.pop();
      }

      // 底部操作按钮
      elements.push({
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '🔄 重新生成'
            },
            type: 'primary',
            value: {
              action: 'regenerate'
            }
          },
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '📋 查看详情'
            },
            type: 'default',
            value: {
              action: 'view_detail'
            }
          }
        ]
      });

      // 构建飞书卡片消息
      const card = {
        config: {
          wide_screen_mode: true,
          enable_forward: true
        },
        header: {
          title: {
            tag: 'plain_text',
            content: `📊 团队周报 (${dayjs().subtract(30, 'day').format('MM-DD')} ~ ${dayjs().format('MM-DD')})`
          },
          template: 'blue'
        },
        elements: elements
      };

      // 调用飞书消息发送API（使用应用级AccessToken）
      const response = await this.request('POST', '/im/v1/messages',
        { receive_id_type: 'chat_id' },
        {
          receive_id: FEISHU_CONFIG.groupId,
          msg_type: 'interactive',
          content: JSON.stringify(card) // 直接序列化卡片对象，不需要外层card
        },
        true // 使用应用级token
      );

      if (response.message_id) {
        console.log('✅ 周报推送成功，消息ID:', response.message_id);
      } else {
        console.error('❌ 周报推送失败:', response);
      }

    } catch (error) {
      console.error('❌ 推送周报失败:', error.message);
      if (error.response) {
        console.error('错误详情:', error.response.data);
      }
      console.log('生成的周报内容：\n', content);
    }
  }

  /**
   * 运行完整流程
   */
  async run() {
    try {
      console.log('开始生成周报...');

      // 1. 采集数据
      const data = await this.collectData();
      this.currentData = data; // 保存数据供卡片使用

      // 2. LLM深度分析
      const aiAnalysis = await this.analyzeDataWithLLM(data);

      // 3. 生成周报
      const content = this.generateReportContent(data, aiAnalysis);

      // 4. 推送周报
      await this.pushToFeishu(content);

      console.log('✅ 周报生成完成！');
      return content;

    } catch (error) {
      console.error('❌ 周报生成失败:', error);
      throw error;
    }
  }
}

// 运行脚本
if (require.main === module) {
  const generator = new WeeklyReportGenerator();
  generator.run()
    .then(content => {
      // 保存到文件
      const outputPath = path.join(__dirname, `weekly-report-${dayjs().format('YYYYMMDD')}.md`);
      fs.writeFileSync(outputPath, content, 'utf-8');
      console.log(`周报已保存到: ${outputPath}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = WeeklyReportGenerator;
