import { useState } from 'react'
import { monthOf } from '../game/economy'
import { QI_CAP, REALM_EXP, REALM_NAMES, seasonDefOf } from '../game/constants'
import { useGameStore } from '../stores/useGameStore'
import { useUiStore } from '../stores/useUiStore'
import CalendarModal from './CalendarModal'
import { assetUrl } from '../assetUrl'
import { Pips, Sprite } from './ui'

// 顶部状态栏：日期、境界与修为进度、资源、道心入口、设置入口
export default function TopBar() {
  const g = useGameStore((s) => s.game)
  const next = REALM_EXP[g.realm + 1] ?? REALM_EXP[g.realm]
  const cur = REALM_EXP[g.realm]
  const pct = g.realm >= 9 ? 100 : Math.min(100, Math.round(((g.cultivation - cur) / (next - cur)) * 100))
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const checkedToday = g.streak.lastCheckinDay === g.realDay.today

  return (
    <header className="bg-gray-50/95 border border-gray-50 rounded-2xl shadow-lg px-4 py-4 mb-5 grid grid-cols-2 items-center gap-3 sm:px-5 md:flex md:gap-5 lg:gap-8 md:flex-wrap">
      <div className="order-1 md:order-none flex items-center gap-3 md:pr-4 md:border-r border-gray-200">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary-700 font-serif text-2xl text-gray-50">植</div>
        <div><div className="font-serif text-xl tracking-widest text-primary-900">灵植记</div><div className="text-xs text-gray-500">青云宗 · 灵植堂</div></div>
      </div>
      <div className="order-2 md:order-none">
        <div className="text-xs text-gray-500 tracking-widest">入宗时日</div>
        <div className="mt-1 text-base text-info-600 font-semibold tracking-wide">
          第 {monthOf(g.day)} 月 · 第 {((g.day - 1) % 30) + 1} 天
          <span className="ml-1.5 text-xs font-normal text-primary-600">{seasonDefOf(monthOf(g.day)).name}</span>
        </div>
        {/* 地力透支标签（real-day.md §4）：当日第 2+ 游戏日起附在日期区 */}
        {g.realDay.gamesToday >= 1 && (
          <span
            className="mt-1 inline-block rounded-md border border-warning-200 bg-warning-50 px-1.5 py-0.5 text-[11px] text-warning-500"
            title="同一现实日推进多个游戏日，灵田疲惫：收获修为减半、日终事件更频繁"
          >
            地力透支 · 今日第 {g.realDay.gamesToday + 1} 个游戏日
          </span>
        )}
      </div>
      <div className="order-3 md:order-none min-w-0 md:min-w-40" title="修为满后自动突破：解锁更高境界灵草与更多灵田；吐纳与收获可得修为">
        <div className="text-xs text-gray-500 tracking-widest">当前境界</div>
        <div className="text-base text-info-600 font-semibold">{REALM_NAMES[g.realm]}</div>
        <div className="w-36 h-2 bg-gray-200 rounded-full overflow-hidden mt-1">
          <div className="h-full bg-gold rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs text-gray-500 mt-0.5">修为 {g.cultivation}/{g.realm >= 9 ? '—' : next}</div>
      </div>
      <div className="order-5 md:order-none col-span-2 flex items-center gap-x-4 gap-y-2 flex-wrap text-sm rounded-xl bg-primary-50/70 px-3 py-2">
        <Res col={0} row={0} label="灵石" value={g.resources.stones} />
        <Res col={1} row={0} label="贡献" value={g.resources.contribution} />
        {/* 与 Res 同构（上行图标+数值、下行二字标签），上限并入数值展示保证上限变化时当前值清晰 */}
        <div title={`任务堂获得（合格 +3）；播种与灌注消耗；当前上限 ${QI_CAP[g.realm]}`}>
          <div className="flex items-center gap-1.5">
            <Sprite sheet="resource-icons-sheet.png" cols={4} rows={2} col={2} row={0} size={18} />
            <b className="text-info-600 tabular-nums">{g.resources.qi}/{QI_CAP[g.realm]}</b>
            <Pips value={g.resources.qi} cap={QI_CAP[g.realm]} />
          </div>
          <div className="text-xs text-gray-600 mt-0.5">灵气</div>
        </div>
        <Res col={3} row={0} label="心得" value={g.resources.insight} />
      </div>
      <div className="order-4 md:order-none ml-auto flex items-center gap-3">
        <span className="text-xs text-gray-600" title="修炼加成等级；详情与进阶见下方「功法」按钮">功法 Lv{g.gongfa}</span>
        {/* 道心徽标（real-day.md §4）：🕯 + 连胜数，当日已打卡 ✓ / 未打卡 ⚠，点击开修行日历 */}
        <button
          onClick={() => setCalendarOpen(true)}
          title={checkedToday ? '今日已打卡 · 点击查看修行日历' : '今日未打卡：完成 10 题即算，答错也算 · 点击查看修行日历'}
          className={`min-h-11 px-3 py-2 rounded-xl text-sm font-medium border flex items-center gap-1.5 ${
            checkedToday ? 'bg-success-50 border-success-200 text-success-500' : 'bg-warning-50 border-warning-200 text-warning-500'
          }`}
        >
          {/* 道心烛火图标（roadmap-assets.md #11）：替换原 emoji 🕯 兜底 */}
          <img src={assetUrl('icon-daoxin-candle.png')} alt="" aria-hidden width={18} height={18} className="flex-none" />
          <span>道心 {g.streak.count}</span>
          <span aria-label={checkedToday ? '今日已打卡' : '今日未打卡'}>{checkedToday ? '✓' : '⚠'}</span>
        </button>
        <button onClick={() => setSettingsOpen(true)} className="min-h-11 px-4 py-2 rounded-xl text-sm font-medium bg-gray-50 text-gray-700 border border-gray-300 hover:bg-gray-150">
          设置
        </button>
      </div>
      {calendarOpen && <CalendarModal onClose={() => setCalendarOpen(false)} />}
    </header>
  )
}

// 资源悬浮说明（口径与引擎一致）：新增资源时在此登记一句来源与用途
const RES_TIPS: Record<string, string> = {
  灵石: '通货：出售灵草与行情事件获得；坊市购买消耗',
  贡献: '任务堂合格 +5、月末足额缴定额 +10；用于赎回灵田（100）与功法进阶',
  心得: '任务堂与功法残卷获得；攒 100 可功法进阶一级',
}

function Res({ col, row, label, value }: { col: number; row: number; label: string; value: number }) {
  return (
    <div title={RES_TIPS[label]}>
      <div className="flex items-center gap-1.5">
        <Sprite sheet="resource-icons-sheet.png" cols={4} rows={2} col={col} row={row} size={18} />
        <b className="text-info-600 tabular-nums">{value}</b>
      </div>
      <div className="text-xs text-gray-600 mt-0.5">{label}</div>
    </div>
  )
}
