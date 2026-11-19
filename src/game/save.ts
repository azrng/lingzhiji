// 存档（save.md）：localStorage 唯一读写点；版本校验、Base64 导码、损坏恢复。
// UI 与 store 禁止直用 localStorage。storage 参数默认注入，测试传内存实现。
import { realDayIndex } from './clock'
import { DAILY_AP, ENCOUNTERS, FREEZE_CAP, HERB_BY_ID, HERBS, LOG_MAX, MARKET_DOWN, MARKET_UP, STREAK_HISTORY_MAX, STREAK_MILESTONES } from './constants'
import { grade } from './srs'
import type { GameState, ReasonCode } from './types'

// 键名与版本号解耦：保持 v1 键名避免玩家丢档，版本演进只走 SAVE_VERSION + migrations
export const SAVE_KEY = 'lingzhiji.save.v1'
export const SAVE_VERSION = 7

// 奇遇 id 白名单（encounters.md §3.5，v7 校验用）；限次记录只收传说档
const ENCOUNTER_IDS = ENCOUNTERS.map((e) => e.id)
const LEGENDARY_IDS = ENCOUNTERS.filter((e) => e.tier === 'legendary').map((e) => e.id)

export interface SaveData {
  version: number
  savedAt: number
  game: GameState // rngState 内嵌于 GameState，不再单独存放
}

// 与 ActionResult 同风格的结果类型，便于测试直接断言 reason
export type LoadResult = { ok: boolean; state?: GameState; savedAt?: number; reason?: ReasonCode }
export type ImportResult = { ok: boolean; state?: GameState; reason?: ReasonCode }

function getStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null // 隐私模式下访问 localStorage 可能抛异常
  }
}

// 返回写入的 savedAt（多标签轮询比对用），失败返回 0
export function persist(state: GameState, storage: Storage | null = getStorage()): number {
  if (!storage) return 0
  const savedAt = Date.now()
  const data: SaveData = { version: SAVE_VERSION, savedAt, game: state }
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data))
    return savedAt
  } catch {
    return 0 // 容量满或被禁用：返回失败由 UI 提示，内存态继续游玩
  }
}

// 结构校验（契约草案校验规则第 3 条，深化版）：必需字段齐备、枚举合法、数值范围与内部结构逐层校验。
// 导入是唯一外部数据入口，脏值在此全部拦截，不进引擎。
const isInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v)
const nonNegInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0
const isStr = (v: unknown) => typeof v === 'string'
const isBool = (v: unknown) => typeof v === 'boolean'
const isHerbId = (v: unknown) => isStr(v) && Object.hasOwn(HERB_BY_ID, v)

function validField(f: unknown): boolean {
  if (typeof f !== 'object' || f === null) return false
  const x = f as Record<string, unknown>
  if (!nonNegInt(x.id) || (x.id as number) < 1) return false
  // 地力与茬口（farming-depth.md §3.2，随存档 v3）：所有状态必备地力、茬口可空
  if (!nonNegInt(x.fertility) || (x.fertility as number) > 2) return false
  if (x.lastCrop !== undefined && !isHerbId(x.lastCrop)) return false
  switch (x.status) {
    case 'empty':
      return true
    case 'growing':
    case 'mature':
      return (
        isHerbId(x.herb) && nonNegInt(x.progress) && nonNegInt(x.curYield) &&
        nonNegInt(x.dry) && isBool(x.halved)
      )
    case 'confiscated':
      return (x.refundSeed === undefined || isHerbId(x.refundSeed))
    default:
      return false
  }
}

function validLibStat(s: unknown): boolean {
  if (typeof s !== 'object' || s === null) return false
  const x = s as Record<string, unknown>
  return (
    nonNegInt(x.attempts) &&
    Array.isArray(x.distinctWords) && x.distinctWords.every(isStr) &&
    typeof x.firstCorrect === 'object' && x.firstCorrect !== null &&
    nonNegInt((x.firstCorrect as Record<string, unknown>).hit) && nonNegInt((x.firstCorrect as Record<string, unknown>).total) &&
    typeof x.reviewCorrect === 'object' && x.reviewCorrect !== null &&
    nonNegInt((x.reviewCorrect as Record<string, unknown>).hit) && nonNegInt((x.reviewCorrect as Record<string, unknown>).total) &&
    nonNegInt(x.sessions) &&
    Array.isArray(x.wrongQueue) && x.wrongQueue.every(isStr)
  )
}

