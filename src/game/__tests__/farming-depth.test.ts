// 种田深化第一批（farming-depth.md）：特质 / 地力轮作 / 邻作 / 物候 / 存档 v3
import { describe, expect, it } from 'vitest'
import { EVENTS, HERBS, HERB_BY_ID } from '../constants'
import { createInitialState, applyEvent, dispatch } from '../engine'
import { applyDrought, neighborFields, seasonAdj } from '../farming'
import { createRng } from '../rng'
import { SAVE_VERSION, applyMigrations, validate, type SaveData } from '../save'
import type { GameState } from '../types'

function started(seed = 7): GameState {
  return createInitialState(seed, Date.UTC(2026, 10, 17))
}

describe('物候（farming-depth.md §3.4）', () => {
  it('季节映射 6 月循环：月 1-2 生发 / 3-4 长养 / 5-6 收藏，第 7 月回到生发', () => {
    expect(seasonAdj('qingling', 1)).toBe(1) // 青灵草适生发季
    expect(seasonAdj('qingling', 3)).toBe(-1) // 长养季反季
    expect(seasonAdj('qingling', 7)).toBe(1) // 循环回生发
    expect(seasonAdj('chisui', 5)).toBe(1) // 赤髓参适收藏季
    expect(seasonAdj('ziyun', 4)).toBe(1) // 紫云芝双季（长养·收藏）
  })

  it('九叶莲灵韵：不适季惩罚也不吃适季加成', () => {
    for (let m = 1; m <= 6; m++) expect(seasonAdj('jiuye', m)).toBe(0)
  })

  it('播种日志附注当令来源', () => {
    let s = started()
    s.resources.qi = 5
    s = dispatch(s, { type: 'PLANT', fieldId: 1, herb: 'qingling' }).state
    expect(s.fields[0].curYield).toBe(6) // 5 + 当令 1
    expect(s.log[0].text).toContain('当令 +1')
  })
})

describe('地力与轮作（farming-depth.md §3.2）', () => {
  it('固氮：首茬与连作保持中性；真轮作进茬才 +1（sim 校准修正）', () => {
    let s = started(11)
    s.seeds.ninglu = 1
    s.resources.qi = 9
    s.ap = 9
    // 第一茬凝露花（首茬无奖励无惩罚）
    s = dispatch(s, { type: 'PLANT', fieldId: 1, herb: 'ninglu' }).state
    s.fields[0].progress = 99
    s.fields[0].status = 'mature'
    s = dispatch(s, { type: 'HARVEST', fieldId: 1 }).state
    expect(s.fields[0].fertility).toBe(1)
    expect(s.fields[0].lastCrop).toBe('ninglu')
    // 第二茬青灵草（轮作进茬）→ 固氮 +1
    s = dispatch(s, { type: 'PLANT', fieldId: 1, herb: 'qingling' }).state
    s.fields[0].progress = 99
    s.fields[0].status = 'mature'
    s = dispatch(s, { type: 'HARVEST', fieldId: 1 }).state
    expect(s.fields[0].fertility).toBe(2)
    // 第三茬再连作青灵草 → 中性保持 2
    s.resources.qi = 5
    s = dispatch(s, { type: 'PLANT', fieldId: 1, herb: 'qingling' }).state
    s.fields[0].progress = 99
    s.fields[0].status = 'mature'
    s = dispatch(s, { type: 'HARVEST', fieldId: 1 }).state
    expect(s.fields[0].fertility).toBe(2)
  })

  it('连作耗地：紫云芝连作两茬后地力降至 0，轮作不恢复', () => {
    let s = started(12)
    s.realm = 2
    s.resources.qi = 9
    s.seeds.ziyun = 2
    s.day = 61 // 长养季，紫云芝当令（隔离物候干扰）
    for (let i = 0; i < 2; i++) {
      s = dispatch(s, { type: 'PLANT', fieldId: 1, herb: 'ziyun' }).state
      s.fields[0].progress = 99
      s.fields[0].status = 'mature'
      s = dispatch(s, { type: 'HARVEST', fieldId: 1 }).state
    }
    // 第 1 茬无茬口记录不减地，第 2 茬连作 −1
    expect(s.fields[0].fertility).toBe(0)
    expect(s.fields[0].lastCrop).toBe('ziyun')
  })

  it('深根：龙血藤连作地力消耗减半（−1 → 0）', () => {
    let s = started(13)
    s.realm = 6
    s.resources.qi = 9
    s.seeds.longxue = 2
    for (let i = 0; i < 2; i++) {
      s = dispatch(s, { type: 'PLANT', fieldId: 1, herb: 'longxue' }).state
      s.fields[0].progress = 99
      s.fields[0].status = 'mature'
      s = dispatch(s, { type: 'HARVEST', fieldId: 1 }).state
    }
    expect(s.fields[0].fertility).toBe(1) // 深根连作不减
  })

  it('地力修正产量：贫瘠 −1 / 肥沃 +1（播种时快照）', () => {
    let s = started(14)
    s.resources.qi = 9
    s.fields[0].fertility = 0
    s.fields[1].fertility = 2
    s = dispatch(s, { type: 'PLANT', fieldId: 1, herb: 'qingling' }).state
    s = dispatch(s, { type: 'PLANT', fieldId: 2, herb: 'qingling' }).state
    expect(s.fields[0].curYield).toBe(5) // 6 当令 − 1 贫瘠
    expect(s.fields[1].curYield).toBe(7) // 6 当令 + 1 肥沃
  })
})

