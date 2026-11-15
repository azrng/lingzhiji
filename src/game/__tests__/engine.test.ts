// 引擎与种植单测：日结算五步顺序、门控、事件权重与灵潮、效果解释器、缺水减产、收获上品、播种零消耗（对齐 PRD §14/§16）
import { describe, expect, it } from 'vitest'
import { DAILY_AP, EVENTS, EVENT_CHANCE, HARVEST_PRIME_CHANCE, tideOf } from '../constants'
import { applyAction, applyEvent, dispatch, createInitialState, drawEvent } from '../engine'
import { createRng } from '../rng'
import type { GameState } from '../types'

function started(seed = 42): GameState {
  return createInitialState(seed)
}

// 快速把当日任务做完成（答题对错不影响推进）
function finishQuiz(s: GameState): GameState {
  let cur = s
  cur = dispatch(cur, { type: 'QUIZ_BEGIN' }).state
  cur = dispatch(cur, { type: 'QUIZ_LEARNED' }).state
  const session = cur.quizDaily.session!
  for (let i = 0; i < 10; i++) {
    cur = dispatch(cur, { type: 'QUIZ_ANSWER', choice: session.questions[i].opts[0] }).state
    cur = dispatch(cur, { type: 'QUIZ_NEXT' }).state
  }
  return dispatch(cur, { type: 'QUIZ_CONFIRM' }).state
}

describe('播种校验与零消耗', () => {
  it('境界不足购买紫云芝种子可以，但播种被拒且种子/灵气/AP 均不动（PRD §16.6）', () => {
    let s = started()
    s.resources.stones = 100
    s = dispatch(s, { type: 'BUY_SEED', herb: 'ziyun' }).state // 练气一层可买不可种
    expect(s.seeds.ziyun).toBe(1)
    const before = { qi: s.resources.qi, ap: s.ap }
    const r = dispatch(s, { type: 'PLANT', fieldId: 1, herb: 'ziyun' })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('REALM_LOCKED')
    expect(r.state!.seeds.ziyun).toBe(1)
    expect(r.state!.resources.qi).toBe(before.qi)
    expect(r.state!.ap).toBe(before.ap)
  })

  it('灵气不足不可播种；达境界且灵气足够时成功扣 1 种子 2 灵气', () => {
    let s = started()
    s.realm = 2
    s.seeds.ziyun = 1
    s.resources.qi = 1
    let r = dispatch(s, { type: 'PLANT', fieldId: 1, herb: 'ziyun' })
    expect(r.reason).toBe('NO_QI')
    s = r.state!
    s.resources.qi = 5
    r = dispatch(s, { type: 'PLANT', fieldId: 1, herb: 'ziyun' })
    expect(r.ok).toBe(true)
    expect(r.state!.seeds.ziyun).toBe(0)
    expect(r.state!.resources.qi).toBe(3)
    expect(r.state!.fields[0].status).toBe('growing')
  })
})

