import { randomUUID } from 'node:crypto'
import { distanceMeters, type Point } from '../src/arrival'
import { routeProgress, type Coordinates } from '../src/route-geometry'

export type Stop = Point & { id: string; name: string }
const waiting = new Map<string, { stop: Stop; expiresAt: number }>()
const tiles = new Map<string, { expiresAt: number; load: Promise<Stop[]> }>()

export function findStops(position: Point) {
  const lat = Math.round(position.latitude * 100) / 100
  const lon = Math.round(position.longitude * 100) / 100
  const tile = [lat, lon].join(':')
  const cached = tiles.get(tile)
  if (cached && cached.expiresAt > Date.now()) return cached.load
  if (tiles.size >= 200) tiles.delete(tiles.keys().next().value!)
  const bounds = [lat - .012, lon - .012, lat + .012, lon + .012].join(',')
  const query = `[out:json][timeout:7];node["highway"="bus_stop"](${bounds});out;`
  const load = fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(10_000),
  }).then(async response => {
    if (!response.ok) throw new Error('Paradas indisponíveis.')
    const data = await response.json() as { elements: { id: number; lat: number; lon: number; tags?: { name?: string } }[] }
    return data.elements.map(node => ({
      id: String(node.id), latitude: node.lat, longitude: node.lon, name: node.tags?.name ?? 'Parada de ônibus',
    }))
  }).catch(() => {
    const entry = tiles.get(tile)
    if (entry?.load === load) entry.expiresAt = Date.now() + 20_000
    return []
  })
  tiles.set(tile, { load, expiresAt: Date.now() + 3_600_000 })
  return load
}

export function closestServedStop(position: Point, stops: Stop[], routes: Coordinates[][]) {
  return stops.map(stop => ({ stop, distance: distanceMeters(position, stop) }))
    .filter(({ stop, distance }) => distance <= 150 && routes.some(route =>
      route.length > 1 && routeProgress(stop, route).distance <= 60))
    .sort((a, b) => a.distance - b.distance)[0]?.stop ?? null
}

export function updateWaiting(session: string | undefined, stop: Stop | null, now = Date.now()) {
  expireWaiting(now)
  const id = session ?? randomUUID()
  if (stop) {
    if (waiting.size < 5000 || waiting.has(id)) waiting.set(id, { stop, expiresAt: now + 15_000 })
  } else waiting.delete(id)
  return id
}

function expireWaiting(now: number) {
  for (const [id, entry] of waiting) if (entry.expiresAt <= now) waiting.delete(id)
}

export function stopDemand(center: Point, now = Date.now()) {
  expireWaiting(now)
  const counts = new Map<string, Stop & { count: number }>()
  for (const { stop } of waiting.values()) {
    if (distanceMeters(center, stop) > 15_000) continue
    const existing = counts.get(stop.id)
    counts.set(stop.id, { ...stop, count: (existing?.count ?? 0) + 1 })
  }
  return [...counts.values()].slice(0, 200)
}
