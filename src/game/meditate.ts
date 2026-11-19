// 入定 · 时序快进（time-decouple.md §3）：UI 层纯函数助手——
// 快照派生（meditateSnapshot）、确定性预演（meditatePreview，纯数学不含随机事件明细）、
// 结果轨迹（meditateRunInfo，走引擎 runMeditationBatch 同一管线，与真实落盘确定性一致）。
// 原型阶段的 Fake 与三态演示已随接引擎移除；引擎态恒有效，原型「存档异常」态不再存在。
// T54 修订：入定闭关灵泉阵护田（不缺水）+ 闭关纳灵（每满 3 天聚 1 灵气），预演随之去掉缺水风险行。
import { HERB_BY_ID, MEDITATE_QI_EVERY, MONTH_DAYS } from './constants'
import { dayInMonth, monthOf } from './economy'
import { runMeditationBatch, type MeditateRunInfo } from './engine'
import { effDays } from './farming'
import { qiCap } from './progression'
import { createRng } from './rng'
import type { GameState } from './types'

// 生长中/已成熟田块快照（从 GameState.fields 派生）
export interface MeditateField {
  field: number
  herbId: string
  herbName: string
  status: 'growing' | 'mature'
  progress: number // 当前生长天数
  days: number // 生长期（含功法加成）
  dryStreak: number // 已连续缺水天数（喜湿灵草恒 0）
  wet: boolean // 喜湿特质：免疫缺水累计与减产
}

export interface MeditateSnapshot {
  month: number
  monthDay: number
  quotaPending: boolean // 月末（第 30 日）定额未结算：入定的唯一拦截位
  fields: MeditateField[]
}

export function meditateSnapshot(g: GameState): MeditateSnapshot {
  const monthDay = dayInMonth(g.day)
  return {
    month: monthOf(g.day),
    monthDay,
    quotaPending: g.phase === 'quota' || monthDay >= MONTH_DAYS,
    fields: g.fields
      .filter((f) => f.status === 'growing' || f.status === 'mature')
      .map((f): MeditateField => ({
        field: f.id,
        herbId: f.herb!,
        herbName: HERB_BY_ID[f.herb!].name,
        status: f.status as MeditateField['status'],
        progress: f.progress!,
        days: effDays(f.herb!, g.gongfa),
        dryStreak: f.dry ?? 0,
        wet: !!HERB_BY_ID[f.herb!].wet,
      })),
  }
}

// 预演（确定性纯数学，不跑随机事件）：推进至第几日、成熟田（不含事件催熟，实际可能更多）、闭关纳灵。
// 口径与引擎对齐：每满 MEDITATE_QI_EVERY 天 +1 灵气，按当前灵气与上限截断后的实际入账数
export interface MeditatePreviewInfo {
  newMonthDay: number
  stoppedAtMonthEnd: boolean
  matured: { field: number; herbName: string }[]
  qiGain: number
}

export function meditatePreview(g: GameState, days: number): MeditatePreviewInfo | null {
  const snap = meditateSnapshot(g)
  if (snap.quotaPending) return null
  if (!Number.isInteger(days) || days < 1 || days > MONTH_DAYS - snap.monthDay) return null
  const newMonthDay = snap.monthDay + days
  const matured: { field: number; herbName: string }[] = []
  for (const f of snap.fields) {
    if (f.status !== 'growing') continue
    if (f.days - f.progress <= days) matured.push({ field: f.field, herbName: f.herbName })
  }
  const qiDue = Math.floor(days / MEDITATE_QI_EVERY)
  const qiGain = Math.min(qiDue, Math.max(0, qiCap(g.realm) - g.resources.qi))
  return { newMonthDay, stoppedAtMonthEnd: newMonthDay >= MONTH_DAYS, matured, qiGain }
}

// 结果轨迹：在状态副本上跑引擎同一条入定管线（mulberry32 由 rngState 播种，确定性一致）；
// 真实落盘由组件 dispatch MEDITATE 完成，副本仅供出关面板展示逐日摘要
export function meditateRunInfo(g: GameState, days: number): MeditateRunInfo | null {
  const draft = structuredClone(g)
  return runMeditationBatch(draft, createRng(draft.rngState), days)
}
