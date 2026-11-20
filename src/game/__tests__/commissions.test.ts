// 灵植堂委托引擎用例（cultivation-commissions.md §5）：月份边界、接取上限、跨月保留、
// 库存校验零消耗、交付只奖励一次、放弃无惩罚、0 AP 与月末门控
import { describe, expect, it } from 'vitest'
import { applyAction, createInitialState } from '../engine'
import { snapshot } from '../commissions'
import { HERB_BY_ID, QUOTA_TARGET } from '../constants'
import type { GameState } from '../types'

// 跳到第 2 月第 1 天：月末（day 30）定额交互放弃缴纳 → advanceDay 推进并触发月初委托生成（首月不出）
function month2Start(seed = 3): GameState {
  const s = createInitialState(seed)
  s.day = 30
  s.phase = 'quota'
  applyAction(s, { type: 'QUOTA_RESOLVE', pay: false, plan: {} })
  return s
}

// 再跨一个月（day 60 月末 → 第 3 月初）
function nextMonth(s: GameState): void {
  s.day = 60
  s.phase = 'quota'
  applyAction(s, { type: 'QUOTA_RESOLVE', pay: false, plan: {} })
}

describe('灵植堂委托 · 月初生成', () => {
  it('首月无委托；跨入第 2 月生成 2 份，灵草均在境界可播种池内、互异且 id 唯一', () => {
    expect(createInitialState(3).commissions.offers).toHaveLength(0)
    const s = month2Start(3)
    expect(s.commissions.offers).toHaveLength(2)
    for (const o of s.commissions.offers) {
      expect(s.realm).toBeGreaterThanOrEqual(HERB_BY_ID[o.herb].realm)
      expect(o.count).toBeGreaterThanOrEqual(2)
      expect(o.reward.amount).toBeGreaterThanOrEqual(1)
    }
    expect(new Set(s.commissions.offers.map((o) => o.id)).size).toBe(2)
    expect(new Set(s.commissions.offers.map((o) => o.herb)).size).toBe(2)
    expect(snapshot(s)).toMatchObject({ month: 2, quotaTarget: QUOTA_TARGET, acceptedThisMonth: false, active: null })
  })

  it('数量按 ≈6 株当量折算（±1 株，下限 2）', () => {
    // 多个种子滚动生成，覆盖不同灵草与 ±1 分支
    for (const seed of [3, 7, 11, 19, 23, 31]) {
      const s = month2Start(seed)
      for (const o of s.commissions.offers) {
        const equiv = Math.floor(HERB_BY_ID[o.herb].sell / 4) * o.count
        expect(equiv).toBeGreaterThanOrEqual(5)
      }
    }
  })

  it('T58 防哑弹：灵气不足时奖励排除种子档；灵气足够时种子档照常可出', () => {
    // qi 0（连 1 株青灵草都种不下）：50 个种子滚动第 3 月初刷新，任何 offer 都不得是 seed
    for (const seed of Array.from({ length: 50 }, (_, i) => i + 1)) {
      const s = month2Start(seed)
      s.resources.qi = 0
      s.day = 60
      s.phase = 'quota'
      applyAction(s, { type: 'QUOTA_RESOLVE', pay: false, plan: {} })
      for (const o of s.commissions.offers) {
        expect(o.reward.kind).not.toBe('seed')
      }
    }
    // 灵气充足时 seed 档可出（50 种子里至少一个）
    let seedSeen = false
    for (const seed of Array.from({ length: 50 }, (_, i) => i + 1)) {
      const s = month2Start(seed)
      s.resources.qi = 9
      s.day = 60
      s.phase = 'quota'
      applyAction(s, { type: 'QUOTA_RESOLVE', pay: false, plan: {} })
      if (s.commissions.offers.some((o) => o.reward.kind === 'seed')) seedSeen = true
    }
    expect(seedSeen).toBe(true)
  })
})

describe('灵植堂委托 · 接取', () => {
  it('接取 0 AP、不动任务堂；本月再接/伪造 id 拒绝', () => {
    const s = month2Start(5)
    const ap = s.ap
    const quizDone = s.quizDaily.done
    expect(applyAction(s, { type: 'COMMISSION_ACCEPT', offerId: 'nope' }).reason).toBe('INVALID_TARGET')
    const offer = s.commissions.offers[0]
    expect(applyAction(s, { type: 'COMMISSION_ACCEPT', offerId: offer.id }).ok).toBe(true)
    expect(s.commissions.active?.id).toBe(offer.id)
    expect(s.commissions.acceptedThisMonth).toBe(true)
    expect(s.ap).toBe(ap)
    expect(s.quizDaily.done).toBe(quizDone)
    expect(applyAction(s, { type: 'COMMISSION_ACCEPT', offerId: s.commissions.offers[1].id }).reason).toBe('NOT_ELIGIBLE')
  })

  it('月末定额交互中委托动作被 phase 门控拒绝', () => {
    const s = month2Start(5)
    s.phase = 'quota'
    expect(applyAction(s, { type: 'COMMISSION_ACCEPT', offerId: s.commissions.offers[0].id }).reason).toBe('INVALID_TARGET')
    expect(applyAction(s, { type: 'COMMISSION_DELIVER' }).reason).toBe('INVALID_TARGET')
  })
})

