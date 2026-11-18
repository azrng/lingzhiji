// T46 素材 WebP 瘦身批转脚本（一次性，可重复执行）
// 用法：node scripts/optimize-assets.mjs
// 行为：按 SPEC 把图片转成 .webp（已存在则跳过），原稿移入 design/original-assets/ 备份
// 参数依据 tasks/T46.md 摸底拍板：显示尺寸实测见各行注释；sheet 减半仅限网格整除安全的
import { mkdirSync, existsSync, statSync, renameSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pub = join(root, 'public', 'assets')
const backup = join(root, 'design', 'original-assets')

// half = 降采样 50%（lanczos3）；q 为 WebP 质量；in 可省略（默认 public/assets 下同名文件）
const SPEC = [
  // 角色立绘：1024x1536 显示最大 390px 高（开始页预览），减半后仍有 ~2x retina 余量
  ...['character-bookworm', 'character-eldest-brother', 'character-junior-brother', 'character-junior-sister-v2', 'character-old-herbalist', 'character-senior-brother-v2', 'character-senior-sister-v2', 'character-sweeping-monk']
    .map(n => ({ file: `${n}.png`, half: [512, 768], q: 85 })),
  // 雪碧图：Sprite 百分比定位，减半仅当网格整除保持（1536x1024/3x2、1024x1536/4x6、1280x256/5x1）
  { file: 'spirit-herbs-sheet.png', half: [768, 512], q: 85 },
  { file: 'spirit-herbs-growth-sheet.png', half: [512, 768], q: 85 },
  { file: 'event-icons-sheet-extra.png', half: [640, 128], q: 85 },
  // 奇数尺寸 sheet（1774x887/1983x793/1261x1247）减半破坏网格对齐：保持原尺寸只转格式
  { file: 'market-goods-sheet.png', q: 85 },
  { file: 'resource-icons-sheet.png', q: 85 },
  { file: 'plot-states-sheet.png', q: 85 },
  { file: 'event-icons-sheet.png', q: 85 },
  // 特效类：mist 平铺条 2048x256 显示高 88px、成熟光晕 512 显示 160px → 减半；
  // breakthrough-aura 全屏 object-cover（高分屏会放大）→ 保持原尺寸
  { file: 'fx-mist.png', half: [1024, 128], q: 85 },
  { file: 'fx-mature-glow.png', half: [256, 256], q: 85 },
  { file: 'fx-firefly.png', q: 85 },
  { file: 'breakthrough-aura.png', q: 85 },
  // 纹理与小图标：原尺寸转格式
  { file: 'quiz-paper-texture.png', q: 85 },
  ...['icon-dew', 'icon-talisman', 'icon-daoxin-candle', 'icon-nav-cave', 'icon-nav-hall', 'icon-nav-library', 'icon-nav-market']
    .map(n => ({ file: `${n}.png`, q: 85 })),
  // 场景图（M5 备用未接线，仍随 public 部署）与全局页面底图：jpg 原尺寸转 q80
  ...['scene-cave', 'scene-hall', 'scene-library', 'scene-market'].map(n => ({ file: `${n}.jpg`, q: 80 })),
  { file: 'spirit-garden-background.jpg', q: 80, in: join(root, 'src', 'assets', 'spirit-garden-background.jpg') },
]

mkdirSync(backup, { recursive: true })
const kb = (p) => (statSync(p).size / 1024).toFixed(0).padStart(5)
const rows = []
let totalBefore = 0, totalAfter = 0

for (const s of SPEC) {
  const src = s.in ?? join(pub, s.file)
  const out = join(dirname(src), s.file.replace(/\.\w+$/, '') + '.webp')
  if (!existsSync(src)) {
    rows.push({ file: s.file, note: existsSync(out) ? '已转换（原稿已备份）' : '!! 源文件缺失' })
    continue
  }
  if (!existsSync(out)) {
    let pipe = sharp(src)
    if (s.half) pipe = pipe.resize(s.half[0], s.half[1], { kernel: 'lanczos3' })
    await pipe.webp({ quality: s.q, effort: 4 }).toFile(out)
  }
  // 原稿移入备份目录（保留原始文件名，git 识别为 rename）
  const bak = join(backup, s.file)
  if (!existsSync(bak)) renameSync(src, bak)
  const before = statSync(bak).size, after = statSync(out).size
  totalBefore += before; totalAfter += after
  rows.push({ file: s.file, before: kb(bak) + 'KB', after: kb(out) + 'KB', pct: (after / before * 100).toFixed(1) + '%' })
}

console.table(rows)
console.log(`合计：${(totalBefore / 1048576).toFixed(1)}MB -> ${(totalAfter / 1048576).toFixed(1)}MB（${(totalAfter / totalBefore * 100).toFixed(1)}%）`)
console.log(`原稿备份目录：${backup}`)
