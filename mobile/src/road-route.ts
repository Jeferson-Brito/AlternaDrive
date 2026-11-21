import { useEffect, useMemo, useRef, useState } from 'react'
import type { LocationObject } from 'expo-location'
import { distanceMeters } from '../../src/arrival'
import { navigationEstimate } from '../../src/journey-time'
import { routeProgress, travelBearing, type RoadLine } from '../../src/route-geometry'
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
  const [road, setRoad] = useState<Road>()
  const [routeError, setRouteError] = useState(false)
  const [recalculate, setRecalculate] = useState(0)
  const fix = useRef(position)
  fix.current = position
  const returning = (active?.arrivals ?? 0) % 2 === 1
  const from = returning ? b : a
  const to = returning ? a : b
  const routeKey = [active?.id, active?.arrivals, from?.latitude, from?.longitude, to?.latitude, to?.longitude].join(':')
  const current = position?.coords
  const progress = useMemo(() => road && current ? routeProgress(current, road.geometry.coordinates) : null, [current, road])

  useEffect(() => {
    if (!from || !to) { setRoad(undefined); return }
    const abort = new AbortController()
    setRoad(undefined)
    setRouteError(false)
    const nearby = active && fix.current?.coords && (fix.current.coords.accuracy ?? Infinity) <= 50 ? fix.current.coords : null
    const start = nearby ?? from
    async function load() {
      const far = distanceMeters(start, from!) > 150
      const habitual = !far ? await api<{ checkpoints: Point[] | null }>('routes/habitual', { from, to }, token).catch(() => null) : null
      if (abort.signal.aborted) return
      const points = [start, ...(habitual?.checkpoints?.slice(1, -1) ?? []), to!].map(coords).join(';')
      const response = await fetch('https://routing.openstreetmap.de/routed-car/route/v1/driving/' + points + '?overview=full&geometries=geojson', { signal: abort.signal })
      if (!response.ok) throw new Error('Rota indisponível.')
      const data = await response.json() as { routes?: Road[] }
      const route = data.routes?.[0]
      if (!route || route.geometry.coordinates.length < 2) throw new Error('Rota indisponível.')
      if (!abort.signal.aborted) setRoad(route)
    }
    void load().catch(() => { if (!abort.signal.aborted) setRouteError(true) })
    return () => abort.abort()
  }, [routeKey, recalculate, token])

  useEffect(() => {
    if (!active || !current || (current.accuracy ?? Infinity) > 50 || !progress || progress.distance < 90) return
    const timer = setTimeout(() => setRecalculate(value => value + 1), 3000)
    return () => clearTimeout(timer)
  }, [active?.id, !!current && (current.accuracy ?? Infinity) <= 50, !!progress && progress.distance >= 90])

  const estimate = road && navigationEstimate(road.distance, road.duration,
    active && (current?.accuracy ?? Infinity) <= 50 ? progress?.remaining ?? 1 : 1, current?.speed ?? undefined)
  const firstSegment = road?.geometry.coordinates
  const initialBearing = firstSegment ? travelBearing(
    { latitude: firstSegment[0][1], longitude: firstSegment[0][0] },
    { latitude: firstSegment[1][1], longitude: firstSegment[1][0] },
  ) : from && to ? travelBearing(from, to) : undefined
  const heading = (current?.speed ?? 0) >= 2 && current?.heading != null && current.heading >= 0
    ? current.heading : progress && progress.distance < 90 ? progress.bearing : initialBearing
  return { from, current, road, routeError, routeKey, estimate, heading: heading ?? 0 }
}

export type RouteView = Pick<RouteInputs, 'a' | 'b' | 'active'> & {
  route: ReturnType<typeof useRoadRoute>
  following: boolean
  onExplore: () => void
  drivers: NearbyDriver[]
  demand?: StopDemand[]
  passengerCenter?: Point
  waitingStop?: Omit<StopDemand, 'count'>
}

export const navigationPitch = 64
export const navigationZoom = 17.8
export const navigationPadding = (height: number) => ({ top: Math.round(height * .28), right: 0, bottom: Math.round(height * .07), left: 0 })
