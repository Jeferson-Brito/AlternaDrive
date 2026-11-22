import * as SecureStore from 'expo-secure-store'
import { api } from './api'
import type { NearbyDriver } from './nearby-drivers'
import type { Point } from './model'
import type { Coordinates } from '../../src/route-geometry'

const hiddenKey = 'alternadrive.hidden-driver-journey'
let pending: Promise<unknown> = Promise.resolve()

function inOrder<T>(action: () => Promise<T>) {
  const result = pending.then(action)
  pending = result.catch(() => undefined)
  return result
}

export function hiddenDriverJourney() {
  return SecureStore.getItemAsync(hiddenKey)
}

export function changeDriverSharing(journeyId: string, shared: boolean, token: string) {
  return inOrder(async () => {
    if (shared) await SecureStore.deleteItemAsync(hiddenKey)
    else {
      await SecureStore.setItemAsync(hiddenKey, journeyId)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 7000)
      try { await api('drivers/hide', {}, token, controller.signal) }
      finally { clearTimeout(timeout) }
    }
  })
}

export function refreshDriverPresence(token: string, center: Point, journeyId?: string,
    route?: { departure: Point; duration: number; coordinates: Coordinates[] }) {
  return inOrder(async () => {
    const publishing = journeyId && (await hiddenDriverJourney()) !== journeyId
    const signal = new AbortController()
    const timeout = setTimeout(() => signal.abort(), 7000)
    try {
      return await api<NearbyDriver[]>('drivers/nearby', {
        center, journeyId: publishing ? journeyId : undefined, route: publishing ? route : undefined,
      }, token, signal.signal)
    } finally { clearTimeout(timeout) }
  })
}
