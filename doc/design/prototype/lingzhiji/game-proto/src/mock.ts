// 原型模拟数据：仅用于确认视觉与交互，数值快照自 PRD v0.1，不代表已验证平衡。
// 正式实现时数值移入 src/game/constants.ts，词库替换为 src/data/words/*.json。

export type HerbId = 'qingling' | 'ninglu' | 'ziyun' | 'chisui' | 'longxue' | 'jiuye'

export interface Herb {
  id: HerbId
  name: string
  price: number // 种子价（灵石）
  realm: number // 种植境界下标（0 = 练气一层）
  qi: number // 播种灵气
  days: number // 基础生长期
  yield: number // 基础收获（株）
  sell: number // 售价/株
  exp: number // 修为/株
}

export const HERBS: Herb[] = [
  { id: 'qingling', name: '青灵草', price: 5, realm: 0, qi: 1, days: 15, yield: 5, sell: 4, exp: 1 },
  { id: 'ninglu', name: '凝露花', price: 12, realm: 0, qi: 1, days: 20, yield: 4, sell: 9, exp: 1 },
  { id: 'ziyun', name: '紫云芝', price: 40, realm: 2, qi: 2, days: 30, yield: 3, sell: 35, exp: 3 },
  { id: 'chisui', name: '赤髓参', price: 60, realm: 3, qi: 2, days: 35, yield: 3, sell: 50, exp: 3 },
  { id: 'longxue', name: '龙血藤', price: 180, realm: 6, qi: 3, days: 50, yield: 2, sell: 210, exp: 10 },
  { id: 'jiuye', name: '九叶莲', price: 260, realm: 8, qi: 3, days: 60, yield: 2, sell: 290, exp: 10 },
]

export const herbById = (id: HerbId) => HERBS.find((h) => h.id === id)!

// 定额折算：⌊售价 ÷ 4⌋（对弟子不利方向），1 株 = N 株青灵草当量
export const convertRate = (h: Herb) => Math.floor(h.sell / 4)

export const REALM_NAMES = [
  '练气一层', '练气二层', '练气三层', '练气四层', '练气五层',
  '练气六层', '练气七层', '练气八层', '练气九层', '筑基',
]
// 突破累计修为阈值（练气一层起始 0，筑基 520）
export const REALM_EXP = [0, 20, 45, 80, 125, 180, 245, 320, 410, 520]
// 灵气上限随境界（下标 0-9）
export const QI_CAP = [5, 5, 6, 6, 7, 8, 8, 9, 9, 9]
// 灵田上限随境界
export const FIELD_CAP = [3, 3, 5, 5, 5, 5, 5, 5, 7, 7]
// 功法进阶贡献消耗（Lv2 无，Lv3-5）
export const GONGFA_COST = [0, 0, 50, 100, 150]
export const GONGFA_NAMES = ['', '', '凝神诀', '聚灵诀', '辨灵术', '春霖诀']

// 随机事件（PRD §11 权重）；pos = 事件图标在 5×2 素材图中的 (col,row)
export type EventId =
  | 'rain' | 'butterfly' | 'senior' | 'stones' | 'spring'
  | 'elder' | 'pest' | 'bird' | 'formation' | 'market'

export interface GameEvent {
  id: EventId
  name: string
  weight: number
  negative?: boolean
  pos: [number, number]
  desc: string
}

export const EVENTS: GameEvent[] = [
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

// 背词模拟词表（四级风格样例，正式版读词库 JSON）
export interface Word {
  w: string
  m: string
}

export const WORDS: Word[] = [
  { w: 'sow', m: '播种' },
  { w: 'reap', m: '收获' },
  { w: 'irrigate', m: '灌溉' },
  { w: 'fertile', m: '肥沃的' },
  { w: 'wither', m: '枯萎' },
  { w: 'cultivate', m: '耕作；培养' },
  { w: 'sprout', m: '发芽' },
  { w: 'blossom', m: '开花' },
  { w: 'seedling', m: '幼苗' },
  { w: 'grain', m: '谷物' },
  { w: 'plow', m: '犁；耕地' },
  { w: 'mantra', m: '咒语' },
  { w: 'disciple', m: '弟子' },
  { w: 'immortal', m: '仙；不朽的' },
  { w: 'elixir', m: '灵丹妙药' },
  { w: 'talisman', m: '符咒' },
  { w: 'scripture', m: '经书' },
  { w: 'meditate', m: '冥想' },
  { w: 'ascend', m: '升天；登高' },
  { w: 'mortal', m: '凡人' },
  { w: 'herb', m: '药草' },
  { w: 'dew', m: '露水' },
  { w: 'mist', m: '薄雾' },
  { w: 'thrive', m: '茁壮成长' },
  { w: 'withered', m: '凋谢的' },
  { w: 'bounty', m: '丰饶；赏金' },
]
