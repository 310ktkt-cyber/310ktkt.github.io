import type { CsvMeasurement, DailyRecord } from '../types'
import { normalizeTokyoDate, timestampSortKey } from './date'

const columnMap = {
  measurementAt: '測定日',
  measurementTimeZone: 'タイムゾーン',
  weightKg: '体重(kg)',
  bodyFatPct: '体脂肪(%)',
  bodyFatKg: '体脂肪量(kg)',
  visceralFatLevel: '内臓脂肪レベル',
  basalMetabolismKcal: '基礎代謝(kcal)',
  skeletalMusclePct: '骨格筋(%)',
  skeletalMuscleKg: '骨格筋量(kg)',
  subcutaneousFatPct: '皮下脂肪率(%)'
} as const

type NumericCsvKey = Exclude<keyof typeof columnMap, 'measurementAt' | 'measurementTimeZone'>

export type CsvParseResult = {
  measurements: CsvMeasurement[]
  missingColumns: string[]
  skipped: number
  errors: string[]
}

/** A small RFC4180-compatible parser; supports quoted commas and escaped quotes. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let inQuotes = false
  const input = text.replace(/^\uFEFF/, '')

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (inQuotes) {
      if (char === '"' && input[i + 1] === '"') {
        value += '"'
        i += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        value += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(value)
      value = ''
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''))
      if (row.some((cell) => cell !== '')) rows.push(row)
      row = []
      value = ''
    } else {
      value += char
    }
  }
  row.push(value.replace(/\r$/, ''))
  if (row.some((cell) => cell !== '')) rows.push(row)
  return rows
}

function toOptionalNumber(value: string): number | undefined {
  const cleaned = value.replace(/,/g, '').trim()
  if (cleaned === '') return undefined
  const number = Number(cleaned)
  return Number.isFinite(number) ? number : undefined
}

export function parseBodyCompositionCsv(text: string): CsvParseResult {
  const rows = parseCsvRows(text)
  const headers = rows[0]?.map((header) => header.trim()) ?? []
  const headerIndex = new Map(headers.map((header, index) => [header, index]))
  const missingColumns = Object.values(columnMap).filter((name) => !headerIndex.has(name))
  if (missingColumns.length > 0) return { measurements: [], missingColumns, skipped: 0, errors: [] }

  const newestByDate = new Map<string, CsvMeasurement>()
  const errors: string[] = []
  let skipped = 0
  rows.slice(1).forEach((row, offset) => {
    const rowNumber = offset + 2
    const rawDate = row[headerIndex.get(columnMap.measurementAt)!] ?? ''
    const date = normalizeTokyoDate(rawDate)
    if (!date) {
      skipped += 1
      errors.push(`${rowNumber}行目: 測定日「${rawDate || '空欄'}」を日付として読み取れません。`)
      return
    }

    const measurement: CsvMeasurement = {
      date,
      measurementAt: rawDate.trim(),
      measurementTimeZone: (row[headerIndex.get(columnMap.measurementTimeZone)!] ?? '').trim() || undefined
    }
    for (const [key, header] of Object.entries(columnMap) as [keyof typeof columnMap, string][]) {
      if (key === 'measurementAt' || key === 'measurementTimeZone') continue
      const rawValue = row[headerIndex.get(header)!] ?? ''
      const value = toOptionalNumber(rawValue)
      if (rawValue.trim() !== '' && value === undefined) {
        errors.push(`${rowNumber}行目: ${header}「${rawValue}」を数値として読み取れません。`)
      }
      ;(measurement as Record<string, unknown>)[key] = value
    }

    const previous = newestByDate.get(date)
    if (previous) skipped += 1
    if (!previous || timestampSortKey(measurement.measurementAt ?? '') >= timestampSortKey(previous.measurementAt ?? '')) {
      newestByDate.set(date, measurement)
    }
  })
  return { measurements: [...newestByDate.values()].sort((a, b) => a.date.localeCompare(b.date)), missingColumns, skipped, errors }
}

export function applyImportedMeasurements(
  existing: Map<string, DailyRecord>,
  measurements: CsvMeasurement[],
  now = new Date().toISOString()
): { records: DailyRecord[]; added: number; updated: number } {
  let added = 0
  let updated = 0
  const records = new Map(existing)
  for (const measurement of measurements) {
    const previous = records.get(measurement.date)
    if (previous) updated += 1
    else added += 1
    records.set(measurement.date, { ...previous, ...measurement, date: measurement.date, updatedAt: now })
  }
  return { records: [...records.values()], added, updated }
}
