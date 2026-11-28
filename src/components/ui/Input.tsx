import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils/cn'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string | undefined
  /** Короткая подпись внутри поля справа, например валюта. */
  suffix?: string | undefined
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, id, label, suffix, ...props },
  ref,
) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-700" htmlFor={id}>
      <span>{label}</span>
      <span className="relative block min-w-0">
      <input
        id={id}
        ref={ref}
        className={cn(
          'min-h-11 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15',
          error && 'border-red-300 focus:border-red-600 focus:ring-red-600/15',
          suffix && 'pr-14',
          className,
        )}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-500">
          {suffix}
        </span>
      ) : null}
      </span>
      {error ? (
        <span className="text-xs font-normal text-red-700" id={`${id}-error`}>
          {error}
        </span>
      ) : null}
    </label>
  )
})
