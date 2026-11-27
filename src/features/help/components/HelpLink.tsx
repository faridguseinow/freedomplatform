import { CircleHelp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { getTenantRoutePath } from '../../../lib/routing/appHost'
import { helpPath, type HelpAudience } from '../helpContent'

type HelpLinkProps = {
  audience?: HelpAudience
  section: string
}

/** Small "?" link next to a page title that opens the matching Help section. */
export function HelpLink({ audience = 'admin', section }: HelpLinkProps) {
  const { currentOrganization } = useAuth()
  const { t } = useI18n()
  const label = t('help.hint')

  return (
    <Link
      aria-label={label}
      className="ml-2 inline-flex size-8 shrink-0 items-center justify-center rounded-full align-middle text-slate-400 transition hover:bg-slate-100 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
      title={label}
      to={getTenantRoutePath(helpPath(audience, section), currentOrganization?.slug)}
    >
      <CircleHelp aria-hidden="true" className="size-5" />
    </Link>
  )
}
