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
    const q = session.questions[i]
    // spell 题（v4 题型扩展）无选项：按 pickIdx 语义给正确/错误拼写
    const choice = q.kind === 'spell'
      ? (pickIdx === 0 ? q.word : q.word + 'xx')
      : q.opts[pickIdx]
    s = dispatch(s, { type: 'QUIZ_ANSWER', choice }).state
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
    expect(q.questions.every((x) => x.from === 'review')).toBe(true)
  })

  it('词库不足以组成 10 个不同词时拒绝开始（cet6 只给 5 词）', () => {
    let s = createInitialState(7)
    s = dispatch(s, { type: 'QUIZ_SET_LIB', lib: 'cet6' }).state
    const r = dispatch(s, { type: 'QUIZ_BEGIN' })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('LIBRARY_INSUFFICIENT')
  })

  it('新词不足时在复习配额之外补入已见词，并保留复习标记', () => {
    let s = createInitialState(7)
    // 第一场全答错：全部入卡（Again 短间隔，今日/次日即到期重现）
    s = dispatch(s, { type: 'QUIZ_BEGIN' }).state
    s = dispatch(s, { type: 'QUIZ_LEARNED' }).state
    s = answerAll(s, 1) // opts[1] 大概率非正确释义
    s = dispatch(s, { type: 'QUIZ_CONFIRM' }).state
    const cards = Object.values(s.learning.cards)
    expect(cards.length).toBeGreaterThan(0)
    // 全部入卡（非 new）；至少一张因答错进入短间隔（今日/明日到期重现）
    expect(cards.every((c) => c.state !== 0)).toBe(true)
    expect(cards.some((c) => c.due <= s.realDay.today + 1)).toBe(true)
    s = dispatch(s, { type: 'END_DAY' }).state
    // 第二场：12 词库已学 10、未见 2 → 新词 2 + 已学补足 8（全部标 review）
    s = dispatch(s, { type: 'QUIZ_BEGIN' }).state
    const q = s.quizDaily.session!
    const reviews = q.questions.filter((x) => x.from === 'review').length
    expect(reviews).toBe(8)
    expect(q.questions.filter((x) => x.from === 'new').length).toBe(2)
  })
})

