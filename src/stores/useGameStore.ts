// 游戏状态 store：持有 GameState，动作统一经 engine.dispatch（纯函数），
// 成功后同步持久化（save.md：每次有效状态变化即存档）
import { create } from 'zustand'
import { createInitialState, dispatch } from '../game/engine'
import { SAVE_KEY, load, persist } from '../game/save'
import type { GameAction, GameState } from '../game/types'

interface GameStore {
  game: GameState
  started: boolean
  tabBanner: boolean
  saveError: string | null

  startNew: () => void
  continueSaved: () => { ok: boolean; reason?: string }
  act: (action: GameAction) => { ok: boolean; reason?: string }
  hideTabBanner: () => void
  reloadFromDisk: () => void
}

// store 创建即挂多标签监听（save.md §3.6：storage 事件 + 横幅，不做锁）
function watchStorage(set: (p: Partial<GameStore>) => void) {
  if (typeof window === 'undefined') return
  window.addEventListener('storage', (e) => {
    if (e.key === SAVE_KEY && e.newValue) set({ tabBanner: true })
  })
}

export const useGameStore = create<GameStore>((set, get) => {
  watchStorage(set)
  return {
    game: createInitialState(1),
    started: false,
    tabBanner: false,
    saveError: null,

    startNew: () => set({ game: createInitialState(Date.now() >>> 0), started: true, saveError: null }),

    continueSaved: () => {
      const r = load()
      if (!r.ok) return { ok: false, reason: r.reason }
      set({ game: r.state, started: true, saveError: null })
      return { ok: true }
    },

    act: (action) => {
      const r = dispatch(get().game, action)
      if (r.ok) {
        const persisted = persist(r.state)
        set({ game: r.state, saveError: persisted ? null : '存档保存失败，进度暂存于本页' })
      }
      return { ok: r.ok, reason: r.reason }
    },

    hideTabBanner: () => set({ tabBanner: false }),

    reloadFromDisk: () => {
      const r = load()
      if (r.ok) set({ game: r.state, tabBanner: false })
    },
  }
})
