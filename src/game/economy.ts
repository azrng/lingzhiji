// 经济（economy.md）：坊市买卖、应急领种、月末定额与欠缴；在 engine 克隆的 draft 上就地修改
import {
  HERB_BY_ID, HERBS, MONTH_DAYS, QUOTA_FAIL_CONTRIBUTION,
  QUOTA_FAIL_STONES, QUOTA_TARGET, REDEEM_COST, SCROLL_INSIGHT, SCROLL_PRICE,
  SEED_DISCOUNT_REALM,
} from './constants'
import { addLog } from './log'
import { clampResources } from './progression'
import { pick, type Rng } from './rng'
import type { GameState, Herb, HerbId, ReasonCode } from './types'

export const monthOf = (day: number) => Math.ceil(day / MONTH_DAYS)
export const dayInMonth = (day: number) => ((day - 1) % MONTH_DAYS) + 1

// 定额折算：⌊售价 ÷ 4⌋ 向下取整（对弟子不利方向，防高阶灵草套利缴纳）
export const convertRate = (herb: Herb) => Math.floor(herb.sell / 4)

// 种子价：练气六层起 9 折，单价向上取整（残卷不受影响）
export function seedPrice(s: GameState, herb: HerbId): number {
  const def = HERB_BY_ID[herb]
  return s.realm >= SEED_DISCOUNT_REALM ? Math.ceil(def.price * 0.9) : def.price
}

export function buySeed(s: GameState, herb: HerbId): ReasonCode | null {
  const price = seedPrice(s, herb)
  if (s.resources.stones < price) return 'NO_STONES'
  s.resources.stones -= price
  s.seeds[herb] += 1
  addLog(s, { kind: 'action', icon: '🛍️', title: `购买 ${HERB_BY_ID[herb].name}种`, text: `−${price} 灵石` })
  return null
}

export function buyScroll(s: GameState): ReasonCode | null {
  if (s.resources.stones < SCROLL_PRICE) return 'NO_STONES'
  s.resources.stones -= SCROLL_PRICE
  s.resources.insight += SCROLL_INSIGHT
  addLog(s, { kind: 'action', icon: '📜', title: '购买功法残卷', text: `心得 +${SCROLL_INSIGHT}（−${SCROLL_PRICE} 灵石）` })
  return null
}

// 出售：单价 = 表价 × 行情系数，向下取整且最低 1（economy.md §3.2）
export function sellHerb(s: GameState, herb: HerbId, count: number): ReasonCode | null {
  if (!Number.isInteger(count) || count < 1 || s.inventory[herb] < count) return 'NO_HERB'
  const mult = s.pendingTomorrow.marketMult ?? 1
  const unit = Math.max(1, Math.floor(HERB_BY_ID[herb].sell * mult))
  s.inventory[herb] -= count
  s.resources.stones += unit * count
  addLog(s, { kind: 'action', icon: '💰', title: `出售 ${HERB_BY_ID[herb].name} ×${count}`, text: `+${unit * count} 灵石（单价 ${unit}）` })
  return null
}

// 应急领种（economy.md §3.2）：谓词全部成立才可领，领取后条件自然失效
export function emergencyEligible(s: GameState): boolean {
  const hasUsable = HERBS.some((h) => s.realm >= h.realm && s.seeds[h.id] > 0)
  const cheapest = Math.min(...HERBS.filter((h) => s.realm >= h.realm).map((h) => h.price))
  return (
    // 被收回的田没有作物，不应阻止玩家在剩余空田恢复经营。
    s.fields.some((f) => f.status === 'empty') &&
    s.fields.every((f) => f.status === 'empty' || f.status === 'confiscated') &&
    HERBS.every((h) => s.inventory[h.id] === 0) &&
    !hasUsable &&
    s.resources.stones < cheapest
  )
}

export function emergencySeed(s: GameState): ReasonCode | null {
  if (!emergencyEligible(s)) return 'NOT_ELIGIBLE'
  s.seeds.qingling += 1
  addLog(s, { kind: 'settle', icon: '🎁', title: '应急领种', text: '执事发下 1 枚青灵草种子，莫要荒废灵田' })
  return null
}

