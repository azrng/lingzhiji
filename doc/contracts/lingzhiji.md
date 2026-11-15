---
doc_id: CON-INDEX-LINGZHIJI
doc_type: contract-index
module: lingzhiji
status: approved
last_updated: 2026-11-15
relations:
  - doc/contracts/lingzhiji/save-data.md
  - doc/design/architecture.md
---

# lingzhiji 契约索引

| 编号 | 名称 | 状态 | 来源 | 用途 |
|---|---|---|---|---|
| CON-LINGZHIJI-SAVE-001 | 存档数据结构 v1 | superseded（已落地为代码） | `src/game/types.ts`、`src/game/save.ts`（历史草案：`doc/contracts/lingzhiji/save-data.md`） | localStorage 存档与导出/导入导码的结构定义；阶段 1 已落地，代码为最终事实来源 |
| CON-LINGZHIJI-WLIB-001 | 词库 JSON 结构 | approved（事实来源：数据文件本身） | `src/data/words/cet4.json` / `src/data/words/cet6.json` | 任务堂抽题与干扰项生成的输入；字段与口径见 PRD §8.1（word / meaning / phonetic 暂空 / group 近义组），加载口径见 `src/game/wordbank.ts`。group 于 2026-11-15 由 `scripts/word-groups.ts`（npm run words:groups）生成：按与运行时 `meaningParts` 相同的切片口径，取「片段包含关系」（片段长度 ≥2、长度差 ≤3）做**直接配对**（不做传递合并），每对分配稳定 id `g-<库>-<序号>` 写入两词的 `group` 数组；空 `group` 表示未配对。脚本幂等、全量覆盖 group 字段，非人工语义标注 |
