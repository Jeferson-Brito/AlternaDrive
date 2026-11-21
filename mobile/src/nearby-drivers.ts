import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { api } from './api'
import type { Point } from './model'

export type NearbyDriver = Point & { id: string; type: string }
const city = { latitude: -7.132, longitude: -34.871 }

export function useNearbyDrivers(token: string | null, center: Point | null, position: Point | null, sharingJourney?: string) {
  const [drivers, setDrivers] = useState<NearbyDriver[]>([])
  const latest = useRef({ center, position })
  const pending = useRef<Promise<void>>(Promise.resolve())
  latest.current = { center, position }

  useEffect(() => {
    if (!token) { setDrivers([]); return }
    let disposed = false
    let running = false
    function refresh() {
      if (disposed || running || AppState.currentState !== 'active') return
      running = true
      const { position, center } = latest.current
      const journeyId = position ? sharingJourney : undefined
      const location = journeyId && position ? position : center ?? city
      const coarse = { latitude: Math.round(location.latitude * 1000) / 1000, longitude: Math.round(location.longitude * 1000) / 1000 }
      pending.current = pending.current.then(async () => {
        if (disposed) return
        try {
          const result = await api<NearbyDriver[]>('drivers/nearby', { center: coarse, journeyId }, token)
          if (!disposed) setDrivers(result)
        } catch {
          if (!disposed) setDrivers([])
        }
      }).finally(() => { running = false })
    }
    function hide() {
      if (sharingJourney) pending.current = pending.current.then(() => api('drivers/hide', {}, token)).then(() => undefined, () => undefined)
    }
    refresh()
    const timer = setInterval(refresh, 10_000)
    const listener = AppState.addEventListener('change', state => { if (state === 'active') refresh(); else hide() })
    return () => { disposed = true; clearInterval(timer); listener.remove(); hide() }
  }, [token, sharingJourney])

  return drivers
}
