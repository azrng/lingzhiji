import { useState } from 'react'
import { HERBS, HERB_BY_ID } from '../game/constants'
import { convertRate } from '../game/economy'
import { commissionFake, rewardText } from '../game/commissions'
import type { CommissionReward, CommissionSnapshot, DemoMode } from '../game/commissions'
import { useUiStore } from '../stores/useUiStore'
import { Btn, Modal, Sprite } from './ui'

// 灵植堂委托弹层（cultivation-commissions.md §3.4/§4）：沉淀型原型，数据经 CommissionService
// 接口由 Fake 注入，不连引擎。定额储备 = 仓库折算合计（同 QuotaModal 口径），交付扣库存会降低它。
export default function CommissionModal() {
  const setCommissionOpen = useUiStore((s) => s.setCommissionOpen)
  const [snap, setSnap] = useState<CommissionSnapshot>(() => commissionFake.snapshot())
  const [rewardFlash, setRewardFlash] = useState<CommissionReward | null>(null)
  const refresh = () => setSnap(commissionFake.snapshot())

  // 仓库折算合计（本月可缴能力）；交付预览 = 合计 − 目标草折算
  const ownedTotal = HERBS.reduce((a, h) => a + convertRate(h) * (snap.inventory[h.id] ?? 0), 0)
  const active = snap.active
  const activeShort = active ? Math.max(0, active.count - (snap.inventory[active.herb] ?? 0)) : 0
  const activeAfter = active ? ownedTotal - convertRate(HERB_BY_ID[active.herb]) * active.count : ownedTotal
  const herbIndex = (id: string) => HERBS.findIndex((h) => h.id === id)

  const deliver = () => {
    const reward = commissionFake.deliver()
    if (reward) setRewardFlash(reward)
    refresh()
  }
  const abandon = () => {
    commissionFake.abandon()
    setRewardFlash(null)
    refresh()
  }
  const accept = (id: string) => {
    commissionFake.accept(id)
    refresh()
  }
  const setDemo = (mode: DemoMode) => {
    commissionFake.setDemoMode(mode)
    setRewardFlash(null)
    refresh()
  }

  return (
    <Modal title={`灵植堂委托 · 第 ${snap.month} 月`} onClose={() => setCommissionOpen(false)}>
      {/* 原型演示横幅：Fake 库存与真实仓库数字不一致会误导玩家（试玩实录：新档 0 库存却显示 6 株），转正接引擎时随 Fake 一起移除 */}
      <div className="mb-4 text-xs leading-relaxed text-warning-500 bg-warning-50 border border-warning-200 rounded-xl px-4 py-2.5">
        ⚠ 原型演示：本弹窗的仓库数量、定额储备与奖励均为示例数据，尚未接入您的真实仓库。
      </div>
      {snap.invalid ? (
        <p className="text-sm text-error-400 bg-error-400/10 border border-error-400/30 rounded-xl p-4 leading-relaxed">
          委托数据无效，请导入有效存档。
        </p>
      ) : (
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
                  <div className="text-xs text-gray-500">奖励：{rewardText(active.reward)}（示例值，待平衡）</div>
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
                      折算 {convertRate(HERB_BY_ID[offer.herb]) * offer.count} 株当量 · 奖励：{rewardText(offer.reward)}（示例值）
                    </div>
                  </div>
                  <Btn variant="secondary" onClick={() => accept(offer.id)}
                    title="接取不消耗行动力与资源；每月最多接取 1 份，放弃后本月不能再接">接取</Btn>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* 原型演示辅助：Fake 三态切换，转正时随 Fake 一起移除 */}
      <div className="mt-4 pt-3 border-t border-gray-200 flex items-center gap-2 text-xs text-gray-400">
        <span>原型演示态：</span>
        {(['normal', 'empty', 'error'] as DemoMode[]).map((m) => (
          <button key={m} onClick={() => setDemo(m)} className="hover:text-gray-600 underline decoration-dotted">
            {m === 'normal' ? '正常' : m === 'empty' ? '空态' : '错误态'}
          </button>
        ))}
      </div>
    </Modal>
  )
}
