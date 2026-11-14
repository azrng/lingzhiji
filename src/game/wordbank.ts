// 词库加载与口径（CON-LINGZHIJI-WLIB-001：src/data/words/*.json 为事实来源）
// 词条：word / meaning（词性前缀 + 中文释义）/ phonetic（源数据缺失，暂空）/ group（近义组，MVP 留空）
import cet4Json from '../data/words/cet4.json'
import cet6Json from '../data/words/cet6.json'
import type { LibId } from './types'
import { shuffled, type Rng } from './rng'

export interface WordEntry {
  word: string
  meaning: string
  phonetic: string
  group: string[]
}

export const LIBS: Record<LibId, WordEntry[]> = {
  cet4: cet4Json as WordEntry[],
  cet6: cet6Json as WordEntry[],
}

// 同词识别：去首尾空格并忽略大小写（PRD §8.1 跨库口径）
export const normalize = (word: string) => word.trim().toLowerCase()

// 归一化词 → 词条（同词多释义已在数据源合并）
const INDEX: Record<LibId, Map<string, WordEntry>> = {
  cet4: new Map(LIBS.cet4.map((w) => [normalize(w.word), w])),
  cet6: new Map(LIBS.cet6.map((w) => [normalize(w.word), w])),
}

export const entryOf = (lib: LibId, norm: string) => INDEX[lib].get(norm)

// 干扰项：从当前词库抽取，跳过本词与同一非空近义组（PRD §8.1）；
// 凑不齐 3 个合法干扰项返回 null，调用方按「词库问题」处理，不出歧义题
export function buildOptions(rng: Rng, entry: WordEntry, lib: LibId): string[] | null {
  const pool = LIBS[lib].filter(
    (w) => normalize(w.word) !== normalize(entry.word) && w.meaning !== entry.meaning &&
      !(entry.group.length && w.group.some((g) => entry.group.includes(g))),
  )
  const seen = new Set<string>([entry.meaning])
  const picked: string[] = []
  for (const w of shuffled(rng, pool)) {
    if (seen.has(w.meaning)) continue
    seen.add(w.meaning)
    picked.push(w.meaning)
    if (picked.length === 3) break
  }
  if (picked.length < 3) return null
  return [...picked, entry.meaning].sort(() => rng.next() - 0.5)
}

// 词库可用性：能否组成 n 个不同单词（开始前校验，PRD §8.1 / §18 P0）
export function canFormSession(lib: LibId, need: number): boolean {
  return LIBS[lib].length >= need
}
