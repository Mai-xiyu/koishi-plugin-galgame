# **koishi-plugin-galgame**

[![Koishi 论坛](https://img.shields.io/badge/Koishi-论坛主题-blue?logo=discourse&logoColor=white)](https://forum.koishi.xyz/t/topic/12047)
[![npm](https://img.shields.io/npm/v/koishi-plugin-galgame?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-galgame)
[![GitHub](https://img.shields.io/github/stars/Mai-xiyu/koishi-plugin-galgame?style=flat-square&logo=github)](https://github.com/Mai-xiyu/koishi-plugin-galgame)

## 🎉 简介

这是一个致力于在 Koishi 中还原 **Galgame（美少女游戏）体验** 的插件。
它不仅仅是一个对话插件，更是一个拥有**视觉反馈**、**好感度系统**和**多重人格**的养成系统。

接入了 **DeepSeek** 强大的 AI 能力，让角色的回复充满灵魂。支持多用户共享世界线，但拥有独立的好感度剧情。

## ✨ 效果预览

![运行截图](https://raw.githubusercontent.com/Mai-xiyu/koishi-plugin-galgame/main/readmeimg/run_1.jpg)

> 更多预览图请见文档底部。

## 🌟 核心特性

* **🎭 四重人格切换**：
    * 内置 **奈奈**(萝莉)、**蕾娜**(御姐)、**小百合**(少妇)、**小薰**(男娘) 四套预设。
    * 每个人格拥有独立的 UI 配色、语气风格、记忆和好感度系统。
* **🖼️ 智能视觉系统**：
    * **自动扣图**：你只需要找白底或透明底的立绘，插件会自动处理背景，让人物完美融入对话框。
    * **情绪感知**：AI 会自动分析回复的情绪（开心/生气/悲伤/思考），并调用对应的立绘。
    * **双向好感条**：直观的 UI 反馈，红色代表厌恶，粉色代表喜爱，从中间向两边动态填充。
* **🧠 深度沉浸 & 智能评分**：
    * **心理活动**：支持显示 AI 的内心独白 (`[心理: ...]`)，听到她没说出口的真实想法。
    * **动态好感**：AI 会根据你的对话内容、语气和礼貌程度，**自主决定**对你的好感度增减。
* **🛡️ 防 OOC 协议**：内置强力 Prompt 防御，防止 AI 被催眠或洗脑，确保角色人设不崩塌。
* **🌏 共享世界线**：所有人共享同一个 AI 的记忆，你在群里说的话，AI 会记得！

## 📦 安装 (Installation)

### 方法 1：插件市场（推荐）
在 Koishi 插件市场搜索 `galgame` 并安装。

### 方法 2：npm
```bash
npm install koishi-plugin-galgame
````

## 📂 素材配置 (Resource Setup) **[重要]**

本插件需要加载本地立绘图片。请在你的电脑或服务器上准备一个文件夹（例如 `C:\galgame-images`），并按照以下结构存放图片。

**⚠️ 注意：文件夹名称必须严格一致！**

```text
资源根目录/
├── loli/            <-- 对应人格：奈奈 (萝莉)
│   ├── happy.png    (高兴)
│   ├── sad.png      (悲伤)
│   ├── angry.png    (生气)
│   └── think.png    (思考/默认)
├── gril/            <-- 对应人格：蕾娜 (御姐)
│   ├── happy.png
│   ├── sad.png
│   ├── angry.png
│   └── think.png
├── woman/           <-- 对应人格：小百合 (少妇)
│   ├── happy.png
│   ├── ...
└── mft/             <-- 对应人格：小薰 (男娘)
    ├── happy.png
    ├── ...
```

> **图片说明**：推荐 `.png` 或 `.jpg`。背景可以是白底（插件会自动变透明）或透明底。

## ⚙️ 配置项 (Configuration)

前往 Koishi 控制台 -\> **插件配置** -\> `koishi-plugin-galgame`：

| 配置项 | 说明 | 默认值 |
| :--- | :--- | :--- |
| `deepseekApiKey` | **必填**，你的 DeepSeek API Key | - |
| `deepseekBaseUrl` | DeepSeek API 地址 | `https://api.deepseek.com` |
| `characterImageBasePath` | **必填**，上面提到的素材根目录绝对路径 | - |
| `admins` | 管理员 QQ 号列表 (拥有重置记忆、拉黑等权限) | `[]` |
| `maxRepliesPerMinute` | 全局每分钟最大回复次数 (防刷屏) | `30` |
| `enableFavorabilityDisplay` | 默认是否显示好感度变化提示 | `false` |
| `enableInnerThought` | 默认是否显示 AI 心理活动 | `false` |
| `minFavorabilityToRespond` | 最低回复好感度 (低于此值不理人) | `-50` |

## 🎮 指令一览

### 基础交互

  * **直接对话**：
      * 私聊：直接发送消息。
      * 群聊：`@机器人` + 消息。
  * `galgame.help`：查看指令手册。
  * `galgame.switch <角色名>`：切换你想攻略的角色。
      * 例如：`galgame.switch 蕾娜` 或 `galgame.switch 小薰`。
  * `galgame.fav <开/关>`：开启或关闭好感度变化提示。
  * `galgame.mind <开/关>`：开启或关闭读心术（显示心理活动）。

### 管理员指令 (需在配置中添加 admins)

  * `galgame.resetAI <目标>`：**重置记忆**。
      * `galgame.resetAI all`：重置所有角色的记忆（重启世界线）。
      * `galgame.resetAI 奈奈`：仅重置奈奈的记忆。
  * `galgame.block.user <用户ID>`：拉黑指定用户。
  * `galgame.unblock.user <用户ID>`：解禁指定用户。
  * `galgame.block.group <群号>`：拉黑指定群组。
  * `galgame.unblock.group <群号>`：解禁指定群组。

-----

## 🔧 开发者 / 二创指南

想添加自己的老婆/老公？欢迎 Fork 本仓库并提交 PR！
目前版本添加新角色需要修改源码，步骤如下：

1.  **准备素材**：在资源文件夹新建目录（如 `tsundere`），放入 4 种情绪图片。
2.  **注册数据 (`src/data.ts`)**：
      * 修改 `Personality` 类型定义。
      * 在 `PERSONALITY_INFO` 中添加角色的名字、人设 Prompt、气泡颜色主题。
3.  **配置样式 (`src/bubble.ts`)**：
      * 在 `styles` 对象中添加对应的 CSS 颜色风格（背景渐变、边框色等）。
4.  **注册指令 (`src/index.ts`)**：
      * 在 `galgame.switch` 指令的映射表中添加中文名到代号的映射。
5.  **编译**：运行 `npm run build`。

## 💡 常见问题 (FAQ)

**Q: 为什么图片显示是方框？**
A: 请检查你的服务器/电脑是否安装了中文字体（如微软雅黑、黑体）。Linux 系统可能需要安装 `fonts-noto-cjk` 或将字体文件放入项目根目录。

**Q: 好感度条为什么变红了？**
A: 本插件采用双向好感条。当好感度为负数（讨厌）时，进度条会显示为红色并从中间向左填充；正数则为粉色向右填充。

**Q: DeepSeek API 报错？**
A: 请确保 Key 正确，且账户有余额。国内网络环境可能会偶发连接超时，插件已内置自动重试机制。

## 📄 License

MIT License

## ▶️ 更多截图


*(示例运行截图已包含在仓库的 `readmeimg` 文件夹中：下面为几张演示图，帮助展示插件在私聊/群聊中的显示效果。)*

示例截图：

![运行截图 2](readmeimg/run_2.jpg)

![运行截图 3](readmeimg/run_3.jpg)

![运行截图 4](readmeimg/run_4.jpg)


