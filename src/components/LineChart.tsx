import { useMemo, useState } from 'react'
import type { ChartPoint } from '../lib/metrics'
import { formatShortDate } from '../lib/date'

type Props = {
  title: string
  unit: string
  color: string
  points: ChartPoint[]
  description: string
}

const WIDTH = 360
const HEIGHT = 228
const MARGIN = { top: 34, right: 18, bottom: 36, left: 48 }

function formatValue(value: number, unit: string): string {
  return `${value.toLocaleString('ja-JP', { maximumFractionDigits: unit === 'kcal' ? 0 : 1 })} ${unit}`
}

export function LineChart({ title, unit, color, points, description }: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const validValues = points.flatMap((point) => [point.value, point.average]).filter((value): value is number => value !== null)
  const hasData = validValues.length > 0
  const { min, max } = useMemo(() => {
    if (!hasData) return { min: 0, max: 1 }
    const smallest = Math.min(...validValues)
    const largest = Math.max(...validValues)
    const spread = largest - smallest
    const padding = spread === 0 ? Math.max(Math.abs(largest) * 0.06, unit === 'kcal' ? 50 : 0.5) : spread * 0.15
    return { min: Math.max(0, smallest - padding), max: largest + padding }
  }, [hasData, unit, validValues])
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom
  const x = (index: number) => MARGIN.left + (index / Math.max(points.length - 1, 1)) * plotWidth
  const y = (value: number) => MARGIN.top + (1 - (value - min) / (max - min)) * plotHeight
  const pathFor = (field: 'value' | 'average') => {
    let active = false
    return points.reduce((path, point, index) => {
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
  const tickIndexes = points.length <= 6
    ? points.map((_, index) => index)
    : [0, Math.round((points.length - 1) / 4), Math.round((points.length - 1) / 2), Math.round((points.length - 1) * 0.75), points.length - 1]
  const yTicks = [0, 1, 2, 3].map((index) => min + ((max - min) * index) / 3)
  const selected = selectedIndex === null ? null : points[selectedIndex]

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
        <span><i style={{ backgroundColor: color }} />実測値／算出値</span>
        <span><i className="dashed" style={{ borderColor: color }} />7日平均</span>
      </div>
      {hasData ? (
        <>
          <svg
            className="line-chart"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={`${title}の推移グラフ。実測値と7日間移動平均を表示しています。`}
            onPointerMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              const position = Math.max(0, Math.min(rect.width, event.clientX - rect.left))
              setSelectedIndex(Math.round((position / rect.width) * (points.length - 1)))
            }}
            onPointerLeave={() => setSelectedIndex(null)}
          >
            {yTicks.map((value) => (
              <g key={value}>
                <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(value)} y2={y(value)} className="grid-line" />
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
            <path d={pathFor('average')} fill="none" stroke={color} strokeWidth="2" strokeDasharray="5 4" opacity="0.45" />
            <path d={pathFor('value')} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            {points.map((point, index) => point.value !== null && (
              <circle key={point.date} cx={x(index)} cy={y(point.value)} r="3.2" fill={color} />
            ))}
            {selected && (
              <g>
                <line x1={x(selectedIndex!)} x2={x(selectedIndex!)} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} className="tooltip-line" />
                {selected.value !== null && <circle cx={x(selectedIndex!)} cy={y(selected.value)} r="5" fill="#fff" stroke={color} strokeWidth="2.5" />}
              </g>
            )}
          </svg>
          <p className="chart-tooltip" aria-live="polite">
            {selected
              ? `${selected.date}: ${selected.value === null ? '—' : formatValue(selected.value, unit)} / 7日平均 ${selected.average === null ? '—' : formatValue(selected.average, unit)}`
              : 'グラフをタップして日ごとの値を確認'}
          </p>
        </>
      ) : <div className="no-chart-data">この期間の{title}データはまだありません。</div>}
    </section>
  )
}