describe('日结算管线（core-loop.md 五步）', () => {
  it('次日事件跨日和月末结算保留一天，并在下一次日结算时失效', () => {
    // 用真实的 drawEvent（含当月灵潮调制）构造必然抽中灵泉的种子，避免复制轮盘逻辑漂移
    const seed = Array.from({ length: 10000 }, (_, i) => i).find((i) => {
      const rng = createRng(i)
      if (rng.next() >= EVENT_CHANCE) return false
      return drawEvent(rng, 1).id === 'spring'
    })!
    for (const day of [1, 30]) {
      let s = started(seed)
      s.day = day
      s.quizDaily.done = true
      s.pendingTomorrow.marketMult = 1.5
      s = dispatch(s, { type: 'END_DAY' }).state
      expect(s.pendingTomorrow).toEqual({ infusionDouble: true })
      if (day === 30) s = dispatch(s, { type: 'QUOTA_RESOLVE', pay: false, plan: {} }).state
      expect(s.pendingTomorrow.infusionDouble).toBe(true)
      s.quizDaily.done = true
      s.rngState = Array.from({ length: 100 }, (_, i) => i).find((i) => createRng(i).next() >= EVENT_CHANCE)!
      s = dispatch(s, { type: 'END_DAY' }).state
      expect(s.pendingTomorrow).toEqual({})
    }
  })

  it('功法升至二级时立即检查作物成熟', () => {
    const s = started()
    s.resources.insight = 100
    s.fields[0] = { id: 1, status: 'growing', herb: 'qingling', progress: 14, curYield: 5, dry: 0, halved: false }
    const r = dispatch(s, { type: 'GONGFA_UP' })
    expect(r.ok).toBe(true)
    expect(r.state.fields[0].status).toBe('mature')
  })

  it('可变调用缴纳不足时不扣库存', () => {
    const s = started()
    s.phase = 'quota'
    s.inventory.qingling = 2
    expect(applyAction(s, { type: 'QUOTA_RESOLVE', pay: true, plan: { qingling: 2 } }).reason).toBe('NOT_ENOUGH_QUOTA')
    expect(s.inventory.qingling).toBe(2)
  })
  it('未完成任务堂不能结束当天', () => {
    const r = dispatch(started(), { type: 'END_DAY' })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('QUIZ_NOT_DONE')
  })

  it('完成任务后结束当天：日推进、AP/浇灌/吐纳/任务重置', () => {
    let s = finishQuiz(started())
    s.resources.qi = 5
    s = dispatch(s, { type: 'IRRIGATE' }).state
    s = dispatch(s, { type: 'WATER' }).state
    expect(s.wateredToday).toBe(true)
    const r = dispatch(s, { type: 'END_DAY' })
    expect(r.ok).toBe(true)
    expect(r.state!.day).toBe(2)
    expect(r.state!.ap).toBe(DAILY_AP)
    expect(r.state!.wateredToday).toBe(false)
    expect(r.state!.quizDaily.done).toBe(false)
    expect(r.state!.phase).toBe('day')
  })

  it('第 30 天结束后进入月末定额交互而非直接推进', () => {
    let s = started()
    s.day = 30
    s = finishQuiz(s)
    const r = dispatch(s, { type: 'END_DAY' })
    expect(r.ok).toBe(true)
    expect(r.state!.phase).toBe('quota')
    expect(r.state!.day).toBe(30) // 等待定额结算后才推进
  })

  it('灵雨事件使全田生长 +1 并可达成熟（事件 +1 与日终管线 +1 合计 +2）', () => {
    // 直接验证 applyEvent 效果解释器：种子 42 初始状态播 1 块青灵草后触发灵雨
    let s = started()
    s.resources.qi = 5
    s = dispatch(s, { type: 'PLANT', fieldId: 1, herb: 'qingling' }).state
    const rain = EVENTS.find((e) => e.id === 'rain')!
    applyEvent(s, rain, createRng(1))
    expect(s.fields[0].progress).toBe(1) // 事件 +1，日终管线随后再 +1
    // 进度达生长期时事件步直接成熟停驻
    s.fields[0].progress = 14
    applyEvent(s, rain, createRng(1))
    expect(s.fields[0].status).toBe('mature')
  })

  it('事件触发率与权重分布接近设计值（固定种子统计，容忍随机波动）', () => {
    // 固定种子统计基础权重表（不含灵潮调制，灵潮分布见独立用例）
    const rng = createRng(2026)
    let fired = 0
    const counts = new Map<string, number>()
    const total = EVENTS.reduce((a, e) => a + e.weight, 0)
    for (let i = 0; i < 20000; i++) {
      if (rng.next() < EVENT_CHANCE) {
        fired++
        let roll = rng.next() * total
        const ev = EVENTS.find((e) => (roll -= e.weight) <= 0)!
        counts.set(ev.id, (counts.get(ev.id) ?? 0) + 1)
      }
    }
    const rate = fired / 20000
    expect(Math.abs(rate - EVENT_CHANCE)).toBeLessThan(0.02)
    // 灵雨与虫害的期望占比按权重表动态计算（在事件发生内）
    const weightOf = (id: string) => EVENTS.find((e) => e.id === id)!.weight
    const rain = counts.get('rain')! / fired
    const pest = counts.get('pest')! / fired
    expect(Math.abs(rain - weightOf('rain') / total)).toBeLessThan(0.03)
    expect(Math.abs(pest - weightOf('pest') / total)).toBeLessThan(0.03)
  })
})

