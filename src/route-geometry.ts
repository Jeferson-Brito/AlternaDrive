import { distanceMeters, type Point } from './arrival'

export type Coordinates = [number, number]
export type RoadLine = { type: 'LineString'; coordinates: Coordinates[] }

export function travelBearing(from: Point, to: Point) {
  const radians = Math.PI / 180
  const a = from.latitude * radians, b = to.latitude * radians
  const longitude = (to.longitude - from.longitude) * radians
  const angle = Math.atan2(
    Math.sin(longitude) * Math.cos(b),
    Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(longitude),
  )
  return (angle / radians + 360) % 360
}
export function routeProgress(position: Point, coordinates: Coordinates[]) {
  const longitudeScale = 111_195 * Math.cos(position.latitude * Math.PI / 180)
  const local = ([longitude, latitude]: Coordinates) => [
    (longitude - position.longitude) * longitudeScale, (latitude - position.latitude) * 111_195,
  ]
  let distance = Infinity
  let lengthSoFar = 0
  let covered = 0
  let bearing: number | undefined
  let [ax, ay] = local(coordinates[0])
  for (const coordinate of coordinates.slice(1)) {
    const [bx, by] = local(coordinate)
    const dx = bx - ax, dy = by - ay
    const squared = dx * dx + dy * dy
    const fraction = squared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / squared)) : 0
    const length = Math.sqrt(squared)
    const gap = Math.hypot(ax + fraction * dx, ay + fraction * dy)
    if (length > 0 && gap < distance) {
      distance = gap
      covered = lengthSoFar + fraction * length
      bearing = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360
    }
    lengthSoFar += length
    ax = bx
    ay = by
  }
  return { distance, remaining: lengthSoFar ? 1 - covered / lengthSoFar : 1, bearing }
}

export function routeCheckpoints(trace: Point[], from: Point, to: Point) {
  if (trace.length < 3 || distanceMeters(trace[0], from) > 160 || distanceMeters(trace.at(-1)!, to) > 100) return []
  const distances = [0]
  for (let index = 1; index < trace.length; index++) {
    const step = distanceMeters(trace[index - 1], trace[index])
    if (step > 1000) return []
    distances.push(distances[index - 1] + step)
  }
  const total = distances.at(-1)!
  if (total < 300 || total > distanceMeters(from, to) * 5) return []
  return Array.from({ length: 7 }, (_, index) => {
    const target = total * (index + 1) / 8
    const end = distances.findIndex(distance => distance >= target)
    const fraction = (target - distances[end - 1]) / (distances[end] - distances[end - 1])
    const previous = trace[end - 1], next = trace[end]
    const interpolate = (a: number, b: number) => Number((a + (b - a) * fraction).toFixed(4))
    return { latitude: interpolate(previous.latitude, next.latitude), longitude: interpolate(previous.longitude, next.longitude) }
  })
}

type RouteSample = { userId: string; checkpoints: Point[] }
const sameRoute = (a: RouteSample, b: RouteSample) =>
  a.checkpoints.every((point, index) => distanceMeters(point, b.checkpoints[index]) <= 220)

// Samples are chronological. A driver's most recent complete leg replaces their previous vote.
export function habitualRoute(samples: RouteSample[]) {
  const latest = [...new Map(samples.map(sample => [sample.userId, sample])).values()]
  const current = latest.find(candidate =>
    latest.filter(driver => sameRoute(candidate, driver)).length > latest.length / 2,
  )
  if (current) return current.checkpoints

  // When the current votes are split, find the last route that had a majority.
  const votes = new Map<string, number>()
  const matches: boolean[][] = []
  const support: number[] = []
  let incumbent: RouteSample | undefined
  for (const [index, sample] of samples.entries()) {
    const previous = votes.get(sample.userId)
    const row = matches[index] = samples.slice(0, index).map(other => sameRoute(sample, other))
    row.push(true)
    votes.set(sample.userId, index)

    for (let candidate = 0; candidate < index; candidate++) {
      const lostVote = previous !== undefined && matches[Math.max(candidate, previous)][Math.min(candidate, previous)]
      support[candidate] += Number(row[candidate]) - Number(lostVote)
    }
    support[index] = [...votes.values()].filter(vote => row[vote]).length
    const winner = [...votes.values()].find(candidate => support[candidate] > votes.size / 2)
    if (winner !== undefined) incumbent = samples[winner]
  }
  return incumbent?.checkpoints ?? null
}
