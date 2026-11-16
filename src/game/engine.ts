// 引擎（core-loop.md）：初始状态、动作分发与日结算五步管线。
// dispatch 克隆状态后交各模块就地修改，永不抛异常，失败返回 reason（architecture.md §5）。
import { EVENTS, EVENT_CHANCE, DAILY_AP, GONGFA_COST, HERB_BY_ID, INITIAL, MARKET_UP, MARKET_DOWN, DIMINISH_EVENT_CHANCE, tideOf, type EventDef } from './constants'
import { realDayIndex } from './clock'
import { convertRate, dayInMonth, monthOf } from './economy'
import * as economy from './economy'
import * as farming from './farming'
import { addLog } from './log'
import { clampResources, gainCultivation } from './progression'
import * as quiz from './quiz'
import { createRng, pick, type Rng } from './rng'
import type { GameAction, GameState, ReasonCode } from './types'

export { monthOf, dayInMonth } from './economy'

export function quizStartStat() {
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
    fields: Array.from({ length: INITIAL.fields }, (_, i) => ({ id: i + 1, status: 'empty' as const })),
    seeds: { ...INITIAL.seeds },
    inventory: { qingling: 0, ninglu: 0, ziyun: 0, chisui: 0, longxue: 0, jiuye: 0 },
    quizDaily: { done: false, session: null },
    learning: {
      currentLib: 'cet4',
      seenMap: {},
      libs: { cet4: quizStartStat(), cet6: quizStartStat() },
    },
    // 现实日锚（real-day.md §3.6）：开局 today = 创建当日，连胜全零值（lastCheckinDay -1 = 从未打卡）
    realDay: { today: realDayIndex(nowMs), gamesToday: 0 },
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
  switch (eff.kind) {
    case 'yield': {
      // 目标选取走 PRNG；无生长中田则无事发生
      const growing = s.fields.filter((f) => f.status === 'growing')
      const t = eff.randomField && growing.length ? pick(rng, growing) : null
      if (t) t.curYield = Math.max(0, t.curYield! + eff.delta)
      break
    }
    case 'growth':
      // 全部生长中田进度增减（灵雨 +1 与日终管线 +1 合计 +2；阵法波动 −1）；
      // 生长中田 progress 恒小于生长期，成熟停驻检查只对 +delta 生效，对 −delta 是空操作
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
  addLog(s, { kind: 'event', evPos: ev.pos, evSheet: ev.sheet, icon: ev.icon, title: `事件 · ${ev.name}`, text: ev.desc, neg: ev.negative })
}

// 月初灵潮日志（PRD §11.1）：第 1/31/61… 天开始时提示本月灵潮
function addTideLog(s: GameState): void {
  const tide = tideOf(monthOf(s.day))
  addLog(s, { kind: 'settle', evPos: [4, 0], evSheet: 'event-icons-sheet-extra.png', icon: '🌗', title: `灵潮 · ${tide.name}`, text: tide.desc })
}

// 按当月灵潮调制后的权重抽取事件（core-loop.md §3.4）：基础权重 × 灵潮系数后走轮盘
export function drawEvent(rng: Rng, month: number): EventDef {
  const tide = tideOf(month)
  const weighted = EVENTS.map((e) => ({ e, w: e.weight * (tide.weightMult[e.id] ?? 1) }))
  const total = weighted.reduce((a, x) => a + x.w, 0)
  let roll = rng.next() * total
  return (weighted.find((x) => (roll -= x.w) <= 0) ?? weighted[weighted.length - 1]).e
}

// 日结算（core-loop.md §3.3）：事件 → 生长 → 缺水 → 月末 → 推进，顺序固定
function endDay(s: GameState, rng: Rng): ReasonCode | null {
  if (!s.quizDaily.done) return 'QUIZ_NOT_DONE'
  // 当日效果到此结束；本次事件产生的效果需要保留到下一日。
  s.pendingTomorrow = {}
  // 1. 随机事件：30% 触发 1 个，按当月灵潮调制后的权重抽取（core-loop.md §3.4）；
  //    地力透支期（当日第 2+ 游戏日，real-day.md §3.5）触发率降为 DIMINISH_EVENT_CHANCE
  const eventChance = s.realDay.gamesToday >= 1 ? DIMINISH_EVENT_CHANCE : EVENT_CHANCE
  if (rng.next() < eventChance) {
    applyEvent(s, drawEvent(rng, monthOf(s.day)), rng)
  }
  // 2. 全田自然生长 +1（灵雨已在事件步 +1，合计 +2）
  farming.applyGrowth(s)
  // 3. 缺水结算
  farming.applyDrought(s)
  // 4. 月末判定：第 30 天进入定额结算交互，玩家完成缴纳/放弃后推进
  if (economy.dayInMonth(s.day) === 30) {
    s.phase = 'quota'
    addLog(s, { kind: 'settle', icon: '🧾', title: '月末已至', text: '执事前来核对定额' })
    return null
  }
  // 5. 推进到下一天
  advanceDay(s)
  return null
}

function advanceDay(s: GameState): void {
  // 地力透支（real-day.md §3.5）：游戏日成功推进计入当日；第 2+ 个游戏日递减，首次出现时日志说明规则
  if (s.realDay.gamesToday === 0) {
    addLog(s, {
      kind: 'settle',
      icon: '⛰️',
      title: '地力透支',
      text: '今日再推游戏日：日终事件触发与收获修为减半；灵草株数、测验奖励与自然生长不受影响',
    })
  }
  s.realDay.gamesToday += 1
  s.day += 1
  s.phase = 'day'
  farming.resetDaily(s)
  s.quizDaily.done = false
  s.quizDaily.session = null
  // 跨入新月时提示本月灵潮（core-loop.md 步骤 6 / PRD §11.1）
  if (dayInMonth(s.day) === 1) addTideLog(s)
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
        if (err === null) advanceDay(state)
        break
      }
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
