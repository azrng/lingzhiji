// UI 状态 store：弹层开关与 toast 队列（不入档，瞬时状态）
import { create } from 'zustand'
import { playSfxForEntries } from '../audio'
import { fxForEntries } from '../fx'
import type { LogEntry } from '../game/types'

export type Toast = {
  id: number
  evPos?: [number, number]
  evSheet?: LogEntry['evSheet']
  icon?: string
  title: string
  text?: string
  tone?: 'good' | 'bad' | 'gold'
}

interface UiStore {
  quizOpen: boolean
  marketOpen: boolean
  settingsOpen: boolean
  tutorialStep: number // 0 不显示；1-3 引导步骤
  toasts: Toast[]
  setQuizOpen: (v: boolean) => void
  setMarketOpen: (v: boolean) => void
  setSettingsOpen: (v: boolean) => void
  setTutorialStep: (v: number) => void
  pushToasts: (entries: LogEntry[]) => void
  dismissToast: (id: number) => void
}

let seq = 1

export const useUiStore = create<UiStore>((set) => ({
  quizOpen: false,
  marketOpen: false,
  settingsOpen: false,
  tutorialStep: 0,
  toasts: [],
  setQuizOpen: (v) => set({ quizOpen: v }),
  setMarketOpen: (v) => set({ marketOpen: v }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setTutorialStep: (v) => set({ tutorialStep: v }),
  // 新日志条目转 toast：事件/结算/突破需要即时反馈，普通行动不弹（core-loop.md）
  pushToasts: (entries) => {
    fxForEntries(entries) // 动效在 toast 过滤之前：收获/播种等 action 类不产 toast 但有粒子/飘字（motion-pack.md §3.2）
    playSfxForEntries(entries) // 音效同口径喂全量差量：播种/收获/上品/买卖是 action 类，不产 toast 但映射表要求配音（audio-impl.md §3.4）
    const candidates = entries.filter((e) => e.kind === 'event' || e.kind === 'settle' || e.kind === 'breakthrough')
    const fresh = candidates.map((e) => ({
      id: seq++,
      evPos: e.evPos,
      evSheet: e.evSheet,
      icon: e.icon,
      title: e.title,
      text: e.text,
      tone: e.neg ? ('bad' as const) : e.kind === 'breakthrough' ? ('gold' as const) : ('good' as const),
    }))
    if (!fresh.length) return
    set((s) => ({ toasts: [...s.toasts, ...fresh] }))
    for (const t of fresh) {
      setTimeout(() => useUiStore.getState().dismissToast(t.id), 4000)
    }
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
