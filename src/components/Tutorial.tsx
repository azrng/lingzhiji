import { useGameStore } from '../stores/useGameStore'
import { useUiStore } from '../stores/useUiStore'
import { Btn, useModalFocus } from './ui'

// 新手引导（ui.md §4.3）：3 步 overlay；完成或跳过落档 tutorialDone 不再显示
const STEPS = [
  {
    title: '先去任务堂',
    text: '完成 10 题背词任务即算打卡，答错也能继续；资源奖励每个现实日一次。合格可得 3 点灵气，足够种满初始三块青灵草。',
  },
  {
    title: '播种的条件',
    text: '点击空田播种：需要达到灵植所需境界并消耗对应灵气。开局可种青灵草与凝露花。',
  },
  {
    title: '首月定额免罚',
    text: '每月月末需缴纳青灵草 ×15 株（可按折算代替）。首月是适应期，未缴足不处罚；第 2 月起欠缴会扣贡献与灵石。',
  },
]

export default function Tutorial() {
  const dialogRef = useRef<HTMLDivElement>(null)
  useModalFocus(dialogRef)
  const step = useUiStore((s) => s.tutorialStep)
  const setStep = useUiStore((s) => s.setTutorialStep)
  const act = useGameStore((s) => s.act)
  if (step <= 0) return null
  const cur = STEPS[step - 1]
  const finish = () => {
    act({ type: 'TUTORIAL_DONE' })
    setStep(0)
  }
  return (
    <div className="fixed inset-0 z-[55] bg-gray-900/50 flex items-center justify-center p-4">
      <div ref={dialogRef} data-game-modal tabIndex={-1} role="dialog" aria-modal="true" aria-label="入门指引" className="bg-gray-50 rounded-2xl shadow-lg max-w-md w-full p-7">
        <div className="text-xs text-gold tracking-[0.3em] mb-2">入门指引 {step}/3</div>
        <h3 className="font-serif text-xl text-info-600 tracking-wider mb-3">{cur.title}</h3>
        <p className="text-sm text-gray-700 leading-relaxed">{cur.text}</p>
        <div className="flex items-center justify-between mt-6">
          <button onClick={finish} className="text-xs text-gray-400 hover:text-gray-600">跳过指引</button>
          <div className="flex items-center gap-2">
            {STEPS.map((_, i) => (
              <span key={i} className={`w-2 h-2 rounded-full ${i < step ? 'bg-gold' : 'bg-gray-300'}`} />
            ))}
            <Btn className="ml-3" onClick={() => (step === 3 ? finish() : setStep(step + 1))}>
              {step === 3 ? '开始修行' : '下一步'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
import { useRef } from 'react'
