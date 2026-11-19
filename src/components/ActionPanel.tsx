import { useState } from 'react'
import { GONGFA_COST, GONGFA_NAMES } from '../game/constants'
import { emergencyEligible } from '../game/economy'
import { dueCount } from '../game/srs'
import { REASON_TEXT } from './reasonText'
import { useGameStore } from '../stores/useGameStore'
import { useUiStore } from '../stores/useUiStore'
import { Btn, Modal } from './ui'

// 底部行动面板：AP 与行动按钮（core-loop.md；T49 后 END_DAY 不再门控任务堂，奖励锚现实日）
export default function ActionPanel() {
  const g = useGameStore((s) => s.game)
  const act = useGameStore((s) => s.act)
  const setQuizOpen = useUiStore((s) => s.setQuizOpen)
  const setMeditateOpen = useUiStore((s) => s.setMeditateOpen)
  const setMarketOpen = useUiStore((s) => s.setMarketOpen)
  const setCommissionOpen = useUiStore((s) => s.setCommissionOpen)
  const setWarehouseOpen = useUiStore((s) => s.setWarehouseOpen)
  const setCodexOpen = useUiStore((s) => s.setCodexOpen)
  const [gongfaOpen, setGongfaOpen] = useState(false)
  const [failHint, setFailHint] = useState<string | null>(null)

  const noGrowing = !g.fields.some((f) => f.status === 'growing')
  const canEmergency = emergencyEligible(g)

  // 带失败提示的行动：reason 转文案短暂显示在面板底部
  const tryAct = (run: () => { ok: boolean; reason?: string }) => {
    const r = run()
    setFailHint(r.ok ? null : (r.reason ? REASON_TEXT[r.reason] ?? r.reason : '无法执行'))
    if (!r.ok) setTimeout(() => setFailHint(null), 2500)
  }

  return (
    <section className="bg-gray-50/95 border border-gray-50 rounded-3xl shadow-lg px-5 py-5 sm:px-7">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
        <div><h2 className="font-serif text-xl tracking-widest text-info-600">今日修行</h2><p className="mt-1 text-xs text-gray-600">照料灵田，积累修为</p></div>
        <div className="flex items-center gap-2 rounded-full bg-warning-50 px-4 py-2" title="每日 3 点、次日回满：浇灌/吐纳/收获各 1 点，开荒 2 点；坊市、播种、灌注不消耗">
          <span className="text-xs text-gray-600 tracking-widest">行动力</span>
          <span className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`w-3 h-3 rotate-45 rounded-sm border ${i < g.ap ? 'bg-gold border-warning-400' : 'bg-transparent border-gray-300'}`} />
            ))}
          </span>
          <span className="text-sm font-semibold text-gold-ink">{g.ap}/3</span>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <Btn className="!min-h-11 !px-5" onClick={() => setQuizOpen(true)} variant={g.quizDaily.done ? 'secondary' : 'primary'}
          title="10 道背词题：合格 +3 灵气 +5 贡献 +8 心得（满分心得再 +4）；资源奖励每个现实日一次，加练只更新复习计划">
          任务堂 {g.quizDaily.done ? '· 今日奖励已领 ✓' : '· 今日可领奖励'}
          {!g.quizDaily.done && dueCount(g.learning.cards, g.realDay.today) > 0 && (
            <span className="ml-2 text-xs bg-warning-50 text-warning-500 border border-warning-200 rounded-full px-2 py-0.5">
              📖 今日到期 {dueCount(g.learning.cards, g.realDay.today)} 词
            </span>
          )}
        </Btn>
        <Btn className="!min-h-11" variant="secondary" onClick={() => tryAct(() => act({ type: 'WATER' }))} disabled={g.ap < 1 || g.wateredToday || noGrowing}
          title={g.wateredToday ? '今日已浇灌' : g.ap < 1 ? REASON_TEXT.NO_AP : noGrowing ? REASON_TEXT.NO_CROP : '消耗 1 行动力，全田今日免缺水；缺水累计第 3 天会减产'}>
          浇灌 <span className="text-xs opacity-70">1 行动力</span>
        </Btn>
        <Btn className="!min-h-11" variant="secondary" onClick={() => tryAct(() => act({ type: 'IRRIGATE' }))} disabled={g.resources.qi < 1 || noGrowing}
          title={noGrowing ? REASON_TEXT.NO_CROP : g.resources.qi < 1 ? REASON_TEXT.NO_QI : '消耗 1 灵气，加速生长中灵田'}>
          灌注 <span className="text-xs opacity-70">1 灵气</span>
        </Btn>
        <Btn className="!min-h-11" variant="secondary" onClick={() => tryAct(() => act({ type: 'TUNA' }))} disabled={g.tunaUsedToday || g.ap < 1}
          title={g.tunaUsedToday ? '今日已修炼' : g.ap < 1 ? REASON_TEXT.NO_AP : '消耗 1 行动力，修为 +1'}>
          吐纳 <span className="text-xs opacity-70">1 行动力</span>
        </Btn>
        <Btn className="!min-h-11" variant="secondary" onClick={() => setMarketOpen(true)} title="买卖种子、灵草与残卷，不消耗行动力">坊市</Btn>
        <Btn className="!min-h-11" variant="secondary" onClick={() => setWarehouseOpen(true)}
          title="查看成品灵草库存与定额储备折算；出售请去坊市">仓库</Btn>
        <Btn className="!min-h-11" variant="secondary" onClick={() => setCodexOpen(true)}
          title="灵植图鉴：收集进度、灵草详情与变异记录（只读）">图鉴</Btn>
        <Btn className="!min-h-11" variant="secondary" onClick={() => setMeditateOpen(true)}
          title="入定快进 N 天：灵田照常生长，但无法浇灌；月末自动出关">入定</Btn>
        <Btn className="!min-h-11" variant="secondary" onClick={() => setCommissionOpen(true)}
          title="灵植堂委托：交付灵草换奖励，不消耗行动力；每月最多接取 1 份">灵植堂</Btn>
        <Btn className="!min-h-11" variant="secondary" onClick={() => setGongfaOpen(true)} title="查看功法加成；攒足心得与贡献可进阶">
          功法 Lv{g.gongfa}
        </Btn>
        {canEmergency && (
          <Btn className="!min-h-11" variant="gold" onClick={() => tryAct(() => act({ type: 'EMERGENCY_SEED' }))}
            title="山穷水尽的救助：库存清空且无种可播时，领 1 枚青灵草种子">应急领种</Btn>
        )}
        <div className="ml-auto">
          <Btn className="!min-h-11 !px-5" variant="gold" onClick={() => tryAct(() => act({ type: 'END_DAY' }))}
            title="结算当日并进入次日；不要求任务堂（测验奖励锚现实日）">
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

      {gongfaOpen && <GongfaModal onClose={() => setGongfaOpen(false)} />}
    </section>
  )
}

