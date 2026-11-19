---
doc_id: DES-LINGZHIJI-CODEX-001
doc_type: design
module: lingzhiji
feature: herb-codex
status: approved
last_updated: 2026-11-19
relations:
  - doc/requirements/lingzhiji/herb-codex.md
  - doc/design/lingzhiji/farming.md
  - doc/design/lingzhiji/economy.md
  - doc/design/lingzhiji/progression.md
  - doc/design/lingzhiji/encounters.md
  - doc/design/lingzhiji/save.md
---

# 灵植图鉴与稀有变异设计（T56）

> 状态：approved（2026-11-19 用户「开始」指令确认，同日实施落地）。实施记录：存档 v8→v9（draft 预估 v7 共享窗口，T55/T57 先行占用）；与 draft 的差异：①CodexEntry 增加 `harvested` 计数（需求 §4.3「已收获计数」的字段落点，只计收获入账）；②灵草入账收口 `farming.gainHerb`（事件 inventory+ 与收获共用，置解锁）；③素材未到位——9 新草 emoji 兜底（HerbSprite 前六图集/后九 emoji，规格登记 roadmap-assets.md #14–#17）；④v9 迁移对残缺记录（缺旧 6 草键）保持原样交 validate，不静默重建。

## 1. 需求追溯

- 关联需求：REQ-LINGZHIJI-CODEX-001（全节）
- 覆盖：HERBS 扩容表、变异结算点与算法、图鉴状态与口径、弹层原型、存档迁移、sim 验证方案
- 未覆盖：收集奖励、变异独立物品/展示柜、第二批扩容、新特质——需求 §2 不包含项
- 联动：`encounters.md` 灵田异变效果随本设计改为「保底变异」（该文档已同步标注）

## 2. 契约引用

无新对外契约。`HERBS` / `HerbId` 事实来源为 `src/game/constants.ts`（扩容即改此表）；图鉴状态入 GameState 随存档 v9 迁移（v7=T55 奇遇、v8=T57 市场事件先后占用）。

## 3. 技术设计

### 3.1 草药扩容（HERBS 6 → 15）

新增 9 种（数值为**初版建议值**，sim 500 局验证后定稿；卖价沿「种子价 ×0.75~0.9」惯例，高境界填龙血藤/九叶莲之间的空档）：

| id | 名称 | 境界 | 种子价 | 灵气 | 天数 | 株产 | 卖价 | 心得 | 适播季 | 特质 |
|---|---|---|---|---|---|---|---|---|---|---|
| yuejian | 月见蔓 | 1 | 8 | 1 | 6 | 5 | 6 | 1 | 生发 | 固氮 |
| xuexin | 雪芯兰 | 2 | 30 | 2 | 9 | 4 | 24 | 2 | 长养 | 喜湿 |
| jinling | 金铃藤 | 3 | 50 | 2 | 11 | 3 | 42 | 3 | 收藏 | 驱虫 |
| xuanshen | 玄参 | 4 | 90 | 2 | 13 | 3 | 75 | 4 | 收藏 | 耐阴 |
| zhuguo | 朱果 | 4 | 110 | 3 | 14 | 2 | 95 | 5 | 生发 | 无 |
| bisui | 碧髓竹 | 5 | 130 | 3 | 16 | 2 | 115 | 6 | 长养 | 深根 |
| youming | 幽冥花 | 6 | 200 | 3 | 17 | 2 | 180 | 8 | 收藏 | 耐阴 |
| tianxin | 天心莲 | 7 | 230 | 3 | 18 | 2 | 210 | 9 | 长养 | 喜湿 |
| zijinhu | 紫金葫芦 | 8 | 300 | 3 | 21 | 2 | 280 | 12 | 收藏 | 无 |

- 特质全部复用现有 5 种（固氮/喜湿/耐阴/驱虫/深根），新特质二期
- 下游自动受益面：坊市、委托目标池、物候适播、种子折扣（SEED_DISCOUNT_REALM）均按 HERBS 驱动，无需逐处改；**sim 必须覆盖**：定额当量路径、筑基月数、委托定价（COMMISSION_QUOTA_EQUIV 口径）

### 3.2 稀有变异（收获结算点）

```text
HARVEST（farming.ts 收获分支）:
  mutants = 0
  for i in 1..yield:            // 逐株独立判定（存档 rngState，确定性）
    if rng.next() < MUTATION_RATE (0.03): mutants++
  if field.mutationGuaranteed: mutants = max(mutants, 1)   // 灵田异变奇遇保底
  收获量 = yield + mutants        // 每变异株即「该株 ×2」，等效且免库存变体
  if mutants > 0: codex[herb].mutants += mutants; 日志/飘字「✨变异！」（motion-pack 粒子）
```

