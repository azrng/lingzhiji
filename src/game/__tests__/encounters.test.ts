// 奇遇系统测试（encounters.md，T55）：掷取档位阈值/冷却/限次、效果边界、兑现管线、预告必兑现、存档 v7
import { describe, expect, it } from 'vitest'
import { ENCOUNTERS, ENCOUNTER_BY_ID, ENCOUNTER_COOLDOWN, ENCOUNTER_P } from '../constants'
import { applyAction, applyEncounter, createInitialState, rollEncounter } from '../engine'
import { applyMigrations, validate } from '../save'
import type { SaveData } from '../save'
import type { Rng } from '../rng'
import type { GameState } from '../types'

// 恒定掷值桩：tier 判定与池内 pick 都用同一常量
const stubRng = (v: number): Rng => ({ next: () => v, state: () => 0 })
// 序列掷值桩：第 1 次掷值定档位、第 2 次定池内位置（tier 与 pick 共用同一 Rng 流）
const seqRng = (...vals: number[]): Rng => {
  let i = 0
  return { next: () => vals[Math.min(i++, vals.length - 1)], state: () => 0 }
}

describe('掷取（encounters.md §3.2）', () => {
  it('档位阈值顺序判定：<0.10 普通 / <0.14 特殊 / <0.15 传说 / 其余无', () => {
    const s = createInitialState(1)
    expect(rollEncounter(s, stubRng(0.05))!.tier).toBe('common')
    expect(rollEncounter(s, stubRng(0.12))!.tier).toBe('special')
    expect(rollEncounter(s, stubRng(0.145))!.tier).toBe('legendary')
    expect(rollEncounter(s, stubRng(0.2))).toBeNull()
  })

  it('档内排除冷却中条目与已用传说；池空无事（不降级不顺延）', () => {
    // 第 1 掷 0.05 → 普通档；第 2 掷 0.5 → 3 条池取第 2 位（stoneVein）
    const s = createInitialState(1)
    expect(rollEncounter(s, seqRng(0.05, 0.5))!.id).toBe('stoneVein')
    s.encounter.cooldowns.stoneVein = 100
    expect(rollEncounter(s, seqRng(0.05, 0.5))!.id).toBe('wandererTrade') // 排除后 2 条池取第 2 位
    const s2 = createInitialState(1)
    s2.encounter.seenOnce = ['masterCave']
    expect(rollEncounter(s2, stubRng(0.145))!.id).toBe('ancientSpring') // 传说池排除后仅剩 1 条
    s2.encounter.seenOnce = ['masterCave', 'ancientSpring']
    expect(rollEncounter(s2, stubRng(0.145))).toBeNull() // 传说全用尽：无事发生
  })

  it('阈值与常量一致（防调参后测试悄悄失真）', () => {
    expect(ENCOUNTER_P).toEqual({ common: 0.1, special: 0.04, legendary: 0.01 })
    expect(ENCOUNTER_COOLDOWN).toBe(7)
    expect(ENCOUNTERS.filter((e) => e.tier === 'special' || e.tier === 'legendary').every((e) => typeof e.hint === 'string')).toBe(true)
    expect(ENCOUNTERS.filter((e) => e.tier === 'common').every((e) => e.hint === undefined)).toBe(true)
  })
})

describe('兑现（encounters.md §3.1）', () => {
  it('特殊档兑现置冷却 day+7；传说档留痕限次且效果入账', () => {
    const s = createInitialState(1)
    s.day = 10
    applyEncounter(s, ENCOUNTER_BY_ID.hermitSeeds, stubRng(0.5))
    expect(s.encounter.cooldowns.hermitSeeds).toBe(10 + ENCOUNTER_COOLDOWN)
    expect(s.encounter.seenOnce).toEqual([])
    const s2 = createInitialState(1)
    applyEncounter(s2, ENCOUNTER_BY_ID.masterCave, stubRng(0.5))
    expect(s2.encounter.seenOnce).toEqual(['masterCave'])
    expect(s2.cultivation).toBe(25)
    expect(s2.resources.insight).toBe(15)
    expect(s2.encounter.cooldowns.masterCave).toBe(1 + ENCOUNTER_COOLDOWN) // day 1 兑现 → 可复用日 8
  })

  it('普通档不置冷却不留痕，效果照常入账', () => {
    const s = createInitialState(1)
    const stones = s.resources.stones
    applyEncounter(s, ENCOUNTER_BY_ID.stoneVein, stubRng(0.5))
    expect(s.encounter.cooldowns).toEqual({})
    expect(s.encounter.seenOnce).toEqual([])
    expect(s.resources.stones).toBe(stones + 15)
  })

  it('兑现日志带档位 emoji 与「奇遇 ·」前缀', () => {
    const s = createInitialState(1)
    applyEncounter(s, ENCOUNTER_BY_ID.buriedCache, stubRng(0.5))
    expect(s.log[0].title).toBe('奇遇 · 掘得遗藏')
    expect(s.log[0].icon).toBe('🌟')
  })
})

