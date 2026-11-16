import { useEffect, useRef, useState } from 'react'
import { playSfx, setBgmScene } from '../audio'
import { QUIZ_PASS, QUIZ_SIZE } from '../game/constants'
import { reviewQuota } from '../game/constants'
import { canFormSession, entryOf, LIBS } from '../game/wordbank'
import { REASON_TEXT } from './reasonText'
import { useGameStore } from '../stores/useGameStore'
import { useUiStore } from '../stores/useUiStore'
import { Btn, useModalFocus } from './ui'

// 任务堂：全屏弹层，四相位 入口 → 先学（新词）→ 测验 → 结果（quiz.md）
export default function QuizModal() {
  const session = useGameStore((s) => s.game.quizDaily.session)
  const done = useGameStore((s) => s.game.quizDaily.done)
  const setQuizOpen = useUiStore((s) => s.setQuizOpen)
  const dialogRef = useRef<HTMLDivElement>(null)
  useModalFocus(dialogRef, () => setQuizOpen(false))
  // 任务堂 BGM：进入切学习曲，离开回灵田曲（audio-impl.md §3.3）；卸载回调同时覆盖中断恢复路径
  useEffect(() => {
    setBgmScene('study')
    return () => setBgmScene('field')
  }, [])

  return (
    <div ref={dialogRef} data-game-modal tabIndex={-1} role="dialog" aria-modal="true" aria-label="任务堂" className="fixed inset-0 z-50 game-world overflow-y-auto">
      <div className="max-w-3xl mx-auto min-h-full flex flex-col px-4 py-5 sm:px-6 sm:py-8">
        <div className="rounded-t-3xl bg-primary-800 px-6 py-5 sm:px-8 flex items-center justify-between gap-4 text-gray-50">
          <div><p className="text-xs tracking-widest text-primary-200">青云宗 · 每日功课</p><h2 className="mt-1 font-serif text-2xl tracking-widest">任务堂 · 辨灵识字</h2></div>
          <button onClick={() => setQuizOpen(false)} aria-label="关闭任务堂" className="rounded-full border border-primary-300 text-gray-50 hover:bg-primary-700 text-2xl leading-none min-w-11 min-h-11">×</button>
        </div>
        <div className="flex-1 rounded-b-3xl bg-gray-50/95 px-5 py-6 sm:px-8 sm:py-8 shadow-lg">
        {!session && <Entry done={done} />}
        {session?.phase === 'learning' && <Learning />}
        {session?.phase === 'testing' && <Testing />}
        {session?.phase === 'result' && <Result />}
        </div>
      </div>
    </div>
  )
}

