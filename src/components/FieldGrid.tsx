import { ReactNode, useState } from 'react'
import { setHarvestAnchor } from '../fx'
import { FIELD_CAP, HERBS, HERB_BY_ID, REALM_NAMES } from '../game/constants'
import { monthOf } from '../game/economy'
import { effDays, seasonAdj, shadeAdj } from '../game/farming'
import { REASON_TEXT } from './reasonText'
import { useGameStore } from '../stores/useGameStore'
import { Btn, Modal, Sprite } from './ui'

// 灵田格：空田 / 生长中 / 成熟 / 被收回 四态；空田点击弹出播种弹层
export default function FieldGrid() {
  const g = useGameStore((s) => s.game)
  const act = useGameStore((s) => s.act)
  const [planting, setPlanting] = useState<number | null>(null)
  const hasConfiscated = g.fields.some((field) => field.status === 'confiscated')
  const reclaimReason = hasConfiscated ? '请先赎回被收回的灵田' : g.ap < 2 ? REASON_TEXT.NO_AP : null
  const growing = g.fields.filter((field) => field.status === 'growing').length
  const mature = g.fields.filter((field) => field.status === 'mature').length

  return (
    <section className="field-garden rounded-3xl border border-primary-200/80 p-4 sm:p-5 lg:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[.2em] text-primary-700">青云宗 · 灵植堂</p>
          <h1 className="mt-1 font-serif text-3xl tracking-widest text-primary-900">我的灵田</h1>
          <p className="mt-1 text-sm text-gray-700">一方灵土，静待草木生长。</p>
        </div>
        <div className="rounded-full border border-primary-200 bg-gray-50/90 px-4 py-2 text-xs text-primary-800">
          灵田 {g.fields.length} / {FIELD_CAP[g.realm]} · 生长 {growing} · 待收 {mature}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {g.fields.map((f) => (
          <FieldCard key={f.id} fid={f.id} onPlant={() => setPlanting(f.id)} />
        ))}
        {g.fields.length < FIELD_CAP[g.realm] && (
          <button
            onClick={() => act({ type: 'RECLAIM_LAND' })}
            disabled={!!reclaimReason}
            title={reclaimReason ?? '开荒 1 块新灵田（2 行动力）'}
            className="min-h-52 rounded-2xl border-2 border-dashed border-primary-300 bg-gray-50/50 text-primary-700 hover:bg-gray-50/80 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-2"
          >
            <span className="text-2xl">＋</span>
            <span className="text-sm">开荒 · 2 行动力</span>
            <span className="text-xs text-gray-600">{reclaimReason ?? `上限 ${FIELD_CAP[g.realm]} 块`}</span>
          </button>
        )}
        {planting !== null && <PlantModal fid={planting} onClose={() => setPlanting(null)} />}
      </div>
    </section>
  )
}

