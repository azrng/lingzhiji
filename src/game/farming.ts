// 灵田种植（farming.md + farming-depth.md）：全部函数在 engine 已克隆的 draft 上就地修改，返回失败原因或 null
import { DAILY_AP, FIELD_CAP, HARVEST_PRIME_BONUS, HARVEST_PRIME_CHANCE, HERB_BY_ID, DIMINISH_EXP_MULT, seasonOf } from './constants'
import { monthOf } from './economy'
import { addLog } from './log'
import { gainCultivation, qiCap } from './progression'
import type { Rng } from './rng'
import type { Field, GameState, HerbId, ReasonCode } from './types'

// 生长期 = 基础天数 −（Lv2 凝神诀 1 天），最低 1 天
export const effDays = (herb: HerbId, gongfa: number) =>
  Math.max(1, HERB_BY_ID[herb].days - (gongfa >= 2 ? 1 : 0))

// ---- 种田深化纯函数（farming-depth.md §3.2–3.4，供引擎结算与 UI 展示共用）----

// 相邻田（按 id 升序紧邻口径，§3.3）：田 id 差 1 且都存在
export function neighborFields(fields: Field[], fieldId: number): Field[] {
  return fields.filter((f) => Math.abs(f.id - fieldId) === 1)
}

// 物候修正：适季 +1 / 反季 −1 / 灵韵全季 0（§3.4）
export function seasonAdj(herb: HerbId, month: number): number {
  const def = HERB_BY_ID[herb]
  if (def.allSeason) return 0
  return def.seasons.includes(seasonOf(month)) ? 1 : -1
}

// 地力修正：贫瘠 −1 / 常沃 0 / 肥沃 +1（§3.2）
export function fertilityAdj(fertility: number): number {
  return fertility - 1
}

// 喜阴邻作加成：紫云芝相邻高秆（赤髓参/龙血藤/九叶莲）时 +1（§3.3，播种时快照）
const TALL: HerbId[] = ['chisui', 'longxue', 'jiuye']
export function shadeAdj(fields: Field[], fieldId: number, herb: HerbId): number {
  if (!HERB_BY_ID[herb].shade) return 0
  return neighborFields(fields, fieldId).some((n) => n.herb && TALL.includes(n.herb)) ? 1 : 0
}

// 驱虫护邻：目标田相邻有生长中/成熟的赤髓参（§3.3，事件结算时判定）
export function wardedByNeighbor(fields: Field[], fieldId: number): boolean {
  return neighborFields(fields, fieldId).some((n) => n.herb === 'chisui' && (n.status === 'growing' || n.status === 'mature'))
}

// 播种：校验顺序固定（空田→境界→灵气→种子），任一失败零消耗（PRD §16.6）
export function plant(s: GameState, fieldId: number, herb: HerbId): ReasonCode | null {
  const field = s.fields.find((f) => f.id === fieldId)
  if (!field || field.status !== 'empty') return 'NOT_EMPTY'
  const def = HERB_BY_ID[herb]
  if (s.realm < def.realm) return 'REALM_LOCKED'
  if (s.resources.qi < def.qi) return 'NO_QI'
  if (s.seeds[herb] < 1) return 'NO_SEED'
  s.resources.qi -= def.qi
  s.seeds[herb] -= 1
  field.status = 'growing'
  field.herb = herb
  field.progress = 0
  // 产量三源修正（farming-depth.md §3.2）：地力 + 物候 + 邻作，播种时快照，最低 1
  const sAdj = seasonAdj(herb, monthOf(s.day))
  const aAdj = shadeAdj(s.fields, fieldId, herb)
  field.curYield = Math.max(1, def.yield + fertilityAdj(field.fertility) + sAdj + aAdj)
  field.dry = 0
  field.halved = false
  delete field.refundSeed
  // 修正来源附注（教学口径：让玩家看见为什么多一株/少一株）
  const notes: string[] = []
  if (!def.allSeason) notes.push(sAdj > 0 ? '当令 +1' : '反季 −1')
  if (field.fertility === 2) notes.push('地力肥沃 +1')
  if (field.fertility === 0) notes.push('地力贫瘠 −1')
  if (aAdj > 0) notes.push('高秆相生 +1')
  addLog(s, {
    kind: 'action',
    icon: '🌱',
    title: `播种 · ${def.name}`,
    text: `${fieldId} 号田，需 ${effDays(herb, s.gongfa)} 天成熟${notes.length ? `（${notes.join('，')}）` : ''}`,
  })
  return null
}

