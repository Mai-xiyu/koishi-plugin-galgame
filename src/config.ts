// config.ts
import { Schema } from 'koishi';

export interface GalgameConfig {
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  enableFavorabilityDisplay: boolean; // 默认开关
  enableInnerThought: boolean;
  minFavorabilityToRespond: number;
  characterImageBasePath: string;
  maxResponseLength: number;
  responseTimeout: number;
  enableDataPersistence: boolean;
  dataPersistenceInterval: number;
  enableDebugLog: boolean;
  
  // 新增配置
  admins: string[]; // 管理员QQ号列表
  maxRepliesPerMinute: number; // 1分钟内最大回复次数
}

export const DEFAULT_CONFIG: GalgameConfig = {
  deepseekApiKey: '',
  deepseekBaseUrl: 'https://api.deepseek.com',
  deepseekModel: 'deepseek-chat',
  enableFavorabilityDisplay: false,
  enableInnerThought: false,
  minFavorabilityToRespond: -50,
  characterImageBasePath: 'C:\\Users\\25463\\Desktop\\friend\\koishi\\external\\koishi-galgame-plugin',
  maxResponseLength: 500,
  responseTimeout: 60000,
  enableDataPersistence: true,
  dataPersistenceInterval: 60000,
  enableDebugLog: true,
  
  // 新增默认值
  admins: [], 
  maxRepliesPerMinute: 30
};

export class ConfigManager {
  private config: GalgameConfig;

  constructor(userConfig: Partial<GalgameConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...userConfig };
  }

  getConfig(): GalgameConfig { return this.config; }
}