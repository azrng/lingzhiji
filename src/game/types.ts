// 灵植记 · 核心类型定义（CON-LINGZHIJI-SAVE-001 落地点，契约草案落地后为唯一事实来源）

export type LibId = 'cet4' | 'cet6'

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

export type FieldStatus = 'empty' | 'growing' | 'mature' | 'confiscated'

export interface Field {
  id: number
  status: FieldStatus
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
  evPos?: [number, number] // 事件素材图标在 5×2 sheet 中的位置
  icon?: string
  title: string
  text: string
}

export interface QuizQuestion {
  word: string // 原词（展示用）
  meaning: string // 正确释义
  from: 'new' | 'review'
  opts: string[] // 4 选 1 选项（含正确释义）
}

export type QuizPhase = 'learning' | 'testing' | 'result'

export interface QuizSession {
  lib: LibId
  questions: QuizQuestion[]
  idx: number
  answers: (string | null)[]
  phase: QuizPhase
}

export interface LibStat {
  attempts: number
  distinctWords: string[] // 在该库作答过的不同单词（归一化），distinct 由长度得出
  firstCorrect: { hit: number; total: number } // 首次作答正确率（按词首次计入统计时）
  reviewCorrect: { hit: number; total: number } // 错词重现答对比例
  sessions: number
  wrongQueue: string[] // 归一化错词队列（队首等待最久）
}

export interface Learning {
  currentLib: LibId
  seenMap: Record<string, number> // 归一化词 → 最近作答日（跨库共享）
  libs: Record<LibId, LibStat>
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

export interface GameState {
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
  | { type: 'QUOTA_RESOLVE'; pay: boolean; plan: Partial<Record<HerbId, number>> }
