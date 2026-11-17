import { FREEZE_CAP, FREEZE_GRANT_EVERY, MILESTONE_TITLES, QUIZ_SIZE, STREAK_MILESTONES } from '../game/constants'
import { indexToDate, realDayIndex } from '../game/clock'
import { useGameStore } from '../stores/useGameStore'
import { Btn, Modal } from './ui'

// 修行日历弹层（real-day.md §4）：本月打卡热力图 + 道心统计。
// 视觉全部由 primary/gold/gray/warning token 派生，不硬编码色值；emoji 兜底不引素材。
export default function CalendarModal({ onClose }: { onClose: () => void }) {
  const g = useGameStore((s) => s.game)
  const today = g.realDay.today
  const checkedToday = g.streak.lastCheckinDay === today
  const history = new Set(g.streak.history)
  // 里程碑命中日：第 7/30/100/365 次打卡的现实日索引从 history 派生（升序数组第 m 项），
  // 环形截断（370 条）后更早的里程碑日自然不再标亮；milestones 本身存天数，不做索引匹配
  const milestoneDays = new Set(
    g.streak.milestones.flatMap((m) => {
      const idx = g.streak.history[m - 1]
      return idx === undefined ? [] : [idx]
    }),
  )

  // 当前现实日所在月：indexToDate 返回该现实日对应的本地日历日正午（避开日切 4 点与 DST 边界）
  const monthDate = indexToDate(today)
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // 线框周序：一 二 三 四 五 六 日（周一为一周之首）
  const firstOffset = (new Date(year, month, 1).getDay() + 6) % 7
  const nextMilestone = STREAK_MILESTONES.find((m) => m > g.streak.count)
  const bestMilestone = Math.max(0, ...g.streak.milestones)
  const empty = g.streak.history.length === 0

  // 单格状态：今日描边；🌕 里程碑日发光；🌑 已打卡；过去未打卡 ·；未来置灰
  function Cell({ idx, label }: { idx: number; label: string }) {
    const isToday = idx === today
    const isFuture = idx > today
    const isMilestone = milestoneDays.has(idx)
    const isChecked = history.has(idx)
    let style = 'text-gray-300' // 未来日
    let mark = '·'
    if (!isFuture) {
      if (isMilestone) {
        style = 'bg-gold-pale text-warning-500 shadow-[0_0_8px_var(--color-glow)] scale-110'
        mark = '🌕'
      } else if (isChecked) {
        style = 'bg-primary-100 text-primary-600'
        mark = '🌑'
      } else {
        style = 'text-gray-400'
        mark = '·'
      }
    }
    return (
      <span
        title={label}
        className={`grid aspect-square place-items-center rounded-lg text-sm leading-none ${style} ${
          isToday ? 'ring-2 ring-gold' : ''
        }`}
      >
        {mark}
      </span>
    )
  }

  return (
    <Modal title="修行日历" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* 统计行：连胜 / 历史最高 / 护道符 */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-gray-700">
          <span title="每个现实日完成一次任务堂（10 题，答错也算）即打卡；连胜达成里程碑可得称号">道心连胜 <b className="text-primary-600">{g.streak.count}</b> 🔥</span>
          <span>历史最高 <b className="text-primary-600">{g.streak.best}</b></span>
          <span title={`上限 ${FREEZE_CAP} 枚：每累计打卡 ${FREEZE_GRANT_EVERY} 次自动 +1；漏签时自动消耗，保住连胜`}>护道符 <b className="text-primary-600">{g.streak.freezes}/{FREEZE_CAP}</b> 🧿</span>
        </div>
        {/* 称号与下一里程碑：称号由已达成最高里程碑派生，不存档 */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-gray-600">
          <span>称号 <b className="text-warning-500">{bestMilestone > 0 ? MILESTONE_TITLES[bestMilestone] : '尚无'}</b></span>
          <span>
            {nextMilestone
              ? <>下一里程碑 {nextMilestone} 天（还差 {nextMilestone - g.streak.count} 天）</>
              : '已达成全部道心里程碑'}
          </span>
          <span>{checkedToday ? '今日已打卡 ✓' : '今日未打卡 ⚠ 完成 10 题即算，答错也算'}</span>
        </div>

        {empty ? (
          // 空态（新档）：道心之火尚未点燃
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
            道心之火尚未点燃——完成第一次任务堂即开始计数
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="mb-2 text-center text-sm text-gray-700">{monthDate.getFullYear()} 年 {monthDate.getMonth() + 1} 月</div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-500">
              {['一', '二', '三', '四', '五', '六', '日'].map((w) => <span key={w}>{w}</span>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {/* 月首空白占位 */}
              {Array.from({ length: firstOffset }, (_, i) => <span key={`pad-${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <Cell key={d} idx={realDayIndex(new Date(year, month, d, 12).getTime())} label={`${month + 1} 月 ${d} 日`} />
              ))}
            </div>
          </div>
        )}

        {/* 底部说明与已达成里程碑 */}
        <div className="flex flex-col gap-1 text-xs text-gray-500">
          <span>累计打卡 {g.streak.checkins} 天 · 完成当日 {QUIZ_SIZE} 题即算打卡，答错也算</span>
          {bestMilestone > 0 && <span className="text-warning-500">达成 · {MILESTONE_TITLES[bestMilestone]}</span>}
        </div>
        <div className="flex justify-end">
          <Btn variant="secondary" onClick={onClose} className="!min-h-11">关闭</Btn>
        </div>
      </div>
    </Modal>
  )
}
