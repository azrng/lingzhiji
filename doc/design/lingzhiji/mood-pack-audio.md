---
doc_id: DES-LINGZHIJI-AUDIO
doc_type: design-asset
module: lingzhiji
status: approved
last_updated: 2026-11-16
relations:
  - doc/requirements/lingzhiji/v0.1-prd.md
  - doc/design/lingzhiji/ui.md
  - tasks/T25.md
---

# 氛围包音频候选清单（M3 前置素材选定）

> **定位说明**：本文档不是功能设计文档，是 M3 氛围包启动前的音频素材选定记录（BGM 2 首 + 音效 10 个及其备选）。M3 尚未立项走阶段 0；此处的「选定」为用户授权 AI 拍板的初选，接入后若不合适，按 §4 的替换方式同名换文件即可，成本极低。素材清单视觉部分见 `tasks/T25.md`。

## 1. 选定总表

### BGM（2 首，Pixabay Content License，免署名可商用）

| 槽位 | 选定 | 作者 | 时长 | 选定理由 | 备选（同目录已下载） |
|---|---|---|---|---|---|
| BGM-1 灵田主界面 | 山水心声 · Echoes of the Mountains | RainStreetCat | 2:37 | 古筝+二胡，最贴仙侠种田观感；中文语境作者；时长短、循环压力小 | In the Bamboo Grove（3:19）、Where The Cranes Go（3:31） |
| BGM-2 任务堂/学习 | Chinese Tea | DayNigthMorning | 2:43 | 茶室静谧氛围契合专注学习；**无 AI 生成标记**（唯一） | Chinese traditional song 2（3:21，ambient）、Whispers of the Jade Court（3:24，Ancient China） |

- 本地试听文件：`D:\temp\kenney-audio\bgm\`（A1/A2/A3 为灵田组，B1/B2/B3 为任务堂组，256kbps MP3）
- Pixabay 页面：
  - 选定 BGM-1：https://pixabay.com/music/beats-%E5%B1%B1%E6%B0%B4%E5%BF%83%E5%A3%B0-echoes-of-the-mountains-428648/
  - 选定 BGM-2：https://pixabay.com/music/world-chinese-tea-257446/
  - 备选 A1：https://pixabay.com/music/folk-in-the-bamboo-grove-traditional-chinese-style-music-434735/
  - 备选 A2：https://pixabay.com/music/china-where-the-cranes-go-traditional-chinese-style-music-434740/
  - 备选 B1：https://pixabay.com/music/modern-classical-chinese-traditional-song-2-504135/
  - 备选 B3：https://pixabay.com/music/world-whispers-of-the-jade-court-443400/

### 音效（10 个文件，Kenney CC0，无需署名）

| # | 游戏事件 | 选定文件 | 来源包 | 备选 |
|---|---|---|---|---|
| 1 | UI 按钮点击 | `click_001.ogg` | Interface Sounds | `click1.ogg`（UI Audio）、`click_002~005` |
| 2 | 种植播种 | `bookPlace1.ogg` | RPG Audio | `impactGeneric_light_000.ogg`（Impact Sounds） |
| 3 | 收获灵草 | `pluck_001.ogg` | Interface Sounds | `pluck_002.ogg` |
| 4 | 收获上品 +1 | `glass_001.ogg` | Interface Sounds | `glass_004.ogg`、`confirmation_004` |
| 5 | 灵石入账 | `handleCoins2.ogg` | RPG Audio | `handleCoins.ogg` |
| 6 | 灵石失窃（浣熊事件） | `handleCoins.ogg` | RPG Audio | `error_004.ogg`（Interface Sounds） |
| 7 | 打卡完成（每日 10 题） | `confirmation_001.ogg` | Interface Sounds | `confirmation_004.ogg` |
| 8 | 晨露奖励 toast | `glass_006.ogg` | Interface Sounds | `bong_001.ogg` |
| 9 | 月度灵潮 | `impactBell_heavy_000.ogg` | Impact Sounds | `jingles_SAX07.ogg`（Music Jingles） |
| 10 | 里程碑庆祝（7/30/100/365 打卡） | `jingles_PIZZI03.ogg` | Music Jingles | `jingles_PIZZI05.ogg` |

- 本地试听文件：`D:\temp\kenney-audio\audition\`（28 个候选按「事件_文件名」重命名）＋完整包 `D:\temp\kenney-audio\<包名>\kenney_<包名>.zip`
- 五个包（均 CC0）：rpg-audio / interface-sounds / ui-audio / music-jingles / impact-sounds；包内全量清单可在 zip 中查看

## 2. 备选池（未入选但有潜力，按事件归类）

| 场景 | 候选 | 备注 |
|---|---|---|
| 弹层开/关 | `open_001.ogg` / `close_001.ogg`（Interface） | 若 M3 想给日历、坊市弹层单独配音效 |
| 事件 toast（正向通用） | `select_001.ogg`、`question_002.ogg`（Interface） | 灵鹿来访/仙人残梦/灵气涌动等 |
| 地力透支警告 | `creak2.ogg`（RPG）、`error_001.ogg`（Interface） | 吱呀不祥感 |
| 翻题卡/藏经阁 | `bookOpen.ogg`、`bookFlip1.ogg`（RPG） | 留给 M2 题卡改版 |
| 答对单题轻响 | `tick_001.ogg`（Interface） | 留给 M2 答题反馈 |

## 3. 许可与来源

- **Kenney 音效**：Creative Commons CC0（公共领域），无需署名，可随游戏任意发布。各包详情页见 https://kenney.nl/assets/category:Audio
- **Pixabay BGM**：Pixabay Content License（免署名、可商用；禁止独立转售音频本身）。注意：除 BGM-2（Chinese Tea）外，BGM-1 与其余备选在 Pixabay 带「AI 生成」标记（许可允许使用）；若后续想换纯人做曲目，可从搜索页挑选无 AI 标记的曲子（如 Chinese Pipa、Melody of Life 等方向）

## 4. 接入约定（M3 阶段 1 落地时生效）

- 播放库：howler.js（T25 调研已定）
- 资产目录：`public/assets/audio/`；命名 `bgm-field.mp3`（灵田）、`bgm-study.mp3`（任务堂）、`sfx-<事件名>.mp3`
- 转码：BGM 由 256kbps MP3 转 **mp3 128k**（每首约 2.5MB），音效由 Kenney ogg 源转 mp3（短音效合计约 0.1MB），总预算 ≈5MB 不变
- **修订（2026-11-16，T26）**：原定「转 ogg 128k」废弃——Kenney 音效源文件是 ogg，而 Safari/iOS 不支持 Ogg Vorbis（真实试玩可能有 iPhone 用户）；mp3 全浏览器兼容、体积同级，改为一律 mp3
- **替换方式（「真不行了再换」）**：换曲/换音效 = 用新音频覆盖同名文件，或改代码里的资产映射；本文档同步更新「选定」列即可。换 Pixabay 曲时重新走「详情页抽 CDN 直链下载」流程

## 5. 待确认项

- 无阻塞项：选定已获用户授权（2026-11-16「你直接先帮我选择…真不行了我后续再换」）。M3 立项走阶段 0 时，本文档作为素材输入引用
