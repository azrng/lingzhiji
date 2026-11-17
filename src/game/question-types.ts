// 题型注册表（srs-audio.md §3.4）：数据驱动，新增题型只加表项。
// 题型只改变「怎么考」：buildQuestion 的产物与现有 QuizQuestion 兼容（kind 区分渲染与校验），
// 计分、奖励与 SRS 评级口径不变。解锁锚 = 该库累计完成任务场次（2026-11-17 拍板，不绑游戏境界）。
import { buildOptions, LIBS, normalize, type WordEntry } from './wordbank'
import { pick, shuffled, type Rng } from './rng'
import type { LibId, QuestionKind, QuizQuestion } from './types'

export interface QuestionType {
  id: QuestionKind
  name: string
  sessionsMin: number // 解锁该题型所需的库内完成任务场次
}

export const QUESTION_TYPES: QuestionType[] = [
  { id: 'w2c', name: '认词', sessionsMin: 0 },
  { id: 'c2w', name: '释义反选', sessionsMin: 2 },
  { id: 'listen', name: '听音辨词', sessionsMin: 5 },
  { id: 'spell', name: '灵种拼写', sessionsMin: 10 },
]

// 解锁场次前的「老题型为主」窗口：20 场内 80% 出认词，之后四题型均衡
const W2C_HEAVY_ROUNDS = 20

// 新词固定认词：刚学的词先认读，再进阶到其他题型（PRD §8.6）
export function pickKind(rng: Rng, sessions: number, from: 'new' | 'review'): QuestionKind {
  if (from === 'new') return 'w2c'
  const pool = QUESTION_TYPES.filter((t) => sessions >= t.sessionsMin)
  if (pool.length === 1) return 'w2c'
  if (sessions <= W2C_HEAVY_ROUNDS && rng.next() < 0.8) return 'w2c'
  return pick(rng, pool).id
}

// 单词干扰项（c2w / listen 用）：3 个其他词的拼写，排除本词与重名归一化词
function buildWordOptions(rng: Rng, entry: WordEntry, lib: LibId): string[] | null {
  const bank = LIB_WORDS[lib]
  const seen = new Set([normalize(entry.word)])
  const picked: string[] = []
  const take = (w: string) => {
    const norm = normalize(w)
    if (seen.has(norm)) return
    seen.add(norm)
    picked.push(w)
  }
  for (let attempt = 0; attempt < 30 && picked.length < 3 && bank.length; attempt++) {
    take(bank[Math.floor(rng.next() * bank.length)])
  }
  if (picked.length < 3) for (const w of bank) {
    take(w)
    if (picked.length === 3) break
  }
  if (picked.length < 3) return null
  return shuffled(rng, [...picked, entry.word])
}

// 词库单词表（wordbank.LIBS 的 word 投影）
const LIB_WORDS: Record<LibId, string[]> = {
  cet4: LIBS.cet4.map((w) => w.word),
  cet6: LIBS.cet6.map((w) => w.word),
}

// 按题型出题；返回 null = 当前词库凑不齐该题型的合法选项（调用方按词库问题处理）
export function buildQuestion(
  rng: Rng,
  entry: WordEntry,
  lib: LibId,
  kind: QuestionKind,
  from: 'new' | 'review',
): QuizQuestion | null {
  if (kind === 'spell') {
    // 拼写题无选项：作答为键盘输入，opts 恒空数组（存档校验按 kind 放宽）
    return { word: entry.word, meaning: entry.meaning, from, opts: [], kind }
  }
  if (kind === 'w2c') {
    const opts = buildOptions(rng, entry, lib)
    if (!opts) return null
    return { word: entry.word, meaning: entry.meaning, from, opts, kind }
  }
  // c2w / listen：中文释义（或发音）反选英文单词
  const opts = buildWordOptions(rng, entry, lib)
  if (!opts) return null
  return { word: entry.word, meaning: entry.meaning, from, opts, kind }
}
