import { useState } from 'react'
import { useGame } from '../store'
import { GONGFA_COST, HERBS } from '../mock'
import { Btn, Modal } from './ui'

// 底部行动面板：AP、行动按钮与「结束这一天」门控
export default function ActionPanel() {
  const s = useGame()
  const [gateOpen, setGateOpen] = useState(false)
  const [gongfaOpen, setGongfaOpen] = useState(false)

  const noGrowing = !s.fields.some((f) => f.status === 'growing')
  // 至少一块空田、其余田只能为空或被收回（与正式工程 economy.ts emergencyEligible 同口径）
  const canEmergency =
    s.fields.some((f) => f.status === 'empty') &&
    s.fields.every((f) => f.status === 'empty' || f.status === 'confiscated') &&
    Object.values(s.inventory).every((v) => v === 0) &&
    !HERBS.some((h) => s.realm >= h.realm && s.seeds[h.id] > 0) &&
    s.stones < Math.min(...HERBS.filter((h) => s.realm >= h.realm).map((h) => h.price))

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl shadow-md px-5 py-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 tracking-widest">行动力</span>
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`w-3 h-3 rotate-45 rounded-sm border ${i < s.ap ? 'bg-gold border-warning-400' : 'bg-transparent border-gray-300'}`} />
            ))}
          </span>
          <span className="text-xs text-gray-500">{s.ap}/3</span>
        </div>
        <div className="h-5 w-px bg-gray-200" />
        <Btn onClick={() => useGame.getState().openQuiz()} variant={s.quizDone ? 'secondary' : 'primary'}>
          任务堂 {s.quizDone ? '· 今日已完成 ✓' : '· 今日未完成'}
        </Btn>
        <Btn variant="secondary" onClick={() => useGame.getState().water()} disabled={s.ap < 1 || s.watered}
          title={s.watered ? '今日已浇灌' : '消耗 1 AP，全田今日免缺水'}>
          💧 浇灌
        </Btn>
        <Btn variant="secondary" onClick={() => useGame.getState().irrigate()} disabled={s.qi < 1 || noGrowing}
          title={noGrowing ? '无生长中作物' : '消耗 1 灵气，生长中田 +1 天'}>
          🔮 灌注
        </Btn>
        <Btn variant="secondary" onClick={() => useGame.getState().tuna()} disabled={s.tunaUsed || s.ap < 1}
          title={s.tunaUsed ? '今日已修炼' : '消耗 1 AP，修为 +1'}>
          🧘 吐纳
        </Btn>
        <Btn variant="secondary" onClick={() => useGame.setState({ marketOpen: true })}>🏛 坊市</Btn>
        {s.gongfa < 5 && (
          <Btn variant="secondary" onClick={() => setGongfaOpen(true)}>
            📖 功法 Lv{s.gongfa}
          </Btn>
        )}
        {canEmergency && (
          <Btn variant="gold" onClick={() => useGame.getState().emergencySeed()}>🎁 应急领种</Btn>
        )}
        <div className="ml-auto">
          <Btn variant="gold" onClick={() => (s.quizDone ? useGame.getState().endDay() : setGateOpen(true))}>
            结束这一天 →
          </Btn>
        </div>
      </div>
      {(s.watered || s.tunaUsed) && (
        <div className="text-xs text-gray-400 mt-2">
          {s.watered && '今日已浇灌 ✓ '}
          {s.tunaUsed && '今日已吐纳 ✓'}
        </div>
      )}

      {gateOpen && (
        <Modal title="还不能结束这一天" onClose={() => setGateOpen(false)}>
          <p className="text-sm text-gray-700 leading-relaxed">
            今日任务堂尚未完成。完成 10 题并确认结果后才能推进游戏日，<b>答错也能继续</b>。
          </p>
          <div className="flex justify-end gap-3 mt-5">
            <Btn variant="secondary" onClick={() => setGateOpen(false)}>返回</Btn>
            <Btn onClick={() => { setGateOpen(false); useGame.getState().openQuiz() }}>进入任务堂</Btn>
          </div>
        </Modal>
      )}

      {gongfaOpen && <GongfaModal onClose={() => setGongfaOpen(false)} />}
    </div>
  )
}

// 功法进阶：心得 + 贡献双消耗
function GongfaModal({ onClose }: { onClose: () => void }) {
  const s = useGame()
  const next = s.gongfa + 1
  const cost = GONGFA_COST[s.gongfa]
  const effect = ['', '', '所有灵草生长期永久 −1 天', '收获 +15%（向上取整）', '测验合格时灵气 +1', '灌注效果 +1 天（1 灵气 = +2 天）'][next]
  const ok = s.insight >= 100 && s.contribution >= cost
  return (
    <Modal title="功法进阶" onClose={onClose}>
      <div className="text-sm text-gray-700 space-y-2">
        <p>当前：<b>Lv{s.gongfa}</b>（Lv3 聚灵诀 · Lv4 辨灵术 · Lv5 春霖诀）</p>
        <p>下一级：<b>Lv{next}</b> —— {effect}</p>
        <p className="text-xs text-gray-500">消耗：心得 100{cost ? ` + 贡献 ${cost}` : ''}；心得余额保留</p>
        <div className="flex gap-4 text-xs text-gray-500">
          <span>心得 {s.insight}/100</span>
          <span className={s.contribution < cost ? 'text-error-400' : ''}>贡献 {s.contribution}/{cost}</span>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-5">
        <Btn variant="secondary" onClick={onClose}>关闭</Btn>
        <Btn disabled={!ok} onClick={() => { useGame.getState().upgradeGongfa(); onClose() }}>进阶</Btn>
      </div>
      {!ok && <p className="text-xs text-error-400 mt-2">心得或贡献不足，完成任务堂可获得心得与贡献。</p>}
    </Modal>
  )
}
