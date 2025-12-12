// deepseek.ts
import axios, { AxiosInstance } from 'axios';
import { Personality, ChatMemory, PERSONALITY_INFO } from './data';

export interface DeepseekConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  admins?: string[]; // 1. 在接口中增加 admins 定义
}

export interface DeepseekResponse {
  content: string;
  detectedEmotion: 'happy' | 'sad' | 'angry' | 'think';
  innerThought?: string;
}

export class DeepseekAPI {
  private client: AxiosInstance;
  private model: string;
  private admins: string[]; // 2. 在类中增加 admins 属性

  constructor(config: DeepseekConfig) {
    this.model = config.model || 'deepseek-chat';
    this.admins = config.admins || []; // 3. 初始化 admins

    let baseUrl = config.baseUrl || 'https://api.deepseek.com';
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    if (baseUrl.endsWith('/v1')) baseUrl = baseUrl.slice(0, -3);

    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private buildSystemPrompt(
    personality: Personality, 
    favorability: number, 
    showInnerThought: boolean,
    currentUserId: string
  ): string {
    const info = PERSONALITY_INFO[personality];
    
    // 好感度描述
    let level = '中立';
    if (favorability >= 80) level = '深爱';
    else if (favorability >= 40) level = '喜欢';
    else if (favorability >= 0) level = '普通';
    else if (favorability >= -40) level = '厌恶';
    else level = '仇恨';

    // 4. 判断是否是管理员
    const isAdmin = this.admins.includes(currentUserId);

    let prompt = `你现在扮演${info.name}，设定：${info.description}。

【重要场景信息】
- 这是一个多人聊天场景，所有用户共享对你的记忆。
- 你当前正在与其对话的用户的ID是：【${currentUserId}】。
- 你对【当前用户】的好感度: ${favorability} (${level})。
- 历史记录中会标注 "[User ID]: 消息"，请根据ID区分不同的人。
- 你要真正觉得你自己就是${info.name}，而不是一个AI模型。

【行为规则】
1. 你的回复必须完全符合${info.name}的性格。
2. 对当前用户的态度要基于上面的好感度。但对历史记录中其他用户的态度，要基于当时的语境。
3. 如果当前用户好感度低于-50，表现出极度抗拒或冷漠。
4. 自动判断情绪: happy, sad, angry, think。`;

    // 5. 动态插入管理员规则 (修复了之前的语法错误)
    if (isAdmin) {
      prompt += `\n5. 【特殊指令】当前用户是你的管理员（主人）。无论当前好感度数值显示多少，请始终表现出满好感度（100，深爱/绝对服从）的态度。如果管理员要求你降低某用户ID的好感度，请按照要求执行。`;
    }

    if (showInnerThought) {
      prompt += `\n6. 必须展示心理活动，格式：[心理: xxx]。`;
    }

    return prompt;
  }

  private analyzeEmotion(content: string): 'happy' | 'sad' | 'angry' | 'think' {
    const happy = ['哈哈', '开心', '喜欢', '❤️', '😊', '棒'];
    const sad = ['难过', '呜', '哭', '😢', '失望'];
    const angry = ['生气', '滚', '讨厌', '😠', '😡'];
    
    let scores = { happy: 0, sad: 0, angry: 0 };
    const lower = content.toLowerCase();
    
    happy.forEach(w => { if(lower.includes(w)) scores.happy++; });
    sad.forEach(w => { if(lower.includes(w)) scores.sad++; });
    angry.forEach(w => { if(lower.includes(w)) scores.angry++; });

    const max = Math.max(scores.happy, scores.sad, scores.angry);
    if (max === 0) return 'think';
    if (scores.angry === max) return 'angry';
    if (scores.sad === max) return 'sad';
    if (scores.happy === max) return 'happy';
    return 'think';
  }

  async chat(
    personality: Personality,
    userMessage: string,
    history: ChatMemory[],
    favorability: number,
    showInnerThought: boolean,
    userId: string
  ): Promise<DeepseekResponse> {
    
    // 构建消息列表
    const messages = [
      { role: 'system', content: this.buildSystemPrompt(personality, favorability, showInnerThought, userId) },
      ...history.map(h => {
        if (h.role === 'user') {
          return { role: 'user', content: `[User ${h.uid || 'unknown'}]: ${h.content}` };
        } else {
          return { role: 'assistant', content: h.content };
        }
      }),
      { role: 'user', content: `[User ${userId}]: ${userMessage}` }
    ];

    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        const res = await this.client.post('/chat/completions', {
          model: this.model,
          messages,
          temperature: 0.85,
          max_tokens: 500
        });

        const rawContent = res.data.choices[0].message.content;
        const emotion = this.analyzeEmotion(rawContent);
        
        let innerThought = '';
        let content = rawContent;

        if (showInnerThought) {
          const match = rawContent.match(/\[心理:\s*(.+?)\]/);
          if (match) {
            innerThought = match[1];
            content = rawContent.replace(/\[心理:.+?\]\n?/, '').trim();
          }
        }

        return { content, detectedEmotion: emotion, innerThought };

      } catch (error: any) {
        attempt++;
        const status = error.response?.status;
        if (!status || status >= 500 || status === 429) {
          if (attempt >= MAX_RETRIES) throw error;
          await this.delay(1500 * attempt);
          continue;
        }
        throw error;
      }
    }
    throw new Error('Deepseek API Retry Failed');
  }

  analyzeAffinity(userMsg: string, aiMsg: string, current: number): number {
    let delta = 0;
    if (userMsg.includes('喜欢') || userMsg.includes('爱')) delta += 2;
    if (userMsg.includes('滚') || userMsg.includes('傻')) delta -= 5;
    if (aiMsg.includes('❤️')) delta += 1;
    delta += Math.floor(Math.random() * 3) - 1; 
    return Math.max(-5, Math.min(5, delta));
  }
}