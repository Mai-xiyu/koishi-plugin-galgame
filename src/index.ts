// src/index.ts
import { Context, Schema, Session, h } from 'koishi';
import { DataManager, Personality, PERSONALITY_INFO } from './data';
import { DeepseekAPI } from './deepseek';
import { ChatBubbleGenerator } from './bubble';
import { ConfigManager, GalgameConfig } from './config';
import * as fs from 'fs';
import * as path from 'path';

export const name = 'koishi-plugin-galgame';
export const usage = `
Galgame 插件 (共享世界 + 管理版)

使用：
- 私聊直接对话，群聊请 @机器人。
- 管理员可使用 block 指令拉黑用户或群组。
`;

export interface Config extends GalgameConfig {}

export const Config: Schema<Config> = Schema.object({
  deepseekApiKey: Schema.string().required().description('API Key'),
  deepseekBaseUrl: Schema.string().default('https://api.deepseek.com').description('API地址'),
  deepseekModel: Schema.string().default('deepseek-chat').description('模型'),
  admins: Schema.array(String).default([]).description('管理员QQ号列表'),
  maxRepliesPerMinute: Schema.number().default(30).description('每分钟最大回复次数(全局)'),
  enableFavorabilityDisplay: Schema.boolean().default(false).description('默认显示好感度'),
  enableInnerThought: Schema.boolean().default(false).description('默认显示心理活动'),
  minFavorabilityToRespond: Schema.number().default(-50).description('最低回复好感度'),
  characterImageBasePath: Schema.string().default('C:\\Users\\25463\\Desktop\\friend\\koishi\\external\\koishi-galgame-plugin').description('图片根目录'),
  maxResponseLength: Schema.number().default(500).description('最大回复长度'),
  responseTimeout: Schema.number().default(60000).description('超时时间'),
  enableDataPersistence: Schema.boolean().default(true).description('开启存档'),
  dataPersistenceInterval: Schema.number().default(60000).description('存档间隔'),
  enableDebugLog: Schema.boolean().default(true).description('开启调试日志')
});

