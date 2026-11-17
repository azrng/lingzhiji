---
doc_id: REQ-INDEX
doc_type: requirement-index
module: root
status: approved
last_updated: 2026-11-14
---

# 需求索引

## 项目目标

做一款单机网页小游戏：以"背单词"为唯一学习行为，通过游戏养成循环为每日背词提供长期动机容器。当前方向为修仙种田题材《灵植记》。

## 模块清单

| 模块 | 功能 | 文档 | 状态 | 说明 |
|---|---|---|---|---|
| lingzhiji | 灵植记 PRD v0.1 | `lingzhiji/v0.1-prd.md` | approved | MVP：灵草种植阶梯 + 定额缴纳 + 任务堂背单词 + 修为境界（目标筑基） |
| lingzhiji | 灵植堂委托（M6b） | `lingzhiji/cultivation-commissions.md` | in-review | 月度可选委托，为已有灵草增加目标与用途；阶段 0 待确认 |

## 跨模块公共约束
- 背单词为核心学习系统：抽题、判分、奖励口径以 `lingzhiji/v0.1-prd.md` §8 为唯一事实来源。
