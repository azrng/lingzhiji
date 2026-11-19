// 引擎（core-loop.md）：初始状态、动作分发与日结算五步管线。
// dispatch 克隆状态后交各模块就地修改，永不抛异常，失败返回 reason（architecture.md §5）。
import { EVENTS, EVENT_CHANCE, DAILY_AP, GONGFA_COST, HERB_BY_ID, INITIAL, MARKET_UP, MARKET_DOWN, MEDITATE_QI_EVERY, MONTH_DAYS, TOMORROW_HINTS, seasonDefOf, tideOf, type EventDef } from './constants'
import { realDayIndex } from './clock'
import * as commissions from './commissions'
import { convertRate, dayInMonth, monthOf } from './economy'
import * as economy from './economy'
import * as farming from './farming'
import { addLog } from './log'
import { clampResources, gainCultivation } from './progression'
import * as quiz from './quiz'
import { createRng, pick, type Rng } from './rng'
import type { GameAction, GameState, LogEntry, ReasonCode } from './types'

// 两库学习统计的零值起点（仅引擎内 createInitialState / QUIZ 相关动作使用）
function quizStartStat() {
  return {
    attempts: 0,
    distinctWords: [] as string[],
    firstCorrect: { hit: 0, total: 0 },
    reviewCorrect: { hit: 0, total: 0 },
    sessions: 0,
    wrongQueue: [] as string[],
  }
}

// nowMs 默认 Date.now()：store 传当前时间，测试传固定值；不传的旧测试自动落到今天
export function createInitialState(seed: number, nowMs: number = Date.now()): GameState {
  const s: GameState = {
    day: 1,
    phase: 'day',
    ap: DAILY_AP,
    wateredToday: false,
    tunaUsedToday: false,
    pendingTomorrow: {},
    resources: { stones: INITIAL.stones, contribution: 0, qi: 0, insight: 0 },
    cultivation: 0,
    realm: 0,
    gongfa: 1,
    fields: Array.from({ length: INITIAL.fields }, (_, i) => ({ id: i + 1, status: 'empty' as const, fertility: 1 })),
    seeds: { ...INITIAL.seeds },
    inventory: { qingling: 0, ninglu: 0, ziyun: 0, chisui: 0, longxue: 0, jiuye: 0 },
    commissions: commissions.defaultCommissions(), // 灵植堂委托（v6）：首月不出，第 2 月初生成选项
    quizDaily: { done: false, session: null },
    learning: {
      currentLib: 'cet4',
      seenMap: {},
      libs: { cet4: quizStartStat(), cet6: quizStartStat() },
      cards: {}, // FSRS 复习卡（srs-audio.md §3.1，随存档 v4）：未学词不建卡
    },
    // 现实日锚（real-day.md §3.6）：开局 today = 创建当日，连胜全零值（lastCheckinDay -1 = 从未打卡）
    realDay: { today: realDayIndex(nowMs) },
    streak: { count: 0, best: 0, lastCheckinDay: -1, checkins: 0, freezes: 0, milestones: [], history: [] },
    month: { unpaidStreak: 0, ledger: [] },
    milestoneShown: false,
    tutorialDone: false,
    log: [],
    rngState: seed >>> 0,
  }
  // 开局提示本月灵潮（PRD §11.1），后续每月月初在 advanceDay 记录
  addTideLog(s)
  return s
}

