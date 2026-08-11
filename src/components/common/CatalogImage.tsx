import { ImageIcon } from 'lucide-react'
import { useCatalogImageUrl } from '../../features/catalog/catalogImages'
import { cn } from '../../lib/utils/cn'

type CatalogImageProps = {
  alt: string
  imagePath: string | null | undefined
  className?: string
}

export function CatalogImage({ alt, className, imagePath }: CatalogImageProps) {
  const imageQuery = useCatalogImageUrl(imagePath)
  const imageUrl = imageQuery.data ?? null

  if (!imageUrl) {
    return (
      <div
        aria-label={imagePath ? 'Фото не загружено' : 'Фото отсутствует'}
        className={cn(
          'grid shrink-0 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-400',
          className,
        )}
        role="img"
      >
        <ImageIcon aria-hidden="true" className="size-5" />
      </div>
    )
  }

  return (
    <img
      alt={alt}
      className={cn('shrink-0 rounded-md border border-slate-200 bg-slate-50 object-cover', className)}
      loading="lazy"
      src={imageUrl}
    />
  )
}
