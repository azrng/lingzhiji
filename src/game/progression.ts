// 境界修行：修为入账唯一入口、自动突破、派生上限（progression.md）
import { QI_CAP, REALM_EXP, REALM_NAMES } from './constants'
import { addLog } from './log'
import type { GameState } from './types'

// 派生上限不入档，只由 realm 计算（architecture.md §5）
export const qiCap = (realm: number) => QI_CAP[realm]
export const realmName = (realm: number) => REALM_NAMES[realm]
export const isFoundation = (realm: number) => realm >= 9

// 修为入账：累计只增不减；跨越阈值自动突破（连跳合并为一条日志）。
// 筑基结算由 UI 按 realm>=9 && !milestoneShown 派生展示，MILESTONE_SHOWN 动作落档
export function gainCultivation(s: GameState, amount: number): void {
  if (amount <= 0) return
  s.cultivation += amount
  const from = s.realm
  while (s.realm < 9 && s.cultivation >= REALM_EXP[s.realm + 1]) s.realm++
  if (s.realm !== from) {
    addLog(s, {
      kind: 'breakthrough',
      icon: '✨',
      title: `突破${REALM_NAMES[s.realm]}`,
      text: s.realm === 9 ? '修为圆满，筑基功成' : '水到渠成，灵台清明',
    })
  }
}

// 资源下限 0 钳制（PRD §5.4）；灵气上限溢出丢弃由各结算点显式处理
export function clampResources(s: GameState): void {
  const r = s.resources
  r.stones = Math.max(0, r.stones)
  r.contribution = Math.max(0, r.contribution)
  r.insight = Math.max(0, r.insight)
  s.cultivation = Math.max(0, s.cultivation)
}
