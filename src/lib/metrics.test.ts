import { describe, expect, it } from 'vitest'
import { allChartPoints, calorieBalance, recentChartPoints, sevenDayMovingAverage, totalCalories } from './metrics'

describe('calories and moving averages', () => {
  it('only calculates total calories when both source values exist', () => {
    expect(totalCalories({ date: '2026-07-10', basalMetabolismKcal: 1531, activeCalories: 420, updatedAt: 'x' })).toBe(1951)
    expect(totalCalories({ date: '2026-07-10', basalMetabolismKcal: 1531, updatedAt: 'x' })).toBeNull()
  })

  it('calculates calorie balance as total calories burned minus calories consumed', () => {
    expect(calorieBalance({ date: '2026-07-10', basalMetabolismKcal: 1531, activeCalories: 420, intakeCalories: 1800, updatedAt: 'x' })).toBe(151)
    expect(calorieBalance({ date: '2026-07-10', basalMetabolismKcal: 1531, activeCalories: 420, updatedAt: 'x' })).toBeNull()
  })

  it('uses available values within the most recent seven calendar days', () => {
    const average = sevenDayMovingAverage([10, null, 20, null, null, 40, 50, 80])
    expect(average).toEqual([10, 10, 15, 15, 15, 70 / 3, 30, 47.5])
  })

  it('keeps missing days as gaps in a recent chart', () => {
    const points = recentChartPoints([{ date: '2026-07-10', weightKg: 64, updatedAt: 'x' }], (record) => record.weightKg, 3, '2026-07-10')
    expect(points).toEqual([
      { date: '2026-07-08', value: null, average: null },
      { date: '2026-07-09', value: null, average: null },
      { date: '2026-07-10', value: 64, average: 64 }
    ])
  })

  it('returns the entire saved period so older dates can be charted', () => {
    const points = allChartPoints([
      { date: '2026-06-01', weightKg: 65, updatedAt: 'x' },
      { date: '2026-06-03', weightKg: 64.5, updatedAt: 'x' }
    ], (record) => record.weightKg)
    expect(points).toEqual([
      { date: '2026-06-01', value: 65, average: 65 },
      { date: '2026-06-02', value: null, average: 65 },
      { date: '2026-06-03', value: 64.5, average: 64.75 }
    ])
  })
})
