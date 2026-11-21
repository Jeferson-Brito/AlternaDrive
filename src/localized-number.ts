export function parseNumber(value: FormDataEntryValue | null, fractionDigits = 2) {
  if (typeof value !== 'string') return NaN
  const text = value.trim().replace(/^R\$\s*/i, '').replace(/\s*km$/i, '')
  if (!text) return NaN
  const grouped = /^\d{1,3}(?:\.\d{3})+$/
  let normalized = text
  if (text.includes(',')) {
    const [whole, decimal, ...extra] = text.split(',')
    if (extra.length || (whole && !/^\d+$/.test(whole) && !grouped.test(whole)) ||
        !/^\d*$/.test(decimal) || (!whole && !decimal) || (fractionDigits === 0 || decimal.length > fractionDigits)) return NaN
    normalized = (whole.replaceAll('.', '') || '0') + '.' + decimal
  } else if (grouped.test(text)) {
    normalized = text.replaceAll('.', '')
  } else {
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return NaN
    const decimal = text.split('.')[1]
    if (decimal !== undefined && (fractionDigits === 0 || decimal.length > fractionDigits)) return NaN
  }
  const number = Number(normalized)
  return Number.isFinite(number) ? number : NaN
}

export function formatNumberDigits(value: string, currency: boolean) {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  const padded = digits.replace(/^0+(?=\d)/, '').padStart(currency ? 3 : 1, '0')
  const whole = currency ? padded.slice(0, -2) : padded
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return currency ? grouped + ',' + padded.slice(-2) : grouped
}