// 收回灵田（连续两月欠缴触发）：优先空田；无空田随机收回并退还种子；仅剩 1 块不收
export function confiscateField(s: GameState, rng: Rng): boolean {
  const candidates = s.fields.filter((f) => f.status !== 'confiscated')
  if (candidates.length <= 1) {
    s.month.unpaidStreak = 0
    return false
  }
  const target = candidates.find((f) => f.status === 'empty') ?? pick(rng, candidates)
  const refund = target.status === 'growing' || target.status === 'mature' ? target.herb : undefined
  if (refund) s.seeds[refund] += 1
  s.fields[s.fields.indexOf(target)] = {
    id: target.id,
    status: 'confiscated',
    refundSeed: refund,
  }
  addLog(s, { kind: 'settle', icon: '🔒', title: '灵田被收回', text: `${target.id} 号田收归宗门${refund ? '，作物已折为种子退还' : ''}` })
  return true
}

// 月末定额结算（economy.md §3.3）：pay=true 时按 plan 缴纳（需足额），否则按欠缴规则处罚
export function resolveQuota(
  s: GameState,
  pay: boolean,
  plan: Partial<Record<HerbId, number>>,
  rng: Rng,
): ReasonCode | null {
  const month = monthOf(s.day)
  if (pay) {
    let converted = 0
    const parts: string[] = []
    for (const [id, n] of Object.entries(plan)) {
      const herb = id as HerbId
      const count = n ?? 0
      if (!Object.hasOwn(HERB_BY_ID, herb) || !Number.isInteger(count) || count < 0 || s.inventory[herb] < count) return 'NOT_ELIGIBLE'
      converted += convertRate(HERB_BY_ID[herb]) * count
    }
    // 先核对总额，避免可变调用在缴纳不足时扣除库存。
    if (converted < QUOTA_TARGET) return 'NOT_ENOUGH_QUOTA'
    for (const [id, n] of Object.entries(plan)) {
      const herb = id as HerbId
      const count = n ?? 0
      if (count <= 0) continue
      parts.push(`${HERB_BY_ID[herb].name}×${count}`)
      s.inventory[herb] -= count
    }
    s.resources.contribution += 10
    s.month.unpaidStreak = 0
    s.month.ledger.push({ month, paid: true, detail: `足额缴纳（${parts.join('、')}，折算 ${converted} 株）` })
    addLog(s, { kind: 'settle', icon: '🧾', title: `第 ${month} 月定额缴纳`, text: `折算 ${converted} 株，贡献 +10` })
  } else if (month === 1) {
    // 首月适应期：不罚、不计欠缴；按期缴纳才有贡献（此处为放弃）
    s.month.ledger.push({ month, paid: false, detail: '欠缴（首月适应期免罚）' })
    addLog(s, { kind: 'settle', icon: '🧾', title: `第 ${month} 月欠缴`, text: '首月适应期，不予追究' })
  } else {
    s.resources.contribution -= QUOTA_FAIL_CONTRIBUTION
    s.resources.stones -= QUOTA_FAIL_STONES
    clampResources(s)
    s.month.unpaidStreak += 1
    s.month.ledger.push({ month, paid: false, detail: `欠缴（贡献 −${QUOTA_FAIL_CONTRIBUTION}、灵石 −${QUOTA_FAIL_STONES}）` })
    addLog(s, { kind: 'settle', icon: '⚠️', title: `第 ${month} 月欠缴`, text: `贡献 −${QUOTA_FAIL_CONTRIBUTION}、灵石 −${QUOTA_FAIL_STONES}` })
    if (s.month.unpaidStreak >= 2) {
      if (confiscateField(s, rng)) {
        addLog(s, { kind: 'settle', icon: '🔒', title: '连续欠缴', text: `可花 ${REDEEM_COST} 贡献赎回` })
      }
      s.month.unpaidStreak = 0
    }
  }
  return null
}
