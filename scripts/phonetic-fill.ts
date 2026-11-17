// 词库音标填充（srs-audio.md §3.3）：读 ECDICT 精简版 csv，按 word 匹配填 phonetic 字段。
// 用法：npm run words:phonetic（csv 放 D:\temp\ecdict\ecdict.mini.csv，仓库外；词库 JSON 原地更新）。
// ECDICT（MIT，github.com/skywind3000/ECDICT）只在构建期使用，不进运行时与仓库依赖。
import { readFileSync, writeFileSync } from 'node:fs'

const CSV_PATH = process.env.ECDICT_CSV ?? 'D:/temp/ecdict/ecdict.mini.csv'
const LIBS = [
  { file: 'src/data/words/cet4.json' },
  { file: 'src/data/words/cet6.json' },
]

// 轻量 csv 行解析（ECDICT 无引号内逗号，直接 split 即可）；列序：word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio
function parseCsvLine(line: string): string[] {
  return line.split(',')
}

function main(): void {
  let raw: string
  try {
    raw = readFileSync(CSV_PATH, 'utf8')
  } catch {
    console.error(`未找到 ECDICT 数据：${CSV_PATH}`)
    console.error('下载 ecdict.mini.csv（见 doc/design/lingzhiji/roadmap-assets.md）或设 ECDICT_CSV 指向实际路径')
    process.exit(1)
  }
  const lines = raw.split('\n')
  const dict = new Map<string, string>()
  for (const line of lines.slice(1)) {
    if (!line) continue
    const cols = parseCsvLine(line)
    const word = cols[0]?.trim().toLowerCase()
    const phonetic = cols[1]?.trim()
    if (word && phonetic) dict.set(word, phonetic)
  }
  console.log(`ECDICT 词条：${dict.size}`)

  for (const lib of LIBS) {
    const entries = JSON.parse(readFileSync(lib.file, 'utf8')) as { word: string; phonetic: string }[]
    let hit = 0
    for (const entry of entries) {
      const phonetic = dict.get(entry.word.trim().toLowerCase())
      if (phonetic) {
        entry.phonetic = phonetic
        hit += 1
      }
    }
    // 保持与既有 words:groups 脚本一致的最小化输出（键序稳定）
    writeFileSync(lib.file, JSON.stringify(entries), 'utf8')
    console.log(`${lib.file}: ${entries.length} 词，命中音标 ${hit}（${Math.round((hit / entries.length) * 100)}%）`)
  }
}

main()
