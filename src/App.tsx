import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import './app.css'
import { LineChart, type ChartSeries } from './components/LineChart'
import { parseBodyCompositionCsv } from './lib/csv'
import { getAllRecords, importMeasurements, saveCalories } from './lib/database'
import { addDays, formatLongDate, todayInTokyo } from './lib/date'
import { allChartPoints, calorieBalance, totalCalories } from './lib/metrics'
import type { DailyRecord } from './types'

type Notice = { kind: 'success' | 'error'; title: string; lines?: string[] }
type ChartKey = 'weight' | 'fat' | 'muscle' | 'calories'
type PeriodDays = 14 | 30 | 90 | 180

const CHART_BUTTONS: Array<{ key: ChartKey; label: string }> = [
  { key: 'weight', label: '体重' },
  { key: 'fat', label: '脂肪量' },
  { key: 'muscle', label: '筋肉量' },
  { key: 'calories', label: '消費・摂取' }
]
const PERIOD_BUTTONS: Array<{ days: PeriodDays; label: string }> = [
  { days: 14, label: '2週間' },
  { days: 30, label: '1ヶ月' },
  { days: 90, label: '3ヶ月' },
  { days: 180, label: '6ヶ月' }
]

const numberFormat = (value: number | undefined, digits = 1) => value === undefined ? '—' : value.toLocaleString('ja-JP', { maximumFractionDigits: digits })
const kcalFormat = (value: number | null | undefined) => value === null || value === undefined ? '—' : value.toLocaleString('ja-JP', { maximumFractionDigits: 0 })
const balanceFormat = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : ''}${value.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}`
const TABLE_DAYS = 365

function inputNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined
  const result = Number(value)
  return Number.isFinite(result) && result >= 0 ? result : undefined
}

export default function App() {
  const [records, setRecords] = useState<DailyRecord[]>([])
  const [ready, setReady] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [form, setForm] = useState({ date: todayInTokyo(), intake: '', active: '' })
  const [selectedChart, setSelectedChart] = useState<ChartKey>('weight')
  const [periodDays, setPeriodDays] = useState<PeriodDays>(30)
  const [axisOptimizationToken, setAxisOptimizationToken] = useState(0)
  const [periodSelectionToken, setPeriodSelectionToken] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)

  const refreshRecords = async () => {
    setRecords(await getAllRecords())
  }
  useEffect(() => {
    refreshRecords().catch(() => setNotice({ kind: 'error', title: '端末内データを読み込めませんでした。' })).finally(() => setReady(true))
  }, [])

  const latestRecordDate = useMemo(() => records.reduce<string | undefined>((latest, record) => !latest || record.date > latest ? record.date : latest, undefined), [records])
  const chartPeriodStartDate = latestRecordDate ? addDays(latestRecordDate, -periodDays + 1) : undefined
  const points = useMemo(() => ({
    weight: allChartPoints(records, (record) => record.weightKg, chartPeriodStartDate),
    fat: allChartPoints(records, (record) => record.bodyFatKg, chartPeriodStartDate),
    muscle: allChartPoints(records, (record) => record.skeletalMuscleKg, chartPeriodStartDate),
    calories: allChartPoints(records, totalCalories, chartPeriodStartDate),
    intake: allChartPoints(records, (record) => record.intakeCalories, chartPeriodStartDate)
  }), [records, chartPeriodStartDate])
  const tableRecords = useMemo(() => {
    const startDate = latestRecordDate ? addDays(latestRecordDate, -TABLE_DAYS + 1) : undefined
    return records.filter((record) => !startDate || !latestRecordDate || (record.date >= startDate && record.date <= latestRecordDate))
  }, [records, latestRecordDate])
  const chartConfigs: Record<ChartKey, { title: string; unit: string; description: string; series: ChartSeries[] }> = {
    weight: { title: '体重', unit: 'kg', description: '日ごとの体重', series: [{ label: '体重', color: '#e24949', points: points.weight }] },
    fat: { title: '脂肪量', unit: 'kg', description: '体脂肪量の推移', series: [{ label: '脂肪量', color: '#3978d9', points: points.fat }] },
    muscle: { title: '筋肉量', unit: 'kg', description: '骨格筋量の推移', series: [{ label: '筋肉量', color: '#2c9a69', points: points.muscle }] },
    calories: {
      title: '消費・摂取カロリー',
      unit: 'kcal',
      description: '消費 = 基礎代謝 + アクティブ消費',
      series: [
        { label: '消費カロリー', color: '#20242a', points: points.calories },
        { label: '摂取カロリー', color: '#c18a00', points: points.intake }
      ]
    }
  }
  const visibleChart = chartConfigs[selectedChart]

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setIsImporting(true)
    setNotice(null)
    try {
      const parsed = parseBodyCompositionCsv(await file.text())
      if (parsed.missingColumns.length > 0) {
        setNotice({ kind: 'error', title: 'CSVの必須列が不足しています。既存データは変更していません。', lines: parsed.missingColumns.map((column) => `不足: ${column}`) })
        return
      }
      if (parsed.measurements.length === 0) {
        setNotice({ kind: 'error', title: '取り込める測定データがありませんでした。', lines: parsed.errors.slice(0, 5) })
        return
      }
      const result = await importMeasurements(parsed.measurements)
      await refreshRecords()
      const summary = [`追加 ${result.added}件`, `更新 ${result.updated}件`, `スキップ ${parsed.skipped}件`]
      const errorLines = parsed.errors.slice(0, 5)
      setNotice({ kind: 'success', title: 'CSVを取り込みました。', lines: errorLines.length ? [...summary, ...errorLines] : summary })
    } catch (error) {
      setNotice({ kind: 'error', title: 'CSVの読み込みに失敗しました。', lines: [error instanceof Error ? error.message : 'もう一度お試しください。'] })
    } finally {
      setIsImporting(false)
    }
  }

  const changeDate = (date: string) => {
    const record = records.find((item) => item.date === date)
    setForm({ date, intake: record?.intakeCalories?.toString() ?? '', active: record?.activeCalories?.toString() ?? '' })
  }

  const handleSave = async () => {
    const intake = inputNumber(form.intake)
    const active = inputNumber(form.active)
    if ((form.intake !== '' && intake === undefined) || (form.active !== '' && active === undefined)) {
      setNotice({ kind: 'error', title: 'カロリーは0以上の数値で入力してください。' })
      return
    }
    try {
      await saveCalories(form.date, intake, active)
      await refreshRecords()
      setNotice({ kind: 'success', title: `${formatLongDate(form.date)}のカロリーを保存しました。` })
    } catch {
      setNotice({ kind: 'error', title: 'カロリーを保存できませんでした。' })
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">BODY COMPOSITION</p>
          <h1>からだログ</h1>
          <p className="header-subtitle">体組成と毎日のエネルギーを、あなたの端末だけに。</p>
        </div>
        <button className="import-button" type="button" onClick={() => fileInput.current?.click()} disabled={isImporting}>
          <span aria-hidden="true">↓</span>{isImporting ? '取込中…' : 'CSVをインポート'}
        </button>
        <input ref={fileInput} className="visually-hidden" type="file" accept=".csv,text/csv" onChange={handleFile} aria-label="体組成CSVを選択" />
      </header>

      {notice && <aside className={`notice ${notice.kind}`} role="status">
        <strong>{notice.title}</strong>
        {notice.lines && <ul>{notice.lines.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}</ul>}
      </aside>}

      <section className="entry-card" aria-labelledby="entry-title">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">DAILY INPUT</p>
            <h2 id="entry-title">カロリーを記録</h2>
          </div>
          <span>未入力は「—」で表示</span>
        </div>
        <div className="entry-fields">
          <label>日付<input type="date" value={form.date} onChange={(event) => changeDate(event.target.value)} /></label>
          <label>摂取カロリー <small>kcal</small><input type="number" inputMode="numeric" min="0" step="1" placeholder="例: 2100" value={form.intake} onChange={(event) => setForm({ ...form, intake: event.target.value })} /></label>
          <label>アクティブ消費 <small>kcal</small><input type="number" inputMode="numeric" min="0" step="1" placeholder="例: 450" value={form.active} onChange={(event) => setForm({ ...form, active: event.target.value })} /></label>
        </div>
        <button className="save-button" type="button" onClick={handleSave}>保存／更新</button>
      </section>

      {!ready ? <div className="loading">記録を読み込んでいます…</div> : records.length === 0 ? (
        <section className="empty-state" aria-label="データがない状態">
          <div aria-hidden="true">⌁</div>
          <h2>まだ記録がありません</h2>
          <p>上のボタンから体組成計のCSVを取り込むか、日付とカロリーを入力して始めましょう。</p>
        </section>
      ) : <>
        <section className="charts-section" aria-label="選択した期間の推移">
          <div className="section-heading"><p className="eyebrow">CHART</p><h2>推移</h2><p>選択した期間を基準に、2本指で過去の記録も確認できます</p></div>
          <div className="chart-switcher" role="group" aria-label="表示するグラフを選択">
            {CHART_BUTTONS.map((chart) => <button
              key={chart.key}
              type="button"
              className={chart.key === selectedChart ? 'is-active' : undefined}
              aria-pressed={chart.key === selectedChart}
              onClick={() => {
                setSelectedChart(chart.key)
                setAxisOptimizationToken((token) => token + 1)
              }}
            >{chart.label}</button>)}
          </div>
          <div className="period-selector" role="group" aria-label="グラフの表示期間を選択">
            <span>表示期間</span>
            <div>
              {PERIOD_BUTTONS.map((period) => <button
                key={period.days}
                type="button"
                className={period.days === periodDays ? 'is-active' : undefined}
                aria-pressed={period.days === periodDays}
                onClick={() => {
                  setPeriodDays(period.days)
                  setAxisOptimizationToken((token) => token + 1)
                  setPeriodSelectionToken((token) => token + 1)
                }}
              >{period.label}</button>)}
            </div>
          </div>
          <LineChart {...visibleChart} axisOptimizationToken={axisOptimizationToken} periodSelectionToken={periodSelectionToken} displayPeriodDays={periodDays} />
        </section>
        <section className="table-card" aria-labelledby="table-title">
          <div className="section-heading"><p className="eyebrow">DETAILS</p><h2 id="table-title">日別詳細</h2><p>直近1年・新しい日付順。表内を上下／横にスクロールできます</p></div>
          <div className="table-wrap" tabIndex={0} aria-label="直近1年の日別詳細表。上下と横方向にスクロールできます。">
            <table>
              <thead><tr>
                <th className="sticky-date">日付</th><th>体重<br />(kg)</th><th>体脂肪率<br />(%)</th><th>体脂肪量<br />(kg)</th><th>皮下脂肪率<br />(%)</th><th>内臓脂肪<br />レベル</th><th>基礎代謝<br />(kcal)</th><th>骨格筋率<br />(%)</th><th>筋肉量<br />(kg)</th><th>摂取<br />(kcal)</th><th>アクティブ消費<br />(kcal)</th><th>合計消費<br />(kcal)</th><th>カロリー収支<br />(摂取−消費)</th>
              </tr></thead>
              <tbody>{tableRecords.map((record) => <tr key={record.date}>
                <th className="sticky-date" scope="row">{formatLongDate(record.date)}</th>
                <td>{numberFormat(record.weightKg)}</td><td>{numberFormat(record.bodyFatPct)}</td><td>{numberFormat(record.bodyFatKg)}</td><td>{numberFormat(record.subcutaneousFatPct)}</td><td>{numberFormat(record.visceralFatLevel)}</td><td>{kcalFormat(record.basalMetabolismKcal)}</td><td>{numberFormat(record.skeletalMusclePct)}</td><td>{numberFormat(record.skeletalMuscleKg)}</td><td>{kcalFormat(record.intakeCalories)}</td><td>{kcalFormat(record.activeCalories)}</td><td>{kcalFormat(totalCalories(record))}</td><td>{balanceFormat(calorieBalance(record))}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>
      </>}
      <footer>データはこの端末のブラウザ内に保存されています。</footer>
    </main>
  )
}
