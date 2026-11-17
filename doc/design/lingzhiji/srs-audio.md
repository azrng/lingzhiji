---
doc_id: DES-LINGZHIJI-SRS-AUDIO
doc_type: design
module: lingzhiji
feature: learning-enhance
status: approved
last_updated: 2026-11-17
relations:
  - doc/requirements/lingzhiji/v0.1-prd.md
  - doc/design/lingzhiji/quiz.md
  - doc/design/lingzhiji/audio-impl.md
  - doc/design/lingzhiji/save.md
  - doc/design/lingzhiji/roadmap-assets.md
---

# M2 学习强化设计（SRS 调度 / 发音 / 音标 / 题型注册表）

> 拍板记录（2026-11-17，用户授权 AI 拍板后即开工，等价 T27「开始实现」先例）：
> **A 保留有道兜底**（Web Speech 无 en voice 场景多，失败即静默无风险）；
> **B 新题型解锁锚=学习场次**（第 2/5/10 场解锁释义反选/听音辨词/灵种拼写）；
> **C 到期可视化=词卡「N 天后复习」小字 + 任务堂入口「今日到期 N 词」徽标**（SRS 反馈闭环）；
> **D 音标源=官方精简版 ecdict.mini.csv**（四六级高频词命中率足够）；
> **E PRD 拆分另立后续任务**，不阻塞 M2。

> 定位口径提醒（PRD §1）：种田为主体、背单词为一条线路——本设计升级的是「线路」的学习体验，
> 不改变「做任务得灵气、灵气养灵田」的核心循环与奖励数值。

## 1. 需求追溯

- 关联需求：REQ-LINGZHIJI-001 §8（任务堂全节，本次修订：§8.1 抽题与复习调度、新增 §8.5 发音与音标、§8.6 题型）
- 覆盖：FSRS 复习调度替换错词池队列、发音（Web Speech 主 + 有道兜底）、ECDICT 构建期补音标、题型注册表与三种新题型、存档 v4 迁移
- 未覆盖：词义清洗管线（T32 已交付）、题卡视觉融入（依赖素材 #10，随素材到位另做）、功法与奖励数值（不变）

## 2. 契约引用

| 契约 | 说明 |
|---|---|
| CON-LINGZHIJI-WLIB-001 | 词库 JSON：`phonetic` 字段本次由构建期脚本填充（KK 音标格式），word/meaning/group 口径不变 |
| CON-LINGZHIJI-SAVE-001 | 已 superseded，代码为事实来源；本次存档 v3→v4（learning 结构扩展），迁移链走 save.ts migrations |

## 3. 技术设计

### 3.1 SRS 复习调度（ts-fsrs@5.4.2，MIT / 7KB gzip / 0 依赖 / 纯函数）

**为什么换**：现有错词池是「答错排队、答对出池」的无限循环——错词重现频率与遗忘曲线无关，
简单的词被反复打扰、难的词间隔不够；无「已掌握」状态，错词池只增不减（出池后还会因超时遗忘回来，但系统不知道）。
FSRS 用稳定性（stability）+ 难度（difficulty）为每个词计算到期时间，恰好是「背单词线路」该有的骨架。

**数据模型**（`learning.cards: Record<normalizedWord, FsrsCardLite>`，全库共享）：

```ts
// FsrsCardLite：ts-fsrs Card 的序列化投影（只存档需要的三态，其余由 fsrs() 重建）
interface FsrsCardLite {
  due: number      // 到期游戏日（realDay 口径，见下）
  stability: number
  difficulty: number
  state: 'new' | 'learning' | 'review'   // new 未见过 / learning 短间隔 / review 长间隔
  lapses: number  // 遗忘次数（答错 Again 次数），用于统计展示
}
```

**时间口径（关键决策）**：FSRS 的间隔是天数，游戏日一天可以推多个（地力透支）——用游戏日会与遗忘直觉错位。
**调度锚定现实日 `realDay.today`**（学习记忆属于现实世界的玩家），抽题时 `due <= today` 的词进入复习候选；
新词配额照旧按境界（练气 1-3 层 3 复习 7 新词 → 改为「到期词优先，上限仍按境界配额」）。

**作答评级**（4 选 1 无法区分 Hard/Good）：答对 = Good，答错 = Again；先学阶段展示过的词首见记 Good（学过即记忆起点）。
ts-fsrs `next(card, now, rating)` 纯函数计算下一状态，引擎层零时间依赖（now 注入，与 clock.ts 同模式）。

