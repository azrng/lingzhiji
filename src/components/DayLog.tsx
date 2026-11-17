import { useGameStore } from '../stores/useGameStore'
import { characterImage } from '../game/characters'
import { LogIcon, Sprite } from './ui'

// 侧边日志（定稿构图）：弟子头像 + 当日/近期记录流
export default function DayLog() {
  const log = useGameStore((s) => s.game.log)
  const characterId = useGameStore((s) => s.game.characterId)
  return (
    <aside className="bg-gray-50/95 border border-gray-50 rounded-3xl shadow-lg p-4 sm:p-5 flex flex-col gap-4 lg:w-80 flex-none">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-primary-50 to-primary-200/70 px-4 pt-3 text-center">
        <div className="absolute left-4 top-4 text-xs tracking-widest text-primary-700">青云 · 弟子</div>
        <img src={characterImage(characterId)} alt="当前弟子形象" className="mx-auto h-56 max-w-full object-contain drop-shadow-md" />
        <div className="relative pb-4">
          <div className="font-serif text-xl text-primary-900 tracking-widest">外门灵植弟子</div>
          <div className="mt-1 text-xs text-gray-600">一同照看这方灵田</div>
        </div>
      </div>
      <div className="flex items-center justify-between border-b border-gray-200 pb-3">
        <div><div className="font-serif text-lg text-info-600 tracking-widest">修行手记</div><div className="text-xs text-gray-500 mt-1">记录灵田里的点滴</div></div>
        <span className="text-xs text-gray-500">最近 {log.length} 条</span>
      </div>
      <div className="flex flex-col gap-3 overflow-y-auto max-h-80">
        {log.length === 0 && (
          <div className="rounded-xl bg-gray-100 px-4 py-6 text-center text-sm leading-6 text-gray-600">今日的故事还未写下<br />去灵田看看吧</div>
        )}
        {log.map((l, i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl bg-gray-100/70 px-3 py-2.5 text-sm">
            {l.evPos ? (
              <Sprite sheet={l.evSheet ?? 'event-icons-sheet.png'} cols={5} rows={l.evSheet ? 1 : 2} col={l.evPos[0]} row={l.evPos[1]} size={18} className="mt-0.5" />
            ) : (
              <LogIcon icon={l.icon} className="w-[18px] text-center" />
            )}
            <div className="min-w-0">
              <div className="text-gray-700 leading-snug">{l.title}</div>
              <div className="text-xs text-gray-500 leading-snug">{l.text}</div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
