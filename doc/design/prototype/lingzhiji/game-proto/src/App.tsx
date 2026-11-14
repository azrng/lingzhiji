import { useGame } from './store'
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
import StartScreen from './components/StartScreen'
import { EventToasts, TabBanner } from './components/EventToast'

export default function App() {
  const started = useGame((s) => s.started)
  // 早退分支前只做一次订阅，hook 数量保持稳定
  return started ? <GameScreen /> : <StartScreen />
}

function GameScreen() {
  const quizOpen = useGame((s) => s.quizOpen)
  const marketOpen = useGame((s) => s.marketOpen)
  const quotaOpen = useGame((s) => s.quotaOpen)
  const settingsOpen = useGame((s) => s.settingsOpen)
  const milestoneOpen = useGame((s) => s.milestoneOpen)
  const tutorialStep = useGame((s) => s.tutorialStep)

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

      {/* 弹层：全屏层独占，普通弹层互斥 */}
      {quizOpen && <QuizModal />}
      {marketOpen && <MarketPanel />}
      {quotaOpen && <QuotaModal />}
      {settingsOpen && <SettingsModal />}
      {milestoneOpen && <MilestoneScreen />}
      {tutorialStep > 0 && <Tutorial />}
      <EventToasts />
      <TabBanner />
      <DebugPanel />
    </div>
  )
}
