import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInitialState } from '../engine'
import { exportCode, SAVE_KEY } from '../save'
import { useGameStore } from '../../stores/useGameStore'

afterEach(() => vi.unstubAllGlobals())

describe('开始页存档恢复', () => {
  it('成功导入备份并进入保存的游戏', () => {
    const data = new Map([[SAVE_KEY, '损坏的旧档']])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    })
    const saved = createInitialState(7)
    saved.day = 12
    const result = useGameStore.getState().importSaved(exportCode(saved))
    expect(result.ok).toBe(true)
    expect(useGameStore.getState().started).toBe(true)
    expect(useGameStore.getState().game.day).toBe(12)
    expect(JSON.parse(data.get(SAVE_KEY)!).game.day).toBe(12)
  })

  it('无效导码或写入失败时保留旧档和当前游戏', () => {
    const old = '损坏的旧档'
    vi.stubGlobal('localStorage', {
      getItem: () => old,
      setItem: () => { throw new Error('存储不可写') },
    })
    const before = useGameStore.getState().game
    expect(useGameStore.getState().importSaved('无效导码').ok).toBe(false)
    expect(useGameStore.getState().importSaved(exportCode(createInitialState(9))).reason).toBe('SAVE_FAILED')
    expect(useGameStore.getState().game).toBe(before)
    expect(localStorage.getItem(SAVE_KEY)).toBe(old)
  })
})
