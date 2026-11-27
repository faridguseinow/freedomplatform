import type { SystemLanguage } from './translations'

const itemUnitAliases = new Set(['шт', 'шт.', 'штука', 'штук', 'ədəd', 'pcs'])

const itemUnitByLanguage: Record<SystemLanguage, string> = {
  ru: 'шт.',
  az: 'ədəd',
  en: 'pcs',
}

export function formatUnitName(unitName: string | null | undefined, language: SystemLanguage) {
  const normalized = unitName?.trim() ?? ''
  if (!normalized) return ''

  return itemUnitAliases.has(normalized.toLocaleLowerCase()) ? itemUnitByLanguage[language] : normalized
}

export function formatUnitsInText(value: string, language: SystemLanguage) {
  const itemUnit = itemUnitByLanguage[language]
  return value.replace(/(?:шт\.*|штук(?:а|и)?|ədəd|pcs)(?=\s|$|[,;:!?])/giu, itemUnit)
}
