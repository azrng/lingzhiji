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

// 词性列表：长词在前，避免单字母（n/v/p）截断多字母词性
const POS_SOURCE = 'vt|vi|pl|adj|adv|aux|art|conj|num|prep|pron|int|n|v'
// 复合词性（n & v. / adv&prep.）：切分前先占位，防止从复合中间断开产生垃圾段
const COMPOSITE_POS = new RegExp(`\\b(${POS_SOURCE})(?:\\s*&\\s*(?:${POS_SOURCE}))+`, 'gi')
// 切分边界：词性标签处，或复合词性占位符（占位符自身不在词性列表内，需显式保留边界）
const POS_BOUNDARY = new RegExp(`(?=\\b(?:${POS_SOURCE})\\.|\u0001\\d+\u0001\\.)`, 'g')
// 尾部孤立词性残迹（原始数据脏尾巴，如 '…上诉；vi&n'）
const TAIL_POS_DEBRIS = new RegExp(`[；;,、]\\s*(?:${POS_SOURCE})(?:\\s*&\\s*(?:${POS_SOURCE}))*\\.?\\s*$`, 'i')

// 比较键：去空白、省略号与标点归一、小写（……与…、全半角逗号分号视为同义）
const normKey = (s: string): string =>
  s.replace(/\s+/g, '').replace(/……/g, '…').replace(/[，,]/g, ',').replace(/[；;]/g, ';').toLowerCase()
// 词性族集合：vt/vi 归一为 v，族以集合语义比较（vt&vi&n ≡ v&n 口径下的覆盖关系）
const famSet = (posKey: string): Set<string> => new Set(posKey.replace(/vt|vi/g, 'v').split('&'))
const famSubset = (a: Set<string>, b: Set<string>): boolean => [...a].every((x) => b.has(x))
// 义项集合：段内释义按中英文分隔符拆开
const itemsOf = (def: string): Set<string> =>
  new Set(def.split(/[；;，,、/]/).map((p) => p.replace(/\s+/g, '').replace(/……/g, '…')).filter(Boolean))
const subsetOf = (a: Set<string>, b: Set<string>): boolean => [...a].every((x) => b.has(x))

// 词义清洗（词库原始数据为多来源拼贴：同义段重复、复合词性写法不一、省略号全半角混用）。
// 规则：按词性标签切段 → 剥尾部残迹/丢空段 → 同键重复留首现；义项被另一段完全覆盖
// （义项 ⊆ 且词性族 ⊆，如 vt.{攻击,进攻} ⊆ vt&vi&n.{攻击,进攻}）时丢弃，信息无损合并；
// 词性族互不覆盖的段（如 n. 滥用 与 v. 滥用）保留——不同词性的释义对学习者是有效信息。
// v3（T59）：同词性多段且义项部分重叠（v2 段级覆盖只能丢整段的残留，探针 1503/8459 条）→
// 同 pos 段合并为一段，义项按首现顺序去重——只去重复字符串，不动近义词（离弃/遗弃是合法信息）。
export function cleanMeaning(meaning: string): string {
  const stash: string[] = []
  const stashed = meaning.replace(COMPOSITE_POS, (m) => {
    stash.push(m)
    return `\u0001${stash.length - 1}\u0001`
  })
  const rawSegs = stashed.split(POS_BOUNDARY).map((s) => s.trim().replace(/[；;]+$/, '').trim()).filter(Boolean)
  const segs: { pos: string; def: string; items: Set<string> }[] = []
  for (const raw of rawSegs) {
    const restored = raw.replace(/\u0001(\d+)\u0001/g, (_, i) => stash[Number(i)])
    const m = restored.match(new RegExp(`^((?:${POS_SOURCE})(?:\\s*&\\s*(?:${POS_SOURCE}))*)\\.\\s*(.*)$`, 'i'))
    let pos = ''
    let def = restored
    if (m) {
      pos = m[1]
      def = m[2]
    }
    def = def.replace(TAIL_POS_DEBRIS, '').replace(/\s{2,}/g, ' ').trim()
    if (!def) continue // 无释义内容的段（尾部孤立词性标签）直接丢弃
    segs.push({ pos, def, items: itemsOf(def) })
  }
  const keys = segs.map((s) => `${normKey(s.pos)}|${normKey(s.def)}`)
  const fams = segs.map((s) => famSet(normKey(s.pos)))
  const covered = (i: number, j: number): boolean => subsetOf(segs[i].items, segs[j].items) && famSubset(fams[i], fams[j])
  const drop = new Array<boolean>(segs.length).fill(false)
  for (let i = 0; i < segs.length; i++) {
    if (drop[i]) continue
    for (let j = i + 1; j < segs.length; j++) {
      if (drop[j]) continue
      // 完全等价（同键或互为覆盖）：保留首现
      if (keys[i] === keys[j] || (covered(i, j) && covered(j, i))) {
        drop[j] = true
        continue
      }
      // 单向覆盖：丢被覆盖的一段
      if (covered(i, j)) {
        drop[i] = true
        break
      }
      if (covered(j, i)) drop[j] = true
    }
  }
  // v3 同词性段合并：段级去重后仍可能同 pos 多段（义项部分重叠），合并为一段做义项级去重。
  // 只重建真合并/真过滤的组——单段无过滤的组保留原文（含原有「；」子义分组与空格），改动面最小。
  // 纯拉丁义项（如 urban 的垃圾段「adj. a.」）是数据源词性残迹，中文词典不会出现合法纯拉丁义项，过滤
  const LATIN_DEBRIS = /^[a-z&.\s]+$/i
  const groups: { pos: string; items: string[]; segCount: number; filtered: boolean; raw?: string }[] = []
  const posIndex = new Map<string, number>()
  for (const s of segs.filter((_, k) => !drop[k])) {
    const filtered = [...s.items].some((it) => LATIN_DEBRIS.test(it))
    const items = [...s.items].filter((it) => !LATIN_DEBRIS.test(it))
    if (!items.length) continue
    const key = normKey(s.pos)
    if (!key) {
      groups.push({ pos: '', items, segCount: 1, filtered, raw: s.def })
      continue
    }
    const idx = posIndex.get(key)
    if (idx === undefined) {
      posIndex.set(key, groups.length)
      groups.push({ pos: s.pos, items, segCount: 1, filtered, raw: s.def })
    } else {
      groups[idx].segCount += 1
      groups[idx].filtered = groups[idx].filtered || filtered
      for (const it of items) if (!groups[idx].items.includes(it)) groups[idx].items.push(it)
    }
  }
  if (!groups.length) return meaning // 全段皆为残迹的极端脏档：回退原文，好过空释义
  return groups
    .map((g) => {
      if (g.segCount === 1 && !g.filtered) return (g.pos ? `${g.pos}. ${g.raw!}` : g.raw!).trim()
      return (g.pos ? `${g.pos}. ${g.items.join('，')}` : g.items.join('，')).trim()
    })
    .join('；')
}

