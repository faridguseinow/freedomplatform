import { forwardRef, useState, type ChangeEvent, type InputHTMLAttributes } from 'react'
import { ImagePlus } from 'lucide-react'
import { cn } from '../../lib/utils/cn'

type ImageFileInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string
  hint?: string | undefined
  error?: string | undefined
}

export const ImageFileInput = forwardRef<HTMLInputElement, ImageFileInputProps>(
  function ImageFileInput(
    {
      accept = 'image/*',
      className,
      error,
      hint = 'PNG, JPG или WebP. Нажмите, чтобы выбрать фотографию.',
      id,
      label,
      onChange,
      ...props
    },
    ref,
  ) {
    const [fileName, setFileName] = useState('')

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
      setFileName(event.target.files?.item(0)?.name ?? '')
      onChange?.(event)
    }

    return (
      <label className={cn('grid gap-1.5 text-sm font-medium text-slate-700', className)} htmlFor={id}>
        <span>{label}</span>
        <span
          className={cn(
            'group grid min-h-28 cursor-pointer place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center transition-colors',
            'hover:border-emerald-300 hover:bg-emerald-50/40',
            'focus-within:border-emerald-700 focus-within:bg-emerald-50/40 focus-within:ring-2 focus-within:ring-emerald-700/15',
            error && 'border-red-300 bg-red-50/50 focus-within:border-red-600 focus-within:ring-red-600/15',
          )}
        >
          <input
            accept={accept}
            aria-describedby={error ? `${id}-error` : undefined}
            aria-invalid={Boolean(error)}
            className="sr-only"
            id={id}
            onChange={handleChange}
            ref={ref}
            type="file"
            {...props}
          />
          <span className="grid gap-2">
            <span className="mx-auto grid size-11 place-items-center rounded-md bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200 transition-colors group-hover:ring-emerald-200">
              <ImagePlus aria-hidden="true" className="size-5" />
            </span>
            <span className="text-sm font-semibold text-slate-900">
              {fileName || 'Выбрать фотографию'}
            </span>
            <span className="text-xs font-normal leading-5 text-slate-500">{hint}</span>
          </span>
        </span>
        {error ? (
          <span className="text-xs font-normal text-red-700" id={`${id}-error`}>
            {error}
          </span>
        ) : null}
      </label>
    )
  },
)