describe('错词池与奖励', () => {
  it('拒绝不属于题目的选项及重复进入测验', () => {
    let s = dispatch(createInitialState(7), { type: 'QUIZ_BEGIN' }).state
    s = dispatch(s, { type: 'QUIZ_LEARNED' }).state
    expect(dispatch(s, { type: 'QUIZ_LEARNED' }).reason).toBe('INVALID_TARGET')
    const bad = dispatch(s, { type: 'QUIZ_ANSWER', choice: '不在选项中' })
    expect(bad.reason).toBe('INVALID_TARGET')
    expect(bad.state.quizDaily.session!.answers[0]).toBeNull()
  })

  it('答错次日到期重现、重现答对拉长间隔（SRS 语义，替代旧错词池）', () => {
    let s = createInitialState(7)
    s = dispatch(s, { type: 'QUIZ_BEGIN' }).state
    s = dispatch(s, { type: 'QUIZ_LEARNED' }).state
    const q1 = s.quizDaily.session!
    // 全部选错误选项：4 选 1 循环错位必错
    s = answerAll(s, (q1.questions[0].opts.indexOf(q1.questions[0].meaning) + 1) % 4)
    s = dispatch(s, { type: 'QUIZ_CONFIRM' }).state
    // 首张卡 = 第一场题序第一词；Again 给 1 天间隔（次日到期重现）
    const [wrong, wrongCard] = Object.entries(s.learning.cards)[0]
    expect(wrongCard.due).toBe(s.realDay.today + 1)
    s.realDay.today += 1 // 模拟次日
    s = dispatch(s, { type: 'END_DAY' }).state
    // 第二场：到期词优先进复习配额（练气一层配额 3，题序第一词 due 最早必入选）
    s = dispatch(s, { type: 'QUIZ_BEGIN' }).state
    s = dispatch(s, { type: 'QUIZ_LEARNED' }).state
    const q2 = s.quizDaily.session!
    expect(q2.questions.some((x) => x.word.toLowerCase() === wrong && x.from === 'review')).toBe(true)
    for (let i = 0; i < 10; i++) {
      const item = q2.questions[i]
      s = dispatch(s, { type: 'QUIZ_ANSWER', choice: item.kind === 'spell' ? item.word : item.meaning }).state
      s = dispatch(s, { type: 'QUIZ_NEXT' }).state
    }
    s = dispatch(s, { type: 'QUIZ_CONFIRM' }).state
    const card = s.learning.cards[wrong]
    // 重现答对：稳定性高于答错时、到期日推远（间隔拉长）
    expect(card.stability).toBeGreaterThan(wrongCard.stability)
    expect(card.due).toBeGreaterThan(s.realDay.today)
    // 重现词计入复习统计（口径不变）
    expect(s.learning.libs.cet4.reviewCorrect.total).toBeGreaterThan(0)
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
      s = dispatch(s, { type: 'QUIZ_ANSWER', choice: q.questions[i].kind === 'spell' ? q.questions[i].word : q.questions[i].meaning }).state
      s = dispatch(s, { type: 'QUIZ_NEXT' }).state
    }
    s = dispatch(s, { type: 'QUIZ_CONFIRM' }).state
    expect(s.resources.qi).toBe(5) // 3(合格)+0(Lv1 无加成) 但 4+3=7 > 5 溢出
    expect(s.resources.insight).toBe(12) // 8 + 4 满分
  })

  it('同现实日加练：可再开一场但不再发资源；打卡仍只记一次（time-decouple.md §3.4）', () => {
    let s = createInitialState(7)
    s = dispatch(s, { type: 'QUIZ_BEGIN' }).state
    s = dispatch(s, { type: 'QUIZ_LEARNED' }).state
    s = answerAll(s, 0)
    s = dispatch(s, { type: 'QUIZ_CONFIRM' }).state
    const afterFirst = structuredClone(s)
    // 加练照常可开（会话为空即允许；quizDaily.done 只封资源奖励不封入口）
    const r = dispatch(s, { type: 'QUIZ_BEGIN' })
    expect(r.ok).toBe(true)
    s = r.state
    s = dispatch(s, { type: 'QUIZ_LEARNED' }).state
    s = answerAll(s, 0)
    s = dispatch(s, { type: 'QUIZ_CONFIRM' }).state
    expect(s.quizDaily.done).toBe(true)
    // 资源零变化（第二场无奖励），打卡也只记一次
    expect(s.resources).toEqual(afterFirst.resources)
    expect(s.streak.count).toBe(afterFirst.streak.count)
    expect(s.log.some((l) => l.text.includes('今日奖励已领'))).toBe(true)
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

describe('道心打卡（real-day.md §3.4）', () => {
  // 全错完成一场测验：确认结果即打卡，不看正确率（Duolingo 口径）
  function finishAllWrong(s: GameState): GameState {
    let cur = dispatch(s, { type: 'QUIZ_BEGIN' }).state
    cur = dispatch(cur, { type: 'QUIZ_LEARNED' }).state
    const session = cur.quizDaily.session!
    for (let i = 0; i < 10; i++) {
      const q = session.questions[i]
      // spell 题（v4）无选项：给错误拼写；其余题型选非正确释义
      const wrong = q.kind === 'spell' ? q.word + 'zz' : q.opts.find((o) => o !== q.meaning)!
      cur = dispatch(cur, { type: 'QUIZ_ANSWER', choice: wrong }).state
      cur = dispatch(cur, { type: 'QUIZ_NEXT' }).state
    }
    return dispatch(cur, { type: 'QUIZ_CONFIRM' }).state
  }

  it('确认结果即打卡：全错也计数，history 记录当日索引', () => {
    let s = createInitialState(7)
    const today = s.realDay.today
    s = finishAllWrong(s)
    expect(s.streak.count).toBe(1)
    expect(s.streak.best).toBe(1)
    expect(s.streak.checkins).toBe(1)
    expect(s.streak.lastCheckinDay).toBe(today)
    expect(s.streak.history).toEqual([today])
  })

  it('同现实日多次完成测验只记一次', () => {
    let s = createInitialState(7)
    const today = s.realDay.today
    s = finishAllWrong(s)
    // 同现实日推进一个游戏日后再完成测验（现实日未变）
    s.quizDaily.done = true
    s = dispatch(s, { type: 'END_DAY' }).state
    s = finishAllWrong(s)
    expect(s.streak.count).toBe(1)
    expect(s.streak.checkins).toBe(1)
    expect(s.streak.history).toEqual([today])
  })

  it('跨现实日打卡 count 递增、best 跟随', () => {
    let s = createInitialState(7)
    s = finishAllWrong(s)
    // 模拟次日：现实日索引 +1（等价于 syncRealDay 已推进 today）
    s.realDay.today += 1
    s.quizDaily.done = true
    s = dispatch(s, { type: 'END_DAY' }).state
    s = finishAllWrong(s)
    expect(s.streak.count).toBe(2)
    expect(s.streak.best).toBe(2)
    expect(s.streak.history.length).toBe(2)
    expect(s.streak.history[1]).toBeGreaterThan(s.streak.history[0])
  })

  it('里程碑：count 命中 7 发 30 灵石与 breakthrough 日志，断签重练不重复发放', () => {
    let s = createInitialState(7)
    s.streak.count = 6
    s.realDay.today += 1
    const stones = s.resources.stones
    s = finishAllWrong(s)
    expect(s.streak.milestones).toEqual([7])
    expect(s.resources.stones).toBe(stones + 30)
    expect(s.log.some((l) => l.kind === 'breakthrough' && l.title.includes('道心 7 天'))).toBe(true)
    // 断签后连胜归零再练回 7：不重复发放
    s.streak.count = 6
    s.realDay.today += 1
    const stones2 = s.resources.stones
    s.quizDaily.done = true
    s = dispatch(s, { type: 'END_DAY' }).state
    s = finishAllWrong(s)
    expect(s.streak.count).toBe(7)
    expect(s.streak.milestones).toEqual([7])
    expect(s.resources.stones).toBe(stones2)
  })

  it('里程碑 30 天发 80 灵石', () => {
    let s = createInitialState(7)
    s.streak.count = 29
    s.realDay.today += 1
    const stones = s.resources.stones
    s = finishAllWrong(s)
    expect(s.streak.milestones).toEqual([30])
    expect(s.resources.stones).toBe(stones + 80)
  })

  it('护道符：每 7 次打卡 +1，封顶 2 不再发放', () => {
    let s = createInitialState(7)
    const freezesAt: number[] = []
    for (let i = 0; i < 16; i++) {
      s.realDay.today += 1 // 每场换一个现实日，保证都能打卡
      s.quizDaily.done = false
      s = finishAllWrong(s)
      freezesAt.push(s.streak.freezes)
    }
    expect(s.streak.checkins).toBe(16)
    expect(freezesAt[6]).toBe(1) // 第 7 次打卡 → 1 符
    expect(freezesAt[13]).toBe(2) // 第 14 次 → 2 符
    expect(s.streak.freezes).toBe(2) // 已满后不发放（第 21 次前不会再到 7 的倍数）
  })

  // 375 轮整场测验耗时基线 ~3.3s，贴默认 5s 超时（T27/T29 两次偶发超时）：单独放宽超时
  it('打卡历史环形保留 370 条', () => {
    let s = createInitialState(7)
    for (let i = 0; i < 375; i++) {
      s.realDay.today += 1
      s.quizDaily.done = false
      s = finishAllWrong(s)
    }
    expect(s.streak.history.length).toBe(370)
    // 队首被裁掉最旧的，仍严格升序
    expect(s.streak.history[0]).toBeGreaterThan(s.realDay.today - 370)
  }, 15000)
})
