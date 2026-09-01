import { describe, expect, it } from 'vitest'
import { applyImportedMeasurements, parseBodyCompositionCsv, parseCsvRows } from './csv'
import { normalizeTokyoDate } from './date'
import type { DailyRecord } from '../types'

const header = '"測定日","タイムゾーン","体重(kg)","体脂肪(%)","体脂肪量(kg)","内臓脂肪レベル","基礎代謝(kcal)","骨格筋(%)","骨格筋量(kg)","皮下脂肪率(%)"'
const data = (time: string, weight: string) => `"${time}","Asia/Tokyo","${weight}","15.1","9.6","6","1531","35.2","22.3","10.7"`

describe('CSV import', () => {
  it('parses BOM, quoted fields, and chooses the latest measurement on the same Tokyo day', () => {
    const result = parseBodyCompositionCsv(`\uFEFF${header}\n${data('2026/07/10 06:19', '63.3')}\n${data('2026/07/10 19:05', '64.0')}`)
    expect(result.missingColumns).toEqual([])
    expect(result.skipped).toBe(1)
    expect(result.measurements).toHaveLength(1)
    expect(result.measurements[0]).toMatchObject({ date: '2026-07-10', weightKg: 64, measurementAt: '2026/07/10 19:05' })
  })

  it('reports missing required headers before allowing changes', () => {
    const result = parseBodyCompositionCsv('"測定日","体重(kg)"\n"2026/07/10 06:19","63.3"')
    expect(result.measurements).toEqual([])
    expect(result.missingColumns).toContain('基礎代謝(kcal)')
  })

  it('handles escaped quote syntax in CSV fields', () => {
    expect(parseCsvRows('"a","b""c"\n')).toEqual([['a', 'b"c']])
  })
})

describe('date normalization and import reconciliation', () => {
  it('normalizes the source date as a Tokyo calendar day', () => {
    expect(normalizeTokyoDate('2026/7/3 06:19')).toBe('2026-07-03')
    expect(normalizeTokyoDate('2026/02/30 06:19')).toBeNull()
  })

  it('updates imported body values while keeping manual calories', () => {
    const existing: DailyRecord = { date: '2026-07-10', weightKg: 63.3, intakeCalories: 2100, activeCalories: 420, updatedAt: 'old' }
    const result = applyImportedMeasurements(new Map([[existing.date, existing]]), [{ date: '2026-07-10', measurementAt: '2026/07/10 20:00', weightKg: 64 }], 'now')
    expect(result).toMatchObject({ added: 0, updated: 1 })
    expect(result.records[0]).toMatchObject({ weightKg: 64, intakeCalories: 2100, activeCalories: 420 })
  })
})
