import { useState } from 'react'
import { convertRate, seedPrice } from '../game/economy'
import { HERBS, QUOTA_TARGET, REALM_NAMES } from '../game/constants'
import type { HerbId } from '../game/types'
import { useGameStore } from '../stores/useGameStore'
import { useUiStore } from '../stores/useUiStore'
import { Btn, Modal, Sprite } from './ui'

// 坊市：买（种子/残卷）/ 卖（灵草），0 AP 随时可去（economy.md §3.2）
const GOODS_POS: Record<HerbId, [number, number]> = {
  qingling: [0, 0], ninglu: [1, 0], ziyun: [2, 0], chisui: [3, 0], longxue: [0, 1], jiuye: [1, 1],
}

export default function MarketPanel() {
  const g = useGameStore((s) => s.game)
  const act = useGameStore((s) => s.act)
  const setMarketOpen = useUiStore((s) => s.setMarketOpen)
  const [tab, setTab] = useState<'buy' | 'sell'>('buy')
  const [confirmLocked, setConfirmLocked] = useState<HerbId | null>(null)
  const mult = g.pendingTomorrow.marketMult
  const inventoryValue = HERBS.reduce((sum, herb) => sum + convertRate(herb) * g.inventory[herb.id], 0)

  return (
    <Modal title="坊市" onClose={() => setMarketOpen(false)} wide>
      <div className="mb-5 rounded-2xl bg-primary-50 border border-primary-100 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-serif text-lg tracking-wider text-primary-900">灵物往来</p><p className="mt-1 text-sm text-gray-600">种子与灵草，在这里各得其所。</p></div>
        <div className="text-sm text-primary-800">持有灵石 <b className="text-lg">{g.resources.stones}</b></div>
      </div>
      {mult && (
        <div className={`text-xs rounded-lg px-3 py-2 mb-4 border ${mult > 1 ? 'bg-success-50 border-success-200 text-success-500' : 'bg-warning-50 border-warning-200 text-warning-500'}`}>
          今日行情：灵草售价 {mult > 1 ? '+50%' : '−30%'}（明日起恢复）
        </div>
      )}
      <div className="flex gap-2 mb-4" role="group" aria-label="坊市交易类型">
        {(['buy', 'sell'] as const).map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
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
            const price = seedPrice(g, h.id)
            const locked = g.realm < h.realm
            const poor = g.resources.stones < price
            return (
              <div key={h.id}>
                <div className="flex items-start gap-3 bg-gray-100 rounded-xl px-3 py-3 sm:items-center">
                  <Sprite sheet="market-goods-sheet.png" cols={4} rows={2} col={GOODS_POS[h.id][0]} row={GOODS_POS[h.id][1]} size={48} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800">
                      {h.name}种
                      {g.realm >= 5 && <span className="text-xs text-gold-ink ml-1.5">九折</span>}
                      <span className="ml-2 text-xs font-normal text-gray-600">持有 {g.seeds[h.id]}</span>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-gray-600">
                      {price} 灵石 · 播种 {h.qi} 灵气<br />需{REALM_NAMES[h.realm]} · 定额折算 {convertRate(h)}
                    </div>
                  </div>
                  <Btn className="!min-h-11 !px-3" disabled={poor}
                    onClick={() => (locked ? setConfirmLocked(h.id) : act({ type: 'BUY_SEED', herb: h.id }))}>
                    购买
                  </Btn>
                </div>
                {poor && <div className="text-xs text-warning-500 mt-1 ml-2">灵石不足（还差 {price - g.resources.stones}）</div>}
              </div>
            )
          })}
          <div className="flex items-center gap-3 bg-gray-100 rounded-xl px-3 py-2.5">
            <Sprite sheet="market-goods-sheet.png" cols={4} rows={2} col={2} row={1} size={38} />
            <div className="flex-1" title="心得用于功法进阶（每级需 100 心得）">
              <div className="text-sm font-medium text-gray-800">功法残卷</div>
              <div className="text-xs text-gray-500">120 灵石 · 打开后心得 +30</div>
            </div>
            <Btn className="!py-1.5" disabled={g.resources.stones < 120} onClick={() => act({ type: 'BUY_SCROLL' })}>购买</Btn>
          </div>
          <p className="text-xs text-gray-400 mt-1">购买未达境界的种子前会确认提示；播种条件另在灵田判断。</p>
        </div>
      )}

      {tab === 'sell' && (
        <div className="flex flex-col gap-2.5">
          <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-gray-700">当前库存可折算 <b>{inventoryValue}</b> 株，月末定额为 {QUOTA_TARGET} 株；出售后库存会减少。</div>
          {HERBS.filter((h) => g.inventory[h.id] > 0).length === 0 && (
            <div className="text-sm text-gray-400 text-center py-8">暂无灵草可出售 · 去灵田收获吧</div>
          )}
          {HERBS.filter((h) => g.inventory[h.id] > 0).map((h) => {
            const unit = Math.max(1, Math.floor(h.sell * (mult ?? 1)))
            return (
              <div key={h.id} className="flex flex-wrap items-center gap-3 bg-gray-100 rounded-xl px-3 py-2.5">
                <Sprite sheet="market-goods-sheet.png" cols={4} rows={2} col={3} row={1} size={38} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">{h.name} ×{g.inventory[h.id]}</div>
                  <div className="text-xs text-gray-500">单价 {unit} 灵石{mult ? '（行情价）' : ''} · 折算定额 {convertRate(h)}</div>
                </div>
                <Btn variant="secondary" className="!py-1.5" onClick={() => act({ type: 'SELL_HERB', herb: h.id, count: 1 })}>卖 1</Btn>
                <Btn variant="secondary" className="!py-1.5" onClick={() => act({ type: 'SELL_HERB', herb: h.id, count: g.inventory[h.id] })}>卖全部</Btn>
              </div>
            )
          })}
          <p className="text-xs text-warning-500 mt-1">提示：缴纳定额按折算值计，出售前先确认月末需求。</p>
        </div>
      )}

      {confirmLocked && (
        <Modal title="确认购买" onClose={() => setConfirmLocked(null)}>
            <div className="text-sm text-gray-700 leading-relaxed">
              <b>{HERBS.find((h) => h.id === confirmLocked)!.name}种</b>需{REALM_NAMES[HERBS.find((h) => h.id === confirmLocked)!.realm]}才可播种，当前境界无法使用。仍要购买？
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <Btn variant="secondary" onClick={() => setConfirmLocked(null)}>取消</Btn>
              <Btn onClick={() => { act({ type: 'BUY_SEED', herb: confirmLocked }); setConfirmLocked(null) }}>仍要购买</Btn>
            </div>
        </Modal>
      )}
    </Modal>
  )
}
