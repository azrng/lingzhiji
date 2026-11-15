// 现实日锚单测（real-day.md §6）：日切边界、倒流不动作、跨多日漏签、晨露发放、gamesToday 计数
import { describe, expect, it } from 'vitest'
import { MORNING_GIFT } from '../constants'
import { indexToDate, realDayIndex, syncRealDay } from '../clock'
import { createInitialState, dispatch } from '../engine'
import type { GameState } from '../types'

// 固定时刻工厂（当地时间）：at(2026, 11, 15, 3, 59) = 2026-11-15 03:59
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()

// 固定开局时刻：2026-11-10 正午（远离日切边界，便于加减整天）
function baseState(): GameState {
  return createInitialState(42, at(2026, 11, 10, 12))
}

// 标记当日任务完成后推进游戏日（失败即抛错，用例只关心推进后的计数）
function mustEndDay(s: GameState): GameState {
  s.quizDaily.done = true
  const r = dispatch(s, { type: 'END_DAY' })
  if (!r.ok) throw new Error(`END_DAY 失败: ${r.reason}`)
  return r.state!
}

describe('现实日索引（日切凌晨 4 点）', () => {
  it('3:59 与 4:00 属于不同现实日；4:00 与次日 3:59 属于同一现实日', () => {
    const before = realDayIndex(at(2026, 11, 15, 3, 59))
    const after = realDayIndex(at(2026, 11, 15, 4, 0))
    expect(after).toBe(before + 1)
    // 次日 3:59 仍未跨出 4:00 开启的现实日
    expect(realDayIndex(at(2026, 11, 16, 3, 59))).toBe(after)
    expect(realDayIndex(at(2026, 11, 16, 4, 0))).toBe(after + 1)
  })

  it('索引单调递增，indexToDate 反解回对应本地日历日（含 4 点前算前一日）', () => {
    expect(realDayIndex(at(2026, 11, 15, 10)) + 1).toBe(realDayIndex(at(2026, 11, 16, 10)))
    const noon = indexToDate(realDayIndex(at(2026, 11, 15, 10)))
    expect([noon.getFullYear(), noon.getMonth() + 1, noon.getDate()]).toEqual([2026, 11, 15])
    // 凌晨 2 点属于前一现实日 → 反解为 11-14
    const lateNight = indexToDate(realDayIndex(at(2026, 11, 15, 2)))
    expect(lateNight.getDate()).toBe(14)
  })
})

describe('syncRealDay：晨露与倒流', () => {
  it('同日与倒流（含倒流后修回）完全不动', () => {
    const s = baseState()
    // 同日推进 1 小时：不动作
    const same = syncRealDay(s, at(2026, 11, 10, 13))
    expect(same.changed).toBe(false)
    expect(same.state).toBe(s)
    // 时钟倒流：不动作
    const back = syncRealDay(s, at(2026, 11, 9, 12))
    expect(back.changed).toBe(false)
    expect(back.state.resources).toEqual(s.resources)
    // 倒流后修回正常时间当天：仍不动作（只有真正跨日才进入下一现实日）
    const recover = syncRealDay(s, at(2026, 11, 10, 23))
    expect(recover.changed).toBe(false)
  })

  it('跨日发一次晨露（灵石 +8 / 心得 +5，不碰灵气），同日重复 sync 不重发，倒流不重发', () => {
    const s = baseState()
    const r1 = syncRealDay(s, at(2026, 11, 11, 12))
    expect(r1.changed).toBe(true)
    expect(r1.state.resources.stones).toBe(s.resources.stones + MORNING_GIFT.stones)
    expect(r1.state.resources.insight).toBe(s.resources.insight + MORNING_GIFT.insight)
    expect(r1.state.resources.qi).toBe(s.resources.qi) // 晨露不走灵气
    expect(r1.state.log[0].title).toBe('晨露凝而复聚')
    // 同一新现实日内再 sync：不重发
    const r2 = syncRealDay(r1.state, at(2026, 11, 11, 20))
    expect(r2.changed).toBe(false)
    // 倒流回旧日：不重发
    const r3 = syncRealDay(r1.state, at(2026, 11, 10, 12))
    expect(r3.changed).toBe(false)
    expect(r3.state.resources.stones).toBe(r1.state.resources.stones)
  })

  it('新档开局当日不发晨露（初始 today = 创建当日）', () => {
    const s = baseState()
    const r = syncRealDay(s, at(2026, 11, 10, 22))
    expect(r.changed).toBe(false)
    expect(s.log.some((l) => l.title === '晨露凝而复聚')).toBe(false)
  })

  it('跨日重置 gamesToday 并更新 today', () => {
    const s = baseState()
    s.realDay.gamesToday = 3
    const r = syncRealDay(s, at(2026, 11, 12, 8))
    expect(r.state.realDay.gamesToday).toBe(0)
    expect(r.state.realDay.today).toBe(realDayIndex(at(2026, 11, 12, 8)))
  })
})

