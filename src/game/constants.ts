// 全部数值常量（PRD §12 参数总表为需求事实来源；调参改这里并跑平衡模拟器验证）
import type { EncounterId, Herb, HerbId, MarketEventId, Season } from './types'

export const HERBS: Herb[] = [
  // 特质与适播季（farming-depth.md §3.1/§3.4）；生长期 ÷3 取整（time-decouple.md §3.2，T49 节奏压缩）。
  // 前 6 种走 3×2 素材图集（spirit-herbs-sheet / growth-sheet 6 行）；T56 扩容 9 种素材未到位，emoji 兜底
  { id: 'qingling', name: '青灵草', price: 5, realm: 0, qi: 1, days: 5, yield: 5, sell: 4, exp: 1, seasons: ['sprout'], nitrogen: true },
  { id: 'ninglu', name: '凝露花', price: 12, realm: 0, qi: 1, days: 7, yield: 4, sell: 9, exp: 1, seasons: ['grow'], wet: true },
  { id: 'ziyun', name: '紫云芝', price: 40, realm: 2, qi: 2, days: 10, yield: 3, sell: 35, exp: 3, seasons: ['grow', 'store'], shade: true },
  { id: 'chisui', name: '赤髓参', price: 60, realm: 3, qi: 2, days: 12, yield: 3, sell: 50, exp: 3, seasons: ['store'], insectWard: true },
  { id: 'longxue', name: '龙血藤', price: 180, realm: 6, qi: 3, days: 17, yield: 2, sell: 210, exp: 10, seasons: ['store', 'sprout'], deepRoot: true },
  { id: 'jiuye', name: '九叶莲', price: 260, realm: 8, qi: 3, days: 20, yield: 2, sell: 290, exp: 10, seasons: [], allSeason: true },
  // 扩容第一批（herb-codex.md §3.1，T56）：特质全复用现有 5 种，数值 sim 验证后定稿
  { id: 'yuejian', name: '月见蔓', price: 8, realm: 1, qi: 1, days: 6, yield: 5, sell: 6, exp: 1, seasons: ['sprout'], nitrogen: true, emoji: '🌿' },
  { id: 'xuexin', name: '雪芯兰', price: 30, realm: 2, qi: 2, days: 9, yield: 4, sell: 24, exp: 2, seasons: ['grow'], wet: true, emoji: '🌷' },
  { id: 'jinling', name: '金铃藤', price: 50, realm: 3, qi: 2, days: 11, yield: 3, sell: 42, exp: 3, seasons: ['store'], insectWard: true, emoji: '🌼' },
  { id: 'xuanshen', name: '玄参', price: 90, realm: 4, qi: 2, days: 13, yield: 3, sell: 75, exp: 4, seasons: ['store'], shade: true, emoji: '🍄' },
  { id: 'zhuguo', name: '朱果', price: 110, realm: 4, qi: 3, days: 14, yield: 2, sell: 95, exp: 5, seasons: ['sprout'], emoji: '🍒' },
  { id: 'bisui', name: '碧髓竹', price: 130, realm: 5, qi: 3, days: 16, yield: 2, sell: 115, exp: 6, seasons: ['grow'], deepRoot: true, emoji: '🎋' },
  { id: 'youming', name: '幽冥花', price: 200, realm: 6, qi: 3, days: 17, yield: 2, sell: 180, exp: 8, seasons: ['store'], shade: true, emoji: '🥀' },
  { id: 'tianxin', name: '天心莲', price: 230, realm: 7, qi: 3, days: 18, yield: 2, sell: 210, exp: 9, seasons: ['grow'], wet: true, emoji: '🌸' },
  { id: 'zijinhu', name: '紫金葫芦', price: 300, realm: 8, qi: 3, days: 21, yield: 2, sell: 280, exp: 12, seasons: ['store'], emoji: '🍐' },
]

// 物候三季（farming-depth.md §3.4）：6 月一循环、每季 2 月，与月度灵潮并行
export interface SeasonDef {
  id: Season
  name: string
  months: [number, number] // 月份区间（1-6 循环内）
  proverb: string // 月初灵潮日志附言（农谚池，风味兼教学）
}

export const SEASONS: SeasonDef[] = [
  { id: 'sprout', name: '生发季', months: [1, 2], proverb: '轮作如修行，换茬养地力' },
  { id: 'grow', name: '长养季', months: [3, 4], proverb: '凝露花喜雨，长养勤浇灌' },
  { id: 'store', name: '收藏季', months: [5, 6], proverb: '赤髓参入土，深藏而灵固' },
]

