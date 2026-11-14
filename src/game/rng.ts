// 可播种随机数（mulberry32）：随机数状态存于 GameState.rngState 并随档保存，
// 保证单测与平衡模拟器注入固定种子后整局可复现。game 层禁止使用 Math.random()。

export interface Rng {
  next: () => number
  state: () => number
}

export function createRng(state: number): Rng {
  let s = state >>> 0
  return {
    next: () => {
      s = (s + 0x6d2b79f5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    state: () => s,
  }
}

// 从数组随机取 1 个（调用方保证数组非空）
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng.next() * arr.length)]
}

// 返回打乱后的新数组（Fisher–Yates）
export function shuffled<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
