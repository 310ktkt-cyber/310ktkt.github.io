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

const HEIGHT = 228
const AXIS_WIDTH = 48
const TOP_PADDING = 34
const RIGHT_PADDING = 18
const BOTTOM_PADDING = 36
const MIN_CHART_WIDTH = 286
const POINT_SPACING = 10

type AxisRange = { min: number; max: number }
type SingleTouch = { startX: number; startY: number; moved: boolean }
type TwoFingerScroll = { lastCenterX: number }

function formatValue(value: number, unit: string): string {
  return `${value.toLocaleString('ja-JP', { maximumFractionDigits: unit === 'kcal' ? 0 : 1 })} ${unit}`
}

function formatAxisValue(value: number, unit: string): string {
  return value.toLocaleString('ja-JP', { maximumFractionDigits: unit === 'kcal' ? 0 : 1 })
}

function calculateAxisRange(values: number[], unit: string): AxisRange {
  if (values.length === 0) return { min: 0, max: 1 }
  const smallest = Math.min(...values)
  const largest = Math.max(...values)
  const spread = largest - smallest
  const padding = spread === 0
    ? Math.max(Math.abs(largest) * 0.06, unit === 'kcal' ? 50 : 0.5)
    : spread * 0.15
  return { min: Math.max(0, smallest - padding), max: largest + padding }
}