export const seasonOf = (month: number): Season => SEASONS[(month - 1) % 6 >> 1].id
export const seasonDefOf = (month: number): SeasonDef => SEASONS[(month - 1) % 6 >> 1]

export const HERB_BY_ID = Object.fromEntries(HERBS.map((h) => [h.id, h])) as Record<HerbId, Herb>

// 境界内最高档灵草（同境界取表中靠后者 = 更进阶）：赠种奇遇与秘境开启行情共用
export const topRealmHerb = (realm: number): Herb => HERBS.filter((h) => h.realm <= realm).reduce((a, b) => (b.realm >= a.realm ? b : a))

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
  | 'elder' | 'pest' | 'bird' | 'formation'
  | 'beast' | 'dream' | 'surge' | 'theft'

// 事件效果描述（core-loop.md §3.4）：即时类立即结算，持续类写入 pendingTomorrow。
// seed / mutation / bundle 三类为奇遇新增（encounters.md §3.4），日常事件暂不使用
export type EventEffect =
  | { kind: 'yield'; delta: number; randomField: boolean } // 当茬产量增减；randomField = 随机一块生长中田
  | { kind: 'growth'; delta: number } // 全部生长中田进度增减，钳制 ≥0，达成熟立即停驻
  | { kind: 'resource'; resource: 'stones' | 'contribution' | 'insight' | 'qi'; amount: number } // qi 走上限截断
  | { kind: 'cultivation'; amount: number } // 修为入账（gainCultivation 统一入口）
  | { kind: 'inventory'; delta: number } // 仓库随机灵草增减
  | { kind: 'infusionDouble' } // 持续：明日灌注翻倍
  | { kind: 'seed'; herb: HerbId | 'topRealm'; amount: number } // 种子入账；topRealm = 境界内最高档（结算期解析）
  | { kind: 'mutation'; randomField: boolean } // 随机生长中田置保底变异（下茬收获必出变异株，换茬清除）
  | { kind: 'bundle'; effects: EventEffect[] } // 组合效果：顺序结算，无目标的子段中止后续（整体无事）

