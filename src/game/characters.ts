import { assetUrl } from '../assetUrl'
import type { CharacterId } from './types'

// image 为空串表示暂未配置立绘：开始页卡片与预览区显示 emblem 徽记兜底。
// PNG 放入 public/assets/ 并填入 assetUrl 路径后即可显示。
export const characters: { id: CharacterId; name: string; role: string; description: string; image: string; tone: string; emblem: string }[] = [
  { id: 'junior-sister', name: '可爱小师妹', role: '灵植新秀', description: '带着一株刚发芽的青灵草，第一次踏入灵植堂。', image: assetUrl('character-junior-sister-v2.webp'), tone: 'from-success-50 to-gold-pale', emblem: '' },
  { id: 'senior-brother', name: '帅气师兄', role: '剑修弟子', description: '眉目清朗，腰间佩剑，也懂得照料一方灵田。', image: assetUrl('character-senior-brother-v2.webp'), tone: 'from-info-100 to-primary-50', emblem: '' },
  { id: 'senior-sister', name: '性感师姐', role: '灵植前辈', description: '从容明艳的灵植堂师姐，衣袂间带着草木清香。', image: assetUrl('character-senior-sister-v2.webp'), tone: 'from-error-100 to-gold-pale', emblem: '' },
  { id: 'sweeping-monk', name: '光头扫地僧', role: '藏经阁杂役', description: '藏经阁前扫了三十年地，落叶从不隔夜；路过灵田时，会顺手替蔫掉的灵草扶正支架。', image: assetUrl('character-sweeping-monk.webp'), tone: 'from-primary-50 to-info-100', emblem: '🧹' },
  { id: 'junior-brother', name: '帅气小师弟', role: '灵圃学徒', description: '与小师妹同期入门，爱笑爱闹，袖口总沾着灵田的泥；手里的锄头比他还高半头。', image: assetUrl('character-junior-brother.webp'), tone: 'from-success-50 to-gold-pale', emblem: '🌱' },
  { id: 'eldest-brother', name: '憨厚大师兄', role: '炼体弟子', description: '一拳能裂石，一指能捏种；翻地从不用锄头，外门弟子的田垄多半是他帮忙开的。', image: assetUrl('character-eldest-brother.webp'), tone: 'from-error-100 to-primary-50', emblem: '💪' },
  { id: 'bookworm', name: '书痴师弟', role: '藏经书虫', description: '抱着比自己脑袋还高的书堆路过灵田，念念有词——背的是万年前的《灵植谱》残卷。', image: assetUrl('character-bookworm.webp'), tone: 'from-info-100 to-gray-100', emblem: '📚' },
  { id: 'old-herbalist', name: '药锄老翁', role: '老圃前辈', description: '草帽药锄，在灵植堂的年头比掌门还久；瞥一眼叶子，就知道它昨晚有没有偷懒。', image: assetUrl('character-old-herbalist.webp'), tone: 'from-gold-pale to-success-50', emblem: '👴' },
]

// 旧存档没有形象字段：旧弟子立绘已淘汰，回退默认小师妹新立绘（2026-11-16 用户确认旧图废弃）。
// 无效或空串 image 同样回退：|| 而非 ??，避免游戏内形象破图
export function characterImage(id?: CharacterId): string {
  return characters.find((character) => character.id === id)?.image || characters[0].image
}
