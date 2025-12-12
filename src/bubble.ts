import { createCanvas, Image, SKRSContext2D, loadImage, GlobalFonts } from '@napi-rs/canvas';
import * as fs from 'fs';
import * as path from 'path';
import { Personality, PERSONALITY_INFO } from './data';

// ★ 字体修复建议 ★
// GlobalFonts.registerFromPath(path.join(process.cwd(), 'msyh.ttf'), 'Microsoft YaHei');

export interface BubbleConfig {
  text: string;
  emotion: 'happy' | 'sad' | 'angry' | 'think';
  personality: Personality;
  showFavorability?: boolean;
  favorability?: number;
  favorabilityDelta?: number;
  showInnerThought?: boolean;
  innerThought?: string;
}

interface UIStyle {
  bgGradient: [string, string];
  boxFill: string;
  boxBorder: string;
  textMain: string;
  textSub: string;
  barStart: string;
  barEnd: string;
  font: string;
}

export class ChatBubbleGenerator {
  private personalityPath: string;
  // 增加字体备选，防止Linux显示方框
  private defaultFont = '"Microsoft YaHei", "SimHei", "WenQuanYi Micro Hei", sans-serif';

  private styles: Record<Personality, UIStyle> = {
    loli: {
      bgGradient: ['#FFF0F5', '#FFE4E1'],
      boxFill: 'rgba(255,255,255,0.9)',
      boxBorder: '#FF69B4',
      textMain: '#FF1493',
      textSub: '#888',
      barStart: '#FFB6C1', // 粉色
      barEnd: '#FF1493',
      font: this.defaultFont
    },
    ojou: {
      bgGradient: ['#F3E5F5', '#E1BEE7'],
      boxFill: 'rgba(40,30,50,0.9)',
      boxBorder: '#FFD700',
      textMain: '#FFFFFF',
      textSub: '#CCC',
      barStart: '#9370DB', // 紫色
      barEnd: '#4B0082',
      font: this.defaultFont
    },
    milf: {
      bgGradient: ['#FFF8E1', '#FFE0B2'],
      boxFill: 'rgba(255,250,240,0.95)',
      boxBorder: '#FFA07A',
      textMain: '#8B4513',
      textSub: '#A0522D',
      barStart: '#FFDAB9', // 橙色
      barEnd: '#FF7F50',
      font: this.defaultFont
    },
    danshi: {
      bgGradient: ['#E0F7FA', '#B2EBF2'],
      boxFill: 'rgba(255,255,255,0.9)',
      boxBorder: '#00CED1',
      textMain: '#008B8B',
      textSub: '#5F9EA0',
      barStart: '#AFEEEE', // 青色
      barEnd: '#00CED1',
      font: this.defaultFont
    }
  };

  constructor(basePath: string) {
    this.personalityPath = path.normalize(basePath);
  }

  private getImagePath(personality: Personality, emotion: 'happy' | 'sad' | 'angry' | 'think'): string {
    const personalityMap = { loli: 'loli', ojou: 'gril', milf: 'woman', danshi: 'mft' };
    const emotionMap = { happy: 'happy.png', sad: 'sad.png', angry: 'angry.png', think: 'think.png' };
    return path.join(this.personalityPath, personalityMap[personality], emotionMap[emotion]);
  }

  // 白底扣图算法
  private async processImageWithTransparentBackground(imgPath: string, maxWidth: number, maxHeight: number): Promise<{ img: Image, w: number, h: number } | null> {
    try {
      const srcImg = await loadImage(imgPath);
      if (srcImg.width === 0) return null;

      const tempCanvas = createCanvas(srcImg.width, srcImg.height);
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(srcImg, 0, 0);

      const imgData = tempCtx.getImageData(0, 0, srcImg.width, srcImg.height);
      const data = imgData.data;
      const threshold = 245; 
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r > threshold && g > threshold && b > threshold) {
          data[i + 3] = 0; 
        }
      }
      tempCtx.putImageData(imgData, 0, 0);
      
