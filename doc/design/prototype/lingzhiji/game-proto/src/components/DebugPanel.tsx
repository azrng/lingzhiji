import { useState } from 'react'
import { useGame } from '../store'
import { Btn } from './ui'

// 调试面板：原型专用，用于快速到达各状态做确认；正式实现无此面板
export default function DebugPanel() {
  const [open, setOpen] = useState(false)
  const s = useGame()
  return (
    <div className="fixed bottom-4 left-4 z-[60]">
      {open && (
        <div className="mb-2 bg-gray-900/90 text-gray-100 rounded-xl p-3 w-56 flex flex-col gap-1.5 text-xs">
          <div className="text-gray-400 tracking-widest mb-1">调试 · 原型专用</div>
          <Dbg label="+50 灵石" a="stones" />
          <Dbg label="+3 灵气" a="qi" />
          <Dbg label="+100 心得" a="insight" />
          <Dbg label="修为 +50" a="exp" />
          <Dbg label="跳到本月第 30 天" a="day30" />
          <Dbg label="直达筑基结算" a="milestone" />
          <Dbg label="收回一块灵田" a="confiscate" />
          <Dbg label={`词库异常态：${s.libError ? '开' : '关'}`} a="libError" />
          <Dbg label={`多标签横幅：${s.tabBanner ? '开' : '关'}`} a="tabBanner" />
          <Btn variant="danger" className="!py-1.5 mt-1" onClick={() => useGame.getState().dbg('reset')}>重置演示</Btn>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="bg-gray-800/80 text-gray-100 text-xs rounded-full px-3.5 py-2 shadow-lg hover:bg-gray-800"
      >
        🐞 调试
      </button>
    </div>
  )
}

function Dbg({ label, a }: { label: string; a: Parameters<ReturnType<typeof useGame.getState>['dbg']>[0] }) {
  return (
    <button onClick={() => useGame.getState().dbg(a)} className="text-left bg-gray-800 rounded-lg px-3 py-1.5 hover:bg-gray-700">
      {label}
    </button>
  )
}
