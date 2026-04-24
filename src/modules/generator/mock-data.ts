import { CollectedData, DocItem, TaskItem, MeetingItem } from '../../types';
import dayjs from 'dayjs';

/**
 * 生成模拟采集数据
 */
export function generateMockData(): CollectedData {
  const now = new Date();
  const startOfWeek = dayjs().startOf('week').toDate();
  const endOfWeek = dayjs().endOf('week').toDate();

  // 模拟文档数据
  const docs: DocItem[] = [
    {
      id: 'doc1',
      title: 'Q2项目规划文档',
      url: 'https://feishu.cn/docx/doc1',
      modifiedTime: dayjs().subtract(2, 'day').toDate(),
      modifier: { id: 'user1', name: '张三' },
      contentSummary: '本季度重点项目包括用户中心重构、支付系统升级、移动端2.0版本开发。目标是提升系统性能30%，用户转化率提升15%。',
      path: '产品规划/Q2项目规划.md',
    },
    {
      id: 'doc2',
      title: '用户中心重构技术方案',
      url: 'https://feishu.cn/docx/doc2',
      modifiedTime: dayjs().subtract(3, 'day').toDate(),
      modifier: { id: 'user2', name: '李四' },
      contentSummary: '采用微服务架构拆分用户服务，引入Redis缓存热点数据，数据库读写分离。预计开发周期4周，当前完成数据库设计和接口定义。',
      path: '技术方案/用户中心重构方案.md',
    },
    {
      id: 'doc3',
      title: '支付系统压测报告',
      url: 'https://feishu.cn/docx/doc3',
      modifiedTime: dayjs().subtract(1, 'day').toDate(),
      modifier: { id: 'user3', name: '王五' },
      contentSummary: '压测结果显示当前支付系统TPS可达5000，满足双11流量需求。存在的问题：数据库连接池配置过小，需要优化。',
      path: '测试报告/支付系统压测报告.md',
    },
    {
      id: 'doc4',
      title: '移动端2.0交互设计稿',
      url: 'https://feishu.cn/docx/doc4',
      modifiedTime: dayjs().subtract(4, 'day').toDate(),
      modifier: { id: 'user4', name: '赵六' },
      contentSummary: '完成首页、个人中心、订单页面的交互设计。新增加载动画、手势操作等功能，用户体验评分预计提升20%。',
      path: '设计稿/移动端2.0交互设计.md',
    },
  ];

  // 模拟任务数据
  const tasks: TaskItem[] = [
    {
      id: 'task1',
      title: '用户中心数据库设计',
      url: 'https://feishu.cn/task/task1',
      status: '已完成',
      statusChangedTime: dayjs().subtract(2, 'day').toDate(),
      assignee: { id: 'user2', name: '李四' },
      creator: { id: 'user1', name: '张三' },
      dueTime: dayjs().add(1, 'day').toDate(),
      projectId: 'proj1',
      projectName: '用户中心重构',
      description: '设计用户表、权限表、日志表结构，考虑数据扩容和分库分表需求',
    },
    {
      id: 'task2',
      title: '支付系统接口开发',
      url: 'https://feishu.cn/task/task2',
      status: '进行中',
      statusChangedTime: dayjs().subtract(1, 'day').toDate(),
      assignee: { id: 'user3', name: '王五' },
      creator: { id: 'user1', name: '张三' },
      dueTime: dayjs().add(3, 'day').toDate(),
      projectId: 'proj2',
      projectName: '支付系统升级',
      description: '开发微信支付、支付宝支付新接口，支持优惠券、积分抵扣功能',
    },
    {
      id: 'task3',
      title: '移动端首页开发',
      url: 'https://feishu.cn/task/task3',
      status: '已完成',
      statusChangedTime: dayjs().subtract(3, 'day').toDate(),
      assignee: { id: 'user5', name: '钱七' },
      creator: { id: 'user4', name: '赵六' },
      dueTime: dayjs().toDate(),
      projectId: 'proj3',
      projectName: '移动端2.0',
      description: '实现新的首页布局，支持卡片式展示、下拉刷新、懒加载等功能',
    },
    {
      id: 'task4',
      title: '系统性能优化',
      url: 'https://feishu.cn/task/task4',
      status: '待开始',
      statusChangedTime: dayjs().subtract(5, 'day').toDate(),
      assignee: { id: 'user2', name: '李四' },
      creator: { id: 'user1', name: '张三' },
      dueTime: dayjs().add(7, 'day').toDate(),
      projectId: 'proj1',
      projectName: '用户中心重构',
      description: '优化慢查询接口，引入缓存机制，提升系统响应速度',
    },
    {
      id: 'task5',
      title: '压测环境搭建',
      url: 'https://feishu.cn/task/task5',
      status: '已完成',
      statusChangedTime: dayjs().subtract(4, 'day').toDate(),
      assignee: { id: 'user6', name: '孙八' },
      creator: { id: 'user3', name: '王五' },
      dueTime: dayjs().subtract(2, 'day').toDate(),
      projectId: 'proj2',
      projectName: '支付系统升级',
      description: '搭建性能压测环境，模拟百万级并发请求',
    },
  ];

  // 模拟会议数据
  const meetings: MeetingItem[] = [
    {
      id: 'meeting1',
      title: 'Q2项目启动会',
      url: 'https://feishu.cn/calendar/meeting1',
      startTime: dayjs().subtract(5, 'day').toDate(),
      endTime: dayjs().subtract(5, 'day').add(2, 'hour').toDate(),
      organizer: { id: 'user1', name: '张三' },
      participants: [
        { id: 'user2', name: '李四' },
        { id: 'user3', name: '王五' },
        { id: 'user4', name: '赵六' },
      ],
      minutesContent: '会议确定了Q2的三个重点项目：用户中心重构、支付系统升级、移动端2.0。各项目负责人汇报了项目计划和风险点。Action: 各项目负责人在本周内提交详细的项目进度计划。Action: 运维团队在下周三前准备好压测环境。',
      actionItems: [
        { content: '提交项目进度计划', assignee: '各项目负责人', deadline: dayjs().add(2, 'day').toDate() },
        { content: '准备压测环境', assignee: '运维团队', deadline: dayjs().add(5, 'day').toDate() },
      ],
    },
    {
      id: 'meeting2',
      title: '支付系统需求评审会',
      url: 'https://feishu.cn/calendar/meeting2',
      startTime: dayjs().subtract(3, 'day').toDate(),
      endTime: dayjs().subtract(3, 'day').add(1.5, 'hour').toDate(),
      organizer: { id: 'user3', name: '王五' },
      participants: [
        { id: 'user1', name: '张三' },
        { id: 'user6', name: '孙八' },
        { id: 'user7', name: '周九' },
      ],
      minutesContent: '评审了支付系统升级的需求，确定需要支持优惠券、积分抵扣、分期支付等功能。讨论了现有系统的架构限制，确定采用渐进式重构方案。Action: 产品团队补充优惠券和积分抵扣的详细规则。Action: 技术团队下周输出详细的技术方案。',
      actionItems: [
        { content: '补充优惠券规则文档', assignee: '产品团队', deadline: dayjs().add(3, 'day').toDate() },
        { content: '输出技术方案', assignee: '技术团队', deadline: dayjs().add(7, 'day').toDate() },
      ],
    },
    {
      id: 'meeting3',
      title: '移动端设计评审会',
      url: 'https://feishu.cn/calendar/meeting3',
      startTime: dayjs().subtract(2, 'day').toDate(),
      endTime: dayjs().subtract(2, 'day').add(1, 'hour').toDate(),
      organizer: { id: 'user4', name: '赵六' },
      participants: [
        { id: 'user5', name: '钱七' },
        { id: 'user8', name: '吴十' },
      ],
      minutesContent: '评审了移动端2.0的交互设计稿，整体方向一致，部分细节需要调整。Action: 设计团队在本周五前更新设计稿。Action: 前端团队下周一启动开发工作。',
      actionItems: [
        { content: '更新设计稿', assignee: '设计团队', deadline: dayjs().add(1, 'day').toDate() },
        { content: '启动前端开发', assignee: '前端团队', deadline: dayjs().add(4, 'day').toDate() },
      ],
    },
  ];

  return {
    teamId: 'demo-team',
    timeRange: {
      start: startOfWeek,
      end: endOfWeek,
    },
    collectedAt: now,
    docs,
    tasks,
    meetings,
  };
}