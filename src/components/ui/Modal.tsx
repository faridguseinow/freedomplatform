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
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
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
