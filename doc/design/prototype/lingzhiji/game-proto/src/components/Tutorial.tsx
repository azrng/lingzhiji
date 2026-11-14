import { useGame } from '../store'
import { Btn } from './ui'

// 新手引导：3 步 overlay，跳过或完成后不再显示
const STEPS = [
  {
    title: '先去任务堂',
    text: '完成 10 题背词任务才能推进游戏日，答错也能继续。合格可得 3 点灵气，足够种满初始三块青灵草。',
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
  const step = useGame((s) => s.tutorialStep)
  if (!step) return null
  const cur = STEPS[step - 1]
  return (
    <div className="fixed inset-0 z-[55] bg-gray-900/50 flex items-center justify-center p-4">
      <div className="bg-gray-50 rounded-2xl shadow-lg max-w-md w-full p-7">
        <div className="text-xs text-gold tracking-[0.3em] mb-2">入门指引 {step}/3</div>
        <h3 className="font-serif text-xl text-info-600 tracking-wider mb-3">{cur.title}</h3>
        <p className="text-sm text-gray-700 leading-relaxed">{cur.text}</p>
        <div className="flex items-center justify-between mt-6">
          <button onClick={() => useGame.setState({ tutorialStep: 0 })} className="text-xs text-gray-400 hover:text-gray-600">跳过指引</button>
          <div className="flex items-center gap-2">
            {STEPS.map((_, i) => (
              <span key={i} className={`w-2 h-2 rounded-full ${i < step ? 'bg-gold' : 'bg-gray-300'}`} />
            ))}
            <Btn className="ml-3" onClick={() => useGame.setState({ tutorialStep: step === 3 ? 0 : step + 1 })}>
              {step === 3 ? '开始修行' : '下一步'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
