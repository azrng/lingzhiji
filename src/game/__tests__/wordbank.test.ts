import { describe, expect, it } from 'vitest'
import { createRng } from '../rng'
import { buildOptions, LIBS, type WordEntry } from '../wordbank'

describe('题目选项', () => {
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
})
