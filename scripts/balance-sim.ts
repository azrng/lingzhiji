// 平衡模拟器（PRD §14）：三策略 × N 局，统计筑基天数分布、逐月欠缴率、功法达成率、
// 错词池规模与资源曲线；每局记录随机种子保证可复现。
// 运行：npm run sim（默认 500 局）；npm run sim -- --quick（50 局快验）
import { createInitialState, applyAction } from '../src/game/engine'
import { monthOf, convertRate, seedPrice } from '../src/game/economy'
import { FIELD_CAP, GONGFA_COST, HERBS, QUOTA_TARGET, REDEEM_COST } from '../src/game/constants'
import { createRng } from '../src/game/rng'
import type { GameAction, GameState, HerbId } from '../src/game/types'

const DAY_LIMIT = 365
const SAMPLE_DAYS = [30, 90, 180, 365]

// 策略定义（PRD §14，行为规则逐条对齐）
interface Strategy {
  key: string
  label: string
  pNew: number
  pReview: number
  pick: 'steady' | 'aggressive' // 稳健/学习起步只种青灵草；进取选标价最高
}

const STRATEGIES: Strategy[] = [
  { key: 'steady', label: '稳健经营', pNew: 0.8, pReview: 0.95, pick: 'steady' },
  { key: 'aggressive', label: '进取投资', pNew: 0.8, pReview: 0.95, pick: 'aggressive' },
  { key: 'beginner', label: '学习起步', pNew: 0.4, pReview: 0.6, pick: 'steady' },
]

interface RunResult {
  seed: number
  foundationDay: number | null
  finalRealm: number
  monthsUnpaid: boolean[] // 下标 0 = 第 1 月
  gongfa: number
  wrongQueue: number
  stonesAt: { day: number; stones: number }[]
}

// 库存折算合计（青灵草当量）
const stockConverted = (s: GameState) => HERBS.reduce((a, h) => a + convertRate(h) * s.inventory[h.id], 0)

// 出售多余灵草：按折算值低→高逐株，保持出售后库存折算 ≥ 15（PRD §14 播种前经营）
function sellSurplus(s: GameState, act: (a: GameAction) => { ok: boolean }): void {
  for (const h of [...HERBS].sort((a, b) => convertRate(a) - convertRate(b))) {
    while (s.inventory[h.id] > 0 && stockConverted(s) - convertRate(h) >= QUOTA_TARGET) {
      if (!act({ type: 'SELL_HERB', herb: h.id, count: 1 }).ok) return
    }
  }
}

// 紧急购种链（PRD §14）：无可种种子、无在田作物且买不起青灵草 → 卖最低售价灵草直到能买；无草可售领应急种
function emergencyBuy(s: GameState, act: (a: GameAction) => { ok: boolean }): void {
  const hasUsableSeed = HERBS.some((h) => s.realm >= h.realm && s.seeds[h.id] > 0)
  const hasCrop = s.fields.some((f) => f.status === 'growing' || f.status === 'mature')
  const cheapest = HERBS.filter((h) => s.realm >= h.realm).sort((a, b) => a.price - b.price)[0]
  if (!cheapest || hasUsableSeed || hasCrop || s.resources.stones >= cheapest.price) return
  for (const h of [...HERBS].sort((a, b) => convertRate(a) - convertRate(b))) {
    while (s.inventory[h.id] > 0 && s.resources.stones < cheapest.price) {
      if (!act({ type: 'SELL_HERB', herb: h.id, count: 1 }).ok) return
    }
    if (s.resources.stones >= cheapest.price) break
  }
  if (s.resources.stones >= cheapest.price) {
    act({ type: 'BUY_SEED', herb: cheapest.id })
  } else {
    act({ type: 'EMERGENCY_SEED' })
  }
}