**迁移（v3→v4，一次性）**：
- 错词池词 → `next(createEmptyCard(t), t, Again)`（短间隔，尽快重现）
- 已见非错词 → `next(createEmptyCard(t), t, Good)`（长间隔起步）
- 两库 wrongQueue 清空，统计字段（attempts/distinctWords/firstCorrect 等）原样保留
- 脏档容错：cards 缺字段时视为 new 重算，不抛异常（沿 v3 迁移模式）

**范围裁剪**：只替换「复习调度」；境界新词配额、补题链、每场 10 题、先学后测、奖励三档全部不变。

### 3.2 发音（`src/audio.ts` 扩展，与 Howler 同级同构）

```ts
// speak(word: string)：主 Web Speech API，兜底有道 dictvoice
// 1) speechSynthesis 挑 en-US voice；rate 0.9（学习场景稍慢）
// 2) 不可用/无 en voice → Audio 兜底 https://dict.youdao.com/dictvoice?audio=<word>&type=1
// 3) 都失败 → 静默（发音是增强项，不阻塞答题）
```

- **解锁**：复用 pointerdown 解锁模式（audio.ts 已有）；页面无手势前点发音按钮只亮图标不出声
- **开关**：设置弹层新增「🔔 发音」开关（独立于音效开关——有人要音效不要读音）；偏好键并入 `lingzhiji.audio`
- **触发点**：① 学习相位词卡 🔊 按钮（点词发音）② 测验答题后自动读当前词（可关）③ 听音辨词题型强制读
- **待确认 A**：有道 dictvoice 是灰色接口（qwerty-learner 23.8k stars 生产先例）——要不要兜底，还是 Web Speech 不可用就静默？

### 3.3 音标（ECDICT 构建期补数据，非运行时）

- `scripts/phonetic-fill.ts`（node 一次性脚本，入库 npm run words:phonetic）：读 ECDICT csv（用户下载放 `D:\temp\ecdict\`，仓库外），
  按 word 匹配填 `phonetic`（KK 音标）；命中率预计 >95%，未命中的词留空
- 词库 JSON 更新后走既有 `npm run words:groups` 流程重新校验；`WordEntry.phonetic` 从「暂空」变「可能有值」
- 展示：学习相位词卡 `word [音标] 🔊`；测验大题面同式
- ECDICT（MIT，76 万词条）不进仓库、不进构建依赖，只是数据源

### 3.4 题型注册表（数据驱动，`src/game/question-types.ts` 新模块）

```ts
// 题型注册表：buildQuestion 的输入输出与现有 QuizQuestion 兼容，新增 kind 字段
interface QuestionType {
  id: 'w2c' | 'c2w' | 'listen' | 'spell'
  name: string           // 认词 / 释义反选 / 听音辨词 / 灵种拼写
  sessionsMin: number    // 解锁学习场次（该库累计完成任务次数，含旧档统计）
  build(rng, entry, lib): { word, meaning, opts?, kind, prompt } | null  // null=该词不可出此题型
}
// QuizQuestion 扩展：kind 必填；spell 题无 opts（输入框作答），quiz.ts answer() 按 kind 分支校验
// 存档校验同步扩展 kind 枚举；spell 题的 answer 记录玩家输入原文
```

| 题型 | 玩法 | 解锁（场次锚，2026-11-17 拍板） |
|---|---|---|
| 认词 w2c（现状） | 词→4 选 1 释义 | 默认 |
| 释义反选 c2w | 中文释义→4 选 1 单词 | 第 2 场起 |
| 听音辨词 listen | 播发音→4 选 1 单词（不显示拼写） | 第 5 场起 |
| 灵种拼写 spell | 显示中文释义+发音→键盘拼整词，整词一次提交；答错显示正确拼写（2026-11-17 简化拍板） | 第 10 场起 |

- 分配策略：解锁池内按场次加权随机（前 20 场 80% w2c / 20% 其他；之后四题型均衡）；
  先学阶段的新词下一场固定出 w2c（刚学的词先认读再拼写）
- **spell 与 SRS 评级**：拼写对 = Good；答错 = Again（第一反应才算记忆，次日重现）
- 场次统计沿用既有 `libs[lib].sessions`（旧档已完成场次直接生效，无需迁移）

### 3.5 存档 v4 与校验

- `learning.cards` 新增；`libs[lib].wrongQueue` 保留字段但恒空（旧版本兼容），v4 写入时不再生成
- `quizDaily.session.questions[].kind` 必填；answers 校验：spell 题允许任意非空字符串，其余必须是 opts 成员
- SAVE_VERSION 3→4，migrations[1]；版本不超前校验照旧

## 4. 界面原型

```text
┌─ 学习相位词卡（M2 后）────────────────┐   ┌─ 听音辨词（listen）───────────────┐
│ colony  [ˈkɑːləni]  🔊               │   │ 第 6/10 题 · 听音辨词            │
│ n. 殖民地；侨居地，聚居地；群体，集群 │   │ ┌──────────────────────────────┐ │
│        （卡面右下小字：下次复习 3 天后）│   │ │        🔊 再听一次            │ │
└──────────────────────────────────────┘   │ └──────────────────────────────┘ │
                                           │  A. colony   B. colony 的混淆词  │
