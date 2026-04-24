import { CollectedData, TimeRange, TeamConfig } from '../../types';

/**
 * 数据采集器接口
 */
export interface IDataCollector {
  /**
   * 采集指定时间范围内的数据
   * @param teamConfig 团队配置
   * @param timeRange 时间范围
   */
  collect(teamConfig: TeamConfig, timeRange: TimeRange): Promise<CollectedData>;
}

/**
 * 单个数据源采集器接口
 */
export interface ISourceCollector<T> {
  /**
   * 采集指定时间范围内的数据源
   * @param teamConfig 团队配置
   * @param timeRange 时间范围
   */
  collect(teamConfig: TeamConfig, timeRange: TimeRange): Promise<T[]>;
}