function Entry({ done }: { done: boolean }) {
  const g = useGameStore((s) => s.game)
  const act = useGameStore((s) => s.act)
  const quota = reviewQuota(g.realm)
  const lib = g.learning.currentLib
  const usable = canFormSession(lib, QUIZ_SIZE)
  const [showWrong, setShowWrong] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wrongWords = g.learning.libs[lib].wrongQueue

  if (!usable) {
    return (
      <div className="bg-error-50 border border-error-200 rounded-xl p-5">
        <div className="text-error-500 font-medium mb-2">⚠ 当前词库无法组成 10 个不同单词的题目</div>
        <p className="text-sm text-gray-600 mb-4">可切换另一词库继续；进度与错词已保留。</p>
        <div className="flex gap-3">
          <Btn onClick={() => act({ type: 'QUIZ_SET_LIB', lib: lib === 'cet4' ? 'cet6' : 'cet4' })}>
            切换到{lib === 'cet4' ? '六级' : '四级'}
          </Btn>
          <Btn variant="secondary" onClick={() => useUiStore.getState().setQuizOpen(false)}>返回</Btn>
        </div>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-5">
      {done && (
        <div className="bg-success-50 border border-success-200 rounded-xl p-4 text-sm text-gray-700">
          今日任务已完成 ✓ 明日再来。可切换词库或查看错词池，今日不再重复计奖。
        </div>
      )}
      <div className="bg-primary-50 border border-primary-200 rounded-2xl p-5 sm:p-6">
        <div className="font-serif text-xl text-primary-900">今日功课</div>
        <div className="text-sm text-gray-600 mt-2 mb-4">选择词库，学过的词和错词会为你保留。</div>
        <div className="flex gap-3">
          {(['cet4', 'cet6'] as const).map((id) => (
            <button
              key={id}
              onClick={() => { act({ type: 'QUIZ_SET_LIB', lib: id }); setShowWrong(false); setError(null) }}
              className={`px-5 py-2.5 rounded-xl text-sm border transition-colors ${lib === id ? 'bg-primary-500 text-gray-50 border-primary-500' : 'bg-gray-50 text-gray-700 border-gray-300 hover:border-primary-400'}`}
            >
              {id === 'cet4' ? '英语四级' : '英语六级'}{lib === id && ' ✓'}
              <span className="text-xs opacity-70 ml-1.5">{LIBS[id].length} 词</span>
            </button>
          ))}
        </div>
        <div className="text-sm text-gray-700 mt-5">每次学习 {QUIZ_SIZE} 词，优先复习最多 {quota} 词；词量不足时补入其他可用单词。</div>
        <div className="mt-3 flex items-center justify-between gap-3 text-sm text-gray-700">
          <span>错词池：{wrongWords.length} 个待复习</span>
          <button type="button" aria-expanded={showWrong} onClick={() => setShowWrong(!showWrong)} className="min-h-11 px-3 text-primary-700 underline underline-offset-4">{showWrong ? '收起错词' : '查看错词'}</button>
        </div>
        {showWrong && (wrongWords.length === 0
          ? <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">暂时没有错词，继续保持。</p>
          : <ul className="max-h-60 overflow-y-auto rounded-xl bg-gray-50 divide-y divide-gray-200">{wrongWords.map((word) => <li key={word} className="px-4 py-3 text-sm"><strong className="text-info-600">{word}</strong><span className="ml-3 text-gray-600">{entryOf(lib, word)?.meaning ?? '词条暂不可用'}</span></li>)}</ul>)}
      </div>
      {!done && (
        <div className="flex justify-center">
          <Btn className="!px-10 !py-3" onClick={() => { const result = act({ type: 'QUIZ_BEGIN' }); setError(result.ok ? null : REASON_TEXT[result.reason ?? 'LIBRARY_INSUFFICIENT'] ?? '当前词库无法开始任务') }}>开始今日任务</Btn>
        </div>
      )}
      {error && <p role="alert" className="text-center text-sm text-error-500">{error}</p>}
      <p className="text-xs text-gray-400 text-center">完成 10 题并确认结果后才能结束当天；答错也能继续</p>
    </div>
  )
}

function Learning() {
  const session = useGameStore((s) => s.game.quizDaily.session)!
  const act = useGameStore((s) => s.act)
  const news = session.questions.filter((q) => q.from === 'new')
  return (
    <div className="flex flex-col gap-4">
      <div><div className="font-serif text-2xl text-info-600">先识新词</div><div className="mt-2 text-sm text-gray-600">本场新词 {news.length} 个 · 复习 {QUIZ_SIZE - news.length} 个（复习词不提前展示答案）</div></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {news.map((q) => (
          <div key={q.word} className="bg-primary-50/70 border border-primary-100 rounded-2xl p-5">
            <div className="font-serif text-2xl text-info-600 break-words">{q.word}</div>
            <div className="text-sm text-gray-700 mt-2 leading-6">{q.meaning}</div>
          </div>
        ))}
        {news.length === 0 && <div className="text-sm text-gray-500">本场以复习为主，直接开始测验</div>}
      </div>
      <div className="flex justify-center mt-2">
        <Btn className="!px-10 !py-3" onClick={() => act({ type: 'QUIZ_LEARNED' })}>已看完，开始测验</Btn>
      </div>
    </div>
  )
}

function Testing() {
  const session = useGameStore((s) => s.game.quizDaily.session)!
  const act = useGameStore((s) => s.act)
  const q = session.questions[session.idx]
  const chosen = session.answers[session.idx]
  const optionsRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const target = chosen === null ? optionsRef.current : nextRef.current
    target?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
  }, [session.idx, chosen])
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${((session.idx + 1) / QUIZ_SIZE) * 100}%` }} />
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap">{session.idx + 1}/{QUIZ_SIZE}</span>
      </div>
      <div className="rounded-2xl bg-primary-50 border border-primary-100 px-5 py-8 text-center">
        <div className="text-xs text-primary-700 tracking-widest mb-3">选出正确释义</div>
        <div className="font-serif text-4xl text-info-600 tracking-wide break-words">{q.word}</div>
      </div>
      <div ref={optionsRef} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {q.opts.map((opt) => {
          const isAnswer = opt === q.meaning
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
              onClick={() => act({ type: 'QUIZ_ANSWER', choice: opt })}
              className={`min-h-16 px-5 py-4 rounded-xl text-sm leading-6 border transition-colors text-left focus-visible:outline-2 focus-visible:outline-primary-600 ${cls}`}
            >
              {opt}
            </button>
          )
        })}
      </div>
      {chosen !== null && (
        <div ref={nextRef} className="flex flex-wrap gap-4 items-center justify-between">
          <div role="status" className="text-sm">
            {chosen === q.meaning ? (
              <span className="text-success-500">✓ 正确</span>
            ) : (
              <span className="text-error-400">✗ 正确释义：<b>{q.meaning}</b>（错词将排队复习）</span>
            )}
          </div>
          <Btn onClick={() => act({ type: 'QUIZ_NEXT' })}>{session.idx === QUIZ_SIZE - 1 ? '查看结果' : '下一题'}</Btn>
        </div>
      )}
    </div>
  )
}

function Result() {
  const g = useGameStore((s) => s.game)
  const act = useGameStore((s) => s.act)
  const setQuizOpen = useUiStore((s) => s.setQuizOpen)
  // 结果相位时 session 仍在档（confirm 后清空并置 done），此处直接从 session 计算展示
  const session = g.quizDaily.session!
  const score = session.questions.filter((q, i) => session.answers[i] === q.meaning).length
  const wrongs = session.questions.filter((q, i) => session.answers[i] !== q.meaning)
  const pass = score >= QUIZ_PASS
  return (
    <div className="flex flex-col gap-5">
      <div className="text-center py-6 rounded-2xl bg-primary-50 border border-primary-100">
        <div className={`font-serif text-6xl ${pass ? 'text-success-500' : 'text-warning-500'}`}>{score}<span className="text-2xl text-gray-400">/{QUIZ_SIZE}</span></div>
        <div className="text-sm text-gray-600 mt-2">{pass ? '合格 · 灵气充盈' : '未达合格线 · 仍可结束当天，错词将排队复习'}</div>
      </div>
      <div className={`${pass ? 'bg-success-50 border-success-200' : 'bg-warning-50 border-warning-200'} border rounded-xl p-4 text-sm text-gray-700`}>
        {pass
          ? `奖励：灵气 +${3 + (g.gongfa >= 4 ? 1 : 0)} · 贡献 +5 · 心得 +${8 + (score === QUIZ_SIZE ? 4 : 0)}${score === QUIZ_SIZE ? '（含满分加成）' : ''}`
          : '奖励：灵气 +1 · 心得 +2'}
      </div>
      {wrongs.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-2">本场错词（进入错词池，按等待最久优先重现）</div>
          <div className="flex flex-wrap gap-2">
            {wrongs.map((q) => (
              <span key={q.word} className="text-xs bg-error-50 text-error-500 border border-error-200 rounded-full px-2.5 py-1">
                {q.word} · {q.meaning}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-center">
        <Btn className="!px-10 !py-3" onClick={() => {
          // 打卡本身不产生日志（quiz.ts checkinStreak），按同一条件判断首次打卡并配音效（audio-impl.md §3.4）
          const firstCheckin = g.streak.lastCheckinDay !== g.realDay.today
          const result = act({ type: 'QUIZ_CONFIRM' })
          if (result.ok && firstCheckin) playSfx('checkin')
          setQuizOpen(false)
        }}>确认结果，领取奖励</Btn>
      </div>
    </div>
  )
}
