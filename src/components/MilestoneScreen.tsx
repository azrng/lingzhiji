import { monthOf } from '../game/economy'
import { characterImage } from '../game/characters'
import { LIBS } from '../game/wordbank'
import { useGameStore } from '../stores/useGameStore'
import { Btn } from './ui'

// 筑基结算（progression.md §3.4）：一次性全屏成绩单；恢复后未标记仍会重新展示
export default function MilestoneScreen() {
  const g = useGameStore((s) => s.game)
  const act = useGameStore((s) => s.act)
  const c4 = g.learning.libs.cet4
  const c6 = g.learning.libs.cet6
  return (
    <div className="fixed inset-0 z-[65] bg-info-600 overflow-y-auto">
      <img src="/assets/breakthrough-aura.png" alt="" className="absolute inset-0 w-full h-full object-cover opacity-80" />
      <div className="relative z-10 max-w-xl mx-auto min-h-full flex flex-col items-center justify-center px-6 py-12">
        <div className="text-[12px] text-gold-pale tracking-[0.42em] mb-3">FOUNDATION ESTABLISHED</div>
        <h1 className="font-serif text-5xl text-gold-pale tracking-[0.14em] font-bold">突破筑基</h1>
        <img src={characterImage(g.characterId)} alt="" className="h-44 my-6 drop-shadow-lg" />
        <div className="w-full bg-gray-50/95 rounded-2xl shadow-lg p-6 text-sm text-gray-700 flex flex-col gap-2">
          <div className="font-serif text-lg text-info-600 tracking-widest mb-1">本局成绩单</div>
          <Row k="入宗时长" v={`${g.day} 个游戏日（第 ${monthOf(g.day)} 月）`} />
          <Row k="修为" v={`${g.cultivation}（累计，不清零）`} />
          <Row k="功法" v={`Lv${g.gongfa}`} />
          <Row k="灵田" v={`${g.fields.length} 块`} />
          <Row k="四级词库" v={`任务 ${c4.sessions} 次 · 作答 ${c4.attempts} 词次 · 学过 ${c4.distinctWords.length}/${LIBS.cet4.length} 词 · 首答正确率 ${pct(c4.firstCorrect)}`} />
          <Row k="六级词库" v={`任务 ${c6.sessions} 次 · 作答 ${c6.attempts} 词次 · 学过 ${c6.distinctWords.length}/${LIBS.cet6.length} 词 · 错词池 ${c6.wrongQueue.length}`} />
          <Row k="定额" v={g.month.ledger.length ? g.month.ledger.map((l) => `第${l.month}月${l.paid ? '缴' : '欠'}`).join('、') : '尚无结算记录'} />
          <p className="text-xs text-gray-400 mt-2">学习数据用于回顾，不代表单词掌握程度。</p>
        </div>
        <div className="mt-7">
          <Btn variant="gold" className="!px-10 !py-3" onClick={() => act({ type: 'MILESTONE_SHOWN' })}>
            继续修行（本版无后续境界）
          </Btn>
        </div>
      </div>
    </div>
  )
}

const pct = (r: { hit: number; total: number }) => (r.total === 0 ? '—' : `${Math.round((r.hit / r.total) * 100)}%`)

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 pb-1.5">
      <span className="text-gray-500 flex-none">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  )
}
