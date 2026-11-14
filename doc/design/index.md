---
doc_id: DES-INDEX
doc_type: design-index
module: root
status: approved
last_updated: 2026-11-15
relations:
  - doc/index.md
  - doc/requirements/lingzhiji/v0.1-prd.md
---

# 设计索引

| 模块 | 功能 | 文档 | 状态 | 关联需求 |
|---|---|---|---|---|
| lingzhiji | 总体技术设计（分层 / 技术栈 / 随机数 / 测试策略） | `architecture.md` | approved | REQ-LINGZHIJI-001 |
| lingzhiji | 核心循环（时间 / AP / 日结算 / 随机事件） | `lingzhiji/core-loop.md` | approved | REQ §2 §4 §7 §11 |
| lingzhiji | 灵田种植（播种 / 浇灌 / 收获 / 开荒 / 灌注） | `lingzhiji/farming.md` | approved | REQ §3 §5.2 §6 |
| lingzhiji | 任务堂背单词（抽题 / 测验 / 错词池 / 功法） | `lingzhiji/quiz.md` | approved | REQ §8 |
| lingzhiji | 经济（资源 / 坊市 / 宗门定额） | `lingzhiji/economy.md` | approved | REQ §5 §9 §10 |
| lingzhiji | 境界修行（修为 / 突破 / 筑基结算） | `lingzhiji/progression.md` | approved | REQ §5.2 §5.3 §8.4 |
| lingzhiji | 存档（持久化 / 导入导出 / 多标签页） | `lingzhiji/save.md` | approved | REQ §14 §16 |
| lingzhiji | 界面结构与状态（布局 / 线框 / 状态映射） | `lingzhiji/ui.md` | approved | REQ §13 |

契约：存档契约 CON-LINGZHIJI-SAVE-001 已落地为 `src/game/types.ts` + `src/game/save.ts`（代码为事实来源，历史草案 `doc/contracts/lingzhiji/save-data.md` 已标 superseded）；词库 JSON 索引见 `doc/contracts/lingzhiji.md`。

原型：界面交互原型见 `prototype/lingzhiji/game-proto/`（React 同栈 mock 工程，选型决策与状态见 `lingzhiji/ui.md` §3.6；布局已定稿为侧边日志构图）。

> 阶段流转：PRD 与全部设计文档均为 `approved` 后方可进入阶段 1；界面原型按 frontend-AGENTS.md「原型设计与确认」另行确认，视觉 token 以 `design-system.yaml`（当前为候选值）为准。
