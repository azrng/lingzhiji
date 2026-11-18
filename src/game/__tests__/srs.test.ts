// M2 学习强化单测：FSRS 调度纯函数、题型注册表、spell 作答（srs-audio.md §3.1/§3.4）
import { describe, expect, it } from 'vitest'
import { dispatch, createInitialState } from '../engine'
import { dueCount, dueInDays, dueWords, grade, leastStable } from '../srs'
import { buildQuestion, pickKind, QUESTION_TYPES } from '../question-types'
import { createRng } from '../rng'
import type { FsrsCardLite, GameState } from '../types'

const TODAY = 20774

describe('FSRS 调度纯函数（srs-audio.md §3.1）', () => {
  it('首见答错 Again：次日到期（短间隔尽快重现）', () => {
    const cards: Record<string, FsrsCardLite> = {}
    const card = grade(cards, 'abandon', TODAY, false)
    expect(card.state).toBe(2) // short_term 关闭：Again 直接入长期复习态
    expect(card.due).toBe(TODAY + 1)
    expect(card.last).toBe(TODAY)
    expect(cards['abandon']).toBeUndefined() // 纯函数：不就地写回，由调用方（quiz.answer）显式入账
  })

  it('首见答对 Good：间隔长于 Again，且多次 Good 逐步拉长', () => {
    const good = grade({}, 'word', TODAY, true)
    const again = grade({}, 'another', TODAY, false)
    expect(good.due).toBeGreaterThan(again.due)
    expect(good.due).toBeGreaterThan(TODAY)
    // 第二次 Good：稳定性增长、到期更远
    const twice = grade({ word: good }, 'word', TODAY + 3, true)
    expect(twice.stability).toBeGreaterThan(good.stability)
    expect(twice.due).toBeGreaterThan(good.due)
  })

  it('dueWords 按 due 升序取到期词；dueCount/leastStable/dueInDays 口径一致', () => {
    const cards: Record<string, FsrsCardLite> = {
      a: { due: TODAY, stability: 1, difficulty: 5, state: 2, lapses: 0, last: TODAY - 1 },
      b: { due: TODAY - 1, stability: 2, difficulty: 5, state: 2, lapses: 1, last: TODAY - 2 },
      c: { due: TODAY + 5, stability: 0.5, difficulty: 5, state: 2, lapses: 0, last: TODAY }, // 未到期
      d: { due: TODAY, stability: 3, difficulty: 5, state: 0, lapses: 0, last: TODAY }, // new 不算已学
    }
    expect(dueWords(cards, TODAY)).toEqual(['b', 'a'])
    expect(dueCount(cards, TODAY)).toBe(2)
    expect(leastStable(cards)).toEqual(['c', 'a', 'b']) // new(d) 被排除；stability 升序
    expect(dueInDays(cards.b, TODAY)).toBe(0)
    expect(dueInDays(cards.c, TODAY)).toBe(5)
  })
})

describe('题型注册表（srs-audio.md §3.4）', () => {
  const entry = { word: 'colony', meaning: 'n. 殖民地', phonetic: '', group: [] }

  it('解锁锚 = 学习场次：第 1 场仅认词，第 2/5/10 场逐步解锁', () => {
    const kindsAt = (n: number) => QUESTION_TYPES.filter((t) => n >= t.sessionsMin).map((t) => t.id)
    expect(kindsAt(1)).toEqual(['w2c'])
    expect(kindsAt(2)).toEqual(['w2c', 'c2w'])
    expect(kindsAt(5)).toEqual(['w2c', 'c2w', 'listen'])
    expect(kindsAt(10)).toEqual(['w2c', 'c2w', 'listen', 'spell'])
  })

  it('新词固定出认词（先认读再进阶）', () => {
    const rng = createRng(7)
    for (let i = 0; i < 10; i++) expect(pickKind(rng, 99, 'new')).toBe('w2c')
  })

  it('buildQuestion：w2c 四释义选项；c2w/listen 四单词选项含正确词；spell 无选项', () => {
    const rng = createRng(7)
    const w2c = buildQuestion(rng, entry, 'cet4', 'w2c', 'review')!
    expect(w2c.kind).toBe('w2c')
    expect(w2c.opts).toHaveLength(4)
    expect(w2c.opts).toContain(entry.meaning)
    const c2w = buildQuestion(rng, entry, 'cet4', 'c2w', 'review')!
    expect(c2c_check(c2w)).toBe(true)
    const listen = buildQuestion(rng, entry, 'cet4', 'listen', 'review')!
    expect(listen.opts).toContain(entry.word)
    const spell = buildQuestion(rng, entry, 'cet4', 'spell', 'review')!
    expect(spell.opts).toEqual([])
    expect(spell.word).toBe(entry.word)
    function c2c_check(q: { opts: string[] }): boolean {
      return q.opts.length === 4 && q.opts.includes('colony')
    }
  })

  it('pickKind 已解锁池内随机且不返回未解锁题型', () => {
    const rng = createRng(7)
    for (let i = 0; i < 20; i++) {
      expect(['w2c', 'c2w']).toContain(pickKind(rng, 3, 'review'))
      expect(['w2c', 'c2w', 'listen', 'spell']).toContain(pickKind(rng, 50, 'review'))
    }
  })
})

