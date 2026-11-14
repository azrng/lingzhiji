---
doc_id: CON-LINGZHIJI-SAVE-001
doc_type: contract-draft
module: lingzhiji
feature: save
status: superseded
last_updated: 2026-11-15
relations:
  - doc/design/lingzhiji/save.md
  - doc/design/architecture.md
  - src/game/types.ts
  - src/game/save.ts
---

# 契约草案：存档数据结构 v1（CON-LINGZHIJI-SAVE-001）

> **已落地（2026-11-15）**：本契约由阶段 1 实现落地为代码，**最终事实来源变更为 `src/game/types.ts`（GameState 结构）与 `src/game/save.ts`（校验与导码）**；本文件保留为历史草案，不再维护字段表，后续结构变更直接修改代码并同步 `doc/design/lingzhiji/save.md`。
>
> 落地差异说明：`rngState` 内嵌于 `GameState`（草案为顶层字段）；`LibStat.distinct` 改为 `distinctWords: string[]`（可序列化且支持首答口径）；新增 `MILESTONE_SHOWN` / `TUTORIAL_DONE` 动作。字段语义与设计文档一致。

## 顶层

| 字段 | 类型 | 说明 |
|---|---|---|
| version | `1` | 存档版本；未知版本拒绝加载 |
| updatedAt | number | 最近保存时间戳（展示用） |
| rngState | number | PRNG 内部状态（mulberry32），随档推进保证可复现 |
| game | GameState | 游戏状态主体（下表） |

## GameState

| 字段 | 类型 | 说明 |
|---|---|---|
| day | int ≥1 | 当前游戏日；月份与月内日派生计算 |
| phase | `'day' \| 'quota'` | 白天 / 月末定额结算交互中 |
| ap / wateredToday / tunaUsedToday | int / bool / bool | 每日重置标记（core-loop.md） |
| pendingTomorrow | `{ infusionDouble?: bool, marketMult?: 1.5 \| 0.7 }` | 持续类事件效果，次日生效后清空 |
| resources | `{ stones, contribution, qi, insight, cultivation }` | 全部 ≥0；qi 受境界上限 |
| realm | int 枚举 0–9 | 0–8 = 练气一至九层，9 = 筑基；上限/折扣/可种集合由境界派生，不入档 |
| gongfaLevel | int 1–5 | 功法等级 |
| fields[] | Field[] | 田块（farming.md §3.1） |
| inventory / seeds | `{ [id]: int }` | 灵草仓库 / 种子库存，值 ≥0 |
| quizDaily | `{ done: bool, session?: QuizSession }` | 当日任务堂状态与进行中会话 |
| learning | Learning | 词库学习记录（quiz.md §3.4） |
| month | `{ unpaidStreak: int ≥0, ledger: MonthRecord[] }` | 欠缴账本与逐月结算摘要 |
| milestoneShown / tutorialDone | bool | 筑基结算已展示 / 新手引导已完成 |
| log[] | LogEntry[] ≤50 | 环形日志（core-loop.md §3.5） |

## 子结构

| 结构 | 字段 | 说明 |
|---|---|---|
| Field | `id, status('empty'\|'growing'\|'mature'\|'confiscated'), seedId?, progress?, curYield?, dryStreak?, halved?, refundSeed?` | 田块状态机载体 |
| QuizSession | `lib('cet4'\|'cet6'), words[10]{word, from('new'\|'review')}, phase('learning'\|'testing'\|'result'), idx, answers[10?]{choice, correct}` | 生成后词库与题目锁定；中断恢复依据 |
| Learning | `currentLib, seenMap{ [归一化词]: { lastSeenDay } }, libs{ cet4: LibStat, cet6: LibStat }` | 跨库共享见词标记；分库统计 |
| LibStat | `attempts, distinctWords, firstCorrect{hit,total}, reviewCorrect{hit,total}, sessions, wrongQueue[归一化词]` | §8.4 学习统计与错词队列 |
| MonthRecord | `month, paid(bool), 用作缴纳的灵草明细, 贡献变动` | 逐月摘要，供成绩单展示 |

## 校验规则（导入时逐项执行）

1. Base64 解码成功且为合法 UTF-8 JSON（`BAD_BASE64` / `BAD_JSON`）
2. `version` 为已识别版本（`BAD_VERSION`）
3. 结构完整：必需字段齐备、枚举值合法、全部数值字段 ≥0、`fields`/`answers` 长度合法（`BAD_SHAPE`）
4. 任一失败保留原档并返回对应 reason；通过才覆盖

## 迁移说明

- v1 为初始版本；后续变更按顺序迁移链 `migrations[]` 升格，旧档不清空修为、种植、资源与学习记录（PRD §5.2 存档兼容要求）
- 本草案字段与各设计文档一致；冲突时以本草案为准并回改设计文档
