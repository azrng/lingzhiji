---
doc_id: DES-LINGZHIJI-MOTION-PACK
doc_type: design
module: lingzhiji
status: approved
last_updated: 2026-11-16
relations:
  - doc/requirements/lingzhiji/v0.1-prd.md
  - doc/design/lingzhiji/ui.md
  - doc/design/lingzhiji/audio-impl.md
---

# 界面动效包设计（反馈动效 / 粒子 / 降级）

## 1. 需求追溯

- 覆盖 REQ §21（界面动效反馈，随本文档新增）：六项轻量动效——收获飘字、成熟摇摆、toast 弹性、轻量粒子、按压反馈、减弱动效降级。
- 目标：提高反馈密度与"活着"的感觉；**零布局、零交互流程、零数值变更**，只在现有 DOM 上叠加表现层。
- 未覆盖项（明确出界）：
  - Lottie 复杂过场、场景化灵田（PixiJS 类实时渲染）——属玩法级改版，需另行阶段 0；
  - 生长雪碧图多帧动画——依赖新美术素材（素材清单见 tasks/T25.md），素材到位另立项；
  - game-proto 原型同步——沿用 T24「暂缓」口径，欠账随原型维护任务补。

## 2. 契约引用

- 不涉及：无存档结构、无接口契约、无引擎（`src/game/`）变更。动效是纯表现层，读日志差量与现有 store 状态，不写任何持久化数据。

## 3. 技术设计

### 3.1 依赖与模块边界

| 件 | 选型 | 说明 |
|---|---|---|
| DOM 动效 | `motion`@14（framer-motion 后继包，peer `react ^19`） | toast 弹性进出场用 motion 组件；版本以 `package.json` 锁定为准 |
| 飘字 | `fx.ts` 自管轻量 DOM + CSS 关键帧 | 触发是命令式（点击锚点）、样式单一（上浮淡出），无需 motion 组件 |
| 粒子 | 手写 canvas，~60 行，零依赖 | 新增 `src/fx.ts`，与 `audio.ts` 同级同构：**唯一**触碰 canvas 与动效浮层的模块 |
| 按压 / 降级 | 纯 CSS | `theme.css` 全局规则，各一处 |

- `src/fx.ts` 职责：粒子引擎（单例 canvas + rAF，无粒子时停帧）+ 触发入口纯函数 `fxForEntry(entry)`（与 `audio.ts` 的 `sfxForEntry` 同构）+ `burst(kind, x, y)` / `floatText(text, kind, x, y)`。
- 现有组件改造点仅三处：`EventToast.tsx`（motion 进出场）、`FieldGrid.tsx`（摇摆 class + 收获后取锚点调 fx）、`globals.css`（按压 + 降级 + 动效 token）。
- `audio.ts` 零改动；动效与音效同源触发（同一批日志差量），各走各的模块。

### 3.2 触发源（与音效同构，一处挂接）

`useUiStore.pushToasts` 已是日志差量的唯一汇聚点（audio-impl.md §3.4）；`fxForEntries(entries)` 在同函数内、**toast 过滤之前**调用（收获/播种等 `kind:'action'` 条目不产 toast 但需要粒子/飘字）。映射规则（纯函数、有序首中即触发，便于单测）：

| 优先级 | 匹配（LogEntry 特征） | 粒子 | 依据（与 sfxForEntry 同判据） |
|---|---|---|---|
| 1 | `title` 以「晨露」开头 | 青白微光 ×12 | clock.ts 晨露礼包 |
| 2 | `title` 以「道心」开头（breakthrough） | 流金 ×20 | quiz.ts 里程碑日志；真突破「突破 ·」不命中 |
| 3 | `icon === '🌾'` 且 `text` 含「灵性涌现」 | 流金密 ×24 + 飘字「上品 +1」 | farming.ts 上品附注 |
| 4 | `icon === '🌾'`（普通收获） | 草绿疏 ×16 + 飘字「+N 株」（text 首段 `+N 株`） | farming.ts 收获日志；收获得株数，灵石来自出售 |
| 5 | 其余（含灵潮、失窃、播种、买卖） | 不触发 | 音效已有反馈，粒子克制不叠加 |

- 飘字/粒子锚点：收获是点击动作，`FieldGrid` 收获按钮在 dispatch 前调 `setHarvestAnchor(按钮)`，`fxForEntries` 消费该锚点（一次性，2s 过期）；无锚点的晨露/里程碑取屏幕中上固定点。
- 里程碑粒子锚点：屏幕中上三分之一固定点（MilestoneScreen 场景，不取 DOM）。

