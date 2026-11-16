// 界面动效（motion-pack.md / DES-LINGZHIJI-MOTION-PACK）：
// 唯一触碰 canvas 与动效浮层的模块（与 audio.ts 同级同构）：粒子引擎 + 日志差量→动效映射纯函数。
// 飘字由本模块自管轻量 DOM + CSS 关键帧（fx-float-text）：触发是命令式、样式单一，无需走 motion 组件；
// 引擎纯逻辑层零改动；reduced-motion 下所有入口直接返回（粒子不生成，飘字 CSS 静态显示后按同时长清理）。
import type { LogEntry } from './game/types'

export type FxKind = 'dew' | 'milestone' | 'premium' | 'harvest'

// 粒子颜色取设计 token 值（canvas 拿不到 CSS 变量，改 token 需同步两处）：
// 金=流金 #D9B45B（design-system 色板）、绿=灵草绿 #7FBF7F、青白=primary-50 #EEF5F0
const GOLD = '#D9B45B'
const GREEN = '#7FBF7F'
const DEW = '#EEF5F0'

// 粒子配方：数量少而淡（清雅手账调性，motion-pack.md §3.3）
const RECIPES: Record<FxKind, { count: number; color: string }> = {
  dew: { count: 12, color: DEW },
  milestone: { count: 20, color: GOLD },
  premium: { count: 24, color: GOLD },
  harvest: { count: 16, color: GREEN },
}
const MAX_PARTICLES = 64 // 同屏硬上限，触顶截断保证连续快速收获不堆积（§3.5）
const FLOAT_MS = 1000
const ANCHOR_STALE_MS = 2000

export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ---- 日志条目 → 动效映射（§3.2，有序首中即触发；纯函数便于单测，判据与 audio.ts sfxForEntry 一致）----

export function fxForEntry(e: LogEntry): { kind: FxKind; label: string | null } | null {
  if (e.title.startsWith('晨露')) return { kind: 'dew', label: null }
  if (e.title.startsWith('道心')) return { kind: 'milestone', label: null } // 里程碑日志；真突破 title 为「突破 ·」，不命中
  if (e.icon === '🌾') {
    // 收获条目 text 形如「+N 株，修为 +X[，灵性涌现 +1 上品]…」（farming.ts）；上品是 text 附注
    const premium = e.text.includes('灵性涌现')
    const got = /^\+(\d+) 株/.exec(e.text)
    return { kind: premium ? 'premium' : 'harvest', label: premium ? '上品 +1' : got ? `+${got[1]} 株` : null }
  }
  return null // 播种/买卖/失窃等已有音效与 toast，不加粒子（克制口径，§3.2 表第 5 行）
}

// ---- 锚点（§3.2）：收获是点击动作，FieldCard 在 dispatch 前记下按钮位置 ----

let lastAnchor: { x: number; y: number; at: number } | null = null

export function setHarvestAnchor(el: Element): void {
  const r = el.getBoundingClientRect()
  lastAnchor = { x: r.left + r.width / 2, y: r.top + r.height / 2, at: Date.now() }
}

// 一批日志差量只触发首个命中的动效（与音效一致，避免日结多条目叠置）；
// 晨露/里程碑无点击锚点，取屏幕中上固定点；收获锚点一次性消费，过期视为无锚点走兜底
export function fxForEntries(entries: LogEntry[]): void {
  for (const e of entries) {
    const fx = fxForEntry(e)
    if (!fx) continue
    const anchored = fx.kind === 'harvest' || fx.kind === 'premium'
    const a =
      anchored && lastAnchor && Date.now() - lastAnchor.at < ANCHOR_STALE_MS
        ? (lastAnchor as { x: number; y: number })
        : { x: typeof innerWidth === 'number' ? innerWidth / 2 : 400, y: typeof innerHeight === 'number' ? Math.max(120, innerHeight / 3) : 240 }
    if (anchored) lastAnchor = null
    burst(fx.kind, a.x, a.y)
    if (fx.label) floatText(fx.label, fx.kind, a.x, a.y)
    return
  }
}

// ---- 粒子引擎（懒建全屏 canvas，z-45：内容之上、弹层 z-50 之下；无粒子即停帧）----

type P = { x: number; y: number; vx: number; vy: number; life: number; age: number; size: number; color: string }
let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let particles: P[] = []
let raf = 0
let lastT = 0

function ensureCanvas(): void {
  if (canvas || typeof document === 'undefined') return
  canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;inset:0;z-index:45;pointer-events:none' // 永不拦截操作（§3.5）
  document.body.appendChild(canvas)
  ctx = canvas.getContext('2d')
  resize()
}
function resize(): void {
  if (!canvas) return
  const dpr = Math.min(devicePixelRatio || 1, 2) // DPR 上限 2（§3.5）
  canvas.width = innerWidth * dpr
  canvas.height = innerHeight * dpr
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

export function burst(kind: FxKind, x: number, y: number): void {
  if (reducedMotion() || typeof document === 'undefined') return
  ensureCanvas()
  if (!ctx) return // canvas 不可用（极端环境）：静默跳过，功能不受影响（§4 状态表）
  const n = Math.min(RECIPES[kind].count, MAX_PARTICLES - particles.length)
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6 // 向上扇形
    const speed = 1.6 + Math.random() * 2.2
    particles.push({
      x, y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      life: 900 + Math.random() * 500,
      age: 0,
      size: 2 + Math.random() * 2,
      color: RECIPES[kind].color,
    })
  }
  if (!raf) {
    lastT = 0
    raf = requestAnimationFrame(tick)
  }
}

function tick(t: number): void {
  const dt = lastT ? Math.min(t - lastT, 50) : 16
  lastT = t
  particles = particles.filter((p) => p.age < p.life)
  if (!ctx || !canvas) {
    raf = 0
    return
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (const p of particles) {
    p.age += dt
    p.x += p.vx * (dt / 16)
    p.y += p.vy * (dt / 16)
    p.vy += 0.06 * (dt / 16) // 轻重力
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life)
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  if (particles.length) raf = requestAnimationFrame(tick)
  else {
    raf = 0 // 粒子耗尽停帧（§3.5）
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
}

// ---- 飘字（fx-float-text 关键帧在 theme.css；reduced-motion 下 CSS 静态显示，仍按时长清理）----

let overlay: HTMLDivElement | null = null

export function floatText(text: string, kind: FxKind, x: number, y: number): void {
  if (typeof document === 'undefined') return
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:46;pointer-events:none'
    document.body.appendChild(overlay)
  }
  const el = document.createElement('div')
  el.textContent = text
  el.className = `fx-float-text${kind === 'premium' ? ' fx-float-gold' : ''}`
  el.style.left = `${x}px`
  el.style.top = `${y}px`
  overlay.appendChild(el)
  setTimeout(() => el.remove(), FLOAT_MS)
}
