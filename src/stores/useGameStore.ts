// 游戏状态 store：持有 GameState，动作统一经 engine.dispatch（纯函数），
// 成功后同步持久化（save.md：每次有效状态变化即存档）。
// 多标签检测（save.md §3.6）：标准浏览器走 storage 事件；嵌入式 webview（如 IAB）
// 不派发该事件，叠加 3s 轮询 savedAt 比对兜底。
import { create } from 'zustand'
import { syncRealDay } from '../game/clock'
import { createInitialState, dispatch } from '../game/engine'
import { SAVE_KEY, importCode, load, persist } from '../game/save'
import type { CharacterId, GameAction, GameState, LogEntry } from '../game/types'
import { useUiStore } from './useUiStore'

// 跨日同步新增的日志差量（供 toast）：sync 后日志中位于旧日志队首之前的条目。
// GameScreen 挂载时才建立 toast 基线，「刷新进入」的晨露等同步通知需在此显式入队（real-day.md §5）
function freshLogEntries(before: LogEntry[], after: LogEntry[]): LogEntry[] {
  if (!before.length) return after
  const idx = after.findIndex((e) => JSON.stringify(e) === JSON.stringify(before[0]))
  return idx > 0 ? after.slice(0, idx) : []
}

interface GameStore {
  game: GameState
  started: boolean
  tabBanner: boolean
  saveError: string | null
  lastSavedAt: number // 本页最近一次成功写入的 savedAt

  startNew: (characterId?: CharacterId) => void
  continueSaved: () => { ok: boolean; reason?: string }
  importSaved: (code: string) => { ok: boolean; reason?: string }
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
      const game = { ...createInitialState(Date.now() >>> 0, Date.now()), characterId: characterId ?? get().game.characterId }
      const savedAt = persist(game) // 新档立即落库：否则刷新回到开始画面，且不触发他页提示
      set({ game, started: true, lastSavedAt: savedAt, saveError: savedAt ? null : '存档保存失败，进度暂存于本页' })
    },

    continueSaved: () => {
      const r = load()
      if (!r.ok) return { ok: false, reason: r.reason }
      // 载入后立即同步现实日（real-day.md §3.1）：打开页面即跨日的晨露/漏签检查在入口完成
      const { state, changed } = syncRealDay(r.state!, Date.now())
      if (changed) {
        // 同步发生在 GameScreen 挂载前，toast 基线尚未建立：差量显式入队（复用现有 toast 队列）
        useUiStore.getState().pushToasts(freshLogEntries(r.state!.log, state.log))
      }
      const savedAt = changed ? persist(state) : r.savedAt ?? 0
      set({ game: state, started: true, lastSavedAt: savedAt, saveError: null })
      return { ok: true }
    },

    importSaved: (code) => {
      const result = importCode(code)
      if (!result.ok || !result.state) return { ok: false, reason: result.reason }
      // 导入后同样同步现实日；必须先写入成功再切换游戏，保存失败时保留当前页面和旧存档。
      const { state, changed } = syncRealDay(result.state, Date.now())
      const savedAt = persist(state)
      if (!savedAt) return { ok: false, reason: 'SAVE_FAILED' }
      if (changed) {
        // 与 continueSaved 同理：换档后 toast 基线重建，跨日日志（晨露等）显式入队
        useUiStore.getState().pushToasts(freshLogEntries(result.state.log, state.log))
      }
      set({ game: state, started: true, lastSavedAt: savedAt, saveError: null, tabBanner: false })
      return { ok: true }
    },

    act: (action) => {
      // dispatch 前同步现实日（real-day.md §3.1）：跨日时发晨露、漏签检查、重置当日游戏日计数；
      // 同步结果独立于动作成败——动作失败也保留跨日同步（现实世界已经跨日，进度不该回退）
      const { state: base, changed } = syncRealDay(get().game, Date.now())
      const r = dispatch(base, action)
      if (!r.ok && !changed) return { ok: false, reason: r.reason }
      const next = r.ok ? r.state : base
      const savedAt = persist(next)
      set({ game: next, lastSavedAt: savedAt || get().lastSavedAt, saveError: savedAt ? null : '存档保存失败，进度暂存于本页' })
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
