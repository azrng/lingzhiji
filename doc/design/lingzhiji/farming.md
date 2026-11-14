---
doc_id: DES-LINGZHIJI-FARM-001
doc_type: design
module: lingzhiji
feature: farming
status: approved
last_updated: 2026-11-14
relations:
  - doc/requirements/lingzhiji/v0.1-prd.md
  - doc/design/architecture.md
  - doc/design/lingzhiji/core-loop.md
  - doc/design/lingzhiji/progression.md
---

# 灵田种植设计

## 1. 需求追溯

- 关联需求：REQ-LINGZHIJI-001 §3（开局设定）、§5.2（境界解锁）、§6（灵草与种植）、§7（行动清单）、§11（田相关事件）
- 覆盖：田块状态机、播种校验、浇灌与缺水、生长与灌注、收获、开荒与赎回
- 未覆盖：种子买卖（economy.md）、修为入账与突破（progression.md）、日结算顺序（core-loop.md）

## 2. 契约引用

无对外契约；田块与仓库字段（`fields[]` / `inventory` / `seeds`）见 CON-LINGZHIJI-SAVE-001 草案。灵草、种子数值表集中于 `src/game/constants.ts`（PRD §6 灵草表为需求事实来源，代码以常量表实现）。

## 3. 技术设计

### 3.1 田块状态机

```text
empty ──PLANT──► growing ──progress ≥ 生长期──► mature ──HARVEST──► empty
  ▲                │  dryStreak ≥3 时当茬减半一次（halved 标记）      │
  │                └─ 虫害/灵蝶改 curYield；阵法波动回退 progress      │
  └── 被宗门收回（连续欠缴）→ confiscated ──REDEEM（100 贡献）──► empty
```

- `growing` 字段：`seedId`、`progress`（天）、`curYield`（当茬当前产量）、`dryStreak`、`halved`
- `mature`：保留 `curYield`，停止缺水累计、不受阵法波动影响，停驻待收
- `confiscated`：记录 `refundSeed`（收回时有作物则退还 1 枚对应种子并清茬；空田收回则无）；可赎回，不可开荒绕过

### 3.2 播种（PLANT，0 AP）

校验顺序固定，全部通过才扣资源；任一失败返回 reason 且**零消耗**（种子 / 灵气 / AP 均不动）：

1. 目标田为空（`NOT_EMPTY`）
2. 境界达到该灵植要求（`REALM_LOCKED`）
3. 灵气 ≥ 播种灵气（`NO_QI`）
4. 库存有该种子（`NO_SEED`）

通过后：扣 1 枚种子 + 表中灵气，田置 `growing`（`progress=0`、`curYield=基础收获`、`dryStreak=0`、`halved=false`）。每块田一茬一种；无成功率抽签。

### 3.3 浇灌与缺水（WATER，1 AP）

- 成功后置 `wateredToday = true`：当日全田免缺水（含浇灌后新播种的田），并把当前生长中作物 `dryStreak` 清零
- 日终缺水结算（core-loop.md 步骤 4）：`!wateredToday` 且生长中的田 `dryStreak +1`；`dryStreak` 连续达 3 → 当茬 `curYield` 减半向上取整（原产量 0 保持 0），置 `halved = true` 并清零计数；同茬不重复减半，后续缺水可再累计
- 成熟与空田不累计缺水；灌注、灵雨等加速不等于浇灌

### 3.4 生长与灌注（IRRIGATE，0 AP）

- 生长期 = 表值 −（功法 Lv2 ? 1 : 0），最低 1 天；Lv2 升级时对全部生长中田立即重检成熟
- 自然生长在日终统一 +1（core-loop.md 步骤 3）；灌注即时：前置「至少一块生长中田」（`NO_CROP`，无则不扣灵气），消耗 1 灵气，全部生长中田 `progress +N`（N = 1 +（Lv5 ? 1 : 0），若 `pendingTomorrow.infusionDouble` 则 N ×2），达成熟立即停驻
- 阵法波动（事件）：生长中田 `progress −1`，钳制 ≥0；已成熟保持成熟

