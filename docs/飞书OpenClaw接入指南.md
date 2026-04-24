# 飞书OpenClaw接入指南

## 一、OpenClaw 简介
OpenClaw 是飞书推出的开源CLI开发框架，用于快速构建和飞书生态深度集成的命令行工具。通过接入OpenClaw，可以让你的CLI工具获得以下能力：
- 统一的飞书身份认证，无需单独配置API密钥
- 飞书API的统一封装和权限管理
- 命令行和飞书客户端的联动能力
- 丰富的CLI组件和交互体验
- 飞书应用市场分发能力

## 二、接入优势
本项目原生支持OpenClaw接入，接入后可以获得以下好处：
1. **简化配置**：用户无需单独配置飞书AppId和AppSecret，直接复用OpenClaw的身份认证
2. **权限打通**：自动继承用户在飞书中的权限，无需单独为应用授权
3. **体验优化**：支持飞书卡片跳转、消息通知等原生交互
4. **分发便捷**：可以发布到飞书应用市场，企业内用户一键安装使用

## 三、接入步骤
### 3.1 环境准备
1. 安装OpenClaw CLI：
```bash
npm install -g @openclaw/cli
```

2. 登录飞书账号：
```bash
claw login
```

### 3.2 项目适配
本项目已经按照OpenClaw规范进行了设计，只需要进行少量适配即可接入：

#### 步骤1：添加OpenClaw依赖
在package.json中添加依赖：
```json
{
  "dependencies": {
    "@openclaw/sdk": "^1.0.0",
    "@openclaw/feishu": "^1.0.0"
  }
}
```

#### 步骤2：替换飞书客户端实现
修改 `src/common/feishu/client.ts`，使用OpenClaw提供的飞书客户端：

```typescript
import { FeishuClient as OpenClawFeishuClient } from '@openclaw/feishu';
import { TeamConfig } from '../../../src/types';
import { Logger } from '../logger/logger';

const logger = Logger.getInstance();

export class FeishuClient {
  private client: OpenClawFeishuClient;
  private teamConfig: TeamConfig;

  constructor(teamConfig: TeamConfig) {
    this.teamConfig = teamConfig;
    // 使用OpenClaw的飞书客户端，自动处理认证
    this.client = new OpenClawFeishuClient({
      appType: 'self-built',
      // 不需要再配置appId和appSecret，OpenClaw自动处理
    });
  }

  // 原有方法保持不变，内部调用this.client的对应方法
  async request<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options?: any
  ): Promise<T> {
    // 适配OpenClaw的调用方式
    const response = await this.client.request({
      method,
      url: path,
      params: options?.params,
      data: options?.data,
      headers: options?.headers,
    });
    return response.data as T;
  }
}
```

#### 步骤3：注册OpenClaw命令
在项目根目录创建 `claw.config.ts`：
```typescript
import { defineConfig } from '@openclaw/cli';

export default defineConfig({
  name: 'smartflow',
  description: '团队效能周报生成系统',
  version: '1.0.0',
  commands: [
    {
      name: 'generate',
      description: '生成周报',
      subCommands: [
        {
          name: 'run',
          description: '手动生成周报',
          options: [
            { name: '-t, --team <teamId>', description: '团队ID', required: true },
            { name: '-r, --range <range>', description: '时间范围', default: 'lastweek' },
            { name: '-p, --push', description: '生成后自动推送' },
          ],
          handler: async (options) => {
            // 调用原有CLI的对应逻辑
            const { generateRunHandler } = require('./src/cli/handlers/generate');
            await generateRunHandler(options);
          },
        },
      ],
    },
    // 其他命令注册...
  ],
});
```

