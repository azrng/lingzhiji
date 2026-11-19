---
doc_id: DES-LINGZHIJI-ENCOUNTER-001
doc_type: design
module: lingzhiji
feature: encounters
status: approved
last_updated: 2026-11-19
relations:
  - doc/requirements/lingzhiji/encounters.md
  - doc/design/lingzhiji/core-loop.md
  - doc/design/lingzhiji/time-decouple.md
  - doc/design/lingzhiji/save.md
  - doc/design/lingzhiji/economy.md
  - doc/design/lingzhiji/progression.md
---

# 奇遇系统设计（三档机缘，T55）

> 状态：approved（2026-11-19 用户确认定稿；T54 已由本会话收尾落地）。

## 1. 需求追溯

- 关联需求：REQ-LINGZHIJI-ENCOUNTER-001（全节）
- 覆盖：三档奇遇表与触发管线、预告绑定与兑现、逐日日志表现、入定快进集成、存档 v6→v7、vitest/sim/e2e 验证方案
- 未覆盖：选择交互、奇遇图鉴、灵潮调制奇遇、连朝灵雨——需求 §2 不包含项

## 2. 契约引用

无新对外契约。GameState 新增奇遇状态字段随存档 v7 走 `save.md` migrations 链；效果结算复用 `EventEffect` 联合类型（`src/game/constants.ts` 为事实来源），新增 kind 见 §3.4。

## 3. 技术设计

### 3.1 管线插入点（core-loop §3.3 五步管线的扩展）

现有 `endDay`（engine.ts:150）六步：事件 → 生长 → 缺水 → 月末 → 推进 → 预告。奇遇挂两点：

```text
endDay:
  1.  随机事件（30%，现状不动）
  1b. 兑现昨日入队的奇遇（encounterQueued，无则跳过）——奇遇独立于日常事件，可同日并存
  2~5.（现状不动）
  6.  明日预告：先掷「明日奇遇」入队（encounterQueued），再出预告——
      特殊/传说 → 出该 id 固定伏笔文案；普通/无 → 现 TOMORROW_HINTS 氛围池
```

要点：

- **预掷入队是「预告必兑现」的唯一自然解**：事件发生在预告之后，唯有前一天先定结果、存档留痕，预告才能是真话
- 普通奇遇同样走队列（统一一个兑现点），只是预告位不出伏笔、玩家无感知
- 月末（第 30 日日终）在第 4 步提前 return：不掷新队列也不出预告，沿 T49「定额结算接管过渡」口径，已入队奇遇留待下次日结算兑现
- `runMeditationBatch` 逐日复用 `endDay`，奇遇自动进 `MeditateDayTrace.events`、伏笔进 `trace.hint`——出关摘要里「昨夜伏笔 → 今日兑现」逐日连贯，零额外改动

### 3.2 抽取算法（确定性，rngState 驱动）

```text
掷明日奇遇（endDay 第 6 步）:
  roll = rng.next()
  roll < 0.10 → 普通档；< 0.14 → 特殊档；< 0.15 → 传说档；否则无
  档内池 = ENCOUNTERS[tier] 排除（冷却中：s.encounter.cooldowns[id] > s.day）与（传说已用：seenOnce 含 id）
  池空 → 本次无事（不降级、不顺延）
  命中 id → s.encounter.queued = id；特殊/传说按 tier 记录冷却起点（兑现时置 cooldowns[id] = s.day + 7）
```

- 奇遇**不受月度灵潮 weightMult 调制**：灵潮管日常物候，机缘超脱其外（也避免与 EVENTS 权重体系耦合）
- 同存档同操作序列结果一致（沿 architecture 随机数口径）

### 3.3 奇遇表（ENCOUNTERS，新常量表）

结构与 `EventDef` 对齐（id/name/weight→tier/desc/effect），新增 `tier: 'common' | 'special' | 'legendary'`、`hint?: string`（伏笔文案，仅特殊/传说）。

| id | 名称 | 档位 | 效果 | 伏笔文案（特殊/传说） |
|---|---|---|---|---|
| sparrowGuide | 灵雀引路 | 普通 | inventory +2（境界内随机灵草） | — |
| stoneVein | 灵石矿脉 | 普通 | stones +15 | — |
| wandererTrade | 散修易货 | 普通 | bundle [inventory −1, inventory +1]（仓库空无事） | — |
| hermitSeeds | 神秘修士赠种 | 特殊 | seed（境界内最高档）×2 | 山道尽头似有人影伫立，袖间隐有种子清香 |
| fieldMutation | 灵田异变 | 特殊 | mutationGuaranteed（随机生长中田下茬保底变异，无则无事；联动 herb-codex §3.2，待拍板） | 夜里田垄灵光隐隐，似有异变将生 |
| youngBeast | 救助幼兽 | 特殊 | bundle [cultivation +5, insight +5] | 后山传来微弱哀鸣，似有生灵受伤 |
| buriedCache | 掘得遗藏 | 特殊 | stones +30 | 整理田埯时挖到一角残破图卷 |
| masterCave | 祖师遗府 | 传说 | bundle [cultivation +25, insight +15] | 梦中似有钟声自云雾深处传来 |
| ancientSpring | 上古灵泉 | 传说 | growth +3（全田） | 井底灵光大涨，泉眼隐隐轰鸣 |

