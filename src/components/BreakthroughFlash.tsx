import { useEffect } from 'react'
import { FIELD_CAP, HERBS } from '../game/constants'
import { useGameStore } from '../stores/useGameStore'
import { useUiStore } from '../stores/useUiStore'

// 突破演出（T61 P1-a / T63）：全屏金光一瞬 + 境界名 + 新境界解锁预告，2.8s 自动关闭或点击跳过。
// 主成长轴的仪式时刻——减配版 MilestoneScreen（筑基结算仍走全屏成绩单，两者不冲突）
export default function BreakthroughFlash() {
  const flash = useUiStore((s) => s.flash)
  const dismissFlash = useUiStore((s) => s.dismissFlash)
  const realm = useGameStore((s) => s.game.realm)

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(dismissFlash, 2800)
    return () => clearTimeout(t)
  }, [flash, dismissFlash])

  if (!flash) return null
  // 此刻 game.realm 已是新境界：解锁预告 = 新境界可种草 + 灵田上限变化
  const unlocked = HERBS.filter((h) => h.realm === realm)
  const fieldsDelta = realm > 0 ? FIELD_CAP[realm] - FIELD_CAP[realm - 1] : 0
  return (
    <div
      role="status"
      aria-label={`突破${flash.realmName}`}
      onClick={dismissFlash}
      className="fixed inset-0 z-[80] flex cursor-pointer flex-col items-center justify-center gap-4 fx-breakthrough-back"
      style={{ background: 'radial-gradient(ellipse at center, color-mix(in srgb, var(--color-gold) 26%, transparent) 0%, color-mix(in srgb, var(--color-gold) 10%, transparent) 42%, transparent 78%)' }}
    >
      <p className="text-xs tracking-[0.5em] text-gold-ink">水到渠成</p>
      <p className="fx-breakthrough-text font-serif text-5xl tracking-widest text-gold-ink">{flash.realmName}</p>
      <div className="fx-breakthrough-text mt-2 flex flex-col items-center gap-1 text-sm text-gray-700">
        {unlocked.length > 0 && <p>解锁灵植：{unlocked.map((h) => h.name).join('、')}</p>}
        {fieldsDelta > 0 && <p>灵田上限 +{fieldsDelta}（开荒解锁）</p>}
        {realm === 8 && <p>距筑基仅一步之遥</p>}
      </div>
    </div>
  )
}
