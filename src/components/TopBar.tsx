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
    <header className="bg-gray-50 border border-gray-200 rounded-2xl shadow-md px-5 py-3 mb-4 flex items-center gap-5 flex-wrap">
      <div>
        <div className="text-[11px] text-gray-500 tracking-[0.22em]">入宗</div>
        <div className="text-lg text-info-600 font-semibold tracking-wide">
          第 {monthOf(g.day)} 月 · 第 {((g.day - 1) % 30) + 1} 天
        </div>
      </div>
      <div className="min-w-40">
        <div className="text-[11px] text-gray-500 tracking-[0.22em]">境界</div>
        <div className="text-lg text-info-600 font-semibold">{REALM_NAMES[g.realm]}</div>
        <div className="w-36 h-2 bg-gray-200 rounded-full overflow-hidden mt-1">
          <div className="h-full bg-gold rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs text-gray-500 mt-0.5">修为 {g.cultivation}/{g.realm >= 9 ? '—' : next}</div>
      </div>
      <div className="flex items-center gap-5 flex-wrap text-sm">
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
      <div className="ml-auto flex items-center gap-3">
        <span className="text-xs text-gray-500">功法 Lv{g.gongfa}</span>
        <button onClick={() => setSettingsOpen(true)} className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-50 text-gray-700 border border-gray-600 hover:bg-gray-150">
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
      <div className="text-[11px] text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}
