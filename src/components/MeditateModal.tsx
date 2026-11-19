import { useMemo, useState } from 'react'
import type { MeditateRunInfo } from '../game/engine'
import { meditatePreview, meditateRunInfo, meditateSnapshot } from '../game/meditate'
import { useGameStore } from '../stores/useGameStore'
import { useUiStore } from '../stores/useUiStore'
import { Btn, Modal } from './ui'

// 入定 · 时序快进弹层（time-decouple.md §4）：滑条联动预演（确定性汇总）→ 确认执行
// （dispatch MEDITATE，逐日跑 endDay 五步管线）→ 结果面板（逐日摘要 + 明日预告）。
// 月末出关时 phase 转 'quota'，本弹层让位给定额结算（QuotaModal），再次进入不重开
export default function MeditateModal() {
  const g = useGameStore((s) => s.game)
  const act = useGameStore((s) => s.act)
  const setMeditateOpen = useUiStore((s) => s.setMeditateOpen)
  const [days, setDays] = useState(3)
  const [result, setResult] = useState<MeditateRunInfo | null>(null)

  const snap = meditateSnapshot(g)
  const maxDays = Math.max(1, 30 - snap.monthDay) // 上限：当日到月末（月末定额为唯一中断点）
  const clampedDays = Math.min(days, maxDays)
  const preview = useMemo(
    () => (snap.quotaPending ? null : meditatePreview(g, clampedDays)),
    // g 随 dispatch 变化才需重算；预演为纯函数，依赖整个 game 快照
    [g, clampedDays, snap.quotaPending],
  )

  const run = () => {
    // 先在副本上取逐日轨迹（与真实落盘同一管线、同一 rngState，确定性一致），再 dispatch 真实推进
    const info = meditateRunInfo(g, clampedDays)
    const r = act({ type: 'MEDITATE', days: clampedDays })
    if (!r.ok || !info) return
    if (info.stoppedAtMonthEnd) {
      // 月末出关：定额结算弹层接管，结果详情可从折叠日志回看，这里直接收起避免结算后再弹出
      setMeditateOpen(false)
    } else {
      setResult(info)
    }
  }

  const close = () => {
    setMeditateOpen(false)
    setResult(null)
  }

  // 至下次成熟：最早成熟田的剩余天数（无生长中田时置灰，提示先收获）
  const growingRemain = snap.fields.filter((f) => f.status === 'growing').map((f) => f.days - f.progress)

  return (
    <Modal title={result ? '入定 · 已出关' : '入定'} onClose={close} wide>
      {snap.quotaPending ? (
        <div className="text-sm text-gray-700 leading-relaxed">
          <p>今日已是<b>月末（第 30 日）</b>，需先完成本月定额结算，才能继续入定推进时序。</p>
          <div className="mt-5 flex justify-end"><Btn variant="secondary" onClick={close}>返回</Btn></div>
        </div>
      ) : result ? (
        <ResultPanel r={result} onClose={close} />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            入定期间灵田照常生长、事件照常发生，但<b>无法浇灌</b>——缺水累计 3 天将当茬产量减半。月末自动出关，定额结算不受影响。
          </p>

          <div className="rounded-xl border border-gray-200 bg-gray-100 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">入定时长</span>
              <span className="font-serif text-2xl text-info-600 tabular-nums">{clampedDays} 天</span>
            </div>
            <input
              type="range" min={1} max={maxDays} value={clampedDays}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full accent-primary-500"
              aria-label="入定天数"
            />
            <div className="flex justify-between text-xs text-gray-500"><span>1 天</span><span>至月末（{maxDays} 天）</span></div>
          </div>

          {/* 快捷档：1/3/7 天与「至下次成熟」（全田成熟时置灰） */}
          <div className="flex gap-2 flex-wrap">
            {[1, 3, 7].map((n) => (
              <Btn key={n} variant="secondary" className="!min-h-9" disabled={n > maxDays} onClick={() => setDays(n)}>{n} 天</Btn>
            ))}
            <Btn
              variant="secondary" className="!min-h-9"
              disabled={growingRemain.length === 0}
              title={growingRemain.length === 0 ? '田已成熟，请先收获' : '推进到最早成熟的那一天'}
              onClick={() => setDays(Math.min(Math.max(1, ...growingRemain), maxDays))}
            >至下次成熟</Btn>
          </div>

          {/* 田块状态：生长中显示进度与缺水；已成熟提示先收获 */}
          {snap.fields.length > 0 && (
            <div className="flex flex-col gap-2">
              {snap.fields.map((f) => (
                <div key={f.field} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5">
                  <span className="text-sm text-gray-600 w-14">{f.field} 号田</span>
                  <span className="text-sm font-medium text-gray-800">{f.herbName}</span>
                  {f.status === 'mature' ? (
                    <span className="flex-1 text-xs text-success-500">已成熟 · 请先收获</span>
                  ) : (
                    <>
                      <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                        <div className="h-full bg-herb rounded-full" style={{ width: `${Math.min(100, (f.progress / f.days) * 100)}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 tabular-nums">{f.progress}/{f.days} 天</span>
                      {f.dryStreak > 0 && <span className="text-xs text-warning-500">缺水 {f.dryStreak} 天</span>}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 联动预演：确定性汇总（成熟/风险不含随机事件催熟，实际可能更好） */}
          {preview && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-800 mb-2">出关预演</p>
              <div className="text-xs text-gray-600 leading-relaxed flex flex-col gap-1">
                <span>· 推进至 <b>第 {preview.newMonthDay} 日</b>{preview.stoppedAtMonthEnd && '（月末出关，需结算定额）'}</span>
                {preview.matured.length > 0
                  ? <span>· 成熟 {preview.matured.map((m) => `${m.field} 号田${m.herbName}`).join('、')}</span>
                  : <span>· 暂无成熟</span>}
                {preview.dryRisks.map((r) => <span key={r} className="text-warning-500">⚠ {r}</span>)}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Btn variant="secondary" onClick={close}>返回</Btn>
            <Btn variant="gold" onClick={run}>入定 {clampedDays} 天</Btn>
          </div>
        </div>
      )}
    </Modal>
  )
}

// 结果面板：逐日摘要（每行一天：成熟/事件/缺水），尾部明日预告
function ResultPanel({ r, onClose }: { r: MeditateRunInfo; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-700 leading-relaxed">
        一晃 <b className="font-serif text-lg">{r.advancedDays}</b> 天过去——灵草疯长，几只灵蝶惊起。
        {r.stoppedAtMonthEnd && <span className="text-warning-500"> 已至月末，出关后需完成定额结算。</span>}
      </p>
      <div className="rounded-xl border border-gray-200 bg-gray-100 max-h-56 overflow-y-auto">
        {r.perDay.map((d) => (
          <div key={d.dayOffset} className="px-4 py-2 border-b border-gray-200 last:border-b-0 text-sm flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="text-gray-600">入定第 {d.dayOffset} 天</span>
              <div className="flex gap-2 flex-wrap justify-end">
                {d.matured.map((m) => <span key={m.field} className="text-success-500">🌾 {m.herbName}成熟（{m.field} 号田）</span>)}
                {d.dryHit && <span className="text-warning-500">⚠ {d.dryHit.herbName}缺水减产</span>}
                {d.matured.length === 0 && !d.dryHit && d.events.length === 0 && (
                  <span className="text-xs text-gray-400">平顺无事</span>
                )}
              </div>
            </div>
            {d.events.map((e, i) => (
              <div key={`${e.name}-${i}`} className={`text-xs ${e.neg ? 'text-error-400' : 'text-info-600'}`}>
                {e.neg ? '!' : '+'} {e.name}：{e.desc}
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* 明日预告：入定从「关账」变「期待」的一行钩子 */}
      {r.tomorrowHint && (
        <div className="rounded-xl border border-gold/50 bg-gold-pale/40 px-4 py-3 text-sm text-gold-ink">
          🔮 明日预告：{r.tomorrowHint}
        </div>
      )}
      <div className="flex justify-end"><Btn onClick={onClose}>回到灵田</Btn></div>
    </div>
  )
}