// FSRS 复习卡（srs-audio.md §3.1，随存档 v4）：数值范围与 state 枚举校验
function validCard(c: unknown): boolean {
  if (typeof c !== 'object' || c === null) return false
  const x = c as Record<string, unknown>
  return (
    nonNegInt(x.due) && nonNegInt(x.last) &&
    typeof x.stability === 'number' && Number.isFinite(x.stability) && (x.stability as number) >= 0 &&
    typeof x.difficulty === 'number' && Number.isFinite(x.difficulty) && (x.difficulty as number) >= 0 &&
    isInt(x.state) && (x.state as number) >= 0 && (x.state as number) <= 3 &&
    nonNegInt(x.lapses)
  )
}

// 题型枚举（srs-audio.md §3.4）
const QUESTION_KINDS = ['w2c', 'c2w', 'listen', 'spell']

// 委托选项（cultivation-commissions.md §3.3，随存档 v6）：id 非空串、合法灵草、数量正整数、奖励四选一且数值合法
function validOffer(o: unknown): boolean {
  if (typeof o !== 'object' || o === null) return false
  const x = o as Record<string, unknown>
  const amountOk = nonNegInt(x.amount) && (x.amount as number) >= 1
  const reward = x.reward
  if (typeof reward !== 'object' || reward === null) return false
  const r = reward as Record<string, unknown>
  return (
    isStr(x.id) && (x.id as string).length > 0 &&
    isHerbId(x.herb) && nonNegInt(x.count) && (x.count as number) >= 1 &&
    (r.kind === 'stones' || r.kind === 'contribution' || r.kind === 'insight'
      ? amountOk
      : r.kind === 'seed' && isHerbId(r.herb) && amountOk)
  )
}

