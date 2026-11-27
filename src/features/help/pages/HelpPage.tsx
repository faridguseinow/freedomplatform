import { ArrowRight, ChevronDown, CircleHelp, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { useI18n } from '../../../lib/i18n/I18nContext'
import { getTenantRoutePath } from '../../../lib/routing/appHost'
import { helpFaqCount, helpKey, helpSections, type HelpAudience } from '../helpContent'

type HelpPageProps = {
  audience: HelpAudience
}

export function HelpPage({ audience }: HelpPageProps) {
  const { currentOrganization } = useAuth()
  const { t } = useI18n()
  const location = useLocation()
  const [query, setQuery] = useState('')
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set())
  const anchor = location.hash.replace('#', '')

  const sections = useMemo(
    () =>
      helpSections[audience].map((section) => {
        const title = t(helpKey(audience, section.id, 'title'))
        const summary = t(helpKey(audience, section.id, 'summary'))
        const steps = Array.from({ length: section.steps }, (_, index) =>
          t(helpKey(audience, section.id, `step${index + 1}`)),
        )
        return { ...section, title, summary, steps, text: [title, summary, ...steps].join(' ').toLocaleLowerCase() }
      }),
    [audience, t],
  )

  const faq = useMemo(
    () =>
      audience === 'admin'
        ? Array.from({ length: helpFaqCount }, (_, index) => ({
            question: t(`help.faq${index + 1}.q`),
            answer: t(`help.faq${index + 1}.a`),
          }))
        : [],
    [audience, t],
  )

  useEffect(() => {
    if (!anchor) return
    window.requestAnimationFrame(() => document.getElementById(`help-${anchor}`)?.scrollIntoView({ block: 'start' }))
  }, [anchor])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleSections = normalizedQuery
    ? sections.filter((section) => section.text.includes(normalizedQuery))
    : sections
  const visibleFaq = normalizedQuery
    ? faq.filter((item) => `${item.question} ${item.answer}`.toLocaleLowerCase().includes(normalizedQuery))
    : faq

  const toggleSection = (id: string) =>
    setOpenSections((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <section className="mx-auto grid w-full max-w-4xl gap-5">
      <header className="grid gap-2">
        <h2 className="flex items-center gap-2 text-2xl font-semibold text-slate-950 sm:text-3xl">
          <CircleHelp aria-hidden="true" className="size-7 text-emerald-700" />
          {t('help.title')}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
          {t(audience === 'admin' ? 'help.adminIntro' : 'help.employeeIntro')}
        </p>
      </header>

      <label className="relative block">
        <span className="sr-only">{t('help.search')}</span>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          className="min-h-11 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('help.search')}
          type="search"
          value={query}
        />
      </label>

      <div className="grid gap-3">
        {visibleSections.map((section) => {
          const Icon = section.icon
          // The section from the link (#anchor) starts open; a click toggles it like any other section.
          const isOpen = Boolean(normalizedQuery) || openSections.has(section.id) !== (section.id === anchor)
          return (
            <article
              className="scroll-mt-24 rounded-lg border border-slate-200 bg-white shadow-sm"
              id={`help-${section.id}`}
              key={section.id}
            >
              <button
                aria-expanded={isOpen}
                className="flex w-full items-start gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                onClick={() => toggleSection(section.id)}
                type="button"
              >
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-950">{section.title}</span>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">{section.summary}</span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`mt-1 size-5 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {isOpen ? (
                <div className="grid gap-3 border-t border-slate-100 px-4 pb-4 pt-3 sm:pl-16">
                  <ol className="grid gap-2">
                    {section.steps.map((step, index) => (
                      <li className="flex gap-3 text-sm leading-6 text-slate-700" key={index}>
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                          {index + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  {section.path ? (
                    <Link
                      className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-emerald-800 hover:text-emerald-950"
                      to={getTenantRoutePath(section.path, currentOrganization?.slug)}
                    >
                      {t('help.openSection')}
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </article>
          )
        })}
      </div>

      {visibleFaq.length ? (
        <div className="grid gap-3">
          <h3 className="text-lg font-semibold text-slate-950">{t('help.faq')}</h3>
          {visibleFaq.map((item) => (
            <details className="group rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={item.question}>
              <summary className="cursor-pointer list-none font-medium text-slate-950 marker:hidden">
                {item.question}
              </summary>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.answer}</p>
            </details>
          ))}
        </div>
      ) : null}

      {!visibleSections.length && !visibleFaq.length ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          {t('help.noResults')}
        </p>
      ) : null}

      <p className="text-sm text-slate-500">{t('help.contact')}</p>
    </section>
  )
}

export function AdminHelpPage() {
  return <HelpPage audience="admin" />
}

export function EmployeeHelpPage() {
  return <HelpPage audience="employee" />
}
