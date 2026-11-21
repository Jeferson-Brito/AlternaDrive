import { useEffect, useState } from 'react'
import { LocateFixed } from 'lucide-react'
import { distanceMeters, type Point } from './arrival'

export type Station = Point & { id: string; name: string }
export type StationPrice = Point & {
  stationId: string; name: string; fuel: string; unitPrice: number; updatedAt: string;
}
export const fuelUnit = (fuel: string) => fuel === 'GNV' ? 'm³' : 'L'
export const fuelMoney = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const geocoder = (import.meta.env.VITE_GEOCODER_URL || 'https://photon.komoot.io').replace(/\/$/, '')
type StationFeature = {
  geometry: { coordinates: [number, number] };
  properties: { osm_type: string; osm_id: number; osm_value: string; name?: string; street?: string };
}
async function nearbyStations(position: Point, signal: AbortSignal) {
  const query = new URLSearchParams({
    lat: String(position.latitude), lon: String(position.longitude), radius: '0.65', osm_tag: 'amenity:fuel', limit: '8',
  })
  const response = await fetch(geocoder + '/reverse?' + query, { signal })
  if (!response.ok) throw new Error('Busca indisponível.')
  const { features } = await response.json() as { features: StationFeature[] }
  return features.flatMap(({ properties, geometry }) => {
    if (properties.osm_value !== 'fuel' || !/^[NWR]$/.test(properties.osm_type) || !Number.isSafeInteger(properties.osm_id)) return []
    const [longitude, latitude] = geometry.coordinates
    const name = properties.name || ('Posto de combustível' + (properties.street ? ' · ' + properties.street : ''))
    const station = { id: properties.osm_type + properties.osm_id, name: name.slice(0, 240), latitude, longitude }
    const distance = Math.round(distanceMeters(position, station))
    return distance <= 650 ? [{ ...station, distance }] : []
  }).sort((a, b) => a.distance - b.distance)
}

export function FuelStationField() {
  const [attempt, setAttempt] = useState(0)
  const [stations, setStations] = useState<Awaited<ReturnType<typeof nearbyStations>>>([])
  const [stationId, setStationId] = useState('')
  const [status, setStatus] = useState('')
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('GPS indisponível neste navegador.')
      return
    }
    const controller = new AbortController()
    setLocating(true)
    setStatus('Buscando o posto perto da sua localização…')
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      if (controller.signal.aborted) return
      try {
        const results = await nearbyStations(coords, AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]))
        if (controller.signal.aborted) return
        setStations(results)
        const closest = results[0]
        const identified = closest && closest.distance <= 120 && coords.accuracy <= 100
        setStationId(identified ? closest.id : '')
        setStatus(identified ? 'Confira se este é o posto onde você abasteceu.' :
          closest ? 'Escolha o posto onde você abasteceu.' : 'Nenhum posto encontrado por perto.')
      } catch {
        if (!controller.signal.aborted) setStatus('Não foi possível buscar postos agora.')
      } finally {
        if (!controller.signal.aborted) setLocating(false)
      }
    }, error => {
      if (controller.signal.aborted) return
      setStatus(error.code === 1 ? 'Permita o acesso à localização para buscar o posto.' : 'Não foi possível obter sua localização.')
      setLocating(false)
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 })
    return () => controller.abort()
  }, [attempt])

  const selected = stations.find(station => station.id === stationId)
  return <div className="fuel-station-field">
    <label>Posto de combustível
      <select value={stationId} onChange={event => setStationId(event.target.value)} disabled={locating}>
        <option value="">Registrar sem identificar o posto</option>
        {stations.map(station => <option key={station.id} value={station.id}>{station.name} · {station.distance} m</option>)}
      </select>
    </label>
    {selected && <input type="hidden" name="station" value={JSON.stringify(selected)} />}
    {status && <small role="status">{status}</small>}
    {!locating && !stations.length && <button className="text-button" type="button" onClick={() => setAttempt(value => value + 1)}>
      <LocateFixed size={16} /> Buscar posto novamente
    </button>}
  </div>
}
