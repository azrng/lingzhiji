import { useGameStore } from '../stores/useGameStore'
import { Sprite } from './ui'

// 侧边日志（定稿构图）：弟子头像 + 当日/近期记录流
export default function DayLog() {
  const log = useGameStore((s) => s.game.log)
  return (
    <aside className="bg-gray-50 border border-gray-200 rounded-2xl shadow-md p-4 flex flex-col gap-3 lg:w-72 flex-none">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-gray-200 bg-gray-100 flex-none">
          <img src="/assets/character-lingzhi-dizi.svg" alt="弟子" className="w-[175px] max-w-none -ml-[59px] -mt-[39px]" />
        </div>
        <div>
          <div className="font-serif text-base text-info-600 tracking-wider">外门灵植弟子</div>
          <div className="text-xs text-gray-500">青云宗 · 灵植堂</div>
        </div>
      </div>
      <div className="h-px bg-gray-200" />
      <div className="text-xs text-gray-500 tracking-widest">当日日志</div>
      <div className="flex flex-col gap-2 overflow-y-auto max-h-96">
        {log.length === 0 && (
          <div className="text-sm text-gray-400 py-6 text-center">暂无记录，完成行动后在此显示</div>
        )}
        {log.map((l, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            {l.evPos ? (
              <Sprite sheet="event-icons-sheet.png" cols={5} rows={2} col={l.evPos[0]} row={l.evPos[1]} size={18} className="mt-0.5" />
            ) : (
              <span className="w-[18px] text-center flex-none">{l.icon ?? '·'}</span>
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
