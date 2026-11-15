// 任务堂背单词（quiz.md）：抽题与补题链、先学后测、错词池、跨库记录、奖励与学习统计
// 全部函数在 engine 克隆的 draft 上就地修改，返回失败原因或 null
import {
  FREEZE_CAP, FREEZE_GRANT_EVERY, HERBS, MILESTONE_REWARD, MILESTONE_TITLES, QUIZ_PASS, QUIZ_SIZE,
  REWARD_FAIL, REWARD_FULL, REWARD_PASS, STREAK_HISTORY_MAX, STREAK_MILESTONES, reviewQuota,
} from './constants'
import { addLog } from './log'
import { qiCap } from './progression'
import { createRng, pick, shuffled, type Rng } from './rng'
import { buildOptions, entryOf, LIBS, normalize } from './wordbank'
import type { GameState, LibId, QuizQuestion, ReasonCode } from './types'

// 抽题（quiz.md §3.2）：复习配额按境界；错词队首优先，再按最近作答时间从早到晚取已见词；
// 新词从当前库未见词随机；补足链：复习不足→新词补，新词不足→未选入的已见词补
export function beginSession(s: GameState, rng: Rng): ReasonCode | null {
  if (s.quizDaily.done) return 'ALREADY_DONE'
  const lib = s.learning.currentLib
  const bank = LIBS[lib]
  if (bank.length < QUIZ_SIZE) return 'LIBRARY_INSUFFICIENT'

  const quota = reviewQuota(s.realm)
  const seen = s.learning.seenMap
  const stat = s.learning.libs[lib]
  const libWords = new Set(bank.map((w) => normalize(w.word)))

  // 复习候选 1：错词池等待最久（队首）
  const chosen: string[] = []
  const queue = [...stat.wrongQueue]
  while (chosen.length < quota && queue.length > 0) {
    const w = queue.shift()!
    if (!chosen.includes(w) && libWords.has(w)) chosen.push(w)
  }
  // 复习候选 2：已见未在错池，按最近作答时间从早到晚
  if (chosen.length < quota) {
    const seenNotWrong = Object.keys(seen)
      .filter((w) => libWords.has(w) && !queue.includes(w) && !chosen.includes(w))
      .sort((a, b) => seen[a] - seen[b])
    for (const w of seenNotWrong) {
      if (chosen.length >= quota) break
      chosen.push(w)
    }
  }
  // 新词：当前库未见随机
  let news = shuffled(
    rng,
    bank.map((w) => normalize(w.word)).filter((w) => !Object.hasOwn(seen, w) && !chosen.includes(w)),
  ).slice(0, QUIZ_SIZE - chosen.length)
  // 补足链：新词不足 → 尚未选入的已见词补（同场 10 词不重复）
  if (chosen.length + news.length < QUIZ_SIZE) {
    const filler = Object.keys(seen)
      .filter((w) => libWords.has(w) && !chosen.includes(w) && !news.includes(w))
      .sort((a, b) => seen[b] - seen[a])
    news = [...news, ...filler.slice(0, QUIZ_SIZE - chosen.length - news.length)]
  }
  const all = [...chosen, ...news]
  if (all.length < QUIZ_SIZE || new Set(all).size < QUIZ_SIZE) return 'LIBRARY_INSUFFICIENT'

  const questions: QuizQuestion[] = []
  for (const norm of all) {
    const entry = entryOf(lib, norm)
    if (!entry) return 'LIBRARY_INSUFFICIENT'
    const opts = buildOptions(rng, entry, lib)
    if (!opts) return 'LIBRARY_INSUFFICIENT'
    questions.push({
      word: entry.word,
      meaning: entry.meaning,
      // 补题可能使用已见词，它仍是复习词，不能在学习页提前展示答案。
      from: chosen.includes(norm) || Object.hasOwn(seen, norm) ? 'review' : 'new',
      opts,
    })
  }
  s.quizDaily.session = {
    lib,
    questions: shuffled(rng, questions),
    idx: 0,
    answers: Array(QUIZ_SIZE).fill(null),
    phase: 'learning',
  }
  // 见词标记与作答时间立即更新（跨库共享 seenMap）
  for (const q of s.quizDaily.session.questions) seen[normalize(q.word)] = s.day
  return null
}

// 先学后测：看完新词进入测验
export function learned(s: GameState): ReasonCode | null {
  const session = s.quizDaily.session
  if (!session || session.phase !== 'learning') return 'INVALID_TARGET'
  session.phase = 'testing'
  return null
}

// 作答：以首次作答计分；答错入队尾、答对出池（quiz.md §3.4）
export function answer(s: GameState, choice: string): ReasonCode | null {
  const session = s.quizDaily.session
  if (!session || session.phase !== 'testing') return 'INVALID_TARGET'
  if (session.answers[session.idx] !== null) return 'ALREADY_DONE'
  const q = session.questions[session.idx]
  if (!q.opts.includes(choice)) return 'INVALID_TARGET'
  session.answers[session.idx] = choice
  const norm = normalize(q.word)
  const stat = s.learning.libs[session.lib]
  if (q.from === 'review') {
    if (choice === q.meaning) {
      stat.wrongQueue = stat.wrongQueue.filter((w) => w !== norm)
    } else {
      stat.wrongQueue = [...stat.wrongQueue.filter((w) => w !== norm), norm]
    }
  } else if (choice !== q.meaning && !stat.wrongQueue.includes(norm)) {
    stat.wrongQueue.push(norm)
  }
  return null
}

