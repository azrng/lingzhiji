import { describe, expect, it } from 'vitest'
import { fxForEntries, fxForEntry } from '../fx'
import type { LogEntry } from '../game/types'

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return { day: 12, kind: 'action', title: '', text: '', ...overrides }
}

describe('fxForEntry 日志差量→动效映射（motion-pack.md §3.2）', () => {
  it('晨露 → 青白粒子；道心里程碑 → 流金，均无飘字', () => {
    expect(fxForEntry(entry({ kind: 'settle', title: '晨露凝而复聚', icon: '💧' }))).toEqual({ kind: 'dew', label: null })
    expect(fxForEntry(entry({ kind: 'breakthrough', title: '道心 7 天 · 初窥门径', icon: '🌕' }))).toEqual({ kind: 'milestone', label: null })
  })

  it('真境界突破不触发动效', () => {
    expect(fxForEntry(entry({ kind: 'breakthrough', title: '突破 · 练气三层', icon: '🌀' }))).toBeNull()
  })

  it('普通收获 → 绿粒子 + “+N 株”飘字', () => {
    expect(fxForEntry(entry({ icon: '🌾', title: '收获 · 青灵草', text: '+2 株，修为 +6，地力透支修为减半' }))).toEqual({
      kind: 'harvest',
      label: '+2 株',
    })
  })

  it('上品收获 → 金粒子 + “上品 +1”飘字（稀有优先）', () => {
    expect(fxForEntry(entry({ icon: '🌾', title: '收获 · 青灵草', text: '+3 株，修为 +6，灵性涌现 +1 上品' }))).toEqual({
      kind: 'premium',
      label: '上品 +1',
    })
  })

  it('播种/买卖/失窃/灵潮等不触发（克制口径，已有音效与 toast）', () => {
    expect(fxForEntry(entry({ icon: '🌱', title: '播种 · 青灵草', text: '1 号田，需 3 天成熟' }))).toBeNull()
    expect(fxForEntry(entry({ icon: '💰', title: '出售 青灵草 ×5', text: '+25 灵石（单价 5）' }))).toBeNull()
    expect(fxForEntry(entry({ kind: 'event', title: '事件 · 灵石失窃', neg: true }))).toBeNull()
    expect(fxForEntry(entry({ kind: 'settle', title: '灵潮 · 灵雨之月', evPos: [4, 0] }))).toBeNull()
  })
})

describe('fxForEntries 批量触发（一批差量只取首个命中）', () => {
  it('多命中只触发一次且命中优先级在前者', () => {
    // node 环境无 document：burst/floatText 均有守卫直接返回，此测试只验证顺序逻辑不抛错
    const entries: LogEntry[] = [
      entry({ icon: '🌱', title: '播种 · 青灵草', text: '1 号田，需 3 天成熟' }),
      entry({ kind: 'settle', title: '晨露凝而复聚' }),
      entry({ kind: 'breakthrough', title: '道心 7 天 · 初窥门径' }),
    ]
    expect(() => fxForEntries(entries)).not.toThrow()
  })

  it('空批与全不命中安全通过', () => {
    expect(() => fxForEntries([])).not.toThrow()
    expect(() => fxForEntries([entry({ icon: '🧘', title: '修炼吐纳', text: '修为 +1' })])).not.toThrow()
  })
})
