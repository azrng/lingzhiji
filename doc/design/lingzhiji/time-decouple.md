---
doc_id: DES-LINGZHIJI-TIME-001
doc_type: design
module: lingzhiji
feature: time-decouple
status: approved
last_updated: 2026-11-18
relations:
  - doc/requirements/lingzhiji/time-decouple.md
  - doc/design/lingzhiji/core-loop.md
  - doc/design/lingzhiji/real-day.md
  - doc/design/lingzhiji/save.md
  - doc/design/lingzhiji/farming.md
  - doc/design/lingzhiji/economy.md
---

# 时间解耦与节奏压缩设计（T49）

> 状态：approved（2026-11-18 用户确认后实施，同日交付）。
> 实施记录：`runMeditationBatch`（engine.ts）逐日复用 endDay 管线；`meditate.ts` 重写为纯函数助手（快照派生 / 确定性预演 / 副本轨迹同源）；存档 v4→v5。与 draft 的差异：① 明日预告挂在 advanceDay 尾部（手动 END_DAY 与入定共用），kind 'action' 不弹 toast 只入日志；② 月末出关（第 30 日早晨）不补跑日终预告，定额结算接管过渡；③ 入定跨度校验 `dayInMonth + days ≤ 30` 返回 `EXCEEDS_MONTH`（新 reason）。

## 1. 需求追溯

- 关联需求：REQ-LINGZHIJI-TIME-001（全节）
- 覆盖：MEDITATE 动作与批量结算管线、生长期压缩与 sim 重校、地力透支删除清单、测验奖励锚迁移、存档 v4→v5、明日预告
- 未覆盖：品阶重定义/删吐纳（身份包）、离线收益、逐株收获演出——另行立项

## 2. 契约引用

无新契约。GameState 变更随存档 v5 走 `save.md` migrations 链；`MeditateService` 为 UI 层接口（原型已定义，接引擎后由引擎快照实现同一接口）。

## 3. 技术设计

### 3.1 MEDITATE 动作（engine.ts）

```text
applyAction MEDITATE { days: number }:
  1. 前置：phase==='day'（QUOTA_PENDING 拒绝）；dayInMonth+days ≤ 30（EXCEEDS_MONTH 拒绝）
  2. 循环 days 次：调用现有 endDay(s, rng)（五步管线原样复用）
     - endDay 内 phase 置 'quota'（月末）时立即 break，入定提前出关
     - 筑基 milestoneShown 中间态：批量先完成、落盘后再由 UI 弹 MilestoneScreen
  3. 汇总：本次入定的事件/成熟/减产/突破折叠为 ≤3 条日志（kind='settle'）
  4. 返回差量摘要（MeditatePreview 形状对齐原型接口），store 转 toast/结果面板
```

- **等价性**：MEDITATE 不引入新结算路径，逐日调用 endDay；rngState 随每次 endDay 推进，与手动 END_DAY×N 序列一致（vitest 断言全状态等价）
- 入定期间每日视为「未浇灌日」：endDay 步骤 4 缺水结算照常——干旱取舍由现有规则自然产生，零新规则

### 3.2 生长期压缩（constants.ts）

HERBS.days：15→5、20→7、30→10、35→12、50→17、60→20。Lv2 功法 −1 与最低 1 天钳制不变。

**sim 重校（balance-sim.ts，实施内完成）**：
- 现实日三档策略改为 session 口径：`perSession`（每 session 1~3 茬）
- 报告：晋阶（520 修为）所需 session 中位数/P90、月定额达成率、灵石收支曲线
- 若定额达成率 <95%：优先调 QUOTA_TARGET 与售价，不动 days 表
- exp 不动假设的验证：晋阶节奏显著过快（<15 session）时回调 exp 或提高晋阶阈值，二选一在报告给出

### 3.3 地力透支删除清单

| 位置 | 动作 |
|---|---|
| constants.ts | 删 `DIMINISH_EVENT_CHANCE`、`DIMINISH_EXP_MULT` |
| types.ts | 删 `RealDayState.gamesToday` |
| engine.ts | 删 endDay/advanceDay 中 gamesToday 分支（:147,:170,:178）与事件率切换 |
| farming.ts | 删 :103 diminishing 分支 |
| clock.ts | syncRealDay 删 gamesToday 重置（:62） |
| save.ts | v5 迁移删字段；validate 删校验 |
| TopBar.tsx | 删「地力透支」标签及首次说明日志逻辑 |
| DebugPanel.tsx | 删依赖 gamesToday 的调试项 |
| 测试 | engine/farming/clock 相关用例同步删 |