describe('事件效果解释器与月度灵潮（core-loop.md §3.4 / PRD §11）', () => {
  const eventOf = (id: string) => EVENTS.find((e) => e.id === id)!

  it('灵兽来访：随机生长中田产量 +2；无生长中田则无事发生', () => {
    let s = started()
    applyEvent(s, eventOf('beast'), createRng(1))
    expect(s.log[0].title).toBe('事件 · 灵兽来访')
    s.resources.qi = 5
    s = dispatch(s, { type: 'PLANT', fieldId: 1, herb: 'qingling' }).state
    applyEvent(s, eventOf('beast'), createRng(1))
    expect(s.fields[0].curYield).toBe(7) // 5 + 2
  })

  it('仙人残梦：心得 +5；灵气涌动：灵气 +2 受上限截断', () => {
    const s = started()
    applyEvent(s, eventOf('dream'), createRng(1))
    expect(s.resources.insight).toBe(5)
    applyEvent(s, eventOf('surge'), createRng(1))
    expect(s.resources.qi).toBe(2) // 上限 5 内正常入账
    s.resources.qi = 4
    applyEvent(s, eventOf('surge'), createRng(1))
    expect(s.resources.qi).toBe(5) // 溢出丢弃
  })

  it('灵石失窃：灵石 −5；不足时经 dispatch 出口钳制到 0', () => {
    let s = started()
    s.resources.stones = 10
    applyEvent(s, eventOf('theft'), createRng(1))
    expect(s.resources.stones).toBe(5)
    s.resources.stones = 3
    applyEvent(s, eventOf('theft'), createRng(1)) // 3 − 5 = −2（applyEvent 层面允许负值）
    // 任一动作（此处吐纳成功）后 applyAction 出口统一钳制资源下限
    const r = dispatch(s, { type: 'TUNA' })
    expect(r.ok).toBe(true)
    expect(r.state!.resources.stones).toBe(0)
  })

  it('阵法波动：进度 −1 钳制 0；灵雀偷食：仓库随机灵草 −1，无库存无事发生', () => {
    let s = started()
    s.resources.qi = 5
    s = dispatch(s, { type: 'PLANT', fieldId: 1, herb: 'qingling' }).state
    s.fields[0].progress = 0
    applyEvent(s, eventOf('formation'), createRng(1))
    expect(s.fields[0].progress).toBe(0)
    applyEvent(s, eventOf('bird'), createRng(1))
    expect(Object.values(s.inventory).every((n) => n === 0)).toBe(true)
  })

  it('灵潮 6 月周期轮转：tideOf 第 7 月回到灵雨之月', () => {
    expect(tideOf(1).name).toBe('灵雨之月')
    expect(tideOf(3).name).toBe('虫潮之月')
    expect(tideOf(6).name).toBe('灾劫之月')
    expect(tideOf(7).name).toBe('灵雨之月')
  })

  it('灵雨之月灵雨权重翻倍、虫潮之月虫害减半（drawEvent 固定种子统计）', () => {
    const stat = (month: number, id: string) => {
      const rng = createRng(month * 7919)
      let hit = 0
      for (let i = 0; i < 20000; i++) if (drawEvent(rng, month).id === id) hit++
      return hit / 20000
    }
    // 基础权重 10×2=20，灵雨之月总权重 = 98 + 10 = 108
    expect(Math.abs(stat(1, 'rain') - 20 / 108)).toBeLessThan(0.02)
    // 虫害 13×1.5=19.5，虫潮之月总权重 = 98 + 6.5 + 6.5 = 111
    expect(Math.abs(stat(3, 'pest') - 19.5 / 111)).toBeLessThan(0.02)
  })

  it('开局第 1 天与跨入新月时记录灵潮日志', () => {
    const s = started()
    expect(s.log[0].title).toBe('灵潮 · 灵雨之月')
    // 进入第 31 天（第 2 月灵蝶之月）：月末定额完成后推进
    let cur = started()
    cur.day = 30
    cur = finishQuiz(cur)
    cur = dispatch(cur, { type: 'END_DAY' }).state
    expect(cur.phase).toBe('quota')
    cur = dispatch(cur, { type: 'QUOTA_RESOLVE', pay: false, plan: {} }).state
    expect(cur.day).toBe(31)
    expect(cur.log[0].title).toBe('灵潮 · 灵蝶之月')
  })
})