function FieldCard({ fid, onPlant }: { fid: number; onPlant: () => void }) {
  const g = useGameStore((s) => s.game)
  const act = useGameStore((s) => s.act)
  const f = g.fields.find((x) => x.id === fid)!
  const herb = f.herb ? HERB_BY_ID[f.herb] : null
  const eff = f.herb ? effDays(f.herb, g.gongfa) : 0
  const herbIdx = f.herb ? HERBS.findIndex((h) => h.id === f.herb) : 0
  const herbPortrait = herb && (
    <span className="absolute right-3 top-3 overflow-hidden rounded-full border-2 border-gray-50 shadow-md" aria-label={herb.name} role="img">
      <Sprite sheet="spirit-herbs-sheet.png" cols={3} rows={2} col={herbIdx % 3} row={Math.floor(herbIdx / 3)} size={52} />
    </span>
  )

  let body: ReactNode
  if (f.status === 'empty') {
    body = (
      <button onClick={onPlant} aria-label={`${fid} 号灵田，选择种子`} className="w-full h-full min-h-44 flex flex-col items-center justify-center gap-1 group rounded-xl focus-visible:outline-2 focus-visible:outline-primary-600">
        <Sprite sheet="plot-states-sheet.png" cols={2} rows={2} col={0} row={0} size={136} />
        <span className="rounded-full border border-primary-200 bg-primary-50 px-4 py-1.5 text-sm text-primary-700 group-hover:bg-primary-100">＋ 选择种子</span>
      </button>
    )
  } else if (f.status === 'growing') {
    const pct = Math.round((f.progress! / eff) * 100)
    body = (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
        {herbPortrait}
        <Sprite sheet="plot-states-sheet.png" cols={2} rows={2} col={f.progress! / eff >= 0.5 ? 0 : 1} row={f.progress! / eff >= 0.5 ? 1 : 0} size={140} />
        <div className="flex items-center gap-1.5">
          <Sprite sheet="spirit-herbs-sheet.png" cols={3} rows={2} col={herbIdx % 3} row={Math.floor(herbIdx / 3)} size={18} />
          <span className="text-sm font-medium text-gray-800">{herb!.name}</span>
        </div>
        <div className="w-4/5 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-herb rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs text-gray-600">生长 {f.progress}/{eff} 天 · 预计产量 {f.curYield} 株</div>
        <div className="text-xs text-primary-700">{g.wateredToday ? '今日已浇灌' : '今日尚未浇灌'}</div>
        {f.dry! > 0 && !f.halved && <div className="text-xs text-warning-500" title="未浇灌日累计：连续缺水第 3 天产量减半一次；浇灌后清零（凝露花喜湿免疫）">⚠ 缺水 {f.dry} 天</div>}
        {f.halved && <div className="text-xs text-error-400">已减产</div>}
      </div>
    )
  } else if (f.status === 'mature') {
    body = (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 relative">
        {herbPortrait}
        {/* 成熟摇摆：仅待收状态，田格间按 id 错相（motion-pack.md §3.3） */}
        <span className="fx-sway" style={{ animationDelay: `${(((fid * 7) % 35) / 10).toFixed(1)}s` }}>
          <Sprite sheet="plot-states-sheet.png" cols={2} rows={2} col={1} row={1} size={140} />
        </span>
        <div className="text-sm font-medium text-gray-800">{herb!.name} · 成熟</div>
        <div className="text-xs text-gray-500">产量 {f.curYield}{g.gongfa >= 3 ? '（收获另有加成）' : ''}</div>
        <Btn
          // 先记锚点再 dispatch：粒子/飘字定位到这块田（fx.ts，motion-pack.md §3.2）
          onClick={(e) => {
            setHarvestAnchor(e.currentTarget)
            act({ type: 'HARVEST', fieldId: fid })
          }}
          disabled={g.ap < 1}
          variant="gold"
          className="!py-1.5"
        >
          收获 · 1 行动力
        </Btn>
        {g.ap < 1 && <div className="text-xs text-error-400">{REASON_TEXT.NO_AP}</div>}
      </div>
    )
  } else {
    body = (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2">
        <span className="text-3xl">🔒</span>
        <div className="text-sm text-gray-700">灵田被收回</div>
        {f.refundSeed && <div className="text-xs text-gray-400">作物已折为 {HERB_BY_ID[f.refundSeed].name}种退还</div>}
        <Btn variant="secondary" onClick={() => act({ type: 'RECLAIM', fieldId: fid })} disabled={g.resources.contribution < 100} className="!py-1.5">
          赎回 · 100 贡献
        </Btn>
        {g.resources.contribution < 100 && (
          <div className="text-xs text-error-400">贡献不足（{g.resources.contribution}/100）</div>
        )}
      </div>
    )
  }

  return (
    <div className="relative bg-gray-50/90 border border-gray-50 rounded-2xl shadow-md min-h-52 p-3 hover:shadow-lg transition-shadow">
      {/* 田属性行（farming-depth.md §3.2/§3.3）：地力点 + 上茬记忆 + 喜阴相生徽章 */}
      <div className="absolute top-4 left-4 text-xs text-gray-600 tracking-widest">
        {fid} 号灵田
        <span className="ml-1.5 text-primary-600" title={`地力：${['贫瘠', '常沃', '肥沃'][f.fertility]}`}>
          {'●'.repeat(f.fertility)}{'○'.repeat(2 - f.fertility)}
        </span>
        {f.lastCrop && (
          <span className="ml-1.5 text-gray-400" title={`轮作提示：换种不同灵草可养地（换固氮的青灵草地力 +1）；连作同草地力 −1（青灵草、深根的龙血藤除外）`}>
            上茬 {HERB_BY_ID[f.lastCrop].name}
          </span>
        )}
        {f.status !== 'empty' && f.status !== 'confiscated' && f.herb && shadeAdj(g.fields, f.id, f.herb) > 0 && (
          <span className="ml-1.5 rounded-md border border-gold px-1 text-[10px] text-gold-ink fx-glow-gold" title="喜阴灵草邻着高秆灵草（赤髓参/龙血藤/九叶莲），本茬预计产量 +1">相生</span>
        )}
      </div>
      {body}
    </div>
  )
}