export function validate(game: unknown): ReasonCode | null {
  if (typeof game !== 'object' || game === null) return 'BAD_SHAPE'
  const g = game as GameState
  const ok =
    // 白名单与 types.CharacterId 同步维护（T37：漏改=新角色存档被判无效，导入/刷新恢复失败）
    (g.characterId === undefined || g.characterId === 'junior-sister' || g.characterId === 'senior-brother' || g.characterId === 'senior-sister' || g.characterId === 'sweeping-monk' || g.characterId === 'junior-brother' || g.characterId === 'eldest-brother' || g.characterId === 'bookworm' || g.characterId === 'old-herbalist') &&
    nonNegInt(g.day) && g.day >= 1 &&
    (g.phase === 'day' || g.phase === 'quota') &&
    nonNegInt(g.ap) && g.ap <= DAILY_AP &&
    isBool(g.wateredToday) && isBool(g.tunaUsedToday) &&
    typeof g.pendingTomorrow === 'object' && g.pendingTomorrow !== null &&
    (g.pendingTomorrow.marketMult === undefined || g.pendingTomorrow.marketMult === MARKET_UP || g.pendingTomorrow.marketMult === MARKET_DOWN) &&
    (g.pendingTomorrow.infusionDouble === undefined || isBool(g.pendingTomorrow.infusionDouble)) &&
    typeof g.resources === 'object' && g.resources !== null &&
    nonNegInt(g.resources.stones) && nonNegInt(g.resources.contribution) &&
    nonNegInt(g.resources.qi) && nonNegInt(g.resources.insight) &&
    nonNegInt(g.cultivation) &&
    isInt(g.realm) && g.realm >= 0 && g.realm <= 9 &&
    isInt(g.gongfa) && g.gongfa >= 1 && g.gongfa <= 5 &&
    Array.isArray(g.fields) && g.fields.length >= 1 && g.fields.every(validField) &&
    new Set(g.fields.map((f) => f.id)).size === g.fields.length &&
    typeof g.seeds === 'object' && g.seeds !== null &&
    HERBS.every((h) => nonNegInt(g.seeds[h.id])) &&
    Object.entries(g.seeds).every(([k, v]) => isHerbId(k) && nonNegInt(v)) &&
    typeof g.inventory === 'object' && g.inventory !== null &&
    HERBS.every((h) => nonNegInt(g.inventory[h.id])) &&
    Object.entries(g.inventory).every(([k, v]) => isHerbId(k) && nonNegInt(v)) &&
    // 委托三类状态（v6）：选项 ≤2、每项合法；active 不要求在当月选项内（跨月保留与选项刷新天然错开）
    typeof g.commissions === 'object' && g.commissions !== null &&
    Array.isArray(g.commissions.offers) && g.commissions.offers.length <= 2 &&
    g.commissions.offers.every(validOffer) &&
    isBool(g.commissions.acceptedThisMonth) &&
    (g.commissions.active === null || g.commissions.active === undefined || validOffer(g.commissions.active)) &&
    // 奇遇三类状态（v7，encounters.md §3.5）：入队 id 白名单、冷却键值合法、传说限次记录无重复
    typeof g.encounter === 'object' && g.encounter !== null &&
    (g.encounter.queued === null || (isStr(g.encounter.queued) && (ENCOUNTER_IDS as string[]).includes(g.encounter.queued))) &&
    typeof g.encounter.cooldowns === 'object' && g.encounter.cooldowns !== null &&
    Object.entries(g.encounter.cooldowns).every(([k, v]) => (ENCOUNTER_IDS as string[]).includes(k) && nonNegInt(v)) &&
    Array.isArray(g.encounter.seenOnce) &&
    g.encounter.seenOnce.every((id) => (LEGENDARY_IDS as string[]).includes(id)) &&
    new Set(g.encounter.seenOnce).size === g.encounter.seenOnce.length &&
    typeof g.quizDaily === 'object' && g.quizDaily !== null && isBool(g.quizDaily.done) &&
    typeof g.learning === 'object' && g.learning !== null &&
    (g.learning.currentLib === 'cet4' || g.learning.currentLib === 'cet6') &&
    typeof g.learning.seenMap === 'object' && g.learning.seenMap !== null &&
    Object.values(g.learning.seenMap).every(nonNegInt) &&
    typeof g.learning.libs === 'object' && g.learning.libs !== null &&
    validLibStat(g.learning.libs.cet4) && validLibStat(g.learning.libs.cet6) &&
    typeof g.learning.cards === 'object' && g.learning.cards !== null &&
    Object.entries(g.learning.cards).every(([k, c]) => isStr(k) && validCard(c)) &&
    typeof g.month === 'object' && g.month !== null &&
    nonNegInt(g.month.unpaidStreak) && Array.isArray(g.month.ledger) &&
    g.month.ledger.every((entry) => typeof entry === 'object' && entry !== null && nonNegInt(entry.month) && entry.month >= 1 && isBool(entry.paid) && isStr(entry.detail)) &&
    // 现实日锚与道心连胜（real-day.md §3.6，存档 v2 新增）：数值范围、history 升序去重、milestones 合法、freezes ≤ 上限
    typeof g.realDay === 'object' && g.realDay !== null &&
    nonNegInt(g.realDay.today) &&
    typeof g.streak === 'object' && g.streak !== null &&
    nonNegInt(g.streak.count) && nonNegInt(g.streak.best) && nonNegInt(g.streak.checkins) &&
    isInt(g.streak.lastCheckinDay) && g.streak.lastCheckinDay >= -1 &&
    nonNegInt(g.streak.freezes) && g.streak.freezes <= FREEZE_CAP &&
    Array.isArray(g.streak.milestones) && g.streak.milestones.every((m) => (STREAK_MILESTONES as number[]).includes(m)) &&
    new Set(g.streak.milestones).size === g.streak.milestones.length &&
    Array.isArray(g.streak.history) && g.streak.history.length <= STREAK_HISTORY_MAX &&
    g.streak.history.every((v) => nonNegInt(v)) &&
    g.streak.history.every((v, i) => i === 0 || v > g.streak!.history[i - 1]) &&
    isBool(g.milestoneShown) && isBool(g.tutorialDone) &&
    Array.isArray(g.log) && g.log.length <= LOG_MAX &&
    g.log.every((l) => typeof l === 'object' && l !== null && nonNegInt(l.day) && isStr(l.title) && isStr(l.text)) &&
    nonNegInt(g.rngState)
  if (!ok) return 'BAD_SHAPE'
  // quiz 会话结构（存在时）
  if (g.quizDaily.session) {
    const q = g.quizDaily.session
    const okQ =
      (q.lib === 'cet4' || q.lib === 'cet6') &&
      Array.isArray(q.questions) && q.questions.length === 10 &&
      q.questions.every((x) => typeof x === 'object' && x !== null && isStr(x.word) && isStr(x.meaning) &&
        (x.from === 'new' || x.from === 'review') && Array.isArray(x.opts) && isStr(x.kind) && QUESTION_KINDS.includes(x.kind) &&
        // spell 题无选项（opts 空）；w2c 四释义含正确释义，c2w/listen 四单词含正确单词（选项语义随题型）
        (x.kind === 'spell'
          ? x.opts.length === 0
          : x.opts.length === 4 && x.opts.every(isStr) && new Set(x.opts).size === 4 &&
            (x.kind === 'w2c' ? x.opts.includes(x.meaning) : x.opts.includes(x.word)))) &&
      (q.phase === 'learning' || q.phase === 'testing' || q.phase === 'result') &&
      Array.isArray(q.answers) && q.answers.length === 10 &&
      q.answers.every((a, i) => a === null || (isStr(a) &&
        // spell 题记录玩家输入原文（非空），其余题型必须是本场选项之一
        (q.questions[i].kind === 'spell' ? a.length > 0 : q.questions[i].opts.includes(a)))) &&
      isInt(q.idx) && q.idx >= 0 && q.idx < 10
    if (!okQ) return 'BAD_SHAPE'
  }
  return null
}

