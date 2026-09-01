export function todayInTokyo(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

/** Normalizes a scale-export timestamp to its calendar day in Asia/Tokyo. */
export function normalizeTokyoDate(value: string): string | null {
  const match = value.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!match) return null
  const [, yearText, monthText, dayText, hourText = '0', minuteText = '0', secondText = '0'] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    hour > 23 || minute > 59 || second > 59
  ) return null
  return `${yearText}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function timestampSortKey(value: string): string {
  const match = value.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!match) return ''
  return [match[1], match[2], match[3], match[4] ?? '0', match[5] ?? '0', match[6] ?? '0']
    .map((part, index) => (index === 0 ? part : part.padStart(2, '0')))
    .join('')
}

export function addDays(date: string, offset: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const result = new Date(Date.UTC(year, month - 1, day + offset))
  return result.toISOString().slice(0, 10)
}

export function formatShortDate(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}/${Number(day)}`
}

export function formatLongDate(date: string): string {
  const [year, month, day] = date.split('-')
  return `${year}/${Number(month)}/${Number(day)}`
}
