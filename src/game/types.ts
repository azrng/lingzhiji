// 灵植记 · 核心类型定义（CON-LINGZHIJI-SAVE-001 落地点，契约草案落地后为唯一事实来源）

export type LibId = 'cet4' | 'cet6'
export type CharacterId = 'junior-sister' | 'senior-brother' | 'senior-sister' | 'sweeping-monk' | 'junior-brother' | 'eldest-brother' | 'bookworm' | 'old-herbalist'

export type HerbId = 'qingling' | 'ninglu' | 'ziyun' | 'chisui' | 'longxue' | 'jiuye'

// 物候三季（farming-depth.md §3.4）：6 月一循环，每季 2 月
export type Season = 'sprout' | 'grow' | 'store'

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
  seasons: Season[] // 适播季（空 + allSeason = 全季灵韵）
  // 特质（farming-depth.md §3.1，全部可选、互不冲突）
  nitrogen?: boolean // 固氮：收获后地力 +1（与连作 −1 相抵）
  wet?: boolean // 喜湿：免疫缺水累计与减产
  shade?: boolean // 喜阴：相邻高秆田时当茬产量 +1
  insectWard?: boolean // 驱虫：相邻田免疫虫害事件减产
  deepRoot?: boolean // 深根：连作地力消耗减半（−1 → 0）
  allSeason?: boolean // 灵韵：不适季惩罚也不吃适季加成
}

export type FieldStatus = 'empty' | 'growing' | 'mature' | 'confiscated'

export interface Field {
  id: number
  status: FieldStatus
  fertility: number // 地力三档：0 贫瘠 / 1 常沃 / 2 肥沃（farming-depth.md §3.2，随存档 v3）
  lastCrop?: HerbId // 上茬作物（连作判定；收获时更新，田属性不随清茬重置）
  herb?: HerbId
  progress?: number // 生长进度（天）
  curYield?: number // 当茬当前产量
  dry?: number // 连续缺水天数
  halved?: boolean // 本茬是否已因缺水减产
  refundSeed?: HerbId // 被收回时退还的种子
}

export type LogKind = 'event' | 'action' | 'settle' | 'breakthrough'

export interface LogEntry {
  day: number
  kind: LogKind
  evPos?: [number, number] // 事件图标在对应素材图集中的位置
  evSheet?: 'event-icons-sheet-extra.png' // 未设置时沿用原 5×2 事件图集
  icon?: string
  title: string
  text: string
  neg?: boolean // 负面事件标记（toast 用红色）
}

// 题型（srs-audio.md §3.4，随存档 v4）：认词为默认，其余按学习场次解锁
export type QuestionKind = 'w2c' | 'c2w' | 'listen' | 'spell'

export interface QuizQuestion {
  word: string // 原词（展示用）
  meaning: string // 正确释义
  from: 'new' | 'review'
  opts: string[] // 4 选 1 选项（w2c=释义组，c2w/listen=单词组）；spell 题恒为空数组
  kind: QuestionKind // 题型：决定题面渲染与作答校验方式
}

export type QuizPhase = 'learning' | 'testing' | 'result'

export interface QuizSession {
  lib: LibId
  questions: QuizQuestion[]
  idx: number
  answers: (string | null)[]
  phase: QuizPhase
}

// FSRS 复习卡（srs-audio.md §3.1，随存档 v4）：只序列化调度所需字段，
// ts-fsrs Card 其余字段由 srs.toCard 按「现实日索引」重建；未出现的词不建卡 = new 态
export interface FsrsCardLite {
  due: number // 到期现实日索引（due <= realDay.today 即到期）
  stability: number
  difficulty: number
  state: number // ts-fsrs State：0 new / 1 learning / 2 review / 3 relearning
  lapses: number // 遗忘次数（答错 Again 的累计）
  last: number // 最近复习的现实日索引（elapsed_days 计算依据）
}

export interface LibStat {
  attempts: number
  distinctWords: string[] // 在该库作答过的不同单词（归一化），distinct 由长度得出
  firstCorrect: { hit: number; total: number } // 首次作答正确率（按词首次计入统计时）
  reviewCorrect: { hit: number; total: number } // 错词重现答对比例
  sessions: number
  wrongQueue: string[] // v3 遗留字段，v4 起恒空（复习调度改由 learning.cards 承担）
}

export interface Learning {
  currentLib: LibId
  seenMap: Record<string, number> // 归一化词 → 最近作答游戏日（跨库共享，作答统计口径保留）
  libs: Record<LibId, LibStat>
  cards: Record<string, FsrsCardLite> // 归一化词 → FSRS 复习卡（跨库共享，M2 v4）
}

export interface MonthRecord {
  month: number
  paid: boolean
  detail: string
}

