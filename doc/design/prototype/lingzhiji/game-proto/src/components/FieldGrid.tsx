import { ReactNode, useState } from 'react'
import { useGame } from '../store'
import { FIELD_CAP } from '../mock'
import { herbById, HERBS } from '../mock'
import { Btn, Modal, Sprite } from './ui'

// 灵田格：空田 / 生长中 / 成熟 / 被收回 四态；空田点击弹出播种弹层
export default function FieldGrid() {
  const s = useGame()
  const [planting, setPlanting] = useState<number | null>(null)
  const cols = Math.min(s.fields.length + (s.fields.length < FIELD_CAP[s.realm] ? 1 : 0), 7)
  const gridCls = ['grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5', 'grid-cols-6', 'grid-cols-7'][cols] ?? 'grid-cols-3'

  return (
    <div className={`grid ${gridCls} gap-4`}>
      {s.fields.map((f) => (
        <FieldCard key={f.id} fid={f.id} onPlant={() => setPlanting(f.id)} />
      ))}
      {s.fields.length < FIELD_CAP[s.realm] && (
        <button
          onClick={() => useGame.getState().reclaimLand()}
          disabled={s.ap < 2}
          title={s.ap < 2 ? '行动力不足（需 2 行动力）' : '开荒 1 块新灵田（2 行动力）'}
          className="min-h-36 rounded-2xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-primary-400 hover:text-primary-500 disabled:cursor-not-allowed disabled:opacity-60 flex flex-col items-center justify-center gap-2"
        >
          <span className="text-2xl">＋</span>
          <span className="text-sm">开荒 · 2 行动力</span>
          <span className="text-xs text-gray-400">上限 {FIELD_CAP[s.realm]} 块</span>
        </button>
      )}
      {planting !== null && <PlantModal fid={planting} onClose={() => setPlanting(null)} />}
    </div>
  )
}

function FieldCard({ fid, onPlant }: { fid: number; onPlant: () => void }) {
  const s = useGame()
  const f = s.fields.find((x) => x.id === fid)!
  const herb = f.herb ? herbById(f.herb) : null
  const eff = herb ? Math.max(1, herb.days - (s.gongfa >= 2 ? 1 : 0)) : 0

  let body: ReactNode
  if (f.status === 'empty') {
    body = (
      <button onClick={onPlant} className="w-full h-full flex flex-col items-center justify-center gap-2 group">
        <Sprite sheet="plot-states-sheet.png" cols={4} rows={1} col={0} size={72} />
        <span className="text-sm text-gray-500 group-hover:text-primary-500">＋ 播种</span>
      </button>
    )
  } else if (f.status === 'growing') {
    const pct = Math.round((f.progress! / eff) * 100)
    const hi = HERBS.findIndex((h) => h.id === f.herb)
    body = (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
        <Sprite sheet="plot-states-sheet.png" cols={4} rows={1} col={f.progress! >= 2 ? 2 : 1} size={72} />
        <div className="flex items-center gap-1.5">
          <Sprite sheet="spirit-herbs-sheet.png" cols={3} rows={2} col={hi % 3} row={Math.floor(hi / 3)} size={18} />
          <span className="text-sm font-medium text-gray-800">{herb!.name}</span>
        </div>
        <div className="w-4/5 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-herb rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs text-gray-500">{f.progress}/{eff} 天 · 产量 {f.curYield}</div>
        {f.dry! > 0 && !f.halved && <div className="text-xs text-warning-500">⚠ 缺水 {f.dry} 天</div>}
        {f.halved && <div className="text-xs text-error-400">已减产</div>}
      </div>
    )
  } else if (f.status === 'mature') {
    body = (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 relative">
        <span className="absolute top-2 right-3 text-gold">✦</span>
        <Sprite sheet="plot-states-sheet.png" cols={4} rows={1} col={3} size={72} />
        <div className="text-sm font-medium text-gray-800">{herb!.name} · 成熟</div>
        <div className="text-xs text-gray-500">产量 {f.curYield}{s.gongfa >= 3 ? '（Lv3 加成后更多）' : ''}</div>
        <Btn onClick={() => useGame.getState().harvest(fid)} disabled={s.ap < 1} variant="gold" className="!py-1.5">
          收获 · 1 行动力
        </Btn>
        {s.ap < 1 && <div className="text-xs text-error-400">行动力不足</div>}
      </div>
    )
  } else {
    body = (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2">
        <span className="text-3xl">🔒</span>
        <div className="text-sm text-gray-700">灵田被收回</div>
        {f.refundSeed && <div className="text-xs text-gray-400">作物已折为 {herbById(f.refundSeed).name}种退还</div>}
        <Btn variant="secondary" onClick={() => useGame.getState().reclaim(fid)} disabled={s.contribution < 100} className="!py-1.5">
          赎回 · 100 贡献
        </Btn>
        {s.contribution < 100 && <div className="text-xs text-error-400">贡献不足（{s.contribution}/100）</div>}
      </div>
    )
  }

  return (
    <div className="relative bg-gray-50 border border-gray-200 rounded-2xl shadow-md min-h-44 p-3 hover:shadow-lg transition-shadow">
      <div className="absolute top-2 left-3 text-[11px] text-gray-400 tracking-widest">{fid} 号田</div>
      {body}
    </div>
  )
}

// 播种弹层：列出全部灵植与可种状态，条件不足保留名称并说明原因
function PlantModal({ fid, onClose }: { fid: number; onClose: () => void }) {
  const s = useGame()
  return (
    <Modal title={`${fid} 号田 · 播种`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {HERBS.map((h, i) => {
          const realmOk = s.realm >= h.realm
          const qiOk = s.qi >= h.qi
          const seedOk = s.seeds[h.id] > 0
          const reason = !realmOk
            ? `需${['练气一层', '练气二层', '练气三层', '练气四层', '练气五层', '练气六层', '练气七层', '练气八层', '练气九层'][h.realm]}`
            : !qiOk
              ? `灵气不足（${s.qi}/${h.qi}），完成任务堂可获得灵气`
              : !seedOk
                ? '种子库存不足 · 可去坊市购买'
                : null
          return (
            <div key={h.id}>
              <div className="flex items-center gap-3 bg-gray-100 rounded-xl px-3 py-2.5">
                <Sprite sheet="spirit-herbs-sheet.png" cols={3} rows={2} col={i % 3} row={Math.floor(i / 3)} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800">{h.name}</div>
                  <div className="text-xs text-gray-500">播种灵气 {h.qi} · 生长期 {h.days} 天 · 收获 {h.yield} 株 · 售 {h.sell} 灵石</div>
                </div>
                <div className="text-xs text-gray-500 whitespace-nowrap">库存 {s.seeds[h.id]}</div>
                <Btn onClick={() => { useGame.getState().plant(fid, h.id); onClose() }} disabled={!!reason} className="!py-1.5">
                  播种
                </Btn>
              </div>
              {reason && <div className="text-xs text-warning-500 mt-1 ml-2">{reason}</div>}
            </div>
          )
        })}
        <p className="text-xs text-gray-500 mt-1">
          播种不消耗行动力；条件不足时不会消耗种子与灵气。
        </p>
      </div>
    </Modal>
  )
}