数值均为初版建议值（对照锚：日常正向事件修为 +3 / 灵石 +8 / 心得 +5），sim 500 局验证后定稿。

### 3.4 效果类型（EventEffect 新增 2 个 kind）

| kind | 结构 | 说明 |
|---|---|---|
| `seed` | `{ herb, amount }` | 种子入账 `s.seeds[herb] += amount`（commissions 奖励同款语义） |
| `bundle` | `{ effects: EventEffect[] }` | 顺序循环结算既有 `applyEvent` 分支，组合效果不再新增定制 kind |

（原为 3 个 kind，含 `yieldMult`；灵田异变改为保底变异联动 herb-codex 后移除，产量翻倍语义由变异结算承接。）
其余效果全复用现有 7 种。`hermitSeeds` 的 herb 在结算时按当前境界可种最高档解析（不存死值，跨境界存档迁移安全）。

### 3.5 存档 v6→v7（save.md migrations 链追加）

```text
s.encounter = {
  queued: EncounterId | null      // 明日待兑现（含普通档）
  cooldowns: Partial<Record<EncounterId, number>>  // 可复用日（s.day 比较）
  seenOnce: EncounterId[]         // 传说已用
}
```

- v6 → v7 迁移补默认空状态；导入校验白名单加奇遇字段；旧档无奇遇历史，从零开始掷
- 队列跨现实日持久：存档点在预告后、兑现前也一致（状态在档，不靠会话内存）

### 3.6 UI 表现（v1 零新组件）

- 日志条目：沿现有事件日志（`addLog` kind 'event'），icon 按档位 ✨ / 🌟 / ☄️ + `evSheet: 'event-icons-sheet-extra.webp'` 图集位预留（素材后补，emoji 兜底——T42 新事件同款先例）；标题前缀「奇遇·」
- 预告行：伏笔文案替换当日 hint 文本，格式不变，无新组件
- 入定出关摘要：奇遇已在 `perDay.events` 结构内自然渲染

## 4. 界面原型

无新页面。两处既有位置形态：

```text
┌ 逐日事件日志（侧边栏，新在前） ──────────────┐
│ ☄️ 奇遇·祖师遗府                              │
│    梦中钟声引你入云雾洞府，参悟遗刻            │
│    修为 +25、心得 +15                          │
│ 🌟 奇遇·神秘修士赠种                           │
│    …（伏笔在前一日预告行已出现）               │
│ 🔮 明日预告                                    │
│    井底灵光大涨，泉眼隐隐轰鸣                   │
└──────────────────────────────────────────────┘
```

loading / empty / error / no-permission 状态不适用：无新界面与请求，日志为纯本地状态渲染（空态沿用现有「平顺无事」占位口径）。

## 5. 交互与异常

| 场景 | 行为 |
|---|---|
| 仓库空 + 散修易货 | bundle 第一段无目标 → 整体无事，日志记「仓库空空，散修摇头而去」附言（沿 T53 空仓附注口径） |
| 无生长中田 + 灵田异变 | 无事；冷却照记（防SL式重掷刷概率——rngState 决定性本身已杜绝） |
| 特殊档全冷却 / 传说用尽 | 档内池空无事，不降级 |
| 月末日终 | 不掷新队列不出预告；已入队者下次日结算兑现 |
| 入定跨月出关 | 出关日无伏笔；定额结算后首个日终恢复掷点 |
| v6 旧档导入 | 迁移补空奇遇状态，校验通过 |

## 6. 验证方式

1. vitest：抽取档位边界（0.10/0.14/0.15）、队列兑现唯一性、冷却与限次、池空无事、无目标无事、月末不掷、入定 trace 含奇遇与伏笔、v6→v7 迁移 + 导入校验
2. sim 500 局（奇遇开/关对照）：定额达成率、筑基月数不劣化；频次分布 ≈ 10/4/1
3. e2e/smoke：日志档位 icon 与伏笔文案展示、旧档导入回归

## 7. 实施时同步项（阶段 1 清单）

- `core-loop.md` §3.3 管线图补 1b 步与第 6 步奇遇掷点（approved 文档变更，随实现同批转 in-review）
- `save.md` 迁移链补 v7；`doc/design/index.md`、`doc/index.md` 状态随批准流转
- 素材位登记 `roadmap-assets.md`（奇遇 icon 3 档，extra 图集）
