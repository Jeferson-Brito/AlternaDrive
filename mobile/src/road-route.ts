import { useEffect, useMemo, useRef, useState } from 'react'
import type { LocationObject } from 'expo-location'
import { distanceMeters } from '../../src/arrival'
import { navigationEstimate } from '../../src/journey-time'
import { remainingRoad, routeProgress, travelBearing, type RoadLine } from '../../src/route-geometry'
import { api } from './api'
import type { StopDemand } from './Passenger'
import type { NearbyDriver } from './nearby-drivers'
import type { Journey, Point } from './model'

export const coords = ({ longitude, latitude }: Point): [number, number] => [longitude, latitude]
type Road = { geometry: RoadLine; distance: number; duration: number }
export type RouteInputs = {
  a: Point | null; b: Point | null; active: Journey | null; position: LocationObject | null; token: string
}

export function useRoadRoute({ a, b, active, position, token }: RouteInputs) {
  const [loaded, setLoaded] = useState<{ key: string; road: Road }>()
  const [passed, setPassed] = useState<{ road: Road; progress: ReturnType<typeof routeProgress> }>()
  const [routeError, setRouteError] = useState(false)
  const loading = useRef(false)
  const [reroute, setReroute] = useState<{ key: string; attempt: number }>()
  const fix = useRef(position)
  fix.current = position
  const returning = (active?.arrivals ?? 0) % 2 === 1
  const from = returning ? b : a
  const to = returning ? a : b
  const routeKey = [active?.id, active?.arrivals, from?.latitude, from?.longitude, to?.latitude, to?.longitude].join(':')
  const road = loaded?.key === routeKey ? loaded.road : undefined
  const current = position?.coords
  const progress = useMemo(() => road && current ? routeProgress(current, road.geometry.coordinates) : null, [current, road])

  useEffect(() => {
    if (!from || !to) return
    const abort = new AbortController()
    setRouteError(false)
    const nearby = active && fix.current?.coords && (fix.current.coords.accuracy ?? Infinity) <= 50 ? fix.current.coords : null
    const start = nearby ?? from
    loading.current = true
    const isReroute = reroute?.key === routeKey
    const timer = setTimeout(() => { abort.abort(); loading.current = false; setRouteError(true) }, 12000)
    const useRoad = (road: Road) => setLoaded({ key: routeKey, road })
    async function load() {
      const far = distanceMeters(start, from!) > 150
      const habitual = isReroute || !token ? null : await api<{ checkpoints: Point[] | null; manual?: Point[] }>(
        'routes/habitual', { from, to }, token, abort.signal).catch(() => null)
      if (abort.signal.aborted) return
      if (habitual?.manual) {
        const coordinates = habitual.manual.map(coords)
        if (!far || routeProgress(start, coordinates).distance <= 90) {
          const distance = habitual.manual.slice(1).reduce((total, point, index) =>
            total + distanceMeters(habitual.manual![index], point), 0)
          useRoad({ geometry: { type: 'LineString', coordinates }, distance, duration: distance / (25 / 3.6) })
          return
        }
      }
      const points = [start, ...(!far && habitual?.checkpoints?.slice(1, -1) || []), to!].map(coords).join(';')
      const response = await fetch('https://routing.openstreetmap.de/routed-car/route/v1/driving/' + points + '?overview=full&geometries=geojson', { signal: abort.signal })
      if (!response.ok) throw new Error('Rota indisponível.')
      const data = await response.json() as { routes?: Road[] }
      const route = data.routes?.[0]
      if (!route || route.geometry.coordinates.length < 2) throw new Error('Rota indisponível.')
      if (!abort.signal.aborted) useRoad(route)
    }
    void load().catch(() => { if (!abort.signal.aborted) setRouteError(true) }).finally(() => { clearTimeout(timer); if (!abort.signal.aborted) loading.current = false })
    return () => { clearTimeout(timer); abort.abort() }
  }, [routeKey, reroute, token])

  const accuracy = current?.accuracy ?? Infinity
  const headingGap = current?.heading != null && current.heading >= 0 && progress?.bearing != null
    ? Math.abs(((current.heading - progress.bearing + 540) % 360) - 180) : 0
  const wrongTurn = (current?.speed ?? 0) >= 3 && headingGap > 55
  const deviation = wrongTurn ? 14 : 23
  const offRoute = !!(active && progress && accuracy <= 40 && progress.distance > Math.max(deviation, accuracy * 1.25))
  useEffect(() => {
    if (!offRoute || !loaded || loaded.key !== routeKey || loading.current) return
    const delay = routeError ? 3000 : 650
    const timer = setTimeout(() => setReroute(previous => ({ key: routeKey, attempt: (previous?.attempt ?? 0) + 1 })), delay)
    return () => clearTimeout(timer)
  }, [offRoute, routeKey, loaded, reroute, routeError])

  useEffect(() => {
    if (!active || !road || !progress || accuracy > 40 || offRoute) return
    setPassed(previous => previous?.road === road && previous.progress.remaining <= progress.remaining
      ? previous : { road, progress })
  }, [active?.id, road, progress, accuracy, offRoute])

  const traveled = passed?.road === road ? passed?.progress : undefined
  const visibleRoad = useMemo(() => road && traveled ? remainingRoad(road.geometry, traveled) : road?.geometry, [road, traveled])
  const estimate = road && navigationEstimate(road.distance, road.duration, traveled?.remaining ?? 1, current?.speed ?? undefined)
  const firstSegment = road?.geometry.coordinates
  const initialBearing = firstSegment ? travelBearing(
    { latitude: firstSegment[0][1], longitude: firstSegment[0][0] },
    { latitude: firstSegment[1][1], longitude: firstSegment[1][0] },
  ) : from && to ? travelBearing(from, to) : undefined
  const heading = (current?.speed ?? 0) >= 2 && current?.heading != null && current.heading >= 0
    ? current.heading : progress && progress.distance < 90 ? progress.bearing : initialBearing
  return { from, current, road, visibleRoad, routeError, routeKey, estimate, heading: heading ?? 0 }
}

export type RouteView = Pick<RouteInputs, 'a' | 'b' | 'active'> & {
  route: ReturnType<typeof useRoadRoute>
  following: boolean
  onExplore: () => void
  drivers: NearbyDriver[]
  demand?: StopDemand[]
  drawPoint?: (point: Point, stroke: symbol) => void
  drawRevision?: number
  routeEditor?: boolean
  carColor?: string | null
  passengerCenter?: Point
  waitingStop?: Omit<StopDemand, 'count'>
}

export const navigationPitch = 64
export const navigationZoom = 17.8
export const navigationPadding = (height: number) => ({ top: Math.round(height * .28), right: 0, bottom: Math.round(height * .07), left: 0 })
