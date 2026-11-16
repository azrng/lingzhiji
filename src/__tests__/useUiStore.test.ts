import { beforeEach, describe, expect, it, vi } from 'vitest'

// 回归 T28：播种/收获/上品/买卖是 kind:'action'，不产 toast 但按 audio-impl.md §3.4 要配音。
// mock 掉 audio 模块，断言 pushToasts 把「全量差量」喂给 playSfxForEntries（而不是只喂 toast 候选）。
vi.mock('../audio', () => ({ playSfxForEntries: vi.fn() }))

import { playSfxForEntries } from '../audio'
import { useUiStore } from '../stores/useUiStore'
import type { LogEntry } from '../game/types'

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return { day: 3, kind: 'action', title: '', text: '', ...overrides }
}

describe('pushToasts 音效与 toast 分流（audio-impl.md §3.4 / T28 回归）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useUiStore.setState({ toasts: [] })
  })

  it('收获等 action 类：音效喂全量差量，但不产 toast', () => {
    const harvest = entry({ icon: '🌾', title: '收获 · 青灵草', text: '+5 株，修为 +6' })
    useUiStore.getState().pushToasts([harvest])
    expect(vi.mocked(playSfxForEntries)).toHaveBeenCalledWith([harvest])
    expect(useUiStore.getState().toasts).toHaveLength(0)
  })

  it('event 类：音效与 toast 同源触发', () => {
    const ev = entry({ kind: 'event', icon: '🐦', title: '事件 · 灵雀偷食', text: '青灵草 −1', neg: true })
    useUiStore.getState().pushToasts([ev])
    expect(vi.mocked(playSfxForEntries)).toHaveBeenCalledWith([ev])
    expect(useUiStore.getState().toasts).toHaveLength(1)
  })

  it('混合批：一次喂全量，toast 只收 event/settle/breakthrough', () => {
    const plant = entry({ icon: '🌱', title: '播种 · 青灵草', text: '1 号田，需 15 天成熟' })
    const settle = entry({ kind: 'settle', icon: '🧾', title: '第 1 月定额缴纳', text: '折算 15 株，贡献 +10' })
    useUiStore.getState().pushToasts([plant, settle])
    expect(vi.mocked(playSfxForEntries)).toHaveBeenCalledWith([plant, settle])
    expect(useUiStore.getState().toasts).toHaveLength(1)
  })
})