// 随机事件结算（core-loop.md §3.4）：按 EventDef.effect 通用执行（数据驱动，新增事件只加表项）。
// 即时类立即生效，持续类写入 pendingTomorrow 次日生效；无有效目标时「无事发生」，不顺延不替换。
export function applyEvent(s: GameState, ev: EventDef, rng: Rng): void {
  const eff = ev.effect
  let note = '' // 结算附注（如驱虫护邻），拼进事件日志 text
  switch (eff.kind) {
    case 'yield': {
      // 目标选取走 PRNG；无生长中田则无事发生（日志附注说明，避免「产量 −1」与实际效果不符）
      const growing = s.fields.filter((f) => f.status === 'growing')
      const t = eff.randomField && growing.length ? pick(rng, growing) : null
      if (!t) note = '田里没有生长中的灵草'
      if (t) {
        // 驱虫护邻（farming-depth.md §3.3）：负向产量事件的目标田相邻有赤髓参 → 产量无损，日志附注
        if (eff.delta < 0 && farming.wardedByNeighbor(s.fields, t.id)) {
          note = '赤髓参灵气所护，产量无损'
        } else {
          t.curYield = Math.max(0, t.curYield! + eff.delta)
        }
      }
      break
    }
    case 'growth':
      // 全部生长中田进度增减（灵雨 +1 与日终管线 +1 合计 +2；阵法波动 −1）；
      // 生长中田 progress 恒小于生长期，成熟停驻检查只对 +delta 生效，对 −delta 是空操作；
      // 无生长中田时进度不变，日志附注说明（同 yield，避免「全田 +2」空转失真）
      if (!s.fields.some((f) => f.status === 'growing')) note = '田里没有生长中的灵草'
      for (const f of s.fields) {
        if (f.status !== 'growing') continue
        f.progress = Math.max(0, f.progress! + eff.delta)
        if (f.progress! >= farming.effDays(f.herb!, s.gongfa)) {
          f.progress = farming.effDays(f.herb!, s.gongfa)
          f.status = 'mature'
        }
      }
      break
    case 'resource':
      // 灵气走 gainQi 统一上限截断；其余资源受 applyAction 出口钳制（下限 0）
      if (eff.resource === 'qi') {
        farming.gainQi(s, eff.amount)
      } else {
        s.resources[eff.resource] += eff.amount
      }
      break
    case 'cultivation':
      gainCultivation(s, eff.amount)
      break
    case 'inventory': {
      // 仓库随机灵草增减：减只在有库存时选目标（无事发生）；增从全部灵草随机
      const owned = Object.entries(s.inventory).filter(([, n]) => n > 0)
      const pool: [string, number][] = eff.delta < 0 ? owned : Object.entries(s.inventory)
      const t = pool.length ? pick(rng, pool) : null
      if (!t) note = '仓库空空如也'
      if (t) s.inventory[t[0] as keyof typeof s.inventory] += eff.delta
      break
    }
    case 'infusionDouble':
      s.pendingTomorrow.infusionDouble = true
      break
    case 'marketMult':
      s.pendingTomorrow.marketMult = rng.next() < 0.5 ? MARKET_UP : MARKET_DOWN
      break
  }
  addLog(s, { kind: 'event', evPos: ev.pos, evSheet: ev.sheet, icon: ev.icon, title: `事件 · ${ev.name}`, text: note ? `${ev.desc}（${note}）` : ev.desc, neg: ev.negative })
}

// 月初灵潮日志（PRD §11.1）：第 1/31/61… 天开始时提示本月灵潮，附当季农谚（farming-depth.md §3.4）
function addTideLog(s: GameState): void {
  const tide = tideOf(monthOf(s.day))
  const season = seasonDefOf(monthOf(s.day))
  addLog(s, { kind: 'settle', evPos: [4, 0], evSheet: 'event-icons-sheet-extra.webp', icon: '🌗', title: `灵潮 · ${tide.name}`, text: `${tide.desc}。${season.name} · 农谚：${season.proverb}` })
}

// 按当月灵潮调制后的权重抽取事件（core-loop.md §3.4）：基础权重 × 灵潮系数后走轮盘
export function drawEvent(rng: Rng, month: number): EventDef {
  const tide = tideOf(month)
  const weighted = EVENTS.map((e) => ({ e, w: e.weight * (tide.weightMult[e.id] ?? 1) }))
  const total = weighted.reduce((a, x) => a + x.w, 0)
  let roll = rng.next() * total
  return (weighted.find((x) => (roll -= x.w) <= 0) ?? weighted[weighted.length - 1]).e
}

