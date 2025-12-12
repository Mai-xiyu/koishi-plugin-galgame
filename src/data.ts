// src/data.ts
export type Personality = 'loli' | 'ojou' | 'milf' | 'danshi';

export interface ChatMemory {
  role: 'user' | 'assistant' | 'system';
  content: string;
  uid?: string;      // 用户ID (QQ号)
  username?: string; // ★ 新增：用户名
  timestamp: number;
}

export interface PersonalState {
  favorability: number;
  lastInteraction: number;
}

export interface UserData {
  userId: string;
  currentPersonality: Personality;
  personalities: {
    loli: PersonalState;
    ojou: PersonalState;
    milf: PersonalState;
    danshi: PersonalState;
  };
  settings: {
    showFavorability: boolean;
    showInnerThought: boolean;
  };
  lastUpdated: number;
}

export type GlobalData = {
  histories: Record<Personality, ChatMemory[]>;
  blacklistUsers: string[];
  blacklistGroups: string[];
};

export const PERSONALITY_INFO = {
  loli: {
    name: '奈奈', 
    folderName: 'loli',
    description: '可爱、天真、调皮的邻家小妹',
    emotions: {
      happy: { name: '高兴', bubbleColor: '#FFB6FF', textColor: '#FF69B4' },
      sad: { name: '悲伤', bubbleColor: '#A9D5FF', textColor: '#4169E1' },
      angry: { name: '生气', bubbleColor: '#FF7F7F', textColor: '#DC143C' },
      think: { name: '思考', bubbleColor: '#FFFACD', textColor: '#FFD700' }
    }
  },
  ojou: {
    name: '蕾娜',
    folderName: 'gril',
    description: '优雅、成熟、高冷的财阀千金',
    emotions: {
      happy: { name: '愉悦', bubbleColor: '#DDA0DD', textColor: '#C71585' },
      sad: { name: '失落', bubbleColor: '#B0E0E6', textColor: '#20B2AA' },
      angry: { name: '愠怒', bubbleColor: '#FF6347', textColor: '#8B0000' },
      think: { name: '沉思', bubbleColor: '#F5F5DC', textColor: '#DAA520' }
    }
  },
  milf: {
    name: '小百合',
    folderName: 'woman',
    description: '温柔、成熟、包容的知性女性',
    emotions: {
      happy: { name: '微笑', bubbleColor: '#FFB6C1', textColor: '#FF1493' },
      sad: { name: '忧愁', bubbleColor: '#ADD8E6', textColor: '#1E90FF' },
      angry: { name: '责怪', bubbleColor: '#FFA07A', textColor: '#CD5C5C' },
      think: { name: '牵挂', bubbleColor: '#FFF8DC', textColor: '#EE82EE' }
    }
  },
  danshi: {
    name: '小薰',
    folderName: 'mft',
    description: '秀气、温柔、灵动的可爱男孩子',
    emotions: {
      happy: { name: '嘻嘻', bubbleColor: '#98FB98', textColor: '#32CD32' },
      sad: { name: '难过', bubbleColor: '#87CEEB', textColor: '#00CED1' },
      angry: { name: '哼', bubbleColor: '#FFD700', textColor: '#FF8C00' },
      think: { name: '发呆', bubbleColor: '#F0E68C', textColor: '#8B7500' }
    }
  }
};

export class DataManager {
  private userStore: Map<string, UserData> = new Map();
  
  private globalData: GlobalData = {
    histories: { loli: [], ojou: [], milf: [], danshi: [] },
    blacklistUsers: [],
    blacklistGroups: []
  };

  getUserData(userId: string): UserData {
    if (!this.userStore.has(userId)) {
      this.userStore.set(userId, this.createNewUser(userId));
    }
    return this.userStore.get(userId)!;
  }

  private createNewUser(userId: string): UserData {
    const now = Date.now();
    return {
      userId,
      currentPersonality: 'loli',
      personalities: {
        loli: { favorability: 0, lastInteraction: now },
        ojou: { favorability: 0, lastInteraction: now },
        milf: { favorability: 0, lastInteraction: now },
        danshi: { favorability: 0, lastInteraction: now }
      },
      settings: { showFavorability: false, showInnerThought: false },
      lastUpdated: now
    };
  }

  getFavorability(userId: string, personality: Personality): number {
    return this.getUserData(userId).personalities[personality].favorability;
  }

  updateFavorability(userId: string, personality: Personality, delta: number): number {
    const userData = this.getUserData(userId);
    const current = userData.personalities[personality].favorability;
    userData.personalities[personality].favorability = Math.max(-100, Math.min(100, current + delta));
    userData.lastUpdated = Date.now();
    return userData.personalities[personality].favorability;
  }

  switchPersonality(userId: string, personality: Personality): void {
    this.getUserData(userId).currentPersonality = personality;
  }

  updateSettings(userId: string, settings: Partial<UserData['settings']>): void {
    const userData = this.getUserData(userId);
    Object.assign(userData.settings, settings);
    userData.lastUpdated = Date.now();
  }

  // --- 全局记忆操作 (更新了 username) ---

  addGlobalMessage(personality: Personality, role: 'user' | 'assistant', content: string, uid?: string, username?: string): void {
    this.globalData.histories[personality].push({
      role,
      content,
      uid,
      username, // ★ 存储用户名
      timestamp: Date.now()
    });
    
    if (this.globalData.histories[personality].length > 50) {
      this.globalData.histories[personality] = this.globalData.histories[personality].slice(-50);
    }
  }

  getGlobalHistory(personality: Personality): ChatMemory[] {
    return this.globalData.histories[personality];
  }

  clearGlobalHistory(personality: Personality): void {
    this.globalData.histories[personality] = [];
  }

  // --- 黑名单操作 ---

  addBlacklistUser(userId: string): void {
    if (!this.globalData.blacklistUsers.includes(userId)) {
      this.globalData.blacklistUsers.push(userId);
    }
  }

  removeBlacklistUser(userId: string): void {
    this.globalData.blacklistUsers = this.globalData.blacklistUsers.filter(id => id !== userId);
  }

  isUserBlacklisted(userId: string): boolean {
    return this.globalData.blacklistUsers.includes(userId);
  }

  addBlacklistGroup(groupId: string): void {
    if (!this.globalData.blacklistGroups.includes(groupId)) {
      this.globalData.blacklistGroups.push(groupId);
    }
  }

  removeBlacklistGroup(groupId: string): void {
    this.globalData.blacklistGroups = this.globalData.blacklistGroups.filter(id => id !== groupId);
  }

  isGroupBlacklisted(groupId: string): boolean {
    return this.globalData.blacklistGroups.includes(groupId);
  }

  // --- 导入导出 ---
  exportData(): object {
    const users: { [key: string]: UserData } = {};
    this.userStore.forEach((v, k) => users[k] = v);
    return { users, globalData: this.globalData };
  }

  importData(data: any): void {
    if (data.users) {
      Object.entries(data.users).forEach(([k, v]) => this.userStore.set(k, v as UserData));
    }
    if (data.globalData) {
      this.globalData = { ...this.globalData, ...data.globalData };
    } else if (data.globalHistory) {
      this.globalData.histories = data.globalHistory;
    }
  }
}