import { useState } from 'react'
import { convertRate, eventMultOf, monthOf, seedPrice } from '../game/economy'
import { CHARMS, HERB_BY_ID, HERBS, MARKET_EVENT_BY_ID, QUOTA_TARGET, REALM_NAMES, seasonOf, topRealmHerb } from '../game/constants'
import type { HerbId } from '../game/types'
import { useGameStore } from '../stores/useGameStore'
import { useUiStore } from '../stores/useUiStore'
import { Btn, ConfirmOverlay, Modal, Sprite } from './ui'
// Sprite 仍用于残卷行；herbVisual 为坊市商品视觉（前 6 草图集位 + 新草 emoji 兜底）

// 坊市：买（种子/残卷）/ 卖（灵草），0 AP 随时可去（economy.md §3.2）
// 商品图集 4×2 仅前 6 草有位（T56 扩容新草 emoji 兜底，素材登记 roadmap-assets.md）
const GOODS_POS: Partial<Record<HerbId, [number, number]>> = {
  qingling: [0, 0], ninglu: [1, 0], ziyun: [2, 0], chisui: [3, 0], longxue: [0, 1], jiuye: [1, 1],
}
const herbVisual = (h: (typeof HERBS)[number], size: number) =>
  GOODS_POS[h.id] ? (
    <Sprite sheet="market-goods-sheet.webp" cols={4} rows={2} col={GOODS_POS[h.id]![0]} row={GOODS_POS[h.id]![1]} size={size} />
  ) : (
    <span
      className="rounded-lg bg-primary-50 border border-primary-100 inline-flex items-center justify-center shrink-0 select-none"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}
      aria-hidden
    >
      {h.emoji ?? '🌿'}
    </span>
  )

