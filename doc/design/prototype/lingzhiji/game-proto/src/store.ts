import { create } from 'zustand'
import {
  convertRate, EVENTS, EventId, FIELD_CAP, GONGFA_COST, herbById, HERBS, HerbId, QI_CAP,
  REALM_EXP, Word, WORDS,
} from './mock'

// 原型说明：逻辑集中在 store 内做演示；正式实现按设计文档拆到 src/game/ 纯逻辑层，
// 并使用可播种 PRNG 与 localStorage 存档。本文件不含存档与平衡数值。

export type FieldStatus = 'empty' | 'growing' | 'mature' | 'confiscated'

export interface Field {
  id: number
  status: FieldStatus
  herb?: HerbId
  progress?: number
  curYield?: number
  dry?: number
  halved?: boolean
  refundSeed?: HerbId
}

export interface QuizWord extends Word {
  from: 'new' | 'review'
  opts: string[] // 4 选 1 选项（含正确释义）
}

export interface LogEntry {
  day: number
  evPos?: [number, number] // 事件素材图标位置
  icon?: string // emoji 备选
  title: string
  text: string
}

export interface Toast {
  id: number
  evPos?: [number, number]
  icon?: string
  title: string
  text?: string
  tone?: 'good' | 'bad' | 'gold'
}

export type QuizStep = 'entry' | 'learning' | 'testing' | 'result'

let toastSeq = 1

interface GameState {
  started: boolean
  day: number
  ap: number
  stones: number
  contribution: number
  qi: number
  insight: number
  cultivation: number
  realm: number // 0-9
  gongfa: number // 1-5
  fields: Field[]
  seeds: Record<HerbId, number>
  inventory: Record<HerbId, number>
  watered: boolean
  tunaUsed: boolean
  quizDone: boolean
  unpaidStreak: number
  pendingTomorrow: { infusionDouble?: boolean; marketMult?: number }
  logs: LogEntry[]
  toasts: Toast[]
  // 弹层
  quizOpen: boolean
  quizStep: QuizStep
  quizWords: QuizWord[]
  quizIdx: number
  answers: (string | null)[]
  wrongQueue: string[]
  answeredWords: string[]
  lib: 'cet4' | 'cet6'
  libError: boolean
  marketOpen: boolean
  quotaOpen: boolean
  quotaPaidLast: string | null
  settingsOpen: boolean
  milestoneOpen: boolean
  milestoneShown: boolean
  tutorialStep: number // 0 完成，1-3 进行中
  tabBanner: boolean

  // 行动
  start: () => void
  plant: (fieldId: number, herb: HerbId) => void
  water: () => void
  harvest: (fieldId: number) => void
  irrigate: () => void
  tuna: () => void
  reclaim: (fieldId: number) => void
  reclaimLand: () => void
  buySeed: (herb: HerbId) => void
  buyScroll: () => void
  sellHerb: (herb: HerbId, n: number) => void
  emergencySeed: () => void
  upgradeGongfa: () => void
  // 任务堂
  openQuiz: () => void
  closeQuiz: () => void
  setLib: (lib: 'cet4' | 'cet6') => void
  beginQuiz: () => void
  goTesting: () => void
  answer: (choice: string) => void
  next: () => void
  confirmResult: () => void
  // 推进
  endDay: () => void
  resolveQuota: (pay: boolean, plan: Partial<Record<HerbId, number>>) => void
  advanceDay: () => void
  // 弹层控制
  closeOverlay: (name: 'quiz' | 'market' | 'settings' | 'quota' | 'milestone') => void
  dismissToast: (id: number) => void
  hideTabBanner: () => void
  // 调试（原型专用）
  dbg: (action: 'stones' | 'qi' | 'insight' | 'exp' | 'day30' | 'milestone' | 'confiscate' | 'libError' | 'tabBanner' | 'reset') => void
}