#### 步骤4：调整配置管理
修改配置管理逻辑，优先从OpenClaw上下文中获取配置：
```typescript
// src/modules/config/team-config.service.ts
import { getContext } from '@openclaw/sdk';

public async getTeamConfig(teamId: string): Promise<TeamConfig> {
  // 优先从OpenClaw上下文获取配置
  const context = getContext();
  const openClawConfig = context.config.get(`teams.${teamId}`);
  
  if (openClawConfig) {
    return TeamConfigSchema.parse(openClawConfig);
  }
  
  //  fallback到原有的文件配置逻辑
  // ...
}
```

### 3.3 本地调试
1. 链接到OpenClaw：
```bash
claw link
```

2. 测试命令：
```bash
claw smartflow generate run --team my-team --range lastweek
```

### 3.4 发布到企业应用市场
1. 打包应用：
```bash
claw pack
```

2. 上传到飞书开放平台，提交审核发布。

## 四、OpenClaw 增强功能
接入OpenClaw后，可以扩展以下增强功能：

### 4.1 飞书侧栏快捷操作
在飞书客户端侧边栏添加快捷入口，用户可以直接在飞书中触发周报生成：
```typescript
// claw.config.ts 中添加扩展
export default defineConfig({
  // ...
  extensions: {
    'feishu:sidebar': {
      title: 'SmartFlow 周报',
      entries: [
        {
          title: '生成本周周报',
          command: 'smartflow generate run --team my-team --range thisweek --push',
        },
        {
          title: '查看历史周报',
          command: 'smartflow report list',
        },
      ],
    },
  },
});
```

### 4.2 消息卡片交互
支持飞书消息卡片的交互回调，比如审核通过/驳回操作：
```typescript
// 注册卡片回调
claw.event.on('feishu:card:action', async (event) => {
  if (event.data.action === 'approve_report') {
    // 处理审核通过逻辑
    const reportId = event.data.reportId;
    await pushService.approveAndPush(reportId);
  }
});
```

### 4.3 飞书快捷键支持
支持在飞书中通过快捷键快速触发功能：
```typescript
export default defineConfig({
  // ...
  shortcuts: [
    {
      key: 'Ctrl+Shift+G',
      description: '生成周报',
      command: 'smartflow generate run --team my-team --range thisweek',
    },
  ],
});
```

## 五、接入规范
为了更好地融入OpenClaw生态，建议遵循以下规范：

1. **命令命名规范**：使用简洁的动词+名词结构，避免过长的命令
2. **交互规范**：使用OpenClaw提供的UI组件（选择器、输入框、进度条等）提升用户体验
3. **错误处理规范**：使用OpenClaw提供的错误处理机制，统一错误提示风格
4. **配置规范**：优先使用OpenClaw的全局配置系统，减少用户手动配置文件
5. **日志规范**：使用OpenClaw提供的日志接口，统一日志格式

## 六、现有项目快速适配
如果你不想修改现有代码，也可以通过包装的方式快速接入：

1. 创建OpenClaw命令入口，直接调用原有CLI：
```typescript
// claw.config.ts
import { exec } from 'child_process';

export default defineConfig({
  name: 'smartflow',
  commands: [
    {
      name: 'generate',
      subCommands: [
        {
          name: 'run',
          options: [
            { name: '-t, --team <teamId>', required: true },
            { name: '-r, --range <range>', default: 'lastweek' },
          ],
          handler: async (options) => {
            const cmd = `node dist/cli/index.js generate run --team ${options.team} --range ${options.range}`;
            exec(cmd, (error, stdout, stderr) => {
              console.log(stdout);
              if (error) console.error(stderr);
            });
          },
        },
      ],
    },
  ],
});
```

2. 这种方式无需修改原有代码，即可快速接入OpenClaw生态。

## 七、最佳实践
1. **权限最小化**：只申请必要的飞书API权限，避免过度授权
2. **用户体验优先**：复杂操作提供引导式交互，减少命令行参数输入
3. **响应式设计**：命令执行时间较长时，提供进度条和状态提示
4. **数据安全**：敏感数据通过OpenClaw的安全存储能力保存，不要明文存储配置文件
5. **灰度发布**：新功能先在小范围测试，再全量发布
