// 游戏状态 store：持有 GameState，动作统一经 engine.dispatch（纯函数），
// 成功后同步持久化（save.md：每次有效状态变化即存档）。
// 多标签检测（save.md §3.6）：标准浏览器走 storage 事件；嵌入式 webview（如 IAB）
// 不派发该事件，叠加 3s 轮询 savedAt 比对兜底。
import { create } from 'zustand'
import { createInitialState, dispatch } from '../game/engine'
import { SAVE_KEY, load, persist } from '../game/save'
import type { CharacterId, GameAction, GameState } from '../game/types'

interface GameStore {
  game: GameState
  started: boolean
  tabBanner: boolean
  saveError: string | null
  lastSavedAt: number // 本页最近一次成功写入的 savedAt

  startNew: (characterId?: CharacterId) => void
  continueSaved: () => { ok: boolean; reason?: string }
  act: (action: GameAction) => { ok: boolean; reason?: string }
  hideTabBanner: () => void
  reloadFromDisk: () => void
}

function watchStorage(get: () => GameStore, set: (p: Partial<GameStore>) => void) {
  if (typeof window === 'undefined') return
  window.addEventListener('storage', (e) => {
    if (e.key === SAVE_KEY && e.newValue) set({ tabBanner: true })
  })
  // 轮询兜底：磁盘 savedAt 与本页最近写入不一致 → 他页覆盖
  setInterval(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (!raw) return
      const disk = (JSON.parse(raw) as { savedAt?: number }).savedAt
      const { lastSavedAt, tabBanner, started } = get()
      if (started && disk && lastSavedAt && disk !== lastSavedAt && !tabBanner) {
        set({ tabBanner: true })
      }
    } catch {
      // 存档读取失败交给加载路径处理，轮询忽略
    }
  }, 3000)
}

export const useGameStore = create<GameStore>((set, get) => {
  watchStorage(get, set)
  return {
    game: createInitialState(1),
    started: false,
    tabBanner: false,
    saveError: null,
    lastSavedAt: 0,

    startNew: (characterId) => {
      const game = { ...createInitialState(Date.now() >>> 0), characterId: characterId ?? get().game.characterId }
      const savedAt = persist(game) // 新档立即落库：否则刷新回到开始画面，且不触发他页提示
      set({ game, started: true, lastSavedAt: savedAt, saveError: savedAt ? null : '存档保存失败，进度暂存于本页' })
    },

    continueSaved: () => {
      const r = load()
      if (!r.ok) return { ok: false, reason: r.reason }
      set({ game: r.state, started: true, lastSavedAt: r.savedAt ?? 0, saveError: null })
      return { ok: true }
    },

    act: (action) => {
      const r = dispatch(get().game, action)
      if (r.ok) {
        const savedAt = persist(r.state)
        set({ game: r.state, lastSavedAt: savedAt || get().lastSavedAt, saveError: savedAt ? null : '存档保存失败，进度暂存于本页' })
      }
      return { ok: r.ok, reason: r.reason }
    },

    hideTabBanner: () => {
      // 留在本页：以磁盘当前值为基线，避免横幅立即复现
      try {
        const raw = localStorage.getItem(SAVE_KEY)
        const disk = raw ? (JSON.parse(raw) as { savedAt?: number }).savedAt ?? 0 : 0
        set({ tabBanner: false, lastSavedAt: disk })
      } catch {
        set({ tabBanner: false })
      }
    },

    reloadFromDisk: () => {
      const r = load()
      if (r.ok) set({ game: r.state!, tabBanner: false, lastSavedAt: r.savedAt ?? 0 })
    },
  }
})