// 日结算（core-loop.md §3.3）：事件 → 生长 → 缺水 → 月末 → 推进，顺序固定。
// 不再要求当日任务堂完成（T49 时间解耦：经营节奏与背词解绑，测验奖励锚现实日）。
// trace 仅供入定批量结算收集逐日事件与预告；手动 END_DAY 不传，零开销。
// dryExempt：入定管线传 true——闭关灵泉阵护田，缺水步整体跳过（T54，见 farming.applyDrought）
function endDay(s: GameState, rng: Rng, trace?: { event?: EventDef; hint?: string }, dryExempt = false): ReasonCode | null {
  // 当日效果到此结束；本次事件产生的效果需要保留到下一日。
  s.pendingTomorrow = {}
  // 1. 随机事件：30% 触发 1 个，按当月灵潮调制后的权重抽取（core-loop.md §3.4）
  if (rng.next() < EVENT_CHANCE) {
    const ev = drawEvent(rng, monthOf(s.day))
    applyEvent(s, ev, rng)
    if (trace) trace.event = ev
  }
  // 2. 全田自然生长 +1（灵雨已在事件步 +1，合计 +2）
  farming.applyGrowth(s)
  // 3. 缺水结算（入定闭关豁免）
  farming.applyDrought(s, dryExempt)
  // 4. 月末判定：第 30 天进入定额结算交互，玩家完成缴纳/放弃后推进
  if (economy.dayInMonth(s.day) === 30) {
    s.phase = 'quota'
    addLog(s, { kind: 'settle', icon: '🧾', title: '月末已至', text: '执事前来核对定额' })
    return null
  }
  // 5. 推进到下一天（月初顺带刷新委托选项）
  advanceDay(s, rng)
  // 6. 明日预告（time-decouple.md §3.6）：日终一行氛围钩子，按 rngState 确定性抽取；
  //    kind 'action' 不弹 toast，只在日志流可见；月末过渡不出（定额结算接管）
  const hint = TOMORROW_HINTS[Math.floor(rng.next() * TOMORROW_HINTS.length)]
  addLog(s, { kind: 'action', icon: '🔮', title: '明日预告', text: hint })
  if (trace) trace.hint = hint
  return null
}

function advanceDay(s: GameState, rng: Rng): void {
  s.day += 1
  s.phase = 'day'
  farming.resetDaily(s)
  // quizDaily 不随游戏日重置：奖励锚现实日，跨日重置在 clock.syncRealDay（time-decouple.md §3.4）；
  // 进行中的测验会话保留，跨游戏日可续答
  if (dayInMonth(s.day) === 1) {
    // 跨入新月：提示本月灵潮（core-loop.md 步骤 6 / PRD §11.1）+ 刷新委托选项（第 2 月起，v6）
    addTideLog(s)
    commissions.refreshOnMonthStart(s, rng)
  }
}

// ---- 入定批量结算（time-decouple.md §3.1，T49 时间解耦）----

// 逐日轨迹：出关结果面板按天展示（meditate.ts 消费）；预演不走此路径（只给确定性汇总）
export interface MeditateDayTrace {
  day: number // 推进后落在的游戏日
  dayOffset: number // 入定第几天（1 起）
  events: { name: string; desc: string; neg?: boolean }[]
  matured: { field: number; herbName: string }[]
}

export interface MeditateRunInfo {
  advancedDays: number
  stoppedAtMonthEnd: boolean // 落在月末（含定额未结算的提前出关）
  newMonthDay: number // 出关后月内日
  perDay: MeditateDayTrace[]
  qiGain: number // 闭关纳灵实际入账灵气（每满 MEDITATE_QI_EVERY 天 +1，上限截断后）
  tomorrowHint: string // 末日预告；月末出关为空（定额结算接管过渡）
}

