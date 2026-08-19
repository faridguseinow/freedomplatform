export const formatAzn = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-'
  try {
    return new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(value) + ' AZN'
  } catch {
    return String(value)
  }
}

export default formatAzn
