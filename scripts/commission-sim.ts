// 委托正式平衡模拟（T39 接引擎后复跑，cultivation-commissions.md §5）：
// 委托已入引擎（存档 v6：月初生成 L2 定价选项 + COMMISSION_ACCEPT/DELIVER/ABANDON 动作），
// 本脚本驱动真实引擎动作，对比「基线（从不接取）」与「稳健接取」两组——
// 验证旁路建模结论（L1-L3 均安全，2026-11-18，见 artifacts/sim/report-commission-*.md）在正式实现下仍成立。
// 口径=daily1 现实日节奏、每月 2 选项、最多接 1、活跃跨月、交付扣库存（同步降低月末可缴能力）。
// 运行：npx tsx scripts/commission-sim.ts（默认 500 局/组）；--quick 50（快验）
import { createInitialState, applyAction } from '../src/game/engine'
import { syncRealDay } from '../src/game/clock'
import { convertRate, dayInMonth, seedPrice } from '../src/game/economy'
import { FIELD_CAP, GONGFA_COST, HERB_BY_ID, HERBS, QUOTA_TARGET, REDEEM_COST } from '../src/game/constants'
import { createRng } from '../src/game/rng'
import type { GameAction, GameState, HerbId } from '../src/game/types'

const DAY_LIMIT = 365
const SIM_NOW_START = Date.UTC(2026, 0, 10, 12, 0, 0)
const REAL_DAY_MS = 86_400_000

// 对照组：基线=从不接取（引擎照常生成选项但不碰，行为等价无委托）；接取组=理性接取（引擎 L2 定价）
interface Group {
  key: string
  label: string
  accept: boolean
}

const GROUPS: Group[] = [
  { key: 'none', label: '基线（不接委托）', accept: false },
  { key: 'steady', label: '稳健接取（引擎 L2 定价）', accept: true },
]

// ---- 委托统计（真实委托状态在 s.commissions，此处只记交付单数）----
interface CommissionStats {
  delivered: number // 累计交付单数（统计用）
}

// 月初：理性接取（只接「自己会种的草」的委托，优先在田同款；基线组不接）。
// 选项由引擎在 advanceDay 生成（s.commissions.offers），此处只做选择
function onMonthStart(s: GameState, group: Group, act: (a: GameAction) => { ok: boolean }): void {
  if (!group.accept) return
  if (s.commissions.active || s.commissions.acceptedThisMonth) return
  const growing = new Set(s.fields.filter((f) => f.herb).map((f) => f.herb!))
  const candidate =
    s.commissions.offers.find((o) => growing.has(o.herb)) ??
    s.commissions.offers.find((o) => s.realm >= HERB_BY_ID[o.herb].realm)
  if (candidate) act({ type: 'COMMISSION_ACCEPT', offerId: candidate.id })
}

// 交付检查：库存足额即交付（收获后调用，先于出售）——走引擎动作，扣草与奖励入账由引擎结算
function tryDeliver(s: GameState, act: (a: GameAction) => { ok: boolean }, cs: CommissionStats): void {
  const c = s.commissions.active
  if (!c || s.inventory[c.herb] < c.count) return
  if (act({ type: 'COMMISSION_DELIVER' }).ok) cs.delivered++
}

// ---- 每日行动序列（骨架与 balance-sim steady/daily1 口径一致；仅稳策略）----
function stockConverted(s: GameState): number {
  return HERBS.reduce((a, h) => a + convertRate(h) * s.inventory[h.id], 0)
}

function sellSurplus(s: GameState, act: (a: GameAction) => { ok: boolean }): void {
  for (const h of [...HERBS].sort((a, b) => convertRate(a) - convertRate(b))) {
    while (s.inventory[h.id] > 0 && stockConverted(s) - convertRate(h) >= QUOTA_TARGET) {
      if (!act({ type: 'SELL_HERB', herb: h.id, count: 1 }).ok) return
    }
  }
}

function emergencyBuy(s: GameState, act: (a: GameAction) => { ok: boolean }): boolean {
  const hasUsableSeed = HERBS.some((h) => s.realm >= h.realm && s.seeds[h.id] > 0)
  const hasCrop = s.fields.some((f) => f.status === 'growing' || f.status === 'mature')
  const cheapest = HERBS.filter((h) => s.realm >= h.realm).sort((a, b) => a.price - b.price)[0]
  if (!cheapest || hasUsableSeed || hasCrop || s.resources.stones >= cheapest.price) return false
  for (const h of [...HERBS].sort((a, b) => convertRate(a) - convertRate(b))) {
    while (s.inventory[h.id] > 0 && s.resources.stones < cheapest.price) {
      if (!act({ type: 'SELL_HERB', herb: h.id, count: 1 }).ok) return true
    }
    if (s.resources.stones >= cheapest.price) break
  }
  if (s.resources.stones >= cheapest.price) act({ type: 'BUY_SEED', herb: cheapest.id })
  else act({ type: 'EMERGENCY_SEED' })
  return true
}

