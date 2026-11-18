import { CSSProperties, MouseEvent, ReactNode, RefObject, useEffect, useRef } from 'react'
import { assetUrl } from '../assetUrl'

// 原型通用小组件：按钮、弹层壳、素材雪碧图、AP 点阵。
// 视觉取值全部来自 theme.css 的 token，禁止硬编码色值。

export function Btn({
  children, onClick, variant = 'primary', disabled = false, className = '', title,
}: {
  children: ReactNode
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  variant?: 'primary' | 'secondary' | 'gold' | 'danger'
  disabled?: boolean
  className?: string
  title?: string
}) {
  const base = 'px-4 py-2 rounded-lg text-sm font-medium transition-colors select-none'
  const styles = {
    primary: 'bg-primary-500 text-gray-50 hover:bg-primary-600',
    secondary: 'bg-gray-50 text-gray-700 border border-gray-600 hover:bg-gray-150',
    gold: 'bg-gold text-gray-50 hover:bg-warning-400',
    danger: 'bg-error-400 text-gray-50 hover:bg-error-500',
  }[variant]
  const off = 'bg-gray-300 text-gray-500 cursor-not-allowed'
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={`${base} ${disabled ? off : styles} ${className}`}
    >
      {children}
    </button>
  )
}

// 覆盖确认弹窗（替代原生 window.confirm：嵌入式 webview 对原生对话框行为不可控，且风格与游戏不符）。
// 叠加在 Modal（z-40）/toast（z-60）之上；Escape 走 useModalFocus 的 onClose=取消。
export function ConfirmOverlay({
  title, body, confirmText, cancelText = '取消', tone = 'primary', onConfirm, onCancel,
}: {
  title: string
  body: string
  confirmText: string
  cancelText?: string
  tone?: 'primary' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useModalFocus(dialogRef, onCancel)
  return (
    <div className="fixed inset-0 z-[65] bg-gray-900/50 flex items-center justify-center p-4">
      <div ref={dialogRef} data-game-modal tabIndex={-1} role="alertdialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-2xl bg-gray-50 p-6 shadow-lg">
        <h3 className="font-serif text-lg text-info-600 tracking-widest">{title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-gray-700">{body}</p>
        <div className="mt-5 flex justify-end gap-3">
          <Btn variant="secondary" onClick={onCancel}>{cancelText}</Btn>
          <Btn variant={tone} onClick={onConfirm}>{confirmText}</Btn>
        </div>
      </div>
    </div>
  )
}

// 可关闭与强制结算弹层共用焦点约束；仅最上层响应键盘。
export function useModalFocus(dialogRef: RefObject<HTMLDivElement | null>, onClose?: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const selector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter((item) => item.getClientRects().length > 0)
    ;(focusable()[0] ?? dialog).focus()
    const onKeyDown = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[data-game-modal]')
      if (dialogs[dialogs.length - 1] !== dialog) return
      if (event.key === 'Escape' && closeRef.current) {
        event.preventDefault()
        closeRef.current()
      } else if (event.key === 'Tab') {
        const items = focusable()
        if (!items.length) { event.preventDefault(); dialog.focus(); return }
        const first = items[0]
        const last = items[items.length - 1]
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault(); last.focus()
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault(); first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown); if (previous?.isConnected) previous.focus() }
  }, [dialogRef])
}

export function Modal({
  title, onClose, children, wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useModalFocus(dialogRef, onClose)

  return (
    <div className="fixed inset-0 z-40 bg-gray-900/40 flex items-center justify-center p-4">
      <div ref={dialogRef} data-game-modal tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`bg-gray-50 rounded-2xl shadow-lg w-full ${wide ? 'max-w-2xl' : 'max-w-md'} flex flex-col max-h-[88vh]`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-serif text-lg text-info-600 tracking-widest">{title}</h3>
          <button onClick={onClose} aria-label={`关闭${title}`} className="text-gray-500 hover:text-gray-700 text-xl leading-none min-w-11 min-h-11">
            ×
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// 素材图雪碧图裁切：sheet 为 public/assets 下的图片，按 C 列 × R 行网格定位
export function Sprite({
  sheet, cols, rows, col = 0, row = 0, size = 24, className = '',
}: {
  sheet: string
  cols: number
  rows: number
  col?: number
  row?: number
  size?: number
  className?: string
}) {
  const style: CSSProperties = {
    width: size,
    height: size,
    display: 'inline-block',
    flex: 'none',
    backgroundImage: `url(${assetUrl(sheet)})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundPosition: `${cols > 1 ? (col / (cols - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`,
  }
  return <span className={className} style={style} />
}

// 日志/徽标 emoji → 图标素材映射（roadmap-assets.md #11–#13）：
// 存档 icon 字段仍是 emoji 字符串（旧档兼容），展示层命中的三个用素材渲染，其余原样兜底
const ICON_IMG: Record<string, string> = {
  '🌅': 'icon-dew.webp',
  '🧿': 'icon-talisman.webp',
  '🕯': 'icon-daoxin-candle.webp',
}

export function LogIcon({ icon, size = 18, className = '' }: { icon?: string | null; size?: number; className?: string }) {
  const file = icon ? ICON_IMG[icon] : undefined
  if (file) return <img src={assetUrl(file)} alt="" aria-hidden width={size} height={size} className={`flex-none ${className}`} />
  return <span className={className}>{icon ?? '·'}</span>
}

// 行动力 / 灵气点阵
export function Pips({ value, cap }: { value: number; cap: number }) {
  return (
    <span className="inline-flex gap-0.5 align-middle">
      {Array.from({ length: cap }, (_, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full border ${i < value ? 'bg-primary-500 border-primary-600' : 'bg-transparent border-gray-300'}`}
        />
      ))}
    </span>
  )
}
