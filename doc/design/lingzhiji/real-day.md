---
doc_id: DES-LINGZHIJI-REALDAY-001
doc_type: design
module: lingzhiji
feature: real-day
status: approved
last_updated: 2026-11-15
relations:
  - doc/requirements/lingzhiji/v0.1-prd.md
  - doc/design/architecture.md
  - doc/design/lingzhiji/core-loop.md
  - doc/design/lingzhiji/save.md
  - doc/design/lingzhiji/ui.md
---

# 现实日锚设计（晨露 / 地力 / 道心 / 修行日历）

## 1. 需求追溯

- 关联需求：REQ-LINGZHIJI-001 §19（现实日锚，本次新增）、§4（时间系统）、§12（参数表）、§16.9（验收新增）
- 覆盖：现实日时钟与防倒流、晨露礼包、地力透支（连推递减）、道心连胜与护道符、里程碑庆祝、修行日历界面、存档 v1→v2 迁移
- 未覆盖：SRS 调度 / 发音 / 多题型（M2）、音频与生长动画（M3）、学习动作嵌入经营（M4）——方向见 tasks/T25.md
- 明确边界：**角色选择仅为外观**（PRD §3），本设计与后续所有版本均不给角色增加数值或玩法差异

## 2. 契约引用

| 契约 | 性质 | 说明 |
|---|---|---|
| CON-LINGZHIJI-SAVE-001 | 已落地代码 | 存档结构事实来源为 `src/game/types.ts` + `src/game/save.ts`；本设计新增字段随存档 v2 走 `migrations` 链（save.md §3.3），不新建契约草案 |

## 3. 技术设计

### 3.1 现实时钟（新增 `src/game/clock.ts`）

- 现实时间**只在本模块与应用层出现**，引擎其余部分零时间依赖（dispatch 签名不变）：store 在每次 dispatch 前调用 `syncRealDay(state, nowMs)`，同步结果写入状态，引擎内部只读状态中的现实日字段
- `realDayIndex(nowMs)`：日切凌晨 4 点（照顾夜猫子，Habitica custom day start 模式），返回现实日索引（整数，单调递增）
- `syncRealDay(state, nowMs): { state, notices }`（纯函数，测试注入固定时间）：
  - `today > state.realDay.today`：跨入新现实日 → 发晨露、重置当日游戏日计数、执行连胜漏签检查（§3.4），更新 `realDay.today`
  - `today <= state.realDay.today`（含时钟倒流）：**不做任何事**——不发奖、不重置、不报错，所有判定继续基于已存档的 `realDay.today`；倒流后修回正常时间，再次跨日才进入下一现实日。防误改不防作弊，单机作弊只坑自己
- `notices`：`{ kind: 'morning' | 'freeze-used' | 'streak-lost' | 'milestone', ... }[]`，由 store 转 toast，不入引擎

### 3.2 状态字段（GameState 新增，随存档 v2）

```ts
realDay: {
  today: number       // 最近一次同步的现实日索引（开局 = 创建当日，见 §3.6）
  // gamesToday（当日已推进游戏日数）已随 T49 时间解耦删除（2026-11-18，存档 v5 迁移清理）
}
streak: {
  count: number           // 当前道心连胜（现实日）
  best: number            // 历史最高
  lastCheckinDay: number  // 最近打卡的现实日索引（=今天则已打卡）；-1 表示从未打卡
  checkins: number        // 累计打卡次数（护道符发放依据）
  freezes: number         // 护道符余量（0-2）
  milestones: number[]    // 已发放的里程碑天数（7/30/100/365，防重复）
  history: number[]       // 打卡现实日索引（升序，环形保留最近 370 条，日历热力图数据源）
}
```

### 3.3 晨露礼包（现实日奖励）

- 触发：`syncRealDay` 检测到跨入新现实日时自动发放，效果：灵石 +8、心得 +5（不碰灵气，避开上限溢出口径），日志记 `settle` 条目 + toast
- 新档开局**当日不发**（初始家当口径 PRD §3 不变），首个晨露从次日开始

