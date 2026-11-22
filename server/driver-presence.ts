import type { MovingDriver } from './boarding-detection'
import { randomUUID } from 'node:crypto'
import { routeProgress, type Coordinates } from '../src/route-geometry'
import { distanceMeters, type Point } from '../src/arrival'

type DriverRoute = { coordinates: Coordinates[]; duration: number; departure: Point }
type DriverProfile = { name: string; carColor: string | null }
type Driver = Point & { id: string; type: string; expiresAt: number; firstName?: string; carColor?: string | null; route?: DriverRoute }

const privatePositions = new Map<string, MovingDriver>()
export function matchingDrivers(now = Date.now()) {
  for (const [id, fix] of privatePositions) if (now - fix.at > 8500) privatePositions.delete(id)
  return [...privatePositions.values()]
}

export function rememberDriverFix(userId: string, journeyId: string, fix: Point, now = Date.now()) {
  matchingDrivers(now)
  privatePositions.set(userId, { ...fix, journeyId, at: now })
}

const online = new Map<string, Driver>()
const ttl = 45_000
const radius = 15_000

export function removeDriver(userId: string) {
  online.delete(userId)
  privatePositions.delete(userId)
}

export function nearbyDrivers(userId: string | null, center: Point, type?: string, now = Date.now(), route?: DriverRoute, stop?: Point, profile?: DriverProfile) {
  for (const [key, driver] of online) if (driver.expiresAt <= now) online.delete(key)
  if (type && userId) {
    const id = online.get(userId)?.id ?? randomUUID()
    online.set(userId, {
      id, type, firstName: profile?.name.trim().split(/\s+/)[0], carColor: profile?.carColor,
      latitude: Math.round(center.latitude * 1000) / 1000,
      longitude: Math.round(center.longitude * 1000) / 1000, route, expiresAt: now + ttl,
    })
  }
  return [...online.entries()].flatMap(([key, driver]) => {
    if (key === userId || distanceMeters(center, driver) > radius) return []
    const { expiresAt: _, route, ...marker } = driver
    if (!stop || !route) return [marker]
    const current = routeProgress(route.departure, route.coordinates)
    const target = routeProgress(stop, route.coordinates)
    const ahead = current.remaining - target.remaining
    if (current.distance > 90 || target.distance > 55 || ahead <= 0) return [marker]
    return [{ ...marker, arrivalSeconds: Math.ceil(route.duration * ahead) }]
  }).slice(0, 200)
}
