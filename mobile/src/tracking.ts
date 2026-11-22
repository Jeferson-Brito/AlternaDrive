import { AppState } from 'react-native'
import { hiddenDriverJourney, refreshDriverPresence } from './driver-sharing'
import * as Location from 'expo-location'
import * as SecureStore from 'expo-secure-store'
import * as TaskManager from 'expo-task-manager'
import { accumulateDistance, emptyTrack, type DistanceTrack } from '../../src/gps-distance'
import { isArrival, distanceMeters } from '../../src/arrival'
import { isExpoGo } from './environment'
import { api, readSession } from './api'
import type { Journey, Point } from './model'

const taskName = 'alternadrive-journey-gps'
const journeyKey = 'alternadrive.tracking'
type Tracking = Pick<Journey, 'id' | 'pointA' | 'pointB' | 'arrivals' | 'approachingStart' | 'startedAt'>
let listener: (() => void) | undefined
let queue = Promise.resolve()
let trace: Point[] = []
let traceKey = ''
let retryArrivalAfter = 0

export function onArrival(callback: () => void) {
  listener = callback
  return () => { if (listener === callback) listener = undefined }
}

const distanceKey = (id: string) => 'alternadrive.distance.' + id
type Meter = DistanceTrack & { legStart?: number }

async function readMeter(id: string): Promise<Meter> {
  const stored = await SecureStore.getItemAsync(distanceKey(id))
  return stored ? JSON.parse(stored) as Meter : emptyTrack
}

export async function measuredJourneyKm(id: string) {
  const meter = await readMeter(id)
  return meter.samples >= 2 ? Math.round(meter.meters / 10) / 100 : null
}

export async function prepareTracking(journey: Tracking, initialFix?: Location.LocationObject | null) {
  const raw = await SecureStore.getItemAsync(journeyKey)
  if (raw && (JSON.parse(raw) as Tracking).id === journey.id) return
  const { id, pointA, pointB, arrivals, approachingStart, startedAt } = journey
  const startTime = Date.parse(startedAt)
  if (initialFix?.coords.accuracy != null && Math.abs(startTime - initialFix.timestamp) <= 10_000) {
    const { latitude, longitude, accuracy, speed } = initialFix.coords
    const initial = accumulateDistance(emptyTrack, {
      latitude, longitude, accuracy, speed, timestamp: startTime,
    })
    if (initial.samples) await SecureStore.setItemAsync(distanceKey(id), JSON.stringify(initial))
  }
  await SecureStore.setItemAsync(journeyKey, JSON.stringify({ id, pointA, pointB, arrivals, approachingStart, startedAt }))
}

async function processLocations(locations: Location.LocationObject[]) {
  const raw = await SecureStore.getItemAsync(journeyKey)
  if (!raw) return
  const tracking = JSON.parse(raw) as Tracking
  const startedAt = Date.parse(tracking.startedAt)
  const ordered = [...locations].sort((a, b) => a.timestamp - b.timestamp)
    .filter(location => !(location.timestamp < startedAt))
  const previous = await readMeter(tracking.id)
  let meter = previous
  const cumulativeMeters = ordered.map(({ coords, timestamp }) => {
    if (coords.accuracy == null) return meter.meters
    meter = accumulateDistance(meter, {
      latitude: coords.latitude, longitude: coords.longitude, speed: coords.speed,
      accuracy: coords.accuracy, timestamp,
    })
    return meter.meters
  })
  if (meter !== previous && await SecureStore.getItemAsync(journeyKey) === raw) {
    await SecureStore.setItemAsync(distanceKey(tracking.id), JSON.stringify(meter))
  }
  if (!tracking.pointA || !tracking.pointB) return
  const key = tracking.id + ':' + tracking.arrivals + ':' + !!tracking.approachingStart
  if (key !== traceKey) {
    traceKey = key
    trace = []
    retryArrivalAfter = 0
  }
  for (const [index, { coords }] of ordered.entries()) {
    if (coords.accuracy == null || coords.accuracy > 50) continue
    const position = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }
    if (!isArrival(tracking.pointA, tracking.pointB, tracking.approachingStart ? 1 : tracking.arrivals, position)) {
      if (!tracking.approachingStart && (!trace.length || distanceMeters(trace[trace.length - 1], position) >= 25)) {
        if (trace.length >= 240) trace = trace.filter((_, index) => index % 2 === 0)
        trace.push({ latitude: position.latitude, longitude: position.longitude })
      }
      continue
    }

    if (Date.now() < retryArrivalAfter) return
    const token = await readSession()
    if (!token) return
    const atArrival = cumulativeMeters[index]
    const legMeters = atArrival - (meter.legStart ?? 0)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    let result
    try {
      result = await api<{ arrivals: number; approachingStart?: boolean }>('journeys/' + tracking.id + '/arrival', {
        ...position, arrivals: tracking.arrivals, trace, routeKm: legMeters > 0 && legMeters <= 5_000_000 ? legMeters / 1000 : undefined,
      }, token, controller.signal)
    } catch {
      retryArrivalAfter = Date.now() + 3000
      return
    } finally {
      clearTimeout(timeout)
    }
    if (result.arrivals !== tracking.arrivals || !!result.approachingStart !== !!tracking.approachingStart) {
      if (await SecureStore.getItemAsync(journeyKey) === raw) {
        await SecureStore.setItemAsync(distanceKey(tracking.id), JSON.stringify({ ...meter, legStart: atArrival }))
        await SecureStore.setItemAsync(journeyKey, JSON.stringify({ ...tracking, ...result }))
        listener?.()
      }
    }
    return
  }
}

