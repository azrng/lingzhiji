import { useGame } from '../store'
import { Btn } from './ui'

// 任务堂：全屏弹层，四相位 入口 → 先学（新词）→ 测验 → 结果
export default function QuizModal() {
  const s = useGame()
  return (
    <div className="fixed inset-0 z-50 bg-gray-100 overflow-y-auto">
      <div className="max-w-2xl mx-auto min-h-full flex flex-col px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-2xl text-info-600 tracking-[0.14em]">任务堂 · 辨灵识字</h2>
          {!s.quizDone && s.quizStep === 'entry' && (
            <button onClick={() => useGame.getState().closeQuiz()} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
          )}
        </div>
        {s.quizStep === 'entry' && <Entry />}
        {s.quizStep === 'learning' && <Learning />}
        {s.quizStep === 'testing' && <Testing />}
        {s.quizStep === 'result' && <Result />}
      </div>
    </div>
  )
}

function Entry() {
  const s = useGame()
  const quota = s.realm < 3 ? 3 : s.realm < 6 ? 4 : 5
  if (s.libError) {
    return (
      <div className="bg-error-50 border border-error-200 rounded-xl p-5">
        <div className="text-error-500 font-medium mb-2">⚠ 当前词库无法组成 10 个不同单词的题目</div>
        <p className="text-sm text-gray-600 mb-4">可切换另一词库继续；进度与错词已保留。</p>
        <div className="flex gap-3">
          <Btn onClick={() => { useGame.getState().setLib(s.lib === 'cet4' ? 'cet6' : 'cet4'); useGame.setState({ libError: false }) }}>
            切换到{s.lib === 'cet4' ? '六级' : '四级'}
          </Btn>
          <Btn variant="secondary" onClick={() => useGame.setState({ libError: false })}>重试</Btn>
          <Btn variant="secondary" onClick={() => useGame.getState().closeQuiz()}>返回</Btn>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-5">
      {s.quizDone && (
        <div className="bg-success-50 border border-success-200 rounded-xl p-4 text-sm text-gray-700">
          今日任务已完成 ✓ 明日再来。可在此复习词库，但不重复计奖。
        </div>
      )}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
        <div className="text-sm text-gray-600 mb-3">选择词库（进度与错词分开记录，可随时切换）</div>
        <div className="flex gap-3">
          {(['cet4', 'cet6'] as const).map((lib) => (
            <button
              key={lib}
              onClick={() => useGame.getState().setLib(lib)}
              className={`px-5 py-2.5 rounded-xl text-sm border transition-colors ${s.lib === lib ? 'bg-primary-500 text-gray-50 border-primary-500' : 'bg-gray-50 text-gray-700 border-gray-300 hover:border-primary-400'}`}
            >
              {lib === 'cet4' ? '英语四级' : '英语六级'}{s.lib === lib && ' ✓'}
            </button>
          ))}
        </div>
        <div className="text-xs text-gray-500 mt-4">今日比例：新词 {10 - quota} + 复习 {quota}（按当前境界分配）</div>
        <div className="text-xs text-gray-500">错词池：{s.wrongQueue.length} 个待复习</div>
      </div>
      <div className="flex justify-center">
        <Btn className="!px-10 !py-3" onClick={() => useGame.getState().beginQuiz()}>开始今日任务</Btn>
      </div>
      <p className="text-xs text-gray-400 text-center">完成 10 题并确认结果后才能结束当天；答错也能继续</p>
    </div>
  )
}

function Learning() {
  const s = useGame()
  const news = s.quizWords.filter((q) => q.from === 'new')
  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-gray-600">本场新词 {news.length} 个 · 复习 {10 - news.length} 个（复习词不提前展示答案）</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {news.map((q) => (
          <div key={q.w} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="font-serif text-xl text-info-600">{q.w}</div>
            <div className="text-sm text-gray-700 mt-1">{q.m}</div>
            <div className="text-xs text-gray-400 mt-0.5">/音标待词库补齐/</div>
          </div>
        ))}
        {news.length === 0 && <div className="text-sm text-gray-500">本场以复习为主，直接开始测验</div>}
      </div>
      <div className="flex justify-center mt-2">
        <Btn className="!px-10 !py-3" onClick={() => useGame.getState().goTesting()}>已看完，开始测验</Btn>
      </div>
    </div>
  )
}

