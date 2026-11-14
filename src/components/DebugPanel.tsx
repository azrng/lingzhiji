import { useState } from 'react'
import { useGameStore } from '../stores/useGameStore'

// 调试面板（PRD §4：?debug=1 仅验证用）：跳天、加资源等，常规入口不可见
const DEBUG_ON = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1'

export default function DebugPanel() {
  const [open, setOpen] = useState(false)
  const game = useGameStore((s) => s.game)
  const startNew = useGameStore((s) => s.startNew)
  if (!DEBUG_ON) return null

  const jumpDay30 = () => {
    // 调试直达：把 day 调到本月 30 号（直接改 game state，仅调试路径绕过 dispatch）
    const base = Math.floor((game.day - 1) / 30) * 30
    useGameStore.setState({ game: { ...game, day: base + 30 } })
  }

  return (
    <div className="fixed bottom-4 left-4 z-[60]">
      {open && (
        <div className="mb-2 bg-gray-900/90 text-gray-100 rounded-xl p-3 w-56 flex flex-col gap-1.5 text-xs">
          <div className="text-gray-400 tracking-widest mb-1">调试 · 仅 ?debug=1 可见</div>
          <Dbg label="+50 灵石" onClick={() => useGameStore.setState({ game: { ...game, resources: { ...game.resources, stones: game.resources.stones + 50 } } })} />
          <Dbg label="+3 灵气" onClick={() => useGameStore.setState({ game: { ...game, resources: { ...game.resources, qi: Math.min(9, game.resources.qi + 3) } } })} />
          <Dbg label="+100 心得" onClick={() => useGameStore.setState({ game: { ...game, resources: { ...game.resources, insight: game.resources.insight + 100 } } })} />
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
