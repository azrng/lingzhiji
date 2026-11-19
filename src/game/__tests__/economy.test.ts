// 经济单测：折算取整方向、欠缴与收田、应急领种谓词（PRD §9/§10/§16.6）
import { describe, expect, it } from 'vitest'
import { convertRate, seedPrice } from '../economy'
import { dispatch, createInitialState } from '../engine'

describe('取整方向（economy.md）', () => {
  it('定额折算 ⌊售价÷4⌋ 向下取整', () => {
    expect(convertRate({ id: 'qingling', name: '', price: 5, realm: 0, qi: 1, days: 15, yield: 5, sell: 4, exp: 1, seasons: [] })).toBe(1)
    expect(convertRate({ id: 'ziyun', name: '', price: 40, realm: 2, qi: 2, days: 30, yield: 3, sell: 35, exp: 3, seasons: [] })).toBe(8)
    expect(convertRate({ id: 'longxue', name: '', price: 180, realm: 6, qi: 3, days: 50, yield: 2, sell: 210, exp: 10, seasons: [] })).toBe(52)
    expect(convertRate({ id: 'jiuye', name: '', price: 260, realm: 8, qi: 3, days: 60, yield: 2, sell: 290, exp: 10, seasons: [] })).toBe(72)
  })

  it('练气六层起种子 9 折向上取整；练气一层原价', () => {
    const s = createInitialState(1)
    expect(seedPrice(s, 'ninglu')).toBe(12)
    const six = { ...s, realm: 5 }
    expect(seedPrice(six, 'ninglu')).toBe(Math.ceil(12 * 0.9)) // 11
    const cheap = { ...s, realm: 5 }
    expect(seedPrice(cheap, 'qingling')).toBe(Math.ceil(5 * 0.9)) // 5
  })

  it('行情系数向下取整且最低 1（T57 月度市场事件）', () => {
    // 低行情：坊市淡季全部草 ×0.85
    const s = createInitialState(1)
    s.inventory.qingling = 10
    s.market.current = 'offSeason'
    const r = dispatch(s, { type: 'SELL_HERB', herb: 'qingling', count: 1 })
    expect(r.ok).toBe(true)
    expect(r.state!.resources.stones).toBe(50 + Math.max(1, Math.floor(4 * 0.85))) // 3
    // 高行情：炼丹大会凝露花 ×1.8
    const s2 = createInitialState(1)
    s2.inventory.ninglu = 1
    s2.market.current = 'alchemyFair'
    const r2 = dispatch(s2, { type: 'SELL_HERB', herb: 'ninglu', count: 1 })
    expect(r2.state!.resources.stones).toBe(50 + Math.floor(9 * 1.8)) // 16
    // 未命中草不受事件影响
    const s3 = createInitialState(1)
    s3.inventory.qingling = 1
    s3.market.current = 'alchemyFair'
    const r3 = dispatch(s3, { type: 'SELL_HERB', herb: 'qingling', count: 1 })
    expect(r3.state!.resources.stones).toBe(50 + 4) // 表价
  })

  it('出售数量不足返回 NO_HERB 且资源不变', () => {
    const s = createInitialState(1)
    const r = dispatch(s, { type: 'SELL_HERB', herb: 'qingling', count: 1 })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('NO_HERB')
  })
})

