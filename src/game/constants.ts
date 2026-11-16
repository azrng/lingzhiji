// 全部数值常量（PRD §12 参数总表为需求事实来源；调参改这里并跑平衡模拟器验证）
import type { Herb, HerbId } from './types'

export const HERBS: Herb[] = [
  { id: 'qingling', name: '青灵草', price: 5, realm: 0, qi: 1, days: 15, yield: 5, sell: 4, exp: 1 },
  { id: 'ninglu', name: '凝露花', price: 12, realm: 0, qi: 1, days: 20, yield: 4, sell: 9, exp: 1 },
  { id: 'ziyun', name: '紫云芝', price: 40, realm: 2, qi: 2, days: 30, yield: 3, sell: 35, exp: 3 },
  { id: 'chisui', name: '赤髓参', price: 60, realm: 3, qi: 2, days: 35, yield: 3, sell: 50, exp: 3 },
  { id: 'longxue', name: '龙血藤', price: 180, realm: 6, qi: 3, days: 50, yield: 2, sell: 210, exp: 10 },
  { id: 'jiuye', name: '九叶莲', price: 260, realm: 8, qi: 3, days: 60, yield: 2, sell: 290, exp: 10 },
]

export const HERB_BY_ID = Object.fromEntries(HERBS.map((h) => [h.id, h])) as Record<HerbId, Herb>

export const REALM_NAMES = [
  '练气一层', '练气二层', '练气三层', '练气四层', '练气五层',
  '练气六层', '练气七层', '练气八层', '练气九层', '筑基',
]

// 突破累计修为阈值（下标 0-9；全程 520 到筑基）
export const REALM_EXP = [0, 20, 45, 80, 125, 180, 245, 320, 410, 520]
// 灵气上限随境界
export const QI_CAP = [5, 5, 6, 6, 7, 8, 8, 9, 9, 9]
// 灵田上限随境界
export const FIELD_CAP = [3, 3, 5, 5, 5, 5, 5, 5, 7, 7]
// 功法进阶贡献消耗（下标为当前等级；Lv1→2 无贡献，合计 300）
export const GONGFA_COST = [0, 0, 50, 100, 150]
export const GONGFA_NAMES = ['', '', '凝神诀', '聚灵诀', '辨灵术', '春霖诀']

export const DAILY_AP = 3
export const MONTH_DAYS = 30
export const QUOTA_TARGET = 15 // 每月定额（青灵草株当量）
export const LOG_MAX = 50

// 收获上品（PRD §6，2026-11-15 新增）：功法加成取整后掷 PRNG，命中额外 +1 株
export const HARVEST_PRIME_CHANCE = 0.2
export const HARVEST_PRIME_BONUS = 1

// 任务堂（PRD §8.2）
export const QUIZ_PASS = 6
export const QUIZ_SIZE = 10
export const REWARD_PASS = { qi: 3, contribution: 5, insight: 8 }
export const REWARD_FULL = { insight: 4 } // 满分额外心得
export const REWARD_FAIL = { qi: 1, insight: 2 }
// 复习配额按境界（练气一至三层 / 四至六层 / 七层及以后）
export function reviewQuota(realm: number): number {
  return realm < 3 ? 3 : realm < 6 ? 4 : 5
}

// 随机事件（PRD §11；正 56 / 负 41 / 行情 1）。效果以 effect 描述驱动（2026-11-15 数据化），
// 新增事件只加数据条目，engine.applyEvent 通用执行；新事件无素材位，用 icon emoji 兜底（TASK.md T24）
export type EventId =
  | 'rain' | 'butterfly' | 'senior' | 'stones' | 'spring'
  | 'elder' | 'pest' | 'bird' | 'formation' | 'market'
  | 'beast' | 'dream' | 'surge' | 'theft'

// 事件效果描述（core-loop.md §3.4）：即时类立即结算，持续类写入 pendingTomorrow
export type EventEffect =
  | { kind: 'yield'; delta: number; randomField: boolean } // 当茬产量增减；randomField = 随机一块生长中田
  | { kind: 'growth'; delta: number } // 全部生长中田进度增减，钳制 ≥0，达成熟立即停驻
  | { kind: 'resource'; resource: 'stones' | 'contribution' | 'insight' | 'qi'; amount: number } // qi 走上限截断
  | { kind: 'cultivation'; amount: number } // 修为入账（gainCultivation 统一入口）
  | { kind: 'inventory'; delta: number } // 仓库随机灵草增减
  | { kind: 'infusionDouble' } // 持续：明日灌注翻倍
  | { kind: 'marketMult' } // 持续：明日行情 50/50 ±%

export interface EventDef {
  id: EventId
  name: string
  weight: number
  negative?: boolean
  pos?: [number, number] // 事件图标在对应素材图集中的位置；无素材位时走 icon 兜底
  sheet?: 'event-icons-sheet-extra.png' // 新事件素材放在独立图集，避免覆盖原图
  icon?: string // emoji 兜底图标（LogEntry.icon）
  desc: string
  effect: EventEffect
}

