import { randomUUID } from 'node:crypto'
import { distanceMeters, type Point } from '../src/arrival'
import { travelBearing } from '../src/route-geometry'

export type MovingDriver = Point & { journeyId: string; at: number }
type Candidate = { id: string; journeyId: string; start: Point; startedAt: number; samples: number; distance: number }
type Ride = {
  origin: Point; stop: Point; since: number; lastSeen: number; previous?: Point; candidates: Map<string, Candidate>; matched?: boolean
}
const sessions = new Map<string, Ride>()

// Match private, short-lived positions. The public map still only receives coarse vehicle markers.
export function detectBoarding(session: string, position: Point, stop: Point | null, drivers: MovingDriver[], now = Date.now()) {
  for (const [key, ride] of sessions) if (now - ride.lastSeen > 90_000) sessions.delete(key)
  let ride = sessions.get(session)
  if (!ride) {
    if (stop && sessions.size < 5000) sessions.set(session, { origin: position, stop, since: now, lastSeen: now, previous: position, candidates: new Map() })
    return
  }
  if (now - ride.lastSeen < 1600) return
  const lostSignal = now - ride.lastSeen > 20_000
  ride.lastSeen = now
  const previous = ride.previous ?? position
  ride.previous = position
  const movement = distanceMeters(previous, position)
  if (ride.matched) {
    // A new ride requires another period of waiting at a stop.
    if (!stop || distanceMeters(ride.stop, stop) < 150 || movement > 8) return
    sessions.set(session, { origin: position, stop, since: now, lastSeen: now, previous: position, candidates: new Map() })
    return
  }
  if (lostSignal || now - ride.since < 10_000) {
    if (lostSignal || movement > 20) {
      sessions.delete(session)
      if (stop) sessions.set(session, { origin: position, stop, since: now, lastSeen: now, previous: position, candidates: new Map() })
    }
    return
  }
  const usable = drivers.filter(driver => now - driver.at <= 8500 && distanceMeters(driver, position) <= 32)
  const next = new Map<string, Candidate>()
  for (const driver of usable) {
    const candidate = ride.candidates.get(driver.journeyId)
    if (!candidate) {
      if (distanceMeters(position, ride.stop) <= 150) next.set(driver.journeyId, {
        id: randomUUID(), journeyId: driver.journeyId, start: driver, startedAt: now, samples: 1, distance: 0,
      })
      continue
    }
    const gap = Math.abs(((travelBearing(ride.origin, position) - travelBearing(candidate.start, driver) + 540) % 360) - 180)
    const distance = distanceMeters(driver, candidate.start)
    if (distance > 35 && gap > 35) continue
    next.set(driver.journeyId, { ...candidate, samples: candidate.samples + 1, distance })
  }
  ride.candidates = next
  if (!stop && !next.size) sessions.delete(session)
  if (next.size !== 1) return
  const [candidate] = next.values()
  const passengerDistance = distanceMeters(ride.origin, position)
  if (candidate.samples < 4 || candidate.distance <= 100 || passengerDistance <= 100 ||
      Math.abs(candidate.distance - passengerDistance) > 45 || candidate.distance / ((now - candidate.startedAt) / 1000) < 3) return
  ride.matched = true
  return { id: candidate.id, journeyId: candidate.journeyId }
}

export function passengerOnboard(session: string) {
  return sessions.get(session)?.matched === true
}

export function clearBoardingDetection(session: string) {
  sessions.delete(session)
}