describe('月末定额与欠缴（economy.md §3.4）', () => {
  // 月末交互前必须先完成当日任务（END_DAY 门控）
  function finishQuiz(s: ReturnType<typeof createInitialState>): ReturnType<typeof createInitialState> {
    s = dispatch(s, { type: 'QUIZ_BEGIN' }).state
    s = dispatch(s, { type: 'QUIZ_LEARNED' }).state
    const session = s.quizDaily.session!
    for (let i = 0; i < 10; i++) {
      s = dispatch(s, { type: 'QUIZ_ANSWER', choice: session.questions[i].opts[0] }).state
      s = dispatch(s, { type: 'QUIZ_NEXT' }).state
    }
    return dispatch(s, { type: 'QUIZ_CONFIRM' }).state
  }

  function atDay30(seed = 5): ReturnType<typeof createInitialState> {
    let s = createInitialState(seed)
    s.day = 30
    s.inventory.qingling = 20
    s = finishQuiz(s)
    return s
  }

  it('足额缴纳：扣库存、贡献 +10、连续欠缴清零、推进到下月', () => {
    let s = atDay30()
    s.month.unpaidStreak = 1
    s = dispatch(s, { type: 'END_DAY' }).state
    expect(s.phase).toBe('quota')
    const r = dispatch(s, { type: 'QUOTA_RESOLVE', pay: true, plan: { qingling: 15 } })
    expect(r.ok).toBe(true)
    expect(r.state!.inventory.qingling).toBe(5)
    expect(r.state!.resources.contribution).toBe(10)
    expect(r.state!.month.unpaidStreak).toBe(0)
    expect(r.state!.day).toBe(31)
    expect(r.state!.phase).toBe('day')
  })

  it('折算不足 15 株时缴纳被拒', () => {
    let s = atDay30()
    s.inventory.qingling = 10
    s = dispatch(s, { type: 'END_DAY' }).state
    const r = dispatch(s, { type: 'QUOTA_RESOLVE', pay: true, plan: { qingling: 10 } })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('NOT_ENOUGH_QUOTA')
  })

  it('折算缴纳支持高阶灵草替代（紫云芝 1 株 = 8 株当量）', () => {
    let s = atDay30()
    s.realm = 2
    s.inventory.ziyun = 2
    s.inventory.qingling = 0
    s = dispatch(s, { type: 'END_DAY' }).state
    const r = dispatch(s, { type: 'QUOTA_RESOLVE', pay: true, plan: { ziyun: 2 } })
    expect(r.ok).toBe(true)
    expect(r.state!.inventory.ziyun).toBe(0)
  })

  it('次月欠缴：贡献 −20 灵石 −10 下限截断；连续两月收回 1 块田（优先空田）', () => {
    let s = atDay30()
    s.month.unpaidStreak = 1
    s.day = 60 // 第 2 月月末（第 60 天）
    // 1 号田有作物，2、3 号空 → 必须优先收空田（progress 3：END_DAY 生长 +1 后 4/5 仍在长）
    s.fields[0].status = 'growing'
    s.fields[0].herb = 'qingling'
    s.fields[0].progress = 3
    s.fields[0].curYield = 5
    s.fields[0].dry = 0
    s.fields[0].halved = false
    s = dispatch(s, { type: 'END_DAY' }).state
    const r = dispatch(s, { type: 'QUOTA_RESOLVE', pay: false, plan: {} })
    expect(r.ok).toBe(true)
    expect(r.state!.resources.contribution).toBe(0) // 0−20 截断
    expect(r.state!.resources.stones).toBe(40) // 50−10
    const conf = r.state!.fields.filter((f) => f.status === 'confiscated')
    expect(conf.length).toBe(1)
    expect(conf[0].id).not.toBe(1) // 不得收有作物的田
    expect(r.state!.fields[0].status).toBe('growing') // 1 号保持
  })

  it('无空田时收回有作物的田并退还种子、当茬清空', () => {
    let s = atDay30()
    s.month.unpaidStreak = 1
    s.day = 60
    for (const f of s.fields) {
      f.status = 'growing'
      f.herb = 'qingling'
      f.progress = 3
      f.curYield = 5
      f.dry = 0
      f.halved = false
    }
    s = dispatch(s, { type: 'END_DAY' }).state
    const r = dispatch(s, { type: 'QUOTA_RESOLVE', pay: false, plan: {} })
    const conf = r.state!.fields.find((f) => f.status === 'confiscated')!
    expect(conf.refundSeed).toBe('qingling')
    expect(r.state!.seeds.qingling).toBe(3 + 1) // 初始 3 + 退还 1
  })

  it('仅剩 1 块田时不收田但仍清零欠缴', () => {
    let s = atDay30()
    s.fields = [s.fields[0]] // 只留 1 块
    s.month.unpaidStreak = 1
    s.day = 60
    s = dispatch(s, { type: 'END_DAY' }).state
    const r = dispatch(s, { type: 'QUOTA_RESOLVE', pay: false, plan: {} })
    expect(r.state!.fields.every((f) => f.status !== 'confiscated')).toBe(true)
    expect(r.state!.month.unpaidStreak).toBe(0)
  })

  it('赎回：100 贡献，田回 empty', () => {
    let s = atDay30()
    s = dispatch(s, { type: 'END_DAY' }).state
    s = dispatch(s, { type: 'QUOTA_RESOLVE', pay: false, plan: {} }).state // 首月免罚但不收田
    // 直接构造被收回田场景
    s.fields[0].status = 'confiscated'
    s.resources.contribution = 150
    const r = dispatch(s, { type: 'RECLAIM', fieldId: 1 })
    expect(r.ok).toBe(true)
    expect(r.state!.resources.contribution).toBe(50)
    expect(r.state!.fields[0].status).toBe('empty')
  })

  it('有被收回田时不可开荒（不可绕过赎回成本）', () => {
    let s = createInitialState(1)
    s.fields[0].status = 'confiscated'
    const r = dispatch(s, { type: 'RECLAIM_LAND' })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('HAS_CONFISCATED')
  })
})

