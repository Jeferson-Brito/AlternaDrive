import * as Location from 'expo-location'
import * as SecureStore from 'expo-secure-store'
import * as TaskManager from 'expo-task-manager'
import { AppState } from 'react-native'
import { api } from './api'
import { isExpoGo } from './environment'
import type { Point } from './model'
import type { NearbyDriver } from './nearby-drivers'

type Stop = Point & { id: string; name: string }
export type PassengerMap = { stop: Stop | null; session: string; drivers: NearbyDriver[] }
const task = 'alternadrive-passenger-gps'
const enabledKey = 'alternadrive.passenger-enabled'
const sessionKey = 'alternadrive.passenger-session'
let pending: Promise<PassengerMap | undefined> | undefined

export function passengerBackgroundEnabled() { return SecureStore.getItemAsync(enabledKey) }

export async function sharePassengerFix(fix: Location.LocationObject, background = false) {
  if (background && (AppState.currentState === 'active' || await passengerBackgroundEnabled() !== 'true')) return
  const { latitude, longitude, accuracy } = fix.coords
  if (accuracy == null || accuracy > 50 || Date.now() - fix.timestamp > 30_000) return
  pending ??= (async () => {
    const session = await SecureStore.getItemAsync(sessionKey)
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), 12_000)
    try {
      const result = await api<PassengerMap>('passenger/map', { session: session ?? undefined,
        position: { latitude, longitude }, accuracy, capturedAt: fix.timestamp }, null, abort.signal)
      if (session !== result.session) await SecureStore.setItemAsync(sessionKey, result.session)
      return result
    } finally { clearTimeout(timer) }
  })().finally(() => { pending = undefined })
  return pending
}

if (!isExpoGo) TaskManager.defineTask<{ locations: Location.LocationObject[] }>(task, async ({ data, error }) => {
  const location = data?.locations.at(-1)
  if (!error && location) await sharePassengerFix(location, true).catch(() => undefined)
})

export async function enablePassengerBackground() {
  if (isExpoGo) return false
  if (!(await Location.requestBackgroundPermissionsAsync()).granted) return false
  if (!await Location.hasStartedLocationUpdatesAsync(task)) {
    await Location.startLocationUpdatesAsync(task, {
      accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 0,
      foregroundService: {
        notificationTitle: 'AlternaDrive · modo passageiro',
        notificationBody: 'Detectando paradas e possíveis embarques.',
        notificationColor: '#0b5a48', killServiceOnDestroy: false,
      },
    })
  }
  await SecureStore.setItemAsync(enabledKey, 'true')
  return true
}

export async function disablePassengerBackground() {
  await SecureStore.setItemAsync(enabledKey, 'false')
  if (!isExpoGo && await Location.hasStartedLocationUpdatesAsync(task)) await Location.stopLocationUpdatesAsync(task)
  await clearPassengerPresence()
}

export async function clearPassengerPresence() {
  await pending?.catch(() => undefined)
  const session = await SecureStore.getItemAsync(sessionKey)
  if (session) {
    await SecureStore.deleteItemAsync(sessionKey)
    await api('passenger/hide', { session }).catch(() => undefined)
  }
}