function Testing() {
  const s = useGame()
  const q = s.quizWords[s.quizIdx]
  const chosen = s.answers[s.quizIdx]
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${((s.quizIdx + 1) / 10) * 100}%` }} />
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap">{s.quizIdx + 1}/10</span>
      </div>
      <div className="text-center">
        <div className="text-xs text-gray-400 tracking-widest mb-2">选出正确释义</div>
        <div className="font-serif text-4xl text-info-600 tracking-wide">{q.w}</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {q.opts.map((opt) => {
          const isAnswer = opt === q.m
          const picked = chosen === opt
          let cls = 'bg-gray-50 border-gray-300 hover:border-primary-400'
          if (chosen !== null) {
            if (isAnswer) cls = 'bg-success-50 border-success-500 text-success-500'
            else if (picked) cls = 'bg-error-50 border-error-400 text-error-500'
            else cls = 'bg-gray-100 border-gray-200 text-gray-400'
          }
          return (
            <button
              key={opt}
              disabled={chosen !== null}
              onClick={() => useGame.getState().answer(opt)}
              className={`px-4 py-3.5 rounded-xl text-sm border transition-colors text-left ${cls}`}
            >
              {opt}
            </button>
          )
        })}
      </div>
      {chosen !== null && (
        <div className="flex items-center justify-between">
          <div className="text-sm">
            {chosen === q.m ? (
              <span className="text-success-500">✓ 正确</span>
            ) : (
              <span className="text-error-400">✗ 正确释义：<b>{q.m}</b>（错词将排队复习）</span>
            )}
          </div>
          <Btn onClick={() => useGame.getState().next()}>{s.quizIdx === 9 ? '查看结果' : '下一题'}</Btn>
        </div>
      )}
    </div>
  )
}

function Result() {
  const s = useGame()
  const score = s.quizWords.filter((q, i) => s.answers[i] === q.m).length
  const wrongs = s.quizWords.filter((q, i) => s.answers[i] !== q.m)
  const pass = score >= 6
  return (
    <div className="flex flex-col gap-5">
      <div className="text-center py-4">
        <div className={`font-serif text-6xl ${pass ? 'text-success-500' : 'text-warning-500'}`}>{score}<span className="text-2xl text-gray-400">/10</span></div>
        <div className="text-sm text-gray-600 mt-2">{pass ? '合格 · 灵气充盈' : '未达合格线 · 仍可结束当天，错词将排队复习'}</div>
      </div>
      {pass && (
        <div className="bg-success-50 border border-success-200 rounded-xl p-4 text-sm text-gray-700">
          奖励：灵气 +{3 + (s.gongfa >= 4 ? 1 : 0)} · 贡献 +5 · 心得 +{8 + (score === 10 ? 4 : 0)}
          {score === 10 && '（含满分加成）'}
        </div>
      )}
      {!pass && (
        <div className="bg-warning-50 border border-warning-200 rounded-xl p-4 text-sm text-gray-700">
          奖励：灵气 +1 · 心得 +2
        </div>
      )}
      {wrongs.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-2">本场错词（进入错词池，按等待最久优先重现）</div>
          <div className="flex flex-wrap gap-2">
            {wrongs.map((q) => (
              <span key={q.w} className="text-xs bg-error-50 text-error-500 border border-error-200 rounded-full px-2.5 py-1">
                {q.w} · {q.m}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-center">
        <Btn className="!px-10 !py-3" onClick={() => useGame.getState().confirmResult()}>确认结果，领取奖励</Btn>
      </div>
    </div>
  )
}