const prepareBank = (entries: WordEntry[]) => entries.map((entry) => ({ ...entry, meaning: cleanMeaning(entry.meaning) }))

export const LIBS: Record<LibId, WordEntry[]> = {
  cet4: prepareBank(cet4Json as WordEntry[]),
  cet6: prepareBank(cet6Json as WordEntry[]),
}

// 同词识别：去首尾空格并忽略大小写（PRD §8.1 跨库口径）
export const normalize = (word: string) => word.trim().toLowerCase()

// 归一化词 → 词条（同词多释义已在数据源合并）
const INDEX: Record<LibId, Map<string, WordEntry>> = {
  cet4: new Map(LIBS.cet4.map((w) => [normalize(w.word), w])),
  cet6: new Map(LIBS.cet6.map((w) => [normalize(w.word), w])),
}

export const entryOf = (lib: LibId, norm: string) => INDEX[lib].get(norm)

// 词库没有近义分组时，只用完全相同的释义片段识别明确重合，避免猜测同义关系。
const meaningCache = new WeakMap<WordEntry, Set<string>>()
function meaningParts(entry: WordEntry): Set<string> {
  const cached = meaningCache.get(entry)
  if (cached) return cached
  const parts = new Set(entry.meaning
    .replace(/\b(?:n|v|vt|vi|adj|adv|prep|conj|pron|art|num|int|aux|pl)\./gi, '')
    .split(/[；;，,、/]/)
    .map((part) => part.replace(/\s+/g, '').trim())
    .filter(Boolean))
  meaningCache.set(entry, parts)
  return parts
}

// 干扰项：从当前词库抽取，跳过本词与同一非空近义组（PRD §8.1）；
// 凑不齐 3 个合法干扰项返回 null，调用方按「词库问题」处理，不出歧义题
export function buildOptions(rng: Rng, entry: WordEntry, lib: LibId): string[] | null {
  const bank = LIBS[lib]
  const answerParts = meaningParts(entry)
  const seen = new Set<string>([entry.meaning])
  const picked: string[] = []
  const addCandidate = (w: WordEntry) => {
    if (normalize(w.word) === normalize(entry.word) || seen.has(w.meaning) ||
      (entry.group.length && w.group.some((g) => entry.group.includes(g))) ||
      [...meaningParts(w)].some((part) => answerParts.has(part))) return
    seen.add(w.meaning)
    picked.push(w.meaning)
  }
  // 大词库通常几次即可抽足；有限次数后顺序补齐，避免小词库陷入死循环。
  for (let attempt = 0; attempt < 30 && picked.length < 3 && bank.length; attempt++) {
    addCandidate(bank[Math.floor(rng.next() * bank.length)])
  }
  if (picked.length < 3) for (const word of bank) {
    addCandidate(word)
    if (picked.length === 3) break
  }
  if (picked.length < 3) return null
  return shuffled(rng, [...picked, entry.meaning])
}

// 词库可用性：能否组成 n 个不同单词（开始前校验，PRD §8.1 / §18 P0）
export function canFormSession(lib: LibId, need: number): boolean {
  return LIBS[lib].length >= need
}
