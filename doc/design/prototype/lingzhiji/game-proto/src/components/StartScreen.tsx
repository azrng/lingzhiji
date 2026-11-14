import { useGame } from '../store'
import { Btn } from './ui'

// 开始画面：环境图为底，立绘与引子居中
export default function StartScreen() {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <img src="/assets/environment-spirit-field.svg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />
      <div className="relative z-10 text-center max-w-xl px-6 py-10 bg-gray-50/90 rounded-3xl shadow-lg border border-gray-200">
        <div className="text-[13px] text-gold tracking-[0.42em] mb-3">LINGZHIJI · PROTOTYPE</div>
        <h1 className="font-serif text-5xl text-info-600 tracking-[0.12em] font-bold">灵植记</h1>
        <p className="text-sm text-gray-500 mt-2 tracking-[0.3em]">修仙种田 × 背单词 · 交互原型</p>
        <img src="/assets/character-lingzhi-dizi.svg" alt="灵植弟子" className="h-52 mx-auto my-5" />
        <p className="text-sm text-gray-600 leading-relaxed text-left">
          你通过外门试炼，入青云宗成为一名灵植弟子。执事分给你三块下品灵田：
          <span className="text-info-600">「每月灵草定额，少不了你的。其余收成，自去坊市处置。」</span>
        </p>
        <div className="flex justify-center gap-4 mt-7">
          <Btn onClick={() => useGame.getState().start()} className="!px-8 !py-2.5">开始修行</Btn>
          <Btn variant="secondary" onClick={() => useGame.getState().start()} className="!px-8 !py-2.5">
            继续修行（示例存档）
          </Btn>
        </div>
        <p className="text-xs text-gray-400 mt-5">原型无真实存档；「继续修行」同样从第 1 月第 1 天开始</p>
      </div>
    </div>
  )
}