      const scale = Math.min((maxWidth) / srcImg.width, (maxHeight) / srcImg.height);
      return { img: tempCanvas as unknown as Image, w: srcImg.width * scale, h: srcImg.height * scale };
    } catch (e) {
      console.error(`[Galgame] 扣图失败: ${e}`);
      return null;
    }
  }

  async generateBubbleImage(config: BubbleConfig): Promise<Buffer> {
    const style = this.styles[config.personality];
    const info = PERSONALITY_INFO[config.personality];
    const width = 800;
    const height = 600;
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. 背景
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, style.bgGradient[0]);
    grad.addColorStop(1, style.bgGradient[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 2. 立绘
    const imgPath = this.getImagePath(config.personality, config.emotion);
    if (fs.existsSync(imgPath)) {
      const processed = await this.processImageWithTransparentBackground(imgPath, width * 0.75, height * 0.95);
      if (processed) {
        const dx = (width - processed.w) / 2 + 120;
        const dy = height - processed.h;
        ctx.shadowColor = 'rgba(0,0,0,0.1)';
        ctx.shadowBlur = 10;
        ctx.drawImage(processed.img, dx, dy, processed.w, processed.h);
        ctx.shadowBlur = 0;
      }
    }

    // 3. 对话框
    const boxH = 220;
    const boxY = height - boxH - 20;
    const boxX = 20;
    const boxW = width - 40;

    ctx.save();
    ctx.fillStyle = style.boxFill;
    ctx.strokeStyle = style.boxBorder;
    ctx.lineWidth = 4;
    this.roundRect(ctx, boxX, boxY, boxW, boxH, 15);
    ctx.fill();
    ctx.stroke();

    // 4. 名字标签
    const tagW = 140;
    const tagH = 40;
    const tagY = boxY - 30;
    
    ctx.fillStyle = style.boxBorder;
    this.roundRect(ctx, boxX, tagY, tagW, tagH, 5);
    ctx.fill();
    
    ctx.fillStyle = '#FFF';
    ctx.font = `bold 22px ${style.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(info.name, boxX + tagW/2, tagY + tagH/2);
    ctx.restore();

    // 5. 文字内容
    let textY = boxY + 35;
    const textX = boxX + 30;
    const maxTextW = boxW - 60;
    const lineHeight = 34;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    if (config.showInnerThought && config.innerThought) {
      ctx.fillStyle = style.textSub;
      ctx.font = `italic 20px ${style.font}`;
      const thought = `(💭 ${config.innerThought})`;
      textY = this.wrapText(ctx, thought, textX, textY, maxTextW, 28);
      textY += 10;
    }

    ctx.fillStyle = style.textMain;
    ctx.font = `26px ${style.font}`;
    this.wrapText(ctx, config.text, textX, textY, maxTextW, lineHeight);

    // 6. 绘制好感度条 (调用新的逻辑)
    if (config.showFavorability && config.favorability !== undefined) {
      this.drawBar(
        ctx, 
        width - 240, 
        boxY - 35, 
        200, 
        24, 
        config.favorability, 
        config.favorabilityDelta,
        style
      );
    }

    return canvas.toBuffer('image/png');
  }

  // ★ 核心修改：双向进度条 ★
  private drawBar(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, val: number, delta: number | undefined, style: UIStyle) {
    ctx.save();
    
    // 1. 绘制底槽 (半透明黑)
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    this.roundRect(ctx, x, y, w, h, h/2);
    ctx.fill();

    // 2. 计算填充
    // 限制在 -100 到 100
    const safeVal = Math.max(-100, Math.min(100, val));
    
    // 中点位置
    const midPoint = x + w / 2;
    
    // 填充长度：(绝对值 / 100) * 半条长度
    // 比如 50好感度 = 0.5 * 100像素 = 50像素宽
    const fillWidth = (Math.abs(safeVal) / 100) * (w / 2);

    // 3. 绘制填充
    ctx.beginPath();
    this.roundRect(ctx, x, y, w, h, h/2); // 裁剪防止溢出
    ctx.clip();

    if (safeVal > 0) {
      // 🩷 好感模式：从中间 -> 向右
      const grad = ctx.createLinearGradient(midPoint, y, midPoint + fillWidth, y);
      grad.addColorStop(0, style.barStart); // 浅色
      grad.addColorStop(1, style.barEnd);   // 深色
      ctx.fillStyle = grad;
      ctx.fillRect(midPoint, y, fillWidth, h);
    } else if (safeVal < 0) {
      // 💔 讨厌模式：从中间 -> 向左
      // 注意：fillRect 的宽度必须是正数，所以起点是 (mid - width)
      const grad = ctx.createLinearGradient(midPoint, y, midPoint - fillWidth, y);
      grad.addColorStop(0, '#8B0000'); // 深红 (中间)
      grad.addColorStop(1, '#FF0000'); // 鲜红 (边缘)
      ctx.fillStyle = grad;
      ctx.fillRect(midPoint - fillWidth, y, fillWidth, h);
    }

    // 4. 绘制中界线 (0点)
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(midPoint - 1, y, 2, h);

    // 5. 绘制数值 (位于条的中间)
    ctx.restore(); // 恢复clip
    ctx.save();
    ctx.fillStyle = '#FFF';
    ctx.font = `bold 16px ${style.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 2;
    // 直接显示数值，例如 "0", "50", "-20"
    ctx.fillText(`${val}`, x + w/2, y + h/2);

    // 6. 绘制增减提示 (+x / -x)
    if (delta !== undefined && delta !== 0) {
      const sign = delta > 0 ? '+' : '';
      const deltaText = `${sign}${delta}`;
      
      ctx.font = `bold 20px ${style.font}`;
      // 正数粉色，负数蓝灰色
      ctx.fillStyle = delta > 0 ? '#FF69B4' : '#B0C4DE'; 
      ctx.shadowBlur = 0;
      
      // 绘制在进度条【右上方】
      ctx.textAlign = 'right';
      // 移除了 Emoji，解决了方框问题
      ctx.fillText(deltaText, x + w + 5, y - 5);
    }

    ctx.restore();
  }

  private wrapText(ctx: SKRSContext2D, text: string, x: number, y: number, maxW: number, lineH: number): number {
    const chars = text.split('');
    let line = '';
    for(const c of chars) {
      if(ctx.measureText(line + c).width > maxW && line !== '') {
        ctx.fillText(line, x, y);
        line = c;
        y += lineH;
      } else {
        line += c;
      }
    }
    ctx.fillText(line, x, y);
    return y + lineH;
  }

  private roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
  }
}