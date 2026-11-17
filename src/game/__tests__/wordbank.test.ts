import { describe, expect, it } from 'vitest'
import { createRng } from '../rng'
import { buildOptions, cleanMeaning, LIBS, type WordEntry } from '../wordbank'

describe('题目选项', () => {
  it('清理完全重复的词性释义，保留不同词性与不同释义', () => {
    expect(cleanMeaning('n. 图解， 图表， 简图；n. 图解，图表，简图')).toBe('n. 图解， 图表， 简图')
    expect(cleanMeaning('n. 滥用；v. 滥用；n. 虐待')).toBe('n. 滥用；v. 滥用；n. 虐待')
  })

  it('v2：复合词性整体切段，不产生垃圾段', () => {
    // 旧实现会在 v. 处切断 n & v.，留下 'n &' 垃圾段
    expect(cleanMeaning('n & v. 尝试，试图；n. 企图')).toBe('n & v. 尝试，试图；n. 企图')
    expect(cleanMeaning('adv&prep.  在船上， 上船')).toBe('adv&prep. 在船上， 上船')
  })

  it('v2：同词性义项子集去重，保留信息量大的段', () => {
    // colony 原始形态：第二个 n. 段是第一段的子集
    expect(cleanMeaning('n.  殖民地； 侨居地， 聚居地； 群体， 集群；n. 殖民地；侨居地'))
      .toBe('n. 殖民地； 侨居地， 聚居地； 群体， 集群')
    // jet：第二段义项 ⊇ 第一段 → 丢第一段
    expect(cleanMeaning('n. 喷气式飞机；喷嘴；n. 喷气式飞机；喷嘴；喷射；vi.  乘喷气式飞机'))
      .toBe('n. 喷气式飞机；喷嘴；喷射；vi. 乘喷气式飞机')
    // consist：省略号全半角归一后三段逐级覆盖 → 只留最全段
    expect(cleanMeaning('v. 由……组成；v. 由…组成；在于；vi.  由…组成； 在于； 一致'))
      .toBe('vi. 由…组成； 在于； 一致')
  })

  it('v2：词性族覆盖判定（vt/vi 归一 v 族），词性更宽或义项更多的段保留', () => {
    // vt.{攻击,进攻} 被 vt&vi&n.{攻击,进攻} 覆盖 → 丢；n. 段义项不同保留
    expect(cleanMeaning('n. 攻击，打击；突然发作；vt.  攻击， 进攻；vt&vi&n. 攻击，进攻'))
      .toBe('n. 攻击，打击；突然发作；vt&vi&n. 攻击，进攻')
    // n & v.{尝试,试图} 与 v.{尝试,试图} 义项相同但 n&v 词性更宽 → 丢 v. 段；vt. 段有额外义项保留
    expect(cleanMeaning('n & v. 尝试，试图；n. 企图；v. 尝试，试图；vt.  尝试， 试图， 努力'))
      .toBe('n & v. 尝试，试图；n. 企图；vt. 尝试， 试图， 努力')
    // n. 与 v. 词性族互不覆盖 → 同义项也保留
    expect(cleanMeaning('n. 上诉；v. 上诉')).toBe('n. 上诉；v. 上诉')
  })

  it('v2：剥离尾部孤立词性残迹，丢弃无释义段', () => {
    // 尾部 '；vi&n.' 无释义内容 → 整段丢弃
    expect(cleanMeaning('vt. 上诉；vi&n.')).toBe('vt. 上诉')
    // 连续空格压缩为单个
    expect(cleanMeaning('n.  参议员')).toBe('n. 参议员')
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
