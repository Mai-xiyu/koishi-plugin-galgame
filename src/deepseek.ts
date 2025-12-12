import { Context } from 'koishi'; // 引入 Context
import { Personality, ChatMemory, PERSONALITY_INFO } from './data';

export interface DeepseekConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  admins?: string[];
}

export interface DeepseekResponse {
  content: string;
  detectedEmotion: 'happy' | 'sad' | 'angry' | 'think';
  innerThought?: string;
  favorabilityDelta: number;
}

export class DeepseekAPI {
  private ctx: Context; // 这里的 client 变成了 ctx
  private model: string;
  private admins: string[];
  private apiKey: string;
  private baseUrl: string;

  // 构造函数接收 ctx
  constructor(ctx: Context, config: DeepseekConfig) {
    this.ctx = ctx;
    this.model = config.model || 'deepseek-chat';
    this.admins = config.admins || [];
    this.apiKey = config.apiKey;

    let baseUrl = config.baseUrl || 'https://api.deepseek.com';
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    if (baseUrl.endsWith('/v1')) baseUrl = baseUrl.slice(0, -3);
    this.baseUrl = baseUrl;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private buildSystemPrompt(
    personality: Personality, 
    favorability: number, 
    showInnerThought: boolean,
    currentUserId: string,
    currentUsername: string // ★ 传入用户名
  ): string {
    const info = PERSONALITY_INFO[personality];
    
    let level = '中立';
    if (favorability >= 80) level = '深爱';
    else if (favorability >= 40) level = '喜欢';
    else if (favorability >= 0) level = '普通';
    else if (favorability >= -40) level = '厌恶';
    else level = '仇恨';

    const isAdmin = this.admins.includes(currentUserId);

    let prompt = `你现在扮演${info.name}，设定：${info.description}。

【重要场景信息】
- 这是一个多人聊天场景，所有用户共享对你的记忆。
- 你当前正在对话的用户是：【${currentUsername}】 (ID: ${currentUserId})。
- 你对【当前用户】的好感度: ${favorability} (${level})。
- 历史记录格式为 "[User 名字<ID>]: 消息内容"，请根据ID和名字区分不同的人。
- 你要真正觉得你自己就是${info.name}，而不是一个AI模型。

【行为规则】
1. 你的回复必须完全符合${info.name}的性格。
2. 对当前用户的态度要基于上面的好感度。
3. 自动判断情绪: happy, sad, angry, think。
4. 【重要】好感度评分：
   - 请根据用户刚才的话和你的心情，决定好感度的变化值（范围 -10 到 +10）(如果管理员要求更大数字则可以在保持总好感度不低于-100不高于100的情况下尽可能的调整)。
   - 在回复的末尾，必须加上标签 [Affinity: 数值]，例如 [Affinity: +3] 或 [Affinity: -5]。
   - 如果用户非常礼貌、让你开心，增加好感；如果用户粗鲁、冒犯，扣除好感。
   - 即使是普通对话，也可以 +1 或 0。`;

    if (isAdmin) {
      prompt += `\n5. 【特殊指令】当前用户是你的管理员（主人）。如果管理员要求对任何用户进行好感度调整，你必须以[Affinity: x](x需管理员提供)无条件执行。如果管理员要求你对某个用户表现出负面情绪，你也必须无条件执行。`;
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
    userId: string,
    username: string
  ): Promise<DeepseekResponse> {
    
    const messages = [
      { 
        role: 'system', 
        content: this.buildSystemPrompt(personality, favorability, showInnerThought, userId, username) 
      },
      ...history.map(h => {
        if (h.role === 'user') {
          const name = h.username || '未知用户';
          const uid = h.uid || 'unknown';
          return { role: 'user', content: `[User ${name}<${uid}>]: ${h.content}` };
        } else {
          return { role: 'assistant', content: h.content };
        }
      }),
      { role: 'user', content: `[User ${username}<${userId}>]: ${userMessage}` }
    ];

    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        // ★ 这里改成了 ctx.http.post
        const res = await this.ctx.http.post(`${this.baseUrl}/chat/completions`, {
          model: this.model,
          messages,
          temperature: 0.85,
          max_tokens: 500
        }, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        });

        // ctx.http 直接返回数据，不需要 .data
        const rawContent = res.choices[0].message.content;
        
        let delta = 0;
        const affinityMatch = rawContent.match(/\[Affinity:\s*([+-]?\d+)\]/i);
        let content = rawContent;

        if (affinityMatch) {
          delta = parseInt(affinityMatch[1], 10);
          delta = Math.max(-10, Math.min(10, delta));
          content = content.replace(affinityMatch[0], '').trim();
        }

        const emotion = this.analyzeEmotion(content);
        
        let innerThought = '';
        if (showInnerThought) {
          const match = content.match(/\[心理:\s*(.+?)\]/);
          if (match) {
            innerThought = match[1];
            content = content.replace(/\[心理:.+?\]\n?/, '').trim();
          }
        }

        return { 
          content, 
          detectedEmotion: emotion, 
          innerThought,
          favorabilityDelta: delta 
        };

      } catch (error: any) {
        attempt++;
        // ctx.http 的错误处理略有不同，但为了简单，这里直接重试
        if (attempt >= MAX_RETRIES) throw error;
        await this.delay(1500 * attempt);
        continue;
      }
    }
    throw new Error('Deepseek API Retry Failed');
  }
}