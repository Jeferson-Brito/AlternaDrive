import { randomUUID } from 'node:crypto'
import { distanceMeters, type Point } from '../src/arrival'

type Driver = Point & { id: string; type: string; expiresAt: number }

const online = new Map<string, Driver>()
const ttl = 45_000
const radius = 15_000

export function removeDriver(userId: string) {
  online.delete(userId)
}

export function nearbyDrivers(userId: string, center: Point, type?: string, now = Date.now()) {
  for (const [key, driver] of online) if (driver.expiresAt <= now) online.delete(key)
  if (type) {
    const id = online.get(userId)?.id ?? randomUUID()
    online.set(userId, {
      id, type, latitude: Math.round(center.latitude * 1000) / 1000,
      longitude: Math.round(center.longitude * 1000) / 1000, expiresAt: now + ttl,
    })
  }
  return [...online.entries()].flatMap(([key, driver]) => {
    if (key === userId || distanceMeters(center, driver) > radius) return []
    const { expiresAt: _, ...marker } = driver
    return [marker]
  }).slice(0, 200)
}