export default function MarketPanel() {
  const g = useGameStore((s) => s.game)
  const act = useGameStore((s) => s.act)
  const setMarketOpen = useUiStore((s) => s.setMarketOpen)
  const [tab, setTab] = useState<'buy' | 'sell'>('buy')
  const [confirmLocked, setConfirmLocked] = useState<HerbId | null>(null)
  const [confirmSell, setConfirmSell] = useState<{ herb: HerbId; count: number } | null>(null)
  const [sellQty, setSellQty] = useState<Partial<Record<HerbId, number>>>({})
  const inventoryValue = HERBS.reduce((sum, herb) => sum + convertRate(herb) * g.inventory[herb.id], 0)
  // 本月行情条（market-events.md §3.5，T57）：定向草动态解析出具体名称
  const marketEv = g.market.current ? MARKET_EVENT_BY_ID[g.market.current] : null
  const marketTargets = marketEv
    ? marketEv.target === '*' ? '全部灵草'
      : marketEv.target === 'topRealm' ? topRealmHerb(g.realm).name
        : marketEv.target === 'seasonal' ? HERBS.filter((h) => h.allSeason || h.seasons.includes(seasonOf(monthOf(g.day)))).map((h) => h.name).join('、')
          : marketEv.target.map((h) => HERB_BY_ID[h].name).join('、')
    : ''

  return (
    <Modal title="坊市" onClose={() => setMarketOpen(false)} wide>
      <div className="mb-5 rounded-2xl bg-primary-50 border border-primary-100 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-serif text-lg tracking-wider text-primary-900">灵物往来</p><p className="mt-1 text-sm text-gray-600">种子与灵草，在这里各得其所。</p></div>
        <div className="text-sm text-primary-800">持有灵石 <b className="text-lg">{g.resources.stones}</b></div>
      </div>
      {marketEv && (
        <div className="text-xs rounded-lg px-3 py-2 mb-4 border bg-primary-50 border-primary-100 text-primary-800">
          📣 本月行情：{marketEv.name}——{marketEv.desc}，{marketTargets}卖价 ×{marketEv.mult}（15 日预告下月行情）
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
                  {herbVisual(h, 48)}
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
            <Sprite sheet="market-goods-sheet.webp" cols={4} rows={2} col={2} row={1} size={38} />
            <div className="flex-1" title="心得用于功法进阶（每级需 100 心得）">
              <div className="text-sm font-medium text-gray-800">功法残卷</div>
              <div className="text-xs text-gray-500">120 灵石 · 打开后心得 +30</div>
            </div>
            <Btn className="!py-1.5" disabled={g.resources.stones < 120} onClick={() => act({ type: 'BUY_SCROLL' })}>购买</Btn>
          </div>
          {/* 珍品架（T64，T61 P0-a 轻量版）：灵石消耗端——策略符箓不限购，效果日限天然防囤积 */}
          <div className="mt-2 text-xs tracking-widest text-gold-ink">— 珍品架 —</div>
          {(Object.keys(CHARMS) as (keyof typeof CHARMS)[]).map((kind) => {
            const c = CHARMS[kind]
            return (
              <div key={kind} className="flex items-center gap-3 bg-gold-pale rounded-xl px-3 py-2.5 border border-gold/40">
                <span className="text-2xl select-none" aria-hidden>🧧</span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">{c.name}</div>
                  <div className="text-xs text-gray-500">{c.price} 灵石 · {c.desc}</div>
                </div>
                <Btn className="!py-1.5" disabled={g.resources.stones < c.price} onClick={() => act({ type: 'BUY_CHARM', kind })}>购买</Btn>
              </div>
            )
          })}
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
            const m = eventMultOf(g, h.id)
            const unit = Math.max(1, Math.floor(h.sell * m))
            const stock = g.inventory[h.id]
            const q = Math.min(sellQty[h.id] ?? 1, stock)
            const setQ = (n: number) => setSellQty((s) => ({ ...s, [h.id]: Math.max(1, Math.min(stock, n)) }))
            // 步进到最大且清仓致定额不足 → 先确认（沿 T54 保定额口径，范围扩大到任意数量）
            const sell = () => {
              const after = inventoryValue - convertRate(h) * q
              if (after < QUOTA_TARGET) setConfirmSell({ herb: h.id, count: q })
              else act({ type: 'SELL_HERB', herb: h.id, count: q })
              setSellQty((s) => ({ ...s, [h.id]: 1 }))
            }
            return (
              <div key={h.id} className="flex flex-wrap items-center gap-3 bg-gray-100 rounded-xl px-3 py-2.5">
                <Sprite sheet="market-goods-sheet.webp" cols={4} rows={2} col={3} row={1} size={38} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-800">{h.name} ×{stock}</div>
                  <div className="text-xs text-gray-500">单价 {unit} 灵石{m !== 1 ? `（行情 ×${m}）` : ''} · 折算定额 {convertRate(h)}</div>
                </div>
                {/* 数量步进（T61 P1-b：批量出售不再逐次点「卖 1」） */}
                <div className="flex items-center gap-1" role="group" aria-label={`${h.name}出售数量`}>
                  <button aria-label={`减少${h.name}出售数量`} className="!min-h-8 w-8 rounded-lg border border-gray-300 bg-gray-50 text-gray-600 disabled:opacity-40" disabled={q <= 1} onClick={() => setQ(q - 1)}>−</button>
                  <span className="w-8 text-center text-sm font-medium tabular-nums text-gray-800">{q}</span>
                  <button aria-label={`增加${h.name}出售数量`} className="!min-h-8 w-8 rounded-lg border border-gray-300 bg-gray-50 text-gray-600 disabled:opacity-40" disabled={q >= stock} onClick={() => setQ(q + 1)}>＋</button>
                  <button aria-label={`${h.name}数量设为最大`} className="!min-h-8 px-2 rounded-lg border border-gray-300 bg-gray-50 text-xs text-gray-600" onClick={() => setQ(stock)}>最大</button>
                </div>
                <Btn variant="secondary" className="!py-1.5" onClick={sell}>出售 ×{q}</Btn>
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

      {confirmSell && (() => {
        const h = HERBS.find((x) => x.id === confirmSell.herb)!
        const after = inventoryValue - convertRate(h) * confirmSell.count
        return (
          <ConfirmOverlay
            title="出售确认"
            body={`出售 ${h.name} ×${confirmSell.count} 后，定额储备折算 ${inventoryValue} → ${after}，不足以缴纳月末定额 ${QUOTA_TARGET} 株当量（还差 ${QUOTA_TARGET - after}）。确定仍要出售？`}
            confirmText="仍要出售"
            tone="danger"
            onConfirm={() => { act({ type: 'SELL_HERB', herb: h.id, count: confirmSell.count }); setConfirmSell(null) }}
            onCancel={() => setConfirmSell(null)}
          />
        )
      })()}
    </Modal>
  )
}
