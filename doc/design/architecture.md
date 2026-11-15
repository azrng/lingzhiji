---
doc_id: DES-LINGZHIJI-ARCH
doc_type: design
module: lingzhiji
status: approved
last_updated: 2026-11-15
relations:
  - doc/requirements/lingzhiji/v0.1-prd.md
  - doc/design/lingzhiji/core-loop.md
  - doc/design/lingzhiji/farming.md
  - doc/design/lingzhiji/quiz.md
  - doc/design/lingzhiji/economy.md
  - doc/design/lingzhiji/progression.md
  - doc/design/lingzhiji/save.md
  - doc/design/lingzhiji/ui.md
---

# 《灵植记》总体技术设计

## 1. 需求追溯

- 关联需求：REQ-LINGZHIJI-001（§2 核心循环、§14 技术方案、§16 验收标准）
- 本文档覆盖：MVP 整体分层架构、技术栈、数据流、随机数、样式管线、测试与模拟器策略
- 未覆盖：各系统内部规则（见 `lingzhiji/` 下各功能设计文档）；界面布局与线框（见 `lingzhiji/ui.md`）；存档字段结构（见契约草案）

## 2. 契约引用

| 契约 | 性质 | 说明 |
|---|---|---|
| CON-LINGZHIJI-SAVE-001 | 待落地草案 | 存档数据结构，草案见 `doc/contracts/lingzhiji/save-data.md`；阶段 1 落地为 `src/game/types.ts` + `src/game/save.ts` 后草案标 `superseded` |
| CON-LINGZHIJI-WLIB-001 | 已有事实来源 | 词库 JSON（`src/data/words/cet4.json` / `cet6.json`），索引见 `doc/contracts/lingzhiji.md` |

本项目为纯前端单机游戏，无对外接口与事件契约。

## 3. 技术栈（已裁决）

技术栈冲突已由 frontend-AGENTS.md v3.0.9 与 PRD §14/§17.8 定稿，本设计直接采用：

| 项 | 选型 |
|---|---|
| 构建 | Vite 7 + TypeScript strict |
| UI | React 19 + Tailwind CSS 4；复杂画面允许引用同一 token 的局部 CSS |
| 图标 | 功能图标 @ant-design/icons；灵植、资源、事件使用项目美术素材（`design/concept-art/`） |
| 状态 | Zustand 5（单一 `useGameStore`，目录 `src/stores/`） |
| 存档 | localStorage，经 `src/game/save.ts` 封装（见 `lingzhiji/save.md`） |
| 测试 | vitest（逻辑层单测）+ 手动 smoke test（界面） |
| 模拟器 | `scripts/balance-sim.ts` 无头复用逻辑层 |

- 明确不引入：antd 组件库、React Router（单屏 + 弹层，无路由）、Axios（无 HTTP）、图表库
- 依赖版本在阶段 1 脚手架时联网检索最新正式版并锁定；锁定后不主动升级
- UI 组件（Modal / Toast / 进度环等）按 `lingzhiji/ui.md` 组件清单自研轻量实现，视觉取值全部来自 token 管线

## 4. 分层架构

```text
src/
├─ game/                 # 纯逻辑层：禁止 import React / DOM / localStorage 直用
│  ├─ types.ts           # GameState / Action / Result 等类型（CON-LINGZHIJI-SAVE-001 落地点）
│  ├─ constants.ts       # 全部数值表：灵草 / 境界 / 事件 / 奖励 / 功法（对应 PRD §12）
│  ├─ engine.ts          # 动作分发与日结算管线（core-loop.md）
│  ├─ clock.ts           # 现实时钟：日切 4 点、realDayIndex、syncRealDay 跨日同步（real-day.md）；
│  │                     #   现实时间只允许出现在本模块（注入参数）与应用层，引擎其余部分零时间依赖
│  ├─ farming.ts         # 种植规则（farming.md）
│  ├─ quiz.ts            # 抽题 / 判分 / 错词池（quiz.md）
│  ├─ economy.ts         # 坊市 / 定额 / 资源钳制（economy.md）
│  ├─ progression.ts     # 修为 / 突破 / 解锁（progression.md）
│  ├─ rng.ts             # 可播种随机数（§6）
│  └─ save.ts            # localStorage 唯一读写点 + 导入导出（save.md）
├─ data/words/           # 四级、六级词库 JSON（已备置）
├─ stores/               # useGameStore（Zustand）
├─ components/           # TopBar / FieldGrid / ActionPanel / DayLog / QuizModal / MarketPanel / QuotaModal / EventToast / MilestoneScreen
├─ screens/              # StartScreen / GameScreen
└─ styles/theme.css      # 由 design-system.yaml 同步的 Tailwind @theme 变量（§7）
```