describe('邻作（farming-depth.md §3.3）', () => {
  it('喜阴：紫云芝相邻高秆田产量 +1（长养季当令下 3+1+1）', () => {
    let s = started(15)
    s.day = 61 // 长养季：紫云芝当令
    s.realm = 3
    s.resources.qi = 9
    s.seeds.ziyun = 1
    s.fields[0] = { id: 1, status: 'growing', herb: 'chisui', progress: 1, curYield: 3, dry: 0, halved: false, fertility: 1 }
    s = dispatch(s, { type: 'PLANT', fieldId: 2, herb: 'ziyun' }).state
    expect(s.fields[1].curYield).toBe(5) // 3 + 当令 1 + 喜阴 1
    // 无高秆邻作时只有当令
    s.seeds.ziyun = 1
    s = dispatch(s, { type: 'PLANT', fieldId: 3, herb: 'ziyun' }).state
    expect(s.fields[2].curYield).toBe(4) // 3 + 当令 1（3 号田邻 2 号紫云芝，非高秆）
  })

  it('驱虫：虫害目标田相邻赤髓参 → 产量无损且日志附注', () => {
    const s = started(16)
    s.fields[0] = { id: 1, status: 'growing', herb: 'chisui', progress: 1, curYield: 3, dry: 0, halved: false, fertility: 1 }
    s.fields[1] = { id: 2, status: 'growing', herb: 'qingling', progress: 1, curYield: 6, dry: 0, halved: false, fertility: 1 }
    const pest = EVENTS.find((e) => e.id === 'pest')!
    const before = s.fields.map((f) => f.curYield!)
    for (let seed = 0; seed < 500; seed++) {
      const clone = structuredClone(s)
      applyEvent(clone, pest, createRng(seed))
      if (clone.log[0].text.includes('赤髓参灵气所护')) {
        expect(clone.fields[1].curYield).toBe(before[1]) // 受护不减
        expect(clone.fields[0].curYield).toBe(before[0]) // 赤髓参自己不受自己护
        return
      }
      // 未受护路径：被选中的目标田产量 −1（赤髓参自身或无邻护的田）
      expect(clone.fields.some((f, i) => f.curYield === before[i] - 1)).toBe(true)
    }
    throw new Error('500 个种子内未出现受护日志：驱虫护邻未生效')
  })

  it('neighborFields 相邻口径：id 差 1 且存在', () => {
    const s = started()
    expect(neighborFields(s.fields, 2).map((f) => f.id)).toEqual([1, 3])
    expect(neighborFields(s.fields, 1).map((f) => f.id)).toEqual([2])
  })
})

describe('喜湿（farming-depth.md §3.1）', () => {
  it('凝露花免疫缺水：不累计不减产，他田正常', () => {
    const s = started(17)
    s.fields[0] = { id: 1, status: 'growing', herb: 'ninglu', progress: 1, curYield: 4, dry: 0, halved: false, fertility: 1 }
    s.fields[1] = { id: 2, status: 'growing', herb: 'qingling', progress: 1, curYield: 6, dry: 0, halved: false, fertility: 1 }
    for (let i = 0; i < 3; i++) applyDrought(s)
    expect(s.fields[0].dry).toBe(0)
    expect(s.fields[0].curYield).toBe(4)
    expect(s.fields[1].curYield).toBe(3) // 6 → 减半一次
    expect(s.fields[1].dry).toBe(0) // 减半后清零
  })
})

describe('存档 v3（farming-depth.md §2）', () => {
  it('v2 档经完整迁移链升到 v7：迁移补 fertility=1、lastCrop 不造', () => {
    expect(SAVE_VERSION).toBe(7)
    const v2 = { version: 2, savedAt: 1, game: started(3) } as SaveData
    delete (v2.game.fields[0] as { fertility?: number }).fertility
    const migrated = applyMigrations(v2)
    expect(migrated.version).toBe(7)
    expect(migrated.game.fields[0].fertility).toBe(1)
    expect(migrated.game.fields[0].lastCrop).toBeUndefined()
    expect(validate(migrated.game)).toBeNull()
  })

  it('脏档迁移不抛异常：fields 缺失保持原样交 validate 拦截', () => {
    const broken = { version: 2, savedAt: 1, game: { day: 1 } } as unknown as SaveData
    expect(() => applyMigrations(broken)).not.toThrow()
    const out = applyMigrations(broken)
    expect(out.version).toBe(7)
    expect(validate(out.game)).toBe('BAD_SHAPE')
  })

  it('fertility 越界与 lastCrop 非法被 validate 拦截', () => {
    const s = started(4)
    s.fields[0].fertility = 3
    expect(validate(s)).toBe('BAD_SHAPE')
    s.fields[0].fertility = 1
    ;(s.fields[0] as { lastCrop?: string }).lastCrop = 'no-such-herb'
    expect(validate(s)).toBe('BAD_SHAPE')
  })

  it('灵植表完备：六种各有适季或灵韵标记，特质齐备', () => {
    for (const h of HERBS) {
      expect(h.allSeason || h.seasons.length >= 1).toBe(true)
    }
    expect(HERB_BY_ID.qingling.nitrogen).toBe(true)
    expect(HERB_BY_ID.ninglu.wet).toBe(true)
    expect(HERB_BY_ID.ziyun.shade).toBe(true)
    expect(HERB_BY_ID.chisui.insectWard).toBe(true)
    expect(HERB_BY_ID.longxue.deepRoot).toBe(true)
    expect(HERB_BY_ID.jiuye.allSeason).toBe(true)
  })
})
