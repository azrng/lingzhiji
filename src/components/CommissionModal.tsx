import { useState } from 'react'
import { HERBS, HERB_BY_ID } from '../game/constants'
import { convertRate } from '../game/economy'
import { rewardText, snapshot } from '../game/commissions'
import type { CommissionReward } from '../game/commissions'
import { useGameStore } from '../stores/useGameStore'
import { useUiStore } from '../stores/useUiStore'
import { Btn, Modal, Sprite } from './ui'

// 灵植堂委托弹层（cultivation-commissions.md §3.4/§4）：真实引擎数据（存档 v6），
// 快照由 GameState 派生，动作走 engine dispatch。定额储备 = 仓库折算合计（同 QuotaModal 口径），交付扣库存会降低它。
export default function CommissionModal() {
  const setCommissionOpen = useUiStore((s) => s.setCommissionOpen)
  const g = useGameStore((s) => s.game)
  const act = useGameStore((s) => s.act)
  const snap = snapshot(g)
  const [rewardFlash, setRewardFlash] = useState<CommissionReward | null>(null)

  // 仓库折算合计（本月可缴能力）；交付预览 = 合计 − 目标草折算
  const ownedTotal = HERBS.reduce((a, h) => a + convertRate(h) * (snap.inventory[h.id] ?? 0), 0)
  const active = snap.active
  const activeShort = active ? Math.max(0, active.count - (snap.inventory[active.herb] ?? 0)) : 0
  const activeAfter = active ? ownedTotal - convertRate(HERB_BY_ID[active.herb]) * active.count : ownedTotal
  const herbIndex = (id: string) => HERBS.findIndex((h) => h.id === id)

  const deliver = () => {
    // 成功后以接取时的活跃委托展示奖励一次；库存不足被按钮禁用兜底（引擎侧同样校验）
    const reward = active!.reward
    if (act({ type: 'COMMISSION_DELIVER' }).ok) setRewardFlash(reward)
  }
  const abandon = () => {
    act({ type: 'COMMISSION_ABANDON' })
    setRewardFlash(null)
  }
  const accept = (id: string) => act({ type: 'COMMISSION_ACCEPT', offerId: id })

  return (
    <Modal title={`灵植堂委托 · 第 ${snap.month} 月`} onClose={() => setCommissionOpen(false)}>
      <div className="flex flex-col gap-3">
        {rewardFlash && (
          <div className="text-sm text-success-500 bg-success-50 border border-success-200 rounded-xl px-4 py-3">
            ✓ 交付成功：{rewardText(rewardFlash)} · 本月定额储备已同步更新
          </div>
        )}

        {/* 定额储备总览：交付委托会因扣库存而降低此值，预览在活跃区细说 */}
        <div className="bg-gold-pale border border-gold rounded-xl p-4 text-sm text-gold-ink">
          宗门定额储备：<b>{ownedTotal} / {snap.quotaTarget}</b> 株当量
          <div className="text-xs mt-1">月末按此仓库折算缴纳；委托交付的灵草会先从储备中扣减</div>
        </div>

        {active ? (
          <>
            <div className="flex items-center gap-3 bg-gray-100 rounded-xl px-3 py-3">
              <Sprite sheet="spirit-herbs-sheet.webp" cols={3} rows={2} col={herbIndex(active.herb) % 3} row={Math.floor(herbIndex(active.herb) / 3)} size={30} />
              <div className="flex-1 text-sm">
                <b>{HERB_BY_ID[active.herb].name} ×{active.count}</b>
                <div className="text-xs text-gray-500">奖励：{rewardText(active.reward)}</div>
              </div>
              <div className="text-xs text-right text-gray-500">
                当前仓库 {snap.inventory[active.herb] ?? 0} 株
                {activeShort > 0 && <div className="text-error-400">还缺 {activeShort} 株</div>}
              </div>
            </div>

            {/* 交付预览（§4：库存扣减与定额影响主动确认区） */}
            <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-gray-700">
              交付预览：库存 −{active.count} · 定额储备 <b>{ownedTotal} → {activeAfter}</b> 株当量
              {activeAfter < snap.quotaTarget && (
                <span className="ml-1 text-warning-500">（距足额还差 {snap.quotaTarget - activeAfter}，月末需补足）</span>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Btn variant="secondary" onClick={abandon} title="放弃不扣库存、不处罚；本月接取资格仍消耗，下月刷新新委托">放弃委托</Btn>
              <Btn onClick={deliver} disabled={activeShort > 0}
                title={activeShort > 0 ? `库存不足，还缺 ${activeShort} 株` : '交付后扣除灵草并发放奖励，只结算一次'}>交付</Btn>
            </div>
          </>
        ) : snap.acceptedThisMonth ? (
          <p className="text-sm text-gray-500 text-center py-4">本月委托已接取（资格已消耗）· 下月刷新新委托</p>
        ) : snap.offers.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">本月暂无可接委托 · 下月初刷新</p>
        ) : (
          snap.offers.map((offer) => {
            const idx = herbIndex(offer.herb)
            return (
              <div key={offer.id} className="flex items-center gap-3 bg-gray-100 rounded-xl px-3 py-3">
                <Sprite sheet="spirit-herbs-sheet.webp" cols={3} rows={2} col={idx % 3} row={Math.floor(idx / 3)} size={30} />
                <div className="flex-1 text-sm">
                  <b>{HERB_BY_ID[offer.herb].name} ×{offer.count}</b>
                  <div className="text-xs text-gray-500">
                    折算 {convertRate(HERB_BY_ID[offer.herb]) * offer.count} 株当量 · 奖励：{rewardText(offer.reward)}
                  </div>
                </div>
                <Btn variant="secondary" onClick={() => accept(offer.id)}
                  title="接取不消耗行动力与资源；每月最多接取 1 份，放弃后本月不能再接">接取</Btn>
              </div>
            )
          })
        )}
      </div>
    </Modal>
  )
}