describe('syncRealDay：连胜漏签检查', () => {
  function streakState(count: number, freezes: number, lastCheckin?: number): GameState {
    const s = baseState()
    s.streak.count = count
    s.streak.best = count
    s.streak.freezes = freezes
    // 有连胜意味着一直在打卡：默认打卡到旧 today（真实语义），显式传参可覆盖
    s.streak.lastCheckinDay = lastCheckin ?? s.realDay.today
    return s
  }

  it('漏 1 天且有 1 符：消耗 1 符保连胜', () => {
    const s = streakState(5, 1)
    // 旧 today = 11-10，sync 到 11-12 → 漏签 = 12 - 10 - 1 = 1 天
    const r = syncRealDay(s, at(2026, 11, 12, 12))
    expect(r.state.streak.freezes).toBe(0)
    expect(r.state.streak.count).toBe(5)
    expect(r.state.log.some((l) => l.title === '护道符护住了道心')).toBe(true)
  })

  it('漏 2 天且有 2 符：等量消耗全部护道符', () => {
    const s = streakState(6, 2)
    const r = syncRealDay(s, at(2026, 11, 13, 12)) // 漏签 2 天
    expect(r.state.streak.freezes).toBe(0)
    expect(r.state.streak.count).toBe(6)
  })

  it('漏 3 天只有 1 符：连胜归零但护道符保留、进度无损（best 不清）', () => {
    const s = streakState(9, 1)
    const r = syncRealDay(s, at(2026, 11, 14, 12)) // 漏签 3 天 > 1 符
    expect(r.state.streak.count).toBe(0)
    expect(r.state.streak.freezes).toBe(1) // 符保留不清
    expect(r.state.streak.best).toBe(9) // 进度无损
    expect(r.state.cultivation).toBe(s.cultivation)
    const lost = r.state.log.find((l) => l.title === '道心之火熄了')
    expect(lost?.neg).toBe(true)
  })

  it('昨日打卡今日回归：漏签 0 天，连胜保持且不消耗符', () => {
    const s = streakState(5, 2, realDayIndex(at(2026, 11, 10, 12)))
    const r = syncRealDay(s, at(2026, 11, 11, 12)) // 漏签 = 0
    expect(r.state.streak.count).toBe(5)
    expect(r.state.streak.freezes).toBe(2)
    expect(r.state.log.some((l) => l.title === '护道符护住了道心' || l.title === '道心之火熄了')).toBe(false)
  })

  it('跨多日但从未打卡（新档）：跳过漏签检查，不发断签日志、不消耗符', () => {
    const s = baseState() // count 0 / freezes 0 / lastCheckinDay -1
    const r = syncRealDay(s, at(2026, 11, 20, 12)) // 漏签 9 天，但从未点火
    expect(r.state.streak.count).toBe(0)
    expect(r.state.streak.freezes).toBe(0)
    expect(r.state.log.some((l) => l.title === '道心之火熄了')).toBe(false) // 0 连胜无火可熄，不发误导日志
    expect(r.state.log.some((l) => l.title === '护道符护住了道心')).toBe(false)
  })
})

describe('gamesToday 计数（engine 集成）', () => {
  it('END_DAY 成功推进 +1；月末 QUOTA_RESOLVE 推进同样 +1；跨日 sync 归零', () => {
    const s = baseState()
    const d1 = mustEndDay(s)
    expect(d1.realDay.gamesToday).toBe(1)
    const d2 = mustEndDay(d1)
    expect(d2.realDay.gamesToday).toBe(2)
    // 跨现实日后归零
    const { state: d3 } = syncRealDay(d2, at(2026, 11, 11, 12))
    expect(d3.realDay.gamesToday).toBe(0)
    // 月末路径：第 30 天 END_DAY 进定额交互，QUOTA_RESOLVE 推进同样计数
    d3.day = 30
    d3.quizDaily.done = true
    const quota = dispatch(d3, { type: 'END_DAY' })
    expect(quota.ok).toBe(true)
    expect(quota.state!.phase).toBe('quota')
    const resolved = dispatch(quota.state, { type: 'QUOTA_RESOLVE', pay: false, plan: {} })
    expect(resolved.ok).toBe(true)
    expect(resolved.state!.day).toBe(31)
    expect(resolved.state!.realDay.gamesToday).toBe(1)
  })
})
