import { useEffect, useRef } from 'react'
import { installSfxClick, setBgmScene } from './audio'
import TopBar from './components/TopBar'
import FieldGrid from './components/FieldGrid'
import ActionPanel from './components/ActionPanel'
import DayLog from './components/DayLog'
import QuizModal from './components/QuizModal'
import MarketPanel from './components/MarketPanel'
import QuotaModal from './components/QuotaModal'
import MilestoneScreen from './components/MilestoneScreen'
import SettingsModal from './components/SettingsModal'
import MeditateModal from './components/MeditateModal'
import CommissionModal from './components/CommissionModal'
import DebugPanel from './components/DebugPanel'
import StartScreen from './screens/StartScreen'
import Tutorial from './components/Tutorial'
import { EventToasts, TabBanner } from './components/EventToast'
import { useGameStore } from './stores/useGameStore'
import { useUiStore } from './stores/useUiStore'

export default function App() {
  const started = useGameStore((s) => s.started)
  // 全局 UI 点击音与音频手势解锁（audio-impl.md §3.4），整页只装一次
  useEffect(() => {
    installSfxClick()
  }, [])
  return started ? <GameScreen /> : <StartScreen />
}

function GameScreen() {
  const game = useGameStore((s) => s.game)
  const phase = game.phase
  const milestonePending = game.realm >= 9 && !game.milestoneShown
  const tutorialDone = game.tutorialDone
  const saveError = useGameStore((s) => s.saveError)
  const setTutorialStep = useUiStore((s) => s.setTutorialStep)
  const pushToasts = useUiStore((s) => s.pushToasts)
  const quizOpen = useUiStore((s) => s.quizOpen)
  const marketOpen = useUiStore((s) => s.marketOpen)
  const settingsOpen = useUiStore((s) => s.settingsOpen)
  const commissionOpen = useUiStore((s) => s.commissionOpen)
  const tutorialStep = useUiStore((s) => s.tutorialStep)
  const meditateOpen = useUiStore((s) => s.meditateOpen)

  // 日志差量 → toast：dispatch 更新 game 后，与上次快照比对新增条目
  const lastLogRef = useRef<string[] | null>(null)
  useEffect(() => {
    const current = game.log.map((entry) => JSON.stringify(entry))
    const previous = lastLogRef.current
    lastLogRef.current = current
    // 首次渲染只建立基线；日志满 50 条后，长度不变也要识别新增条目。
    if (previous === null) return
    let overlap = Math.min(previous.length, current.length)
    while (overlap > 0 && !current.slice(current.length - overlap).every((entry, index) => entry === previous[index])) {
      overlap -= 1
    }
    if (overlap === 0 && previous.length > 0) {
      // 重置或导入的日志与旧日志无交集，不把历史记录当作新提示。
      return
    }
    const fresh = game.log.slice(0, current.length - overlap).reverse()
    if (fresh.length) pushToasts(fresh)
  }, [game.log, pushToasts])

  // 新档未完成引导时展示 3 步引导
  useEffect(() => {
    if (!tutorialDone) setTutorialStep(1)
  }, [tutorialDone, setTutorialStep])

  // 主界面 BGM = 灵田曲（audio-impl.md §3.3）；挂载时用户已从开始页点击进入，手势解锁已成立
  useEffect(() => {
    setBgmScene('field')
    return () => setBgmScene(null)
  }, [])

  return (
    <div className="game-world min-h-screen px-4 py-5 sm:px-6 lg:px-10 lg:py-7">
      <div className="relative mx-auto max-w-[1440px]">
        <TopBar />
        <div className="flex gap-5 flex-col lg:flex-row items-stretch">
          <main className="flex-1 flex flex-col gap-5 min-w-0">
            <FieldGrid />
            <ActionPanel />
          </main>
          <DayLog />
        </div>
      </div>

      {/* 弹层：全屏层（任务堂）独占；月末定额强制置顶，不可关闭 */}
      {phase === 'quota' && <QuotaModal />}
      {phase !== 'quota' && quizOpen && <QuizModal />}
      {phase !== 'quota' && marketOpen && <MarketPanel />}
      {phase !== 'quota' && settingsOpen && <SettingsModal />}
      {phase !== 'quota' && commissionOpen && <CommissionModal />}
      {phase !== 'quota' && meditateOpen && <MeditateModal />}
      {milestonePending && <MilestoneScreen />}
      {tutorialStep > 0 && phase !== 'quota' && <Tutorial />}
      {saveError && (
        <div className="fixed bottom-4 right-4 z-[60] bg-warning-50 border border-warning-200 text-warning-500 text-xs rounded-lg px-3 py-2 shadow-lg">
          {saveError}
        </div>
      )}
      <EventToasts />
      <TabBanner />
      <DebugPanel />
    </div>
  )
}
