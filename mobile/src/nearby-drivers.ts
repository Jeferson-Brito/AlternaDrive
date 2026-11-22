import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { refreshDriverPresence } from './driver-sharing'
import type { RoadLine } from '../../src/route-geometry'
import type { Point } from './model'

export type NearbyDriver = Point & { id: string; type: string; firstName?: string; carColor?: string | null; arrivalSeconds?: number }
const city = { latitude: -7.132, longitude: -34.871 }

export function useNearbyDrivers(token: string | null, center: Point | null, position: Point | null, sharingJourney?: string, road?: { geometry: RoadLine; duration: number }) {
  const [drivers, setDrivers] = useState<NearbyDriver[]>([])
  const latest = useRef({ center, position, road })
  const pending = useRef<Promise<void>>(Promise.resolve())
  latest.current = { center, position, road }

  useEffect(() => {
    if (!token) { setDrivers([]); return }
    const session = token
    let disposed = false
    let running = false
    function refresh() {
      if (disposed || running || AppState.currentState !== 'active') return
      running = true
      const { position, center, road } = latest.current
      const journeyId = position ? sharingJourney : undefined
      const location = journeyId && position ? position : center ?? city
      const coarse = { latitude: Math.round(location.latitude * 1000) / 1000, longitude: Math.round(location.longitude * 1000) / 1000 }
      pending.current = pending.current.then(async () => {
        if (disposed) return
        try {
          const coordinates = road?.geometry.coordinates
          const stride = coordinates && Math.ceil((coordinates.length - 1) / 399)
          const route = journeyId && position && road && coordinates && stride ? {
            departure: { latitude: position.latitude, longitude: position.longitude },
            duration: road.duration,
            coordinates: coordinates.filter((_, index) => index % stride === 0 || index === coordinates.length - 1),
          } : undefined
          const result = await refreshDriverPresence(session, coarse, journeyId, route)
          if (!disposed) setDrivers(result)
        } catch {
          if (!disposed) setDrivers([])
        }
      }).finally(() => { running = false })
    }
    refresh()
    const timer = setInterval(refresh, 3000)
    const listener = AppState.addEventListener('change', state => { if (state === 'active') refresh() })
    return () => { disposed = true; clearInterval(timer); listener.remove() }
  }, [token, sharingJourney])

  return drivers
}