function simDay(s: GameState, rng: ReturnType<typeof createRng>, act: (a: GameAction) => { ok: boolean }, cs: CommissionStats, group: Group): void {
  // 赎回优先
  for (const f of s.fields.filter((x) => x.status === 'confiscated')) {
    if (s.resources.contribution >= REDEEM_COST) act({ type: 'RECLAIM', fieldId: f.id })
  }
  // 任务堂（每日先完成测验；答题正确率与基线同参数 pNew 0.8 / pReview 0.95）
  // 按题型分流作答（M2 后 opts 语义随 kind 变化：w2c=释义组、c2w/listen=单词组、spell=拼写输入）
  if (act({ type: 'QUIZ_BEGIN' }).ok) {
    act({ type: 'QUIZ_LEARNED' })
    const session = s.quizDaily.session
    if (session) {
      for (let i = 0; i < 10; i++) {
        const q = session.questions[i]
        const correct = rng.next() < (q.from === 'new' ? 0.8 : 0.95)
        let choice: string
        if (q.kind === 'spell') {
          choice = correct ? q.word : `${q.word}x`
        } else if (q.kind === 'w2c') {
          choice = correct ? q.meaning : (q.opts.find((o) => o !== q.meaning) ?? q.opts[0])
        } else {
          choice = correct ? q.word : (q.opts.find((o) => o !== q.word) ?? q.opts[0])
        }
        act({ type: 'QUIZ_ANSWER', choice })
        act({ type: 'QUIZ_NEXT' })
      }
      act({ type: 'QUIZ_CONFIRM' })
    }
  }
  while (s.gongfa < 5 && s.resources.insight >= 100 && s.resources.contribution >= GONGFA_COST[s.gongfa]) {
    if (!act({ type: 'GONGFA_UP' }).ok) break
  }
  // 月初委托：生成选项并接取
  if (dayInMonth(s.day) === 1) onMonthStart(s, group, act)
  // 开局交付检查（先于出售：库存是上日遗留的足额部分）
  tryDeliver(s, act, cs)
  sellSurplus(s, act)
  // 经营循环：浇灌 > 收获 > 开荒 > 播种（含卖草/应急） > 灌注 > 吐纳；收获后立即检查交付
  let progressed = true
  while (progressed) {
    progressed = false
    if (s.ap >= 1 && !s.wateredToday && s.fields.some((f) => f.status === 'growing')) {
      if (act({ type: 'WATER' }).ok) progressed = true
    }
    for (const f of s.fields.filter((x) => x.status === 'mature')) {
      if (s.ap >= 1 && act({ type: 'HARVEST', fieldId: f.id }).ok) {
        progressed = true
        tryDeliver(s, act, cs)
      }
    }
    if (s.ap >= 2 && s.fields.length < FIELD_CAP[s.realm] && !s.fields.some((x) => x.status === 'confiscated')) {
      if (act({ type: 'RECLAIM_LAND' }).ok) progressed = true
    }
  sellSurplus(s, act)
  emergencyBuy(s, act)
    // 播种：稳健口径只种青灵草（库存优先，买得起才买）
    for (const f of s.fields.filter((x) => x.status === 'empty')) {
      if (s.seeds.qingling > 0 && s.resources.qi >= 1) act({ type: 'PLANT', fieldId: f.id, herb: 'qingling' })
      else if (s.resources.stones >= seedPrice(s, 'qingling') && s.resources.qi >= 1) {
        if (act({ type: 'BUY_SEED', herb: 'qingling' }).ok) act({ type: 'PLANT', fieldId: f.id, herb: 'qingling' })
      }
    }
    if (s.resources.qi >= 1 && s.fields.some((f) => f.status === 'growing')) {
      if (act({ type: 'IRRIGATE' }).ok) progressed = true
    }
    if (s.ap >= 1 && !s.tunaUsedToday) {
      if (act({ type: 'TUNA' }).ok) progressed = true
    }
  }
  // 结束当天；月末定额缴纳（与 balance-sim 同口径：折算低→高整数株缴足）
  act({ type: 'END_DAY' })
  if (s.phase === 'quota') {
    const plan: Partial<Record<HerbId, number>> = {}
    let converted = 0
    for (const h of [...HERBS].sort((a, b) => convertRate(a) - convertRate(b))) {
      const take = Math.min(s.inventory[h.id], Math.ceil((QUOTA_TARGET - converted) / convertRate(h)))
      if (take > 0) {
        plan[h.id] = take
        converted += take * convertRate(h)
      }
      if (converted >= QUOTA_TARGET) break
    }
    act({ type: 'QUOTA_RESOLVE', pay: converted >= QUOTA_TARGET, plan })
  }
}

interface RunResult {
  foundationDay: number | null
  unpaidMonths: number
  delivered: number
  stones30: number
  stones60: number
  contribution60: number
  insight60: number
}

