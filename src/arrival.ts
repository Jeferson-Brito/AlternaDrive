export type Point = { latitude: number; longitude: number }

export function distanceMeters(a: Point, b: Point) {
  const radians = Math.PI / 180
  const lat = (b.latitude - a.latitude) * radians
  const lon = (b.longitude - a.longitude) * radians
  const h = Math.sin(lat / 2) ** 2 +
    Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(lon / 2) ** 2
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, h)))
}

export function arrivalRadius(a: Point, b: Point) {
  return Math.min(80, distanceMeters(a, b) / 3)
}
export function isArrival(a: Point, b: Point, arrivals: number, position: Point & { accuracy: number }) {
  const radius = arrivalRadius(a, b)
  return position.accuracy <= Math.min(50, radius) &&
    distanceMeters(position, arrivals % 2 ? a : b) <= radius
}
