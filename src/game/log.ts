// 日志写入：新条目在前，环形保留 LOG_MAX 条（core-loop.md §3.5）
import { LOG_MAX } from './constants'
import type { GameState, LogEntry } from './types'

export function addLog(s: GameState, e: Omit<LogEntry, 'day'>): void {
  s.log.unshift({ day: s.day, ...e })
  if (s.log.length > LOG_MAX) s.log.length = LOG_MAX
}