export interface EventDef {
  id: EventId
  name: string
  weight: number
  negative?: boolean
  pos?: [number, number] // 事件图标在对应素材图集中的位置；无素材位时走 icon 兜底
  sheet?: 'event-icons-sheet-extra.webp' // 新事件素材放在独立图集，避免覆盖原图
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
  { id: 'beast', name: '灵兽来访', weight: 2, pos: [0, 0], sheet: 'event-icons-sheet-extra.webp', icon: '🦌', desc: '随机生长中田当茬产量 +2', effect: { kind: 'yield', delta: 2, randomField: true } },
  { id: 'dream', name: '仙人残梦', weight: 2, pos: [1, 0], sheet: 'event-icons-sheet-extra.webp', icon: '🌙', desc: '心得 +5', effect: { kind: 'resource', resource: 'insight', amount: 5 } },
  { id: 'surge', name: '灵气涌动', weight: 2, pos: [2, 0], sheet: 'event-icons-sheet-extra.webp', icon: '🌊', desc: '灵气 +2', effect: { kind: 'resource', resource: 'qi', amount: 2 } },
  { id: 'theft', name: '灵石失窃', weight: 2, negative: true, pos: [3, 0], sheet: 'event-icons-sheet-extra.webp', icon: '🦝', desc: '灵石 −5', effect: { kind: 'resource', resource: 'stones', amount: -5 } },
  { id: 'pest', name: '虫害', weight: 13, negative: true, pos: [1, 1], desc: '随机生长中田产量 −1', effect: { kind: 'yield', delta: -1, randomField: true } },
  { id: 'bird', name: '灵雀偷食', weight: 13, negative: true, pos: [2, 1], desc: '仓库随机灵草 −1', effect: { kind: 'inventory', delta: -1 } },
  { id: 'formation', name: '阵法波动', weight: 13, negative: true, pos: [3, 1], desc: '生长中作物进度 −1 天', effect: { kind: 'growth', delta: -1 } },
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

// ---- 奇遇系统（encounters.md §3.2/§3.3，随存档 v7）：三档机缘，与日常随机事件相互独立、
// 不受月度灵潮调制；普通 10% / 特殊 4% / 传说 1% 顺序判定，特殊档同 id 7 日冷却，传说档全存档限一次 ----
export type EncounterTier = 'common' | 'special' | 'legendary'

export const ENCOUNTER_P = { common: 0.1, special: 0.04, legendary: 0.01 } as const
export const ENCOUNTER_COOLDOWN = 7 // 特殊/传说档同 id 冷却（游戏日，兑现时起算）

export interface EncounterDef {
  id: EncounterId
  name: string
  tier: EncounterTier
  desc: string // 兑现日志正文（效果口径，与事件 desc 同风格）
  hint?: string // 伏笔文案（仅特殊/传说档）：前一日「明日预告」位展示，预告=必然
  effect: EventEffect
}

export const ENCOUNTERS: EncounterDef[] = [
  { id: 'sparrowGuide', name: '灵雀引路', tier: 'common', desc: '仓库随机灵草 +2 株', effect: { kind: 'inventory', delta: 2 } },
  { id: 'stoneVein', name: '灵石矿脉', tier: 'common', desc: '灵石 +15', effect: { kind: 'resource', resource: 'stones', amount: 15 } },
  { id: 'wandererTrade', name: '散修易货', tier: 'common', desc: '以随机灵草一株易得另一株', effect: { kind: 'bundle', effects: [{ kind: 'inventory', delta: -1 }, { kind: 'inventory', delta: 1 }] } },
  { id: 'hermitSeeds', name: '神秘修士赠种', tier: 'special', desc: '赠当前境界可种最高档种子 ×2', hint: '山道尽头似有人影伫立，袖间隐有种子清香', effect: { kind: 'seed', herb: 'topRealm', amount: 2 } },
  { id: 'fieldMutation', name: '灵田异变', tier: 'special', desc: '随机生长中田下茬收获保底出变异株', hint: '夜里田垄灵光隐隐，似有异变将生', effect: { kind: 'mutation', randomField: true } },
  { id: 'youngBeast', name: '救助幼兽', tier: 'special', desc: '修为 +5、心得 +5', hint: '后山传来微弱哀鸣，似有生灵受伤', effect: { kind: 'bundle', effects: [{ kind: 'cultivation', amount: 5 }, { kind: 'resource', resource: 'insight', amount: 5 }] } },
  { id: 'buriedCache', name: '掘得遗藏', tier: 'special', desc: '灵石 +30', hint: '整理田埯时挖到一角残破图卷', effect: { kind: 'resource', resource: 'stones', amount: 30 } },
  { id: 'masterCave', name: '祖师遗府', tier: 'legendary', desc: '修为 +25、心得 +15', hint: '梦中似有钟声自云雾深处传来', effect: { kind: 'bundle', effects: [{ kind: 'cultivation', amount: 25 }, { kind: 'resource', resource: 'insight', amount: 15 }] } },
  { id: 'ancientSpring', name: '上古灵泉', tier: 'legendary', desc: '全田生长 +3 天', hint: '井底灵光大涨，泉眼隐隐轰鸣', effect: { kind: 'growth', delta: 3 } },
]

export const ENCOUNTER_BY_ID = Object.fromEntries(ENCOUNTERS.map((e) => [e.id, e])) as Record<EncounterId, EncounterDef>

// 稀有变异（herb-codex.md §3.2，T56）：收获时逐株独立判定概率；灵田异变奇遇保底至少 1 株
export const MUTATION_RATE = 0.03
// 吐纳灵光一闪（T61 趣味走查 P1-c）：额外 +1 修为的概率
export const TUNA_INSPIRED_CHANCE = 0.15

// 坊市珍品架（T61 趣味走查 P0-a 轻量版，T64）：灵石高频消耗端——中价策略道具，不限购
// （效果日限天然防囤积：聚灵符=明日灌注翻倍同灵泉事件；润土符=全田缺水计数清零并视同当日浇灌）
export const CHARMS = {
  infusion: { name: '聚灵符', price: 80, desc: '明日灌注效果翻倍（1 灵气 = +2 天）' },
  moisten: { name: '润土符', price: 60, desc: '全田缺水计数清零，今日视同已浇灌' },
} as const
export type CharmKind = keyof typeof CHARMS

// ---- 市场事件（market-events.md §3.1，随存档 v8）：月初抽 1 个持续整月、15 日预掷下月（预告=必然）。
// 行情只动卖出价；种子买入、委托奖励（生成时按表价快照）、定额折算（表价 ÷4）均不受影响。
// 系数为初版建议值，sim 500 局验证后定稿 ----
export interface MarketEventDef {
  id: MarketEventId
  name: string
  desc: string // 月初公告正文
  rumor: string // 15 日预告文案（坊市风声，真话）
  target: HerbId[] | 'seasonal' | 'topRealm' | '*' // 定向草：点名 / 当季适播 / 境界内最高档 / 全部（结算期解析）
  mult: number // 卖价系数
}

export const MARKET_EVENTS: MarketEventDef[] = [
  { id: 'alchemyFair', name: '炼丹大会', desc: '各家丹坊抢购主药', rumor: '坊市风声：下月丹坊云集，凝露花行情看涨', target: ['ninglu'], mult: 1.8 },
  { id: 'sectPurchase', name: '宗门采购', desc: '宗门例行收购灵草', rumor: '坊市风声：下月宗门采购将至，青灵草走俏', target: ['qingling'], mult: 1.6 },
  { id: 'rainySeason', name: '灵雨季节', desc: '野外灵草丰收，供应增加', rumor: '坊市风声：下月灵雨频仍，当季灵草恐供过于求', target: 'seasonal', mult: 0.75 },
  { id: 'secretRealm', name: '秘境开启', desc: '探秘者采购护身灵植', rumor: '坊市风声：下月秘境将启，高阶灵植需求大增', target: 'topRealm', mult: 1.8 },
  { id: 'offSeason', name: '坊市淡季', desc: '行情冷清，买家观望', rumor: '坊市风声：下月行情恐冷清，宜早做打算', target: '*', mult: 0.85 },
]

export const MARKET_EVENT_BY_ID = Object.fromEntries(MARKET_EVENTS.map((e) => [e.id, e])) as Record<MarketEventId, MarketEventDef>

// 明日预告池（time-decouple.md §3.6）：行情 / 灵潮 / 天象 / 后山四类氛围钩子；
// 首版纯文案不绑定真实事件触发（预告 ≠ 必然发生），由 drawTomorrowHint 按 rngState 确定性抽取
export const TOMORROW_HINTS: string[] = [
  '灵潮低语：今夜灵气涨落未定，明日方知',
  '天象：月朗星稀，夜里或有灵露凝结',
  '天象：云聚风起，明日或有一场灵雨',
  '后山隐有异象：似乎有野生灵植将熟',
  '后山传来淡淡药香，长老说是吉兆',
  '护山阵法微微发烫，明日波动难免',
  '灵雀成群掠过田垄，偷食的心思又活了',
  '井水映出微光，明日灌溉或事半功倍',
]

export const SCROLL_PRICE = 120
export const SCROLL_INSIGHT = 30
export const SEED_DISCOUNT_REALM = 5 // 练气六层起种子 9 折
export const REDEEM_COST = 100
export const QUOTA_FAIL_CONTRIBUTION = 20
export const QUOTA_FAIL_STONES = 10

// 灵植堂委托（cultivation-commissions.md §4，随存档 v6）：第 2 月起每月初 2 份、目标 ≈6 株当量（±1 株）；
// 奖励 = L2 持平档（commission-sim 500 局结论：不破坏定额达成率与筑基节奏，T39.md 数值前置）——
// 机会成本按交付草的坊市市值计：灵石/心得 1:1、贡献折半（贡献日收入约为灵石一半的稀缺度）、种子固定枚数
export const COMMISSION_OFFERS = 2
export const COMMISSION_QUOTA_EQUIV = 6
export const COMMISSION_SEED_REWARD = 2

// 闭关纳灵（T54 实玩修复，time-decouple.md §3.7）：入定每满 3 天出关聚 1 点灵气（上限截断）。
// 动机：灵气来源锚现实日（任务堂），连玩玩家入定快进后无灵气补种 → session 死局（T43 实玩发现 #2）
export const MEDITATE_QI_EVERY = 3

// 现实日锚（real-day.md §3.7，PRD §12 同步）：晨露 / 道心连胜数值入口；
// 地力透支常量已随 T49 时间解耦删除（事件率恒 0.3、收获修为不减半）
export const DAY_CUT_HOUR = 4 // 日切凌晨 4 点（照顾夜猫子，4 点前算前一现实日）
export const MORNING_GIFT = { stones: 8, insight: 5 } // 晨露礼包（不碰灵气，避开上限溢出口径）
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
  seeds: {
    qingling: 3, ninglu: 0, ziyun: 0, chisui: 0, longxue: 0, jiuye: 0,
    yuejian: 0, xuexin: 0, jinling: 0, xuanshen: 0, zhuguo: 0, bisui: 0, youming: 0, tianxin: 0, zijinhu: 0,
  } as Record<HerbId, number>,
}
