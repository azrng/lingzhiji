import { useGame } from '../store'
import { Sprite } from './ui'

// 右上角事件/提示 toast 队列；多标签页横幅（调试演示用）
export function EventToasts() {
  const s = useGame()
  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 w-72">
      {s.toasts.map((t) => (
        <div
          key={t.id}
          className={`bg-gray-50 border rounded-xl shadow-lg px-4 py-3 flex items-start gap-3 ${
            t.tone === 'bad' ? 'border-error-200' : t.tone === 'gold' ? 'border-gold' : 'border-success-200'
          }`}
        >
          {t.evPos ? (
            <Sprite sheet="event-icons-sheet.png" cols={5} rows={2} col={t.evPos[0]} row={t.evPos[1]} size={22} className="mt-0.5" />
          ) : (
            <span className="text-lg leading-none mt-0.5">{t.icon ?? '·'}</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-gray-700 leading-snug">{t.title}</div>
            {t.text && <div className="text-xs text-gray-500 leading-snug mt-0.5">{t.text}</div>}
          </div>
          <button onClick={() => useGame.getState().dismissToast(t.id)} className="text-gray-400 hover:text-gray-600 text-xs">×</button>
        </div>
      ))}
    </div>
  )
}

export function TabBanner() {
  const s = useGame()
  if (!s.tabBanner) return null
  return (
    <div className="fixed top-0 inset-x-0 z-[70] bg-warning-50 border-b border-warning-200 text-sm text-gray-700 px-4 py-2.5 flex items-center gap-3">
      <span>⚠ 检测到其他标签页更新了存档（演示横幅）</span>
      <div className="ml-auto flex gap-2">
        <button onClick={() => useGame.getState().hideTabBanner()} className="text-xs bg-primary-500 text-gray-50 rounded-lg px-3 py-1.5">
          载入最新存档
        </button>
        <button onClick={() => useGame.getState().hideTabBanner()} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5">
          留在此页继续（之后会覆盖）
        </button>
      </div>
    </div>
  )
}