const initial = () => ({
  started: false,
  day: 1,
  ap: 3,
  stones: 50,
  contribution: 0,
  qi: 0,
  insight: 0,
  cultivation: 0,
  realm: 0,
  gongfa: 1,
  fields: [
    { id: 1, status: 'empty' as FieldStatus },
    { id: 2, status: 'empty' as FieldStatus },
    { id: 3, status: 'empty' as FieldStatus },
  ],
  seeds: { qingling: 3, ninglu: 0, ziyun: 0, chisui: 0, longxue: 0, jiuye: 0 },
  inventory: { qingling: 0, ninglu: 0, ziyun: 0, chisui: 0, longxue: 0, jiuye: 0 },
  watered: false,
  tunaUsed: false,
  quizDone: false,
  unpaidStreak: 0,
  pendingTomorrow: {} as { infusionDouble?: boolean; marketMult?: number },
  logs: [] as LogEntry[],
  toasts: [] as Toast[],
  quizOpen: false,
  quizStep: 'entry' as QuizStep,
  quizWords: [] as QuizWord[],
  quizIdx: 0,
  answers: [] as (string | null)[],
  wrongQueue: [] as string[],
  answeredWords: [] as string[],
  lib: 'cet4' as const,
  libError: false,
  marketOpen: false,
  quotaOpen: false,
  quotaPaidLast: null as string | null,
  settingsOpen: false,
  milestoneOpen: false,
  milestoneShown: false,
  tutorialStep: 0,
  tabBanner: false,
})

// 工具
const rnd = (n: number) => Math.floor(Math.random() * n)
const pick = <T,>(arr: T[]) => arr[rnd(arr.length)]
const shuffle = <T,>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5)
const clamp0 = (n: number) => Math.max(0, n)
export const monthOf = (day: number) => Math.ceil(day / 30)
export const dayInMonth = (day: number) => ((day - 1) % 30) + 1
const effDays = (herb: HerbId, gongfa: number) => Math.max(1, herbById(herb).days - (gongfa >= 2 ? 1 : 0))
// 抽题复习配额：练气一至三层 3、四至六层 4、七层+ 5
const reviewQuota = (realm: number) => (realm < 3 ? 3 : realm < 6 ? 4 : 5)

