import { monthOf, useGame } from '../store'
import { QI_CAP, REALM_EXP, REALM_NAMES } from '../mock'
import { Btn, Pips, Sprite } from './ui'

// 顶部状态栏：日期、境界与修为进度、资源、设置入口
export default function TopBar() {
  const s = useGame()
  const next = REALM_EXP[s.realm + 1] ?? REALM_EXP[s.realm]
  const cur = REALM_EXP[s.realm]
  const pct = s.realm >= 9 ? 100 : Math.min(100, Math.round(((s.cultivation - cur) / (next - cur)) * 100))
  return (
    <header className="bg-gray-50 border border-gray-200 rounded-2xl shadow-md px-5 py-3 mb-4 flex items-center gap-5 flex-wrap">
      <div>
        <div className="text-[11px] text-gray-500 tracking-[0.22em]">入宗</div>
        <div className="text-lg text-info-600 font-semibold tracking-wide">
          第 {monthOf(s.day)} 月 · 第 {((s.day - 1) % 30) + 1} 天
        </div>
      </div>
      <div className="min-w-40">
        <div className="text-[11px] text-gray-500 tracking-[0.22em]">境界</div>
        <div className="text-lg text-info-600 font-semibold">{REALM_NAMES[s.realm]}</div>
        <div className="w-36 h-2 bg-gray-200 rounded-full overflow-hidden mt-1">
          <div className="h-full bg-gold rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          修为 {s.cultivation}/{s.realm >= 9 ? '—' : next}
        </div>
      </div>
      <div className="flex items-center gap-5 flex-wrap text-sm">
        <Res sheet="resource-icons-sheet.png" cols={4} rows={2} col={0} row={0} label="灵石" value={s.stones} />
        <Res sheet="resource-icons-sheet.png" cols={4} rows={2} col={1} row={0} label="贡献" value={s.contribution} />
        <div>
          <div className="flex items-center gap-1.5">
            <Sprite sheet="resource-icons-sheet.png" cols={4} rows={2} col={2} row={0} size={18} />
            <b className="text-info-600">{s.qi}</b>
            <Pips value={s.qi} cap={QI_CAP[s.realm]} />
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">灵气 / 上限 {QI_CAP[s.realm]}</div>
        </div>
        <Res sheet="resource-icons-sheet.png" cols={4} rows={2} col={3} row={0} label="心得" value={s.insight} />
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-xs text-gray-500">功法 Lv{s.gongfa}</span>
        <Btn variant="secondary" onClick={() => useGame.setState({ settingsOpen: true })}>
          设置
        </Btn>
      </div>
    </header>
  )
}

function Res({ sheet, cols, rows, col, row, label, value }: {
  sheet: string; cols: number; rows: number; col: number; row: number; label: string; value: number
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Sprite sheet={sheet} cols={cols} rows={rows} col={col} row={row} size={18} />
        <b className="text-info-600">{value}</b>
      </div>
      <div className="text-[11px] text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}
