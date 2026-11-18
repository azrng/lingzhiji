// 平衡模拟器（PRD §14 / §16.9）：六策略 × N 局，统计筑基游戏日/现实日分布、逐月欠缴率、
// 功法达成率、错词池规模与资源曲线；每局记录随机种子保证可复现。
// 运行：npm run sim（默认 500 局）；npm run sim -- --quick（50 局快验）；npm run sim -- --quick 20（快验并指定局数）
import { createInitialState, applyAction } from '../src/game/engine'
import { syncRealDay } from '../src/game/clock'
import { convertRate, seedPrice } from '../src/game/economy'
import { FIELD_CAP, GONGFA_COST, HERBS, QUOTA_TARGET, REDEEM_COST } from '../src/game/constants'
import { createRng } from '../src/game/rng'
import type { GameAction, GameState, HerbId } from '../src/game/types'

const DAY_LIMIT = 365
const SAMPLE_DAYS = [30, 90, 180, 365]

// 模拟现实时钟：固定起点保证可复现（取正午整点，避开凌晨 4 点日切；按整 24h 步进，
// 无夏令时时区下 realDayIndex 恰好逐次 +1，与目标运行环境一致）
const SIM_NOW_START = Date.UTC(2026, 0, 10, 12, 0, 0)
const REAL_DAY_MS = 86_400_000

// 策略定义（PRD §14，行为规则逐条对齐；PRD §16.9 现实日玩家三档）
interface Strategy {
  key: string
  label: string
  pNew: number
  pReview: number
  pick: 'steady' | 'aggressive' | 'rotate' // 稳健/学习起步只种青灵草；进取选标价最高；轮作青灵草⇄凝露花换茬
  gamesPerRealDay: number // 每推进 N 个游戏日跨 1 次现实日（调用 syncRealDay）
}

// 现有三策略为「连推档」近似：每 30 游戏日（= 1 个游戏月）跨 1 次现实日。
// 若完全不跨日，gamesToday 只增不减会让它们从第 2 游戏日起永久处于地力递减期，
// 与现实玩家节奏不符且和历史报告口径混淆；30 游戏日粒度对齐定额周期，报告注明口径。
const STRATEGIES: Strategy[] = [
  { key: 'steady', label: '稳健经营', pNew: 0.8, pReview: 0.95, pick: 'steady', gamesPerRealDay: 30 },
  { key: 'aggressive', label: '进取投资', pNew: 0.8, pReview: 0.95, pick: 'aggressive', gamesPerRealDay: 30 },
  { key: 'beginner', label: '学习起步', pNew: 0.4, pReview: 0.6, pick: 'steady', gamesPerRealDay: 30 },
  // 现实日玩家三档（real-day.md §6 / PRD §16.9）：经营动作沿用稳健策略，仅节奏不同
  { key: 'daily1', label: '现实日·每日 1 游戏日', pNew: 0.8, pReview: 0.95, pick: 'steady', gamesPerRealDay: 1 },
  { key: 'daily2', label: '现实日·每日 2 游戏日', pNew: 0.8, pReview: 0.95, pick: 'steady', gamesPerRealDay: 2 },
  { key: 'daily3', label: '现实日·每日 3 游戏日', pNew: 0.8, pReview: 0.95, pick: 'steady', gamesPerRealDay: 3 },
  // 轮作对照（farming-depth.md §3.5）：与 daily1 同节奏，仅播种决策改轮作，验证地力/物候机制的增益幅度
  { key: 'daily1-rotate', label: '现实日·每日 1·轮作', pNew: 0.8, pReview: 0.95, pick: 'rotate', gamesPerRealDay: 1 },
]

