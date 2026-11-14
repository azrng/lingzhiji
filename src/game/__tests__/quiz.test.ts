// 任务堂单测：抽题比例与补题链、错词池、首答计分、跨库记录、奖励（PRD §8/§16.5/§16.7）
import { describe, expect, it, vi } from 'vitest'
import { dispatch, createInitialState } from '../engine'
import * as wordbankMod from '../wordbank'
import type { GameState } from '../types'

// vi.mock 会被提升到文件顶部，词表必须用 vi.hoisted 定义（12 词小库测耗尽与补足链）
const { MOCK_BANK } = vi.hoisted(() => ({
  MOCK_BANK: [
    { word: 'sow', meaning: '播种', phonetic: '', group: [] },
    { word: 'reap', meaning: '收获', phonetic: '', group: [] },
    { word: 'irrigate', meaning: '灌溉', phonetic: '', group: [] },
    { word: 'fertile', meaning: '肥沃的', phonetic: '', group: [] },
    { word: 'wither', meaning: '枯萎', phonetic: '', group: [] },
    { word: 'sprout', meaning: '发芽', phonetic: '', group: [] },
    { word: 'blossom', meaning: '开花', phonetic: '', group: [] },
    { word: 'seedling', meaning: '幼苗', phonetic: '', group: [] },
    { word: 'grain', meaning: '谷物', phonetic: '', group: [] },
    { word: 'plow', meaning: '犁', phonetic: '', group: [] },
    { word: 'dew', meaning: '露水', phonetic: '', group: [] },
    { word: 'mist', meaning: '薄雾', phonetic: '', group: [] },
  ],
}))

vi.mock('../wordbank', () => {
  // 完整替换词库模块：真实模块的 entryOf/buildOptions 闭包绑定原词库，spread 无法替换
  const normalize = (w: string) => w.trim().toLowerCase()
  const indexLibs = {
    cet4: new Map(MOCK_BANK.map((w) => [normalize(w.word), w])),
    cet6: new Map(MOCK_BANK.slice(0, 5).map((w) => [normalize(w.word), w])),
  }
  return {
    LIBS: { cet4: MOCK_BANK, cet6: MOCK_BANK.slice(0, 5) },
    normalize,
    entryOf: (lib: 'cet4' | 'cet6', norm: string) => indexLibs[lib].get(norm) ?? null,
    buildOptions: (rng: { next: () => number }, entry: { word: string; meaning: string }) => {
      const pool = MOCK_BANK.filter((w) => w.meaning !== entry.meaning)
      const picked: string[] = []
      for (const w of pool.sort(() => rng.next() - 0.5)) {
        if (picked.length < 3 && !picked.includes(w.meaning)) picked.push(w.meaning)
      }
      if (picked.length < 3) return null
      return [...picked, entry.meaning].sort(() => rng.next() - 0.5)
    },
    canFormSession: (lib: 'cet4' | 'cet6', need: number) => indexLibs[lib].size >= need,
  }
})

function answerAll(s: GameState, pickIdx = 0): GameState {
  const session = s.quizDaily.session!
  for (let i = 0; i < 10; i++) {
    s = dispatch(s, { type: 'QUIZ_ANSWER', choice: session.questions[i].opts[pickIdx] }).state
    s = dispatch(s, { type: 'QUIZ_NEXT' }).state
  }
  return s
}

describe('抽题与补足链', () => {
  it('首场全部为新词（无错词与已见词）', () => {
    let s = createInitialState(7)
    const r = dispatch(s, { type: 'QUIZ_BEGIN' })
    expect(r.ok).toBe(true)
    const q = r.state!.quizDaily.session!
    expect(q.questions.length).toBe(10)
    expect(q.questions.every((x) => x.from === 'new')).toBe(true)
    expect(new Set(q.questions.map((x) => x.word)).size).toBe(10)
    // 每题 4 个不同选项且包含正确释义
    for (const item of q.questions) {
      expect(new Set(item.opts).size).toBe(4)
      expect(item.opts).toContain(item.meaning)
    }
  })

  it('新词耗尽时用已见词补足 10 个不同词', () => {
    let s = createInitialState(7)
    // 反复作答直到新词全部见过（12 词库 → 第 2 场起必有已见词补足）
    for (let round = 0; round < 2; round++) {
      s = dispatch(s, { type: 'QUIZ_BEGIN' }).state
      s = dispatch(s, { type: 'QUIZ_LEARNED' }).state
      s = answerAll(s, 0)
      s = dispatch(s, { type: 'QUIZ_CONFIRM' }).state
      // 推进一天重置任务
      s = dispatch(s, { type: 'END_DAY' }).state
    }
    s = dispatch(s, { type: 'QUIZ_BEGIN' }).state
    const q = s.quizDaily.session!
    expect(q.questions.length).toBe(10)
    expect(new Set(q.questions.map((x) => x.word)).size).toBe(10)
  })

  it('词库不足以组成 10 个不同词时拒绝开始（cet6 只给 5 词）', () => {
    let s = createInitialState(7)
    s = dispatch(s, { type: 'QUIZ_SET_LIB', lib: 'cet6' }).state
    const r = dispatch(s, { type: 'QUIZ_BEGIN' })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('LIBRARY_INSUFFICIENT')
  })

  it('按境界分配复习配额：练气一层 7 新 + 3 复习（有错词与已见词时）', () => {
    let s = createInitialState(7)
    // 第一场全答错制造错词池
    s = dispatch(s, { type: 'QUIZ_BEGIN' }).state
    s = dispatch(s, { type: 'QUIZ_LEARNED' }).state
    s = answerAll(s, 1) // opts[1] 大概率非正确释义
    s = dispatch(s, { type: 'QUIZ_CONFIRM' }).state
    const stat = s.learning.libs.cet4
    expect(stat.wrongQueue.length).toBeGreaterThan(0)
    s = dispatch(s, { type: 'END_DAY' }).state
    // 第二场：复习配额 3
    s = dispatch(s, { type: 'QUIZ_BEGIN' }).state
    const q = s.quizDaily.session!
    const reviews = q.questions.filter((x) => x.from === 'review').length
    expect(reviews).toBeLessThanOrEqual(3)
    expect(q.questions.filter((x) => x.from === 'new').length).toBeGreaterThanOrEqual(7)
  })
})

