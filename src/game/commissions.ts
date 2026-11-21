// 灵植堂委托（cultivation-commissions.md，M6b）：引擎侧实现（存档 v6 起接真实 GameState）。
// 月初在 advanceDay 生成选项（境界可播种池 + 确定性 rng，结果入档刷新不重抽）；
// 接取/交付/放弃为 0 AP 引擎动作。定额储备不在快照单列：视图用 convertRate 对 inventory 求合计（同 QuotaModal 口径）。
import { COMMISSION_OFFERS, COMMISSION_QUOTA_EQUIV, COMMISSION_SEED_REWARD, HERB_BY_ID, HERBS, QUOTA_TARGET, seasonOf } from './constants'
import { convertRate, monthOf } from './economy'
import { addLog } from './log'
import type { Rng } from './rng'
import type { CommissionOffer, CommissionReward, CommissionsState, GameState, HerbId, ReasonCode } from './types'

export type { CommissionOffer, CommissionReward }

// 空委托状态：新档开局与 v5→v6 迁移共用；首月不出委托（需求 §4.1「从第 2 月起」），选项由后续月初生成
export function defaultCommissions(): CommissionsState {
  return { offers: [], acceptedThisMonth: false, active: null }
}

// 奖励定价（L2 持平档，commission-sim.ts rewardAmount 同款）：value = 交付草的坊市市值；
// 灵石/心得按 1:1、贡献折半（贡献日收入约为灵石一半的稀缺度）、种子固定枚数；类型由生成时 rng 抽取。
// T58 防哑弹：当前灵气连 1 株该草都种不下时排除 seed 档（种子对无灵气玩家即时价值为零，换即时资源）；
// 月中灵气恢复后生成的委托不受影响
function rewardOf(s: GameState, herb: HerbId, count: number, rng: Rng): CommissionReward {
  const value = HERB_BY_ID[herb].sell * count
  const kinds = (['stones', 'contribution', 'insight', 'seed'] as const).filter(
    (k) => k !== 'seed' || s.resources.qi >= HERB_BY_ID[herb].qi,
  )
  const kind = kinds[Math.floor(rng.next() * kinds.length)]
  switch (kind) {
    case 'stones':
      return { kind: 'stones', amount: Math.ceil(value) }
    case 'contribution':
      return { kind: 'contribution', amount: Math.ceil(value / 2) }
    case 'insight':
      return { kind: 'insight', amount: Math.ceil(value) }
    case 'seed':
      return { kind: 'seed', herb, amount: COMMISSION_SEED_REWARD }
  }
}

// 月初生成选项：第一份全池随机；第二份优先**当令池**（当季适播 ∩ 境界池，空则回落全池）
// ——T61 趣味走查 P2：委托带轻主题（当令草更好种，接取决策多一层物候考量）。
// 数量 ≈COMMISSION_QUOTA_EQUIV 当量（±1 株，下限 2）；id 由「月 + 灵草」构成，每月互异天然唯一
export function rollOffers(s: GameState, month: number, rng: Rng): CommissionOffer[] {
  const realmPool = HERBS.filter((h) => s.realm >= h.realm)
  const seasonal = realmPool.filter((h) => h.allSeason || h.seasons.includes(seasonOf(month)))
  const offers: CommissionOffer[] = []
  const taken = new Set<HerbId>()
  for (let i = 0; i < COMMISSION_OFFERS; i++) {
    const preferred = i === 1 ? seasonal : realmPool
    const pool = preferred.filter((h) => !taken.has(h.id))
    const final = pool.length ? pool : realmPool.filter((h) => !taken.has(h.id)) // 当令池被占走时回落全池
    if (!final.length) break
    const herb = final[Math.floor(rng.next() * final.length)]
    taken.add(herb.id)
    const count = Math.max(2, Math.ceil(COMMISSION_QUOTA_EQUIV / convertRate(herb)) + (rng.next() < 0.5 ? 0 : 1))
    offers.push({ id: `m${month}-${herb.id}`, herb: herb.id, count, reward: rewardOf(s, herb.id, count, rng) })
  }
  return offers
}

// 月初刷新（挂在 advanceDay，cultivation-commissions.md §3.1）：未接取选项换新、接取资格重置；活跃委托跨月保留
export function refreshOnMonthStart(s: GameState, rng: Rng): void {
  s.commissions.offers = rollOffers(s, monthOf(s.day), rng)
  s.commissions.acceptedThisMonth = false
}

// 接取：本月资格未用且无活跃委托才允许；选项 id 必须命中本月清单（跨月旧 id / 伪造 id 拒绝）
export function accept(s: GameState, offerId: string): ReasonCode | null {
  if (s.commissions.acceptedThisMonth || s.commissions.active) return 'NOT_ELIGIBLE'
  const offer = s.commissions.offers.find((o) => o.id === offerId)
  if (!offer) return 'INVALID_TARGET'
  s.commissions.active = offer
  s.commissions.acceptedThisMonth = true
  addLog(s, { kind: 'action', icon: '📜', title: '接下灵植堂委托', text: `${HERB_BY_ID[offer.herb].name} ×${offer.count} · 完成后 ${rewardText(offer.reward)}` })
  return null
}

// 交付：先完整校验库存再一次性扣草发奖（只结算一次）；库存不足返回 NO_HERB 且不产生任何副作用
export function deliver(s: GameState): ReasonCode | null {
  const offer = s.commissions.active
  if (!offer) return 'NOT_ELIGIBLE'
  if (s.inventory[offer.herb] < offer.count) return 'NO_HERB'
  s.inventory[offer.herb] -= offer.count
  if (offer.reward.kind === 'seed') s.seeds[offer.reward.herb] += offer.reward.amount
  else s.resources[offer.reward.kind] += offer.reward.amount
  s.commissions.active = null
  addLog(s, { kind: 'action', icon: '🎁', title: '委托交付完成', text: `${HERB_BY_ID[offer.herb].name} ×${offer.count} · ${rewardText(offer.reward)}` })
  return null
}

// 放弃：无惩罚不扣库存；本月资格保持已用（口径②），下月自然刷新
export function abandon(s: GameState): ReasonCode | null {
  const offer = s.commissions.active
  if (!offer) return 'NOT_ELIGIBLE'
  s.commissions.active = null
  addLog(s, { kind: 'action', icon: '🍂', title: '放弃委托', text: `${HERB_BY_ID[offer.herb].name}委托已放弃，本月不可再接` })
  return null
}

// 弹层渲染快照（由 GameState 直接派生）：月号/定额/库存均取自真实存档口径
export interface CommissionSnapshot {
  month: number
  offers: CommissionOffer[] // 本月选项（已接取时视图走「资格已用」分支，不再展示）
  acceptedThisMonth: boolean
  active: CommissionOffer | null
  quotaTarget: number
  inventory: Record<HerbId, number>
}

export function snapshot(s: GameState): CommissionSnapshot {
  return {
    month: monthOf(s.day),
    offers: s.commissions.offers,
    acceptedThisMonth: s.commissions.acceptedThisMonth,
    active: s.commissions.active,
    quotaTarget: QUOTA_TARGET,
    inventory: s.inventory,
  }
}

// 奖励文案（弹层与成功反馈共用；数值由生成时 L2 定价而来）
export function rewardText(reward: CommissionReward): string {
  switch (reward.kind) {
    case 'stones':
      return `灵石 +${reward.amount}`
    case 'contribution':
      return `贡献 +${reward.amount}`
    case 'insight':
      return `心得 +${reward.amount}`
    case 'seed':
      return `${HERB_BY_ID[reward.herb].name}种子 ×${reward.amount}`
  }
}