export const EVENTS: EventDef[] = [
  { id: 'rain', name: '灵雨', weight: 10, pos: [0, 0], desc: '全田生长 +2 天', effect: { kind: 'growth', delta: 1 } },
  { id: 'butterfly', name: '灵蝶授粉', weight: 10, pos: [1, 0], desc: '随机田当茬产量 +1', effect: { kind: 'yield', delta: 1, randomField: true } },
  { id: 'senior', name: '师姐路过指点', weight: 10, pos: [2, 0], desc: '修为 +3', effect: { kind: 'cultivation', amount: 3 } },
  { id: 'stones', name: '拾得散落灵石', weight: 10, pos: [3, 0], desc: '灵石 +8', effect: { kind: 'resource', resource: 'stones', amount: 8 } },
  { id: 'spring', name: '灵泉涌出', weight: 10, pos: [4, 0], desc: '明日灌注效果翻倍', effect: { kind: 'infusionDouble' } },
  { id: 'elder', name: '长老巡视嘉许', weight: 10, pos: [0, 1], desc: '贡献 +5', effect: { kind: 'resource', resource: 'contribution', amount: 5 } },
  { id: 'beast', name: '灵兽来访', weight: 2, pos: [0, 0], sheet: 'event-icons-sheet-extra.png', icon: '🦌', desc: '随机生长中田当茬产量 +2', effect: { kind: 'yield', delta: 2, randomField: true } },
  { id: 'dream', name: '仙人残梦', weight: 2, pos: [1, 0], sheet: 'event-icons-sheet-extra.png', icon: '🌙', desc: '心得 +5', effect: { kind: 'resource', resource: 'insight', amount: 5 } },
  { id: 'surge', name: '灵气涌动', weight: 2, pos: [2, 0], sheet: 'event-icons-sheet-extra.png', icon: '🌊', desc: '灵气 +2', effect: { kind: 'resource', resource: 'qi', amount: 2 } },
  { id: 'theft', name: '灵石失窃', weight: 2, negative: true, pos: [3, 0], sheet: 'event-icons-sheet-extra.png', icon: '🦝', desc: '灵石 −5', effect: { kind: 'resource', resource: 'stones', amount: -5 } },
  { id: 'pest', name: '虫害', weight: 13, negative: true, pos: [1, 1], desc: '随机生长中田产量 −1', effect: { kind: 'yield', delta: -1, randomField: true } },
  { id: 'bird', name: '灵雀偷食', weight: 13, negative: true, pos: [2, 1], desc: '仓库随机灵草 −1', effect: { kind: 'inventory', delta: -1 } },
  { id: 'formation', name: '阵法波动', weight: 13, negative: true, pos: [3, 1], desc: '生长中作物进度 −1 天', effect: { kind: 'growth', delta: -1 } },
  { id: 'market', name: '坊市行情', weight: 1, pos: [4, 1], desc: '明日售价 +50% 或 −30%', effect: { kind: 'marketMult' } },
]

// 月度灵潮（PRD §11.1）：6 月一循环，按月乘事件权重；只调出现频率，不改效果与 30% 触发概率
export interface TideDef {
  name: string
  desc: string
  weightMult: Partial<Record<EventId, number>>
}

export const MONTH_TIDES: TideDef[] = [
  { name: '灵雨之月', desc: '本月灵雨更常造访', weightMult: { rain: 2 } },
  { name: '灵蝶之月', desc: '本月灵蝶授粉更勤，虫害稍歇', weightMult: { butterfly: 2, pest: 0.5 } },
  { name: '虫潮之月', desc: '本月虫害与灵雀更活跃', weightMult: { pest: 1.5, bird: 1.5 } },
  { name: '悟道之月', desc: '本月前辈指点与仙人残梦更常见', weightMult: { senior: 2, dream: 2 } },
  { name: '灵泉之月', desc: '本月灵泉与灵气涌动更频繁', weightMult: { spring: 2, surge: 2 } },
  { name: '灾劫之月', desc: '本月阵法波动与灵石失窃更多，拾得灵石稍减', weightMult: { formation: 1.5, theft: 2, stones: 0.5 } },
]

export const tideOf = (month: number) => MONTH_TIDES[(month - 1) % MONTH_TIDES.length]

export const EVENT_CHANCE = 0.3
export const MARKET_UP = 1.5
export const MARKET_DOWN = 0.7

export const SCROLL_PRICE = 120
export const SCROLL_INSIGHT = 30
export const SEED_DISCOUNT_REALM = 5 // 练气六层起种子 9 折
export const REDEEM_COST = 100
export const QUOTA_FAIL_CONTRIBUTION = 20
export const QUOTA_FAIL_STONES = 10

// 现实日锚（real-day.md §3.7，PRD §12 同步）：晨露 / 地力透支 / 道心连胜全部数值入口
export const DAY_CUT_HOUR = 4 // 日切凌晨 4 点（照顾夜猫子，4 点前算前一现实日）
export const MORNING_GIFT = { stones: 8, insight: 5 } // 晨露礼包（不碰灵气，避开上限溢出口径）
export const DIMINISH_EVENT_CHANCE = 0.15 // 地力透支期（当日第 2+ 游戏日）日终事件触发率
export const DIMINISH_EXP_MULT = 0.5 // 地力透支期收获修为系数（向上取整，灵草株数与售价不减）
export const STREAK_MILESTONES = [7, 30, 100, 365] // 道心里程碑天数
export const MILESTONE_REWARD: Record<number, number> = { 7: 30, 30: 80, 100: 200, 365: 888 } // 里程碑灵石奖励
export const MILESTONE_TITLES: Record<number, string> = { 7: '初萌道心', 30: '渐入佳境', 100: '道心弥坚', 365: '大道可期' } // 称号不存档，由已达成最高里程碑派生
export const FREEZE_CAP = 2 // 护道符上限
export const FREEZE_GRANT_EVERY = 7 // 每累计 7 次打卡自动 +1 护道符
export const STREAK_HISTORY_MAX = 370 // 打卡历史环形保留条数（日历热力图数据源）

// 开局家当（PRD §3）
export const INITIAL = {
  stones: 50,
  fields: 3,
  seeds: { qingling: 3, ninglu: 0, ziyun: 0, chisui: 0, longxue: 0, jiuye: 0 } as Record<HerbId, number>,
}
