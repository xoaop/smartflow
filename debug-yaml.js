// 直接调试yaml解析
const fs = require('fs');
const yaml = require('yaml');
const path = require('path');

const configPath = path.join(process.cwd(), 'config/teams/dev.yaml');
const content = fs.readFileSync(configPath, 'utf-8');
const rawConfig = yaml.parse(content);

console.log('🔍 直接YAML解析结果:');
console.log('tasks.enabled:', rawConfig.dataSources.tasks.enabled);
console.log('tasks.taskListIds:', rawConfig.dataSources.tasks.taskListIds);
console.log('tasks:', rawConfig.dataSources.tasks);

// 现在用Schema解析
const { TeamConfigSchema } = require('./dist/modules/config/config.schema');
try {
  const parsedConfig = TeamConfigSchema.parse(rawConfig);
  console.log('\n✅ Zod解析结果:');
  console.log('tasks.enabled:', parsedConfig.dataSources.tasks.enabled);
  console.log('tasks.taskListIds:', parsedConfig.dataSources.tasks.taskListIds);
  console.log('tasks.projectIds:', parsedConfig.dataSources.tasks.projectIds);
} catch (error) {
  console.error('\n❌ Zod解析错误:', error);
}
