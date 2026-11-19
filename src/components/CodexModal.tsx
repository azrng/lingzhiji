import { HERBS, REALM_NAMES } from '../game/constants'
import { convertRate } from '../game/economy'
import type { Herb } from '../game/types'
import { useGameStore } from '../stores/useGameStore'
import { useUiStore } from '../stores/useUiStore'
import { Btn, HerbSprite, Modal } from './ui'

// 灵植图鉴（herb-codex.md §3.4，T56）：只读收集弹层——按境界分组、三态条目（剪影/详情/变异徽记）。
// 无操作不改引擎；解锁口径「获得过」（收获/事件/奇遇入账均算），变异为累计徽记
export default function CodexModal() {
  const setCodexOpen = useUiStore((s) => s.setCodexOpen)
  const g = useGameStore((s) => s.game)

  const unlocked = HERBS.filter((h) => g.codex[h.id].unlocked).length
  const mutated = HERBS.filter((h) => g.codex[h.id].mutants > 0).length
  // 按境界分组（ realms 0-8 升序，空组不显示）
  const realms = [...new Set(HERBS.map((h) => h.realm))].sort((a, b) => a - b)

  return (
    <Modal title="灵植图鉴" onClose={() => setCodexOpen(false)} wide>
      <div className="rounded-xl border border-gold bg-gold-pale px-4 py-3 text-sm text-gold-ink flex items-center justify-between">
        <span>收集 <b>{unlocked} / {HERBS.length}</b> 种灵植</span>
        <span className={mutated === 0 ? 'opacity-50' : ''}>✨ 变异 <b>{mutated} / {HERBS.length}</b> 种</span>
      </div>
      <div className="flex flex-col gap-4 mt-4 max-h-96 overflow-y-auto pr-1">
        {realms.map((r) => (
          <div key={r}>
            <div className="text-xs text-gray-500 tracking-widest mb-1.5">{REALM_NAMES[r]}</div>
            <div className="flex flex-col gap-1.5">
              {HERBS.filter((h) => h.realm === r).map((h) => <CodexRow key={h.id} herb={h} />)}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between items-center mt-5">
        <p className="text-xs text-gray-400">获得任意一株即解锁条目；变异株在收获时随机涌现（灵田异变可保底）</p>
        <Btn variant="secondary" onClick={() => setCodexOpen(false)}>关闭</Btn>
      </div>
    </Modal>
  )
}

function CodexRow({ herb }: { herb: Herb }) {
  const g = useGameStore((s) => s.game)
  const c = g.codex[herb.id]
  if (!c.unlocked) {
    // 未解锁：剪影 + 名称保密（灰度处理，不造独立素材）
    return (
      <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2 opacity-60" title="尚未获得，解锁后查看详情">
        <span className="grayscale"><HerbSprite herb={herb} size={34} /></span>
        <div className="flex-1 text-sm text-gray-400">？？？</div>
        <div className="text-xs text-gray-300">{REALM_NAMES[herb.realm]}</div>
      </div>
    )
  }
  const trait = [
    herb.nitrogen && '固氮', herb.wet && '喜湿', herb.shade && '喜阴', herb.insectWard && '驱虫', herb.deepRoot && '深根', herb.allSeason && '灵韵',
  ].filter(Boolean).join(' / ') || '无特质'
  return (
    <div className="flex items-center gap-3 rounded-xl bg-gray-100 px-3 py-2">
      <HerbSprite herb={herb} size={34} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 flex items-center gap-2">
          {herb.name}
          {c.mutants > 0 && <span className="text-xs text-gold-ink" title="收获过的变异株累计">✨×{c.mutants}</span>}
        </div>
        <div className="text-xs text-gray-500 truncate">
          {trait} · {herb.seasons.length === 0 ? '全季' : '适播 ' + herb.seasons.length + ' 季'} · {herb.days} 天 · 卖 {herb.sell} 灵石
        </div>
      </div>
      <div className="text-xs text-gray-400 shrink-0">已收 {c.harvested} 株 · 折算 {convertRate(herb)}</div>
    </div>
  )
}
