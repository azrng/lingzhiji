import { monthOf } from '../game/economy'
import { QI_CAP, REALM_EXP, REALM_NAMES } from '../game/constants'
import { useGameStore } from '../stores/useGameStore'
import { useUiStore } from '../stores/useUiStore'
import { Pips, Sprite } from './ui'

// 顶部状态栏：日期、境界与修为进度、资源、设置入口
export default function TopBar() {
  const g = useGameStore((s) => s.game)
  const next = REALM_EXP[g.realm + 1] ?? REALM_EXP[g.realm]
  const cur = REALM_EXP[g.realm]
  const pct = g.realm >= 9 ? 100 : Math.min(100, Math.round(((g.cultivation - cur) / (next - cur)) * 100))
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)

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
        </div>
      </div>
      <div className="order-3 md:order-none min-w-0 md:min-w-40">
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
        <div>
          <div className="flex items-center gap-1.5">
            <Sprite sheet="resource-icons-sheet.png" cols={4} rows={2} col={2} row={0} size={18} />
            <b className="text-info-600">{g.resources.qi}</b>
            <Pips value={g.resources.qi} cap={QI_CAP[g.realm]} />
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">灵气 / 上限 {QI_CAP[g.realm]}</div>
        </div>
        <Res col={3} row={0} label="心得" value={g.resources.insight} />
      </div>
      <div className="order-4 md:order-none ml-auto flex items-center gap-3">
        <span className="text-xs text-gray-600">功法 Lv{g.gongfa}</span>
        <button onClick={() => setSettingsOpen(true)} className="min-h-11 px-4 py-2 rounded-xl text-sm font-medium bg-gray-50 text-gray-700 border border-gray-300 hover:bg-gray-150">
          设置
        </button>
      </div>
    </header>
  )
}

function Res({ col, row, label, value }: { col: number; row: number; label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Sprite sheet="resource-icons-sheet.png" cols={4} rows={2} col={col} row={row} size={18} />
        <b className="text-info-600">{value}</b>
      </div>
      <div className="text-xs text-gray-600 mt-0.5">{label}</div>
    </div>
  )
}