### 3.4 测验奖励锚现实日（quiz.ts / clock.ts）

- `quizDaily.done` 语义改为「本现实日已领奖励」：END_DAY 推进不再重置；syncRealDay 跨日时重置
- 同现实日第二场：QUIZ_* 全流程可用（SRS 照常 grade），QUIZ_CONFIRM 发 0 资源并在结果页注明「今日奖励已领（每现实日一次）」
- END_DAY 门控删除：core-loop §3.3 步骤 1 移除；ActionPanel 结束按钮的 gateOpen 分支、教程第 1 步文案同步
- 打卡/连胜逻辑不动（已锚现实日）

### 3.5 存档 v4→v5（save.ts）

| 变更 | 迁移规则 |
|---|---|
| 生长中田块 | `progress = round(progress × 新days/旧days)`；≥新days 置成熟；成熟/空田不动 |
| realDay | 删 gamesToday；today 保留 |
| quizDaily | 若迁移时刻处于「当日已完成」，保持 done=true（当日不再重复发奖） |
| 版本 | SAVE_VERSION=5；v4 导码顺序迁移后可玩 |

### 3.6 明日预告

- 常量池 `TOMORROW_HINTS`（行情/灵潮/天象/后山 8~10 条）+ `drawTomorrowHint(rng)`：按 rngState 确定性抽取，附在 endDay 最后一条日志尾部（手动 END_DAY 与入定共用）
- 首版纯文案；不绑定次日事件触发（预告是氛围钩子，不是承诺）

## 4. 界面原型

已落沉淀型原型（MeditateModal 四态 + ActionPanel 入口），关键屏：

```text
┌─ 入定 ──────────────────────────────┐
│ 入定时长 [========●----] 7 天        │
│ 快捷：1天 3天 7天 · 至下次成熟        │
│ 1 号田 青灵草 ████░ 3/5 · 缺水1天    │
│ 出关预演：第 19 日 · ⚠ 缺水减产      │
│ [返回] [入定 7 天]                   │
└─────────────────────────────────────┘
┌─ 入定 · 已出关 ─────────────────────┐
│ 一晃 7 天过去——                     │
│ 第14日 灵雨：全田+2天                │
│ 第15日 🌾 青灵草成熟（1号田）         │
│ 第16日 ⚠ 凝露花缺水减产              │
│ 🔮 明日预告：坊市风声…               │
│ [回到灵田]                           │
└─────────────────────────────────────┘
月末拦截：「今日已是月末，需先完成定额结算」+ [返回]
存档异常：「存档状态异常，无法入定」
```

## 5. 交互与异常

| 场景 | 行为 |
|---|---|
| 入定跨度超月末 | 滑条上限即当月末，EXCEEDS_MONTH 兜底拒绝 |
| 月末出关 | phase='quota'，QuotaModal 既有中间态存档恢复机制复用 |
| 入定中筑基 | 批量结算完成落盘 → MilestoneScreen；刷新恢复不重弹 |
| 全田成熟时「至下次成熟」 | 快捷档置灰，提示先收获 |
| 同现实日二场测验 | 正常答题无奖励；入口徽标显示「今日奖励已领」 |
| 旧档折算后恰达成熟 | 置成熟（不丢收成），日志记迁移说明一条 |

## 6. 验证方式

- vitest：MEDITATE≡END_DAY×N 等价（固定 rngState 全状态对比）；月末截断；筑基中间态；v4→v5 折算边界；测验现实日锚（同日二场、跨日恢复）；删除面回归（gamesToday 相关全删后 154 基线更新）
- balance-sim：session 口径报告（见 §3.2）
- e2e：入定→收获→入定→月末定额→新月初全链路
- smoke：浏览器实机入定 7 天看摘要/预告/日志折叠

### 交付验证记录（2026-11-18）

- typecheck 全绿；vitest 163/163（新增 meditate 8 例 + engine 入定 6 例 + clock 测验锚 1 例 + recovery v4→v5 3 例，净增 9）
- e2e 5/5（E2E_PORT=4173，新增「入定快进全链路」用例：播种→入定 5 天→出关摘要→收获闭环）
- 浏览器 smoke 13 项全过（artifacts/smoke/t49/，截图 4 张）：预演联动、成熟田置灰提示、出关摘要/预告、日志折叠实证（入定 7 天后日志头部仅「入定 7 天」+「明日预告」2 条新增）、同现实日加练提示
- sim 500 局：筑基游戏日中位 session1 41 / session2 62 / session3 88；定额达成率见需求 §11——session3 94% 未达 95% 线，根因开局爬坡非定额错配，数值不动、调参候选待拍板
