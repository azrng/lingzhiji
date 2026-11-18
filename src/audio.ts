// 氛围音频（audio-impl.md / DES-LINGZHIJI-AUDIO-IMPL）：
// 唯一触碰 howler 与 AudioContext 的模块，引擎纯逻辑层零音频依赖，UI 层只调用本模块导出的函数。
// howler 动态懒加载：模块顶层无 howler 运行时依赖，vitest 与首屏 bundle 不受影响，首次播放才加载库。
import { assetUrl } from './assetUrl'
import type { Howl, HowlOptions } from 'howler'
import type { LogEntry } from './game/types'

type HowlCtor = new (options: HowlOptions) => Howl

export type SfxId =
  | 'click' | 'plant' | 'harvest' | 'premium' | 'gain'
  | 'steal' | 'checkin' | 'dew' | 'tide' | 'milestone'
export type BgmScene = 'field' | 'study'
// voice=单词发音开关（独立于音效）；autoRead=答题后自动朗读（srs-audio.md §3.2，随 M2 扩展）
export type AudioPrefs = { bgm: boolean; sfx: boolean; voice: boolean; autoRead: boolean }

const PREFS_KEY = 'lingzhiji.audio'
// BGM 音量按场景：任务堂降到 0.25 给单词发音让出清晰度（T43 试玩反馈 BGM 盖住读音；
// 答题自动朗读频繁，不做朗读时闪避以免 BGM 反复起伏，低音量常驻更稳）
const BGM_VOLUME: Record<BgmScene, number> = { field: 0.5, study: 0.25 }
const SFX_VOLUME = 0.8
const CLICK_VOLUME = 0.3
const FADE_MS = 1000

const BGM_FILES: Record<BgmScene, string> = {
  field: 'audio/bgm-field.mp3', // 灵田主界面：山水心声（mood-pack-audio.md BGM-1）
  study: 'audio/bgm-study.mp3', // 任务堂：Chinese Tea（BGM-2）
}
const SFX_FILES: Record<SfxId, string> = {
  click: 'audio/sfx-click.mp3',
  plant: 'audio/sfx-plant.mp3',
  harvest: 'audio/sfx-harvest.mp3',
  premium: 'audio/sfx-premium.mp3',
  gain: 'audio/sfx-gain.mp3',
  steal: 'audio/sfx-steal.mp3',
  checkin: 'audio/sfx-checkin.mp3',
  dew: 'audio/sfx-dew.mp3',
  tide: 'audio/sfx-tide.mp3',
  milestone: 'audio/sfx-milestone.mp3',
}

// ---- 偏好（设备级浏览器本地数据，不入存档导码，§3.2）----

export function loadPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { bgm: true, sfx: true, voice: true, autoRead: true }
    const parsed = JSON.parse(raw) as Partial<AudioPrefs>
    // 旧键缺 voice/autoRead 字段：默认开（发音是增强项，随 M2 上线对老玩家直接生效）
    return { bgm: parsed.bgm !== false, sfx: parsed.sfx !== false, voice: parsed.voice !== false, autoRead: parsed.autoRead !== false }
  } catch {
    // 键损坏或环境无 localStorage：回默认全开
    return { bgm: true, sfx: true, voice: true, autoRead: true }
  }
}

export function savePrefs(prefs: AudioPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // 隐私模式等写入失败：静默忽略，开关仍影响本页会话
  }
}

export function setVoiceEnabled(on: boolean): void {
  prefs = { ...prefs, voice: on }
  savePrefs(prefs)
}

export function setAutoReadEnabled(on: boolean): void {
  prefs = { ...prefs, autoRead: on }
  savePrefs(prefs)
}

// ---- 单词发音（srs-audio.md §3.2，M2）----
// Web Speech 为主、有道 dictvoice 兜底（2026-11-17 拍板 A）；全部失败静默返回 false，发音是增强项。

// Web Speech 可用性（仅判定 API 存在；无 en voice 时 speak 内部走兜底）
export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined'
}

