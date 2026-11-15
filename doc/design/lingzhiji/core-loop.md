---
doc_id: DES-LINGZHIJI-CORE-001
doc_type: design
module: lingzhiji
feature: core-loop
status: approved
last_updated: 2026-11-14
relations:
  - doc/requirements/lingzhiji/v0.1-prd.md
  - doc/design/architecture.md
  - doc/design/lingzhiji/farming.md
  - doc/design/lingzhiji/economy.md
  - doc/design/lingzhiji/quiz.md
---

# 核心循环设计（时间 / AP / 日结算 / 随机事件）

## 1. 需求追溯

- 关联需求：REQ-LINGZHIJI-001 §2（核心循环）、§4（时间系统与每日结算顺序）、§7（行动清单）、§11（随机事件）、§12（参数表）
- 覆盖：游戏日推进门控、AP 消耗、日结算管线、随机事件表与即时/持续效果、当日日志
- 未覆盖：各行动内部规则（farming / quiz / economy 文档）、境界数值（progression 文档）

## 2. 契约引用

无对外契约；`GameState` 中的日结算相关字段（`day` / `phase` / `ap` / `wateredToday` / `tunaUsedToday` / `pendingTomorrow` / `log`）定义见 CON-LINGZHIJI-SAVE-001 草案。

## 3. 技术设计

### 3.1 时间与每日状态

- `day`：1 起算整数；月份与月内日为派生值：`month = ⌈day/30⌉`、`monthDay = ((day-1) mod 30) + 1`，不单独存档
- `phase`：`'day'`（白天自由行动）| `'quota'`（月末定额结算交互中）
- 每日重置标记（在日终推进时重置）：`ap = 3`、`wateredToday = false`、`tunaUsedToday = false`、当日任务堂状态（quiz.md）
- 离线不推进；调试面板 `?debug=1` 提供「跳天（等效完成当日最低条件）/ 加资源」，仅验证用，正常入口不可见

### 3.2 行动分发

行动即 `GameAction`，engine 按 PRD §7 校验 AP 与各自前置：

| Action | AP | 前置要点 | 规则归属 |
|---|---|---|---|
| PLANT / WATER / HARVEST / IRRIGATE / RECLAIM | 0/1/1/0/2 | 见 farming.md | farming |
| TUNA（修炼吐纳） | 1 | 每日限 1 次；修为 +1 | progression |
| QUIZZ_*（进入/答题/确认结果） | 0 | 每游戏日 1 次奖励 | quiz |
| BUY / SELL / EMERGENCY_SEED | 0 | 见 economy.md | economy |
| GONGFA_UP | 0 | 心得 / 贡献双消耗 | quiz |
| END_DAY | 0 | 当日任务堂已完成并确认 | 本文档 §3.3 |

- 0 AP 行动（种植 / 灌注 / 任务堂 / 坊市 / 功法）在 AP 耗尽后仍可用；AP 不足的行动按钮进入条件不足态并说明原因
- 所有行动即时生效、即时存档（save.md）

### 3.3 日结算管线（END_DAY）

```text
endDay(state):
  1. 前置门控：quizDaily.done != true → 拒绝（reason: QUIZ_NOT_DONE）
  2. 随机事件（§3.4）：30% 触发 1 个，按权重抽取；即时类立即结算，持续类写入 pendingTomorrow
  3. 全田自然生长 +1 天；功法 Lv2 生长期 -1 已在常量表生效；推进后逐田检查成熟（成熟停驻，farming.md）
  4. 缺水结算：!wateredToday 且仍生长中的田 dryStreak +1；达 3 触发当茬减产（farming.md）
  5. 月末判定：monthDay == 30 → phase = 'quota'，进入定额结算交互（economy.md）；
     玩家在弹窗完成缴纳/放弃后 monthSettle() 收尾
  6. 推进：day + 1，重置 ap / wateredToday / tunaUsedToday / 当日任务堂状态，清空消费 pendingTomorrow
  7. 自动存档（含中间态：步骤 5 玩家未完成交互时，phase='quota' 直接入档，恢复后继续）
```

