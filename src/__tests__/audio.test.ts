import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadPrefs, savePrefs, sfxForEntry } from '../audio'
import type { LogEntry } from '../game/types'

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return { day: 12, kind: 'settle', title: '', text: '', ...overrides }
}

describe('sfxForEntry 日志映射（audio-impl.md §3.4）', () => {
  it('晨露/灵潮/里程碑按标题前缀命中', () => {
    expect(sfxForEntry(entry({ title: '晨露凝而复聚', icon: '☀️' }))).toBe('dew')
    expect(sfxForEntry(entry({ title: '灵潮 · 灵兽成群', evPos: [4, 0] }))).toBe('tide')
    expect(sfxForEntry(entry({ kind: 'breakthrough', title: '道心 7 天 · 初窥门径', icon: '🌕' }))).toBe('milestone')
  })

  it('真境界突破不配里程碑音', () => {
    expect(sfxForEntry(entry({ kind: 'breakthrough', title: '突破 · 练气三层', icon: '🌀' }))).toBeNull()
  })

  it('灵石失窃命中，其他事件不配音', () => {
    expect(sfxForEntry(entry({ kind: 'event', title: '灵石失窃', icon: '🦝', neg: true }))).toBe('steal')
    expect(sfxForEntry(entry({ kind: 'event', title: '灵雀偷食', icon: '🐦', neg: true }))).toBeNull()
    expect(sfxForEntry(entry({ kind: 'event', title: '灵兽来访', icon: '🦌' }))).toBeNull()
  })

  it('收获条目区分上品与普通', () => {
    expect(sfxForEntry(entry({ kind: 'action', icon: '🌾', title: '收获 · 青灵草', text: '+2 株，修为 +6，灵性涌现 +1 上品' }))).toBe('premium')
    expect(sfxForEntry(entry({ kind: 'action', icon: '🌾', title: '收获 · 青灵草', text: '+2 株，修为 +6' }))).toBe('harvest')
  })

  it('播种命中 plant', () => {
    expect(sfxForEntry(entry({ kind: 'action', icon: '🌱', title: '播种 · 青灵草' }))).toBe('plant')
  })

  it('坊市出售与购买命中 gain', () => {
    expect(sfxForEntry(entry({ kind: 'action', icon: '💰', title: '出售 青灵草 ×3', text: '+15 灵石' }))).toBe('gain')
    expect(sfxForEntry(entry({ kind: 'action', icon: '🛍️', title: '购买 紫云芝种', text: '−30 灵石' }))).toBe('gain')
  })

  it('手动 toast 与未选音效的条目不配音', () => {
    expect(sfxForEntry(entry({ icon: '📥', title: '存档导入成功', text: '已恢复到第 12 天' }))).toBeNull()
    expect(sfxForEntry(entry({ icon: '⚠️', title: '第 2 月欠缴', text: '贡献 −3、灵石 −5' }))).toBeNull()
  })
})

describe('声音偏好（audio-impl.md §3.2）', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('缺键默认全开', () => {
    expect(loadPrefs()).toEqual({ bgm: true, sfx: true })
  })

  it('保存后读回一致；坏 JSON 回默认', () => {
    savePrefs({ bgm: false, sfx: true })
    expect(loadPrefs()).toEqual({ bgm: false, sfx: true })
    vi.stubGlobal('localStorage', { getItem: () => 'not-json', setItem: () => {} })
    expect(loadPrefs()).toEqual({ bgm: true, sfx: true })
  })

  it('部分字段缺失视为 true', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{"bgm":false}', setItem: () => {} })
    expect(loadPrefs()).toEqual({ bgm: false, sfx: true })
  })
})
