import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChartPoint } from '../lib/metrics'
import { formatShortDate } from '../lib/date'

type Props = {
  title: string
  unit: string
  description: string
  series: ChartSeries[]
}

export type ChartSeries = {
  label: string
  color: string
  points: ChartPoint[]
}

const WIDTH = 360
const HEIGHT = 228
const MARGIN = { top: 34, right: 18, bottom: 36, left: 48 }

function formatValue(value: number, unit: string): string {
  return `${value.toLocaleString('ja-JP', { maximumFractionDigits: unit === 'kcal' ? 0 : 1 })} ${unit}`
}

export function LineChart({ title, unit, series, description }: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const scrollContainer = useRef<HTMLDivElement>(null)
  const points = series[0]?.points ?? []
  const validValues = series.flatMap((line) => line.points.flatMap((point) => [point.value, point.average]))
    .filter((value): value is number => value !== null)
  const hasData = validValues.length > 0
  const { min, max } = useMemo(() => {
    if (!hasData) return { min: 0, max: 1 }
    const smallest = Math.min(...validValues)
    const largest = Math.max(...validValues)
    const spread = largest - smallest
    const padding = spread === 0 ? Math.max(Math.abs(largest) * 0.06, unit === 'kcal' ? 50 : 0.5) : spread * 0.15
    return { min: Math.max(0, smallest - padding), max: largest + padding }
  }, [hasData, unit, validValues])
  const chartWidth = Math.max(WIDTH, MARGIN.left + MARGIN.right + Math.max(points.length - 1, 0) * 12)
  const plotWidth = chartWidth - MARGIN.left - MARGIN.right
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom
  const x = (index: number) => MARGIN.left + (index / Math.max(points.length - 1, 1)) * plotWidth
  const y = (value: number) => MARGIN.top + (1 - (value - min) / (max - min)) * plotHeight
  const pathFor = (line: ChartSeries, field: 'value' | 'average') => {
    let active = false
    return line.points.reduce((path, point, index) => {
      const value = point[field]
      if (value === null) {
        active = false
        return path
      }
      const command = active ? 'L' : 'M'
      active = true
      return `${path}${command}${x(index).toFixed(1)},${y(value).toFixed(1)} `
    }, '')
  }
  const tickIndexes = useMemo(() => {
    if (points.length <= 6) return points.map((_, index) => index)
    const labelCount = Math.max(2, Math.floor(plotWidth / 72) + 1)
    const step = Math.ceil((points.length - 1) / (labelCount - 1))
    const indexes = Array.from({ length: Math.ceil((points.length - 1) / step) }, (_, index) => index * step)
    if (indexes.at(-1) !== points.length - 1) indexes.push(points.length - 1)
    return indexes
  }, [plotWidth, points])
  const yTicks = [0, 1, 2, 3].map((index) => min + ((max - min) * index) / 3)
  const selected = selectedIndex === null ? null : points[selectedIndex]

  useEffect(() => {
    const element = scrollContainer.current
    if (element) element.scrollLeft = element.scrollWidth
  }, [chartWidth])

  return (
    <section className="chart-card" aria-labelledby={`chart-${title}`}>
      <div className="chart-heading">
        <div>
          <h2 id={`chart-${title}`}>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="unit-pill">{unit}</span>
      </div>
      <div className="legend" aria-label="凡例">
        {series.flatMap((line) => [
          <span key={`${line.label}-value`}><i style={{ backgroundColor: line.color }} />{series.length === 1 ? '実測値／算出値' : line.label}</span>,
          <span key={`${line.label}-average`}><i className="dashed" style={{ borderColor: line.color }} />{series.length === 1 ? '7日平均' : `${line.label}・7日平均`}</span>
        ])}
      </div>
      {hasData ? (
        <>
          <div ref={scrollContainer} className="chart-scroll" tabIndex={0} aria-label={`${title}のグラフ。右へスワイプすると過去の記録を確認できます。`}>
          <svg
            className="line-chart"
            style={chartWidth > WIDTH ? { width: `${chartWidth}px` } : undefined}
            viewBox={`0 0 ${chartWidth} ${HEIGHT}`}
            role="img"
            aria-label={`${title}の推移グラフ。${series.map((line) => line.label).join('と')}と、それぞれの7日間移動平均を表示しています。`}
            onPointerMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              const plotStart = (MARGIN.left / chartWidth) * rect.width
              const renderedPlotWidth = (plotWidth / chartWidth) * rect.width
              const position = Math.max(0, Math.min(renderedPlotWidth, event.clientX - rect.left - plotStart))
              setSelectedIndex(Math.round((position / renderedPlotWidth) * (points.length - 1)))
            }}
            onPointerLeave={() => setSelectedIndex(null)}
          >
            {yTicks.map((value) => (
              <g key={value}>
                <line x1={MARGIN.left} x2={chartWidth - MARGIN.right} y1={y(value)} y2={y(value)} className="grid-line" />
                <text x={MARGIN.left - 7} y={y(value) + 4} textAnchor="end" className="axis-label">
                  {value.toLocaleString('ja-JP', { maximumFractionDigits: unit === 'kcal' ? 0 : 1 })}
                </text>
              </g>
            ))}
            {tickIndexes.map((index) => (
              <text key={index} x={x(index)} y={HEIGHT - 12} textAnchor="middle" className="axis-label">
                {formatShortDate(points[index].date)}
              </text>
            ))}
            {series.map((line) => <g key={line.label}>
              <path d={pathFor(line, 'average')} fill="none" stroke={line.color} strokeWidth="2" strokeDasharray="5 4" opacity="0.45" />
              <path d={pathFor(line, 'value')} fill="none" stroke={line.color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              {line.points.map((point, index) => point.value !== null && (
                <circle key={point.date} cx={x(index)} cy={y(point.value)} r="3.2" fill={line.color} />
              ))}
            </g>)}
            {selected && (
              <g>
                <line x1={x(selectedIndex!)} x2={x(selectedIndex!)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} className="tooltip-line" />
                {series.map((line) => {
                  const point = line.points[selectedIndex!]
                  return point?.value !== null && point ? <circle key={line.label} cx={x(selectedIndex!)} cy={y(point.value)} r="5" fill="#fff" stroke={line.color} strokeWidth="2.5" /> : null
                })}
              </g>
            )}
          </svg>
          </div>
          <p className="chart-tooltip" aria-live="polite">
            {selected
              ? `${selected.date}: ${series.map((line) => {
                const point = line.points[selectedIndex!]
                return `${line.label} ${point?.value === null || !point ? '—' : formatValue(point.value, unit)}（7日平均 ${point?.average === null || !point ? '—' : formatValue(point.average, unit)}）`
              }).join(' / ')}`
              : 'グラフをタップして日ごとの値を確認'}
          </p>
        </>
      ) : <div className="no-chart-data">この期間の{title}データはまだありません。</div>}
    </section>
  )
}