// 浇灌：1 AP，全田当日免缺水并清零缺水计数（含当日新播种的田）
export function water(s: GameState): ReasonCode | null {
  if (s.wateredToday) return 'ALREADY_DONE'
  if (s.ap < 1) return 'NO_AP'
  s.ap -= 1
  s.wateredToday = true
  for (const f of s.fields) if (f.status === 'growing') f.dry = 0
  addLog(s, { kind: 'action', icon: '💧', title: '浇灌灵田', text: '全田今日免缺水' })
  return null
}

// 收获：1 AP/块；产量顺序（farming.md §3.7）：事件→缺水已在日终处理，收获时应用功法加成；
// 取整后掷上品（PRD §6）：20% 概率灵性涌现额外 +1 株。
// 地力透支期（real-day.md §3.5）：修为 ×DIMINISH_EXP_MULT 向上取整（含上品株数）；灵草株数与售价不减
export function harvest(s: GameState, fieldId: number, rng: Rng): ReasonCode | null {
  const field = s.fields.find((f) => f.id === fieldId)
  if (!field || field.status !== 'mature') return 'NOT_MATURE'
  if (s.ap < 1) return 'NO_AP'
  s.ap -= 1
  const def = HERB_BY_ID[field.herb!]
  const bonus = s.gongfa >= 3 ? 1.15 : 1
  const base = Math.ceil(field.curYield! * bonus)
  const prime = rng.next() < HARVEST_PRIME_CHANCE ? HARVEST_PRIME_BONUS : 0
  const got = base + prime
  const diminishing = s.realDay.gamesToday >= 1
  const expGain = Math.ceil(def.exp * got * (diminishing ? DIMINISH_EXP_MULT : 1))
  s.inventory[field.herb!] += got
  // 地力与茬口结算（farming-depth.md §3.2）：固氮仅在真轮作进茬时 +1（防单作锁死肥沃档，sim 校准）；
  // 连作 −1 对非固氮草生效（深根减半为 0）——青灵草单作中性、轮作才有增益；地力 clamp 0-2
  let fertDelta = def.nitrogen && field.lastCrop !== undefined && field.lastCrop !== field.herb ? 1 : 0
  if (field.lastCrop === field.herb && !def.nitrogen) fertDelta -= def.deepRoot ? 0 : 1
  const nextFert = Math.min(2, Math.max(0, field.fertility + fertDelta))
  addLog(s, {
    kind: 'action',
    icon: '🌾',
    title: `收获 · ${def.name}`,
    text: `+${got} 株，修为 +${expGain}${prime ? '，灵性涌现 +1 上品' : ''}${diminishing ? '，地力透支修为减半' : ''}${nextFert !== field.fertility ? `，地力${nextFert > field.fertility ? '提升' : '下降'}` : ''}`,
  })
  gainCultivation(s, expGain)
  // 清茬但保留田属性（fertility / lastCrop 是田的属性，§5）；lastCrop 更新为本茬
  s.fields[s.fields.indexOf(field)] = { id: field.id, status: 'empty', fertility: nextFert, lastCrop: field.herb }
  return null
}

// 灵气灌注：0 AP，1 灵气，全部生长中田 +N 天（Lv5 +1、灵泉翻倍），达成熟立即停驻
export function irrigate(s: GameState): ReasonCode | null {
  if (!s.fields.some((f) => f.status === 'growing')) return 'NO_CROP'
  if (s.resources.qi < 1) return 'NO_QI'
  s.resources.qi -= 1
  const per = (s.gongfa >= 5 ? 2 : 1) * (s.pendingTomorrow.infusionDouble ? 2 : 1)
  for (const f of s.fields) {
    if (f.status !== 'growing') continue
    f.progress! += per
    if (f.progress! >= effDays(f.herb!, s.gongfa)) {
      f.progress = effDays(f.herb!, s.gongfa)
      f.status = 'mature'
    }
  }
  addLog(s, { kind: 'action', icon: '🔮', title: '灵气灌注', text: `生长中田 +${per} 天${s.pendingTomorrow.infusionDouble ? '（灵泉翻倍）' : ''}` })
  return null
}

