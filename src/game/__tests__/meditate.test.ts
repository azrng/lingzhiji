// 入定 UI 助手单测（time-decouple.md）：快照派生、确定性预演（成熟/缺水风险/当日浇灌保护）、
// 结果轨迹与真实 dispatch 同源（同 rngState 确定性一致）
import { describe, expect, it } from 'vitest'
import { createInitialState, dispatch } from '../engine'
import { meditatePreview, meditateRunInfo, meditateSnapshot } from '../meditate'
import type { GameState } from '../types'

// 两块田固定开局：1 号青灵草近熟（3/5，已缺水 1 天）、2 号按用例选青灵草或喜湿的凝露花
function planted(seed = 42, second: 'qingling' | 'ninglu' = 'qingling'): GameState {
  let s = createInitialState(seed)
  s.resources.qi = 5
  s.seeds.ninglu = 1
  s = dispatch(s, { type: 'PLANT', fieldId: 1, herb: 'qingling' }).state
  s = dispatch(s, { type: 'PLANT', fieldId: 2, herb: second }).state
  s.fields[0].progress = 3 // 3/5：入定第 2 天成熟
  s.fields[0].dry = 1 // 已缺水 1 天
  return s
}

describe('meditateSnapshot：从 GameState 派生', () => {
  it('生长中/成熟田块进入快照，空田不进；月末（第 30 日）置 quotaPending', () => {
    const s = planted(42, 'ninglu')
    const snap = meditateSnapshot(s)
    expect(snap.monthDay).toBe(1)
    expect(snap.quotaPending).toBe(false)
    expect(snap.fields.map((f) => f.field)).toEqual([1, 2])
    expect(snap.fields[0]).toMatchObject({ herbName: '青灵草', status: 'growing', progress: 3, days: 5, dryStreak: 1 })
    expect(snap.fields[1]).toMatchObject({ herbName: '凝露花', wet: true }) // 喜湿特质透出
    s.day = 30
    expect(meditateSnapshot(s).quotaPending).toBe(true)
  })
})

describe('meditatePreview：确定性预演（纯数学，不含事件催熟）', () => {
  it('成熟田按剩余天数判定；当日已浇灌则首个日终免缺水', () => {
    const s = planted()
    s.wateredToday = true
    const p = meditatePreview(s, 2)!
    expect(p.newMonthDay).toBe(3)
    expect(p.stoppedAtMonthEnd).toBe(false)
    // 1 号田剩 2 天 ≤ 2 → 预演成熟；2 号田仅 1 个可累计日终，未达 3 天阈值
    expect(p.matured).toEqual([{ field: 1, herbName: '青灵草' }])
    expect(p.dryRisks).toHaveLength(0)
  })

  it('未浇灌时长周期田触发行：2 号田第 3 个日终缺水累计 3 天', () => {
    const s = planted()
    const p = meditatePreview(s, 4)!
    expect(p.dryRisks).toHaveLength(1)
    expect(p.dryRisks[0]).toContain('2 号田青灵草')
    expect(p.dryRisks[0]).toContain('入定第 3 天缺水累计 3 天')
    // 1 号田第 2 天成熟：只有 1 个可累计日终（dry 1→2），无风险
  })

  it('喜湿凝露花免疫缺水：同跨度无风险行', () => {
    const s = planted(42, 'ninglu')
    const p = meditatePreview(s, 6)!
    expect(p.dryRisks).toHaveLength(0)
    // 凝露花 0/7 剩 7 天 > 6：不成熟
    expect(p.matured).toEqual([{ field: 1, herbName: '青灵草' }])
  })

  it('月末（quotaPending）与非法跨度返回 null', () => {
    const s = planted()
    s.day = 30
    expect(meditatePreview(s, 1)).toBeNull()
    s.day = 29
    expect(meditatePreview(s, 2)).toBeNull() // 29 + 2 > 30
    expect(meditatePreview(s, 1.5)).toBeNull()
    expect(meditatePreview(s, 0)).toBeNull()
  })
})

describe('meditateRunInfo：与 dispatch MEDITATE 同源一致', () => {
  it('同一状态下副本轨迹与真实落盘的推进/月末/预告一致', () => {
    const s = planted(9)
    s.day = 26
    const info = meditateRunInfo(s, 4)! // 26 + 4 = 30：月末出关
    const r = dispatch(s, { type: 'MEDITATE', days: 4 })
    expect(r.ok).toBe(true)
    expect(info.advancedDays).toBe(4)
    expect(info.stoppedAtMonthEnd).toBe(true)
    expect(r.state!.day).toBe(30)
    expect(r.state!.phase).toBe('quota')
    // 月末出关不出预告（定额结算接管过渡）
    expect(info.tomorrowHint).toBe('')
  })
})