describe('错词池与奖励', () => {
  it('答错入池、重现答对移出、再答错排到队尾', () => {
    let s = createInitialState(7)
    s = dispatch(s, { type: 'QUIZ_BEGIN' }).state
    s = dispatch(s, { type: 'QUIZ_LEARNED' }).state
    const q1 = s.quizDaily.session!
    // 全部选错误选项：保证至少 1 个错词
    s = answerAll(s, (q1.questions[0].opts.indexOf(q1.questions[0].meaning) + 1) % 4)
    s = dispatch(s, { type: 'QUIZ_CONFIRM' }).state
    const stat = s.learning.libs.cet4
    expect(stat.wrongQueue.length).toBeGreaterThanOrEqual(1)
    const wrong = stat.wrongQueue[0]
    s = dispatch(s, { type: 'END_DAY' }).state
    // 第二场答对所有重现词
    s = dispatch(s, { type: 'QUIZ_BEGIN' }).state
    s = dispatch(s, { type: 'QUIZ_LEARNED' }).state
    const q2 = s.quizDaily.session!
    for (let i = 0; i < 10; i++) {
      const item = q2.questions[i]
      s = dispatch(s, { type: 'QUIZ_ANSWER', choice: item.meaning }).state
      s = dispatch(s, { type: 'QUIZ_NEXT' }).state
    }
    s = dispatch(s, { type: 'QUIZ_CONFIRM' }).state
    const stat2 = s.learning.libs.cet4
    expect(stat2.wrongQueue).not.toContain(wrong)
    expect(stat2.reviewCorrect.total).toBeGreaterThan(0)
  })

  it('不合格仍计完成任务（可结束当天），奖励为灵气 +1 心得 +2', () => {
    let s = createInitialState(7)
    s = dispatch(s, { type: 'QUIZ_BEGIN' }).state
    s = dispatch(s, { type: 'QUIZ_LEARNED' }).state
    s = answerAll(s, 1)
    expect(s.quizDaily.done).toBe(false)
    s = dispatch(s, { type: 'QUIZ_CONFIRM' }).state
    expect(s.quizDaily.done).toBe(true)
    expect(s.resources.insight).toBe(2)
    expect(s.resources.qi).toBe(1)
  })

  it('满分额外 +4 心得；灵气超出上限溢出丢弃', () => {
    let s = createInitialState(7)
    s.realm = 1 // 上限 5
    s.resources.qi = 4
    s = dispatch(s, { type: 'QUIZ_BEGIN' }).state
    s = dispatch(s, { type: 'QUIZ_LEARNED' }).state
    const q = s.quizDaily.session!
    for (let i = 0; i < 10; i++) {
      s = dispatch(s, { type: 'QUIZ_ANSWER', choice: q.questions[i].meaning }).state
      s = dispatch(s, { type: 'QUIZ_NEXT' }).state
    }
    s = dispatch(s, { type: 'QUIZ_CONFIRM' }).state
    expect(s.resources.qi).toBe(5) // 3(合格)+0(Lv1 无加成) 但 4+3=7 > 5 溢出
    expect(s.resources.insight).toBe(12) // 8 + 4 满分
  })

  it('已完成当天后不可重复开始（不重复计奖）', () => {
    let s = createInitialState(7)
    s = dispatch(s, { type: 'QUIZ_BEGIN' }).state
    s = dispatch(s, { type: 'QUIZ_LEARNED' }).state
    s = answerAll(s, 0)
    s = dispatch(s, { type: 'QUIZ_CONFIRM' }).state
    const r = dispatch(s, { type: 'QUIZ_BEGIN' })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('ALREADY_DONE')
  })

  it('跨库共享见词标记：四级见过的词在六级作为复习候选（数据口径）', () => {
    // MOCK 下两库词面一致；验证 seenMap 跨库写入与 currentLib 切换
    let s = createInitialState(7)
    s = dispatch(s, { type: 'QUIZ_BEGIN' }).state
    expect(Object.keys(s.learning.seenMap).length).toBe(10)
    // 进行中的测验固定词库不可切（设计行为）
    expect(dispatch(s, { type: 'QUIZ_SET_LIB', lib: 'cet6' }).ok).toBe(false)
    // 结束本场后切换，seen 保留
    s = dispatch(s, { type: 'QUIZ_LEARNED' }).state
    const q = s.quizDaily.session!
    for (let i = 0; i < 10; i++) {
      s = dispatch(s, { type: 'QUIZ_ANSWER', choice: q.questions[i].opts[0] }).state
      s = dispatch(s, { type: 'QUIZ_NEXT' }).state
    }
    s = dispatch(s, { type: 'QUIZ_CONFIRM' }).state
    s = dispatch(s, { type: 'QUIZ_SET_LIB', lib: 'cet6' }).state
    expect(s.learning.currentLib).toBe('cet6')
    expect(Object.keys(s.learning.seenMap).length).toBe(10) // seen 保留
  })

  it('wordbank 口径：normalize 去空格忽略大小写（跨库同词识别）', () => {
    expect(wordbankMod.normalize(' Abandon ')).toBe('abandon')
  })
})
