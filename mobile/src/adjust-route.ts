import { distanceMeters, type Point } from '../../src/arrival'
import { routeProgress, type Coordinates } from '../../src/route-geometry'

function simplify(points: Coordinates[], limit: number, tolerance: number) {
  function keep(from: number, to: number, meters: number): Coordinates[] {
    const segment = [points[from], points[to]]
    const sameEndpoint = segment[0][0] === segment[1][0] && segment[0][1] === segment[1][1]
    let furthest = meters
    let split = -1
    for (let index = from + 1; index < to; index++) {
      const [longitude, latitude] = points[index]
      const distance = sameEndpoint
        ? distanceMeters({ longitude, latitude }, { longitude: segment[0][0], latitude: segment[0][1] })
        : routeProgress({ longitude, latitude }, segment).distance
      if (distance > furthest) {
        furthest = distance
        split = index
      }
    }
    return split < 0 ? segment : [...keep(from, split, meters).slice(0, -1), ...keep(split, to, meters)]
  }

  let result = keep(0, points.length - 1, tolerance)
  while (result.length > limit) {
    tolerance *= 1.5
    result = keep(0, points.length - 1, tolerance)
  }
  return result
}

export async function adjustToStreets(points: Point[]): Promise<Point[]> {
  const coordinates = points.map(({ longitude, latitude }) => [longitude, latitude] as Coordinates)
  const anchors = simplify(coordinates, 75, 9)
  const query = anchors.map(pair => pair.map(value => value.toFixed(6)).join(',')).join(';')
  const radiuses = anchors.map(() => '55').join(';')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch('https://routing.openstreetmap.de/routed-car/route/v1/driving/' + query +
      '?overview=full&geometries=geojson&continue_straight=true&radiuses=' + radiuses, { signal: controller.signal })
    const data = await response.json() as { routes?: { geometry: { coordinates: Coordinates[] } }[] }
    const route = data.routes?.[0]?.geometry.coordinates
    if (!response.ok || !route || route.length < 2 ||
      points.some(point => routeProgress(point, route).distance > 70)) {
      throw new Error('Não foi possível ajustar este desenho às ruas. Confira os trechos e tente novamente.')
    }
    const snapped = simplify(route, 300, 2).map(([longitude, latitude]) => ({ longitude, latitude }))
    if (distanceMeters(snapped[0], snapped[snapped.length - 1]) < 60) {
      throw new Error('Após o ajuste, a origem e o destino ficam a menos de 60 metros.')
    }
    return snapped
  } finally {
    clearTimeout(timeout)
  }
}
