import { useEffect, type PointerEvent, type ReactNode } from 'react'
import { cn } from '../../lib/utils/cn'

type ModalProps = {
  children: ReactNode
  onClose: () => void
  align?: 'center' | 'end'
  padding?: 'default' | 'none'
  className?: string
  panelClassName?: string
}

let activeBodyScrollLocks = 0
let bodyOverflowBeforeModal = ''

export function Modal({
  children,
  onClose,
  align = 'center',
  padding = 'default',
  className,
  panelClassName,
}: ModalProps) {
  const closeFromBackdrop = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose()
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
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div
      className={cn(
        'modal-overlay fixed inset-0 z-50 grid bg-slate-950/40',
        align === 'center' ? 'place-items-center' : 'lg:place-items-end',
        padding === 'default' ? 'p-0 md:px-4 md:py-6' : null,
        className,
      )}
      onPointerDown={closeFromBackdrop}
      role="presentation"
    >
      <div
        aria-modal="true"
        className={cn('modal-panel h-svh w-full md:h-auto', align === 'center' ? 'flex justify-center' : null, panelClassName)}
        onPointerDown={closeFromBackdrop}
        role="dialog"
      >
        {children}
      </div>
    </div>
  )
}