export interface Resources {
  stones: number
  contribution: number
  qi: number
  insight: number
}

// 现实日锚（real-day.md §3.2，随存档 v2）：索引由 clock.realDayIndex 派生，日切凌晨 4 点
export interface RealDayState {
  today: number // 最近一次同步的现实日索引（开局 = 创建当日）
  gamesToday: number // 当日已推进的游戏日数（跨日重置 0；END_DAY 成功推进后 +1）
}

// 道心连胜（real-day.md §3.4，随存档 v2）
export interface StreakState {
  count: number // 当前道心连胜（现实日）
  best: number // 历史最高
  lastCheckinDay: number // 最近打卡的现实日索引（= 今天则已打卡）；-1 表示从未打卡
  checkins: number // 累计打卡次数（护道符发放依据）
  freezes: number // 护道符余量（0-2）
  milestones: number[] // 已发放的里程碑天数（7/30/100/365，防重复）
  history: number[] // 打卡现实日索引（升序，环形保留最近 370 条，日历热力图数据源）
}

export interface GameState {
  characterId?: CharacterId // 旧存档没有该字段，继续显示原有弟子形象
  day: number // 从 1 起算；月份派生计算
  phase: 'day' | 'quota' // 白天 / 月末定额结算交互中
  ap: number
  wateredToday: boolean
  tunaUsedToday: boolean
  pendingTomorrow: { infusionDouble?: boolean; marketMult?: number }
  resources: Resources
  cultivation: number // 累计修为，只增不减
  realm: number // 0-8 练气一至九层，9 筑基
  gongfa: number // 1-5
  fields: Field[]
  seeds: Record<HerbId, number>
  inventory: Record<HerbId, number>
  quizDaily: { done: boolean; session: QuizSession | null }
  learning: Learning
  realDay: RealDayState
  streak: StreakState
  month: { unpaidStreak: number; ledger: MonthRecord[] }
  milestoneShown: boolean
  tutorialDone: boolean
  log: LogEntry[] // 新条目在前，环形保留 50 条
  rngState: number // mulberry32 内部状态，随档保存保证可复现
}

export type ReasonCode =
  | 'REALM_LOCKED'
  | 'NO_QI'
  | 'NO_SEED'
  | 'NOT_EMPTY'
  | 'NO_AP'
  | 'NOT_MATURE'
  | 'NO_CROP'
  | 'FIELD_LIMIT'
  | 'HAS_CONFISCATED'
  | 'NO_CONTRIBUTION'
  | 'NO_INSIGHT'
  | 'NO_STONES'
  | 'NO_HERB'
  | 'ALREADY_DONE'
  | 'QUIZ_NOT_DONE'
  | 'LIBRARY_INSUFFICIENT'
  | 'NOT_ENOUGH_QUOTA'
  | 'NOT_ELIGIBLE'
  | 'INVALID_TARGET'
  | 'MAX_GONGFA'
  | 'NO_SAVE'
  | 'BAD_BASE64'
  | 'BAD_JSON'
  | 'BAD_VERSION'
  | 'BAD_SHAPE'

export interface ActionResult {
  ok: boolean
  state?: GameState
  reason?: ReasonCode
}

export type GameAction =
  | { type: 'PLANT'; fieldId: number; herb: HerbId }
  | { type: 'WATER' }
  | { type: 'HARVEST'; fieldId: number }
  | { type: 'IRRIGATE' }
  | { type: 'TUNA' }
  | { type: 'RECLAIM'; fieldId: number }
  | { type: 'RECLAIM_LAND' }
  | { type: 'BUY_SEED'; herb: HerbId }
  | { type: 'BUY_SCROLL' }
  | { type: 'SELL_HERB'; herb: HerbId; count: number }
  | { type: 'EMERGENCY_SEED' }
  | { type: 'GONGFA_UP' }
  | { type: 'QUIZ_BEGIN' }
  | { type: 'QUIZ_LEARNED' }
  | { type: 'QUIZ_ANSWER'; choice: string }
  | { type: 'QUIZ_NEXT' }
  | { type: 'QUIZ_CONFIRM' }
  | { type: 'QUIZ_SET_LIB'; lib: LibId }
  | { type: 'END_DAY' }
  | { type: 'MILESTONE_SHOWN' } // 筑基结算成绩单已展示（一次性标记）
  | { type: 'TUTORIAL_DONE' } // 新手引导完成/跳过
  | { type: 'DEBUG_CULTIVATE'; amount: number } // 调试：修为入账（走突破检查，仅 ?debug=1 使用）
  | { type: 'QUOTA_RESOLVE'; pay: boolean; plan: Partial<Record<HerbId, number>> }
