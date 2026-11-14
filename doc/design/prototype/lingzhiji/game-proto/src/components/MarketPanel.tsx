import { useState } from 'react'
import { useGame } from '../store'
import { convertRate, herbById, HERBS, HerbId } from '../mock'
import { Btn, Modal, Sprite } from './ui'

// 坊市：买（种子/残卷）/ 卖（灵草），0 AP 随时可去
export default function MarketPanel() {
  const s = useGame()
  const [tab, setTab] = useState<'buy' | 'sell'>('buy')
  const [confirmLocked, setConfirmLocked] = useState<HerbId | null>(null)
  const mult = s.pendingTomorrow.marketMult

  const goodsPos: Record<HerbId, [number, number]> = {
    qingling: [0, 0], ninglu: [1, 0], ziyun: [2, 0], chisui: [3, 0], longxue: [0, 1], jiuye: [1, 1],
  }
  const realmName = (r: number) => ['练气一层', '练气二层', '练气三层', '练气四层', '练气五层', '练气六层', '练气七层', '练气八层', '练气九层'][r]

  return (
    <Modal title="坊市" onClose={() => useGame.getState().closeOverlay('market')} wide>
      {mult && (
        <div className={`text-xs rounded-lg px-3 py-2 mb-4 border ${mult > 1 ? 'bg-success-50 border-success-200 text-success-500' : 'bg-warning-50 border-warning-200 text-warning-500'}`}>
          今日行情：灵草售价 {mult > 1 ? '+50%' : '−30%'}（明日起恢复）
        </div>
      )}
      <div className="flex gap-2 mb-4">
        {(['buy', 'sell'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm border ${tab === t ? 'bg-primary-500 text-gray-50 border-primary-500' : 'bg-gray-50 text-gray-600 border-gray-300'}`}
          >
            {t === 'buy' ? '购买' : '出售'}
          </button>
        ))}
      </div>

      {tab === 'buy' && (
        <div className="flex flex-col gap-2.5">
          {HERBS.map((h) => {
            const price = s.realm >= 5 ? Math.ceil(h.price * 0.9) : h.price
            const locked = s.realm < h.realm
            const poor = s.stones < price
            return (
              <div key={h.id}>
                <div className="flex items-center gap-3 bg-gray-100 rounded-xl px-3 py-2.5">
                  <Sprite sheet="market-goods-sheet.png" cols={4} rows={2} col={goodsPos[h.id][0]} row={goodsPos[h.id][1]} size={38} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800">
                      {h.name}种
                      {s.realm >= 5 && <span className="text-xs text-gold-ink ml-1.5">九折 {Math.ceil(h.price * 0.9)} 灵石</span>}
                    </div>
                    <div className="text-xs text-gray-500">
                      {price} 灵石 · 播种需 {realmName(h.realm)} + {h.qi} 灵气 · 折算定额 {convertRate(h)} 株/茬
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 whitespace-nowrap">持有 {s.seeds[h.id]}</div>
                  <Btn className="!py-1.5" disabled={poor}
                    onClick={() => (locked ? setConfirmLocked(h.id) : useGame.getState().buySeed(h.id))}>
                    购买
                  </Btn>
                </div>
                {poor && <div className="text-xs text-warning-500 mt-1 ml-2">灵石不足（还差 {price - s.stones}）</div>}
              </div>
            )
          })}
          <div className="flex items-center gap-3 bg-gray-100 rounded-xl px-3 py-2.5">
            <Sprite sheet="market-goods-sheet.png" cols={4} rows={2} col={2} row={1} size={38} />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-800">功法残卷</div>
              <div className="text-xs text-gray-500">120 灵石 · 打开后心得 +30</div>
            </div>
            <Btn className="!py-1.5" disabled={s.stones < 120} onClick={() => useGame.getState().buyScroll()}>购买</Btn>
          </div>
          <p className="text-xs text-gray-400 mt-1">购买未达境界的种子前会确认提示；播种条件另在灵田判断。</p>
        </div>
      )}

      {tab === 'sell' && (
        <div className="flex flex-col gap-2.5">
          {HERBS.filter((h) => s.inventory[h.id] > 0).length === 0 && (
            <div className="text-sm text-gray-400 text-center py-8">暂无灵草可出售 · 去灵田收获吧</div>
          )}
          {HERBS.filter((h) => s.inventory[h.id] > 0).map((h) => {
            const unit = Math.max(1, Math.floor(h.sell * (mult ?? 1)))
            return (
              <div key={h.id} className="flex items-center gap-3 bg-gray-100 rounded-xl px-3 py-2.5">
                <Sprite sheet="market-goods-sheet.png" cols={4} rows={2} col={3} row={1} size={38} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">{h.name} ×{s.inventory[h.id]}</div>
                  <div className="text-xs text-gray-500">单价 {unit} 灵石{mult ? '（行情价）' : ''} · 折算定额 {convertRate(h)}</div>
                </div>
                <Btn variant="secondary" className="!py-1.5" onClick={() => useGame.getState().sellHerb(h.id, 1)}>卖 1</Btn>
                <Btn variant="secondary" className="!py-1.5" onClick={() => useGame.getState().sellHerb(h.id, s.inventory[h.id])}>卖全部</Btn>
              </div>
            )
          })}
          <p className="text-xs text-warning-500 mt-1">提示：缴纳定额按折算值计，出售前先确认月末需求。</p>
        </div>
      )}

      {confirmLocked && (
        <div className="fixed inset-0 z-50 bg-gray-900/40 flex items-center justify-center p-4">
          <div className="bg-gray-50 rounded-2xl shadow-lg max-w-sm w-full p-6">
            <div className="text-sm text-gray-700 leading-relaxed">
              <b>{herbById(confirmLocked).name}种</b>需{realmName(herbById(confirmLocked).realm)}才可播种，当前境界无法使用。仍要购买？
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <Btn variant="secondary" onClick={() => setConfirmLocked(null)}>取消</Btn>
              <Btn onClick={() => { useGame.getState().buySeed(confirmLocked); setConfirmLocked(null) }}>仍要购买</Btn>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