// 修炼吐纳：1 AP，每日 1 次，修为 +1
export function tuna(s: GameState): ReasonCode | null {
  if (s.tunaUsedToday) return 'ALREADY_DONE'
  if (s.ap < 1) return 'NO_AP'
  s.ap -= 1
  s.tunaUsedToday = true
  addLog(s, { kind: 'action', icon: '🧘', title: '修炼吐纳', text: '修为 +1' })
  gainCultivation(s, 1)
  return null
}

// 赎回被收回灵田：100 贡献（地力与茬口保留，farming-depth.md §5）
export function reclaim(s: GameState, fieldId: number): ReasonCode | null {
  const field = s.fields.find((f) => f.id === fieldId)
  if (!field || field.status !== 'confiscated') return 'INVALID_TARGET'
  if (s.resources.contribution < 100) return 'NO_CONTRIBUTION'
  s.resources.contribution -= 100
  s.fields[s.fields.indexOf(field)] = { id: field.id, status: 'empty', fertility: field.fertility, lastCrop: field.lastCrop }
  addLog(s, { kind: 'settle', icon: '🔓', title: '赎回灵田', text: `${fieldId} 号田重归名下（贡献 −100）` })
  return null
}

// 开荒：2 AP；有被收回田时必须先赎回（farming.md §3.6）；新田地力常沃
export function reclaimLand(s: GameState): ReasonCode | null {
  if (s.fields.some((f) => f.status === 'confiscated')) return 'HAS_CONFISCATED'
  if (s.fields.length >= FIELD_CAP[s.realm]) return 'FIELD_LIMIT'
  if (s.ap < 2) return 'NO_AP'
  s.ap -= 2
  const id = Math.max(...s.fields.map((f) => f.id)) + 1
  s.fields.push({ id, status: 'empty', fertility: 1 })
  addLog(s, { kind: 'action', icon: '⛏️', title: '开荒', text: `新辟 ${id} 号灵田` })
  return null
}

// 日终自然生长 +1 天并检查成熟（core-loop.md 步骤 3）
export function applyGrowth(s: GameState): void {
  for (const f of s.fields) {
    if (f.status !== 'growing') continue
    f.progress! += 1
    if (f.progress! >= effDays(f.herb!, s.gongfa)) {
      f.progress = effDays(f.herb!, s.gongfa)
      f.status = 'mature'
    }
  }
}

// 日终缺水结算（core-loop.md 步骤 4）：连续 3 天减半一次，0 不恢复；成熟后不累计；
// 喜湿特质（凝露花）免疫缺水累计与减产（farming-depth.md §3.1）
export function applyDrought(s: GameState): void {
  if (s.wateredToday) return
  let thirsty = 0
  for (const f of s.fields) {
    if (f.status !== 'growing' || HERB_BY_ID[f.herb!].wet) continue
    thirsty++
    f.dry! += 1
    if (f.dry! >= 3 && !f.halved) {
      f.curYield = Math.ceil(f.curYield! / 2)
      f.halved = true
      f.dry = 0
      addLog(s, { kind: 'event', icon: '⚠️', title: '缺水减产', text: `${f.id} 号田连续缺水，当茬产量减半` })
    }
  }
  if (thirsty > 0) {
    addLog(s, { kind: 'event', icon: '🥵', title: '今日未浇灌', text: `${thirsty} 块生长中田缺水 +1 天` })
  }
}

// 每日重置（core-loop.md 步骤 6）
export function resetDaily(s: GameState): void {
  s.ap = DAILY_AP
  s.wateredToday = false
  s.tunaUsedToday = false
}

// 灵气入账（统一出口：上限截断，溢出丢弃并返回溢出量供文案）
export function gainQi(s: GameState, amount: number): number {
  const before = s.resources.qi
  s.resources.qi = Math.min(qiCap(s.realm), before + amount)
  return before + amount - s.resources.qi
}
