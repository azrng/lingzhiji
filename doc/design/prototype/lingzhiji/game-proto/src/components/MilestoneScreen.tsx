import { monthOf, useGame } from '../store'
import { Btn } from './ui'

// 筑基结算：一次性全屏成绩单，关闭后继续现有循环
export default function MilestoneScreen() {
  const s = useGame()
  return (
    <div className="fixed inset-0 z-[65] bg-info-600 overflow-y-auto">
      <img src="/assets/breakthrough-aura.png" alt="" className="absolute inset-0 w-full h-full object-cover opacity-80" />
      <div className="relative z-10 max-w-xl mx-auto min-h-full flex flex-col items-center justify-center px-6 py-12">
        <div className="text-[12px] text-gold-pale tracking-[0.42em] mb-3">FOUNDATION ESTABLISHED</div>
        <h1 className="font-serif text-5xl text-gold-pale tracking-[0.14em] font-bold">突破筑基</h1>
        <img src={`/assets/character-${s.characterId}-v2.png`} alt="" className="h-44 my-6 drop-shadow-lg" />
        <div className="w-full bg-gray-50/95 rounded-2xl shadow-lg p-6 text-sm text-gray-700 flex flex-col gap-2">
          <div className="font-serif text-lg text-info-600 tracking-widest mb-1">本局成绩单</div>
          <Row k="入宗时长" v={`${s.day} 个游戏日（第 ${monthOf(s.day)} 月）`} />
          <Row k="修为" v={`${s.cultivation}（累计，不清零）`} />
          <Row k="功法" v={`Lv${s.gongfa}`} />
          <Row k="灵田" v={`${s.fields.length} 块`} />
          <Row k="作答单词" v={`${s.answeredWords.length} 个（四级示例库）`} />
          <Row k="错词池" v={`${s.wrongQueue.length} 个待复习`} />
          <Row k="定额" v={s.quotaPaidLast ?? '尚无结算记录'} />
          <p className="text-xs text-gray-400 mt-2">学习数据用于回顾，不代表单词掌握程度。</p>
        </div>
        <div className="mt-7">
          <Btn variant="gold" className="!px-10 !py-3" onClick={() => useGame.getState().closeOverlay('milestone')}>
            继续修行（本版无后续境界）
          </Btn>
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 pb-1.5">
      <span className="text-gray-500 flex-none">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  )
}
