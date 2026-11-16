import { assetUrl } from '../assetUrl'
import type { CharacterId } from './types'

export const characters: { id: CharacterId; name: string; role: string; description: string; image: string; tone: string }[] = [
  { id: 'junior-sister', name: '可爱小师妹', role: '灵植新秀', description: '带着一株刚发芽的青灵草，第一次踏入灵植堂。', image: assetUrl('character-junior-sister-v2.png'), tone: 'from-success-50 to-gold-pale' },
  { id: 'senior-brother', name: '帅气师兄', role: '剑修弟子', description: '眉目清朗，腰间佩剑，也懂得照料一方灵田。', image: assetUrl('character-senior-brother-v2.png'), tone: 'from-info-100 to-primary-50' },
  { id: 'senior-sister', name: '性感师姐', role: '灵植前辈', description: '从容明艳的灵植堂师姐，衣袂间带着草木清香。', image: assetUrl('character-senior-sister-v2.png'), tone: 'from-error-100 to-gold-pale' },
]

// 旧存档没有形象字段：旧弟子立绘已淘汰，回退默认小师妹新立绘（2026-11-16 用户确认旧图废弃）
export function characterImage(id?: CharacterId): string {
  return characters.find((character) => character.id === id)?.image ?? characters[0].image
}
