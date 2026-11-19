import { convertRate } from '../game/economy'
import { HERBS, QUOTA_TARGET } from '../game/constants'
import { useGameStore } from '../stores/useGameStore'
import { useUiStore } from '../stores/useUiStore'
import { Btn, Modal, Sprite } from './ui'

// 仓库（T51 方案 A）：成品灵草常驻查看位——各草库存（0 灰显）+ 定额储备折算合计（同坊市/定额口径）。
// 只读弹层不动引擎；出售引导去坊市（坊市承担交易职责，此处不重复）
export default function WarehouseModal() {
  const setWarehouseOpen = useUiStore((s) => s.setWarehouseOpen)
  const setMarketOpen = useUiStore((s) => s.setMarketOpen)
  const g = useGameStore((s) => s.game)
  // 仓库折算合计（本月可缴能力）：与 MarketPanel 出售页/QuotaModal 同一公式
  const ownedTotal = HERBS.reduce((a, h) => a + convertRate(h) * g.inventory[h.id], 0)
  const hasAny = HERBS.some((h) => g.inventory[h.id] > 0)

  return (
    <Modal title="仓库" onClose={() => setWarehouseOpen(false)}>
      <div className="rounded-xl border border-gold bg-gold-pale px-4 py-3 text-sm text-gold-ink">
        定额储备折算合计：<b>{ownedTotal} / {QUOTA_TARGET}</b> 株当量
        <div className="text-xs mt-1">月末定额按仓库折算缴纳；委托交付、坊市出售都会减少储备</div>
      </div>
      {!hasAny ? (
        <div className="text-sm text-gray-400 text-center py-8">仓库空空如也 · 去灵田收获吧</div>
      ) : (
        <div className="flex flex-col gap-2.5 mt-4">
          {HERBS.map((h, idx) => {
            const n = g.inventory[h.id]
            return (
              <div key={h.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${n > 0 ? 'bg-gray-100' : 'bg-gray-50 opacity-50'}`}>
                <Sprite sheet="spirit-herbs-sheet.webp" cols={3} rows={2} col={idx % 3} row={Math.floor(idx / 3)} size={30} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">{h.name} ×{n}</div>
                  <div className="text-xs text-gray-500">每株折算定额 {convertRate(h)} 当量</div>
                </div>
                {n > 0 && <span className="text-xs text-gray-400">合计折算 {convertRate(h) * n}</span>}
              </div>
            )
          })}
        </div>
      )}
      <div className="flex justify-between items-center mt-5">
        <p className="text-xs text-gray-400">出售灵草请前往坊市（不消耗行动力）</p>
        <div className="flex gap-3">
          <Btn variant="secondary" onClick={() => setWarehouseOpen(false)}>关闭</Btn>
          <Btn onClick={() => { setWarehouseOpen(false); setMarketOpen(true) }}>前往坊市</Btn>
        </div>
      </div>
    </Modal>
  )
}
