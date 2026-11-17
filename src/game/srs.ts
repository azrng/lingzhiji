// SRS 复习调度（srs-audio.md §3.1）：ts-fsrs 纯函数包装。
// 时间轴约定：「现实日索引 × 1 天」映射到固定伪日期轴（BASE），绕开 Date 时区与时刻噪声；
// 调度锚定现实日（遗忘属于现实世界的玩家，不随游戏日连推加速），today 由调用方注入，
// 引擎保持零时间依赖（与 clock.ts 同模式）。短期记忆关闭：全部间隔为天级（游戏最细复习粒度是天），
// fuzz 关闭保证同 rngState 可复现。
import { createEmptyCard, fsrs, generatorParameters, Rating, type Card } from 'ts-fsrs'
import type { FsrsCardLite } from './types'

const DAY_MS = 86_400_000
const BASE = Date.UTC(2026, 0, 1)
const engine = fsrs(generatorParameters({ enable_fuzz: false, enable_short_term: false }))

const dayToDate = (idx: number) => new Date(BASE + idx * DAY_MS)
const dateToDay = (d: Date) => Math.round((d.getTime() - BASE) / DAY_MS)

// 序列化卡 → ts-fsrs Card（缺省字段按可重建口径填充：reps/elapsed 影响有限，调度由 stability 主导）
function toCard(lite: FsrsCardLite, todayIdx: number): Card {
  return {
    due: dayToDate(lite.due),
    stability: lite.stability,
    difficulty: lite.difficulty,
    elapsed_days: Math.max(0, todayIdx - lite.last),
    last_review: dayToDate(lite.last),
    reps: 1,
    lapses: lite.lapses,
    state: lite.state as Card['state'],
    scheduled_days: 0,
    learning_steps: 0,
  }
}

// ts-fsrs Card → 序列化卡
function fromCard(card: Card, todayIdx: number): FsrsCardLite {
  return {
    due: dateToDay(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    state: card.state as number,
    lapses: card.lapses,
    last: todayIdx,
  }
}

// 一次记忆事件：correct 映射 Good / Again；首见词从空卡起步（先学后测答对即 Good 起步）
export function grade(
  cards: Record<string, FsrsCardLite>,
  word: string,
  todayIdx: number,
  correct: boolean,
): FsrsCardLite {
  const lite = cards[word]
  const card = lite ? toCard(lite, todayIdx) : createEmptyCard(dayToDate(todayIdx))
  const nextCard = engine.next(card, dayToDate(todayIdx), correct ? Rating.Good : Rating.Again).card
  return fromCard(nextCard, todayIdx)
}

// 到期词（已学且 due <= today），按到期最早优先——复习候选的取词顺序
export function dueWords(cards: Record<string, FsrsCardLite>, todayIdx: number): string[] {
  return Object.entries(cards)
    .filter(([, c]) => c.state !== 0 && c.due <= todayIdx)
    .sort((a, b) => a[1].due - b[1].due)
    .map(([w]) => w)
}

// 今日到期数（任务堂入口徽标）
export function dueCount(cards: Record<string, FsrsCardLite>, todayIdx: number): number {
  return dueWords(cards, todayIdx).length
}

// 已学词按稳定性升序（全库学完且无到期时的兜底出题顺序：最不稳优先）
export function leastStable(cards: Record<string, FsrsCardLite>): string[] {
  return Object.entries(cards)
    .filter(([, c]) => c.state !== 0)
    .sort((a, b) => a[1].stability - b[1].stability)
    .map(([w]) => w)
}

// 展示口径「N 天后复习」；已到期显示 0
export function dueInDays(lite: FsrsCardLite, todayIdx: number): number {
  return Math.max(0, lite.due - todayIdx)
}
