import type { DailyRecord } from '../types'
import { addDays, todayInTokyo } from './date'

export type ChartPoint = {
  date: string
  value: number | null
  average: number | null
}

export function totalCalories(record: DailyRecord): number | null {
  if (record.basalMetabolismKcal === undefined || record.activeCalories === undefined) return null
  return record.basalMetabolismKcal + record.activeCalories
}

/** Positive values mean that calories consumed exceeded total calories burned. */
export function calorieBalance(record: DailyRecord): number | null {
  const total = totalCalories(record)
  if (total === null || record.intakeCalories === undefined) return null
  return record.intakeCalories - total
}

export function sevenDayMovingAverage(values: Array<number | null>): Array<number | null> {
  return values.map((_, index) => {
    const available = values.slice(Math.max(0, index - 6), index + 1).filter((value): value is number => value !== null)
    if (available.length === 0) return null
    return available.reduce((sum, value) => sum + value, 0) / available.length
  })
}

export function recentChartPoints(
  records: DailyRecord[],
  readValue: (record: DailyRecord) => number | undefined | null,
  days = 30,
  endDate?: string
): ChartPoint[] {
  const recordByDate = new Map(records.map((record) => [record.date, record]))
  const latestRecordDate = records.reduce<string | undefined>((latest, record) => (!latest || record.date > latest ? record.date : latest), undefined)
  const end = endDate ?? latestRecordDate ?? todayInTokyo()
  return chartPointsForRange(recordByDate, readValue, addDays(end, -days + 1), end)
}

/** Returns every calendar day from the oldest to newest saved record, preserving gaps. */
export function allChartPoints(
  records: DailyRecord[],
  readValue: (record: DailyRecord) => number | undefined | null
): ChartPoint[] {
  if (records.length === 0) return []
  const recordByDate = new Map(records.map((record) => [record.date, record]))
  const dates = records.map((record) => record.date).sort()
  return chartPointsForRange(recordByDate, readValue, dates[0], dates.at(-1)!)
}

function chartPointsForRange(
  recordByDate: Map<string, DailyRecord>,
  readValue: (record: DailyRecord) => number | undefined | null,
  start: string,
  end: string
): ChartPoint[] {
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1
  const values = Array.from({ length: days }, (_, index) => {
    const value = readValue(recordByDate.get(addDays(start, index)) ?? ({} as DailyRecord))
    return value === undefined || value === null ? null : value
  })
  const averages = sevenDayMovingAverage(values)
  return values.map((value, index) => ({ date: addDays(start, index), value, average: averages[index] }))
}