- 步骤 2–4 的顺序固定，事件先即时增减当茬产量、再处理缺水（PRD §6 产量顺序）
- 白天已收获的灵草可计入当日月末缴纳（步骤 5 在全部行动之后）

### 3.4 随机事件

- 事件表、权重与效果常量集中在 `constants.ts`（PRD §11：正 60 / 负 39 / 行情 1）
- 触发判定与目标选取（随机田 / 随机灵草）全部走 PRNG；无有效目标时按 PR §5.4「无事发生」处理，不顺延、不替换
- 即时类（灵雨 / 灵蝶 / 师姐 / 拾灵石 / 长老 / 虫害 / 偷食 / 阵法波动）在步骤 2 直接结算并入日志
- 持续类写入 `pendingTomorrow`，在**下一个游戏日**生效：
  - 灵泉涌出 → `pendingTomorrow.infusionDouble = true`：明日灌注基础效果 ×2（farming.md 计算时消费）
  - 坊市行情 → `pendingTomorrow.marketMult = 1.5 | 0.7`：明日出售单价按此折算（economy.md 消费）
- `pendingTomorrow` 在下一次日终事件判定前清空；本次事件产生的效果保留到下一日（跨月时也经过定额结算保留），效果只覆盖一日，不叠加历史。

### 3.5 当日日志

- 结构：`{ day, kind: 'event'|'action'|'settle'|'breakthrough', icon, title, text }`
- 环形保留最近 50 条入档；结算类条目按步骤 2→4 顺序追加，月末结算追加汇总条目

## 4. 界面原型

本模块无独立页面；完整布局见 `lingzhiji/ui.md`。此处仅约定归属本模块的两个片段：

日志流（DayLog，条件：END_DAY 门控见 ui.md 行动面板）：

```text
┌─ 当日日志 ────────────────────────┐
│ 🌧 灵雨      全田生长 +2 天        │  ← 事件条目（icon 用项目事件素材）
│ 🌱 青灵草    3 号田生长 +1 天      │  ← 行动/结算条目
│ ⚠ 缺水      2 号田连续缺水 3 天，  │
│              当茬产量减半          │
│ （空）暂无记录，完成行动后在此显示  │  ← empty 态
└───────────────────────────────────┘
```

结束当天（未完成任务堂时为条件不足态）：

```text
┌─ 结束这一天 ─────────────────────────────┐
│ 今日任务堂尚未完成（0/10 题）。           │
│ 完成 10 题并确认结果后才能推进游戏日，     │
│ 答错也能继续。                           │
│ [进入任务堂]  [返回]                     │  ← 主行动引导 + 次要返回
└──────────────────────────────────────────┘
```

## 5. 交互与异常

| 场景 | 行为 |
|---|---|
| 未完成任务堂点「结束这一天」 | 按钮可用但弹出上图说明（不静默禁用），提供任务堂入口 |
| 题目全部答错 | 确认结果后照常允许结束当天（quiz.md 奖励口径） |
| 月末结算中断（刷新/关页） | 恢复后停留在 `phase='quota'`，重新打开定额弹窗继续，当日不重复扣资源 |
| 事件无有效目标 | 日志记「无事发生」类简述，不弹错误 |
| AP 不足点击消耗类行动 | 条件不足态：按钮禁用 + 原因「行动力不足（今日剩 0/3）」 |
| 连续游玩多游戏日 | 无现实日限制；每个游戏日均需完成一组题（PRD §4） |

## 6. 验证方式

- vitest：五步结算顺序（事件→生长→缺水→月末→推进）；30% 触发与权重分布（固定种子统计）；持续效果次日生效且仅一日；月末中间态存档恢复；门控拒绝路径
- smoke test：完成 10 题 → 结束当天 → 观察日志顺序与资源变化；未完成时结束当天被拦截
