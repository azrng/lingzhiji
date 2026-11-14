// 存档（save.md）：localStorage 唯一读写点；版本校验、Base64 导码、损坏恢复。
// UI 与 store 禁止直用 localStorage。storage 参数默认注入，测试传内存实现。
import type { GameState, ReasonCode } from './types'

export const SAVE_KEY = 'lingzhiji.save.v1'
export const SAVE_VERSION = 1

export interface SaveData {
  version: number
  savedAt: number
  game: GameState // rngState 内嵌于 GameState，不再单独存放
}

// 与 ActionResult 同风格的结果类型，便于测试直接断言 reason
export type LoadResult = { ok: boolean; state?: GameState; reason?: ReasonCode }
export type ImportResult = { ok: boolean; state?: GameState; reason?: ReasonCode }

function getStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null // 隐私模式下访问 localStorage 可能抛异常
  }
}

export function persist(state: GameState, storage: Storage | null = getStorage()): boolean {
  if (!storage) return false
  const data: SaveData = { version: SAVE_VERSION, savedAt: Date.now(), game: state }
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false // 容量满或被禁用：返回失败由 UI 提示，内存态继续游玩
  }
}

// 结构校验（契约草案校验规则第 3 条）：必需字段齐备、数值 ≥0、长度合法
function validate(game: unknown): ReasonCode | null {
  if (typeof game !== 'object' || game === null) return 'BAD_SHAPE'
  const g = game as GameState
  const ok =
    typeof g.day === 'number' && g.day >= 1 &&
    (g.phase === 'day' || g.phase === 'quota') &&
    typeof g.ap === 'number' && g.ap >= 0 &&
    typeof g.resources?.stones === 'number' && g.resources.stones >= 0 &&
    typeof g.resources?.contribution === 'number' && g.resources.contribution >= 0 &&
    typeof g.resources?.qi === 'number' && g.resources.qi >= 0 &&
    typeof g.resources?.insight === 'number' && g.resources.insight >= 0 &&
    typeof g.cultivation === 'number' && g.cultivation >= 0 &&
    typeof g.realm === 'number' && g.realm >= 0 && g.realm <= 9 &&
    typeof g.gongfa === 'number' && g.gongfa >= 1 && g.gongfa <= 5 &&
    Array.isArray(g.fields) && g.fields.length >= 1 &&
    typeof g.learning?.currentLib === 'string' &&
    typeof g.learning?.seenMap === 'object' &&
    typeof g.month?.unpaidStreak === 'number' && g.month.unpaidStreak >= 0 &&
    typeof g.rngState === 'number' &&
    Array.isArray(g.log)
  if (!ok) return 'BAD_SHAPE'
  // quiz 会话结构（存在时）
  if (g.quizDaily?.session) {
    const q = g.quizDaily.session
    const okQ =
      (q.lib === 'cet4' || q.lib === 'cet6') &&
      Array.isArray(q.questions) && q.questions.length === 10 &&
      Array.isArray(q.answers) && q.answers.length === 10 &&
      typeof q.idx === 'number' && q.idx >= 0 && q.idx < 10
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
  if (data.version !== SAVE_VERSION) return { ok: false, reason: 'BAD_VERSION' }
  const shapeErr = validate(data.game)
  if (shapeErr) return { ok: false, reason: shapeErr }
  return { ok: true, state: data.game }
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
