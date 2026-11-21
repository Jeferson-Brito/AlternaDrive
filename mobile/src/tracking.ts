import * as Location from 'expo-location'
import * as SecureStore from 'expo-secure-store'
import * as TaskManager from 'expo-task-manager'
import { isArrival, distanceMeters } from '../../src/arrival'
import { api, readSession } from './api'
import type { Journey, Point } from './model'

const taskName = 'alternadrive-journey-gps'
const journeyKey = 'alternadrive.tracking'
type Tracking = Pick<Journey, 'id' | 'pointA' | 'pointB' | 'arrivals'>
let listener: (() => void) | undefined
let queue = Promise.resolve()
let trace: Point[] = []
let traceKey = ''

export function onArrival(callback: () => void) {
  listener = callback
  return () => { if (listener === callback) listener = undefined }
}

async function processLocations(locations: Location.LocationObject[]) {
  const raw = await SecureStore.getItemAsync(journeyKey)
  if (!raw) return
  const tracking = JSON.parse(raw) as Tracking
  if (!tracking.pointA || !tracking.pointB) return
  const key = tracking.id + ':' + tracking.arrivals
  if (key !== traceKey) {
    traceKey = key
    trace = []
  }
  for (const { coords } of locations) {
    if (coords.accuracy === null || coords.accuracy > 50) continue
    const position = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }
    if (!isArrival(tracking.pointA, tracking.pointB, tracking.arrivals, position)) {
      if (!trace.length || distanceMeters(trace[trace.length - 1], position) >= 25) {
        if (trace.length >= 240) trace = trace.filter((_, index) => index % 2 === 0)
        trace.push({ latitude: position.latitude, longitude: position.longitude })
      }
      continue
    }

    const token = await readSession()
    if (!token) return
    const result = await api<{ arrivals: number }>('journeys/' + tracking.id + '/arrival', {
      ...position, arrivals: tracking.arrivals, trace,
    }, token)
    if (result.arrivals !== tracking.arrivals) {
      const latest = await SecureStore.getItemAsync(journeyKey)
      if (latest === raw) {
        await SecureStore.setItemAsync(journeyKey, JSON.stringify({ ...tracking, arrivals: result.arrivals }))
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

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(taskName, async ({ data, error }) => {
  if (!error && data?.locations.length) return enqueue(data.locations)
})

export async function startTracking(journey: Tracking) {
  const foreground = await Location.requestForegroundPermissionsAsync()
  if (!foreground.granted) return false
  const { id, pointA, pointB, arrivals } = journey
  await SecureStore.setItemAsync(journeyKey, JSON.stringify({ id, pointA, pointB, arrivals }))
  const background = await Location.requestBackgroundPermissionsAsync()
  if (!background.granted) return false
  if (!(await Location.hasStartedLocationUpdatesAsync(taskName))) {
    await Location.startLocationUpdatesAsync(taskName, {
      accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 10,
      foregroundService: {
        notificationTitle: 'AlternaDrive · jornada ativa',
        notificationBody: 'O GPS acompanha a jornada até você tocar em Finalizar.',
        notificationColor: '#0b5a48',
      },
    })
  }
  return true
}

export async function stopTracking() {
  await SecureStore.deleteItemAsync(journeyKey)
  if (await Location.hasStartedLocationUpdatesAsync(taskName)) await Location.stopLocationUpdatesAsync(taskName)
}
