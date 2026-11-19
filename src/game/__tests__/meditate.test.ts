// 入定 UI 助手单测（time-decouple.md §3，T54 修订口径）：快照派生、确定性预演（成熟/闭关纳灵）、
// 结果轨迹与真实 dispatch 同源（同 rngState 确定性一致）；
// 引擎侧口径：入定闭关灵泉阵护田不缺水（applyDrought dryExempt）+ 每满 3 天聚 1 灵气（上限截断）
import { describe, expect, it } from 'vitest'
import { createInitialState, dispatch } from '../engine'
import { MEDITATE_QI_EVERY } from '../constants'
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
  it('成熟田按剩余天数判定；闭关纳灵按满 3 天计 1 点', () => {
    const s = planted()
    s.resources.qi = 0
    const p = meditatePreview(s, 2)!
    expect(p.newMonthDay).toBe(3)
    expect(p.stoppedAtMonthEnd).toBe(false)
    // 1 号田剩 2 天 ≤ 2 → 预演成熟；2 天 < 3 → 无聚灵
    expect(p.matured).toEqual([{ field: 1, herbName: '青灵草' }])
    expect(p.qiGain).toBe(0)
  })

  it('聚灵随跨度增长且受灵气上限截断', () => {
    const s = planted(42, 'ninglu')
    s.resources.qi = 0
    expect(meditatePreview(s, 3)!.qiGain).toBe(1) // 3/3 = 1
    expect(meditatePreview(s, 7)!.qiGain).toBe(2) // 7/3 = 2
    // 练气一层上限 5：qi 4 时最多再入 1（27 天应得 9，截断为 1）
    s.resources.qi = 4
    expect(meditatePreview(s, 27)!.qiGain).toBe(1)
    // 灵气已满：不再聚灵
    s.resources.qi = 5
    expect(meditatePreview(s, 7)!.qiGain).toBe(0)
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

describe('入定引擎口径（T54）：灵泉阵护田 + 闭关纳灵', () => {
  it('入定 4 天不累计缺水、不减产（换旧口径下第 3 天必减半的场景）', () => {
    const s = planted() // 2 号田青灵草 0/5：4 天无浇灌，旧口径第 3 天即减半
    s.resources.qi = 0
    const r = dispatch(s, { type: 'MEDITATE', days: 4 })
    expect(r.ok).toBe(true)
    const f2 = r.state!.fields[1]
    expect(f2.status).toBe('growing') // 4/5 仍在长
    expect(f2.dry).toBe(0) // 入定前 0，4 天无浇灌也不累计
    expect(f2.halved).toBe(false)
    expect(f2.curYield).toBeGreaterThanOrEqual(4) // 当令 6；虫害 −1 也 ≥5，减半则 ≤3
    expect(r.state!.log.some((l) => l.title === '缺水减产')).toBe(false)
    expect(r.state!.log.some((l) => l.title === '今日未浇灌')).toBe(false)
  })

  it('带着缺水 2 天入定不恶化：出关后 dry 保持 2（随后手动日再累计）', () => {
    const s = planted(7) // 2 号田青灵草（非喜湿，缺水口径真实生效）
    s.fields[1].dry = 2
    const r = dispatch(s, { type: 'MEDITATE', days: 3 })
    expect(r.ok).toBe(true)
    expect(r.state!.fields[1].dry).toBe(2)
    expect(r.state!.fields[1].halved).toBe(false)
  })

  it('闭关纳灵：每满 3 天 +1（floor），走 gainQi 上限截断', () => {
    const s = planted(9)
    s.resources.qi = 1
    const r = dispatch(s, { type: 'MEDITATE', days: 7 })
    expect(r.ok).toBe(true)
    expect(Math.floor(7 / MEDITATE_QI_EVERY)).toBe(2)
    expect(r.state!.resources.qi).toBe(3) // 1 + 2
    // 摘要日志带聚灵
    expect(r.state!.log.some((l) => l.title.startsWith('入定 7 天') && l.text.includes('聚灵 +2'))).toBe(true)
    // 灵气近满时截断
    const s2 = planted(11)
    s2.resources.qi = 4
    const r2 = dispatch(s2, { type: 'MEDITATE', days: 7 })
    expect(r2.state!.resources.qi).toBe(5) // 4 + 2 截断到上限 5
  })
})

describe('meditateRunInfo：与 dispatch MEDITATE 同源一致', () => {
  it('同一状态下副本轨迹与真实落盘的推进/月末/聚灵/预告一致', () => {
    const s = planted(9)
    s.resources.qi = 0
    s.day = 26
    const info = meditateRunInfo(s, 4)! // 26 + 4 = 30：月末出关
    const r = dispatch(s, { type: 'MEDITATE', days: 4 })
    expect(r.ok).toBe(true)
    expect(info.advancedDays).toBe(4)
    expect(info.stoppedAtMonthEnd).toBe(true)
    expect(info.qiGain).toBe(1) // floor(4/3)
    expect(r.state!.resources.qi).toBe(1)
    expect(r.state!.day).toBe(30)
    expect(r.state!.phase).toBe('quota')
    // 月末出关不出预告（定额结算接管过渡）
    expect(info.tomorrowHint).toBe('')
  })
})
