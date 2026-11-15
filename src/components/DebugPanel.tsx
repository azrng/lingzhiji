import { useState } from 'react'
import { QI_CAP } from '../game/constants'
import { effDays } from '../game/farming'
import { persist } from '../game/save'
import { useGameStore } from '../stores/useGameStore'

// 调试面板（PRD §4：?debug=1 仅验证用）：跳天、加资源等，常规入口不可见。
// 直接改状态的调试项必须手动 persist，避免刷新后状态回退造成困惑。
const DEBUG_ON = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1'

export default function DebugPanel() {
  const [open, setOpen] = useState(false)
  const startNew = useGameStore((s) => s.startNew)
  const act = useGameStore((s) => s.act)
  if (!DEBUG_ON) return null

  // 直改 + 持久化的调试辅助（绕过 dispatch 的部分路径属调试专用）
  const patch = (mutate: (g: ReturnType<typeof useGameStore.getState>['game']) => void) => {
    const g = structuredClone(useGameStore.getState().game)
    mutate(g)
    useGameStore.setState({ game: g })
    persist(g)
  }

  const jumpDay30 = () => patch((g) => { g.day = Math.floor((g.day - 1) / 30) * 30 + 30 })

  return (
    <div className="fixed bottom-4 left-4 z-[60]">
      {open && (
        <div className="mb-2 bg-gray-900/90 text-gray-100 rounded-xl p-3 w-56 flex flex-col gap-1.5 text-xs">
          <div className="text-gray-400 tracking-widest mb-1">调试 · 仅 ?debug=1 可见</div>
          <Dbg label="+50 灵石" onClick={() => patch((g) => { g.resources.stones += 50 })} />
          <Dbg label="+3 灵气" onClick={() => patch((g) => { g.resources.qi = Math.min(QI_CAP[g.realm], g.resources.qi + 3) })} />
          <Dbg label="+100 心得" onClick={() => patch((g) => { g.resources.insight += 100 })} />
          <Dbg label="修为 +50（含突破）" onClick={() => { act({ type: 'DEBUG_CULTIVATE', amount: 50 }) }} />
          <Dbg label="1 号田立即成熟" onClick={() => patch((g) => {
            const f = g.fields.find((x) => x.id === 1)
            if (f && f.status === 'growing' && f.herb) {
              f.progress = effDays(f.herb, g.gongfa)
              f.status = 'mature'
            }
          })} />
          <Dbg label="跳到本月第 30 天" onClick={jumpDay30} />
          <Dbg label="重置开局" onClick={startNew} />
        </div>
      )}
      <button onClick={() => setOpen(!open)} className="bg-gray-800/80 text-gray-100 text-xs rounded-full px-3.5 py-2 shadow-lg hover:bg-gray-800">
        🐞 调试
      </button>
    </div>
  )
}

function Dbg({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left bg-gray-800 rounded-lg px-3 py-1.5 hover:bg-gray-700">
      {label}
    </button>
  )
}
