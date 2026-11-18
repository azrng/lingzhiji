import { afterEach, describe, expect, it, vi } from 'vitest'
import { realDayIndex } from '../clock'
import { createInitialState } from '../engine'
import { exportCode, importCode, load, SAVE_KEY, SAVE_VERSION } from '../save'
import type { GameState } from '../types'
import { useGameStore } from '../../stores/useGameStore'

afterEach(() => vi.unstubAllGlobals())

describe('开始页存档恢复', () => {
  it('成功导入备份并进入保存的游戏', () => {
    const data = new Map([[SAVE_KEY, '损坏的旧档']])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    })
    const saved = createInitialState(7)
    saved.day = 12
    const result = useGameStore.getState().importSaved(exportCode(saved))
    expect(result.ok).toBe(true)
    expect(useGameStore.getState().started).toBe(true)
    expect(useGameStore.getState().game.day).toBe(12)
    expect(JSON.parse(data.get(SAVE_KEY)!).game.day).toBe(12)
  })

  it('无效导码或写入失败时保留旧档和当前游戏', () => {
    const old = '损坏的旧档'
    vi.stubGlobal('localStorage', {
      getItem: () => old,
      setItem: () => { throw new Error('存储不可写') },
    })
    const before = useGameStore.getState().game
    expect(useGameStore.getState().importSaved('无效导码').ok).toBe(false)
    expect(useGameStore.getState().importSaved(exportCode(createInitialState(9))).reason).toBe('SAVE_FAILED')
    expect(useGameStore.getState().game).toBe(before)
    expect(localStorage.getItem(SAVE_KEY)).toBe(old)
  })
})

describe('存档 v1 → v2 迁移（real-day.md §3.6）', () => {
  // 与 exportCode 同构的编码（便于手工指定 version 构造 v1 风格导码）
  const encode = (data: unknown): string => {
    const bytes = new TextEncoder().encode(JSON.stringify(data))
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin)
  }

  // v1 结构存档：不含 realDay / streak 字段
  function v1Save() {
    const g = createInitialState(11)
    const game: Partial<GameState> = { ...g }
    delete game.realDay
    delete game.streak
    return { version: 1, savedAt: 1_700_000_000_000, game: game as GameState }
  }

  function stubStorage(items: Record<string, string>) {
    const data = new Map(Object.entries(items))
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    })
  }

  it('SAVE_VERSION 升至 5，SAVE_KEY 保持 v1 键名（键名与版本号解耦防丢档）', () => {
    expect(SAVE_VERSION).toBe(5)
    expect(SAVE_KEY).toBe('lingzhiji.save.v1')
  })

  it('load：v1 结构 → 迁移补默认字段 → 校验通过，连胜从 0 起算', () => {
    stubStorage({ [SAVE_KEY]: JSON.stringify(v1Save()) })
    const before = realDayIndex(Date.now())
    const r = load()
    expect(r.ok).toBe(true)
    // 迁移时刻的现实日索引（容忍用例跨 4 点日切的极小概率）
    expect(r.state!.realDay.today).toBeGreaterThanOrEqual(before)
    expect(r.state!.realDay.today).toBeLessThanOrEqual(realDayIndex(Date.now()))
    expect(r.state!.streak).toEqual({ count: 0, best: 0, lastCheckinDay: -1, checkins: 0, freezes: 0, milestones: [], history: [] })
    // 旧档原有进度无损
    expect(r.state!.day).toBe(1)
    expect(r.state!.resources.stones).toBe(50)
  })

  it('importCode：v1 风格导码可导入（迁移后校验通过）', () => {
    const r = importCode(encode(v1Save()))
    expect(r.ok).toBe(true)
    expect(r.state!.streak.count).toBe(0)
  })

  it('v2 脏值被 validate 拦截：freezes 超上限 / history 降序或重复 / milestones 非法 / today 负数', () => {
    const wrap = (game: GameState) => encode({ version: 2, savedAt: 0, game })
    const dirty = (mutate: (g: GameState) => void) => {
      const g = structuredClone(createInitialState(5))
      mutate(g)
      return importCode(wrap(g)).reason
    }
    expect(dirty((g) => { g.streak.freezes = 3 })).toBe('BAD_SHAPE')
    expect(dirty((g) => { g.streak.history = [5, 3] })).toBe('BAD_SHAPE')
    expect(dirty((g) => { g.streak.history = [3, 3] })).toBe('BAD_SHAPE')
    expect(dirty((g) => { g.streak.milestones = [8] })).toBe('BAD_SHAPE')
    expect(dirty((g) => { g.realDay.today = -1 })).toBe('BAD_SHAPE')
    expect(dirty((g) => { g.streak.lastCheckinDay = -2 })).toBe('BAD_SHAPE')
  })

  it('非正整数或超前版本拒绝（BAD_VERSION）', () => {
    const g = createInitialState(5)
    expect(importCode(encode({ version: 6, savedAt: 0, game: g })).reason).toBe('BAD_VERSION')
    expect(importCode(encode({ version: 0, savedAt: 0, game: g })).reason).toBe('BAD_VERSION')
    expect(importCode(encode({ version: '2', savedAt: 0, game: g })).reason).toBe('BAD_VERSION')
  })

  it('quiz 会话新题型校验按 kind 分流：c2w/listen 选项含正确单词判合法，正确项缺失仍拦截', () => {
    // 修复前：非 spell 题一律要求 opts 含 meaning → 含 c2w/listen 的存档被误判 BAD_SHAPE（测验中途刷新即丢档）
    const withSession = (kind: 'c2w' | 'listen' | 'w2c', opts: string[]) => {
      const g = structuredClone(createInitialState(5))
      g.quizDaily.session = {
        lib: 'cet4',
        questions: [
          { word: 'colony', meaning: 'n. 殖民地', from: 'review', opts, kind },
          ...Array.from({ length: 9 }, () => ({ word: 'apple', meaning: 'n. 苹果', from: 'new' as const, opts: ['n. 苹果', 'n. 梨', 'n. 橙', 'n. 桃'], kind: 'w2c' as const })),
        ],
        idx: 0,
        answers: Array(10).fill(null),
        phase: 'learning',
      }
      return importCode(exportCode(g))
    }
    expect(withSession('c2w', ['airport', 'colony', 'angle', 'animal']).ok).toBe(true)
    expect(withSession('listen', ['colony', 'apply', 'approach', 'april']).ok).toBe(true)
    // 正确项缺失仍拦截：c2w/listen 不含正确单词
    expect(withSession('c2w', ['airport', 'airports', 'angle', 'animal']).reason).toBe('BAD_SHAPE')
    expect(withSession('listen', ['apply', 'approach', 'april', 'applies']).reason).toBe('BAD_SHAPE')
    // w2c 不含正确释义仍拦截（旧拦截口径保持）
    expect(withSession('w2c', ['n. 殖民', 'n. 殖民地面积', 'n. 角度', 'n. 动物']).reason).toBe('BAD_SHAPE')
  })
})

