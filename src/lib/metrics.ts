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
  const values = Array.from({ length: days }, (_, index) => {
    const date = addDays(end, index - days + 1)
    const value = readValue(recordByDate.get(date) ?? ({} as DailyRecord))
    return value === undefined || value === null ? null : value
  })
  const averages = sevenDayMovingAverage(values)
  return values.map((value, index) => ({ date: addDays(end, index - days + 1), value, average: averages[index] }))
}