export async function speak(word: string): Promise<boolean> {
  if (!prefs.voice || !word.trim()) return false
  if (speechAvailable()) {
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'))
    if (voices.length > 0) {
      const utter = new SpeechSynthesisUtterance(word)
      utter.lang = 'en-US'
      utter.voice = voices[0]
      utter.rate = 0.9 // 学习场景稍慢
      window.speechSynthesis.cancel() // 连续作答时不叠音
      window.speechSynthesis.speak(utter)
      return true
    }
  }
  // 有道 dictvoice 兜底：new Audio().play() 需手势解锁，本函数只从点击处理器/已解锁页调用
  try {
    const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word.trim())}&type=1`)
    await audio.play()
    return true
  } catch {
    return false // 自动播放被挡或网络不可用：静默（听音题有「再听一次」按钮可重试）
  }
}

// ---- 日志条目 → 音效映射（§3.4，有序首中即播；纯函数便于单测）----

export function sfxForEntry(e: LogEntry): SfxId | null {
  if (e.title.startsWith('晨露')) return 'dew'
  if (e.title.startsWith('灵潮')) return 'tide'
  if (e.title.startsWith('道心')) return 'milestone' // 里程碑日志「道心 N 天 · 称号」；真突破为「突破 ·」，不命中
  if (e.kind === 'event' && e.title.includes('失窃')) return 'steal' // 只配灵石失窃，灵雀偷食等未选音效
  if (e.icon === '🌾') return e.text.includes('灵性涌现') ? 'premium' : 'harvest' // 上品是收获条目的 text 附注，同条目只播一声
  if (e.icon === '🌱') return 'plant'
  if (e.title.startsWith('出售') || e.title.startsWith('购买')) return 'gain'
  return null // 其余（含手动 toast）不配音
}

// ---- 播放（懒初始化 + 模块级单例状态）----

let unlocked = false
let prefs = loadPrefs()
let HowlCtor: HowlCtor | null = null
const sfxCache = new Map<SfxId, Howl>()
const bgmCache = new Map<BgmScene, Howl>()
let currentBgm: Howl | null = null
let desiredScene: BgmScene | null = null
let bgmGen = 0

async function ensureCtor(): Promise<HowlCtor> {
  if (!HowlCtor) {
    // howler 为 UMD 包：经 Vite 预打包后类挂在命名空间 Howl 或 default（整个导出对象）上，两者兜底取其一
    const mod = (await import('howler')) as { Howl?: HowlCtor; default?: HowlCtor | { Howl?: HowlCtor } }
    const direct = mod.Howl ?? (typeof mod.default === 'function' ? mod.default : mod.default?.Howl)
    if (!direct) throw new Error('howler 加载失败：未找到 Howl 构造器')
    HowlCtor = direct
  }
  return HowlCtor
}

export function playSfx(id: SfxId, volume = SFX_VOLUME): void {
  if (!unlocked || !prefs.sfx) return
  void ensureCtor()
    .then((Ctor) => {
      let howl = sfxCache.get(id)
      if (!howl) {
        howl = new Ctor({ src: [assetUrl(SFX_FILES[id])], volume })
        sfxCache.set(id, howl)
      }
      howl.volume(volume) // click 等低音量通道复用同一缓存实例
      howl.play()
    })
    .catch(() => {
      // 解码失败/文件缺失：跳过该声音，不影响游戏流程（§5）
    })
}

// 与 toast 同源：一批日志差量只播首个命中的音效，避免日结多条目声音叠置
export function playSfxForEntries(entries: LogEntry[]): void {
  for (const e of entries) {
    const id = sfxForEntry(e)
    if (id) {
      playSfx(id)
      return
    }
  }
}

export function setBgmScene(scene: BgmScene | null): void {
  desiredScene = scene
  applyBgm()
}

export function setBgmEnabled(on: boolean): void {
  prefs = { ...prefs, bgm: on }
  savePrefs(prefs)
  applyBgm()
}

export function setSfxEnabled(on: boolean): void {
  prefs = { ...prefs, sfx: on }
  savePrefs(prefs)
}

// BGM 状态机（§3.3）：期望场景 × 手势解锁 × 开关 → 当前曲。
// gen 计数器实现 last-write-wins：加载期间再切换则放弃旧请求；旧曲淡出后停（缓存保留，切回免重解码）。
function applyBgm(): void {
  const scene = unlocked && prefs.bgm ? desiredScene : null
  const gen = ++bgmGen
  if (currentBgm) {
    const old = currentBgm
    currentBgm = null
    old.fade(old.volume(), 0, FADE_MS)
    setTimeout(() => {
      if (currentBgm !== old) old.stop()
    }, FADE_MS)
  }
  if (!scene) return
  void ensureCtor()
    .then((Ctor) => {
      if (gen !== bgmGen) return
      let howl = bgmCache.get(scene)
      if (!howl) {
        howl = new Ctor({ src: [assetUrl(BGM_FILES[scene])], loop: true, volume: 0 })
        bgmCache.set(scene, howl)
      }
      currentBgm = howl
      howl.play()
      howl.fade(0, BGM_VOLUME[scene], FADE_MS)
    })
    .catch(() => {
      // BGM 加载失败：静默，游戏可玩性不受影响（§5）
    })
}

// 全局 UI 点击音：一个 document 级监听覆盖全部现有与未来按钮，不为逐个按钮接线（§3.4）。
// 同时以首次 pointerdown 作为浏览器手势解锁信号（自动播放限制，§3.3）。
let installed = false
export function installSfxClick(): void {
  if (installed || typeof document === 'undefined') return
  installed = true
  document.addEventListener(
    'pointerdown',
    () => {
      unlocked = true
      // 刷新后进入游戏时解锁晚于场景设置：解锁即补播当前场景 BGM（开始页正常路径本就先解锁后挂载）
      applyBgm()
    },
    { once: true, capture: true },
  )
  document.addEventListener('click', (e) => {
    if (!unlocked) return
    const target = e.target instanceof Element ? e.target : null
    const btn = target?.closest('button')
    if (!btn) return
    playSfx('click', CLICK_VOLUME)
  })
}