### 3.5 收获（HARVEST，1 AP/块）

- 前置：田为 `mature`（`NOT_MATURE`）且 AP ≥1（`NO_AP`）
- 产量 = `curYield` ×（Lv3 ? 1.15 : 1），向上取整；虫害致 0 则保持 0（功法加成不恢复 0）
- 入账：灵草入仓库；修为 = 每株修为 × 产量，走 `progression.gainCultivation()` 统一入口（可能触发突破）
- 成熟不过收无惩罚；收获后田回 `empty`

### 3.6 开荒与赎回（RECLAIM，2 AP / 100 贡献）

- 开荒：持有田数（含 confiscated）< 境界田上限（`FIELD_LIMIT`）且 AP ≥2；存在被收回田时必须先赎回（`HAS_CONFISCATED`，不可免费开荒绕过）
- 赎回：贡献 ≥100（`NO_CONTRIBUTION`），田回 `empty`，贡献 −100
- 收回规则（连续两月欠缴触发，见 economy.md）：优先收空田；无空田收随机一块（PRNG），退还其种子（如有）、当茬清空并提示

### 3.7 事件产量顺序

日终内严格按：事件即时效果改 `curYield` → 缺水减产 → （次日）收获时功法加成。例：3 株缺水变 2 株，Lv3 收获加成后为 3 株；2 株缺水变 1 株后虫害减至 0，收获仍为 0。

## 4. 界面原型

田格四态（FieldGrid，完整布局见 `lingzhiji/ui.md`）：

```text
┌─ 空田 ──────┐ ┌─ 生长中 ─────────┐ ┌─ 成熟 ─────────┐ ┌─ 被收回 ──────┐
│             │ │ 🌱 青灵草        │ │ ✨ 凝露花      │ │ 🔒 灵田被收回 │
│  ＋ 播种    │ │ ▓▓▓░░ 8/15 天   │ │  可收获        │ │  缴 100 贡献  │
│             │ │ 产量 5 · 缺水 2 │ │  产量 4        │ │  可赎回       │
└─────────────┘ └──────────────────┘ └────────────────┘ └───────────────┘
```

播种弹层（点空田触发；列表项右侧为可种状态）：

```text
┌─ 3 号田 · 播种 ────────────────────────────────────┐
│ 灵植       播种灵气  库存  状态                      │
│ 青灵草     1        2     [播种]                    │
│ 凝露花     1        0     [灵气不足]  ← 条件不足态   │
│ 紫云芝     2        3     [需练气三层] ← 条件不足态  │
│ 赤髓参     2        0     [库存不足 · 可去坊市]      │
│                                   [关闭]            │
└────────────────────────────────────────────────────┘
```

- 条件不足项保留名称与原因（对齐 design-system 候选规范「禁用展示原因」），不降透明度了事

## 5. 交互与异常

| 场景 | 行为 |
|---|---|
| 境界达标但灵气不足 | 播种拒绝 `NO_QI`，提示「灵气不足（2/2），完成任务堂可获得灵气」 |
| 开局全错只得 1 灵气 | 仍可种 1 块青灵草（PRD §13 引导口径），提示剩余灵气 |
| 无生长中作物点灌注 | 拒绝 `NO_CROP`，不扣灵气 |
| 同日播种多块 | 允许；错峰提示仅在日志提醒同日成熟风险，不做自动排产 |
| 收获 AP 不足 | 按钮条件不足态「行动力不足」；成熟作物安全等待 |

## 6. 验证方式

- vitest：播种四项校验与零消耗（PRD §16.6）；缺水 3 天减半一次、0 产量不恢复；事件→缺水→功法加成的产量顺序；Lv2 立即重检成熟；Lv5 与灵泉灌注叠加（1→2→4）；开荒上限与被收田拦截；赎回扣贡献
- smoke test：种植 → 浇灌 → 灌注 → 收获全路径；境界不足时播种被拦截且资源不变
