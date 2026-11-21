import { useEffect, useId, useState } from 'react'
import { LocateFixed } from 'lucide-react'
import type { Point } from './arrival'
import { findAddresses, type AddressMatch } from './address-search'

const photon = import.meta.env.VITE_GEOCODER_URL || 'https://photon.komoot.io/'
export function AddressField({ name, title, initial, initialPoint }: {
  name: string; title: string; initial?: string | null; initialPoint?: Point | null;
}) {
  const id = useId()
  const [value, setValue] = useState(initial ?? '')
  const [point, setPoint] = useState(initialPoint ?? null)
  const [query, setQuery] = useState(() => initialPoint ? '' : initial?.split('·')[0].trim() ?? '')
  const [suggestions, setSuggestions] = useState<AddressMatch[]>([])
  const [status, setStatus] = useState('')
  useEffect(() => {
    if (query.length < 3) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setStatus('Buscando endereços…')
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(7000)])
      try {
        const matches = await findAddresses('api/', {
          q: query, limit: '6', lat: '-7.132', lon: '-34.871',
        }, signal, photon)
        if (!controller.signal.aborted) {
          setSuggestions(matches)
          setStatus(matches.length ? '' : 'Sem sugestões. Tente incluir o número e a cidade.')
        }
      } catch {
        if (!controller.signal.aborted) setStatus('Sugestões indisponíveis. Tente novamente em instantes.')
      }
    }, 400)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query])

  return <div className="address-field">
    <label htmlFor={id}>{title}</label>
    <input id={id} name={name} value={value} maxLength={240} required autoComplete="off"
      onChange={event => {
        const next = event.target.value
        setValue(next)
        setPoint(null)
        setStatus('')
        setSuggestions([])
        setQuery(next.trim())
      }} />
    <small role="status" className={point ? 'address-confirmed' : undefined}>
      {point ? 'Ponto confirmado no GPS' : status || (suggestions.length ? 'Toque na sugestão que corresponde ao ponto.' : 'Digite o endereço e escolha uma sugestão.')}
    </small>
    {suggestions.length > 0 && <ul className="address-suggestions" aria-label={'Sugestões para ' + title}>
      {suggestions.map(item => <li key={item.label}><button type="button" onClick={() => {
        setValue(item.label)
        setPoint({ latitude: item.latitude, longitude: item.longitude })
        setQuery('')
        setSuggestions([])
        setStatus('')
      }}>{item.label}</button></li>)}
    </ul>}
    {point && <input type="hidden" name={name + 'Point'} value={JSON.stringify(point)} />}

  </div>
}

type Location = { latitude: number; longitude: number; address: string }

export function formatJourneyAddress(address: string) {
  const seen = new Set<string>()
  return address.split(' · ').filter(part => {
    const key = part.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).join(' · ')
}
export function JourneyOrigin({ saved }: { saved: string }) {
  const [location, setLocation] = useState<Location | null>(null)
  const [status, setStatus] = useState('')
  const [locating, setLocating] = useState(false)

  function locate() {
    if (!navigator.geolocation) {
      setStatus('Localização indisponível neste navegador.')
      return
    }
    setLocating(true)
    setStatus('Obtendo sua localização…')
    navigator.geolocation.getCurrentPosition(async ({ coords: { latitude, longitude } }) => {
      const fallback = 'Localização atual (' + latitude.toFixed(5) + ', ' + longitude.toFixed(5) + ')'
      let address = fallback
      try {
        const matches = await findAddresses('reverse', {
          lat: String(latitude), lon: String(longitude), limit: '1',
        }, AbortSignal.timeout(5000), photon)
        address = matches[0]?.label ?? fallback
      } catch {
        // The GPS fix is usable even if no street address is available.
      }
      setLocation({ latitude, longitude, address })
      setStatus('')
      setLocating(false)
    }, error => {
      setStatus(error.code === 1 ? 'Autorize a localização no navegador para usar o GPS.' : 'Não foi possível obter a localização. Tente novamente.')
      setLocating(false)
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
  }

  return <div className="journey-origin">
    <span className="journey-stop-label">Origem</span>
    <strong>{formatJourneyAddress(location?.address ?? saved)}</strong>
    {location && <input type="hidden" name="currentLocation" value={JSON.stringify(location)} />}
    <button className="journey-location-button" type="button" disabled={locating} onClick={location ? () => { setLocation(null); setStatus('') } : locate}>
      <LocateFixed size={16} /> {location ? 'Voltar à origem salva' : 'Usar localização atual'}
    </button>
    {status && <small role="status">{status}</small>}
  </div>
}


