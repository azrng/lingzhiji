// 灵植堂委托（cultivation-commissions.md，M6b）：沉淀型原型阶段的数据层。
// 视图只依赖 CommissionService 接口，当前由 Fake 注入（模块级单例，跨弹层开关保留状态）；
// 接引擎时仅替换注入实现（由 GameState 派生快照），界面代码不动。
// 定额储备不在快照中单列：视图用 convertRate 对 inventory 求合计即得（同 QuotaModal 口径）。
import { HERB_BY_ID, QUOTA_TARGET } from './constants'
import type { HerbId } from './types'

// 奖励：首版只用既有资源与种子（2026-11-18 已确认口径④）；amount 数值为原型示例，待平衡模拟校准
export type CommissionReward =
  | { kind: 'stones'; amount: number }
  | { kind: 'contribution'; amount: number }
  | { kind: 'insight'; amount: number }
  | { kind: 'seed'; herb: HerbId; amount: number }

export interface CommissionOffer {
  id: string
  herb: HerbId
  count: number // 要求交付数量（株）
  reward: CommissionReward
}

// 弹层渲染快照；inventory 接引擎后取自 GameState，本月选项/接取标记为 v5 新增持久状态
export interface CommissionSnapshot {
  month: number
  offers: CommissionOffer[] // 本月选项（未接取时可见，下月刷新）
  acceptedThisMonth: boolean // 本月接取资格已用（接取后含交付/放弃两种去向）
  active: CommissionOffer | null // 活跃委托（可跨月保留）
  quotaTarget: number
  inventory: Record<HerbId, number>
  invalid?: boolean // 原型演示：委托数据无效态（正式版由 save 导入校验拒绝，见设计 §3.4）
}

export type DemoMode = 'normal' | 'empty' | 'error'

export interface CommissionService {
  snapshot(): CommissionSnapshot
  accept(offerId: string): void // 资格与重复接取由视图禁用层兜底，Fake 内幂等
  deliver(): CommissionReward | null // 交付活跃委托；库存不足返回 null（不产生任何副作用）
  abandon(): void
  setDemoMode(mode: DemoMode): void // 原型三态演示辅助，转正时随 Fake 一起移除
}

// Fake 示例档：月 3、储备 12/15（青灵草 6×1 + 凝露花 3×2 折算）；
// 委托一凝露花×4 刻意库存不足（缺 1，演示缺口禁用），委托二青灵草×6 可足额交付（演示预览与成功路径）
const FAKE_OFFERS: CommissionOffer[] = [
  { id: 'demo-ninglu-4', herb: 'ninglu', count: 4, reward: { kind: 'contribution', amount: 12 } },
  { id: 'demo-qingling-6', herb: 'qingling', count: 6, reward: { kind: 'stones', amount: 18 } },
]

const FAKE_INVENTORY: Record<HerbId, number> = {
  qingling: 6,
  ninglu: 3,
  ziyun: 0,
  chisui: 0,
  longxue: 0,
  jiuye: 0,
}

const state = {
  month: 3,
  offers: FAKE_OFFERS,
  acceptedThisMonth: false,
  active: null as CommissionOffer | null,
  inventory: { ...FAKE_INVENTORY },
  demo: 'normal' as DemoMode,
}

export const commissionFake: CommissionService = {
  snapshot() {
    if (state.demo === 'error') {
      return { month: state.month, offers: [], acceptedThisMonth: state.acceptedThisMonth, active: null, quotaTarget: QUOTA_TARGET, inventory: state.inventory, invalid: true }
    }
    return {
      month: state.month,
      offers: state.demo === 'empty' ? [] : state.offers,
      acceptedThisMonth: state.acceptedThisMonth,
      active: state.active,
      quotaTarget: QUOTA_TARGET,
      inventory: state.inventory,
    }
  },

  accept(offerId) {
    if (state.acceptedThisMonth || state.active) return
    const offer = state.offers.find((o) => o.id === offerId)
    if (!offer) return
    state.active = offer
    state.acceptedThisMonth = true
  },

  deliver() {
    const offer = state.active
    if (!offer) return null
    if (state.inventory[offer.herb] < offer.count) return null
    state.inventory[offer.herb] -= offer.count
    state.active = null
    return offer.reward
  },

  abandon() {
    if (!state.active) return
    state.active = null
    // 资格不退还：acceptedThisMonth 保持 true（口径②：放弃无惩罚但当月资格已消耗）
  },

  setDemoMode(mode) {
    state.demo = mode
  },
}

// 奖励文案（弹层与成功反馈共用）；数值为示例，接引擎后由平衡表提供
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