export function LineChart({ title, unit, series, description }: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const scrollContainer = useRef<HTMLDivElement>(null)
  const chartSvg = useRef<SVGSVGElement>(null)
  const twoFingerScroll = useRef<TwoFingerScroll | null>(null)
  const singleTouch = useRef<SingleTouch | null>(null)
  const twoFingerUsed = useRef(false)
  const suppressNextTap = useRef(false)
  const points = series[0]?.points ?? []
  const validValues = series
    .flatMap((line) => line.points.flatMap((point) => [point.value, point.average]))
    .filter((value): value is number => value !== null)
  const hasData = validValues.length > 0
  const recentValues = series
    .flatMap((line) => line.points.slice(-30).flatMap((point) => [point.value, point.average]))
    .filter((value): value is number => value !== null)
  const autoRange = useMemo(() => calculateAxisRange(recentValues, unit), [recentValues, unit])
  const [axisRange, setAxisRange] = useState<AxisRange>(autoRange)
  const { min, max } = axisRange
  const chartWidth = Math.max(MIN_CHART_WIDTH, RIGHT_PADDING + Math.max(points.length - 1, 0) * POINT_SPACING)
  const plotWidth = chartWidth - RIGHT_PADDING - 4
  const plotHeight = HEIGHT - TOP_PADDING - BOTTOM_PADDING
  const x = (index: number) => 4 + (index / Math.max(points.length - 1, 1)) * plotWidth
  const y = (value: number) => TOP_PADDING + (1 - (value - min) / (max - min)) * plotHeight
  const adjustmentStep = unit === 'kcal' ? 100 : 0.5
  const minimumRange = unit === 'kcal' ? 1 : 0.1

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

  const indexAtClientX = (clientX: number, chart: SVGSVGElement): number | null => {
    if (points.length === 0) return null
    const rect = chart.getBoundingClientRect()
    const renderedPlotWidth = (plotWidth / chartWidth) * rect.width
    const position = Math.max(0, Math.min(renderedPlotWidth, clientX - rect.left - (4 / chartWidth) * rect.width))
    return Math.round((position / renderedPlotWidth) * (points.length - 1))
  }

  useEffect(() => {
    setAxisRange(autoRange)
  }, [autoRange.min, autoRange.max])

  useEffect(() => {
    const element = scrollContainer.current
    if (element) element.scrollLeft = element.scrollWidth
  }, [chartWidth])

  useEffect(() => {
    const element = scrollContainer.current
    if (!element || !hasData) return

    const handleTouchMove = (event: TouchEvent) => {
      const currentSingleTouch = singleTouch.current
      if (event.touches.length === 1 && currentSingleTouch && !twoFingerUsed.current) {
        const touch = event.touches[0]
        if (Math.hypot(touch.clientX - currentSingleTouch.startX, touch.clientY - currentSingleTouch.startY) > 10) {
          currentSingleTouch.moved = true
          suppressNextTap.current = true
        }
        return
      }

      const activeScroll = twoFingerScroll.current
      if (event.touches.length !== 2 || !activeScroll) return
      event.preventDefault()
      const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2
      element.scrollLeft -= centerX - activeScroll.lastCenterX
      activeScroll.lastCenterX = centerX
    }

    element.addEventListener('touchmove', handleTouchMove, { passive: false })
    return () => element.removeEventListener('touchmove', handleTouchMove)
  }, [hasData])

  const adjustLower = (direction: -1 | 1) => {
    setAxisRange(({ min: currentMin, max: currentMax }) => ({
      min: direction === -1
        ? Math.max(0, currentMin - adjustmentStep)
        : Math.min(currentMin + adjustmentStep, currentMax - minimumRange),
      max: currentMax
    }))
  }

  const adjustUpper = (direction: -1 | 1) => {
    setAxisRange(({ min: currentMin, max: currentMax }) => ({
      min: currentMin,
      max: direction === -1
        ? Math.max(currentMin + minimumRange, currentMax - adjustmentStep)
        : currentMax + adjustmentStep
    }))
  }

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
          <div className="axis-controls" role="group" aria-label={`${title}の縦軸の範囲を調整`}>
            <span>Y軸（直近30日を基準）</span>
            <div className="axis-control-actions">
              <div className="axis-bound">
                <span>下限 {formatAxisValue(min, unit)}</span>
                <button type="button" onClick={() => adjustLower(-1)} aria-label={`${title}の縦軸の下限を下げる`}>−</button>
                <button type="button" onClick={() => adjustLower(1)} aria-label={`${title}の縦軸の下限を上げる`}>＋</button>
              </div>
              <div className="axis-bound">
                <span>上限 {formatAxisValue(max, unit)}</span>
                <button type="button" onClick={() => adjustUpper(-1)} aria-label={`${title}の縦軸の上限を下げる`}>−</button>
                <button type="button" onClick={() => adjustUpper(1)} aria-label={`${title}の縦軸の上限を上げる`}>＋</button>
              </div>
              <button className="axis-reset" type="button" onClick={() => setAxisRange(autoRange)}>自動に戻す</button>
            </div>
          </div>
          <div className="chart-plot-layout">
            <svg className="chart-y-axis" viewBox={`0 0 ${AXIS_WIDTH} ${HEIGHT}`} aria-hidden="true">
              {yTicks.map((value) => (
                <text key={value} x={AXIS_WIDTH - 7} y={y(value) + 4} textAnchor="end" className="axis-label">
                  {formatAxisValue(value, unit)}
                </text>
              ))}
            </svg>
            <div
              ref={scrollContainer}
              className="chart-scroll"
              tabIndex={0}
              aria-label={`${title}のグラフ。日付の値は1本指でタップ、過去の記録は2本指で右へなぞって確認できます。`}
              onTouchStart={(event) => {
                if (event.touches.length === 1) {
                  singleTouch.current = {
                    startX: event.touches[0].clientX,
                    startY: event.touches[0].clientY,
                    moved: false
                  }
                  twoFingerUsed.current = false
                  suppressNextTap.current = false
                  return
                }
                if (event.touches.length === 2) {
                  const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2
                  twoFingerScroll.current = { lastCenterX: centerX }
                  singleTouch.current = null
                  twoFingerUsed.current = true
                  suppressNextTap.current = true
                  setSelectedIndex(null)
                }
              }}
              onTouchEnd={(event) => {
                if (event.touches.length < 2) twoFingerScroll.current = null
                if (event.touches.length !== 0) return
                const endedSingleTouch = singleTouch.current
                const lastTouch = event.changedTouches[0]
                if (endedSingleTouch && !endedSingleTouch.moved && !twoFingerUsed.current && lastTouch && chartSvg.current) {
                  setSelectedIndex(indexAtClientX(lastTouch.clientX, chartSvg.current))
                  suppressNextTap.current = true
                }
                singleTouch.current = null
                twoFingerUsed.current = false
              }}
              onTouchCancel={() => {
                twoFingerScroll.current = null
                singleTouch.current = null
                twoFingerUsed.current = false
              }}
            >
              <svg
                ref={chartSvg}
                className="line-chart"
                style={{ width: `${chartWidth}px` }}
                viewBox={`0 0 ${chartWidth} ${HEIGHT}`}
                role="img"
                aria-label={`${title}の推移グラフ。${series.map((line) => line.label).join('と')}と、それぞれの7日間移動平均を表示しています。`}
                onPointerMove={(event) => {
                  if (event.pointerType === 'touch') return
                  setSelectedIndex(indexAtClientX(event.clientX, event.currentTarget))
                }}
                onClick={(event) => {
                  if (suppressNextTap.current) {
                    suppressNextTap.current = false
                    return
                  }
                  setSelectedIndex(indexAtClientX(event.clientX, event.currentTarget))
                }}
                onPointerLeave={() => setSelectedIndex(null)}
              >
                {yTicks.map((value) => (
                  <line key={value} x1="4" x2={chartWidth - RIGHT_PADDING} y1={y(value)} y2={y(value)} className="grid-line" />
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
                    <line x1={x(selectedIndex!)} x2={x(selectedIndex!)} y1={TOP_PADDING} y2={HEIGHT - BOTTOM_PADDING} className="tooltip-line" />
                    {series.map((line) => {
                      const point = line.points[selectedIndex!]
                      return point?.value !== null && point ? <circle key={line.label} cx={x(selectedIndex!)} cy={y(point.value)} r="5" fill="#fff" stroke={line.color} strokeWidth="2.5" /> : null
                    })}
                  </g>
                )}
              </svg>
            </div>
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