### 3.4 道心连胜 / 护道符 / 里程碑

- **打卡**：`QUIZ_CONFIRM` 成功时，若 `streak.lastCheckinDay !== realDay.today` → 打卡一次（完成 10 题确认结果即算，**不看正确率**——门槛极低，Duolingo 口径）：`count+1`、`checkins+1`、`lastCheckinDay = today`、`history` 追加；同现实日多次完成测验只记一次
- **漏签检查**（跨日 sync 时）：漏签天数 = `today - realDay.today - 1`；`lastCheckinDay === -1`（从未打卡）时跳过——0 连胜无火可熄，不产生断签日志（2026-11-15 实现修订）
  - 漏签 ≤ `freezes`：自动消耗等量护道符，连胜保持（notice `freeze-used`，日志「护道符护住了道心」）
  - 漏签 > `freezes`：连胜归零（`count = 0`），护道符保留不清，进度无损（notice `streak-lost`，温和文案「道心之火熄了，重新点燃」）
  - 玩家当天已打卡后次日漏签：同样按上式计算（打卡日与今日之间的完整未玩日）
- **护道符**：每累计 7 次打卡自动 +1（`checkins % 7 === 0` 时），上限 2 张；断签时静默自动生效，无需玩家操作
- **里程碑**：`count` 命中 7/30/100/365 且未发放过 → 灵石奖励（30/80/200/888）+ 称号（初萌道心 / 渐入佳境 / 道心弥坚 / 大道可期）+ 专属庆祝（toast + 日志 `breakthrough` 条目）；称号不存档，由已达成最高里程碑派生；平日只常规计数（稀缺性庆祝）

### 3.5 地力透支（已删除）

> 本节机制（连推递减：当日第 2+ 游戏日事件率 15%、收获修为减半、TopBar 标签）已随 T49 时间解耦整体移除（2026-11-18）：入定快进成为正式玩法后，惩罚式多推与「好玩优先」定位冲突。`gamesToday` 字段、`DIMINISH_*` 常量、engine/farming 分支、TopBar 标签、DebugPanel 计数同步删除，存档 v5 迁移清理；事件率恒 0.3、收获修为不减半。详见 time-decouple.md §3.3。

### 3.6 开局与存档迁移（v1 → v2）

- 新档 `createInitialState` 增加 `nowMs` 参数（store 传 `Date.now()`，测试传固定值）：`realDay.today = realDayIndex(nowMs)`、`gamesToday = 0`、streak 全零值（`lastCheckinDay: -1`）
- `SAVE_VERSION = 2`，`migrations[0]`（v1→v2）：补上述字段默认值（`realDay.today` 用迁移时刻的当前现实日，旧档连胜从 0 起算）；`load` / `importCode` 改为「版本 ≤ 当前 → 顺序迁移后校验」，v1 导码可导入
- `validate` 增加 v2 字段校验（数值范围、`history` 升序去重、`milestones` ⊆ {7,30,100,365}、`freezes` ≤ 2）
- 多标签页：沿用 storage 事件机制，sync 结果随 persist 落盘，他页载入即对齐

### 3.7 常量（`constants.ts` 新增，PRD §12 同步）

| 常量 | 初版值 |
|---|---|
| `DAY_CUT_HOUR` | 4 |
| `MORNING_GIFT` | 灵石 8 / 心得 5 |
| ~~`DIMINISH_EVENT_CHANCE`~~ / ~~`DIMINISH_EXP_MULT`~~ | 已随 T49 删除（2026-11-18） |
| `STREAK_MILESTONES` | 7 / 30 / 100 / 365 |
| `MILESTONE_REWARD` | 灵石 30 / 80 / 200 / 888 |
| `FREEZE_CAP` / `FREEZE_GRANT_EVERY` | 2 / 7 |
| `STREAK_HISTORY_MAX` | 370 |

## 4. 界面原型

晨露 toast（跨日首次行动后出现，3 秒自动消失）：