export const useGame = create<GameState>((set, get) => {
  const log = (e: Omit<LogEntry, 'day'>) =>
    set((s) => ({ logs: [{ day: s.day, ...e }, ...s.logs].slice(0, 50) }))

  const toast = (t: Omit<Toast, 'id'>) => {
    const id = toastSeq++
    set((s) => ({ toasts: [...s.toasts, { id, ...t }] }))
    setTimeout(() => get().dismissToast(id), 3800)
  }

  const gainExp = (n: number) => {
    const s = get()
    let { cultivation, realm } = s
    cultivation += n
    let broke: string[] = []
    while (realm < 9 && cultivation >= REALM_EXP[realm + 1]) {
      realm++
      broke.push('练气' + '一二三四五六七八九'[realm] + '层')
    }
    if (realm >= 9) broke = ['筑基']
    set({ cultivation, realm })
    if (broke.length) {
      const to = broke[broke.length - 1]
      toast({ icon: '✨', title: `境界突破 · ${to}`, tone: 'gold', text: broke.length > 1 ? '连破数境！' : undefined })
      log({ icon: '✨', title: `突破${to}`, text: '修为圆满，水到渠成' })
      if (realm === 9 && !s.milestoneShown) set({ milestoneOpen: true, milestoneShown: true })
    }
  }

  const addLog = log

  return {
    ...initial(),

    start: () => set({ ...initial(), started: true, tutorialStep: 1 }),

    plant: (fieldId, herbId) => {
      const s = get()
      const herb = herbById(herbId)
      const f = s.fields.find((x) => x.id === fieldId)!
      if (f.status !== 'empty' || s.realm < herb.realm || s.qi < herb.qi || s.seeds[herbId] < 1) return
      set({
        qi: s.qi - herb.qi,
        seeds: { ...s.seeds, [herbId]: s.seeds[herbId] - 1 },
        fields: s.fields.map((x) =>
          x.id === fieldId
            ? { id: x.id, status: 'growing', herb: herbId, progress: 0, curYield: herb.yield, dry: 0, halved: false }
            : x,
        ),
      })
      addLog({ icon: '🌱', title: `播种 · ${herb.name}`, text: `${fieldId} 号田，需 ${herb.days} 天成熟` })
    },

    water: () => {
      const s = get()
      if (s.ap < 1) return
      set({
        ap: s.ap - 1,
        watered: true,
        fields: s.fields.map((f) => (f.status === 'growing' ? { ...f, dry: 0 } : f)),
      })
      addLog({ icon: '💧', title: '浇灌灵田', text: '全田今日免缺水' })
    },

    harvest: (fieldId) => {
      const s = get()
      const f = s.fields.find((x) => x.id === fieldId)!
      if (f.status !== 'mature' || s.ap < 1) return
      const herb = herbById(f.herb!)
      const bonus = s.gongfa >= 3 ? 1.15 : 1
      const got = Math.ceil(f.curYield! * bonus)
      set({
        ap: s.ap - 1,
        inventory: { ...s.inventory, [f.herb!]: s.inventory[f.herb!] + got },
        fields: s.fields.map((x) => (x.id === fieldId ? { id: x.id, status: 'empty' } : x)),
      })
      addLog({ icon: '🌾', title: `收获 · ${herb.name}`, text: `+${got} 株，修为 +${herb.exp * got}` })
      gainExp(herb.exp * got)
    },

    irrigate: () => {
      const s = get()
      const has = s.fields.some((f) => f.status === 'growing')
      if (!has || s.qi < 1) return
      const per = (s.gongfa >= 5 ? 2 : 1) * (s.pendingTomorrow.infusionDouble ? 2 : 1)
      set({
        qi: s.qi - 1,
        fields: s.fields.map((f) => {
          if (f.status !== 'growing') return f
          const p = f.progress! + per
          return p >= effDays(f.herb!, s.gongfa)
            ? { ...f, status: 'mature', progress: effDays(f.herb!, s.gongfa) }
            : { ...f, progress: p }
        }),
      })
      addLog({ icon: '🔮', title: '灵气灌注', text: `生长中田 +${per} 天${s.pendingTomorrow.infusionDouble ? '（灵泉翻倍）' : ''}` })
    },

    tuna: () => {
      const s = get()
      if (s.tunaUsed || s.ap < 1) return
      set({ ap: s.ap - 1, tunaUsed: true })
      addLog({ icon: '🧘', title: '修炼吐纳', text: '修为 +1' })
      gainExp(1)
    },

    reclaim: (fieldId) => {
      const s = get()
      if (s.contribution < 100) return
      const f = s.fields.find((x) => x.id === fieldId)!
      if (f.status !== 'confiscated') return
      set({
        contribution: s.contribution - 100,
        fields: s.fields.map((x) => (x.id === fieldId ? { id: x.id, status: 'empty' } : x)),
      })
      addLog({ icon: '🔓', title: '赎回灵田', text: `${fieldId} 号田重归名下（贡献 −100）` })
    },

    reclaimLand: () => {
      const s = get()
      if (s.ap < 2 || s.fields.length >= FIELD_CAP[s.realm]) return
      const id = Math.max(...s.fields.map((f) => f.id)) + 1
      set({ ap: s.ap - 2, fields: [...s.fields, { id, status: 'empty' }] })
      addLog({ icon: '⛏️', title: '开荒', text: `新辟 ${id} 号灵田` })
    },

    buySeed: (herbId) => {
      const s = get()
      const herb = herbById(herbId)
      const price = s.realm >= 5 ? Math.ceil(herb.price * 0.9) : herb.price
      if (s.stones < price) return
      set({ stones: s.stones - price, seeds: { ...s.seeds, [herbId]: s.seeds[herbId] + 1 } })
      addLog({ icon: '🛍️', title: `购买 ${herb.name}种`, text: `−${price} 灵石` })
    },

    buyScroll: () => {
      const s = get()
      if (s.stones < 120) return
      set({ stones: s.stones - 120, insight: s.insight + 30 })
      addLog({ icon: '📜', title: '购买功法残卷', text: '心得 +30（−120 灵石）' })
    },

    sellHerb: (herbId, n) => {
      const s = get()
      if (s.inventory[herbId] < n) return
      const mult = s.pendingTomorrow.marketMult ?? 1
      const unit = Math.max(1, Math.floor(herbById(herbId).sell * mult))
      set({
        stones: s.stones + unit * n,
        inventory: { ...s.inventory, [herbId]: s.inventory[herbId] - n },
      })
      addLog({ icon: '💰', title: `出售 ${herbById(herbId).name} ×${n}`, text: `+${unit * n} 灵石（单价 ${unit}）` })
    },

    emergencySeed: () => {
      const s = get()
      const hasUsable = HERBS.some((h) => s.realm >= h.realm && s.seeds[h.id] > 0)
      const cheapest = Math.min(...HERBS.filter((h) => s.realm >= h.realm).map((h) => h.price))
      const ok =
        s.fields.every((f) => f.status === 'empty') &&
        Object.values(s.inventory).every((v) => v === 0) &&
        !hasUsable && s.stones < cheapest
      if (!ok) return
      set({ seeds: { ...s.seeds, qingling: s.seeds.qingling + 1 } })
      toast({ icon: '🎁', title: '应急领种', text: '执事发下 1 枚青灵草种子，莫要荒废灵田' })
    },

    upgradeGongfa: () => {
      const s = get()
      if (s.gongfa >= 5) return
      const cost = GONGFA_COST[s.gongfa] // 下一级消耗（Lv2 记 0）
      if (s.insight < 100 || s.contribution < cost) return
      set({ insight: s.insight - 100, contribution: s.contribution - cost, gongfa: s.gongfa + 1 })
      // Lv2 生长期 −1：立即重检全部生长中作物是否成熟
      if (s.gongfa + 1 >= 2) {
        set({
          fields: get().fields.map((f) =>
            f.status === 'growing' && f.progress! >= effDays(f.herb!, get().gongfa)
              ? { ...f, status: 'mature', progress: effDays(f.herb!, get().gongfa) }
              : f,
          ),
        })
      }
      toast({ icon: '📖', title: `功法进阶 · ${'凝神诀聚灵诀辨灵术春霖诀'.slice((s.gongfa - 1) * 3, s.gongfa * 3)}`, tone: 'gold' })
      addLog({ icon: '📖', title: `功法升至 Lv${s.gongfa + 1}`, text: `心得 −100${cost ? `，贡献 −${cost}` : ''}` })
    },

    openQuiz: () => set({ quizOpen: true, quizStep: 'entry', quizWords: [], quizIdx: 0, answers: [] }),
    closeQuiz: () => set({ quizOpen: false }),

    setLib: (lib) => set({ lib }),

    beginQuiz: () => {
      const s = get()
      if (s.libError) return
      const quota = reviewQuota(s.realm)
      const review = shuffle(s.wrongQueue.filter((w) => !s.quizWords.some((q) => q.w === w))).slice(0, quota)
      const seen = new Set([...s.answeredWords, ...review])
      const news = shuffle(WORDS.filter((w) => !seen.has(w.w))).slice(0, 10 - review.length)
      if (review.length + news.length < 10) {
        set({ libError: true })
        return
      }
      const chosen: QuizWord[] = [
        ...review.map((w) => ({ ...WORDS.find((x) => x.w === w)!, from: 'review' as const })),
        ...news.map((w) => ({ ...w, from: 'new' as const })),
      ].map((q) => ({
        ...q,
        opts: shuffle([q.m, ...shuffle(WORDS.filter((x) => x.w !== q.w && x.m !== q.m)).slice(0, 3).map((x) => x.m)]),
      }))
      set({
        quizWords: shuffle(chosen),
        quizIdx: 0,
        answers: Array(10).fill(null),
        quizStep: 'learning',
        answeredWords: [...s.answeredWords, ...chosen.map((q) => q.w)],
      })
    },

    goTesting: () => set({ quizStep: 'testing' }),

    answer: (choice) => {
      const s = get()
      if (s.answers[s.quizIdx] !== null) return
      const q = s.quizWords[s.quizIdx]
      const correct = choice === q.m
      const answers = [...s.answers]
      answers[s.quizIdx] = choice
      // 答错入队尾；答对移出错词池
      const wrongQueue = correct
        ? s.wrongQueue.filter((w) => w !== q.w)
        : [...s.wrongQueue.filter((w) => w !== q.w), q.w]
      set({ answers, wrongQueue })
    },

    next: () => {
      const s = get()
      if (s.quizIdx === 9) set({ quizStep: 'result' })
      else set({ quizIdx: s.quizIdx + 1 })
    },

    confirmResult: () => {
      const s = get()
      const score = s.quizWords.filter((q, i) => s.answers[i] === q.m).length
      const pass = score >= 6
      const qiGain = pass ? 3 + (s.gongfa >= 4 ? 1 : 0) : 1
      const insightGain = pass ? 8 + (score === 10 ? 4 : 0) : 2
      const cap = QI_CAP[s.realm]
      const overflow = Math.max(0, s.qi + qiGain - cap)
      set({
        qi: Math.min(cap, s.qi + qiGain),
        contribution: pass ? s.contribution + 5 : s.contribution,
        insight: s.insight + insightGain,
        quizDone: true,
        quizOpen: false,
      })
      addLog({
        icon: pass ? '✅' : '📘',
        title: `任务堂 ${score}/10`,
        text: pass
          ? `灵气 +${qiGain}${overflow ? `（溢出 ${overflow}）` : ''}、贡献 +5、心得 +${insightGain}`
          : '灵气 +1、心得 +2；错词将排队复习',
      })
      toast({ icon: pass ? '✅' : '📘', title: `任务堂完成 ${score}/10`, tone: pass ? 'good' : 'bad' })
    },

    endDay: () => {
      const s = get()
      if (!s.quizDone) return
      // 1. 随机事件（30%）
      if (Math.random() < 0.3) {
        const total = EVENTS.reduce((a, e) => a + e.weight, 0)
        let roll = Math.random() * total
        const ev = EVENTS.find((e) => (roll -= e.weight) <= 0)!
        applyEvent(ev.id)
      }
      // 2. 全田自然生长 +1 并检查成熟
      const g = get()
      set({
        fields: g.fields.map((f) => {
          if (f.status !== 'growing') return f
          const p = f.progress! + 1
          return p >= effDays(f.herb!, g.gongfa) ? { ...f, status: 'mature', progress: effDays(f.herb!, g.gongfa) } : { ...f, progress: p }
        }),
      })
      // 3. 缺水计数
      const g2 = get()
      set({
        fields: g2.fields.map((f) => {
          if (f.status !== 'growing') return f
          if (g2.watered) return f
          const dry = f.dry! + 1
          if (dry >= 3 && !f.halved) {
            return { ...f, curYield: Math.ceil(f.curYield! / 2), halved: true, dry: 0 }
          }
          return { ...f, dry }
        }),
      })
      if (g2.watered === false && g2.fields.some((f) => f.status === 'growing' && !f.halved)) {
        const thirsty = g2.fields.filter((f) => f.status === 'growing').length
        addLog({ icon: '🥵', title: '今日未浇灌', text: `${thirsty} 块生长中田缺水 +1 天` })
      }
      // 4. 月末判定 → 5. 推进
      if (dayInMonth(g2.day) === 30) {
        set({ quotaOpen: true })
        addLog({ icon: '🧾', title: '月末已至', text: '执事前来核对定额' })
      } else {
        get().advanceDay()
      }
    },

    resolveQuota: (pay, plan) => {
      const s = get()
      const month = monthOf(s.day)
      if (pay) {
        let converted = 0
        const parts: string[] = []
        for (const [id, n] of Object.entries(plan)) {
          if (!n) continue
          converted += convertRate(herbById(id as HerbId)) * n
          parts.push(`${herbById(id as HerbId).name}×${n}`)
          set((st) => ({ inventory: { ...st.inventory, [id as HerbId]: st.inventory[id as HerbId] - n } }))
        }
        if (converted < 15) return
        set({ contribution: get().contribution + 10, unpaidStreak: 0, quotaPaidLast: `${month} 月足额缴纳（${parts.join('、')}）` })
        addLog({ icon: '🧾', title: `第 ${month} 月定额缴纳`, text: `折算 ${converted} 株，贡献 +10` })
      } else if (month > 1) {
        const streak = s.unpaidStreak + 1
        set({
          contribution: clamp0(s.contribution - 20),
          stones: clamp0(s.stones - 10),
          unpaidStreak: streak,
          quotaPaidLast: `${month} 月欠缴`,
        })
        addLog({ icon: '⚠️', title: `第 ${month} 月欠缴`, text: '贡献 −20、灵石 −10' })
        if (streak >= 2) {
          const target =
            s.fields.find((f) => f.status === 'empty') ??
            s.fields.find((f) => f.status !== 'confiscated')
          if (target && s.fields.filter((f) => f.status !== 'confiscated').length > 1) {
            set({
              unpaidStreak: 0,
              fields: s.fields.map((f) =>
                f.id === target.id
                  ? {
                      id: f.id, status: 'confiscated',
                      refundSeed: f.status === 'growing' || f.status === 'mature' ? f.herb : undefined,
                    }
                  : f,
              ),
            })
            toast({ icon: '🔒', title: '灵田被收回', text: '连续两月欠缴，宗门收回一块灵田；可花 100 贡献赎回', tone: 'bad' })
            addLog({ icon: '🔒', title: '灵田被收回', text: `${target.id} 号田收归宗门` })
          } else {
            set({ unpaidStreak: 0 })
          }
        }
      } else {
        set({ quotaPaidLast: `${month} 月欠缴（适应期免罚）` })
        addLog({ icon: '🧾', title: `第 ${month} 月欠缴`, text: '首月适应期，不予追究' })
      }
      get().advanceDay()
    },

    advanceDay: () =>
      set({
        day: get().day + 1,
        ap: 3,
        watered: false,
        tunaUsed: false,
        quizDone: false,
        pendingTomorrow: {},
        quotaOpen: false,
      }),

    closeOverlay: (name) =>
      set(name === 'quiz' ? { quizOpen: false }
        : name === 'market' ? { marketOpen: false }
        : name === 'settings' ? { settingsOpen: false }
        : name === 'quota' ? { quotaOpen: false }
        : { milestoneOpen: false }),

    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    hideTabBanner: () => set({ tabBanner: false }),

    dbg: (action) => {
      const s = get()
      switch (action) {
        case 'stones': set({ stones: s.stones + 50 }); break
        case 'qi': set({ qi: Math.min(QI_CAP[s.realm], s.qi + 3) }); break
        case 'insight': set({ insight: s.insight + 100 }); break
        case 'exp': gainExp(50); break
        case 'day30': set({ day: Math.floor((s.day - 1) / 30) * 30 + 30 }); break
        case 'milestone': set({ cultivation: 520 }); gainExp(0); break
        case 'confiscate': {
          const target = s.fields.find((f) => f.status !== 'confiscated')
          if (!target) break
          set({
            fields: s.fields.map((f) =>
              f.id === target.id
                ? { id: f.id, status: 'confiscated', refundSeed: f.herb, herb: undefined, progress: undefined, curYield: undefined, dry: undefined, halved: undefined }
                : f,
            ),
          })
          break
        }
        case 'libError': set({ libError: !s.libError }); break
        case 'tabBanner': set({ tabBanner: !s.tabBanner }); break
        case 'reset': set({ ...initial(), started: true, tutorialStep: 1 }); break
      }
    },
  }

  // 事件结算（endDay 内使用）
  function applyEvent(id: EventId) {
    const ev = EVENTS.find((e) => e.id === id)!
    const s = get()
    switch (id) {
      case 'rain':
        set({ fields: s.fields.map((f) => (f.status === 'growing' ? { ...f, progress: Math.min(f.progress! + 2, effDays(f.herb!, s.gongfa)) } : f)) })
        set({ fields: get().fields.map((f) => (f.status === 'growing' && f.progress! >= effDays(f.herb!, get().gongfa) ? { ...f, status: 'mature' } : f)) })
        break
      case 'butterfly': {
        const growing = s.fields.filter((f) => f.status === 'growing')
        const t = pick(growing)
        if (t) set({ fields: s.fields.map((f) => (f.id === t.id ? { ...f, curYield: f.curYield! + 1 } : f)) })
        break
      }
      case 'senior': gainExp(3); break
      case 'stones': set({ stones: s.stones + 8 }); break
      case 'spring': set({ pendingTomorrow: { ...s.pendingTomorrow, infusionDouble: true } }); break
      case 'elder': set({ contribution: s.contribution + 5 }); break
      case 'pest': {
        const growing = s.fields.filter((f) => f.status === 'growing')
        const t = pick(growing)
        if (t) set({ fields: s.fields.map((f) => (f.id === t.id ? { ...f, curYield: Math.max(0, f.curYield! - 1) } : f)) })
        break
      }
      case 'bird': {
        const owned = HERBS.filter((h) => s.inventory[h.id] > 0)
        const t = pick(owned)
        if (t) set({ inventory: { ...s.inventory, [t.id]: s.inventory[t.id] - 1 } })
        break
      }
      case 'formation':
        set({ fields: s.fields.map((f) => (f.status === 'growing' ? { ...f, progress: Math.max(0, f.progress! - 1) } : f)) })
        break
      case 'market':
        set({ pendingTomorrow: { ...s.pendingTomorrow, marketMult: Math.random() < 0.5 ? 1.5 : 0.7 } })
        break
    }
    // 事件文案日志
    const extra =
      id === 'market'
        ? get().pendingTomorrow.marketMult === 1.5 ? '明日售价 +50%' : '明日售价 −30%'
        : ev.desc
    log({ evPos: ev.pos, title: `事件 · ${ev.name}`, text: extra })
    toast({ evPos: ev.pos, title: ev.name, text: extra, tone: ev.negative ? 'bad' : 'good' })
  }
})
