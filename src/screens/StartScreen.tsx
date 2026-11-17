import { useState } from 'react'
import { assetUrl } from '../assetUrl'
import { characters } from '../game/characters'
import { SAVE_KEY } from '../game/save'
import { REASON_TEXT } from '../components/reasonText'
import { Btn, ConfirmOverlay, Modal } from '../components/ui'
import { useGameStore } from '../stores/useGameStore'

// 启动页负责选择本局形象；所选立绘会同步到游戏中的弟子头像与结算画面。
export default function StartScreen() {
  const [characterId, setCharacter] = useState(characters[0].id)
  const [importOpen, setImportOpen] = useState(false)
  const [code, setCode] = useState('')
  const [importError, setImportError] = useState('')
  // 覆盖确认（游戏内弹窗替代原生 confirm）：开始新修行 / 导入存档都会覆盖现有档
  const [confirmStart, setConfirmStart] = useState(false)
  const [confirmImport, setConfirmImport] = useState(false)
  const startNew = useGameStore((s) => s.startNew)
  const continueSaved = useGameStore((s) => s.continueSaved)
  const importSaved = useGameStore((s) => s.importSaved)
  let hasSave = false
  try {
    hasSave = typeof localStorage !== 'undefined' && localStorage.getItem(SAVE_KEY) !== null
  } catch {
    // 浏览器禁用存储时仍允许进入游戏，保存失败由游戏状态提示。
  }
  const selected = characters.find((character) => character.id === characterId) ?? characters[0]
  // 导入动作被开始覆盖确认与导入弹窗两处调用，提取为局部函数
  const doImport = () => {
    const result = importSaved(code)
    if (!result.ok) setImportError(result.reason === 'SAVE_FAILED' ? '保存失败，请检查浏览器存储并保留存档码。原存档未被覆盖。' : `${REASON_TEXT[result.reason ?? 'BAD_SHAPE'] ?? '存档码无效'}，原存档未被覆盖。`)
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-primary-100 text-gray-800">
      <img src={assetUrl('environment-spirit-field.svg')} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-primary-50/80 via-gray-100/50 to-primary-100/55" />
      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center px-5 py-8 sm:px-8 lg:px-12">
        <section className="grid w-full overflow-hidden rounded-[2rem] border border-white/75 bg-gray-50/90 shadow-[0_28px_90px_rgba(42,69,57,.2)] backdrop-blur-sm lg:min-h-[650px] lg:grid-cols-[.92fr_1.08fr]">
          <div className="relative flex min-h-[330px] flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-primary-50 to-primary-200 px-8 pt-10 lg:min-h-full">
            <div aria-hidden="true" className="absolute -left-12 top-12 h-52 w-52 rounded-full border border-white/60" />
            <div aria-hidden="true" className="absolute -right-16 bottom-10 h-64 w-64 rounded-full border border-white/50" />
            <span className="relative z-10 rounded-full border border-[#b8cfc0] bg-white/55 px-4 py-1 text-xs tracking-[.24em] text-primary-700">青云宗 · 灵植堂</span>
            {selected.image ? (
              <img key={selected.id} src={selected.image} alt={selected.name} className="relative z-10 my-1 h-[270px] max-w-full object-contain drop-shadow-[0_16px_12px_rgba(45,69,55,.16)] sm:h-[320px] lg:h-[390px]" />
            ) : (
              // 立绘未交付的过渡态：预览区放大徽记占位（T37），交付后随 characters.ts 点亮
              <span key={selected.id} aria-hidden="true" className="relative z-10 my-1 flex h-[270px] w-full items-center justify-center text-8xl drop-shadow-[0_16px_12px_rgba(45,69,55,.16)] sm:h-[320px] lg:h-[390px]">{selected.emblem}</span>
            )}
            <div className="relative z-10 mb-8 text-center">
              <div className="font-serif text-2xl tracking-[.16em] text-primary-800">{selected.name}</div>
              <div className="mt-1 text-sm tracking-[.18em] text-gray-600">{selected.role}</div>
              <div className="mt-1 max-w-xs text-sm text-gray-600">{selected.description}</div>
            </div>
          </div>

          <div className="flex flex-col justify-center px-6 py-9 sm:px-10 lg:px-14 lg:py-12">
            <div className="text-xs tracking-[.38em] text-gold-ink">LINGZHIJI</div>
            <h1 className="mt-2 font-serif text-5xl font-bold tracking-[.12em] text-info-600 sm:text-6xl">灵植记</h1>
            <p className="mt-3 text-sm tracking-[.2em] text-gray-500">修仙种田&nbsp; × &nbsp;背单词</p>
            <div className="mt-8 border-l-2 border-gold pl-4 text-sm leading-7 text-gray-700">
              <p>外门试炼已过，执事为你留了三块下品灵田。</p>
              <p className="text-info-600">「每月灵草定额，少不了你的。其余收成，自去坊市处置。」</p>
            </div>

            <div className="mt-8 flex items-end justify-between gap-3">
              <div>
                <h2 className="font-serif text-xl text-gray-800">选一位同行的弟子</h2>
                <p className="mt-1 text-sm text-gray-500">修行路上，就以这副形象示人</p>
              </div>
              <span className="mb-1 text-xs tracking-wider text-gray-400">选择形象</span>
            </div>
            <div role="radiogroup" aria-label="选择人物形象" className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
              {characters.map((character) => {
                const active = character.id === selected.id
                return (
                  <button
                    key={character.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setCharacter(character.id)}
                    className={`group min-h-[150px] rounded-2xl border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 sm:p-3 ${active ? 'border-primary-500 bg-primary-50 shadow-md' : 'border-gray-200 bg-white/70 hover:border-primary-300 hover:bg-white'}`}
                  >
                    <span className={`flex h-[82px] items-start justify-center overflow-hidden rounded-xl bg-gradient-to-br ${character.tone}`}>
                      {character.image ? (
                        <img src={character.image} alt="" aria-hidden="true" className="h-[210px] max-w-none object-contain transition-transform group-hover:scale-[1.03]" />
                      ) : (
                        // 立绘未交付（T37 过渡态）：emoji 徽记兜底，PNG 填回 characters.ts 即点亮
                        <span aria-hidden="true" className="flex h-full w-full items-center justify-center text-4xl transition-transform group-hover:scale-110">{character.emblem}</span>
                      )}
                    </span>
                    <span className="mt-2 block text-center text-xs font-medium leading-5 text-gray-800 sm:text-sm">{character.name}</span>
                    <span className="block text-center text-[11px] text-gray-500">{character.role}</span>
                  </button>
                )
              })}
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Btn onClick={() => {
                if (hasSave) { setConfirmStart(true); return }
                startNew(characterId)
              }} className="!min-h-12 !flex-1 !px-8 !py-2.5">以此形象开始修行</Btn>
              {hasSave && <Btn variant="secondary" onClick={() => {
                const result = continueSaved()
                if (!result.ok && result.reason && result.reason !== 'NO_SAVE') {
                  alert(`${REASON_TEXT[result.reason] ?? '存档无法读取'}。可从开始画面重置，或导入之前导出的存档码。`)
                }
              }} className="!min-h-12 !px-5 !py-2.5">继续修行</Btn>}
            </div>
            {hasSave && <p className="mt-3 text-center text-xs text-gray-500">继续修行将使用已有存档中的形象</p>}
            <button type="button" onClick={() => setImportOpen(true)} className="mt-3 min-h-11 self-center px-4 text-sm text-primary-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary-600">导入存档码</button>
          </div>
        </section>
      </div>
      {importOpen && (
        <Modal title="导入存档" onClose={() => setImportOpen(false)} wide>
          <p className="text-sm leading-6 text-gray-700">粘贴之前导出的存档码。导入成功后会覆盖此浏览器中的现有存档。</p>
          <label htmlFor="start-save-code" className="mt-4 block text-sm text-gray-700">存档码</label>
          <textarea id="start-save-code" value={code} onChange={(e) => { setCode(e.target.value); setImportError('') }} placeholder="粘贴灵植记存档码" className="mt-2 h-28 w-full rounded-lg border border-gray-300 bg-gray-100 p-3 text-sm" />
          {importError && <p role="alert" className="mt-2 text-sm text-error-500">{importError}</p>}
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <Btn variant="secondary" onClick={() => setImportOpen(false)}>取消</Btn>
            <Btn disabled={!code.trim()} onClick={() => {
              if (hasSave) { setConfirmImport(true); return }
              doImport()
            }}>导入并继续</Btn>
          </div>
        </Modal>
      )}
      {confirmStart && (
        <ConfirmOverlay
          title="开始新修行"
          body="开始新修行会覆盖现有存档，确定继续吗？"
          confirmText="覆盖并开始"
          tone="danger"
          onConfirm={() => { setConfirmStart(false); startNew(characterId) }}
          onCancel={() => setConfirmStart(false)}
        />
      )}
      {confirmImport && (
        <ConfirmOverlay
          title="导入存档"
          body="导入成功后会覆盖浏览器中的现有存档，确定继续吗？原存档可先导出留底。"
          confirmText="覆盖并导入"
          tone="danger"
          onConfirm={() => { setConfirmImport(false); doImport() }}
          onCancel={() => setConfirmImport(false)}
        />
      )}
    </main>
  )
}