// 功法进阶：心得 + 贡献双消耗（quiz.md §3.5）
function GongfaModal({ onClose }: { onClose: () => void }) {
  const g = useGameStore((s) => s.game)
  const act = useGameStore((s) => s.act)
  const next = g.gongfa + 1
  const maxed = g.gongfa >= 5
  const cost = GONGFA_COST[g.gongfa]
  const effect = ['', '', '所有灵草生长期永久 −1 天', '收获 +15%（向上取整）', '测验合格时灵气 +1', '灌注效果 +1 天（1 灵气 = +2 天）'][next]
  const ok = !maxed && g.resources.insight >= 100 && g.resources.contribution >= cost
  return (
    <Modal title="功法进阶" onClose={onClose}>
      <div className="text-sm text-gray-700 space-y-2">
        <p>当前：<b>Lv{g.gongfa}</b>（Lv3 {GONGFA_NAMES[3]} · Lv4 {GONGFA_NAMES[4]} · Lv5 {GONGFA_NAMES[5]}）</p>
        {maxed ? <p>功法已修至最高等级。</p> : <p>下一级：<b>Lv{next}</b> —— {effect}</p>}
        {!maxed && <p className="text-xs text-gray-500">消耗：心得 100{cost ? ` + 贡献 ${cost}` : ''}；心得余额保留</p>}
        {!maxed && <div className="flex gap-4 text-xs text-gray-500">
          <span>心得 {g.resources.insight}/100</span>
          <span className={g.resources.contribution < cost ? 'text-error-400' : ''}>贡献 {g.resources.contribution}/{cost}</span>
        </div>}
      </div>
      <div className="flex justify-end gap-3 mt-5">
        <Btn variant="secondary" onClick={onClose}>关闭</Btn>
        {!maxed && <Btn disabled={!ok} onClick={() => { act({ type: 'GONGFA_UP' }); onClose() }}>进阶</Btn>}
      </div>
      {!ok && !maxed && <p className="text-xs text-error-400 mt-2">心得或贡献不足，完成任务堂可获得心得与贡献。</p>}
    </Modal>
  )
}