// 播种弹层：全部灵植与可种状态，条件不足保留名称并说明原因（farming.md §4）
function PlantModal({ fid, onClose }: { fid: number; onClose: () => void }) {
  const g = useGameStore((s) => s.game)
  const act = useGameStore((s) => s.act)
  return (
    <Modal title={`${fid} 号田 · 播种`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {HERBS.map((h, i) => {
          const reason =
            g.realm < h.realm
              ? `需${REALM_NAMES[h.realm]}`
              : g.resources.qi < h.qi
                ? `灵气不足（${g.resources.qi}/${h.qi}），完成任务堂可获得灵气`
                : g.seeds[h.id] < 1
                  ? '种子库存不足 · 可去坊市购买'
                  : null
          // 特质与物候（farming-depth.md §3.1/§3.4）：特质名 + 当季播种种窗提示
          const traits = [
            h.nitrogen && '固氮', h.wet && '喜湿', h.shade && '喜阴', h.insectWard && '驱虫', h.deepRoot && '深根', h.allSeason && '灵韵',
          ].filter(Boolean).join(' · ')
          const sAdj = seasonAdj(h.id, monthOf(g.day))
          const seasonTag = h.allSeason ? '全季' : sAdj > 0 ? '当令 +1' : '反季 −1'
          return (
            <div key={h.id}>
              <div className="flex items-start gap-3 bg-gray-100 rounded-xl px-3 py-3 sm:items-center">
                <Sprite sheet="spirit-herbs-sheet.png" cols={3} rows={2} col={i % 3} row={Math.floor(i / 3)} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium text-gray-800">{h.name}</span>
                    <span
                      className={`text-[11px] px-1 rounded ${h.allSeason ? 'text-gold-ink border border-gold' : sAdj > 0 ? 'text-success-500 bg-success-50' : 'text-error-500 bg-error-50'}`}
                      title={h.allSeason ? '任何季节播种产量不变' : sAdj > 0 ? '当季播种：预计产量 +1 株' : '反季播种：预计产量 −1 株'}
                    >{seasonTag}</span>
                    <span className="text-xs text-gray-600">库存 {g.seeds[h.id]}</span>
                  </div>
                  {traits && (
                    <div className="mt-0.5 text-[11px] text-primary-600" title="固氮：轮作换种可 +1 地力 · 喜湿：免疫缺水减产 · 喜阴：邻高秆草产量 +1 · 驱虫：护邻田免产量灾 · 深根：连作不耗地力 · 灵韵：全季适播">
                      特质：{traits}
                    </div>
                  )}
                  <div className="mt-1 text-xs leading-5 text-gray-600">灵气 {h.qi} · 生长 {effDays(h.id, g.gongfa)} 天<br />收获 {h.yield} 株 · 售价 {h.sell} 灵石</div>
                </div>
                <Btn onClick={() => { act({ type: 'PLANT', fieldId: fid, herb: h.id }); onClose() }} disabled={!!reason} className="!min-h-11 !px-3">
                  播种
                </Btn>
              </div>
              {reason && <div className="text-xs text-warning-500 mt-1 ml-2">{reason}</div>}
            </div>
          )
        })}
        <p className="text-xs text-gray-500 mt-1">播种不消耗行动力；条件不足时不会消耗种子与灵气。</p>
      </div>
    </Modal>
  )
}
