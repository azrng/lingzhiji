---
doc_id: DES-LINGZHIJI-ECHOICE-001
doc_type: design
module: lingzhiji
feature: encounter-choices
status: in-review
last_updated: 2026-11-21
relations:
  - doc/requirements/lingzhiji/encounter-choices.md
  - doc/design/lingzhiji/encounters.md
  - doc/design/lingzhiji/save.md
---

# 入定挂起抉择设计（T64）

> 状态：in-review（2026-11-21 初稿，随 T63 提案获批展开）。存档 v10 与炼丹坊共享窗口，先落地者定号。

## 1. 需求追溯

- 关联需求：REQ-LINGZHIJI-ECHOICE-001（全节）
- 覆盖：挂起管线、抉择卡 UI、选项表、存档 v10、验证方案
- 未覆盖：普通档挂起、多挂起、选项失败态（需求 §2 不包含）

## 2. 契约引用

无新对外契约。`EncounterState` 扩展 `pendingChoice` 字段随存档 v10 走 save.md migrations 链。

## 3. 技术设计

### 3.1 数据结构

```ts
// types.ts
interface EncounterChoiceOption { label: string; text: string; effect: EventEffect }
interface PendingChoice { id: EncounterId; options: [EncounterChoiceOption, EncounterChoiceOption] }
// EncounterState 扩展
pendingChoice: PendingChoice | null
```

选项表放 `constants.ts`（`ENCOUNTER_CHOICES: Record<EncounterId, [EncounterChoiceOption, EncounterChoiceOption]>`）——effect 复用 EventEffect 联合，解释器零改动。

### 3.2 管线改动（engine.ts）

```text
endDay 1b 步（现 applyEncounter 直结算）：
  if (s.encounter.pendingChoice) 照常自动结算（挂起上限 1：已占位时不挂）
  else if (入定管线 && def.tier !== 'common'):
    s.encounter.pendingChoice = { id, options: ENCOUNTER_CHOICES[def.id] }
    日志「机缘待决 · <名>」（入定折叠保留清单加此前缀）
  else 照常 applyEncounter
runMeditationBatch：挂起时 trace.encounter 记录但标记 pending（出关摘要显示「机缘待决」行）
```

- 手动 END_DAY 路径不挂（endDay 不知道调用方——加参数 `fromMeditation`，入定管线传 true）
- 冷却/限次：选择结算时置位（复用 applyEncounter 的置位逻辑，抽出 `settleEncounterChoice(s, def, effect, rng)`）

### 3.3 选项表（初版文案，12 条）

| id | 选项 A | 选项 B |
|---|---|---|
| hermitSeeds | 收下赠种（seed topRealm×2） | 改要盘缠（stones +25） |
| fieldMutation | 引异变入田（mutation 保底） | 稳住灵田（随机田 curYield +2） |
| youngBeast | 救治幼兽（cultivation +5、insight +5） | 索取谢礼（stones +18） |
| buriedCache | 独占遗藏（stones +30） | 上缴宗门（contribution +12） |
| masterCave | 参悟遗刻（cultivation +25） | 搬空宝藏（insight +22、stones +15） |
| ancientSpring | 引泉入田（growth 全田 +3） | 汲泉修炼（cultivation +18） |

### 3.4 UI（EncounterChoiceModal，唯一新 UI）

- 触发：App 层 `phase === 'day' && g.encounter.pendingChoice` 自动弹（modal 一层）；quota 相不弹（定额优先，结算后自然满足）
- 内容：奇遇名（档位 emoji）+ 伏笔文案（ENCOUNTER_BY_ID[id].hint）+ 两个选项块（label 标题 + text 收益）+「暂且搁下」关闭（pendingChoice 保留）
- 选择：dispatch `ENCOUNTER_CHOOSE { option: 0 | 1 }` → 结算入账 + 日志「机缘了结 · <选项 label>」→ pendingChoice 清空 → 卡关

### 3.5 存档 v10

- v9 → v10：`pendingChoice: null` 补空；导入校验：pendingChoice 为 null 或 { id 白名单, options 长度 2 且每项 label/text 非空串 }（options 是客户端生成固定表，不入档也可——**简化拍板：入档只存 id，options 运行时查表**。校验最薄）

## 4. 界面原型

```text
┌ 机缘待决（z-60 模态）──────────────┐
│ 🌟 神秘修士赠种                      │
│ 「山道尽头似有人影伫立……」           │
│ ┌ A · 收下赠种 ─────────────────┐  │
│ │ 当前境界可种最高档种子 ×2        │  │
│ └───────────────────────────────┘  │
│ ┌ B · 改要盘缠 ─────────────────┐  │
│ │ 灵石 +25                        │  │
│ └───────────────────────────────┘  │
│ [暂且搁下]                          │
└─────────────────────────────────────┘
```

加载/错误/权限不适用（纯本地）。空态不适用（有 pendingChoice 才渲染）。

## 5. 交互与异常

| 场景 | 行为 |
|---|---|
| 出关落 quota | 卡延到定额结算后首个 day 相（App 渲染条件天然保证） |
| 挂起后又遇特殊档 | 第二个照常自动结算（上限 1 口径） |
| 选择时目标缺失 | 效果走「无事发生」附注，日志如实记录 |
| 搁下后多日不选 | 每次进游戏 day 相首弹（不腐烂） |

## 6. 验证方式

1. vitest：入定挂起（特殊/传说挂、普通与手动不挂）、上限 1、出关弹卡前置（day 相）、ENCOUNTER_CHOOSE 两选项结算与冷却限次、搁下持久、v10 迁移与校验
2. e2e/smoke：抉择卡展示/选择/搁下流转
3. sim：不跑（挂起只改变结算时点不改变收益期望的上界）

## 7. 实施同步项

- encounters.md 标注「选择式二期已随 encounter-choices 落地」；save.md v10；三索引