function runSim(group: Group, seed: number): RunResult {
  const rng = createRng(seed)
  let s = createInitialState((seed ^ 0x9e3779b9) >>> 0, SIM_NOW_START)
  const act = (a: GameAction) => applyAction(s, a)
  const cs: CommissionStats = { delivered: 0 }
  // 采样初始 NaN：筑基即停（realm>=9 退出循环），晚于筑基的采样点对已结束局不存在，避免伪 0
  const res: RunResult = { foundationDay: null, unpaidMonths: 0, delivered: 0, stones30: NaN, stones60: NaN, contribution60: NaN, insight60: NaN }
  let simNow = SIM_NOW_START
  let gamesSinceSync = 0
  let sampled30 = false
  let sampled60 = false
  while (s.day <= DAY_LIMIT && s.realm < 9) {
    const playedDay = s.day
    simDay(s, rng, act, cs, group)
    if (s.realm >= 9) res.foundationDay = playedDay
    gamesSinceSync++
    if (gamesSinceSync >= 1) {
      simNow += REAL_DAY_MS
      s = syncRealDay(s, simNow).state
      gamesSinceSync = 0
    }
    if (!sampled30 && s.day > 30) { res.stones30 = s.resources.stones; sampled30 = true }
    if (!sampled60 && s.day > 60) {
      res.stones60 = s.resources.stones
      res.contribution60 = s.resources.contribution
      res.insight60 = s.resources.insight
      sampled60 = true
    }
    if (s.day === playedDay && s.realm < 9) throw new Error(`模拟未能推进：组 ${group.key}，种子 ${seed}，第 ${s.day} 天`)
  }
  res.delivered = cs.delivered
  for (const entry of s.month.ledger) if (!entry.paid) res.unpaidMonths++
  return res
}

// ---- 统计与输出 ----
const median = (arr: number[]) => {
  const a = [...arr].sort((x, y) => x - y)
  if (!a.length) return NaN
  const middle = Math.floor(a.length / 2)
  return a.length % 2 ? a[middle] : (a[middle - 1] + a[middle]) / 2
}
const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN)
const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '—')
const fmtPct = (n: number, d: number) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`)

const args = process.argv.slice(2)
const quick = args.includes('--quick')
const numArg = Number(args.find((a) => /^\d+$/.test(a)) ?? 0)
const runs = numArg > 0 ? numArg : quick ? 50 : 500

const lines: string[] = [
  '# 灵植记委托数值对照模拟（T39 前置）',
  '',
  `- 局数：${runs}/组；节奏：daily1（每现实日 1 游戏日，60-90 现实日目标档）；策略：稳健口径（只种青灵草）`,
  '- 委托口径：引擎 v6 正式实现——月初 2 选项（L2 定价 rng 四选一奖励）、最多接 1、活跃跨月；理性接取=只接自己会种的草（优先在田同款）；库存足额即交付（先于出售）',
  '- 交付扣库存会同步降低月末可缴储备（定额此消彼长口径）；两组同种子序列，差异全部来自委托',
  '- 对照旁路版前置结论（2026-11-18）：L1-L3 三档全部不破坏平衡，本复跑验证引擎实现未引入偏差',
  `- 生成时间：${new Date().toISOString()}`,
  '',
  '| 组 | 筑基游戏日中位 | 筑基达成率 | 月均欠缴 | 交付单数均值 | 灵石 D30 | 灵石 D60 | 贡献 D60 | 心得 D60 |',
  '|---|---|---|---|---|---|---|---|---|',
]

console.error(`开始模拟：${runs} 局 × ${GROUPS.length} 组 …`)
for (const group of GROUPS) {
  const results: RunResult[] = []
  for (let i = 0; i < runs; i++) {
    results.push(runSim(group, (i + 1) * 7919))
  }
  const done = results.filter((r) => r.foundationDay !== null)
  const gMed = median(done.map((r) => r.foundationDay!))
  const unpaidAvg = avg(results.map((r) => r.unpaidMonths))
  const deliveredAvg = avg(results.map((r) => r.delivered))
  lines.push(
    `| ${group.label} | ${Number.isFinite(gMed) ? gMed : '—'} | ${fmtPct(done.length, results.length)} | ${fmt(unpaidAvg)} | ${fmt(deliveredAvg)} | ${fmt(avg(results.map((r) => r.stones30)))} | ${fmt(avg(results.map((r) => r.stones60)))} | ${fmt(avg(results.map((r) => r.contribution60)))} | ${fmt(avg(results.map((r) => r.insight60)))} |`,
  )
  console.error(`${group.label} 完成`)
}
lines.push('')
lines.push('## 判读口径', '')
lines.push('- 委托「不取代既有决策」= 接取组筑基中位不快于基线 10%、月均欠缴不降超过 0.2 月；超出则需下调 L2 定价。')
lines.push('- 「轻量可感知」= 接取组交付单数均值明显高于 0（玩家实际会做），且筑基漂移在噪声内。')

const out = lines.join('\n')
console.log(out)
import { mkdirSync, writeFileSync } from 'node:fs'
mkdirSync('artifacts/sim', { recursive: true })
const file = `artifacts/sim/report-commission-${Date.now()}${quick ? '-quick' : ''}-${runs}.md`
writeFileSync(file, out, { encoding: 'utf-8', flag: 'wx' })
console.error(`报告已写入 ${file}`)
