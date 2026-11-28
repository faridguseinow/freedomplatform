import {
  type ButtonHTMLAttributes,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { cn } from '../../lib/utils/cn'

type ModalProps = {
  children: ReactNode
  onClose: () => void
  ariaLabel?: string
  align?: 'center' | 'end'
  padding?: 'default' | 'none'
  className?: string
  panelClassName?: string
}

/** Длительность анимации закрытия; совпадает с CSS (fp-*-out). */
const CLOSE_ANIMATION_MS = 170

let activeBodyScrollLocks = 0
let bodyOverflowBeforeModal = ''

const ModalCloseContext = createContext<(() => void) | null>(null)

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Закрыть окно с анимацией. Внутри модального окна используйте
 * `<ModalDismiss>{(close) => <button onClick={close} />}</ModalDismiss>`.
 */
export function ModalDismiss({ children }: { children: (close: () => void) => ReactNode }) {
  const close = useContext(ModalCloseContext)
  return <>{children(close ?? (() => {}))}</>
}

/**
 * Кнопка закрытия (крестик). Внутри окна закрывает его с анимацией,
 * вне окна ведёт себя как обычная кнопка с переданным onClick.
 */
export function ModalCloseButton({ onClick, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const close = useContext(ModalCloseContext)
  return <button {...props} onClick={close ? () => close() : onClick} type={type} />
}

export function Modal({
  children,
  onClose,
  ariaLabel,
  align = 'center',
  padding = 'default',
  className,
  panelClassName,
}: ModalProps) {
  const [isClosing, setIsClosing] = useState(false)
  const onCloseRef = useRef(onClose)
  const closeTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    onCloseRef.current = onClose
  })

  const requestClose = useCallback(() => {
    if (closeTimeoutRef.current !== null) return
    if (prefersReducedMotion()) {
      onCloseRef.current()
      return
    }
    setIsClosing(true)
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null
      onCloseRef.current()
    }, CLOSE_ANIMATION_MS)
  }, [])

  useEffect(
    () => () => {
      if (closeTimeoutRef.current !== null) window.clearTimeout(closeTimeoutRef.current)
    },
    [],
  )

  const closeFromBackdrop = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      requestClose()
    }
  }

  useEffect(() => {
    if (activeBodyScrollLocks === 0) {
      bodyOverflowBeforeModal = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    activeBodyScrollLocks += 1

    return () => {
      activeBodyScrollLocks = Math.max(0, activeBodyScrollLocks - 1)
      if (activeBodyScrollLocks === 0) {
        document.body.style.overflow = bodyOverflowBeforeModal
      }
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        requestClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [requestClose])

  return (
    <ModalCloseContext.Provider value={requestClose}>
      <div
        className={cn(
          'modal-overlay fixed inset-0 z-50 grid bg-slate-950/40',
          align === 'center' ? 'place-items-center' : 'lg:place-items-end',
          padding === 'default' ? 'p-0 md:px-4 md:py-6' : null,
          className,
        )}
        data-state={isClosing ? 'closing' : 'open'}
        onPointerDown={closeFromBackdrop}
        role="presentation"
      >
        <div
          aria-label={ariaLabel}
          aria-modal="true"
          className={cn('modal-panel h-svh w-full md:h-auto', align === 'center' ? 'flex justify-center' : null, panelClassName)}
          data-align={align}
          onPointerDown={closeFromBackdrop}
          role="dialog"
        >
          {children}
        </div>
      </div>
    </ModalCloseContext.Provider>
  )
}
