// 引擎（core-loop.md）：初始状态、动作分发与日结算五步管线。
// dispatch 克隆状态后交各模块就地修改，永不抛异常，失败返回 reason（architecture.md §5）。
import { EVENTS, EVENT_CHANCE, DAILY_AP, HERB_BY_ID, INITIAL, MARKET_UP, MARKET_DOWN, type EventDef } from './constants'
import { convertRate } from './economy'
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

export function createInitialState(seed: number): GameState {
  return {
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
    month: { unpaidStreak: 0, ledger: [] },
    milestoneShown: false,
    tutorialDone: false,
    log: [],
    rngState: seed >>> 0,
  }
}

// 随机事件结算（core-loop.md §3.4）：即时类立即生效，持续类写入 pendingTomorrow 次日生效
function applyEvent(s: GameState, ev: EventDef, rng: Rng): void {
  switch (ev.id) {
    case 'rain':
      // 灵雨 = 全田 +2 天：这里先 +1，日终管线随后再 +1
      farming.applyGrowth(s)
      break
    case 'butterfly': {
      const growing = s.fields.filter((f) => f.status === 'growing')
      const t = growing.length ? pick(rng, growing) : null
      if (t) t.curYield! += 1
      break
    }
    case 'senior':
      gainCultivation(s, 3)
      break
    case 'stones':
      s.resources.stones += 8
      break
    case 'spring':
      s.pendingTomorrow.infusionDouble = true
      break
    case 'elder':
      s.resources.contribution += 5
      break
    case 'pest': {
      const growing = s.fields.filter((f) => f.status === 'growing')
      const t = growing.length ? pick(rng, growing) : null
      if (t) t.curYield = Math.max(0, t.curYield! - 1)
      break
    }
    case 'bird': {
      const owned = Object.entries(s.inventory).filter(([, n]) => n > 0)
      const t = owned.length ? pick(rng, owned) : null
      if (t) s.inventory[t[0] as keyof typeof s.inventory] -= 1
      break
    }
    case 'formation':
      for (const f of s.fields) if (f.status === 'growing') f.progress = Math.max(0, f.progress! - 1)
      break
    case 'market':
      s.pendingTomorrow.marketMult = rng.next() < 0.5 ? MARKET_UP : MARKET_DOWN
      break
  }
  addLog(s, { kind: 'event', evPos: ev.pos, title: `事件 · ${ev.name}`, text: ev.desc, neg: ev.negative })
}

// 日结算（core-loop.md §3.3）：事件 → 生长 → 缺水 → 月末 → 推进，顺序固定
function endDay(s: GameState, rng: Rng): ReasonCode | null {
  if (!s.quizDaily.done) return 'QUIZ_NOT_DONE'
  // 当日效果到此结束；本次事件产生的效果需要保留到下一日。
  s.pendingTomorrow = {}
  // 1. 随机事件：30% 触发 1 个，按权重抽取
  if (rng.next() < EVENT_CHANCE) {
    const total = EVENTS.reduce((a, e) => a + e.weight, 0)
    let roll = rng.next() * total
    const ev = EVENTS.find((e) => (roll -= e.weight) <= 0) ?? EVENTS[EVENTS.length - 1]
    applyEvent(s, ev, rng)
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
  s.day += 1
  s.phase = 'day'
  farming.resetDaily(s)
  s.quizDaily.done = false
  s.quizDaily.session = null
}

// 功法升级：心得 100 + 贡献消耗；Lv2 生长期缩短后立即检查成熟状态（farming.md）。
function upgradeGongfa(s: GameState): ReasonCode | null {
  if (s.gongfa >= 5) return 'MAX_GONGFA'
  const cost = [0, 0, 50, 100, 150][s.gongfa]
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
        err = farming.harvest(state, action.fieldId)
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
