// 存档（save.md）：localStorage 唯一读写点；版本校验、Base64 导码、损坏恢复。
// UI 与 store 禁止直用 localStorage。storage 参数默认注入，测试传内存实现。
import { HERB_BY_ID, HERBS } from './constants'
import type { GameState, ReasonCode } from './types'

export const SAVE_KEY = 'lingzhiji.save.v1'
export const SAVE_VERSION = 1

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

function validate(game: unknown): ReasonCode | null {
  if (typeof game !== 'object' || game === null) return 'BAD_SHAPE'
  const g = game as GameState
  const ok =
    (g.characterId === undefined || g.characterId === 'junior-sister' || g.characterId === 'senior-brother' || g.characterId === 'senior-sister') &&
    nonNegInt(g.day) && g.day >= 1 &&
    (g.phase === 'day' || g.phase === 'quota') &&
    nonNegInt(g.ap) && g.ap <= 3 &&
    isBool(g.wateredToday) && isBool(g.tunaUsedToday) &&
    typeof g.pendingTomorrow === 'object' && g.pendingTomorrow !== null &&
    (g.pendingTomorrow.marketMult === undefined || g.pendingTomorrow.marketMult === 1.5 || g.pendingTomorrow.marketMult === 0.7) &&
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
    typeof g.quizDaily === 'object' && g.quizDaily !== null && isBool(g.quizDaily.done) &&
    typeof g.learning === 'object' && g.learning !== null &&
    (g.learning.currentLib === 'cet4' || g.learning.currentLib === 'cet6') &&
    typeof g.learning.seenMap === 'object' && g.learning.seenMap !== null &&
    Object.values(g.learning.seenMap).every(nonNegInt) &&
    typeof g.learning.libs === 'object' && g.learning.libs !== null &&
    validLibStat(g.learning.libs.cet4) && validLibStat(g.learning.libs.cet6) &&
    typeof g.month === 'object' && g.month !== null &&
    nonNegInt(g.month.unpaidStreak) && Array.isArray(g.month.ledger) &&
    g.month.ledger.every((entry) => typeof entry === 'object' && entry !== null && nonNegInt(entry.month) && entry.month >= 1 && isBool(entry.paid) && isStr(entry.detail)) &&
    isBool(g.milestoneShown) && isBool(g.tutorialDone) &&
    Array.isArray(g.log) && g.log.length <= 50 &&
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
        (x.from === 'new' || x.from === 'review') && Array.isArray(x.opts) && x.opts.length === 4 && x.opts.every(isStr) &&
        new Set(x.opts).size === 4 && x.opts.includes(x.meaning)) &&
      (q.phase === 'learning' || q.phase === 'testing' || q.phase === 'result') &&
      Array.isArray(q.answers) && q.answers.length === 10 &&
      q.answers.every((a, i) => a === null || (isStr(a) && q.questions[i].opts.includes(a))) &&
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
  if (data.version !== SAVE_VERSION) return { ok: false, reason: 'BAD_VERSION' }
  const shapeErr = validate(data.game)
  if (shapeErr) return { ok: false, reason: shapeErr }
  return { ok: true, state: data.game, savedAt: data.savedAt }
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
  if (data.version !== SAVE_VERSION) return { ok: false, reason: 'BAD_VERSION' }
  const shapeErr = validate(data.game)
  if (shapeErr) return { ok: false, reason: shapeErr }
  return { ok: true, state: data.game }
}

// 未来结构变更在此追加顺序迁移链（save.md §3.3）；v1 无迁移
export const migrations: ((data: SaveData) => SaveData)[] = []

export function applyMigrations(data: SaveData): SaveData {
  let cur = data
  for (const m of migrations) cur = m(cur)
  return cur
}
