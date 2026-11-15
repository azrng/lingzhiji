import { describe, expect, it } from 'vitest'
import { createRng } from '../rng'
import { buildOptions, cleanMeaning, LIBS, type WordEntry } from '../wordbank'

describe('题目选项', () => {
  it('清理完全重复的词性释义，保留不同词性与不同释义', () => {
    expect(cleanMeaning('n. 图解， 图表， 简图；n. 图解，图表，简图')).toBe('n. 图解， 图表， 简图')
    expect(cleanMeaning('n. 滥用；v. 滥用；n. 虐待')).toBe('n. 滥用；v. 滥用；n. 虐待')
  })

  it('固定种子可复现，且正确释义与三个干扰项互不重复', () => {
    const entry = LIBS.cet4[0]
    const first = buildOptions(createRng(42), entry, 'cet4')
    expect(first).toEqual(buildOptions(createRng(42), entry, 'cet4'))
    expect(first).toHaveLength(4)
    expect(new Set(first).size).toBe(4)
    expect(first).toContain(entry.meaning)
  })

  it('随机多次命中同一词时回退补齐，并排除近义组', () => {
    const make = (word: string, meaning: string, group: string[] = []): WordEntry => ({ word, meaning, group, phonetic: '' })
    const original = LIBS.cet4
    const entry = make('alpha', '甲', ['近义'])
    LIBS.cet4 = [entry, make('similar', '相近', ['近义']), make('beta', '乙'), make('gamma', '丙'), make('delta', '丁')]
    try {
      const options = buildOptions({ next: () => 0, state: () => 0 }, entry, 'cet4')
      expect(options).toHaveLength(4)
      expect(options).not.toContain('相近')
      expect(new Set(options)).toEqual(new Set(['甲', '乙', '丙', '丁']))
    } finally {
      LIBS.cet4 = original
    }
  })

  it('过滤释义片段相同的干扰项，保留其他不同释义', () => {
    const make = (word: string, meaning: string): WordEntry => ({ word, meaning, group: [], phonetic: '' })
    const original = LIBS.cet4
    const entry = make('quick', 'adj. 快的；敏捷的')
    LIBS.cet4 = [entry, make('fast', 'adj. 快的；偏快的'), make('rapid', 'adj. 快的；n. 急流'), make('slow', 'adj. 慢的'), make('quiet', 'adj. 安静的'), make('bright', 'adj. 明亮的')]
    try {
      const options = buildOptions({ next: () => 0, state: () => 0 }, entry, 'cet4')
      expect(options).toHaveLength(4)
      expect(options).not.toContain('adj. 快的；偏快的')
      expect(options).not.toContain('adj. 快的；n. 急流')
      expect(options).toContain(entry.meaning)
    } finally {
      LIBS.cet4 = original
    }
  })

  it('合法干扰项不足时拒绝出题', () => {
    const original = LIBS.cet4
    const entry: WordEntry = { word: 'quick', meaning: 'adj. 快的', group: [], phonetic: '' }
    LIBS.cet4 = [entry, { word: 'fast', meaning: 'adj. 快的；偏快的', group: [], phonetic: '' }]
    try {
      expect(buildOptions(createRng(1), entry, 'cet4')).toBeNull()
    } finally {
      LIBS.cet4 = original
    }
  })

  it('真实词库 group 配对：同组词的释义不作为彼此的干扰项（固定种子扫描）', () => {
    // 从已填充的真实词库中找一个同组词对（word-groups.ts 生成，契约 CON-LINGZHIJI-WLIB-001）
    const bank = LIBS.cet4
    let a: WordEntry | null = null
    let b: WordEntry | null = null
    for (const w of bank) {
      if (!w.group.length) continue
      const partner = bank.find((o) => o !== w && o.group.some((g) => w.group.includes(g)))
      if (partner) {
        a = w
        b = partner
        break
      }
    }
    expect(a).not.toBeNull()
    // 固定种子多次出题，同组词释义绝不与正确释义同时出现
    for (let seed = 1; seed <= 100; seed++) {
      const opts = buildOptions(createRng(seed), a!, 'cet4')
      expect(opts).not.toBeNull()
      expect(opts).not.toContain(b!.meaning)
    }
  })
})
