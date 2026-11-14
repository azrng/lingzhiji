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

// 随机事件（PRD §11；正 60 / 负 39 / 行情 1）
export type EventId =
  | 'rain' | 'butterfly' | 'senior' | 'stones' | 'spring'
  | 'elder' | 'pest' | 'bird' | 'formation' | 'market'

export interface EventDef {
  id: EventId
  name: string
  weight: number
  negative?: boolean
  pos: [number, number]
  desc: string
}

export const EVENTS: EventDef[] = [
  { id: 'rain', name: '灵雨', weight: 10, pos: [0, 0], desc: '全田生长 +2 天' },
  { id: 'butterfly', name: '灵蝶授粉', weight: 10, pos: [1, 0], desc: '随机田当茬产量 +1' },
  { id: 'senior', name: '师姐路过指点', weight: 10, pos: [2, 0], desc: '修为 +3' },
  { id: 'stones', name: '拾得散落灵石', weight: 10, pos: [3, 0], desc: '灵石 +8' },
  { id: 'spring', name: '灵泉涌出', weight: 10, pos: [4, 0], desc: '明日灌注效果翻倍' },
  { id: 'elder', name: '长老巡视嘉许', weight: 10, pos: [0, 1], desc: '贡献 +5' },
  { id: 'pest', name: '虫害', weight: 13, negative: true, pos: [1, 1], desc: '随机生长中田产量 −1' },
  { id: 'bird', name: '灵雀偷食', weight: 13, negative: true, pos: [2, 1], desc: '仓库随机灵草 −1' },
  { id: 'formation', name: '阵法波动', weight: 13, negative: true, pos: [3, 1], desc: '生长中作物进度 −1 天' },
  { id: 'market', name: '坊市行情', weight: 1, pos: [4, 1], desc: '明日售价 +50% 或 −30%' },
]

export const EVENT_CHANCE = 0.3
export const MARKET_UP = 1.5
export const MARKET_DOWN = 0.7

export const SCROLL_PRICE = 120
export const SCROLL_INSIGHT = 30
export const SEED_DISCOUNT_REALM = 5 // 练气六层起种子 9 折
export const REDEEM_COST = 100
export const QUOTA_FAIL_CONTRIBUTION = 20
export const QUOTA_FAIL_STONES = 10

// 开局家当（PRD §3）
export const INITIAL = {
  stones: 50,
  fields: 3,
  seeds: { qingling: 3, ninglu: 0, ziyun: 0, chisui: 0, longxue: 0, jiuye: 0 } as Record<HerbId, number>,
}
