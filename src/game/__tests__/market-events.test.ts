// 市场事件测试（market-events.md，T57）：月中预掷/月初兑现、定向系数解析、委托与定额隔离、存档 v8
import { describe, expect, it } from 'vitest'
import { EVENTS, MARKET_EVENTS, HERB_BY_ID } from '../constants'
import { applyAction, createInitialState } from '../engine'
import { convertRate, eventMultOf } from '../economy'
import * as commissions from '../commissions'
import { SAVE_VERSION, applyMigrations, validate, type SaveData } from '../save'
import type { GameState } from '../types'
import type { Rng } from '../rng'

const stubRng = (v: number): Rng => ({ next: () => v, state: () => 0 })

// 月内推进辅助：END_DAY 到 quota 时用首月免罚放行
function runDays(s: GameState, n: number): GameState {
  for (let i = 0; i < n; i++) {
    if (s.phase === 'quota') {
      applyAction(s, { type: 'QUOTA_RESOLVE', pay: false, plan: {} })
      continue
    }
    applyAction(s, { type: 'END_DAY' })
  }
  return s
}

describe('周期与预告（market-events.md §3.2/§4.1）', () => {
  it('首月无事件（current=null 不公告）；15 日预掷下月事件并公告「坊市风声」', () => {
    const s = createInitialState(1)
    expect(s.market.current).toBeNull()
    runDays(s, 14) // day 1 → 15
    expect(s.market.next).not.toBeNull()
    expect(s.market.current).toBeNull()
    expect(s.log.some((l) => l.title === '坊市风声')).toBe(true)
    expect(s.log.some((l) => l.title.startsWith('坊市行情'))).toBe(false) // 首月无当月公告
  })

  it('预告=必然：月初 current 兑现为 15 日预掷值并公告', () => {
    const s = createInitialState(1)
    runDays(s, 14)
    const promised = s.market.next!
    runDays(s, 16) // 15 轮到 day 30（仍 day 相），第 16 轮 END_DAY 进入 quota
    expect(s.phase).toBe('quota')
    applyAction(s, { type: 'QUOTA_RESOLVE', pay: false, plan: {} }) // 首月免罚放行 → 次月 1 日
    expect(s.market.current).toBe(promised)
    expect(s.market.next).toBeNull()
    expect(s.log.some((l) => l.title === `坊市行情 · ${MARKET_EVENTS.find((e) => e.id === promised)!.name}`)).toBe(true)
  })

  it('同事件不连续两月：预掷排除当月事件', () => {
    const s = createInitialState(1)
    s.market.current = 'alchemyFair'
    s.day = 14
    applyAction(s, { type: 'END_DAY' }) // → day 15 预掷
    expect(s.market.next).not.toBeNull()
    expect(s.market.next).not.toBe('alchemyFair')
  })

  it('入定快进跨 15 日照常预掷（复用 endDay 管线零特判）', () => {
    const s = createInitialState(1)
    s.day = 10
    const r = applyAction(s, { type: 'MEDITATE', days: 10 })
    expect(r.ok).toBe(true)
    expect(s.day).toBe(20)
    expect(s.market.next).not.toBeNull()
    expect(s.log.some((l) => l.title === '坊市风声')).toBe(true)
  })

  it('旧档月中导入：当月无事件，跨月亦不补公告（下月 15 日正常预掷）', () => {
    const s = createInitialState(1)
    s.market.current = null
    s.market.next = null
    s.day = 20
    runDays(s, 12) // → day 30 quota → 首月免罚放行 → 次月 1 日（next 为 null，无公告）
    expect(s.day).toBe(31)
    expect(s.market.current).toBeNull()
    expect(s.log.some((l) => l.title.startsWith('坊市行情'))).toBe(false)
  })
})

