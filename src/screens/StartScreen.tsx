import { REASON_TEXT } from '../components/reasonText'
import { Btn } from '../components/ui'
import { useGameStore } from '../stores/useGameStore'

// 开始画面（ui.md §4.2）：环境图为底；无存档隐藏继续按钮，坏档提供恢复路径
export default function StartScreen() {
  const startNew = useGameStore((s) => s.startNew)
  const continueSaved = useGameStore((s) => s.continueSaved)
  // 只在进入画面时探一次存档存在性（读档本身在点击继续时执行）
  const hasSave = typeof localStorage !== 'undefined' && localStorage.getItem('lingzhiji.save.v1') !== null

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <img src="/assets/environment-spirit-field.svg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />
      <div className="relative z-10 text-center max-w-xl px-6 py-10 bg-gray-50/90 rounded-3xl shadow-lg border border-gray-200">
        <div className="text-[13px] text-gold tracking-[0.42em] mb-3">LINGZHIJI</div>
        <h1 className="font-serif text-5xl text-info-600 tracking-[0.12em] font-bold">灵植记</h1>
        <p className="text-sm text-gray-500 mt-2 tracking-[0.3em]">修仙种田 × 背单词</p>
        <img src="/assets/character-lingzhi-dizi.svg" alt="灵植弟子" className="h-52 mx-auto my-5" />
        <p className="text-sm text-gray-600 leading-relaxed text-left">
          你通过外门试炼，入青云宗成为一名灵植弟子。执事分给你三块下品灵田：
          <span className="text-info-600">「每月灵草定额，少不了你的。其余收成，自去坊市处置。」</span>
        </p>
        <div className="flex justify-center gap-4 mt-7">
          <Btn onClick={startNew} className="!px-8 !py-2.5">开始修行</Btn>
          {hasSave && (
            <Btn variant="secondary" onClick={() => {
              const r = continueSaved()
              if (!r.ok && r.reason && r.reason !== 'NO_SAVE') {
                // 坏档：提示并提供导入入口（设置弹层）或重置
                alert(`${REASON_TEXT[r.reason] ?? '存档无法读取'}。可从开始画面重置，或导入之前导出的存档码。`)
              }
            }} className="!px-8 !py-2.5">
              继续修行
            </Btn>
          )}
        </div>
      </div>
    </div>
  )
}
