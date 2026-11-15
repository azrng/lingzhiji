// 引擎（core-loop.md）：初始状态、动作分发与日结算五步管线。
// dispatch 克隆状态后交各模块就地修改，永不抛异常，失败返回 reason（architecture.md §5）。
import { EVENTS, EVENT_CHANCE, DAILY_AP, HERB_BY_ID, INITIAL, MARKET_UP, MARKET_DOWN, type EventDef } from './constants'
import { convertRate } from './economy'
import * as economy from './economy'
import * as farming from './farming'
import { addLog } from './log'
import { gainCultivation } from './progression'
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
  s.pendingTomorrow = {}
}

// 功法升级：心得 100 + 贡献消耗；Lv2 生长期 −1 由 effDays 动态生效，无需回溯（farming.md）
function upgradeGongfa(s: GameState): ReasonCode | null {
  if (s.gongfa >= 5) return 'MAX_GONGFA'
  const cost = [0, 0, 50, 100, 150][s.gongfa]
  if (s.resources.insight < 100) return 'NO_INSIGHT'
  if (s.resources.contribution < cost) return 'NO_CONTRIBUTION'
  s.resources.insight -= 100
  s.resources.contribution -= cost
  s.gongfa += 1
  addLog(s, { kind: 'action', icon: '📖', title: `功法升至 Lv${s.gongfa}`, text: `心得 −100${cost ? `，贡献 −${cost}` : ''}` })
  return null
}

export function dispatch(state: GameState, action: GameAction): { ok: boolean; state: GameState; reason?: ReasonCode } {
  const s: GameState = structuredClone(state)
  const rng = createRng(s.rngState)
  const finish = (err: ReasonCode | null) => {
    if (err === null) s.rngState = rng.state()
    return { ok: err === null, state: s, reason: err ?? undefined }
  }
  // 月末定额交互中只允许结算动作（core-loop.md §3.3）
  if (s.phase === 'quota' && action.type !== 'QUOTA_RESOLVE') return finish('INVALID_TARGET')

  switch (action.type) {
    case 'PLANT': {
      const err = farming.plant(s, action.fieldId, action.herb)
      return finish(err)
    }
    case 'WATER':
      return finish(farming.water(s))
    case 'HARVEST': {
      const err = farming.harvest(s, action.fieldId)
      return finish(err)
    }
    case 'IRRIGATE':
      return finish(farming.irrigate(s))
    case 'TUNA':
      return finish(farming.tuna(s))
    case 'RECLAIM': {
      const err = farming.reclaim(s, action.fieldId)
      return finish(err)
    }
    case 'RECLAIM_LAND':
      return finish(farming.reclaimLand(s))
    case 'BUY_SEED': {
      const err = economy.buySeed(s, action.herb)
      return finish(err)
    }
    case 'BUY_SCROLL':
      return finish(economy.buyScroll(s))
    case 'SELL_HERB': {
      const err = economy.sellHerb(s, action.herb, action.count)
      return finish(err)
    }
    case 'EMERGENCY_SEED':
      return finish(economy.emergencySeed(s))
    case 'GONGFA_UP':
      return finish(upgradeGongfa(s))
    case 'QUIZ_BEGIN': {
      const err = quiz.beginSession(s, rng)
      return finish(err)
    }
    case 'QUIZ_LEARNED':
      return finish(quiz.learned(s))
    case 'QUIZ_ANSWER': {
      const err = quiz.answer(s, action.choice)
      return finish(err)
    }
    case 'QUIZ_NEXT':
      return finish(quiz.next(s))
    case 'QUIZ_CONFIRM':
      return finish(quiz.confirm(s))
    case 'QUIZ_SET_LIB': {
      const err = quiz.setLib(s, action.lib)
      return finish(err)
    }
    case 'END_DAY':
      return finish(endDay(s, rng))
    case 'MILESTONE_SHOWN':
      s.milestoneShown = true
      return finish(null)
    case 'TUTORIAL_DONE':
      s.tutorialDone = true
      return finish(null)
    case 'DEBUG_CULTIVATE':
      // 调试专用（?debug=1）：走 gainCultivation 统一入口，保持突破/里程碑逻辑一致
      gainCultivation(s, Math.max(0, Math.floor(action.amount)))
      return finish(null)
    case 'QUOTA_RESOLVE': {
      if (s.phase !== 'quota') return finish('INVALID_TARGET')
      const err = economy.resolveQuota(s, action.pay, action.plan, rng)
      if (err) return finish(err)
      advanceDay(s)
      return finish(null)
    }
  }
}

// 供 UI 预览定额选择折算合计（economy.md §3.3）
export function quotaConverted(plan: Partial<Record<string, number>>): number {
  let sum = 0
  for (const [id, n] of Object.entries(plan)) sum += convertRate(HERB_BY_ID[id as keyof typeof HERB_BY_ID]) * (n ?? 0)
  return sum
}