interface RunResult {
  seed: number
  foundationDay: number | null
  foundationRealDay: number | null // 筑基所需现实日 = ceil(筑基游戏日 / 每现实日游戏日数)
  finalRealm: number
  monthsUnpaid: boolean[] // 下标 0 = 第 1 月
  gongfa: number
  wrongQueue: number
  stonesAt: { day: number; stones: number }[]
  shortageDays: number
  sameDayRecoveryDays: number
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
function emergencyBuy(s: GameState, act: (a: GameAction) => { ok: boolean }): { shortage: boolean; recovered: boolean } {
  const hasUsableSeed = HERBS.some((h) => s.realm >= h.realm && s.seeds[h.id] > 0)
  const hasCrop = s.fields.some((f) => f.status === 'growing' || f.status === 'mature')
  const cheapest = HERBS.filter((h) => s.realm >= h.realm).sort((a, b) => a.price - b.price)[0]
  if (!cheapest || hasUsableSeed || hasCrop || s.resources.stones >= cheapest.price) return { shortage: false, recovered: false }
  for (const h of [...HERBS].sort((a, b) => convertRate(a) - convertRate(b))) {
    while (s.inventory[h.id] > 0 && s.resources.stones < cheapest.price) {
      if (!act({ type: 'SELL_HERB', herb: h.id, count: 1 }).ok) return { shortage: true, recovered: false }
    }
    if (s.resources.stones >= cheapest.price) break
  }
  if (s.resources.stones >= cheapest.price) {
    act({ type: 'BUY_SEED', herb: cheapest.id })
  } else {
    act({ type: 'EMERGENCY_SEED' })
  }
  return { shortage: true, recovered: HERBS.some((h) => s.realm >= h.realm && s.seeds[h.id] > 0) }
}

// 空田播种（策略选种）；灵气不足时等待后续测验，不预购（PRD §14）
function plantEmptyFields(s: GameState, strat: Strategy, act: (a: GameAction) => { ok: boolean }): void {
  for (const f of s.fields.filter((x) => x.status === 'empty')) {
    const qiOk = (h: HerbId) => s.resources.qi >= HERBS.find((x) => x.id === h)!.qi
    const candidates: HerbId[] = HERBS.filter((h) => s.realm >= h.realm).map((h) => h.id)
    let chosen: HerbId | null = null

    if (strat.pick === 'rotate') {
      // 轮作（farming-depth.md §3.2 对照策略）：上茬青灵草改种凝露花、反之亦然（同为练气可种）；
      // 换不起时退回青灵草（固氮连作不耗地，轮作策略的下限即稳健策略）
      const tryPick = (h: HerbId): HerbId | null => {
        if (s.seeds[h] > 0 && qiOk(h)) return h
        if (s.resources.stones >= seedPrice(s, h) && qiOk(h) && act({ type: 'BUY_SEED', herb: h }).ok) return h
        return null
      }
      const alt: HerbId = f.lastCrop === 'qingling' ? 'ninglu' : f.lastCrop === 'ninglu' ? 'qingling' : 'qingling'
      chosen = (f.lastCrop && tryPick(alt)) ?? tryPick('qingling')
    } else if (strat.pick === 'steady') {
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
function simDay(s: GameState, strat: Strategy, rng: ReturnType<typeof createRng>, act: (a: GameAction) => { ok: boolean }): { shortage: boolean; recovered: boolean } {
  let shortage = false
  let recovered = false
  // 赎回优先
  for (const f of s.fields.filter((x) => x.status === 'confiscated')) {
    if (s.resources.contribution >= REDEEM_COST) act({ type: 'RECLAIM', fieldId: f.id })
  }
  // 任务堂（每游戏日先完成测验）
  // 按题型分流作答（M2 后 opts 语义随 kind 变化：w2c=释义组、c2w/listen=单词组、spell=拼写输入；
  // 旧写法对 c2w/listen 传 meaning、对 spell 传 undefined 均会 INVALID_TARGET 卡死不推进）
  if (act({ type: 'QUIZ_BEGIN' }).ok) {
    act({ type: 'QUIZ_LEARNED' })
    const session = s.quizDaily.session
    if (session) {
      for (let i = 0; i < 10; i++) {
        const q = session.questions[i]
        const correct = rng.next() < (q.from === 'new' ? strat.pNew : strat.pReview)
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
  // 按策略先提升功法，再进行当日经营。
  while (s.gongfa < 5 && s.resources.insight >= 100 && s.resources.contribution >= GONGFA_COST[s.gongfa]) {
    if (!act({ type: 'GONGFA_UP' }).ok) break
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
    const emergency = emergencyBuy(s, act)
    shortage ||= emergency.shortage
    recovered ||= emergency.recovered
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
  return { shortage, recovered }
}

function runSim(strat: Strategy, seed: number): RunResult {
  const rng = createRng(seed)
  // s 用 let：syncRealDay 返回克隆后的新 state，act 闭包引用变量本身，重赋值后继续可用
  let s = createInitialState((seed ^ 0x9e3779b9) >>> 0, SIM_NOW_START)
  const act = (a: GameAction) => applyAction(s, a)
  const res: RunResult = {
    seed,
    foundationDay: null,
    foundationRealDay: null,
    finalRealm: 0,
    monthsUnpaid: [],
    gongfa: 1,
    wrongQueue: 0,
    stonesAt: [],
    shortageDays: 0,
    sameDayRecoveryDays: 0,
  }
  let sampleIdx = 0
  let simNow = SIM_NOW_START
  let gamesSinceSync = 0
  while (s.day <= DAY_LIMIT && s.realm < 9) {
    const playedDay = s.day
    const emergency = simDay(s, strat, rng, act)
    if (emergency.shortage) res.shortageDays++
    if (emergency.shortage && emergency.recovered) res.sameDayRecoveryDays++
    if (s.realm >= 9) {
      res.foundationDay = playedDay
      // 筑基发生在第 ceil(游戏日 / 每现实日游戏日数) 个现实日（当日在推进中，按整天计）
      res.foundationRealDay = Math.ceil(playedDay / strat.gamesPerRealDay)
    }
    // 跨现实日（real-day.md §3.1）：推进完当日 N 个游戏日后调用 syncRealDay，
    // 晨露入账、gamesToday 重置、连胜漏签检查均由引擎结算，模拟器不重复实现
    gamesSinceSync++
    if (gamesSinceSync >= strat.gamesPerRealDay) {
      simNow += REAL_DAY_MS
      s = syncRealDay(s, simNow).state
      gamesSinceSync = 0
    }
    // 只记录实际完成的采样日；筑基后没有继续模拟，不伪造后续数据。
    while (sampleIdx < SAMPLE_DAYS.length && s.day > SAMPLE_DAYS[sampleIdx]) {
      res.stonesAt.push({ day: SAMPLE_DAYS[sampleIdx], stones: s.resources.stones })
      sampleIdx++
    }
    if (s.day === playedDay && s.realm < 9) throw new Error(`模拟未能推进：策略 ${strat.key}，种子 ${seed}，第 ${s.day} 天`)
  }
  res.finalRealm = s.realm
  res.gongfa = s.gongfa
  res.wrongQueue = s.learning.libs.cet4.wrongQueue.length
  for (const entry of s.month.ledger) res.monthsUnpaid[entry.month - 1] = !entry.paid
  return res
}

// ---- 统计与输出 ----
const median = (arr: number[]) => {
  const a = [...arr].sort((x, y) => x - y)
  if (!a.length) return NaN
  const middle = Math.floor(a.length / 2)
  return a.length % 2 ? a[middle] : (a[middle - 1] + a[middle]) / 2
}
const p90 = (arr: number[]) => {
  const a = [...arr].sort((x, y) => x - y)
  return a.length ? a[Math.ceil(a.length * 0.9) - 1] : NaN
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
    const realDays = done.map((r) => r.foundationRealDay!)
    lines.push(`- 筑基现实日：中位数 ${median(realDays)}，P90 ${p90(realDays)}（按每 ${strat.gamesPerRealDay} 游戏日 = 1 现实日折算）`)
  }
  const unfinished = results.filter((r) => r.foundationDay === null)
  const realmAvg = unfinished.length ? (unfinished.reduce((a, r) => a + r.finalRealm, 0) / unfinished.length).toFixed(2) : '—'
  lines.push(`- 未达成局：${unfinished.length}（${fmtPct(unfinished.length, results.length)}），终局境界均值 ${realmAvg}（0=练气一层，9=筑基）`)
  for (const lv of [2, 3, 4, 5]) {
    const n = results.filter((r) => r.gongfa >= lv).length
    lines.push(`- 功法 ≥Lv${lv}：${fmtPct(n, results.length)}`)
  }
  const wq = results.reduce((a, r) => a + r.wrongQueue, 0) / results.length
  lines.push(`- 错词池规模均值：${wq.toFixed(1)}（四级库）`)
  const shortageRuns = results.filter((r) => r.shortageDays > 0).length
  const shortageDays = results.reduce((sum, r) => sum + r.shortageDays, 0)
  const recoveryDays = results.reduce((sum, r) => sum + r.sameDayRecoveryDays, 0)
  lines.push(`- 资源耗尽：${shortageRuns} 局（${fmtPct(shortageRuns, results.length)}），共 ${shortageDays} 个游戏日；当日恢复可播种种子 ${recoveryDays} 次`)
  lines.push('')
  lines.push('| 月 | 欠缴率 | 完成当月结算局数 |')
  lines.push('|---|---|---|')
  for (let m = 1; m <= 12; m++) {
    const reached = results.filter((r) => r.monthsUnpaid[m - 1] !== undefined)
    const unpaid = reached.filter((r) => r.monthsUnpaid[m - 1]).length
    lines.push(`| ${m} | ${fmtPct(unpaid, reached.length)} | ${reached.length} |`)
  }
  lines.push('')
  lines.push('| 采样日 | 均值灵石 | 参与采样局数 |')
  lines.push('|---|---|---|')
  for (const d of SAMPLE_DAYS) {
    const vals = results.map((r) => r.stonesAt.find((x) => x.day === d)?.stones).filter((v): v is number => v !== undefined)
    const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—'
    lines.push(`| ${d} | ${avg} | ${vals.length} |`)
  }
  lines.push('')
  return lines.join('\n')
}

// ---- 现实日节奏对照（PRD §16.9）----
// 汇总六档的筑基游戏日/现实日数据，核对「每日 1-2 游戏日 → 60-90 现实日筑基」目标与 daily3 劣化情况
function compareSection(strategies: Strategy[], byKey: Map<string, RunResult[]>): string {
  const lines: string[] = ['## 现实日节奏对照（PRD §16.9）', '']
  const stat = (key: string) => {
    const rs = byKey.get(key)!
    const done = rs.filter((r) => r.foundationDay !== null)
    return {
      gMed: median(done.map((r) => r.foundationDay!)),
      gP90: p90(done.map((r) => r.foundationDay!)),
      rMed: median(done.map((r) => r.foundationRealDay!)),
      rP90: p90(done.map((r) => r.foundationRealDay!)),
      unpaid: fmtPct(rs.length - done.length, rs.length),
    }
  }
  lines.push('| 策略 | 游戏日/现实日 | 筑基游戏日 中位/P90 | 筑基现实日 中位/P90 | 未达成 |')
  lines.push('|---|---|---|---|---|')
  for (const strat of strategies) {
    const m = stat(strat.key)
    const pace = strat.gamesPerRealDay >= 30 ? `≈${strat.gamesPerRealDay}（连推近似）` : strat.gamesPerRealDay
    const g = Number.isFinite(m.gMed) ? `${m.gMed} / ${m.gP90}` : '—'
    const r = Number.isFinite(m.rMed) ? `${m.rMed} / ${m.rP90}` : '—'
    lines.push(`| ${strat.label} | ${pace} | ${g} | ${r} | ${m.unpaid} |`)
  }
  lines.push('')
  const d1 = stat('daily1')
  const d2 = stat('daily2')
  const d3 = stat('daily3')
  const st = stat('steady')
  if ([d1, d2, d3].every((m) => Number.isFinite(m.rMed))) {
    // 目标核对：两档中位数均落在 60-90 为达成；越出区间时写明档位与偏差方向
    const inRange = (v: number) => v >= 60 && v <= 90
    const tag = (name: string, v: number) => `${name}=${v}${inRange(v) ? '' : v < 60 ? '（低于 60，偏快）' : '（超过 90，偏慢）'}`
    lines.push(`- 每日 1-2 游戏日目标（60-90 现实日）：${tag('daily1', d1.rMed)}，${tag('daily2', d2.rMed)}（P90 分别 ${d1.rP90} / ${d2.rP90}）→ ${inRange(d1.rMed) && inRange(d2.rMed) ? '达成' : '部分达成'}`)
    const slower = ((d3.gMed - d2.gMed) / d2.gMed) * 100
    lines.push(`- daily3 劣化核对：游戏日中位 ${d3.gMed}，较 daily2（${d2.gMed}）${slower >= 0 ? `多 ${slower.toFixed(1)}%` : `少 ${(-slower).toFixed(1)}%`}；现实日中位 ${d3.rMed}（P90 ${d3.rP90}）——递减期占当日 2/3，连推被${d3.gMed > d2.gMed ? '有效钝化' : '未明显钝化'}`)
  }
  if (Number.isFinite(st.gMed) && Number.isFinite(d2.gMed)) {
    lines.push(`- 连推参照：稳健经营连推档游戏日中位 ${st.gMed}，vs daily2 ${d2.gMed}——${st.gMed > d2.gMed ? '连推反而更慢，地力递减使连推不占优' : '连推仍快于每日 2 游戏日，递减力度可再评估'}`)
  }
  lines.push('')
  return lines.join('\n')
}

// ---- 入口 ----
const args = process.argv.slice(2)
const quick = args.includes('--quick')
const numArg = Number(args.find((a) => /^\d+$/.test(a)) ?? 0)
const runs = numArg > 0 ? numArg : quick ? 50 : 500

const sections: string[] = [
  `# 灵植记平衡模拟报告`,
  '',
  `- 局数：${runs}/策略；截止日：${DAY_LIMIT}；策略与规则对齐 PRD §14，现实日口径见 PRD §16.9 / real-day.md`,
  '- 随机种子：第 i 局为 i × 7919，i 从 1 开始；筑基后停止模拟，后续日期不再采样。',
  '- 资源耗尽指没有可种种子和在田作物，且灵石不足以购买可种种子；恢复指出售或应急领种后当日获得可种种子。',
  '- 现实日口径：daily1/2/3 = 每现实日推进 1/2/3 个游戏日；稳健/进取/学习起步为连推档近似（每 30 游戏日跨 1 次现实日）。跨日由引擎 syncRealDay 结算晨露（灵石 +8 / 心得 +5，属设计内经济）与连胜漏签；地力递减（当日第 2+ 游戏日事件率 0.15、收获修为减半）由引擎按 gamesToday 自动生效。',
  '- 口径提示：连推档大部分游戏日处于地力递减期，其数字与「现实日机制上线前」的历史报告不可直接对比。',
  `- 生成时间：${new Date().toISOString()}`,
  '',
]
console.error(`开始模拟：${runs} 局 × ${STRATEGIES.length} 策略 …`)
const resultsByStrategy = new Map<string, RunResult[]>()
for (const strat of STRATEGIES) {
  const results: RunResult[] = []
  for (let i = 0; i < runs; i++) {
    const seed = (i + 1) * 7919
    results.push(runSim(strat, seed))
    if ((i + 1) % 50 === 0) console.error(`  ${strat.label} ${i + 1}/${runs}`)
  }
  resultsByStrategy.set(strat.key, results)
  sections.push(report(strat, results))
  console.error(`${strat.label} 完成`)
}
sections.push(compareSection(STRATEGIES, resultsByStrategy))
const out = sections.join('\n')
console.log(out)
// 报告留档 artifacts（不入库）
import { mkdirSync, writeFileSync } from 'node:fs'
mkdirSync('artifacts/sim', { recursive: true })
const file = `artifacts/sim/report-realday-${Date.now()}${quick ? '-quick' : ''}-${runs}.md`
writeFileSync(file, out, { encoding: 'utf-8', flag: 'wx' })
console.error(`报告已写入 ${file}`)