// 入定：逐日调用 endDay（五步管线原样复用，不建第二套结算逻辑），月末自动出关。
// 就地修改传入 state 并折叠批次日志（保留突破与月末条目）；rng 由调用方传入，
// UI 预演/结果面板用状态副本走同一路径保证与真实落盘确定性一致。
// days 非法（非正整数、或当日推进 days 天会越过月末）返回 null 不动状态。
export function runMeditationBatch(state: GameState, rng: Rng, days: number): MeditateRunInfo | null {
  if (!Number.isInteger(days) || days < 1) return null
  if (economy.dayInMonth(state.day) + days > MONTH_DAYS) return null
  // 折叠底稿：入定前日志字符串快照，收尾时从尾部找重叠区分新增（环形截断后也能正确对齐）
  const oldLog = state.log.map((e) => JSON.stringify(e))
  const perDay: MeditateDayTrace[] = []
  let lastHint = ''
  for (let i = 1; i <= days; i++) {
    // 当日田块快照：成熟按状态差分检测，不依赖日志文本
    const before = state.fields.map((f) => ({ id: f.id, status: f.status }))
    const trace: { event?: EventDef; hint?: string } = {}
    // dryExempt=true：闭关灵泉阵护田，缺水步整体跳过（T54——原口径推荐流程必减产）
    endDay(state, rng, trace, true)
    const entry: MeditateDayTrace = { day: state.day, dayOffset: i, events: [], matured: [] }
    if (trace.event) entry.events.push({ name: trace.event.name, desc: trace.event.desc, neg: trace.event.negative })
    for (const b of before) {
      const f = state.fields.find((x) => x.id === b.id)!
      if (b.status === 'growing' && f.status === 'mature' && f.herb) {
        entry.matured.push({ field: f.id, herbName: HERB_BY_ID[f.herb].name })
      }
    }
    perDay.push(entry)
    if (trace.hint) lastHint = trace.hint
    if (state.phase === 'quota') break // 月末定额未结算时提前出关（防御：正常跨度上限不会走到）
  }
  // 落在月末（第 30 天早晨）：直接进入定额结算——月末是入定的唯一中断点，
  // 第 30 天的日终管线不补跑（手动路径由玩家当日自行 END_DAY 进入同一交互）
  const stopped = state.phase === 'quota' || economy.dayInMonth(state.day) === MONTH_DAYS
  if (stopped && state.phase !== 'quota') {
    state.phase = 'quota'
    addLog(state, { kind: 'settle', icon: '🧾', title: '月末已至', text: '执事前来核对定额' })
    lastHint = ''
  }
  // 折叠批次日志：保留突破与月末条目，其余（事件/缺水/逐日预告）收拢为 ≤2 条汇总
  const after = state.log
  let overlap = Math.min(oldLog.length, after.length)
  while (overlap > 0 && !after.slice(after.length - overlap).every((e, k) => JSON.stringify(e) === oldLog[k])) {
    overlap -= 1
  }
  const added = after.slice(0, after.length - overlap)
  const survivors = after.slice(after.length - overlap)
  const kept = added.filter((l) => l.kind === 'breakthrough' || l.title === '月末已至')
  const events = perDay.reduce((a, d) => a + d.events.length, 0)
  const maturedTotal = perDay.reduce((a, d) => a + d.matured.length, 0)
  const breaks = added.filter((l) => l.kind === 'breakthrough').length
  // 闭关纳灵（T54）：每满 MEDITATE_QI_EVERY 天聚 1 点灵气，走 gainQi 统一上限截断；
  // 实际入账 = 应得 − 溢出，供摘要与出关面板展示
  const qiDue = Math.floor(perDay.length / MEDITATE_QI_EVERY)
  const qiGain = qiDue - farming.gainQi(state, qiDue)
  const summary: LogEntry = {
    day: state.day,
    kind: 'settle',
    icon: '🧘',
    title: `入定 ${perDay.length} 天`,
    text: `事件 ${events} 起、成熟 ${maturedTotal} 田次${qiGain ? `、聚灵 +${qiGain}` : ''}${breaks ? `、突破 ${breaks} 次` : ''}`,
  }
  const hintEntry: LogEntry[] = lastHint
    ? [{ day: state.day, kind: 'action', icon: '🔮', title: '明日预告', text: lastHint }]
    : []
  state.log = [...[summary, ...hintEntry], ...kept, ...survivors]
  return {
    advancedDays: perDay.length,
    stoppedAtMonthEnd: stopped,
    newMonthDay: economy.dayInMonth(state.day),
    perDay,
    qiGain,
    tomorrowHint: lastHint,
  }
}

// 功法升级：心得 100 + 贡献消耗；Lv2 生长期缩短后立即检查成熟状态（farming.md）。
function upgradeGongfa(s: GameState): ReasonCode | null {
  if (s.gongfa >= 5) return 'MAX_GONGFA'
  // 贡献表走 GONGFA_COST 常量（ActionPanel 展示同源；T29 审查修正：原字面量与常量重复，调参会分叉）
  const cost = GONGFA_COST[s.gongfa]
  if (s.resources.insight < 100) return 'NO_INSIGHT'
  if (s.resources.contribution < cost) return 'NO_CONTRIBUTION'
  s.resources.insight -= 100
  s.resources.contribution -= cost
  s.gongfa += 1
  // 生长期缩短后，已达到新阈值的作物应立即成熟。
  if (s.gongfa === 2) {
    for (const field of s.fields) {
      if (field.status === 'growing' && field.herb && field.progress !== undefined && field.progress >= farming.effDays(field.herb, s.gongfa)) {
        field.progress = farming.effDays(field.herb, s.gongfa)
        field.status = 'mature'
      }
    }
  }
  addLog(s, { kind: 'action', icon: '📖', title: `功法升至 Lv${s.gongfa}`, text: `心得 −100${cost ? `，贡献 −${cost}` : ''}` })
  return null
}

