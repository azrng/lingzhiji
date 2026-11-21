---
doc_id: DES-LINGZHIJI-ALCHEMY-001
doc_type: design
module: lingzhiji
feature: alchemy
status: in-review
last_updated: 2026-11-21
relations:
  - doc/requirements/lingzhiji/alchemy.md
  - doc/design/lingzhiji/economy.md
  - doc/design/lingzhiji/save.md
  - doc/design/lingzhiji/core-loop.md
---

# 炼丹坊设计（T65）

> 状态：in-review（2026-11-21 初稿，随 T63 提案获批展开）。存档 v10 与入定挂起抉择共享窗口，先落地者定号。

## 1. 需求追溯

- 关联需求：REQ-LINGZHIJI-ALCHEMY-001（全节）
- 覆盖：丹方表、炉位状态机、动作与校验、弹层原型、存档 v10、sim 方案
- 未覆盖：丹药库存、buff 类效果、多炉位（需求 §2 不包含）

## 2. 契约引用

无新对外契约。`s.alchemy` 新增随存档 v10；效果只复用修为/心得（`gainCultivation` 统一口）。

## 3. 技术设计

### 3.1 丹方表（constants.ts ELIXIRS）

| id | 名称 | 境界 | 材料 | 灵石 | 灵气 | 天数 | 效果 |
|---|---|---|---|---|---|---|---|
| juqi | 聚气丹 | 0 | 青灵草×5 | 10 | 1 | 3 | 修为 +15 |
| ningshen | 凝神丹 | 2 | 凝露花×3 紫云芝×1 | 30 | 1 | 4 | 心得 +25 |
| peiyuan | 培元丹 | 4 | 金铃藤×2 玄参×2 | 60 | 2 | 5 | 修为 +60 |
| longxue | 龙血丹 | 6 | 碧髓竹×2 幽冥花×2 龙血藤×1 | 120 | 2 | 6 | 修为 +150 |
| tianxin | 天心丹 | 8 | 天心莲×2 紫金葫芦×1 | 200 | 3 | 7 | 修为 +320 |

- 数值原则：丹药修为效率 ≈ 卖草买残卷路径的 1.2~1.4 倍（价值倍增来源），sim 校准 ≤10% 筑基提速
- 材料跨草组合刻意制造「种什么」的规划决策（如龙血丹需要 r5+r6+r6 三草接力）

```ts
interface ElixirDef { id; name; realm; herbs: Partial<Record<HerbId, number>>; stones; qi; days; effect: { kind: 'cultivation' | 'insight'; amount } }
```

### 3.2 状态与动作

```ts
// types.ts（存档 v10）
s.alchemy = { brewing: { recipe: ElixirId; doneDay: number } | null }
// actions
ALCHEMY_BREW { recipe: ElixirId }   // 校验序：境界→炉位空→材料→灵石→灵气；一次性扣除；doneDay = s.day + def.days
ALCHEMY_COLLECT                      // s.day >= doneDay → 效果生效 + 日志「丹成 · <名>」；炉位清空
```

- endDay 不主动结算炉位（领取时比对 doneDay 即可，无每日管线改动）；入定批量推进 s.day 天然使 doneDay 相对提前
- phase 门控沿全局口径；ReasonCode 复用（REALM_LOCKED / NO_HERB / NO_STONES / NO_QI / ALREADY_DONE 炉位占用 / NOT_MATURE 未成丹）

### 3.3 UI（AlchemyModal，唯一新 UI）

- 入口：ActionPanel「炼丹」按钮（坊市旁）；brewing 非空时按钮带「🔥丹成可领」徽记（成丹后才亮）
- 弹层：上部炉位卡（空/炼制中 `剩余 N 天`/可领取 [领取]）；下部丹方列表 5 行（材料图标+持有数、消耗、效果、[开炼] 禁用态+缺什么）

```text
┌ 炼丹坊 ─────────────────────────────┐
│ 🔥 炉位：炼制中 · 龙血丹（剩 2 天）    │
│ ─────────────────────────────────  │
│ 聚气丹  青灵草×5 · 10灵石 · 1灵气     │
│         3 天 → 修为 +15    [开炼]    │
│ …（5 行，境界锁行灰显）                │
└─────────────────────────────────────┘
```

状态：全部纯本地渲染；loading/error 不适用。

### 3.4 存档 v10

- v9 → v10：`alchemy: { brewing: null }` 补空；导入校验：brewing null 或 { recipe 白名单, doneDay 正整数 ≥ day }

## 4. 交互与异常

| 场景 | 行为 |
|---|---|
| 炉位占用再开 | ALREADY_DONE（按钮禁用 + title 说明） |
| 成丹日恰为月末 | quota 相不能领，出关后领（phase 门控） |
| 材料草被同时用于委托交付 | 开炼已扣的不受影响；未开炼的按开炼时点校验 |
| 旧档导入 | 补空炉位 |

## 5. 验证方式

1. vitest：开炼校验序与扣除、doneDay 推进（入定快进等价）、领取效果与炉位释放、互斥、v10 迁移与校验
2. sim 500 局：新 `炼丹策略`（高境界草全部炼丹）对照基线——筑基提速 ≤10%、定额达成率不劣化
3. e2e/smoke：弹层流转 + 炉位徽记

## 6. 实施同步项

- economy.md（灵石消耗端补炼丹）、farming.md（高阶草去向）、save.md v10、PRD §6/§12、三索引
- roadmap-assets：炼丹炉素材（可选，emoji 兜底先行）