describe('应急领种（economy.md §3.2）', () => {
  it('灵田部分被收回时，仍可在剩余空田领种恢复', () => {
    const s = createInitialState(1)
    s.fields[0].status = 'confiscated'
    s.seeds.qingling = 0
    s.resources.stones = 0
    const r = dispatch(s, { type: 'EMERGENCY_SEED' })
    expect(r.ok).toBe(true)
    expect(r.state.seeds.qingling).toBe(1)
    expect(dispatch(r.state, { type: 'EMERGENCY_SEED' }).ok).toBe(false)
  })

  it('已有作物或没有可用空田时不能领种', () => {
    const s = createInitialState(1)
    s.seeds.qingling = 0
    s.resources.stones = 0
    s.fields[0] = { id: 1, status: 'growing', herb: 'qingling', progress: 0, curYield: 5, dry: 0, halved: false, fertility: 1 }
    expect(dispatch(s, { type: 'EMERGENCY_SEED' }).ok).toBe(false)
    s.fields.forEach((field) => { field.status = 'confiscated' })
    expect(dispatch(s, { type: 'EMERGENCY_SEED' }).ok).toBe(false)
  })

  it('全空田 + 无库存 + 无可种种子 + 买不起最便宜可种种子 → 可领 1 枚青灵草种', () => {
    let s = createInitialState(1)
    s.seeds = { qingling: 0, ninglu: 0, ziyun: 0, chisui: 0, longxue: 0, jiuye: 0 }
    s.resources.stones = 4
    const r = dispatch(s, { type: 'EMERGENCY_SEED' })
    expect(r.ok).toBe(true)
    expect(r.state!.seeds.qingling).toBe(1)
  })

  it('只持有高境界种子时仍可领（可种判断只看境界不看灵气）', () => {
    let s = createInitialState(1)
    s.seeds = { qingling: 0, ninglu: 0, ziyun: 1, chisui: 0, longxue: 0, jiuye: 0 }
    s.resources.stones = 100 // 买得起青灵草（5 灵石）→ 不满足谓词
    let r = dispatch(s, { type: 'EMERGENCY_SEED' })
    expect(r.ok).toBe(false)
    s.resources.stones = 4 // 买不起才可领
    r = dispatch(s, { type: 'EMERGENCY_SEED' })
    // 练气一层看紫云芝：realm 0 < 2 不可种 → 有可种种子为 false，青灵草 5 > 4 买不起 → 可领
    expect(r.ok).toBe(true)
    expect(r.state!.seeds.qingling).toBe(1)
  })

  it('持有可种种子后不再发种', () => {
    let s = createInitialState(1)
    s.seeds.qingling = 0
    s.seeds.ninglu = 1 // 凝露花练气一层可种
    const r = dispatch(s, { type: 'EMERGENCY_SEED' })
    expect(r.ok).toBe(false)
  })
})

// 固定种子复现性：同种子同动作序列结果一致（architecture.md §6）
describe('可播种随机数', () => {
  it('同种子两局 END_DAY 结果一致', () => {
    const run = (seed: number) => {
      let s = createInitialState(seed)
      s = dispatch(s, { type: 'QUIZ_BEGIN' }).state
      s = dispatch(s, { type: 'QUIZ_LEARNED' }).state
      const q = s.quizDaily.session!
      for (let i = 0; i < 10; i++) {
        s = dispatch(s, { type: 'QUIZ_ANSWER', choice: q.questions[i].meaning }).state
        s = dispatch(s, { type: 'QUIZ_NEXT' }).state
      }
      s = dispatch(s, { type: 'QUIZ_CONFIRM' }).state
      return dispatch(s, { type: 'END_DAY' }).state
    }
    const a = run(99)
    const b = run(99)
    expect(a).toEqual(b)
  })
})
