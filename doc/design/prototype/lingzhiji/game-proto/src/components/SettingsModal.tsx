import { useState } from 'react'
import { useGame } from '../store'
import { Btn, Modal } from './ui'

// 设置弹层：导出/导入为演示桩（正式版按 save.md 实现真实校验），重置演示
export default function SettingsModal() {
  const s = useGame()
  const [importCode, setImportCode] = useState('')
  const [importResult, setImportResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const fakeCode = () => {
    // 演示：正式版为 SaveData → JSON(UTF-8) → Base64
    return 'lingzhiji.' + btoa(unescape(encodeURIComponent(JSON.stringify({ version: 1, day: s.day, demo: true }))))
  }

  return (
    <Modal title="设置 · 存档（原型演示）" onClose={() => useGame.getState().closeOverlay('settings')} wide>
      <div className="flex flex-col gap-5 text-sm">
        <div>
          <div className="text-gray-600 mb-2">导出存档</div>
          <textarea readOnly value={fakeCode()} className="w-full h-16 bg-gray-100 border border-gray-200 rounded-lg p-2 text-xs text-gray-600" />
          <Btn variant="secondary" className="mt-2" onClick={() => navigator.clipboard?.writeText(fakeCode())}>复制导码</Btn>
        </div>
        <div>
          <div className="text-gray-600 mb-2">导入存档</div>
          <textarea
            value={importCode}
            onChange={(e) => { setImportCode(e.target.value); setImportResult(null) }}
            placeholder="粘贴灵植记导码…"
            className="w-full h-16 bg-gray-100 border border-gray-200 rounded-lg p-2 text-xs"
          />
          {importResult && (
            <div className={`text-xs mt-1 ${importResult.ok ? 'text-success-500' : 'text-error-400'}`}>{importResult.msg}</div>
          )}
          <Btn
            variant="secondary"
            className="mt-2"
            onClick={() =>
              setImportResult(
                importCode.startsWith('lingzhiji.')
                  ? { ok: true, msg: '导入成功（演示桩，未真正替换状态）' }
                  : { ok: false, msg: '导码无效：不是合法的灵植记存档（原档已保留）' },
              )
            }
          >
            导入
          </Btn>
        </div>
        <div className="bg-gray-100 rounded-lg p-3 text-xs text-gray-500">
          多标签页：同时游玩多页会互相覆盖存档，正式版提供横幅提示。原型可在调试面板触发演示横幅。
          导出需自行保存导码；清除浏览器数据会丢失本地存档。
        </div>
        {!confirmReset ? (
          <Btn variant="danger" onClick={() => setConfirmReset(true)} className="self-start">重置演示</Btn>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xs text-error-400">将清空当前进度，确定？</span>
            <Btn variant="danger" onClick={() => { useGame.getState().dbg('reset'); setConfirmReset(false) }}>确认重置</Btn>
            <Btn variant="secondary" onClick={() => setConfirmReset(false)}>取消</Btn>
          </div>
        )}
      </div>
    </Modal>
  )
}
