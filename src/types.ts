export type DailyRecord = {
  date: string
  measurementAt?: string
  measurementTimeZone?: string
  weightKg?: number
  bodyFatPct?: number
  bodyFatKg?: number
  visceralFatLevel?: number
  basalMetabolismKcal?: number
  skeletalMusclePct?: number
  skeletalMuscleKg?: number
  subcutaneousFatPct?: number
  intakeCalories?: number
  activeCalories?: number
  updatedAt: string
}

export type CsvMeasurement = Pick<
  DailyRecord,
  | 'date'
  | 'measurementAt'
  | 'measurementTimeZone'
  | 'weightKg'
  | 'bodyFatPct'
  | 'bodyFatKg'
  | 'visceralFatLevel'
  | 'basalMetabolismKcal'
  | 'skeletalMusclePct'
  | 'skeletalMuscleKg'
  | 'subcutaneousFatPct'
>
