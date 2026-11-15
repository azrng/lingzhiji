// 词库近义组生成（契约 CON-LINGZHIJI-WLIB-001，PRD §8.1）：按「释义片段包含关系」直接配对，
// 生成稳定 group id 写回 cet4/cet6 JSON（保持 minified 格式）。幂等：重复运行结果一致，全量覆盖 group 字段。
// 口径：与运行时 wordbank.meaningParts 相同的切片方式取片段；片段长度 ≥2 且长度差 ≤3 才配对；
// 只做直接配对、不做传递合并（避免短片段串联成巨簇）；完全相同片段由运行时排除，不占 group。
// 运行：npm run words:groups
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { cleanMeaning, normalize } from '../src/game/wordbank'
import type { WordEntry } from '../src/game/wordbank'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const BANKS: { lib: string; file: string }[] = [
  { lib: 'cet4', file: 'src/data/words/cet4.json' },
  { lib: 'cet6', file: 'src/data/words/cet6.json' },
]

// 与 wordbank.meaningParts 相同的切片口径（去掉词性前缀后按标点切分）
function partsOf(meaning: string): string[] {
  return meaning
    .replace(/\b(?:n|v|vt|vi|adj|adv|prep|conj|pron|art|num|int|aux|pl)\./gi, '')
    .split(/[；;，,、/]/)
    .map((part) => part.replace(/\s+/g, '').trim())
    .filter(Boolean)
}

interface RawWord extends WordEntry {
  // 原始 JSON 条目（group 会被全量覆盖）
}

for (const { lib, file } of BANKS) {
  const abs = path.join(root, file)
  const bank: RawWord[] = JSON.parse(readFileSync(abs, 'utf-8'))

  // 归一化词 → 下标（库内无重复词，直接建表）
  const idxOf = new Map<string, number>()
  bank.forEach((w, i) => idxOf.set(normalize(w.word), i))

  // 片段 → 持有该片段的词下标集合（片段来自 cleanMeaning 后的释义，与运行时一致）
  const segMap = new Map<string, Set<number>>()
  for (const w of bank) {
    const meaning = cleanMeaning(w.meaning)
    for (const seg of new Set(partsOf(meaning))) {
      if (seg.length < 2) continue
      if (!segMap.has(seg)) segMap.set(seg, new Set())
      segMap.get(seg)!.add(idxOf.get(normalize(w.word))!)
    }
  }

  // 直接配对：seg 是 other 的子串、长度差 ≤3。两词共享同一对分配的 group id，
  // 运行时据此互斥干扰项；不合并传递关系，防止短片段把无关词串成巨簇。
  const segs = [...segMap.keys()].sort()
  const pairs: { id: string; a: Set<number>; b: Set<number> }[] = []
  let n = 0
  for (const seg of segs) {
    for (const other of segs) {
      if (other.length <= seg.length || other.length - seg.length > 3) continue
      if (!other.includes(seg)) continue
      pairs.push({ id: `g-${lib}-${++n}`, a: segMap.get(seg)!, b: segMap.get(other)! })
    }
  }

  // 全量覆盖 group 字段（幂等），再按配对写入
  for (const w of bank) w.group = []
  let covered = 0
  let maxGroup = 0
  for (const p of pairs) {
    const members = new Set([...p.a, ...p.b])
    maxGroup = Math.max(maxGroup, members.size)
    for (const i of members) {
      if (bank[i].group.length === 0) covered++
      bank[i].group.push(p.id)
    }
  }

  writeFileSync(abs, JSON.stringify(bank), { encoding: 'utf-8' })
  console.log(`${lib}: 配对 ${pairs.length} 组，覆盖 ${covered}/${bank.length} 词，最大单组 ${maxGroup} 词 → ${file}`)
}
