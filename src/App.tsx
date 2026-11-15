import { useEffect, useRef } from 'react'
import TopBar from './components/TopBar'
import FieldGrid from './components/FieldGrid'
import ActionPanel from './components/ActionPanel'
import DayLog from './components/DayLog'
import QuizModal from './components/QuizModal'
import MarketPanel from './components/MarketPanel'
import QuotaModal from './components/QuotaModal'
import MilestoneScreen from './components/MilestoneScreen'
import SettingsModal from './components/SettingsModal'
import Tutorial from './components/Tutorial'
import DebugPanel from './components/DebugPanel'
import StartScreen from './screens/StartScreen'
import { EventToasts, TabBanner } from './components/EventToast'
import { useGameStore } from './stores/useGameStore'
import { useUiStore } from './stores/useUiStore'

export default function App() {
  const started = useGameStore((s) => s.started)
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
  const tutorialStep = useUiStore((s) => s.tutorialStep)

  // 日志差量 → toast：dispatch 更新 game 后，与上次快照比对新增条目
  const lastLogRef = useRef<number | null>(null)
  useEffect(() => {
    // 首次渲染（含续档）与日志回退（重置/导入）只建立基线，不把历史日志弹成 toast
    if (lastLogRef.current === null || game.log.length < lastLogRef.current) {
      lastLogRef.current = game.log.length
      return
    }
    const fresh = game.log.slice(0, game.log.length - lastLogRef.current).reverse()
    lastLogRef.current = game.log.length
    if (fresh.length) pushToasts(fresh)
  }, [game.log, pushToasts])

  // 新档未完成引导时展示 3 步引导
  useEffect(() => {
    if (!tutorialDone) setTutorialStep(1)
  }, [tutorialDone, setTutorialStep])

  return (
    <div className="max-w-6xl mx-auto px-4 py-5 min-h-screen flex flex-col">
      <TopBar />
      <div className="flex gap-4 flex-col lg:flex-row items-stretch">
        <main className="flex-1 flex flex-col gap-4 min-w-0">
          <FieldGrid />
          <ActionPanel />
        </main>
        <DayLog />
      </div>

      {/* 弹层：全屏层（任务堂）独占；月末定额强制置顶，不可关闭 */}
      {phase === 'quota' && <QuotaModal />}
      {phase !== 'quota' && quizOpen && <QuizModal />}
      {phase !== 'quota' && marketOpen && <MarketPanel />}
      {phase !== 'quota' && settingsOpen && <SettingsModal />}
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