export function load(storage: Storage | null = getStorage()): LoadResult {
  if (!storage) return { ok: false, reason: 'BAD_SHAPE' }
  let raw: string | null
  try {
    raw = storage.getItem(SAVE_KEY)
  } catch {
    return { ok: false, reason: 'BAD_SHAPE' }
  }
  if (!raw) return { ok: false, reason: 'NO_SAVE' } // 无存档与坏档分走 StartScreen 的空档/损坏两个分支
  let data: SaveData
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'BAD_JSON' }
  }
  if (!data || typeof data !== 'object') return { ok: false, reason: 'BAD_SHAPE' }
  // 版本为正整数且不超前于当前 → 顺序迁移升格后校验（real-day.md §3.6）；当前版本迁移链为空，等价直接验
  if (!isInt(data.version) || data.version < 1 || data.version > SAVE_VERSION) return { ok: false, reason: 'BAD_VERSION' }
  const migrated = applyMigrations(data)
  const shapeErr = validate(migrated.game)
  if (shapeErr) return { ok: false, reason: shapeErr }
  return { ok: true, state: migrated.game, savedAt: data.savedAt }
}

// 导出：JSON(UTF-8) → Base64（save.md §3.4）
export function exportCode(state: GameState): string {
  const data: SaveData = { version: SAVE_VERSION, savedAt: Date.now(), game: state }
  const json = JSON.stringify(data)
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

// 导入：Base64 → JSON → 版本 → 结构，任一失败保留原档返回 reason
export function importCode(code: string): ImportResult {
  let json: string
  try {
    const bin = atob(code.trim())
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    json = new TextDecoder().decode(bytes)
  } catch {
    return { ok: false, reason: 'BAD_BASE64' }
  }
  let data: SaveData
  try {
    data = JSON.parse(json)
  } catch {
    return { ok: false, reason: 'BAD_JSON' }
  }
  if (!data || typeof data !== 'object') return { ok: false, reason: 'BAD_SHAPE' }
  // 与 load 同口径：正整数且不超前于当前 → 顺序迁移升格后校验，v1 导码可导入（real-day.md §3.6）
  if (!isInt(data.version) || data.version < 1 || data.version > SAVE_VERSION) return { ok: false, reason: 'BAD_VERSION' }
  const migrated = applyMigrations(data)
  const shapeErr = validate(migrated.game)
  if (shapeErr) return { ok: false, reason: shapeErr }
  return { ok: true, state: migrated.game }
}

// 顺序迁移链（save.md §3.3）：每项只把自家源版本升一格，按 data.version 判定是否命中
export const migrations: ((data: SaveData) => SaveData)[] = [
  // v1 → v2（real-day.md §3.6）：补现实日锚与道心连胜默认值；realDay.today 用迁移时刻的当前现实日，旧档连胜从 0 起算。
  // v1 档从未携带 gamesToday，无需补（v5 起该字段已删除）
  (data) => {
    if (data.version !== 1) return data
    return {
      ...data,
      version: 2,
      game: {
        ...data.game,
        realDay: { today: realDayIndex(Date.now()) },
        streak: { count: 0, best: 0, lastCheckinDay: -1, checkins: 0, freezes: 0, milestones: [], history: [] },
      },
    }
  },
  // v2 → v3（farming-depth.md §2）：田块补地力常沃（fertility 1）；lastCrop 留空 = 无茬口记忆。
  // 脏档（fields 缺失/非数组）不在此修复，保持原样交给后续 validate 拦截（迁移必须容错不抛异常）
  (data) => {
    if (data.version !== 2) return data
    return {
      ...data,
      version: 3,
      game: {
        ...data.game,
        ...(Array.isArray(data.game?.fields) ? { fields: data.game.fields.map((f) => ({ ...f, fertility: 1 })) } : {}),
      },
    }
  },
  // v3 → v4（srs-audio.md §3.1）：错词池 + 已见词一次性转为 FSRS 复习卡——
  // 错词 Again（短间隔尽快重现）、已见非错词 Good（长间隔起步）；wrongQueue 字段保留但此后恒空。
  // 学习不存在中间态的词（无 seenMap 记录）不建卡 = new。脏档交 validate 拦截
  (data) => {
    if (data.version !== 3) return data
    const learning = data.game?.learning
    const today = data.game?.realDay?.today ?? 0
    const cards: Record<string, ReturnType<typeof grade>> = {}
    if (learning && typeof learning === 'object' && typeof learning.seenMap === 'object' && learning.seenMap !== null) {
      const wrong = new Set<string>()
      for (const lib of ['cet4', 'cet6'] as const) {
        const q = learning.libs?.[lib]?.wrongQueue
        if (Array.isArray(q)) for (const w of q) wrong.add(w)
      }
      for (const w of Object.keys(learning.seenMap)) {
        cards[w] = grade({}, w, today, !wrong.has(w))
      }
    }
    return {
      ...data,
      version: 4,
      game: {
        ...data.game,
        ...(learning && typeof learning === 'object'
          ? {
              learning: {
                ...learning,
                cards,
                // wrongQueue 在 v4 恒空（字段保留供校验）：迁移时把旧档遗留队列一并清掉，
                // 否则 UI 会展示一个永不更新的僵尸错词池。脏档缺库时字段缺失交 validate 拦截
                libs: learning.libs && typeof learning.libs === 'object'
                  ? {
                      ...learning.libs,
                      cet4: { ...learning.libs.cet4, wrongQueue: [] },
                      cet6: { ...learning.libs.cet6, wrongQueue: [] },
                    }
                  : learning.libs,
              },
            }
          : {}),
      },
    }
  },
  // v4 → v5（time-decouple.md §3.5，T49 时间解耦）：生长期全表 ÷3——生长中田块进度按新旧天数比例折算，
  // 折算后恰达新生长期即置成熟（不丢收成）；删除地力透支 gamesToday 字段；
  // quizDaily.done 语义改为「本现实日已领奖励」，迁移时刻已完成则保持 true（当日不重复发奖）。脏档交 validate 拦截
  (data) => {
    if (data.version !== 4) return data
    // 折算基准：v4 时代的生长期（constants 现值已 ÷3，旧值只能在此留档）
    const OLD_DAYS: Record<string, number> = { qingling: 15, ninglu: 20, ziyun: 30, chisui: 35, longxue: 50, jiuye: 60 }
    const fields = Array.isArray(data.game?.fields)
      ? data.game.fields.map((f) => {
          if (f.status !== 'growing' || !f.herb) return f
          const oldDays = OLD_DAYS[f.herb]
          const newDays = HERB_BY_ID[f.herb]?.days
          if (!oldDays || !newDays || typeof f.progress !== 'number') return f
          // 功法 Lv2 生长期 −1 对新旧表同向生效：折算后与新 effDays 比对，达标即成熟
          const eff = Math.max(1, newDays - (data.game.gongfa >= 2 ? 1 : 0))
          const progress = Math.round(f.progress * (newDays / oldDays))
          return progress >= eff
            ? { ...f, progress: eff, status: 'mature' as const }
            : { ...f, progress }
        })
      : data.game?.fields
    const realDay = data.game?.realDay
    return {
      ...data,
      version: 5,
      game: {
        ...data.game,
        ...(fields ? { fields } : {}),
        ...(realDay && typeof realDay === 'object'
          ? { realDay: { today: realDay.today } }
          : {}),
      },
    }
  },
  // v5 → v6（cultivation-commissions.md §3.3，T39 委托接引擎）：补空委托状态——
  // 本月选项留空（下月初由 advanceDay 生成，旧档当月不补发），资格与活跃零值
  (data) => {
    if (data.version !== 5) return data
    return {
      ...data,
      version: 6,
      game: { ...data.game, commissions: { offers: [], acceptedThisMonth: false, active: null } },
    }
  },
  // v6 → v7（encounters.md §3.5，T55 奇遇）：补空奇遇状态——无入队、无冷却、传说零记录；
  // 旧档无奇遇历史，从零开始掷
  (data) => {
    if (data.version !== 6) return data
    return {
      ...data,
      version: 7,
      game: { ...data.game, encounter: { queued: null, cooldowns: {}, seenOnce: [] } },
    }
  },
]

export function applyMigrations(data: SaveData): SaveData {
  let cur = data
  for (const m of migrations) cur = m(cur)
  return cur
}