```text
┌─ 🌅 晨露凝而复聚 ───────────────────┐
│ 新的一日，灵田晨露带来 灵石 +8 · 心得 +5 │
└──────────────────────────────────────┘
```

TopBar 徽标（道心入口，常年显示）：

```text
│ 🕯 道心 12 🔥   [今日已打卡 ✓]      │  ← 正常态（点击开日历）
│ 🕯 道心 12 ⚠ 今日未打卡             │  ← 当日未打卡提醒（完成 10 题即灭）
```

修行日历弹层：

```text
┌─ 修行日历 ─────────────────────────────────────┐
│ 道心连胜 12 🔥   历史最高 23   护道符 1/2 🧿     │
│ 称号 渐入佳境    下一里程碑 30 天（还差 18 天）   │
│ ┌─────────────────────────────────────────┐    │
│ │  十一月 2026                              │    │
│ │  一 二 三 四 五 六 日                      │    │
│ │  ·  ·  ·  ·  🌑  🌑  🌑                  │    │
│ │  🌑 🌑 🌑 🌕 🌑 🌑 🌑   ← 今日(未打卡描边)  │    │
│ │  …（🌑 已打卡 / · 未打卡 / 🌕 里程碑日）      │    │
│ └─────────────────────────────────────────┘    │
│ 累计打卡 45 天 · 完成当日 10 题即算打卡，答错也算  │
│ [关闭]                                          │
└────────────────────────────────────────────────┴─┘
  empty 态（新档）：「道心之火尚未点燃——完成第一次任务堂即开始计数」
  里程碑态：命中当日日历格放大发光 + 底部一行「达成 · 初萌道心」
```

## 5. 交互与异常

| 场景 | 行为 |
|---|---|
| 跨日首次行动 / 刷新进入 | sync 自动执行：晨露入账 + toast；跨多日时同时处理漏签（先冻结后断签） |
| 页面开着跨过凌晨 4 点 | 下一次任意 dispatch 触发 sync，当场进入新现实日（正在测验中不打断，晨露与测验互不影响） |
| 系统时钟倒流 | 不回退不发奖不报错，按已存档的 `realDay.today` 继续；修回后正常跨日 |
| 连续多日未玩 | 漏签 ≤ 冻结数 → 自动消耗保连胜；超出 → 连胜归零、进度无损、护道符保留 |
| 同现实日多次完成测验 | 打卡只记一次；资源奖励每现实日 1 次（T49 起 quizDaily.done 由跨日 sync 重置，加练只更新复习计划与统计） |
| 月末 quota 交互中跨日 | 晨露照常入账（资源类，不打断弹窗）；quota 中间态入档口径不变 |
| v1 旧档 / v1 导码 | 迁移补默认字段后正常游玩，连胜从 0 开始；v2 导码导入 v1 版本不存在（向前发布，不做降级） |
| `?debug=1` | 调试面板加「跳现实日 +1」（直接把 `realDay.today` 减 1 再 sync 模拟跨日，仅验证用） |

## 6. 验证方式

- vitest（`clock.test.ts` 新增 + engine/quiz 扩展）：
  - 日切边界（3:59 / 4:00 属于不同现实日）、倒流不动作、跨多日漏签（1 冻挡 1 天 / 漏 3 天必断）、断签后护道符保留
  - 晨露：新档首日不发、跨日发一次、倒流不重发
  - 测验奖励锚现实日（T49）：跨日 sync 重置 quizDaily.done、游戏日推进不重置、同日加练无资源
  - 打卡：同日只记一次、不看正确率、里程碑不重复发放、护道符每 7 次打卡 +1 且不超 2
  - 存档：v1→v2 迁移等价、v1 导码可导入、v2 新字段脏值被 validate 拦截
- balance-sim：session 口径（每 session 推 1/2/3 游戏日三档 + 入定连推近似，time-decouple.md §3.2）；地力透支递减参数已随 T49 删除，不再验证
- smoke：改系统时间跨日晨露发放、倒流不重发、日历弹层三态