describe('灵植堂委托 · 交付', () => {
  it('库存不足零副作用（含 rngState，状态逐字节不变）', () => {
    const s = month2Start(9)
    const offer = s.commissions.offers[0]
    applyAction(s, { type: 'COMMISSION_ACCEPT', offerId: offer.id })
    s.inventory[offer.herb] = offer.count - 1
    const before = JSON.stringify(s)
    const r = applyAction(s, { type: 'COMMISSION_DELIVER' })
    expect(r.reason).toBe('NO_HERB')
    expect(JSON.stringify(s)).toBe(before)
  })

  it('成功交付一次性扣草发奖（按奖励类型入账），再交付拒绝', () => {
    const s = month2Start(9)
    const offer = s.commissions.offers[0]
    applyAction(s, { type: 'COMMISSION_ACCEPT', offerId: offer.id })
    s.inventory[offer.herb] = offer.count + 3
    const resBefore = { ...s.resources }
    const seedsBefore = { ...s.seeds }
    expect(applyAction(s, { type: 'COMMISSION_DELIVER' }).ok).toBe(true)
    expect(s.inventory[offer.herb]).toBe(3)
    if (offer.reward.kind === 'seed') {
      expect(s.seeds[offer.reward.herb]).toBe(seedsBefore[offer.reward.herb] + offer.reward.amount)
    } else {
      expect(s.resources[offer.reward.kind]).toBe(resBefore[offer.reward.kind] + offer.reward.amount)
    }
    expect(s.commissions.active).toBeNull()
    expect(s.commissions.acceptedThisMonth).toBe(true)
    expect(applyAction(s, { type: 'COMMISSION_DELIVER' }).reason).toBe('NOT_ELIGIBLE')
  })
})

describe('灵植堂委托 · 放弃与跨月', () => {
  it('放弃无惩罚不扣库存；资格不退还（本月不能再接其他选项）', () => {
    const s = month2Start(13)
    const offer = s.commissions.offers[0]
    applyAction(s, { type: 'COMMISSION_ACCEPT', offerId: offer.id })
    s.inventory[offer.herb] = 5
    const before = JSON.stringify({ inv: s.inventory, res: s.resources, seeds: s.seeds })
    expect(applyAction(s, { type: 'COMMISSION_ABANDON' }).ok).toBe(true)
    expect(JSON.stringify({ inv: s.inventory, res: s.resources, seeds: s.seeds })).toBe(before)
    expect(s.commissions.active).toBeNull()
    expect(s.commissions.acceptedThisMonth).toBe(true)
    expect(applyAction(s, { type: 'COMMISSION_ACCEPT', offerId: s.commissions.offers[1].id }).reason).toBe('NOT_ELIGIBLE')
    expect(applyAction(s, { type: 'COMMISSION_ABANDON' }).reason).toBe('NOT_ELIGIBLE')
  })

  it('跨月：活跃委托保留、选项换新、资格重置；active 占位仍不可接新单', () => {
    const s = month2Start(17)
    const offer = s.commissions.offers[0]
    applyAction(s, { type: 'COMMISSION_ACCEPT', offerId: offer.id })
    const oldIds = s.commissions.offers.map((o) => o.id)
    nextMonth(s)
    expect(s.commissions.active?.id).toBe(offer.id)
    expect(s.commissions.acceptedThisMonth).toBe(false)
    expect(s.commissions.offers).toHaveLength(2)
    expect(s.commissions.offers.every((o) => o.id.startsWith('m3-'))).toBe(true)
    expect(s.commissions.offers.map((o) => o.id)).not.toEqual(oldIds)
    expect(applyAction(s, { type: 'COMMISSION_ACCEPT', offerId: s.commissions.offers[0].id }).reason).toBe('NOT_ELIGIBLE')
    // 交付跨月委托正常结算（活跃不因跨月过期）
    s.inventory[offer.herb] = offer.count
    expect(applyAction(s, { type: 'COMMISSION_DELIVER' }).ok).toBe(true)
  })
})