describe('行情系数（market-events.md §3.3）', () => {
  it('点名 target：命中草乘系数、其余 ×1', () => {
    const s = createInitialState(1)
    s.market.current = 'alchemyFair'
    expect(eventMultOf(s, 'ninglu')).toBe(1.8)
    expect(eventMultOf(s, 'qingling')).toBe(1)
  })

  it('seasonal：当月适播草命中、异季不命中；灵韵（allSeason）恒命中', () => {
    const s = createInitialState(1) // 第 1 月 = 生发季（sprout）
    s.market.current = 'rainySeason'
    expect(eventMultOf(s, 'qingling')).toBe(0.75) // 适播 sprout
    expect(eventMultOf(s, 'ninglu')).toBe(1) // 适播 grow 异季
    expect(eventMultOf(s, 'jiuye')).toBe(0.75) // allSeason 灵韵
  })

  it('topRealm：境界内最高档命中（同境界取表中靠后者），跨境界动态解析', () => {
    const s = createInitialState(1)
    s.market.current = 'secretRealm'
    expect(eventMultOf(s, 'ninglu')).toBe(1.8) // realm 0：青灵草/凝露花同档取靠后
    expect(eventMultOf(s, 'qingling')).toBe(1)
    s.realm = 3
    expect(eventMultOf(s, 'chisui')).toBe(1.8) // realm ≤3 最高档 = 赤髓参
    expect(eventMultOf(s, 'ziyun')).toBe(1)
  })

  it("'*'：全部草乘系数（坊市淡季）", () => {
    const s = createInitialState(1)
    s.market.current = 'offSeason'
    expect(eventMultOf(s, 'qingling')).toBe(0.85)
    expect(eventMultOf(s, 'jiuye')).toBe(0.85)
  })

  it('无事件月系数恒 1', () => {
    const s = createInitialState(1)
    expect(eventMultOf(s, 'ninglu')).toBe(1)
  })
})

describe('隔离口径（market-events.md §4.3）', () => {
  it('定额折算不受行情影响：缴纳按表价 ÷4 计算', () => {
    const s = createInitialState(1)
    s.day = 30
    s.phase = 'quota'
    s.market.current = 'alchemyFair' // 凝露花卖价 ×1.8
    s.inventory.ninglu = 15
    expect(applyAction(s, { type: 'QUOTA_RESOLVE', pay: true, plan: { ninglu: 15 } }).ok).toBe(true)
    // 折算 = floor(9/4) × 15 = 30（表价口径）；若误乘 1.8 会是 60
    expect(s.month.ledger.at(-1)!.detail).toContain('折算 30 株')
    expect(convertRate(HERB_BY_ID.ninglu)).toBe(2)
  })

  it('委托奖励生成时按表价快照，不受当月行情影响', () => {
    const s = createInitialState(1)
    s.market.current = 'sectPurchase' // 青灵草卖价 ×1.6
    s.realm = 3
    commissions.refreshOnMonthStart(s, stubRng(0)) // stub 0 → 第一个池位青灵草、stones 奖励
    expect(s.commissions.offers[0].herb).toBe('qingling')
    expect(s.commissions.offers[0].reward).toEqual({ kind: 'stones', amount: Math.ceil(HERB_BY_ID.qingling.sell * s.commissions.offers[0].count) })
  })
})

describe('旧机制归置（market-events.md §2）', () => {
  it('「坊市行情」随机事件已移除；pendingTomorrow 不再有 marketMult', () => {
    expect(EVENTS.some((e) => (e.id as string) === 'market')).toBe(false)
    const s = createInitialState(1)
    expect('marketMult' in s.pendingTomorrow).toBe(false)
  })

  it('MARKET_EVENTS 池完整：5 条且 id 唯一、特殊 target 合法', () => {
    expect(MARKET_EVENTS.length).toBe(5)
    expect(new Set(MARKET_EVENTS.map((e) => e.id)).size).toBe(5)
    expect(MARKET_EVENTS.every((e) => e.mult > 0 && e.rumor.length > 0)).toBe(true)
  })
})

describe('存档 v8（market-events.md §3.2）', () => {
  it('v7 档迁移补空市场状态并清理 pendingTomorrow.marketMult 残留', () => {
    const v7 = createInitialState(1)
    ;(v7.pendingTomorrow as Record<string, unknown>).marketMult = 1.5 // 旧档残留
    const migrated = applyMigrations({ version: 7, savedAt: 1, game: v7 } as SaveData)
    expect(migrated.version).toBe(8)
    expect(migrated.game.market).toEqual({ current: null, next: null })
    expect(migrated.game.pendingTomorrow).toEqual({ infusionDouble: undefined })
    expect(validate(migrated.game)).toBeNull()
  })

  it('market 脏值拦截：current/next 非白名单 id 拒绝', () => {
    const dirty = (mutate: (g: GameState) => void) => {
      const g = createInitialState(5)
      mutate(g)
      return validate(g)
    }
    expect(dirty((g) => { (g.market.current as unknown) = 'ghost' })).toBe('BAD_SHAPE')
    expect(dirty((g) => { (g.market.next as unknown) = 'hacker' })).toBe('BAD_SHAPE')
    expect(dirty((g) => { g.market.next = 'sectPurchase' })).toBeNull()
    expect(dirty((g) => { (g as { market?: unknown }).market = undefined })).toBe('BAD_SHAPE')
  })

  it('SAVE_VERSION 升至 8', () => {
    expect(SAVE_VERSION).toBe(8)
  })
})