// 空田播种（策略选种）；灵气不足时等待后续测验，不预购（PRD §14）
function plantEmptyFields(s: GameState, strat: Strategy, act: (a: GameAction) => { ok: boolean }): void {
  for (const f of s.fields.filter((x) => x.status === 'empty')) {
    const qiOk = (h: HerbId) => s.resources.qi >= HERBS.find((x) => x.id === h)!.qi
    const candidates: HerbId[] = HERBS.filter((h) => s.realm >= h.realm).map((h) => h.id)
    let chosen: HerbId | null = null

    if (strat.pick === 'steady') {
      // 稳健/学习起步：库存青灵草优先，否则买青灵草种（买得起才买）
      if (s.seeds.qingling > 0 && s.resources.qi >= 1) chosen = 'qingling'
      else if (s.resources.stones >= seedPrice(s, 'qingling') && s.resources.qi >= 1) {
        if (act({ type: 'BUY_SEED', herb: 'qingling' }).ok) chosen = 'qingling'
      }
    } else {
      // 进取：库存与买得起的种子里，选当前境界可种、灵气足、标价最高者；同价优先库存
      const inStock = candidates.filter((h) => s.seeds[h] > 0 && qiOk(h))
      const affordable = candidates.filter((h) => s.resources.stones >= seedPrice(s, h) && qiOk(h))
      const pool = [...inStock, ...affordable]
      if (pool.length) {
        pool.sort((a, b) => {
          const pa = inStock.includes(a) ? HERBS.find((x) => x.id === a)!.price + 0.5 : HERBS.find((x) => x.id === a)!.price
          const pb = inStock.includes(b) ? HERBS.find((x) => x.id === b)!.price + 0.5 : HERBS.find((x) => x.id === b)!.price
          return pb - pa
        })
        chosen = pool[0]
        if (!inStock.includes(chosen)) {
          if (!act({ type: 'BUY_SEED', herb: chosen }).ok) chosen = null
        }
      }
    }
    if (chosen) act({ type: 'PLANT', fieldId: f.id, herb: chosen })
  }
}

// 模拟一个游戏日的行动序列（PRD §14 策略共通行为）
function simDay(s: GameState, strat: Strategy, rng: ReturnType<typeof createRng>, act: (a: GameAction) => { ok: boolean }): void {
  // 赎回优先
  for (const f of s.fields.filter((x) => x.status === 'confiscated')) {
    if (s.resources.contribution >= REDEEM_COST) act({ type: 'RECLAIM', fieldId: f.id })
  }
  // 任务堂（每游戏日先完成测验）
  if (act({ type: 'QUIZ_BEGIN' }).ok) {
    act({ type: 'QUIZ_LEARNED' })
    const session = s.quizDaily.session
    if (session) {
      for (let i = 0; i < 10; i++) {
        const q = session.questions[i]
        const correct = rng.next() < (q.from === 'new' ? strat.pNew : strat.pReview)
        const wrong = q.opts.find((o) => o !== q.meaning) ?? q.opts[0]
        act({ type: 'QUIZ_ANSWER', choice: correct ? q.meaning : wrong })
        act({ type: 'QUIZ_NEXT' })
      }
      act({ type: 'QUIZ_CONFIRM' })
    }
  }
  // 经营循环：浇灌 > 收获 > 开荒 > 播种（含卖草/应急） > 灌注 > 吐纳
  sellSurplus(s, act)
  let progressed = true
  while (progressed) {
    progressed = false
    if (s.ap >= 1 && !s.wateredToday && s.fields.some((f) => f.status === 'growing')) {
      if (act({ type: 'WATER' }).ok) progressed = true
    }
    for (const f of s.fields.filter((x) => x.status === 'mature')) {
      if (s.ap >= 1 && act({ type: 'HARVEST', fieldId: f.id }).ok) progressed = true
    }
    if (s.ap >= 2 && s.fields.length < FIELD_CAP[s.realm] && !s.fields.some((x) => x.status === 'confiscated')) {
      if (act({ type: 'RECLAIM_LAND' }).ok) progressed = true
    }
    sellSurplus(s, act)
    emergencyBuy(s, act)
    const emptyBefore = s.fields.filter((x) => x.status === 'empty').length
    plantEmptyFields(s, strat, act)
    if (s.fields.filter((x) => x.status === 'empty').length < emptyBefore) progressed = true
    if (s.resources.qi >= 1 && s.fields.some((f) => f.status === 'growing')) {
      if (act({ type: 'IRRIGATE' }).ok) progressed = true
    }
    if (s.ap >= 1 && !s.tunaUsedToday) {
      if (act({ type: 'TUNA' }).ok) progressed = true
    }
  }
  // 功法逐级升级（资源足够时）
  while (s.gongfa < 5 && s.resources.insight >= 100 && s.resources.contribution >= GONGFA_COST[s.gongfa]) {
    if (!act({ type: 'GONGFA_UP' }).ok) break
  }
  // 结束当天；月末按规则缴纳（先用青灵草，再按折算低→高整数株缴足，不足欠缴）
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
    const pay = converted >= QUOTA_TARGET
    act({ type: 'QUOTA_RESOLVE', pay, plan })
  }
}

