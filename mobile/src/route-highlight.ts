import { useEffect, useMemo, useState } from 'react'
import { AccessibilityInfo, AppState } from 'react-native'
import { distanceMeters } from '../../src/arrival'
import type { Coordinates, RoadLine } from '../../src/route-geometry'

export function useRouteHighlight(road: RoadLine) {
  const [phase, setPhase] = useState(-1)
  const distances = useMemo(() => {
    const coordinates = road.coordinates
    const result = [0]
    for (let i = 1; i < coordinates.length; i++) {
      const [longitude, latitude] = coordinates[i]
      const [previousLongitude, previousLatitude] = coordinates[i - 1]
      result.push(result[i - 1] + distanceMeters(
        { longitude: previousLongitude, latitude: previousLatitude }, { longitude, latitude },
      ))
    }
    return result
  }, [road])

  useEffect(() => {
    let alive = true
    let reduced = true
    let timer: ReturnType<typeof setInterval> | undefined
    function sync() {
      clearInterval(timer)
      if (!alive) return
      if (reduced || AppState.currentState !== 'active') { setPhase(-1); return }
      const start = Date.now()
      const update = () => setPhase(((Date.now() - start) % 6500) / 6500)
      update()
      timer = setInterval(update, 33)
    }
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', enabled => { reduced = enabled; sync() })
    const visibility = AppState.addEventListener('change', sync)
    void AccessibilityInfo.isReduceMotionEnabled().then(enabled => { reduced = enabled; sync() }).catch(() => undefined)
    return () => { alive = false; clearInterval(timer); motion.remove(); visibility.remove() }
  }, [road])

  return useMemo(() => {
    const length = distances.at(-1) ?? 0
    if (phase < 0 || !length) return []
    const head = (1.18 * phase - .03) * length

    function slice(from: number, to: number): Coordinates[] {
      const start = Math.max(0, from)
      const end = Math.min(length, to)
      if (start >= end) return []
      const coordinates: Coordinates[] = []
      for (let i = 1; i < distances.length; i++) {
        const a = distances[i - 1], b = distances[i]
        if (a >= end) break
        if (b <= start || a === b) continue
        const [x, y] = road.coordinates[i - 1]
        const [nextX, nextY] = road.coordinates[i]
        const interpolate = (distance: number): Coordinates => {
          const t = (distance - a) / (b - a)
          return [x + (nextX - x) * t, y + (nextY - y) * t]
        }
        if (!coordinates.length) coordinates.push(interpolate(Math.max(start, a)))
        coordinates.push(interpolate(Math.min(end, b)))
      }
      return coordinates
    }

    return bands.flatMap(band => {
      const coordinates = slice(head - band.tail * length, head)
      return coordinates.length < 2 ? [] : [{ ...band, coordinates }]
    })
  }, [distances, phase, road])
}

const bands = [
  { id: 'trail', tail: .15, width: 4, color: '#a880f4' },
  { id: 'glow', tail: .095, width: 3.5, color: '#c4adff' },
  { id: 'tip', tail: .035, width: 2.5, color: '#e9ddff' },
]
