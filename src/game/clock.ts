// 现实时钟（real-day.md §3.1）：现实时间只在本模块与 store 层出现，引擎零时间依赖。
// 所有通知（晨露 / 护道符 / 断签）走 addLog，由现有「日志差量派生 toast」机制呈现，不建新管道。
import { DAY_CUT_HOUR, MORNING_GIFT } from './constants'
import { addLog } from './log'
import type { GameState } from './types'

// 现实日索引：日切凌晨 4 点（3:59 属前一现实日，4:00 起算新一日），整数单调递增。
// 用「now − 4h 的本地日历日」序号实现，DST 偏移由本地日历组件天然吸收。
export function realDayIndex(nowMs: number): number {
  const shifted = new Date(nowMs - DAY_CUT_HOUR * 3_600_000)
  // Date.UTC 按本地年月日合成 UTC 零点，再折算天数：与本地时区偏移解耦
  return Math.floor(Date.UTC(shifted.getFullYear(), shifted.getMonth(), shifted.getDate()) / 86_400_000)
}

// 索引 → 该现实日对应的本地日历日（取正午，避开日切 4 点与 DST 边界），供日历热力图渲染
export function indexToDate(idx: number): Date {
  const utc = new Date(idx * 86_400_000)
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), 12, 0, 0, 0)
}

// 跨现实日同步（纯函数，测试注入固定 nowMs）：
// - 跨入新现实日：发晨露、重置当日游戏日计数、连胜漏签检查、更新 today
// - today <= 已存档值（含时钟倒流）：完全不动——不发奖、不重置、不报错，防误改不防作弊
export function syncRealDay(state: GameState, nowMs: number): { state: GameState; changed: boolean } {
  const today = realDayIndex(nowMs)
  if (today <= state.realDay.today) return { state, changed: false }
  const s = structuredClone(state)
  // 晨露（real-day.md §3.3）：灵石 +8 / 心得 +5，不碰灵气；新档开局当日不发由「today <= 已存档值」天然保证
  s.resources.stones += MORNING_GIFT.stones
  s.resources.insight += MORNING_GIFT.insight
  addLog(s, {
    kind: 'settle',
    icon: '🌅',
    title: '晨露凝而复聚',
    text: `新的一日，灵田晨露带来 灵石 +${MORNING_GIFT.stones} · 心得 +${MORNING_GIFT.insight}`,
  })
  // 连胜漏签检查（real-day.md §3.4）：漏签天数 = today − 旧 today − 1（跨过的完整未玩日）
  // 从未打卡（lastCheckinDay === -1）跳过：0 连胜无火可熄，避免新档收到误导性断签日志
  const missed = today - s.realDay.today - 1
  if (missed > 0 && s.streak.lastCheckinDay !== -1) {
    if (missed <= s.streak.freezes) {
      // 漏签 ≤ 符余量：自动消耗等量符保连胜（静默自动生效，无需玩家操作）
      s.streak.freezes -= missed
      addLog(s, {
        kind: 'settle',
        icon: '🧿',
        title: '护道符护住了道心',
        text: `漏签 ${missed} 天，护道符 −${missed}，道心连胜 ${s.streak.count} 保持`,
      })
    } else {
      // 超出符余量：连胜归零，符保留不清，进度无损
      s.streak.count = 0
      addLog(s, {
        kind: 'settle',
        neg: true,
        icon: '🕯',
        title: '道心之火熄了',
        text: `连续漏签 ${missed} 天超出护道符，道心连胜归零；修为与进度无损，重新点燃吧`,
      })
    }
  }
  // 跨现实日重置测验奖励锚（time-decouple.md §3.4）：quizDaily.done 语义 = 本现实日已领奖励，
  // 不再随游戏日推进重置；进行中的会话保留可续答
  s.quizDaily.done = false
  s.realDay.today = today
  return { state: s, changed: true }
}
