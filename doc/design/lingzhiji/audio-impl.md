---
doc_id: DES-LINGZHIJI-AUDIO-IMPL
doc_type: design
module: lingzhiji
status: approved
last_updated: 2026-11-16
relations:
  - doc/requirements/lingzhiji/v0.1-prd.md
  - doc/design/lingzhiji/mood-pack-audio.md
  - doc/design/lingzhiji/ui.md
  - doc/design/lingzhiji/core-loop.md
---

# 氛围音频设计（BGM / 音效 / 声音开关）

## 1. 需求追溯

- 覆盖 REQ §20（氛围音频）：BGM 两场景、10 类事件音效、手势解锁、双开关与本地偏好。
- 未覆盖项：备选池音效（弹层开关音、事件 toast 通用音、地力透支警告音、翻题卡音、答题反馈音）留 M2/后续；视觉氛围（生长雪碧图动画、雾、萤火虫）不属本文档，素材到位另立项。

## 2. 契约引用

- 不涉及：无存档结构、无接口契约变更。声音偏好是设备级浏览器本地数据（`localStorage` 独立键 `lingzhiji.audio`），明确**不入存档**（导码迁移不带声音偏好，符合 REQ §20「设备偏好」口径）。

## 3. 技术设计

### 3.1 模块与职责

新增 `src/audio.ts` 顶层模块（与 `assetUrl.ts` 同级），是**唯一**触碰 howler 与 `AudioContext` 的位置；引擎纯逻辑层（`src/game/`）零改动、零音频依赖。UI 层只调用该模块导出的函数。

- 播放库：`howler`@2.2.4（动态 `import('howler')` 懒加载——模块顶层无 howler 依赖，vitest 与首屏 bundle 均不受影响；首次播放时才建 Howl 实例并缓存）。
- 资产：`public/assets/audio/` 下 `bgm-field.mp3`、`bgm-study.mp3`、`sfx-*.mp3`，运行时经 `assetUrl('audio/<名>.mp3')` 引用（自动带 BASE_URL 前缀）。
- 格式统一 mp3（iOS Safari 不支持 Ogg Vorbis，见 mood-pack-audio.md §4 修订记录）。

### 3.2 偏好（声音开关）

```text
localStorage['lingzhiji.audio'] = {"bgm":true,"sfx":true}
```

- 读取失败/缺键/值非法 → 视为全开（默认值，不抛错）。
- 开关即时生效：关 BGM = 当前 BGM 淡出停止；再开 = 若已解锁，播放当前场景曲。关音效 = 后续 playSfx 直接跳过（已起播的不强切）。
- 写入失败（隐私模式等）静默忽略，开关仍影响本页会话。

### 3.3 解锁与 BGM 场景切换

- 浏览器自动播放策略：AudioContext 需用户手势解锁。开始页三个入口（开始修行/继续修行/导入并继续）成功进入游戏时调用 `unlockAudio()`（同步调用，处于点击调用栈内），随后 `setBgmScene('field')`。
- `setBgmScene(scene: 'field' | 'study' | null)`：当前曲 1s 淡出 → 新曲循环播放 1s 淡入（BGM 音量 0.5）；同场景幂等不重播。
- 任务堂弹层（QuizModal）挂载 → `'study'`；卸载 → `'field'`。月末定额弹层不切场景（无专属曲，保持灵田曲）。
- 页面刷新回到开始页，重新走手势路径，无残留状态问题（Howl 缓存随页面销毁）。

### 3.4 音效触发（与 toast 同源）

日志差量 → toast 的唯一入口 `useUiStore.pushToasts` 内同步调用 `playSfxForEntries(entries)`——**喂全量差量而非 toast 候选**（播种/收获/上品/买卖是 `kind:'action'`，不产 toast 但映射表要求配音），一处挂接覆盖三条路径：GameScreen 日志差量 effect、`continueSaved`/`importSaved` 的跨日显式入队、设置弹层手动 toast。

映射规则（`sfxForEntry(entry): SfxId | null`，纯函数、有序首中即播，便于单测）：

