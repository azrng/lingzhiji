import { useState } from 'react'
import { loadPrefs, setBgmEnabled, setSfxEnabled } from '../audio'
import { exportCode } from '../game/save'
import { REASON_TEXT } from './reasonText'
import { useGameStore } from '../stores/useGameStore'
import { useUiStore } from '../stores/useUiStore'
import { Btn, ConfirmOverlay, Modal } from './ui'

// 设置弹层：真实导出/导入（save.md §3.4）与重置开局
export default function SettingsModal() {
  const game = useGameStore((s) => s.game)
  const startNew = useGameStore((s) => s.startNew)
  const importSaved = useGameStore((s) => s.importSaved)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const pushToasts = useUiStore((s) => s.pushToasts)
  const [importCodeText, setImportCodeText] = useState('')
  const [importResult, setImportResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmImport, setConfirmImport] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [audioPrefs, setAudioPrefs] = useState(loadPrefs)

  const code = exportCode(game)

  return (
    <Modal title="设置 · 存档" onClose={() => setSettingsOpen(false)} wide>
      <div className="flex flex-col gap-5 text-sm">
        <div>
          <div className="text-gray-600 mb-2">导出存档（Base64 导码，请自行保存）</div>
          <textarea readOnly value={code} className="w-full h-20 bg-gray-100 border border-gray-200 rounded-lg p-2 text-xs text-gray-600" />
          <Btn variant="secondary" className="mt-2"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code)
                setCopyError(false)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              } catch {
                setCopyError(true)
              }
            }}>
            {copied ? '已复制 ✓' : '复制导码'}
          </Btn>
          <p className="text-xs text-gray-400 mt-1">清除浏览器数据仍可能丢失本地存档，导出请自行保管。</p>
          {copyError && <p className="text-xs text-error-500 mt-1">复制失败，请手动选中导码复制。</p>}
        </div>
        <div>
          <div className="text-gray-600 mb-2">导入存档</div>
          <textarea
            value={importCodeText}
            onChange={(e) => { setImportCodeText(e.target.value); setImportResult(null) }}
            placeholder="粘贴灵植记导码…"
            className="w-full h-20 bg-gray-100 border border-gray-200 rounded-lg p-2 text-xs"
          />
          {importResult && (
            <div className={`text-xs mt-1 ${importResult.ok ? 'text-success-500' : 'text-error-400'}`}>{importResult.msg}</div>
          )}
          <Btn
            variant="secondary"
            className="mt-2"
            onClick={() => setConfirmImport(true)}
          >
            导入
          </Btn>
        </div>
        <div>
          <div className="text-gray-600 mb-2">声音</div>
          <div className="flex gap-3">
            <button
              type="button"
              aria-pressed={audioPrefs.bgm}
              onClick={() => {
                const next = { ...audioPrefs, bgm: !audioPrefs.bgm }
                setAudioPrefs(next)
                setBgmEnabled(next.bgm)
              }}
              className={`px-5 py-2.5 rounded-xl text-sm border transition-colors ${audioPrefs.bgm ? 'bg-primary-500 text-gray-50 border-primary-500' : 'bg-gray-50 text-gray-700 border-gray-300 hover:border-primary-400'}`}
            >
              ♪ 背景音乐 {audioPrefs.bgm ? '开' : '关'}
            </button>
            <button
              type="button"
              aria-pressed={audioPrefs.sfx}
              onClick={() => {
                const next = { ...audioPrefs, sfx: !audioPrefs.sfx }
                setAudioPrefs(next)
                setSfxEnabled(next.sfx)
              }}
              className={`px-5 py-2.5 rounded-xl text-sm border transition-colors ${audioPrefs.sfx ? 'bg-primary-500 text-gray-50 border-primary-500' : 'bg-gray-50 text-gray-700 border-gray-300 hover:border-primary-400'}`}
            >
              🔔 音效 {audioPrefs.sfx ? '开' : '关'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">偏好保存在本浏览器，不随存档导码迁移。</p>
        </div>
        {confirmImport && (
          <ConfirmOverlay
            title="导入存档"
            body="导入会覆盖当前存档，确定继续吗？原档可先复制导码留底。"
            confirmText="覆盖并导入"
            tone="danger"
            onConfirm={() => {
              setConfirmImport(false)
              const r = importSaved(importCodeText)
              if (r.ok) {
                setImportResult({ ok: true, msg: '导入成功，存档已覆盖' })
                const day = useGameStore.getState().game.day
                pushToasts([{ day, kind: 'settle', icon: '📥', title: '存档导入成功', text: `已恢复到第 ${day} 天` }])
              } else {
                setImportResult({ ok: false, msg: r.reason === 'SAVE_FAILED' ? '保存失败，请保留导码并检查浏览器存储（原档已保留）' : `${REASON_TEXT[r.reason ?? 'BAD_SHAPE'] ?? '导码无效'}（原档已保留）` })
              }
            }}
            onCancel={() => setConfirmImport(false)}
          />
        )}
        <div className="bg-gray-100 rounded-lg p-3 text-xs text-gray-500">
          多标签页：同时游玩多个页面会互相覆盖存档，检测到时会在顶部提示。存档在每次有效操作后自动保存。
        </div>
        {!confirmReset ? (
          <Btn variant="danger" onClick={() => setConfirmReset(true)} className="self-start">重置开局</Btn>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xs text-error-400">将清空当前进度并重新开始，确定？</span>
            <Btn variant="danger" onClick={() => { startNew(); setConfirmReset(false); setSettingsOpen(false) }}>确认重置</Btn>
            <Btn variant="secondary" onClick={() => setConfirmReset(false)}>取消</Btn>
          </div>
        )}
      </div>
    </Modal>
  )
}