职责边界：

- **game 层**：只依赖入参状态与 constants，产出新状态与日志；可被单测、模拟器、UI 三方复用
- **store 层**：持有 GameState，暴露 `dispatch(action)`；调用 game 层纯函数，成功后落状态并持久化
- **UI 层**：只读渲染 + dispatch；不计算业务规则，不直接读写 localStorage

## 5. 数据流与调用约定

单向数据流：

```text
UI dispatch(action) → store 调 engine 纯函数 → { ok, state?, logs?, reason? }
                                          ├─ ok：store 更新状态 + save.persist + toast 日志
                                          └─ fail：状态不变，UI 按 reason 展示提示
```

- 动作统一为可辨识联合类型 `GameAction`（PLANT / WATER / HARVEST / IRRIGATE / RECLAIM / TUNA / BUY / SELL / EMERGENCY_SEED / QUIZ_* / GONGFA_UP / QUOTA_* / END_DAY / …），具体清单在各功能文档
- **失败不抛异常**：所有前置校验不通过返回 `{ ok: false, reason }`，reason 为枚举（如 `REALM_LOCKED` / `NO_QI` / `NO_AP`）；UI 层将 reason 映射为条件不足文案（见 `lingzhiji/ui.md` 状态映射）
- 资源钳制（PRD §5.4）集中在 game 层出口统一执行 `clampResources`；UI 只展示
- 修为变化统一走 `progression.gainCultivation()` 入口，触发自动突破与解锁重算（progression.md）

## 6. 随机数与可复现

- game 层内置可播种 PRNG（mulberry32），随机数状态存于 GameState 并随档保存
- 全部随机入口统一走该 PRNG：随机事件判定与目标田/目标灵草选取、新词抽取、干扰项抽取；**禁止在 game 层散落 `Math.random()`**
- 单测与模拟器注入固定种子获得可复现序列；模拟器记录每局种子与截止日（PRD §14）

## 7. 样式管线

- `design-system.yaml` 是视觉规范唯一事实来源（当前为候选值，原型确认后回填锁定），token 派生 Tailwind `@theme` 与 CSS 变量到 `src/styles/theme.css`
- 界面只用工具类与主题变量；禁止 inline style、硬编码色值 / 间距 / 圆角（frontend-AGENTS.md v3.0.9）
- 调整顺序固定：先改 `design-system.yaml` → 同步 `theme.css` → 再改界面

## 8. 测试与验证策略

| 层 | 手段 | 覆盖点 |
|---|---|---|
| game 层 | vitest 单测 | 日结算五步顺序、定额结算、境界突破与解锁、判分与抽题（补题 / 跨库 / 耗尽）、事件权重与钳制（含月度灵潮调制）、存档往返与导入校验（对齐 PRD §14 测试行、§16 验收） |
| 平衡 | `scripts/balance-sim.ts` | 500 局 × 3 策略（策略定义 PRD §14）：筑基天数分布、未达成比例、逐月欠缴率、资源曲线、功法达成率、错词池变化 |
| 数据维护 | `scripts/word-groups.ts`（npm run words:groups） | 词库近义组 `group` 生成：释义片段包含关系直接配对，幂等全量写回（口径见契约 CON-LINGZHIJI-WLIB-001） |
| UI 层 | 手动 smoke test | 浏览器完整路径清单见 `lingzhiji/ui.md` 验证小节 |

- 模拟器与单测直接驱动 game 层，不启动 React；具体用例清单归各功能文档「验证方式」小节
- 平衡报告仅统计筑基前实际完成的月结与采样日，并给出样本量；资源耗尽指没有可种种子和在田作物，且灵石不足以买可种种子，恢复指当日通过出售或应急领种获得可种种子。

## 9. 全局异常处理

- game 层永不抛异常（§5）；UI 层 React ErrorBoundary 兜底渲染错误，提供「重载存档」入口
- 存档损坏 / 版本不识别：按 `lingzhiji/save.md` 恢复策略处理，不覆盖原档
- 保存失败（隐私模式 / 容量满）：toast 明确提示，游戏状态保留在内存中继续游玩

## 10. 验证方式

本文档自身以评审通过为验证；各决策的落地正确性由阶段 1 的单测、模拟器与 smoke test 承担（§8）。