### 3.3 动效规格（候选值，实现后以实机手感微调）

| # | 动效 | 规格 |
|---|---|---|
| 1 | 收获飘字 | 从锚点向上 40px、0.9s、opacity 1→0、ease-out；普通=success 绿、上品=gold 流金；字号 sm，1s 后自移除 |
| 2 | 成熟摇摆 | 仅 `status === 'mature'` 田格；rotate ±3°、周期 3.5s、ease-in-out；`animation-delay` 按田 id 错相，避免齐步 |
| 3 | toast 弹性 | 进场 x+16px→0 + spring（stiffness 260 / damping 24）；离场 opacity→0 + x+8px、0.2s；tone 微光：bad=error 边框轻脉冲一次、gold=gold 边框微光、good 无额外光 |
| 4 | 轻量粒子 | 全屏 canvas（z-45：内容之上、弹层 z-50 之下、toast z-60 之下）；向上扇形初速 + 轻重力，寿命 0.9–1.4s；颜色取设计 token 值：金 #D9B45B、草绿 #7FBF7F、青白 #EEF5F0 |
| 5 | 按压反馈 | 全局 `button:active { transform: scale(0.97) }`，transition 0.1s；一处 CSS，覆盖现有与未来按钮 |
| 6 | 减弱动效降级 | 见 §3.4 |

### 3.4 降级（prefers-reduced-motion）

- CSS 侧：`@media (prefers-reduced-motion: reduce)` 内全局关停摇摆、按压、脉冲动画（`animation: none; transition-duration: 0s`）。
- motion 侧：组件用 `useReducedMotion()`，为真时飘字/toast 直接呈现终态（无位移淡入，直接可见后按时长自消失）。
- 粒子侧：`fxForEntries` / `burst` 入口先查 `matchMedia`，为真直接 return（飘字走 motion 分支仍可静态显示）。
- 对齐 design-system `accessibility.motion` 口径：所有反馈静态可理解。

### 3.5 性能约束

- 只动 `transform` / `opacity`，不触发 layout；摇摆为纯 CSS（合成器线程）。
- canvas 单例、DPR 上限 2、同屏粒子硬上限 64（触顶忽略新增，保证连续快速收获不堆积）。
- `pointer-events: none`：粒子与飘字层永不拦截点击，动效不阻塞连续操作（对齐 design-system `motion.feedback`「不让动效阻止连续操作」）。

## 4. 界面原型（状态示意）

```text
┌─ 主界面（触发瞬间）────────────────────────┐
│  TopBar                                    │
│  ┌ 田1 ┐   ┌ 田2 ┐   +3 株 ← 飘字上浮     │
│  │摇摆 │   │静默 │   ✦ ·  ✦   ← 粒子(飘散) │
│  └─────┘   └─────┘                        │
│  ActionPanel（按钮按压 scale 0.97）         │
└────────────────────────────────────────────┘
```

| 状态 | 表现 |
|---|---|
| 默认态 | 界面与现状一致，仅成熟田格缓慢摇摆 |
| 触发瞬间 | 飘字 + 粒子（§3.3 规格），0.9–1.4s 内自然消散 |
| 减弱动效（reduced-motion） | 摇摆/按压/脉冲/粒子全静；飘字静态显示后按时消失 |
| canvas 不可用 / 极端环境 | fx 模块静默跳过（粒子无、飘字仍可用），无报错，功能不受影响 |

原型门控判断：无新页面、无新模块、无布局/导航/交互流程改版 → 按界面子规则「原型设计与确认」跳过原型专项；存量原型 game-proto 同步沿用 T24「暂缓」口径。

## 5. 交互与异常

- **连续操作**：快速连点收获/播种时动效不阻塞、不排队堆积（粒子上限截断、飘字堆叠偏移、toast 沿用现有 4s 队列）。
- **与音频的关系**：同源触发、相互独立——静音不影响动效，降级动效不影响音频。
- **弹层期间**：粒子层 z-45 在弹层（z-50）之下，弹层内不触发粒子（§3.2 触发源均为日结/主界面动作）；toast 仍正常置顶。
- **多标签页 / 存档导入**：跨日同步产生的日志差量同样过 `fxForEntries`（与音效一致，一次性反馈）。
- **验证方式**：`fxForEntry` 纯函数单测（对齐 audio.test.ts 先例）；vitest 全量不回归；tsc；build 报告体积增量（motion 预计 gzip +~30KB）；浏览器 smoke 主路径（收获/日结/弹层）；动效手感与降级态由用户实机过目。
