// 境界修行与存档单测：突破连跳、累计不清零、上限派生、存档往返与坏导码（PRD §5.2/§16.3）
import { describe, expect, it } from 'vitest'
import { FIELD_CAP, QI_CAP, REALM_EXP } from '../constants'
import { createInitialState, dispatch } from '../engine'
import { gainCultivation, qiCap } from '../progression'
import { gainQi } from '../farming'
import { applyMigrations, exportCode, importCode, load, persist, SAVE_KEY } from '../save'

function memoryStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => void m.clear(),
  } as Storage
}

describe('修为与突破（progression.md）', () => {
  it('累计只增不减；跨阈值自动突破并连跳合并', () => {
    const s = createInitialState(1)
    gainCultivation(s, 50) // 一次跨过 20/45 两个阈值 → 练气三层
    expect(s.realm).toBe(2)
    expect(s.cultivation).toBe(50)
    expect(s.log[0].kind).toBe('breakthrough')
  })

  it('达 520 突破筑基；修为不清零；里程碑由 UI 按 milestoneShown 派生展示', () => {
    const s = createInitialState(1)
    gainCultivation(s, 520)
    expect(s.realm).toBe(9)
    expect(s.cultivation).toBe(520)
    expect(s.milestoneShown).toBe(false) // 展示由 UI 派生：realm>=9 && !milestoneShown
  })

  it('派生上限随境界：灵气上限、田上限', () => {
    expect(qiCap(0)).toBe(5)
    expect(qiCap(9)).toBe(9)
    expect(FIELD_CAP[2]).toBe(5)
    expect(FIELD_CAP[8]).toBe(7)
    expect(QI_CAP.length).toBe(REALM_EXP.length)
  })

  it('灵气入账溢出丢弃并返回溢出量', () => {
    const s = createInitialState(1)
    s.resources.qi = 4
    expect(gainQi(s, 3)).toBe(2) // 上限 5，溢出 2
    expect(s.resources.qi).toBe(5)
  })
})

describe('存档（save.md）', () => {
  it('persist 后 load 恢复一致', () => {
    const storage = memoryStorage()
    const s = createInitialState(42)
    s.resources.stones = 77
    const savedAt = persist(s, storage)
    expect(savedAt).toBeGreaterThan(0)
    const r = load(storage)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.state).toEqual(s)
      expect(r.savedAt).toBe(savedAt)
    }
  })

  it('导码往返一致', () => {
    const s = createInitialState(7)
    s.day = 15
    s.realm = 3
    const r = importCode(exportCode(s))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.state).toEqual(s)
  })

  it('四类坏导码全部拒绝：BAD_BASE64 / BAD_JSON / BAD_VERSION / BAD_SHAPE', () => {
    expect(importCode('!!!not-base64!!!').reason).toBe('BAD_BASE64')
    expect(importCode(btoa('not json')).reason).toBe('BAD_JSON')
    const badVersion = JSON.stringify({ version: 99, savedAt: 1, game: createInitialState(1) })
    expect(importCode(btoa(badVersion)).reason).toBe('BAD_VERSION')
    const badShape = JSON.stringify({ version: 1, savedAt: 1, game: { day: -5 } })
    expect(importCode(btoa(badShape)).reason).toBe('BAD_SHAPE')
  })

  it('损坏存档 load 拒绝且不覆盖原字符串', () => {
    const storage = memoryStorage()
    const broken = '{"version":1,"game":{"day":1'
    storage.setItem(SAVE_KEY, broken)
    const r = load(storage)
    expect(r.ok).toBe(false)
    expect(storage.getItem(SAVE_KEY)).toBe(broken)
  })

  it('无存档返回 NO_SAVE', () => {
    expect(load(memoryStorage()).reason).toBe('NO_SAVE')
  })

  it('迁移链当前为空（v1）', () => {
    const s = createInitialState(1)
    const data = { version: 1, savedAt: 0, game: s }
    expect(applyMigrations(data).game).toEqual(s)
  })

  it('测验会话中间态完整入档（进度与已答记录）', () => {
    let s = createInitialState(3)
    s = dispatch(s, { type: 'QUIZ_BEGIN' }).state
    s = dispatch(s, { type: 'QUIZ_LEARNED' }).state
    s = dispatch(s, { type: 'QUIZ_ANSWER', choice: s.quizDaily.session!.questions[0].opts[0] }).state
    const storage = memoryStorage()
    persist(s, storage)
    const r = load(storage)
    expect(r.ok).toBe(true)
    const restored = r.state!
    expect(restored.quizDaily.session).not.toBeNull()
    expect(restored.quizDaily.session!.answers[0]).not.toBeNull()
    expect(restored.quizDaily.session!.idx).toBe(0)
  })
})