// 下一题 / 查看结果
export function next(s: GameState): ReasonCode | null {
  const session = s.quizDaily.session
  if (!session || session.phase !== 'testing') return 'INVALID_TARGET'
  if (session.answers[session.idx] === null) return 'ALREADY_DONE'
  if (session.idx === QUIZ_SIZE - 1) {
    session.phase = 'result'
  } else {
    session.idx += 1
  }
  return null
}

// 确认结果：判分、发奖、更新学习统计（quiz.md §3.5/§3.6）；确认即完成当日任务并清空会话
export function confirm(s: GameState): ReasonCode | null {
  const session = s.quizDaily.session
  if (!session || session.phase !== 'result') return 'INVALID_TARGET'
  const stat = s.learning.libs[session.lib]
  let score = 0
  session.questions.forEach((q, i) => {
    const choice = session.answers[i]
    const correct = choice === q.meaning
    const norm = normalize(q.word)
    stat.attempts += 1
    // 首答口径：该词第一次计入本库统计时记首答正确率；重复作答只加 attempts
    if (!stat.distinctWords.includes(norm)) {
      stat.distinctWords.push(norm)
      stat.firstCorrect.total += 1
      if (correct) stat.firstCorrect.hit += 1
    }
    if (q.from === 'review') {
      stat.reviewCorrect.total += 1
      if (correct) stat.reviewCorrect.hit += 1
    }
    if (correct) score += 1
  })
  stat.sessions += 1
  const pass = score >= QUIZ_PASS

  if (pass) {
    const gain = REWARD_PASS.qi + (s.gongfa >= 4 ? 1 : 0)
    const before = s.resources.qi
    s.resources.qi = Math.min(qiCap(s.realm), before + gain)
    const overflow = before + gain - s.resources.qi
    s.resources.contribution += REWARD_PASS.contribution
    s.resources.insight += REWARD_PASS.insight + (score === QUIZ_SIZE ? REWARD_FULL.insight : 0)
    addLog(s, {
      kind: 'settle',
      icon: '✅',
      title: `任务堂 ${score}/${QUIZ_SIZE}`,
      text: `灵气 +${gain}${overflow > 0 ? `（溢出 ${overflow}）` : ''}、贡献 +${REWARD_PASS.contribution}、心得 +${REWARD_PASS.insight + (score === QUIZ_SIZE ? REWARD_FULL.insight : 0)}`,
    })
  } else {
    s.resources.insight += REWARD_FAIL.insight
    const before = s.resources.qi
    s.resources.qi = Math.min(qiCap(s.realm), before + REWARD_FAIL.qi)
    addLog(s, { kind: 'settle', icon: '📘', title: `任务堂 ${score}/${QUIZ_SIZE}`, text: `灵气 +${REWARD_FAIL.qi}、心得 +${REWARD_FAIL.insight}；错词将排队复习` })
  }
  s.quizDaily.done = true
  s.quizDaily.session = null
  // 打卡（real-day.md §3.4）：确认结果即算，不看正确率；同现实日多次完成测验只记一次
  checkinStreak(s)
  return null
}

// 道心打卡：QUIZ_CONFIRM 成功且今日未打卡时计数、发护道符、结里程碑（通知走日志派生 toast）
function checkinStreak(s: GameState): void {
  if (s.streak.lastCheckinDay === s.realDay.today) return
  s.streak.lastCheckinDay = s.realDay.today
  s.streak.count += 1
  s.streak.checkins += 1
  if (s.streak.count > s.streak.best) s.streak.best = s.streak.count
  s.streak.history.push(s.realDay.today)
  // 环形保留最近 STREAK_HISTORY_MAX 条（日历热力图数据源）
  if (s.streak.history.length > STREAK_HISTORY_MAX) s.streak.history.splice(0, s.streak.history.length - STREAK_HISTORY_MAX)
  // 护道符：每累计 FREEZE_GRANT_EVERY 次打卡 +1，不超上限（已满则本次不补发）
  if (s.streak.checkins % FREEZE_GRANT_EVERY === 0 && s.streak.freezes < FREEZE_CAP) {
    s.streak.freezes += 1
    addLog(s, {
      kind: 'settle',
      icon: '🧿',
      title: '得护道符',
      text: `累计打卡 ${s.streak.checkins} 次，护道符 +1（余 ${s.streak.freezes}/${FREEZE_CAP}）；漏签时自动护住道心`,
    })
  }
  // 里程碑：count 命中 7/30/100/365 且未发放过 → 灵石奖励 + breakthrough 日志（称号由已达成最高里程碑派生，不存档）
  const hit = STREAK_MILESTONES.find((m) => m === s.streak.count && !s.streak.milestones.includes(m))
  if (hit !== undefined) {
    s.streak.milestones.push(hit)
    s.resources.stones += MILESTONE_REWARD[hit]
    addLog(s, {
      kind: 'breakthrough',
      icon: '🌕',
      title: `道心 ${hit} 天 · ${MILESTONE_TITLES[hit]}`,
      text: `灵石 +${MILESTONE_REWARD[hit]}，获称号「${MILESTONE_TITLES[hit]}」`,
    })
  }
}

// 切换词库：不增加当天任务次数或奖励；进行中的测验固定词库不可切（quiz.md §3.4）
export function setLib(s: GameState, lib: LibId): ReasonCode | null {
  if (s.quizDaily.session) return 'ALREADY_DONE'
  s.learning.currentLib = lib
  return null
}

// 供测试与调试：错词重现比例等统计由 stat 提供；rng 独立入口便于单独抽干扰项测试
export const _rngHelpers = { createRng, pick, shuffled, HERBS }