function enqueue(locations: Location.LocationObject[]) {
  queue = queue.then(() => processLocations(locations)).catch(() => undefined)
  return queue
}

export function recordForegroundLocation(location: Location.LocationObject) {
  void enqueue([location])
}

async function shareBackgroundLocation(locations: Location.LocationObject[]) {
  if (AppState.currentState === 'active') return
  const raw = await SecureStore.getItemAsync(journeyKey)
  if (!raw) return
  const tracking = JSON.parse(raw) as Tracking
  if (await hiddenDriverJourney() === tracking.id) return
  const latest = locations.reduce<Location.LocationObject | undefined>((best, item) =>
    (item.coords.accuracy ?? Infinity) <= 50 && (!best || item.timestamp > best.timestamp) ? item : best, undefined)
  if (!latest || Date.now() - latest.timestamp > 15000) return
  const token = await readSession()
  if (!token || await SecureStore.getItemAsync(journeyKey) !== raw) return
  await refreshDriverPresence(token, {
    latitude: Math.round(latest.coords.latitude * 1000) / 1000,
    longitude: Math.round(latest.coords.longitude * 1000) / 1000,
  }, tracking.id)
}

if (!isExpoGo) TaskManager.defineTask<{ locations: Location.LocationObject[] }>(taskName, async ({ data, error }) => {
  if (!error && data?.locations.length) {
    await Promise.all([enqueue(data.locations), shareBackgroundLocation(data.locations).catch(() => undefined)])
  }
})

let backgroundSetup: Promise<boolean> | undefined

export function resumeBackgroundTracking() {
  if (isExpoGo) return Promise.resolve(false)
  backgroundSetup ??= (async () => {
    if (!(await Location.getBackgroundPermissionsAsync()).granted) return false
    const previous = await TaskManager.getTaskOptionsAsync<Location.LocationTaskOptions>(taskName)
    if (previous?.distanceInterval === 0 && previous.timeInterval === 3000 &&
        await Location.hasStartedLocationUpdatesAsync(taskName)) return true
    await Location.startLocationUpdatesAsync(taskName, {
      accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 0,
      foregroundService: {
        notificationTitle: 'AlternaDrive · jornada ativa',
        notificationBody: 'O GPS acompanha a jornada até você tocar em Finalizar.',
        notificationColor: '#0b5a48',
        killServiceOnDestroy: false,
      },
    })
    return true
  })().finally(() => { backgroundSetup = undefined })
  return backgroundSetup
}

export async function startTracking(journey: Tracking) {
  const foreground = await Location.requestForegroundPermissionsAsync()
  if (!foreground.granted) return 'denied'
  await prepareTracking(journey)
  if (isExpoGo) return 'foreground'
  const background = await Location.requestBackgroundPermissionsAsync()
  return background.granted && await resumeBackgroundTracking() ? 'background' : 'foreground'
}

export async function stopTracking() {
  await backgroundSetup?.catch(() => undefined)
  const raw = await SecureStore.getItemAsync(journeyKey)
  await SecureStore.deleteItemAsync(journeyKey)
  if (raw) {
    const { id } = JSON.parse(raw) as Tracking
    await SecureStore.deleteItemAsync(distanceKey(id))
  }
  if (!isExpoGo && await Location.hasStartedLocationUpdatesAsync(taskName)) await Location.stopLocationUpdatesAsync(taskName)
}