| 优先级 | 匹配（LogEntry 特征） | 音效 | 依据（代码事实） |
|---|---|---|---|
| 1 | `title` 以「晨露」开头 | `sfx-dew` | clock.ts 晨露礼包日志 |
| 2 | `title` 以「灵潮」开头 | `sfx-tide` | engine.ts 月初灵潮日志 |
| 3 | `title` 以「道心」开头（breakthrough） | `sfx-milestone` | quiz.ts 里程碑日志；真突破日志 title 为「突破 ·」，不命中 |
| 4 | `kind === 'event'` 且 `title` 含「失窃」 | `sfx-steal` | constants.ts 灵石失窃事件；其他负向事件（灵雀偷食等）未选音效不播 |
| 5 | `icon === '🌾'`（收获条目） | `text` 含「灵性涌现」→ `sfx-premium`，否则 `sfx-harvest` | farming.ts 上品 +1 是收获条目的 text 附注，同条目只播一声、稀有者优先 |
| 6 | `icon === '🌱'`（播种条目） | `sfx-plant` | farming.ts 播种日志 |
| 7 | `title` 以「出售」或「购买」开头 | `sfx-gain` | economy.ts 坊市买卖条目 |
| 8 | 其余（含手动 toast） | 不播 | 未选音效的事件保持安静 |

**道心打卡音不走日志**：打卡本身不产生日志条目（quiz.ts `checkinStreak` 只在护道符/里程碑时写日志，避免 DayLog/toast 噪音）。QuizModal「确认结果，领取奖励」在 `act` 成功且确认前 `streak.lastCheckinDay !== realDay.today` 时直接 `playSfx('checkin')`——判断依据与 `checkinStreak` 的打卡条件一致（注释互指）。

**UI 点击音**：`installSfxClick()` 在 App 挂载时全局 `document` 监听 `click`（捕获 `closest('button')`，禁用按钮跳过），音量 0.3（低于事件音效 0.8）。一个监听覆盖全部现有与未来按钮，不为逐个按钮手动接线。

### 3.5 音量基线

| 通道 | 默认音量 |
|---|---|
| BGM | 0.5 |
| 事件音效 | 0.8 |
| UI 点击 | 0.3 |

## 4. 界面原型

仅既有设置弹层内新增一个分区（字段增删，命中「原型跳过条件」，无新页面/新布局）。`game-proto` 原型同步沿用 T24 口径暂缓（欠账随原型维护任务一并补）。

```text
┌─ 设置 · 存档（既有 Modal，顶部不变）─────────────────┐
│  导出存档 / 复制导码 …（既有，不变）                    │
│  导入存档 …（既有，不变）                              │
│ ┌ 声音（新增分区）──────────────────────────────┐    │
│ │  [♪ 背景音乐 开]   [🔔 音效 开]                  │    │
│ │  （两个独立切换按钮，选中态=主题绿底白字，           │    │
│ │    关闭态=灰底描边；点击即时生效，无确认弹窗）        │    │
│ └───────────────────────────────────────────┘    │
│  多标签页提示 …（既有，不变）                           │
│  重置开局 …（既有，不变）                              │
└──────────────────────────────────────────────┘
```

状态说明：开关按钮只有开/关两态，无 loading/empty/error 分支；localStorage 不可用时按钮仍可点（本页会话内生效），不提示错误。

## 5. 交互与异常

| 场景 | 行为 |
|---|---|
| 开始页未点击任何入口 | 全静默（不 new Howl、不请求音频） |
| 点击入口但音频解码失败（文件缺失/损坏） | howler 触发 loaderror：跳过该声音，不影响游戏流程；不弹错误提示 |
| Web Audio 不可用（极旧浏览器） | howler 自动降级 html5 audio；仍失败则静默，游戏可玩性不受影响 |
| 关闭 BGM 开关后进入任务堂 | 不播放任务堂曲；再开开关时按当前所在场景补播 |
| 多标签页 | 偏好键不触发 storage 横幅（横幅只监听 `lingzhiji.save.v1`）；两页各自维护开关 |
| 测验中关弹层（中断恢复） | 卸载即切回灵田曲，符合场景语义 |

## 6. 验证方式

- vitest：`sfxForEntry` 映射表逐条命中/不命中用例（真实日志特征构造 fixture）；偏好读取的缺键/坏值兜底；打卡 UI 判断条件单测。howler 播放本体不进单测（无 Web Audio 环境），由浏览器 smoke 覆盖。
- `tsc --noEmit` + `vite build`：类型与打包通过；核对 `dist/assets/audio/` 产物体积（预算 ≈5MB）。
- 浏览器 smoke：开始页点击后灵田曲起播；进出任务堂淡切；播种/收获/上品/出售/晨露/灵潮音效随 toast 出现；打卡音在确认结果时播；设置双开关即时生效且刷新后保持。
- Safari/iOS 实机行为（自动播放策略差异）本机无法验证，交付说明注明，试玩阶段补验。
