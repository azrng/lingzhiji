import { assetUrl } from '../assetUrl'
import type { CharacterId } from './types'

// image 为空串表示立绘未交付（T37 新角色过渡态）：开始页卡片与预览区显示 emblem 徽记兜底，
// PNG 落 public/assets/ 后把路径填回即可点亮，UI 代码不动
export const characters: { id: CharacterId; name: string; role: string; description: string; image: string; tone: string; emblem: string }[] = [
  { id: 'junior-sister', name: '可爱小师妹', role: '灵植新秀', description: '带着一株刚发芽的青灵草，第一次踏入灵植堂。', image: assetUrl('character-junior-sister-v2.png'), tone: 'from-success-50 to-gold-pale', emblem: '' },
  { id: 'senior-brother', name: '帅气师兄', role: '剑修弟子', description: '眉目清朗，腰间佩剑，也懂得照料一方灵田。', image: assetUrl('character-senior-brother-v2.png'), tone: 'from-info-100 to-primary-50', emblem: '' },
  { id: 'senior-sister', name: '性感师姐', role: '灵植前辈', description: '从容明艳的灵植堂师姐，衣袂间带着草木清香。', image: assetUrl('character-senior-sister-v2.png'), tone: 'from-error-100 to-gold-pale', emblem: '' },
  { id: 'sweeping-monk', name: '光头扫地僧', role: '藏经阁杂役', description: '藏经阁前扫了三十年地，落叶从不隔夜；路过灵田时，会顺手替蔫掉的灵草扶正支架。', image: '', tone: 'from-primary-50 to-info-100', emblem: '🧹' },
  { id: 'junior-brother', name: '帅气小师弟', role: '灵圃学徒', description: '与小师妹同期入门，爱笑爱闹，袖口总沾着灵田的泥；手里的锄头比他还高半头。', image: '', tone: 'from-success-50 to-gold-pale', emblem: '🌱' },
  { id: 'eldest-brother', name: '憨厚大师兄', role: '炼体弟子', description: '一拳能裂石，一指能捏种；翻地从不用锄头，外门弟子的田垄多半是他帮忙开的。', image: '', tone: 'from-error-100 to-primary-50', emblem: '💪' },
  { id: 'bookworm', name: '书痴师弟', role: '藏经书虫', description: '抱着比自己脑袋还高的书堆路过灵田，念念有词——背的是万年前的《灵植谱》残卷。', image: '', tone: 'from-info-100 to-gray-100', emblem: '📚' },
  { id: 'old-herbalist', name: '药锄老翁', role: '老圃前辈', description: '草帽药锄，在灵植堂的年头比掌门还久；瞥一眼叶子，就知道它昨晚有没有偷懒。', image: '', tone: 'from-gold-pale to-success-50', emblem: '👴' },
]

// 旧存档没有形象字段：旧弟子立绘已淘汰，回退默认小师妹新立绘（2026-11-16 用户确认旧图废弃）。
// 空串 image（T37 立绘未交付的新角色）同样回退：|| 而非 ??，避免游戏内形象破图
export function characterImage(id?: CharacterId): string {
  return characters.find((character) => character.id === id)?.image || characters[0].image
}
