---
doc_id: REQ-INDEX
doc_type: requirement-index
module: root
status: approved
last_updated: 2026-11-19
---

# 需求索引

## 项目目标

做一款单机网页小游戏：以"背单词"为唯一学习行为，通过游戏养成循环为每日背词提供长期动机容器。当前方向为修仙种田题材《灵植记》。

## 模块清单

| 模块 | 功能 | 文档 | 状态 | 说明 |
|---|---|---|---|---|
| lingzhiji | 灵植记 PRD v0.1 | `lingzhiji/v0.1-prd.md` | approved | MVP：灵草种植阶梯 + 定额缴纳 + 任务堂背单词 + 修为境界（目标筑基） |
| lingzhiji | 灵植堂委托（M6b） | `lingzhiji/cultivation-commissions.md` | in-review | 月度可选委托，为已有灵草增加目标与用途；阶段 0 待确认 |
| lingzhiji | 时间解耦与节奏压缩（T49） | `lingzhiji/time-decouple.md` | approved | 入定快进+生长期÷3+删地力透支+测验奖励锚现实日；设计见 `design/lingzhiji/time-decouple.md` |
| lingzhiji | 奇遇系统（三档机缘，T55） | `lingzhiji/encounters.md` | approved | 普通/特殊/传说·机缘三档；特殊档预告绑定必兑现；v1 自动结算 |
| lingzhiji | 灵植图鉴与稀有变异（T56） | `lingzhiji/herb-codex.md` | approved | 草药 6→15 首批扩容+收获时 3% 变异株+只读图鉴弹层；关键选型按推荐案确认 |
| lingzhiji | 市场事件与行情周期（T57） | `lingzhiji/market-events.md` | approved | 月度市场事件池（炼丹大会/宗门采购等）+15 日预告下月+按草定向系数；移除旧全局行情事件 |

## 跨模块公共约束
- 背单词为核心学习系统：抽题、判分、奖励口径以 `lingzhiji/v0.1-prd.md` §8 为唯一事实来源。