// 变异式应用：直接在传入的 state 上就地修改（含 rngState 推进），不克隆。
// 供平衡模拟器等高频场景使用；UI 走 dispatch（克隆后调用本函数）。
// 调用方保证传入的是自己持有的可变副本。
export function applyAction(state: GameState, action: GameAction): { ok: boolean; reason?: ReasonCode } {
  const rng = createRng(state.rngState)
  let err: ReasonCode | null

  // 月末定额交互中只允许结算动作（core-loop.md §3.3）
  if (state.phase === 'quota' && action.type !== 'QUOTA_RESOLVE') {
    err = 'INVALID_TARGET'
  } else {
    switch (action.type) {
      case 'PLANT':
        err = farming.plant(state, action.fieldId, action.herb)
        break
      case 'WATER':
        err = farming.water(state)
        break
      case 'HARVEST':
        err = farming.harvest(state, action.fieldId, rng)
        break
      case 'IRRIGATE':
        err = farming.irrigate(state)
        break
      case 'TUNA':
        err = farming.tuna(state)
        break
      case 'RECLAIM':
        err = farming.reclaim(state, action.fieldId)
        break
      case 'RECLAIM_LAND':
        err = farming.reclaimLand(state)
        break
      case 'BUY_SEED':
        err = economy.buySeed(state, action.herb)
        break
      case 'BUY_SCROLL':
        err = economy.buyScroll(state)
        break
      case 'SELL_HERB':
        err = economy.sellHerb(state, action.herb, action.count)
        break
      case 'EMERGENCY_SEED':
        err = economy.emergencySeed(state)
        break
      case 'GONGFA_UP':
        err = upgradeGongfa(state)
        break
      case 'QUIZ_BEGIN':
        err = quiz.beginSession(state, rng)
        break
      case 'QUIZ_LEARNED':
        err = quiz.learned(state)
        break
      case 'QUIZ_ANSWER':
        err = quiz.answer(state, action.choice)
        break
      case 'QUIZ_NEXT':
        err = quiz.next(state)
        break
      case 'QUIZ_CONFIRM':
        err = quiz.confirm(state)
        break
      case 'QUIZ_SET_LIB':
        err = quiz.setLib(state, action.lib)
        break
      case 'END_DAY':
        err = endDay(state, rng)
        break
      case 'MEDITATE':
        // 月末定额交互中的拒绝由上方 phase 门控承担（INVALID_TARGET）；此处只校验跨度
        err = runMeditationBatch(state, rng, action.days) ? null : 'EXCEEDS_MONTH'
        break
      case 'MILESTONE_SHOWN':
        state.milestoneShown = true
        err = null
        break
      case 'TUTORIAL_DONE':
        state.tutorialDone = true
        err = null
        break
      case 'DEBUG_CULTIVATE':
        // 调试专用（?debug=1）：走 gainCultivation 统一入口，保持突破/里程碑逻辑一致
        gainCultivation(state, Math.max(0, Math.floor(action.amount)))
        err = null
        break
      case 'QUOTA_RESOLVE': {
        if (state.phase !== 'quota') {
          err = 'INVALID_TARGET'
          break
        }
        err = economy.resolveQuota(state, action.pay, action.plan, rng)
        if (err === null) advanceDay(state, rng)
        break
      }
      case 'COMMISSION_ACCEPT':
        // 灵植堂委托（v6）：三动作均 0 AP；月末定额交互中被 phase 门控整体拒绝
        err = commissions.accept(state, action.offerId)
        break
      case 'COMMISSION_DELIVER':
        err = commissions.deliver(state)
        break
      case 'COMMISSION_ABANDON':
        err = commissions.abandon(state)
        break
    }
  }

  if (err === null) state.rngState = rng.state()
  clampResources(state)
  return { ok: err === null, reason: err ?? undefined }
}

export function dispatch(state: GameState, action: GameAction): { ok: boolean; state: GameState; reason?: ReasonCode } {
  const s: GameState = structuredClone(state)
  const r = applyAction(s, action)
  return { ok: r.ok, state: s, reason: r.reason }
}

// 供 UI 预览定额选择折算合计（economy.md §3.3）
export function quotaConverted(plan: Partial<Record<string, number>>): number {
  let sum = 0
  for (const [id, n] of Object.entries(plan)) sum += convertRate(HERB_BY_ID[id as keyof typeof HERB_BY_ID]) * (n ?? 0)
  return sum
}