export function apply(ctx: Context, config: Config) {
  const configManager = new ConfigManager(config);
  const dataManager = new DataManager();
  const bubbleGenerator = new ChatBubbleGenerator(config.characterImageBasePath);
  const deepseekAPI = new DeepseekAPI({
    apiKey: config.deepseekApiKey,
    baseUrl: config.deepseekBaseUrl,
    model: config.deepseekModel,
    admins: config.admins // 传入管理员列表
  });

  let replyCount = 0;
  let lastResetTime = Date.now();

  const dataFilePath = path.join(process.cwd(), 'galgame-data.json');
  
  const saveData = () => {
    if (config.enableDataPersistence) {
      try {
        fs.writeFileSync(dataFilePath, JSON.stringify(dataManager.exportData(), null, 2));
      } catch (e) { ctx.logger.error('存档失败', e); }
    }
  };

  if (fs.existsSync(dataFilePath)) {
    try {
      dataManager.importData(JSON.parse(fs.readFileSync(dataFilePath, 'utf-8')));
      ctx.logger.info('Galgame 存档已加载');
    } catch (e) { ctx.logger.error('读档失败', e); }
  }

  const timer = setInterval(saveData, config.dataPersistenceInterval);

  // --- 中间件 ---
  ctx.middleware(async (session, next) => {
    // 1. 黑名单检查
    if (session.userId && dataManager.isUserBlacklisted(session.userId)) return next();
    if (session.guildId && dataManager.isGroupBlacklisted(session.guildId)) return next();

    const elements = h.parse(session.content || '');
    const isAt = h.select(elements, 'at').some(e => e.attrs.id === session.bot.selfId);
    const isPrivate = session.subtype === 'private';

    if (!isPrivate && !isAt) return next();

    const userMsg = h.transform(elements, { at: () => h.text('') }).join('').trim();
    if (!userMsg || userMsg.startsWith('galgame')) return next();

    // 2. 频率限制
    const now = Date.now();
    if (now - lastResetTime > 60000) {
      replyCount = 0;
      lastResetTime = now;
    }

    if (replyCount >= config.maxRepliesPerMinute) {
      if (config.enableDebugLog) ctx.logger.warn('触发全局回复频率限制');
      return next();
    }

    // ★ 关键信息获取：ID 和 用户名
    const userId = session.userId || 'unknown'; 
    const fullUserId = `${session.platform}-${userId}`; 
    // 获取用户名 (如果获取不到则使用 '未知用户')
    const username = session.username || session.author?.nickname || session.author?.username || '未知用户';

    const userData = dataManager.getUserData(fullUserId);
    const personality = userData.currentPersonality;
    const currentFav = dataManager.getFavorability(fullUserId, personality);

    if (currentFav < config.minFavorabilityToRespond) {
      await session.send(`${PERSONALITY_INFO[personality].name} 转过头去，不想理你。`);
      return;
    }

    try {
      replyCount++;

      // ★ 记录历史时存入 username
      dataManager.addGlobalMessage(personality, 'user', userMsg, userId, username);
      const globalHistory = dataManager.getGlobalHistory(personality).slice(-10);

      // ★ 调用 API 时传入 username
      const response = await deepseekAPI.chat(
        personality, 
        userMsg, 
        globalHistory, 
        currentFav, 
        userData.settings.showInnerThought,
        userId,
        username // 传入用户名
      );

      dataManager.addGlobalMessage(personality, 'assistant', response.content);
      
      // ★ 使用 AI 返回的 delta
      const delta = response.favorabilityDelta;
      const newFav = dataManager.updateFavorability(fullUserId, personality, delta);

      const imgBuffer = await bubbleGenerator.generateBubbleImage({
        text: response.content,
        emotion: response.detectedEmotion,
        personality: personality,
        showFavorability: userData.settings.showFavorability,
        favorability: newFav,
        favorabilityDelta: delta, // 传入变化值给绘图
        showInnerThought: userData.settings.showInnerThought,
        innerThought: response.innerThought
      });

      await session.send(h.image(imgBuffer, 'image/png'));
      
    } catch (e) {
      ctx.logger.error('对话处理错误', e);
      replyCount--;
      await session.send('（网络波动...）');
    }
  });

  // --- 指令区域 (保持不变) ---
  const checkAdmin = (session: Session | undefined) => {
    if (!session || !session.userId) return false;
    return config.admins.includes(session.userId);
  };

  ctx.command('galgame', 'Galgame 帮助').action(() => usage);

  ctx.command('galgame.switch <p:string>', '切换你想互动的角色')
    .alias('切换人格')
    .action(async ({ session }, p) => {
      if (!session || !session.userId) return '无法获取用户信息';
      const map: Record<string, Personality> = { 
        '奈奈': 'loli', '萝莉': 'loli', 
        '蕾娜': 'ojou', '御姐': 'ojou', 
        '小百合': 'milf', '少妇': 'milf', 
        '小薰': 'danshi', '男娘': 'danshi' 
      };
      if (!p || !map[p]) return '可选：奈奈、蕾娜、小百合、小薰';
      const userId = `${session.platform}-${session.userId}`;
      dataManager.switchPersonality(userId, map[p]);
      return `你现在开始关注：${PERSONALITY_INFO[map[p]].name}。`;
    });
    
  ctx.command('galgame.fav <switch:string>', '好感度显示开关')
    .alias('好感度提示')
    .action(({ session }, s) => {
        if (!session || !session.userId) return '无法获取用户信息';
        if (!s) return '请输入：开 或 关';
        const val = s.trim().toLowerCase();
        const on = val === '开' || val === 'on' || val === 'true';
        const userId = `${session.platform}-${session.userId}`;
        dataManager.updateSettings(userId, { showFavorability: on });
        return `好感度提示已${on ? '开启' : '关闭'}`;
    });

  ctx.command('galgame.mind <switch:string>', '心理活动开关')
    .alias('心理活动')
    .action(({ session }, s) => {
        if (!session || !session.userId) return '无法获取用户信息';
        if (!s) return '请输入：开 或 关';
        const val = s.trim().toLowerCase();
        const on = val === '开' || val === 'on' || val === 'true';
        const userId = `${session.platform}-${session.userId}`;
        dataManager.updateSettings(userId, { showInnerThought: on });
        return `心理活动显示已${on ? '开启' : '关闭'}`;
    });

  // 管理员指令
  ctx.command('galgame.block.user <targetId:string>', '【管理】拉黑用户')
    .action(({ session }, targetId) => {
      if (!checkAdmin(session)) return '权限不足';
      if (!targetId) return '请输入用户ID';
      dataManager.addBlacklistUser(targetId);
      return `已拉黑用户 ${targetId}`;
    });

  ctx.command('galgame.unblock.user <targetId:string>', '【管理】解禁用户')
    .action(({ session }, targetId) => {
      if (!checkAdmin(session)) return '权限不足';
      if (!targetId) return '请输入用户ID';
      dataManager.removeBlacklistUser(targetId);
      return `已解禁用户 ${targetId}`;
    });

  ctx.command('galgame.block.group <groupId:string>', '【管理】拉黑群组')
    .action(({ session }, groupId) => {
      if (!checkAdmin(session)) return '权限不足';
      if (!groupId) return '请输入群号';
      dataManager.addBlacklistGroup(groupId);
      return `已拉黑群组 ${groupId}`;
    });

  ctx.command('galgame.unblock.group <groupId:string>', '【管理】解禁群组')
    .action(({ session }, groupId) => {
      if (!checkAdmin(session)) return '权限不足';
      if (!groupId) return '请输入群号';
      dataManager.removeBlacklistGroup(groupId);
      return `已解禁群组 ${groupId}`;
    });

  ctx.on('dispose', () => {
    clearInterval(timer);
    saveData();
  });
}