describe('spell 作答（quiz.answer 分支）', () => {
  function beginAndTest(): ReturnType<typeof createInitialState> {
    let s = dispatch(createInitialState(7), { type: 'QUIZ_BEGIN' }).state
    s = dispatch(s, { type: 'QUIZ_LEARNED' }).state
    return s
  }

  it('拼写按归一化比对：大小写与首尾空格不敏感', () => {
    let s = beginAndTest()
    // 强制第 0 题为 spell（直接构造会话态）——走真实 dispatch 校验 answer 分支
    const session = s.quizDaily.session!
    session.questions[0] = { word: 'Colony', meaning: 'n. 殖民地', from: 'new', opts: [], kind: 'spell' }
    s = { ...s, quizDaily: { ...s.quizDaily, session } }
    s = dispatch(s, { type: 'QUIZ_ANSWER', choice: '  colony ' }).state
    expect(s.learning.cards['colony'].stability).toBeGreaterThan(0) // 答对入卡
  })

  it('拼错即 Again（次日到期）；空输入拒绝', () => {
    let s = beginAndTest()
    const session = s.quizDaily.session!
    session.questions[0] = { word: 'colony', meaning: 'n. 殖民地', from: 'new', opts: [], kind: 'spell' }
    s = { ...s, quizDaily: { ...s.quizDaily, session } }
    expect(dispatch(s, { type: 'QUIZ_ANSWER', choice: '   ' }).reason).toBe('INVALID_TARGET')
    s = dispatch(s, { type: 'QUIZ_ANSWER', choice: 'colonies' }).state
    expect(s.learning.cards['colony'].due).toBe(s.realDay.today + 1)
  })
})

describe('c2w/listen 作答判对（quiz.answer/confirm 按 kind 分流）', () => {
  function beginAndTest(): ReturnType<typeof createInitialState> {
    let s = dispatch(createInitialState(7), { type: 'QUIZ_BEGIN' }).state
    s = dispatch(s, { type: 'QUIZ_LEARNED' }).state
    return s
  }
  // 强制两题为新题型（直接构造会话态），其余题保持引擎产出（首场全 w2c）——走真实 dispatch 验全链
  const forceNewKinds = (s0: GameState): GameState => {
    const session = s0.quizDaily.session!
    session.questions[0] = { word: 'Colony', meaning: 'n. 殖民地', from: 'review', opts: ['airport', 'Colony', 'angle', 'animal'], kind: 'c2w' }
    session.questions[1] = { word: 'Apple', meaning: 'n. 苹果', from: 'review', opts: ['Apple', 'apply', 'approach', 'April'], kind: 'listen' }
    return { ...s0, quizDaily: { ...s0.quizDaily, session } }
  }

  it('答对单词计满分：10/10 且复习正确率入账（修复前拿 word 对 meaning 恒判错 → 8/10）', () => {
    let s: GameState = forceNewKinds(beginAndTest())
    const lib = s.quizDaily.session!.lib
    for (let i = 0; i < 10; i++) {
      const q = s.quizDaily.session!.questions[i]
      s = dispatch(s, { type: 'QUIZ_ANSWER', choice: q.kind === 'w2c' ? q.meaning : q.word }).state
      s = dispatch(s, { type: 'QUIZ_NEXT' }).state
    }
    s = dispatch(s, { type: 'QUIZ_CONFIRM' }).state
    expect(s.log.some((e) => e.kind === 'settle' && e.title === '任务堂 10/10')).toBe(true)
    expect(s.learning.libs[lib].reviewCorrect.total).toBe(2)
    expect(s.learning.libs[lib].reviewCorrect.hit).toBe(2)
  })

  it('答错单词判错：8/10 且复习正确率计 total 不计 hit', () => {
    let s: GameState = forceNewKinds(beginAndTest())
    const lib = s.quizDaily.session!.lib
    for (let i = 0; i < 10; i++) {
      const q = s.quizDaily.session!.questions[i]
      const right = q.kind === 'w2c' ? q.meaning : q.word
      s = dispatch(s, { type: 'QUIZ_ANSWER', choice: i === 0 ? 'airport' : i === 1 ? 'apply' : right }).state
      s = dispatch(s, { type: 'QUIZ_NEXT' }).state
    }
    s = dispatch(s, { type: 'QUIZ_CONFIRM' }).state
    expect(s.log.some((e) => e.kind === 'settle' && e.title === '任务堂 8/10')).toBe(true)
    expect(s.learning.libs[lib].reviewCorrect.total).toBe(2)
    expect(s.learning.libs[lib].reviewCorrect.hit).toBe(0)
  })

  it('c2w 传释义被拒（释义不在选项内；balance-sim 曾因此卡死）', () => {
    const s = forceNewKinds(beginAndTest())
    expect(dispatch(s, { type: 'QUIZ_ANSWER', choice: 'n. 殖民地' }).reason).toBe('INVALID_TARGET')
  })
})
