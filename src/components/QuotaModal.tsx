import { useState } from 'react'
import { convertRate, monthOf } from '../game/economy'
import { QUOTA_TARGET, HERBS } from '../game/constants'
import { quotaConverted } from '../game/engine'
import { useGameStore } from '../stores/useGameStore'
import { Btn, Sprite } from './ui'

// 月末定额弹窗（economy.md §3.3）：按折算值选择整数株，足额才能缴纳；放弃按规则处罚。
// 由 GameScreen 在 game.phase === 'quota' 时渲染，不允许关闭（必须结算后推进）
export default function QuotaModal() {
  const g = useGameStore((s) => s.game)
  const act = useGameStore((s) => s.act)
  const [plan, setPlan] = useState<Partial<Record<string, number>>>({})
  const month = monthOf(g.day)

  const converted = quotaConverted(plan)
  const ownedTotal = HERBS.reduce((a, h) => a + convertRate(h) * g.inventory[h.id], 0)
  const ok = converted >= QUOTA_TARGET
  const firstMonth = month === 1

  const step = (id: string, d: number) => {
    const inv = g.inventory[id as keyof typeof g.inventory] ?? 0
    setPlan((p) => ({ ...p, [id]: Math.min(inv, Math.max(0, (p[id] ?? 0) + d)) }))
  }

  // 自动预填：按折算值从低到高，缴足即止
  const autofill = () => {
    let need = QUOTA_TARGET
    const p: Partial<Record<string, number>> = {}
    for (const h of [...HERBS].sort((a, b) => convertRate(a) - convertRate(b))) {
      const inv = g.inventory[h.id]
      const take = Math.min(inv, Math.ceil(need / convertRate(h)))
      if (take > 0) {
        p[h.id] = take
        need -= take * convertRate(h)
      }
      if (need <= 0) break
    }
    setPlan(p)
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/40 flex items-center justify-center p-4">
      <div className="bg-gray-50 rounded-2xl shadow-lg max-w-lg w-full flex flex-col max-h-[88vh]">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="font-serif text-lg text-info-600 tracking-widest">宗门定额 · 第 {month} 月</h3>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4">
          <div className="bg-gold-pale border border-gold rounded-xl p-4 text-sm text-gold-ink">
            本月需缴：<b>青灵草 ×{QUOTA_TARGET} 株</b>当量（可按折算以其他灵草代替）
            <div className="text-xs mt-1">库存折算合计 {ownedTotal} 株 {ownedTotal >= QUOTA_TARGET ? '· 足额 ✓' : '· 不足'}</div>
          </div>

          <div className="flex flex-col gap-2">
            {HERBS.filter((h) => g.inventory[h.id] > 0).map((h, i) => (
              <div key={h.id} className="flex items-center gap-3 bg-gray-100 rounded-xl px-3 py-2">
                <Sprite sheet="spirit-herbs-sheet.png" cols={3} rows={2} col={i % 3} row={Math.floor(i / 3)} size={30} />
                <div className="flex-1 text-sm">
                  {h.name}
                  <span className="text-xs text-gray-500 ml-1">1 株 = {convertRate(h)} 株当量</span>
                  <span className="text-xs text-gray-400 ml-1">持有 {g.inventory[h.id]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => step(h.id, -1)} className="w-7 h-7 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-150">−</button>
                  <span className="w-8 text-center text-sm font-medium">{plan[h.id] ?? 0}</span>
                  <button onClick={() => step(h.id, 1)} className="w-7 h-7 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-150">＋</button>
                </div>
                <span className="text-xs text-gray-500 w-14 text-right">= {(plan[h.id] ?? 0) * convertRate(h)} 株</span>
              </div>
            ))}
            {HERBS.every((h) => g.inventory[h.id] === 0) && (
              <div className="text-sm text-gray-400 text-center py-4">仓库没有任何灵草，无法缴纳</div>
            )}
          </div>

          {HERBS.some((h) => g.inventory[h.id] > 0) && (
            <button onClick={autofill} className="text-xs text-primary-500 hover:text-primary-600 text-left">按折算值从低到高自动预填 →</button>
          )}

          <div className="text-sm text-gray-700">
            已选折算合计：<b className={ok ? 'text-success-500' : 'text-warning-500'}>{converted}</b> / {QUOTA_TARGET} 株
          </div>

          {firstMonth ? (
            <div className="text-xs text-success-500 bg-success-50 border border-success-200 rounded-lg p-3">
              首月为适应期：未缴足不扣作物、不处罚、不计入连续欠缴；按期缴纳仍得贡献 +10
            </div>
          ) : (
            <div className="text-xs text-gray-500 bg-gray-100 rounded-lg p-3">
              缴足：贡献 +10，连续欠缴清零 ｜ 不缴或不足：贡献 −20、灵石 −10；连续两月欠缴将收回 1 块灵田（可花 100 贡献赎回）
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
          <span className="text-xs text-gray-400">超额不找零，未选作物留在仓库</span>
          <div className="flex gap-3">
            <Btn variant="secondary" onClick={() => act({ type: 'QUOTA_RESOLVE', pay: false, plan })}>
              {firstMonth ? '本月不缴（免罚）' : '本月不缴'}
            </Btn>
            <Btn disabled={!ok} onClick={() => act({ type: 'QUOTA_RESOLVE', pay: true, plan })}>确认缴纳</Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