describe('效果边界（encounters.md §3.4/§5）', () => {
  it('hermitSeeds topRealm 按当前境界解析最高档种子（同境界取表中靠后者）', () => {
    const s = createInitialState(1)
    s.realm = 3
    applyEncounter(s, ENCOUNTER_BY_ID.hermitSeeds, stubRng(0.5))
    expect(s.seeds.jinling).toBe(2) // realm ≤3 内最高档 = 金铃藤（同境界取表中靠后者）
    expect(s.seeds.jiuye).toBe(0) // 越界灵草不入手
    const s0 = createInitialState(1)
    const qlBefore = s0.seeds.qingling
    applyEncounter(s0, ENCOUNTER_BY_ID.hermitSeeds, stubRng(0.5))
    expect(s0.seeds.ninglu).toBe(2) // realm 0：青灵草/凝露花同档，取表中靠后
    expect(s0.seeds.qingling).toBe(qlBefore) // 开局自带种子不动
  })

  it('wandererTrade 仓库空整体无事（bundle 首段无目标中止后续）', () => {
    const s = createInitialState(1)
    const before = JSON.stringify(s.inventory)
    applyEncounter(s, ENCOUNTER_BY_ID.wandererTrade, stubRng(0.5))
    expect(JSON.stringify(s.inventory)).toBe(before)
    expect(s.log[0].text).toContain('仓库空空如也')
  })

  it('wandererTrade 有库存时随机换株（一减一增，总量守恒）', () => {
    const s = createInitialState(1)
    s.inventory.qingling = 3
    applyEncounter(s, ENCOUNTER_BY_ID.wandererTrade, stubRng(0.5))
    const total = Object.values(s.inventory).reduce((a, b) => a + b, 0)
    expect(total).toBe(3)
  })

  it('T62 境界内随机：inventory 增量只落境界可种草（高阶现货不再白送，种植阶梯不被抄近道）', () => {
    // realm 0：穷举种子 200 次，灵雀引路（+2）目标只能是青灵草/凝露花
    const seen = new Set<string>()
    for (let seed = 1; seed <= 200; seed++) {
      const s = createInitialState(seed)
      applyEncounter(s, ENCOUNTER_BY_ID.sparrowGuide, { next: () => 0.5, state: () => 0 })
      for (const id of Object.keys(s.inventory)) {
        if (id !== 'qingling' && s.inventory[id as keyof typeof s.inventory] > 0) seen.add(id)
      }
    }
    expect([...seen].every((id) => id === 'ninglu')).toBe(true) // realm 0 池 = 青灵草/凝露花
    // realm 3：池扩展到境界内四草
    const s3 = createInitialState(1)
    s3.realm = 3
    applyEncounter(s3, ENCOUNTER_BY_ID.sparrowGuide, { next: () => 0.9, state: () => 0 })
    const gained = Object.entries(s3.inventory).filter(([id, n]) => n > 0 && !['qingling', 'ninglu'].includes(id)).map(([id]) => id)
    expect(gained.every((id) => ['ziyun', 'chisui', 'jinling'].includes(id))).toBe(true)
  })

  it('fieldMutation 置随机生长中田保底标记；无生长中田无事', () => {
    const s = createInitialState(1)
    applyEncounter(s, ENCOUNTER_BY_ID.fieldMutation, stubRng(0.5))
    expect(s.fields.every((f) => !f.mutationGuaranteed)).toBe(true)
    expect(s.log[0].text).toContain('田里没有生长中的灵草')
    s.resources.qi = 5
    expect(applyAction(s, { type: 'PLANT', fieldId: 1, herb: 'qingling' }).ok).toBe(true)
    applyEncounter(s, ENCOUNTER_BY_ID.fieldMutation, stubRng(0.5))
    expect(s.fields[0].mutationGuaranteed).toBe(true)
  })

  it('收获消费保底标记：额外 +1 株且不跨茬继承（换茬清除）', () => {
    const s = createInitialState(1)
    s.resources.qi = 5
    applyAction(s, { type: 'PLANT', fieldId: 1, herb: 'qingling' })
    s.fields[0].progress = 5
    s.fields[0].status = 'mature'
    s.fields[0].curYield = 6
    s.fields[0].mutationGuaranteed = true
    const invBefore = s.inventory.qingling
    expect(applyAction(s, { type: 'HARVEST', fieldId: 1 }).ok).toBe(true)
    // base 6 + 保底 1；上品 20% 随机，下界 = 7
    expect(s.inventory.qingling).toBeGreaterThanOrEqual(invBefore + 7)
    expect(s.log[0].text).toContain('异变灵株')
    expect(s.fields[0].mutationGuaranteed).toBeUndefined() // 收获重建田对象，标记清除
    // 换茬清除：置标记后重新播种，标记消失
    s.fields[0].mutationGuaranteed = true
    s.resources.qi = 5
    applyAction(s, { type: 'PLANT', fieldId: 1, herb: 'qingling' })
    expect(s.fields[0].mutationGuaranteed).toBeUndefined()
  })
})

