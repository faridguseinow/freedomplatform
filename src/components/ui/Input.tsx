import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils/cn'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string | undefined
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, id, label, ...props },
  ref,
) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-700" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        ref={ref}
        className={cn(
          'min-h-11 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15',
          error && 'border-red-300 focus:border-red-600 focus:ring-red-600/15',
          className,
        )}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error ? (
        <span className="text-xs font-normal text-red-700" id={`${id}-error`}>
          {error}
        </span>
      ) : null}
    </label>
  )
})
