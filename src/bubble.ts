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

  // ★ 修复：白底扣图算法 ★
  private async processImageWithTransparentBackground(imgPath: string, maxWidth: number, maxHeight: number): Promise<{ img: Image, w: number, h: number } | null> {
    try {
      const srcImg = await loadImage(imgPath);
      if (srcImg.width === 0) return null;

      // 1. 创建临时画布处理像素
      const tempCanvas = createCanvas(srcImg.width, srcImg.height);
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(srcImg, 0, 0);

      const imgData = tempCtx.getImageData(0, 0, srcImg.width, srcImg.height);
      const data = imgData.data;
      const threshold = 245; 
      
      // 2. 像素处理
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r > threshold && g > threshold && b > threshold) {
          data[i + 3] = 0; // 设置为透明
        }
      }
      
      // 3. 放回像素数据
      tempCtx.putImageData(imgData, 0, 0);
      
      // 不能直接返回 tempCanvas，必须转成 Buffer 再 load 成 Image
      const buffer = await tempCanvas.encode('png'); 
      const finalImg = await loadImage(buffer);

      const scale = Math.min((maxWidth) / srcImg.width, (maxHeight) / srcImg.height);
      return { img: finalImg, w: srcImg.width * scale, h: srcImg.height * scale };
    } catch (e) {
      console.error(`[Galgame] 扣图失败: ${e}`);
      return null;
    }
  }

  // ★ 新增：计算文字高度的方法 ★
  private measureTextHeight(ctx: SKRSContext2D, text: string, maxW: number, font: string, fontSize: number, lineHeight: number): number {
    ctx.font = `${fontSize}px ${font}`;
    const chars = text.split('');
    let line = '';
    let height = lineHeight; // 至少有一行

    for (const c of chars) {
      if (ctx.measureText(line + c).width > maxW && line !== '') {
        height += lineHeight;
        line = c;
      } else {
        line += c;
      }
    }
    return height;
  }

  async generateBubbleImage(config: BubbleConfig): Promise<Buffer> {
    const style = this.styles[config.personality];
    const info = PERSONALITY_INFO[config.personality];
    
    // 基础尺寸配置
    const baseWidth = 800;
    const baseHeight = 600; // 原始基准高度
    const minBoxHeight = 220;
    const paddingX = 30; // 文字左右边距
    const maxTextW = baseWidth - 40 - (paddingX * 2); 
    const lineHeight = 34;
    const thoughtLineHeight = 28;

    // ★ 1. 预计算高度 ★
    const tempCanvas = createCanvas(1, 1);
    const tempCtx = tempCanvas.getContext('2d');
    
    let totalTextHeight = 0;

    // 计算心理活动高度
    if (config.showInnerThought && config.innerThought) {
      const thoughtText = `(💭 ${config.innerThought})`;
      const h = this.measureTextHeight(tempCtx, thoughtText, maxTextW, style.font, 20, thoughtLineHeight);
      totalTextHeight += h + 10; // +10 是间距
    }

    // 计算正文高度
    const mainTextHeight = this.measureTextHeight(tempCtx, config.text, maxTextW, style.font, 26, lineHeight);
    totalTextHeight += mainTextHeight;

    // 计算需要的对话框高度
    const requiredBoxH = totalTextHeight + 70;
    
    // 决定最终高度
    const boxH = Math.max(minBoxHeight, requiredBoxH);
    const heightDelta = boxH - minBoxHeight;
    
    const width = baseWidth;
    const height = baseHeight + heightDelta; // 画布总高增加

    // ★ 2. 创建真实画布 ★
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 3. 背景 (渐变背景需要填充整个新高度)
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, style.bgGradient[0]);
    grad.addColorStop(1, style.bgGradient[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 4. 立绘 (关键修改点)
    const imgPath = this.getImagePath(config.personality, config.emotion);
    if (fs.existsSync(imgPath)) {
      // ⚠️ 修改1：限制高度使用 baseHeight 而不是 height
      // 这样无论文字多长，人物都不会被不按比例拉大
      const processed = await this.processImageWithTransparentBackground(imgPath, width * 0.75, baseHeight * 0.95);
      if (processed) {
        const dx = (width - processed.w) / 2 + 120;
        
        // ⚠️ 修改2：对齐到底部使用 baseHeight
        // 也就是让人物始终站在“原来那个屏幕”的底部，不要跟着长图往下跑
        // 这样人物就会被固定在图片的上半部分，被气泡正常遮挡下半身
        const dy = baseHeight - processed.h; 
        
        ctx.shadowColor = 'rgba(0,0,0,0.1)';
        ctx.shadowBlur = 10;
        ctx.drawImage(processed.img, dx, dy, processed.w, processed.h);
        ctx.shadowBlur = 0;
      }
    } else {
        console.warn(`[Galgame] 图片未找到: ${imgPath}`);
    }

    // 5. 对话框 (向下延伸)
    // boxY 计算公式保持不变：总高 - 盒子高 - 20
    // 原来：600 - 220 - 20 = 360
    // 现在：(600+X) - (220+X) - 20 = 360
    // 结论：对话框的“上边缘”始终固定在 360px，盒子只会向下变长。
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

    // 6. 名字标签
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

    // 7. 文字内容
    let textY = boxY + 35;
    const textX = boxX + paddingX;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    if (config.showInnerThought && config.innerThought) {
      ctx.fillStyle = style.textSub;
      ctx.font = `italic 20px ${style.font}`;
      const thought = `(💭 ${config.innerThought})`;
      textY = this.wrapText(ctx, thought, textX, textY, maxTextW, thoughtLineHeight);
      textY += 10;
    }

    ctx.fillStyle = style.textMain;
    ctx.font = `26px ${style.font}`;
    this.wrapText(ctx, config.text, textX, textY, maxTextW, lineHeight);

    // 8. 绘制好感度条
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
    
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    this.roundRect(ctx, x, y, w, h, h/2);
    ctx.fill();

    const safeVal = Math.max(-100, Math.min(100, val));
    const midPoint = x + w / 2;
    const fillWidth = (Math.abs(safeVal) / 100) * (w / 2);

    ctx.beginPath();
    this.roundRect(ctx, x, y, w, h, h/2);
    ctx.clip();

    if (safeVal > 0) {
      const grad = ctx.createLinearGradient(midPoint, y, midPoint + fillWidth, y);
      grad.addColorStop(0, style.barStart);
      grad.addColorStop(1, style.barEnd);
      ctx.fillStyle = grad;
      ctx.fillRect(midPoint, y, fillWidth, h);
    } else if (safeVal < 0) {
      const grad = ctx.createLinearGradient(midPoint, y, midPoint - fillWidth, y);
      grad.addColorStop(0, '#8B0000');
      grad.addColorStop(1, '#FF0000');
      ctx.fillStyle = grad;
      ctx.fillRect(midPoint - fillWidth, y, fillWidth, h);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(midPoint - 1, y, 2, h);

    ctx.restore();
    ctx.save();
    ctx.fillStyle = '#FFF';
    ctx.font = `bold 16px ${style.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 2;
    ctx.fillText(`${val}`, x + w/2, y + h/2);

    if (delta !== undefined && delta !== 0) {
      const sign = delta > 0 ? '+' : '';
      const deltaText = `${sign}${delta}`;
      
      ctx.font = `bold 20px ${style.font}`;
      ctx.fillStyle = delta > 0 ? '#FF69B4' : '#B0C4DE'; 
      ctx.shadowBlur = 0;
      
      ctx.textAlign = 'right';
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