describe('管线集成（encounters.md §3.1/§4.1）', () => {
  it('月末（第 30 日）不掷新队不出预告；已入队者照常兑现', () => {
    const s = createInitialState(1)
    s.day = 30
    s.encounter.queued = 'stoneVein'
    const stones = s.resources.stones
    expect(applyAction(s, { type: 'END_DAY' }).ok).toBe(true)
    expect(s.resources.stones).toBe(stones + 15)
    expect(s.phase).toBe('quota')
    expect(s.log[0].title).toBe('月末已至')
    expect(s.log.some((l) => l.title === '明日预告')).toBe(false)
    expect(s.encounter.queued).toBeNull()
  })

  it('预告必兑现：伏笔文案出现的次日必有对应奇遇日志（40 种子属性测试）', () => {
    const hinted = ENCOUNTERS.filter((e) => e.hint)
    for (let seed = 1; seed <= 40; seed++) {
      let s = createInitialState(seed)
      for (let d = 0; d < 25 && s.phase === 'day'; d++) {
        const prevHint = s.log.find((l) => l.title === '明日预告')?.text // 日志新在前 = 昨日夜预告
        applyAction(s, { type: 'END_DAY' })
        const promised = hinted.find((e) => e.hint === prevHint)
        if (promised) expect(s.log.some((l) => l.title === `奇遇 · ${promised.name}`)).toBe(true)
      }
    }
  })

  it('同存档同种子结果可复现（rngState 确定性）', () => {
    const run = () => {
      const s = createInitialState(77)
      for (let d = 0; d < 12; d++) applyAction(s, { type: 'END_DAY' })
      return { encounter: s.encounter, day: s.day, stones: s.resources.stones }
    }
    expect(run()).toEqual(run())
  })
})

describe('存档 v7（encounters.md §3.5）', () => {
  it('v6 档迁移补空奇遇状态且校验通过（经完整链升到当前版本 v9）', () => {
    const v6 = { version: 6, savedAt: 1, game: createInitialState(1) } as SaveData
    const migrated = applyMigrations(v6)
    expect(migrated.version).toBe(9)
    expect(migrated.game.encounter).toEqual({ queued: null, cooldowns: {}, seenOnce: [] })
    expect(validate(migrated.game)).toBeNull()
  })

  it('奇遇脏值拦截：入队 id 白名单 / 冷却键白名单 / 传说记录重复', () => {
    const dirty = (mutate: (g: GameState) => void) => {
      const g = createInitialState(5)
      mutate(g)
      return validate(g)
    }
    expect(dirty((g) => { (g.encounter.queued as unknown) = 'ghost' })).toBe('BAD_SHAPE')
    expect(dirty((g) => { (g.encounter.cooldowns as Record<string, number>).ghost = 5 })).toBe('BAD_SHAPE')
    expect(dirty((g) => { g.encounter.seenOnce = ['masterCave', 'masterCave'] })).toBe('BAD_SHAPE')
    expect(dirty((g) => { g.encounter.seenOnce = ['stoneVein'] })).toBe('BAD_SHAPE') // 传说白名单只收传说 id
  })
})
