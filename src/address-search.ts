import type { Point } from './arrival'

export type AddressMatch = Point & { label: string }
type AddressProperties = Partial<Record<'name' | 'street' | 'housenumber' | 'district' | 'city' | 'state', string>>

export async function findAddresses(endpoint: string, params: Record<string, string>, signal: AbortSignal, base = 'https://photon.komoot.io/') {
  const query = Object.entries(params).map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('&')
  const response = await fetch(base.replace(/\/$/, '') + '/' + endpoint + '?' + query, { signal })
  if (!response.ok) throw new Error('Serviço de endereços indisponível.')
  const { features } = await response.json() as {
    features: { properties: AddressProperties; geometry: { coordinates: [number, number] } }[]
  }
  const matches = new Map<string, AddressMatch>()
  for (const { properties: place, geometry } of features) {
    const [longitude, latitude] = geometry.coordinates
    const street = [place.street, place.housenumber].filter(Boolean).join(', ')
    const label = [...new Set([place.name === place.street ? undefined : place.name, street, place.district, place.city, place.state].filter(Boolean))]
      .join(' · ').slice(0, 240)
    if (label && !matches.has(label)) matches.set(label, { label, latitude, longitude })
  }
  return [...matches.values()]
}