**变异株不作为独立库存物品**（关键取舍）：若做独立物品，库存 / 坊市卖价 / 委托当量 / 定额全链路都要加变体维度，收益只是「能囤变异株」；v1 把变异价值即时兑现（+1 株）+ 图鉴留痕，经济链路零污染。二期若要展示柜再扩。

- 高株产草（如月见蔓 5 株）变异机会多于低株产草——株多机会多，叙事自洽
- 灵田异变奇遇：兑现时给随机生长中田置 `mutationGuaranteed`（新田块字段），下次收获消费；无生长中田则无事发生（沿奇遇无目标惯例）
- 入定快进不涉及变异（收获是玩家动作，入定不收田）

### 3.3 图鉴状态与口径

```text
s.codex: Record<HerbId, { unlocked: boolean; mutants: number }>
```

- 解锁口径「获得过」：任何库存入账点（HARVEST / 事件 inventory+ / 奇遇 / 散修易货）统一置位——实施时把库存入账收口为一个 helper（现有 harvest、applyEvent 两处直改库存，收口顺带消重）
- 收集度派生：`unlocked 计数 / HERBS.length`、`mutants>0 计数 / HERBS.length`，不冗余存总数
- 存档 v7（与奇遇共享窗口，先落地者定号）：迁移时按当时库存反推 `unlocked`（有库存即解锁），`mutants` 归零——旧档不丢基础收集感，变异从零计

### 3.4 图鉴弹层（唯一新界面）

- 入口：修行卡「图鉴」按钮（「仓库」旁，沿 T51 仓库只读弹层先例）；弹层可滚动、按境界分组、点击条目展开详情
- 条目三态：未解锁（立绘剪影 + 名称「？？？'）/ 已解锁（立绘 + 特质 + 适播季 + 生长期 + 境界 + 卖价参考 + 已收计数）/ 变异徽记（✨ + 变异累计数）

```text
┌ 灵植图鉴 ─────────────── 收集 6/15 · 变异 1/15 ┐
│ ▾ 练气一层                                       │
│   ▣ 青灵草 ✨×1   已收 23 · 固氮 · 生发季 · 5 天  │
│   ▣ 凝露花        已收 12 · 喜湿 · 长养季 · 7 天  │
│ ▾ 练气二层                                       │
│   ▢ ？？？        尚未获得（剪影）                │
│   …（15 条，滚动）                               │
└──────────────────────────────────────────────────┘
```

- 状态：空态=全剪影 + 收集度 0/15（新档首开）；加载/错误/权限不适用（纯本地数据，弹层同步渲染）；变异 0/15 时变异计数行灰显不隐藏（保留目标感）

### 3.5 素材（登记 roadmap-assets.md，实施同步）

- 9 新草：田里生长表现 + 图鉴立绘（各 2 张）
- 变异视觉：收获飘字 + 立绘变异色叠加层（可全草共用 shimmer 效果，先 emoji/色相兜底）
- 剪影：立绘灰度处理，无独立素材

## 4. 交互与异常

| 场景 | 行为 |
|---|---|
| 一茬多株变异 | mutants 累加，收获量一次结算，日志记「✨变异 ×k」 |
| 灵田异变置保底后田被铲除/换茬 | `mutationGuaranteed` 随田块状态清除，不跨茬继承（KISS：换茬即失效，文案口径「灵气散去」） |
| 变异产量入定额/委托 | 照常计入，无特判 |
| 旧档导入 | codex 由库存反推，mutants 归零，导入校验白名单加 codex |
| HerbId 扩容对存档 | `Record<HerbId, number>` 类型的 seeds/inventory 迁移时补 9 个新键（默认 0） |

## 5. 验证方式

1. vitest：逐株变异确定性（同 rngState 同结果）、保底消费一次即失效、codex 解锁/徽记口径（奇遇入账也算解锁）、v6→v7 迁移（库存反推 + 新键补齐）、15 草全链路（买种/播种/收获/卖出/委托池）
2. sim 500 局：新价格表 + 变异 +3% 期望增量下，定额达成率与筑基月数不劣化；变异频次分布符合 3%/株
3. e2e/smoke：图鉴弹层三态、收获变异飘字、修行卡入口

## 6. 实施时同步项（阶段 1 清单）

- `farming.md`（HERBS 扩容与收获变异分支）、`economy.md`（价格表）、`save.md`（v7 迁移）随实现转 in-review 同批更新
- `encounters.md` 灵田异变条目已按本设计联动（保底变异），若变异触发模型改选需回改两处
- `roadmap-assets.md` 登记新草与变异素材；`ui.md` 登记图鉴弹层
