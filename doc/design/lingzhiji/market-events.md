---
doc_id: DES-LINGZHIJI-MARKET-001
doc_type: design
module: lingzhiji
feature: market-events
status: approved
last_updated: 2026-11-19
relations:
  - doc/requirements/lingzhiji/market-events.md
  - doc/design/lingzhiji/economy.md
  - doc/design/lingzhiji/core-loop.md
  - doc/design/lingzhiji/encounters.md
  - doc/design/lingzhiji/save.md
---

# 市场事件与行情周期设计（T57）

> 状态：approved（2026-11-19 用户「开始」指令确认，按推荐案定稿）。

## 1. 需求追溯

- 关联需求：REQ-LINGZHIJI-MARKET-001（全节）
- 覆盖：事件池数据结构、月初生效/月中预掷管线挂点、价格查表、旧 marketMult 归置、委托与定额隔离口径、sim 验证方案
- 未覆盖：实时波动、走势 UI、买入端波动、事件-灵潮主题绑定——需求 §2 不包含项

## 2. 契约引用

无新对外契约。GameState 新增 `s.market`，随存档 v7 迁移（与奇遇/图鉴共享窗口）；`sellHerb`（economy.ts:42）价格口径变更即改即生效。

## 3. 技术设计

### 3.1 数据结构（constants.ts 新增 MARKET_EVENTS）

```ts
interface MarketEventDef {
  id: string
  name: string          // 炼丹大会 等
  desc: string          // 月初公告文案
  rumor: string         // 15 日预告文案（坊市风声，真话）
  target: HerbId[] | 'seasonal' | 'topRealm'   // 定向草：点名 / 当季适播 / 境界最高档（结算期解析）
  mult: number          // ×1.8 / ×1.6 / ×0.75 / ×0.85
}
```

五条初版见需求 §4.2，系数为建议值。

### 3.2 状态与管线挂点

```text
s.market = {
  current: string | null        // 当月事件 id（null=未生效，首月）
  next: string | null           // 15 日预掷的下月事件（预告=必然的留痕）
  last: string | null           // 上月事件 id（去重：不连续两月）
}
```

挂点全部在 `advanceDay`（engine.ts）已有的月初分支内/旁，与灵潮、委托刷新同点：

```text
advanceDay:
  dayInMonth(new) === 1  → s.market.current = s.market.next ?? null（兑现预告）
                          last = current；公告日志（与灵潮同日双联）
  dayInMonth(new) === 15 → s.market.next = 抽取（排除 last）
                          日志「坊市风声」rumor 文案
```

- 首月特例：开局 `current=null`，第 1 月 15 日正常预掷 → 第 2 月起每月有事件（与委托「第 2 月起」同步）
- 入定快进逐日复用 endDay/advanceDay，公告与预告自然进逐日轨迹，无特判

### 3.3 价格查表（economy.ts sellHerb 改造）

```text
sellHerb: unit = max(1, floor(表价 × eventMult(s, herb)))
eventMult = s.market.current 命中该草（含 target 解析）? def.mult : 1
```

- `seasonal` 解析：当前月适播草集合（seasonOf）；`topRealm` 解析：HERBS 中 realm ≤ s.realm 的最高档——**结算期动态解析**，存档只存事件 id 不存解析结果（跨境界/扩容安全）
- 移除 `pendingTomorrow.marketMult`、`MARKET_UP/MARKET_DOWN`、`market` 事件条目与 EventEffect kind `marketMult`（v7 迁移删字段；EVENTS 权重表少 1 条，月度灵潮 weightMult 中 market 键随之失效清理）
- TOMORROW_HINTS 删两条行情氛围文案（防真假混流），行情预告统一走 15 日通道

### 3.4 隔离口径（防连锁失衡，需求 §4.3）

- 委托奖励：月初生成 offer 时按当刻市值快照定价（现有实现即生成时定价，天然锁定；补断言防回归）
- 定额折算：`⌊表价 ÷ 4⌋` 口径不变（不乘行情系数），行情月定额压力稳定
- 种子买入价：表价口径不变

### 3.5 UI（无新页面）

- 坊市弹层（MarketPanel）顶部行情条：事件名 + 受影响草（名+系数）+ 「本月」；无事件月不显示
- 月初双联公告与 15 日坊市风声：日志条目（icon 📣 / 🧧），无 toast 弹层
- 入定出关摘要：公告/预告已在 perDay.events/日志差量内自然出现

```text
┌ 坊市 ──────────────────────────────┐
│ 📣 本月行情：炼丹大会                 │
│    凝露花 卖价 ×1.8（丹坊抢购主药）    │
│ ────────────────────────────────  │
│ （现有商品列表，命中草单价列显 ×1.8）  │
└─────────────────────────────────────┘
```

状态：无事件月行情条隐藏（空态即现状）；加载/错误/权限不适用（纯本地）。

## 4. 交互与异常

| 场景 | 行为 |
|---|---|
| 15 日入定快进跨月 | 预告/生效均在管线内，逐日轨迹可回看 |
| 月末（第 30 日）入定出关 | 出关落在 quota，事件切换在下个自然月 1 日，无竞态 |
| `next` 为 null 的旧档月中导入 | 当月无事件，下个 15 日正常预掷 |
| 同事件连续两月 | last 去重排除；池仅 5 条时极端退化可接受（概率低） |
| 预告后玩家立即囤货 | 预期行为——15 日到月初有 ~15 天窗口，正是设计目标 |

## 5. 验证方式

1. vitest：抽取去重、15 日预掷入档与月初兑现一致性（预告=必然）、价格查表含动态 target（低境界/高境界/换季边界）、委托快照不受行情、定额折算不受行情、marketMult 移除零残留（常量/事件/kind/字段四查）、v7 迁移
2. sim 500 局（+2 策略）：`无视行情基线` vs `响应行情`（预告命中则囤/种定向草）——定额达成率与筑基月数不劣化；月收益差 ≤ +25% 建议上限
3. e2e/smoke：行情条展示、15 日预告与月初兑现日志、行情月卖价与折算不变

## 6. 实施时同步项（阶段 1 清单）

- `economy.md` §3.2 售价公式与 §3.3 定额口径、`core-loop.md` 月初管线步骤、`save.md` v7 迁移链——随实现转 in-review 同批更新
- PRD §9（坊市）补市场事件条目；`encounters.md` 互引（预告=必然哲学同源，机制独立：奇遇日级队列 / 行情月级 next）
- sim 策略与报告口径沿用 commission-sim 先例