function runSim(strat: Strategy, seed: number): RunResult {
  const rng = createRng(seed)
  const s = createInitialState((seed ^ 0x9e3779b9) >>> 0)
  const act = (a: GameAction) => applyAction(s, a)
  const res: RunResult = {
    seed,
    foundationDay: null,
    finalRealm: 0,
    monthsUnpaid: [],
    gongfa: 1,
    wrongQueue: 0,
    stonesAt: [],
  }
  let sampleIdx = 0
  while (s.day <= DAY_LIMIT && s.realm < 9) {
    // 资源曲线采样（达成前按天记录）
    while (sampleIdx < SAMPLE_DAYS.length && s.day > SAMPLE_DAYS[sampleIdx]) {
      res.stonesAt.push({ day: SAMPLE_DAYS[sampleIdx], stones: s.resources.stones })
      sampleIdx++
    }
    simDay(s, strat, rng, act)
  }
  if (s.realm >= 9) res.foundationDay = s.day
  res.finalRealm = s.realm
  res.gongfa = s.gongfa
  res.wrongQueue = s.learning.libs.cet4.wrongQueue.length
  while (sampleIdx < SAMPLE_DAYS.length) {
    res.stonesAt.push({ day: SAMPLE_DAYS[sampleIdx], stones: s.resources.stones })
    sampleIdx++
  }
  return res
}

// ---- 统计与输出 ----
const median = (arr: number[]) => {
  const a = [...arr].sort((x, y) => x - y)
  return a.length ? a[Math.floor(a.length / 2)] : NaN
}
const p90 = (arr: number[]) => {
  const a = [...arr].sort((x, y) => x - y)
  return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * 0.9))] : NaN
}
const fmtPct = (n: number, d: number) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`)

function report(strat: Strategy, results: RunResult[]): string {
  const lines: string[] = []
  const done = results.filter((r) => r.foundationDay !== null)
  const days = done.map((r) => r.foundationDay!)
  lines.push(`## ${strat.label}（${strat.key}）`)
  lines.push('')
  lines.push(`- 局数 ${results.length}，突破筑基 ${done.length}（${fmtPct(done.length, results.length)}）`)
  if (days.length) {
    lines.push(`- 筑基天数：中位数 ${median(days)}，P90 ${p90(days)}，最快 ${Math.min(...days)}，最慢 ${Math.max(...days)}`)
  }
  const realmAvg = results.reduce((a, r) => a + r.finalRealm, 0) / results.length
  lines.push(`- 未达成局终局境界均值：${realmAvg.toFixed(2)}（0=练气一层，9=筑基）`)
  for (const lv of [2, 3, 4, 5]) {
    const n = results.filter((r) => r.gongfa >= lv).length
    lines.push(`- 功法 ≥Lv${lv}：${fmtPct(n, results.length)}`)
  }
  const wq = results.reduce((a, r) => a + r.wrongQueue, 0) / results.length
  lines.push(`- 错词池规模均值：${wq.toFixed(1)}（四级库）`)
  lines.push('')
  lines.push('| 月 | 欠缴率 | 达成前离场局 |')
  lines.push('|---|---|---|')
  for (let m = 1; m <= 12; m++) {
    const reached = results.filter((r) => r.foundationDay === null || r.foundationDay! > m * 30)
    const unpaid = reached.filter((r) => r.monthsUnpaid[m - 1]).length
    lines.push(`| ${m} | ${fmtPct(unpaid, reached.length)} | ${reached.length} |`)
  }
  lines.push('')
  lines.push('| 采样日 | 均值灵石 |')
  lines.push('|---|---|')
  for (const d of SAMPLE_DAYS) {
    const vals = results.map((r) => r.stonesAt.find((x) => x.day === d)?.stones).filter((v): v is number => v !== undefined)
    const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—'
    lines.push(`| ${d} | ${avg} |`)
  }
  lines.push('')
  return lines.join('\n')
}

// ---- 入口 ----
const args = process.argv.slice(2)
const quick = args.includes('--quick')
const runs = quick ? 50 : Number(args.find((a) => /^\d+$/.test(a)) ?? 500)

const sections: string[] = [
  `# 灵植记平衡模拟报告`,
  '',
  `- 局数：${runs}/策略；截止日：${DAY_LIMIT}；策略与规则对齐 PRD §14`,
  `- 生成时间：${new Date().toISOString()}`,
  '',
]
console.error(`开始模拟：${runs} 局 × ${STRATEGIES.length} 策略 …`)
for (const strat of STRATEGIES) {
  const results: RunResult[] = []
  for (let i = 0; i < runs; i++) {
    const seed = (i + 1) * 7919
    results.push(runSim(strat, seed))
    if ((i + 1) % 50 === 0) console.error(`  ${strat.label} ${i + 1}/${runs}`)
  }
  sections.push(report(strat, results))
  console.error(`${strat.label} 完成`)
}
const out = sections.join('\n')
console.log(out)
// 报告留档 artifacts（不入库）
import { mkdirSync, writeFileSync } from 'node:fs'
mkdirSync('artifacts/sim', { recursive: true })
const file = `artifacts/sim/report-${new Date().toISOString().slice(0, 10)}${quick ? '-quick' : ''}-${runs}.md`
writeFileSync(file, out, 'utf-8')
console.error(`报告已写入 ${file}`)
