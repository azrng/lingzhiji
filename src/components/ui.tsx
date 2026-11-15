import { CSSProperties, ReactNode } from 'react'

// 原型通用小组件：按钮、弹层壳、素材雪碧图、AP 点阵。
// 视觉取值全部来自 theme.css 的 token，禁止硬编码色值。

export function Btn({
  children, onClick, variant = 'primary', disabled = false, className = '', title,
}: {
  children: ReactNode
  onClick?: () => void
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

export function Modal({
  title, onClose, children, wide = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-40 bg-gray-900/40 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className={`bg-gray-50 rounded-2xl shadow-lg w-full ${wide ? 'max-w-2xl' : 'max-w-md'} flex flex-col max-h-[88vh]`}>
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
    backgroundImage: `url(/assets/${sheet})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundPosition: `${cols > 1 ? (col / (cols - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`,
  }
  return <span className={className} style={style} />
}

// 行动力 / 灵气点阵
export function Pips({ value, cap }: { value: number; cap: number }) {
  return (
    <span className="inline-flex gap-1 align-middle">
      {Array.from({ length: cap }, (_, i) => (
        <span
          key={i}
          className={`w-2.5 h-2.5 rounded-full border ${i < value ? 'bg-primary-500 border-primary-600' : 'bg-transparent border-gray-300'}`}
        />
      ))}
    </span>
  )
}
