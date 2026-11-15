import { useState } from 'react'
import { GONGFA_COST, GONGFA_NAMES, HERBS } from '../game/constants'
import { REASON_TEXT } from './reasonText'
import { useGameStore } from '../stores/useGameStore'
import { useUiStore } from '../stores/useUiStore'
import { Btn, Modal } from './ui'

// 底部行动面板：AP、行动按钮与「结束这一天」门控（core-loop.md）
export default function ActionPanel() {
  const g = useGameStore((s) => s.game)
  const act = useGameStore((s) => s.act)
  const setQuizOpen = useUiStore((s) => s.setQuizOpen)
  const setMarketOpen = useUiStore((s) => s.setMarketOpen)
  const [gateOpen, setGateOpen] = useState(false)
  const [gongfaOpen, setGongfaOpen] = useState(false)
  const [failHint, setFailHint] = useState<string | null>(null)

  const noGrowing = !g.fields.some((f) => f.status === 'growing')
  const canEmergency =
    g.fields.every((f) => f.status === 'empty') &&
    HERBS.every((h) => g.inventory[h.id] === 0) &&
    !HERBS.some((h) => g.realm >= h.realm && g.seeds[h.id] > 0) &&
    g.resources.stones < Math.min(...HERBS.filter((h) => g.realm >= h.realm).map((h) => h.price))

  // 带失败提示的行动：reason 转文案短暂显示在面板底部
  const tryAct = (run: () => { ok: boolean; reason?: string }) => {
    const r = run()
    setFailHint(r.ok ? null : (r.reason ? REASON_TEXT[r.reason] ?? r.reason : '无法执行'))
    if (r.ok) setTimeout(() => setFailHint(null), 2500)
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl shadow-md px-5 py-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 tracking-widest">行动力</span>
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`w-3 h-3 rotate-45 rounded-sm border ${i < g.ap ? 'bg-gold border-warning-400' : 'bg-transparent border-gray-300'}`} />
            ))}
          </span>
          <span className="text-xs text-gray-500">{g.ap}/3</span>
        </div>
        <div className="h-5 w-px bg-gray-200" />
        <Btn onClick={() => setQuizOpen(true)} variant={g.quizDaily.done ? 'secondary' : 'primary'}>
          任务堂 {g.quizDaily.done ? '· 今日已完成 ✓' : '· 今日未完成'}
        </Btn>
        <Btn variant="secondary" onClick={() => tryAct(() => act({ type: 'WATER' }))} disabled={g.ap < 1 || g.wateredToday}
          title={g.wateredToday ? '今日已浇灌' : '消耗 1 AP，全田今日免缺水'}>
          💧 浇灌
        </Btn>
        <Btn variant="secondary" onClick={() => tryAct(() => act({ type: 'IRRIGATE' }))} disabled={g.resources.qi < 1 || noGrowing}
          title={noGrowing ? REASON_TEXT.NO_CROP : g.resources.qi < 1 ? REASON_TEXT.NO_QI : '消耗 1 灵气，加速生长中灵田'}>
          🔮 灌注
        </Btn>
        <Btn variant="secondary" onClick={() => tryAct(() => act({ type: 'TUNA' }))} disabled={g.tunaUsedToday || g.ap < 1}
          title={g.tunaUsedToday ? '今日已修炼' : '消耗 1 AP，修为 +1'}>
          🧘 吐纳
        </Btn>
        <Btn variant="secondary" onClick={() => setMarketOpen(true)}>🏛 坊市</Btn>
        {g.gongfa < 5 && (
          <Btn variant="secondary" onClick={() => setGongfaOpen(true)}>
            📖 功法 Lv{g.gongfa}
          </Btn>
        )}
        {canEmergency && (
          <Btn variant="gold" onClick={() => act({ type: 'EMERGENCY_SEED' })}>🎁 应急领种</Btn>
        )}
        <div className="ml-auto">
          <Btn variant="gold" onClick={() => (g.quizDaily.done ? tryAct(() => act({ type: 'END_DAY' })) : setGateOpen(true))}>
            结束这一天 →
          </Btn>
        </div>
      </div>
      {(g.wateredToday || g.tunaUsedToday || failHint) && (
        <div className="text-xs text-gray-400 mt-2">
          {g.wateredToday && '今日已浇灌 ✓ '}
          {g.tunaUsedToday && '今日已吐纳 ✓ '}
          {failHint && <span className="text-warning-500">{failHint}</span>}
        </div>
      )}

      {gateOpen && (
        <Modal title="还不能结束这一天" onClose={() => setGateOpen(false)}>
          <p className="text-sm text-gray-700 leading-relaxed">
            今日任务堂尚未完成。完成 10 题并确认结果后才能推进游戏日，<b>答错也能继续</b>。
          </p>
          <div className="flex justify-end gap-3 mt-5">
            <Btn variant="secondary" onClick={() => setGateOpen(false)}>返回</Btn>
            <Btn onClick={() => { setGateOpen(false); setQuizOpen(true) }}>进入任务堂</Btn>
          </div>
        </Modal>
      )}

      {gongfaOpen && <GongfaModal onClose={() => setGongfaOpen(false)} />}
    </div>
  )
}

// 功法进阶：心得 + 贡献双消耗（quiz.md §3.5）
function GongfaModal({ onClose }: { onClose: () => void }) {
  const g = useGameStore((s) => s.game)
  const act = useGameStore((s) => s.act)
  const next = g.gongfa + 1
  const cost = GONGFA_COST[g.gongfa]
  const effect = ['', '', '所有灵草生长期永久 −1 天', '收获 +15%（向上取整）', '测验合格时灵气 +1', '灌注效果 +1 天（1 灵气 = +2 天）'][next]
  const ok = g.resources.insight >= 100 && g.resources.contribution >= cost
  return (
    <Modal title="功法进阶" onClose={onClose}>
      <div className="text-sm text-gray-700 space-y-2">
        <p>当前：<b>Lv{g.gongfa}</b>（Lv3 {GONGFA_NAMES[3]} · Lv4 {GONGFA_NAMES[4]} · Lv5 {GONGFA_NAMES[5]}）</p>
        <p>下一级：<b>Lv{next}</b> —— {effect}</p>
        <p className="text-xs text-gray-500">消耗：心得 100{cost ? ` + 贡献 ${cost}` : ''}；心得余额保留</p>
        <div className="flex gap-4 text-xs text-gray-500">
          <span>心得 {g.resources.insight}/100</span>
          <span className={g.resources.contribution < cost ? 'text-error-400' : ''}>贡献 {g.resources.contribution}/{cost}</span>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-5">
        <Btn variant="secondary" onClick={onClose}>关闭</Btn>
        <Btn disabled={!ok} onClick={() => { act({ type: 'GONGFA_UP' }); onClose() }}>进阶</Btn>
      </div>
      {!ok && <p className="text-xs text-error-400 mt-2">心得或贡献不足，完成任务堂可获得心得与贡献。</p>}
    </Modal>
  )
}