┌─ 灵种拼写（spell）─────────────────────┐  │  C. …       D. …                │
│ 释义：n. 殖民地；侨居地                │  └──────────────────────────────────┘
│ 🔊                [输入框: ______]     │
│ 答错显示正确拼写（灵种散了重播一次）    │
│ [确认播种]                             │  │ 🔔 发音  开/关（独立于音效）   │
└────────────────────────────────────────┘  │ 🔊 答题后自动读音  开/关        │
                                            │ （发音不可用时两项自动置灰）    │
                                            └────────────────────────────────┘
```

- 状态覆盖：发音不可用（无 en voice 且有道开关关）→ 🔊 按钮置灰 title 提示；ECDICT 未命中音标 → 词卡不显示音标槽（empty 态即现状）
- 学习相位词卡新增「下次复习 N 天后」小字（SRS 可视化，玩家能感知「这个词我快忘了」）
- 任务堂主界面按钮徽标：今日有到期复习词时显示「今日到期 N 词」（C 拍板，SRS 反馈闭环）

```text
┌─ 今日修行 ────────────────────────────┐
│ [任务堂 · 今日未完成 📖 今日到期 4 词] │
│  （无到期时不显示徽标，纯新词场）      │
└───────────────────────────────────────┘
```

## 5. 交互与异常

| 场景 | 行为 |
|---|---|
| 到期复习词为 0 | 新词补足 10 题（现有补题链不变）；学习相位显示「今日无到期复习」 |
| 全库学完且无到期 | 取 stability 最小（最不稳）的词复习——永远出得了题 |
| 发音按钮无手势解锁 | 首次点击触发解锁并播放（pointerdown 模式），不报错 |
| speechSynthesis 无 en voice 且有道被关 | 🔊 置灰；听音辨词题型自动跳过换题（buildQuestion 返回 null） |
| spell 题输入含空格 | trim 后比对；大小写不敏感（与 normalize 同口径） |
| 中断恢复跨题型 | session 已含 kind，恢复后按 kind 渲染对应题面，作答记录不变 |
| v3 存档导入 v4 环境 | 迁移链自动升格；cards 全部按 new 重算（保守，不丢数据） |
| 迁移中 wrongQueue 与 cards 并存（v4 写入时） | wrongQueue 恒空不再消费；旧客户端读 v4 档丢弃 cards 只看 wrongQueue（不产生错误复习） |

## 6. 验证方式

- vitest：FSRS 调度（到期排序/配额截断/全库学完兜底）；评级映射（对/错/学过）；v3→v4 迁移（错词短间隔、已见长间隔、脏档容错）；
  题型注册表（四题型生成与校验、realmMin 过滤、spell 空格大小写、quiz.answer 按 kind 分支）；存档校验 kind 枚举
- e2e：学习相位音标与 🔊 按钮渲染、答题全流程（w2c 主路径回归）、spell 题输入路径（解锁境界用 ?debug=1 拉境界）
- smoke（实机）：发音真实出声（Windows/iOS Safari 各一次）、听音题型自动播放、发音开关独立生效
- sim：复习调度换 FSRS 后跑 daily1 策略——验证筑基天数仍在 60-90 带（学习节奏变优不应影响经营主线）

## 7. 分批交付

| 批 | 内容 | 依赖 |
|---|---|---|
| M2a | SRS 调度 + 存档 v4 + 音标构建脚本 + 发音（含开关） | 无（ts-fsrs/ECDICT 就绪） |
| M2b | 题型注册表 + 释义反选 + 听音辨词 + 灵种拼写 | M2a（listen 依赖发音） |
| M2c | 题卡视觉融入（拓片纸纹 + 答对金光点飞灵气槽） | 素材 #10（用户交绘图 AI） |

## 8. 待确认项（2026-11-17 已全部拍板，见文档头部拍板记录）

- ~~A. 有道 dictvoice 兜底~~ → 保留（qwerty-learner 生产先例，失败静默）
- ~~B. 新题型解锁锚~~ → 学习场次（第 2/5/10 场解锁 c2w/listen/spell）
- ~~C. SRS 复习可视化~~ → 词卡小字 + 任务堂入口「今日到期 N 词」徽标
- ~~D. ECDICT 数据~~ → 官方精简版 ecdict.mini.csv（仓库直取）
- ~~E. PRD 拆分~~ → 另立后续任务，不阻塞 M2