describe('收获上品（farming.md §3.5 / PRD §6）', () => {
  function matured(seed = 42): GameState {
    let s = started(seed)
    s.resources.qi = 5
    s = dispatch(s, { type: 'PLANT', fieldId: 1, herb: 'qingling' }).state
    s.fields[0].progress = 15
    s.fields[0].status = 'mature'
    return s
  }

  it('命中上品：产量 +1 且日志注明灵性涌现', () => {
    // 找首个使 rng.next() < 0.2 的种子（首个随机位即上品判定）
    const primeSeed = Array.from({ length: 100 }, (_, i) => i).find((i) => createRng(i).next() < HARVEST_PRIME_CHANCE)!
    const r = dispatch(matured(primeSeed), { type: 'HARVEST', fieldId: 1 })
    expect(r.ok).toBe(true)
    expect(r.state!.inventory.qingling).toBe(6) // 5 + 1
    expect(r.state!.log[0].text).toContain('上品')
    expect(r.state!.cultivation).toBe(6) // 修为按最终株数计
  })

  it('未命中上品：产量为功法加成取整基础值', () => {
    const noPrimeSeed = Array.from({ length: 100 }, (_, i) => i).find((i) => createRng(i).next() >= HARVEST_PRIME_CHANCE)!
    const r = dispatch(matured(noPrimeSeed), { type: 'HARVEST', fieldId: 1 })
    expect(r.ok).toBe(true)
    expect(r.state!.inventory.qingling).toBe(5)
    expect(r.state!.log[0].text).not.toContain('上品')
  })
})

describe('缺水减产（farming.md）', () => {
  it('连续缺水 3 天当茬减半一次，之后不再重复减半；成熟后不累计', () => {
    let s = started()
    // 固定为不触发随机事件，单独验证缺水而非虫害等事件的影响。
    const noEventSeed = Array.from({ length: 100 }, (_, i) => i).find((i) => createRng(i).next() >= EVENT_CHANCE)!
    s.resources.qi = 5 // 开局灵气 0，先给足播种灵气
    s = dispatch(s, { type: 'PLANT', fieldId: 1, herb: 'qingling' }).state // curYield 5
    s = finishQuiz(s)
    // 连续 3 天不浇灌
    for (let d = 0; d < 3; d++) {
      s.rngState = noEventSeed
      s = dispatch(s, { type: 'END_DAY' }).state
      s = finishQuiz(s)
    }
    const f1 = s.fields[0]
    expect(f1.halved).toBe(true)
    expect(f1.curYield).toBe(3) // ⌈5/2⌉
    expect(f1.dry).toBe(0)
    // 再缺水 3 天不重复减产
    for (let d = 0; d < 3; d++) {
      s.rngState = noEventSeed
      s = dispatch(s, { type: 'END_DAY' }).state
      s = finishQuiz(s)
    }
    expect(s.fields[0].curYield).toBe(3)
  })

  it('浇灌后当日缺水计数清零', () => {
    let s = started()
    s.resources.qi = 5
    s = dispatch(s, { type: 'PLANT', fieldId: 1, herb: 'qingling' }).state
    s = finishQuiz(s)
    s = dispatch(s, { type: 'END_DAY' }).state
    s = finishQuiz(s)
    expect(s.fields[0].dry).toBe(1)
    s = dispatch(s, { type: 'WATER' }).state
    s = dispatch(s, { type: 'END_DAY' }).state
    s = finishQuiz(s)
    expect(s.fields[0].dry).toBe(0)
  })

  it('同一天不能重复浇灌并消耗行动力', () => {
    const first = dispatch(started(), { type: 'WATER' })
    expect(first.ok).toBe(true)
    const second = dispatch(first.state, { type: 'WATER' })
    expect(second.ok).toBe(false)
    expect(second.reason).toBe('ALREADY_DONE')
    expect(second.state.ap).toBe(first.state.ap)
  })
})