describe('存档 v4 → v5 迁移（time-decouple.md §3.5）', () => {
  const encode2 = (data: unknown): string => {
    const bytes = new TextEncoder().encode(JSON.stringify(data))
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin)
  }

  // v4 结构存档：realDay 含 gamesToday、田块按旧生长期（15~60 天）记录进度
  function v4Save(mutate?: (g: GameState) => void) {
    const g = createInitialState(21)
    g.gongfa = 1
    g.fields = [
      { id: 1, status: 'growing', herb: 'qingling', progress: 9, curYield: 5, dry: 0, halved: false, fertility: 1 }, // 9/15 → 3/5
      { id: 2, status: 'growing', herb: 'ninglu', progress: 14, curYield: 4, dry: 0, halved: false, fertility: 1 }, // 14/20 → 5/7
      { id: 3, status: 'empty', fertility: 1 },
    ]
    g.quizDaily.done = true
    ;(g.realDay as unknown as Record<string, unknown>).gamesToday = 2
    mutate?.(g)
    return { version: 4, savedAt: 1_700_000_000_000, game: g }
  }

  it('生长中田块进度按新旧天数比例折算；gamesToday 删除；quizDaily.done 保持', () => {
    const r = importCode(encode2(v4Save()))
    expect(r.ok).toBe(true)
    const fields = r.state!.fields
    expect(fields[0]).toMatchObject({ status: 'growing', progress: 3 }) // round(9 × 5/15)
    expect(fields[1]).toMatchObject({ status: 'growing', progress: 5 }) // round(14 × 7/20)
    expect(fields[2].status).toBe('empty')
    expect(r.state!.realDay).toEqual({ today: r.state!.realDay.today })
    expect('gamesToday' in (r.state!.realDay as unknown as Record<string, unknown>)).toBe(false)
    // 迁移时刻已完成测验：当日不再重复发奖
    expect(r.state!.quizDaily.done).toBe(true)
  })

  it('折算后恰达新生长期即置成熟（不丢收成）；功法 Lv2 按新 effDays 判定', () => {
    const r = importCode(encode2(v4Save((g) => {
      g.gongfa = 2 // 新 effDays(qingling)=4
      g.fields[0].progress = 12 // round(12 × 5/15) = 4 ≥ 4 → 成熟
      g.fields[1].progress = 8 // round(8 × 7/20) = 3 < 6 → 仍在长
    })))
    expect(r.ok).toBe(true)
    expect(r.state!.fields[0]).toMatchObject({ status: 'mature', progress: 4 })
    expect(r.state!.fields[1]).toMatchObject({ status: 'growing', progress: 3 })
  })

  it('已成熟与空田不动；v5 导码直接通过不重复迁移', () => {
    const base = v4Save()
    base.game.fields[0] = { id: 1, status: 'mature', herb: 'qingling', progress: 15, curYield: 5, dry: 0, halved: false, fertility: 1 }
    const r = importCode(encode2(base))
    expect(r.state!.fields[0]).toMatchObject({ status: 'mature', progress: 15 })
    // 当前版本导码（version 5）导入不受迁移影响
    const fresh = exportCode(createInitialState(6))
    expect(importCode(fresh).ok).toBe(true)
  })
})
