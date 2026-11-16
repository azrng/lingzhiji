import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useGameStore } from '../stores/useGameStore'
import { useUiStore } from '../stores/useUiStore'
import { Sprite } from './ui'

// 右上角事件/提示 toast 队列（由新日志条目派生）；多标签页横幅（save.md §3.6）。
// 进出场动效（motion-pack.md §3.3/3.4）：弹性进场/快速退场，负向轻脉冲一次、金色调常驻微光；
// reduced-motion 时纯淡入淡出、无位移无微光。
export function EventToasts() {
  const toasts = useUiStore((s) => s.toasts)
  const dismiss = useUiStore((s) => s.dismissToast)
  const reduce = useReducedMotion()
  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 w-72">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 16 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduce ? 0 : 8, transition: { duration: 0.2 } }}
            transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 260, damping: 24 }}
            className={`bg-gray-50 border rounded-xl shadow-lg px-4 py-3 flex items-start gap-3 ${
              t.tone === 'bad' ? 'border-error-200 fx-pulse-error' : t.tone === 'gold' ? 'border-gold fx-glow-gold' : 'border-success-200'
            }`}
          >
            {t.evPos ? (
              <Sprite sheet={t.evSheet ?? 'event-icons-sheet.png'} cols={5} rows={t.evSheet ? 1 : 2} col={t.evPos[0]} row={t.evPos[1]} size={22} className="mt-0.5" />
            ) : (
              <span className="text-lg leading-none mt-0.5">{t.icon ?? '·'}</span>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-700 leading-snug">{t.title}</div>
              {t.text && <div className="text-xs text-gray-500 leading-snug mt-0.5">{t.text}</div>}
            </div>
            <button onClick={() => dismiss(t.id)} aria-label="关闭提示" className="text-gray-500 hover:text-gray-600 text-xs min-w-11 min-h-11">×</button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export function TabBanner() {
  const show = useGameStore((s) => s.tabBanner)
  const hide = useGameStore((s) => s.hideTabBanner)
  const reload = useGameStore((s) => s.reloadFromDisk)
  if (!show) return null
  return (
    <div className="fixed top-0 inset-x-0 z-[70] bg-warning-50 border-b border-warning-200 text-sm text-gray-700 px-4 py-2.5 flex items-center gap-3">
      <span>⚠ 检测到其他标签页更新了存档</span>
      <div className="ml-auto flex gap-2">
        <button onClick={reload} className="text-xs bg-primary-500 text-gray-50 rounded-lg px-3 py-1.5">
          载入最新存档
        </button>
        <button onClick={hide} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5">
          留在此页继续（之后会覆盖）
        </button>
      </div>
    </div>
  )
}
