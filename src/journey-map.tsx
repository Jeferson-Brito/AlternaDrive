import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, ArrowUp, CornerUpLeft, Flag, LocateFixed } from 'lucide-react'
import * as maplibre from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import './style.css'
import { monochromeStreets } from './map-style'
import type { Point } from './arrival'
import { fuelMoney, fuelUnit, type StationPrice } from './fuel-stations'
import { routeProgress, type Coordinates, type RoadLine } from './route-geometry'
import { navigationEstimate } from './journey-time'
import { nextManeuver, type RoutingStep } from './navigation-steps'

maplibre.setWorkerUrl(workerUrl)

const routeColor = '#7446d6'
const routeOutline = '#402a72'
const navigationPitch = 64
const navigationZoom = 17.8
const arrivalTime = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const kilometers = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

export type VehicleType = 'car' | 'motorcycle'
export type DriverPosition = Point & { accuracy: number; timestamp: number; heading?: number; speed?: number }

type DrivingRoute = { geometry: RoadLine; duration: number; distance: number; habitual?: boolean; legs?: { steps: RoutingStep[] }[] }
const router = (import.meta.env.VITE_ROUTER_URL || 'https://routing.openstreetmap.de/routed-car').replace(/\/$/, '')

async function roadRoute(points: Coordinates[], signal: AbortSignal): Promise<DrivingRoute> {
  const query = new URLSearchParams({ overview: 'full', geometries: 'geojson', steps: 'true' })
  const response = await fetch(router + '/route/v1/driving/' + points.map(point => point.join(',')).join(';') + '?' + query, { signal })
  if (!response.ok) throw new Error('Serviço de rotas indisponível.')
  const data = await response.json() as { code: string; routes?: DrivingRoute[] }
  const route = data.routes?.[0]
  if (data.code !== 'Ok' || route?.geometry?.type !== 'LineString' ||
      route.geometry.coordinates.length < 2 || !Number.isFinite(route.duration) || !Number.isFinite(route.distance)) {
    throw new Error('Nenhuma rota encontrada.')
  }
  return route
}
async function usualRoute(from: Coordinates, to: Coordinates, signal: AbortSignal) {
  const toPoint = ([longitude, latitude]: Coordinates) => ({ latitude, longitude })
  try {
    const response = await fetch('/api/routes/habitual', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: toPoint(from), to: toPoint(to) }), signal,
    })
    if (!response.ok) return null
    const { checkpoints } = await response.json() as { checkpoints: Point[] | null }
    if (!checkpoints?.length) return null
    const intermediate = checkpoints.map(({ longitude, latitude }): Coordinates => [longitude, latitude])
    const route = await roadRoute([from, ...intermediate, to], signal)
    return { ...route, habitual: true }
  } catch {
    return null
  }
}
export function JourneyMap({ pointA, pointB, returning, position, activeLeg, stationPrices, estimateTarget, vehicleType, topOverlay, bottomOverlay, now, onLegDistance, maneuverTarget, following, setFollowing }: {
  vehicleType?: VehicleType;
  following: boolean;
  setFollowing: (following: boolean) => void;
  now: number;
  onLegDistance?: (leg: string, km: number) => void;
  stationPrices?: StationPrice[];
  estimateTarget?: HTMLDivElement | null;
  maneuverTarget?: HTMLDivElement | null;
  topOverlay?: HTMLDivElement | null; bottomOverlay?: HTMLDivElement | null;
  pointA?: Point | null; pointB?: Point | null; returning: boolean; activeLeg?: string; position?: DriverPosition;
}) {
  const element = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<maplibre.Map | null>(null)
  const [failed, setFailed] = useState(false)
  const [routeFailed, setRouteFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{ key: string; route: DrivingRoute } | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [detour, setDetour] = useState<{ key: string; from: Coordinates } | null>(null)
  const deviation = useRef({ count: 0, lastFix: 0, lastRequest: 0 })
  const directionKey = [pointA?.latitude, pointA?.longitude, pointB?.latitude, pointB?.longitude, returning].join(':')
  const routeKey = directionKey + ':' + (activeLeg ?? '')
  const detourFrom = detour?.key === routeKey ? detour.from : undefined
  const currentRoute = result?.key === routeKey ? result.route : null
  const progress = useMemo(() => position && currentRoute ? routeProgress(position, currentRoute.geometry.coordinates) : null,
    [position, currentRoute])
  const departure = returning ? pointB : pointA
  const cameraPoint = position ?? departure
  const direction = useMemo(() => cameraPoint && currentRoute
    ? routeProgress(cameraPoint, currentRoute.geometry.coordinates) : null, [cameraPoint, currentRoute])
  const heading = position?.heading ?? (direction && direction.distance < 100 ? direction.bearing : undefined)
  const [carElement, setCarElement] = useState<HTMLDivElement | null>(null)
  const car = useRef<maplibre.Marker | null>(null)
  const cameraStarted = useRef(false)
  const cameraZoom = useRef(navigationZoom)
  const [recentering, setRecentering] = useState(false)
  const [cameraOffset, setCameraOffset] = useState(0)
  const traveled = useRef(0)
  const [routePosition, setRoutePosition] = useState<{ route: DrivingRoute; remaining: number } | null>(null)
  const navigating = Boolean(activeLeg)
  const aLat = pointA?.latitude, aLon = pointA?.longitude
  const bLat = pointB?.latitude, bLon = pointB?.longitude
  const carLat = position?.latitude, carLon = position?.longitude
  const estimate = currentRoute && navigationEstimate(currentRoute.distance, currentRoute.duration,
    routePosition?.route === currentRoute ? routePosition.remaining : 1, position?.speed)

  const maneuver = navigating && currentRoute && estimate
    ? nextManeuver(currentRoute.legs ?? [], currentRoute.distance - estimate.meters) : null
  const ManeuverIcon = maneuver?.direction === 'left' ? ArrowLeft : maneuver?.direction === 'right' ? ArrowRight :
    maneuver?.direction === 'uturn' ? CornerUpLeft : maneuver?.direction === 'arrive' ? Flag : ArrowUp
  useEffect(() => {
    if (!element.current) return
    let instance: maplibre.Map | undefined
    let attributionTimer: number | undefined
    try {
      const rasterTiles = import.meta.env.VITE_MAP_TILES
      instance = new maplibre.Map({
        container: element.current,
        center: [-34.871, -7.132], zoom: rasterTiles ? 12.5 : 14, maxZoom: 19,
        dragRotate: false,
        maxPitch: navigationPitch,
        attributionControl: { compact: true },
        locale: { 'AttributionControl.ToggleAttribution': 'Créditos do mapa' },
        transformStyle: rasterTiles ? undefined : (_previous, next) => monochromeStreets(next),
        style: rasterTiles ? {
          version: 8,
          sources: { streets: {
            type: 'raster', tiles: [rasterTiles],
            tileSize: 256, maxzoom: 19,
            attribution: import.meta.env.VITE_MAP_ATTRIBUTION ?? '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>',
          } },
          layers: [{ id: 'streets', type: 'raster', source: 'streets', paint: { 'raster-saturation': -1 } }],
        } : 'https://tiles.openfreemap.org/styles/liberty',
      })
      instance.addControl(new maplibre.GeolocateControl({
        positionOptions: { enableHighAccuracy: true }, trackUserLocation: true,
      }), 'top-right')
      instance.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right')
      instance.on('error', () => setFailed(true))
      instance.on('sourcedata', event => { if (event.sourceDataType === 'content' && event.isSourceLoaded) setFailed(false) })
      const current = instance
      instance.once('load', () => {
        setMap(current)
        const credits = current.getContainer().querySelector<HTMLElement>('.maplibregl-ctrl-attrib-button')
        if (!credits) return
        attributionTimer = window.setTimeout(() => {
          if (credits.parentElement?.classList.contains('maplibregl-compact-show')) credits.click()
        }, 5000)
        credits.addEventListener('click', () => window.clearTimeout(attributionTimer), { once: true })
      })
    } catch {
      setFailed(true)
    }
    return () => {
      window.clearTimeout(attributionTimer)
      instance?.remove()
    }
  }, [])

  useEffect(() => {
    setRouteFailed(false)
    if (!map || aLat === undefined || aLon === undefined || bLat === undefined || bLon === undefined) return
    const a: Coordinates = [aLon, aLat]
    const b: Coordinates = [bLon, bLat]

    const pins = [a, b].map((coordinates, index) => {
      const pin = document.createElement('div')
      pin.className = 'route-point'
      pin.textContent = index === 0 ? 'A' : 'B'
      pin.setAttribute('aria-label', 'Ponto ' + pin.textContent)
      return new maplibre.Marker({ element: pin }).setLngLat(coordinates).addTo(map)
    })
    return () => pins.forEach(pin => pin.remove())
  }, [map, aLat, aLon, bLat, bLon])

  useEffect(() => {
    if (!map || !stationPrices?.length) return
    const groups = new Map<string, StationPrice[]>()
    for (const price of stationPrices) {
      const group = groups.get(price.stationId) ?? []
      if (!group.length) groups.set(price.stationId, group)
      group.push(price)
    }
    const markers = [...groups.values()].map(prices => {
      const latest = prices[0]
      const marker = document.createElement('button')
      marker.type = 'button'
      marker.className = 'station-price-marker'
      marker.textContent = fuelMoney(latest.unitPrice)
      marker.setAttribute('aria-label', 'Ver preços em ' + latest.name)
      const content = document.createElement('section')
      content.className = 'station-price-popup'
      const title = document.createElement('strong')
      title.textContent = latest.name
      const list = document.createElement('ul')
      for (const { fuel, unitPrice, updatedAt } of prices) {
        const row = document.createElement('li')
        const date = new Date(updatedAt).toLocaleDateString('pt-BR')
        row.textContent = fuel + ' · ' + fuelMoney(unitPrice) + '/' + fuelUnit(fuel) + ' · ' + date
        list.append(row)
      }
      content.append(title, list)
      return new maplibre.Marker({ element: marker, anchor: 'bottom' })
        .setLngLat([latest.longitude, latest.latitude])
        .setPopup(new maplibre.Popup({ offset: 22 }).setDOMContent(content))
        .addTo(map)
    })
    return () => markers.forEach(marker => marker.remove())
  }, [map, stationPrices])
  useEffect(() => {
    setRouteFailed(false)
    setCalculating(false)
    if (!map || aLat === undefined || aLon === undefined || bLat === undefined || bLon === undefined) return
    const a: Coordinates = [aLon, aLat]
    const b: Coordinates = [bLon, bLat]
    const [start, destination] = returning ? [b, a] : [a, b]
    const from = detourFrom ?? start
    const request = new AbortController()
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(12000)])
    setCalculating(true)
    const fastest = roadRoute([from, destination], signal)
    const habitual = detourFrom ? Promise.resolve(null) : usualRoute(from, destination, signal)
    void Promise.allSettled([fastest, habitual]).then(([direct, usual]) => {
      if (request.signal.aborted) return
      const route = (usual.status === 'fulfilled' && usual.value) || (direct.status === 'fulfilled' && direct.value)
      if (!route) {
        setRouteFailed(true)
        return
      }
      if (activeLeg && !detourFrom && route.distance > 0) onLegDistance?.(activeLeg, route.distance / 1000)
      setResult({ key: routeKey, route })
      if (navigating && cameraStarted.current) return
      const bounds = new maplibre.LngLatBounds(from, from).extend(destination)
      for (const coordinates of route.geometry.coordinates) bounds.extend(coordinates)
      const canvas = map.getContainer()
      map.fitBounds(bounds, {
        maxZoom: 17, duration: 500, pitch: 0, bearing: 0,
        padding: { top: Math.min(186, canvas.clientHeight * 0.27), bottom: Math.min(250, canvas.clientHeight * 0.34),
          left: Math.min(70, canvas.clientWidth * 0.17), right: Math.min(70, canvas.clientWidth * 0.17) },
      })
    }).catch(() => { if (!request.signal.aborted) setRouteFailed(true) })
      .finally(() => { if (!request.signal.aborted) setCalculating(false) })
    return () => request.abort()
  }, [map, aLat, aLon, bLat, bLon, returning, retry, detourFrom, routeKey, navigating, activeLeg, onLegDistance])

  useEffect(() => {
    if (!map || !currentRoute) return
    map.addSource('journey-route', {
      type: 'geojson', lineMetrics: true,
      data: { type: 'Feature', properties: {}, geometry: currentRoute.geometry },
      attribution: '<a href="https://map.project-osrm.org/about.html">Rotas © OSRM / FOSSGIS</a>',
    })
    map.addLayer({
      id: 'journey-route-outline', source: 'journey-route', type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': routeOutline, 'line-width': 11 },
    })
    map.addLayer({
      id: 'journey-route-line', source: 'journey-route', type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': routeColor, 'line-width': 7 },
    })
    let frame: number | undefined
    const highlightId = 'journey-route-highlight'
    if (!navigating && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const startedAt = performance.now()
      const duration = 4500
      map.addLayer({
        id: highlightId, source: 'journey-route', type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': 'transparent', 'line-width': 5 },
      })
      const animate = (now: number) => {
        const time = ((now - startedAt) % duration) / duration
        if (!map.getLayer(highlightId)) return
        const start = traveled.current
        const head = start - .1 + (1 - start + .2) * time
        map.setPaintProperty(highlightId, 'line-gradient', [
          'case', ['<', ['line-progress'], start], 'transparent',
          ['interpolate', ['linear'], ['abs', ['-', ['line-progress'], head]],
            0, '#ccecff', .04, '#90c6ff', .1, 'transparent'],
        ])
        frame = window.requestAnimationFrame(animate)
      }
      frame = window.requestAnimationFrame(animate)
    }
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame)
      if (!map.getStyle()) return
      if (map.getLayer(highlightId)) map.removeLayer(highlightId)
      if (map.getLayer('journey-route-line')) map.removeLayer('journey-route-line')
      if (map.getLayer('journey-route-outline')) map.removeLayer('journey-route-outline')
      if (map.getSource('journey-route')) map.removeSource('journey-route')
    }
  }, [map, currentRoute, navigating])

  useEffect(() => {
    if (!map || !currentRoute || navigating) return
    const { coordinates } = currentRoute.geometry
    const label = document.createElement('div')
    label.className = 'route-estimate surface'
    label.textContent = Math.max(1, Math.ceil(currentRoute.duration / 60)) + ' min' +
      (currentRoute.habitual ? ' · Rota habitual' : '')
    label.setAttribute('aria-label', 'Tempo estimado da rota: ' + label.textContent)
    const marker = new maplibre.Marker({ element: label, anchor: 'bottom-left', offset: [7, -5] })
      .setLngLat(coordinates[Math.floor(coordinates.length / 2)]).addTo(map)
    return () => { marker.remove() }
  }, [map, currentRoute, navigating])
  useEffect(() => {
    deviation.current.count = 0
    traveled.current = 0
  }, [currentRoute])

  useEffect(() => {
    if (!currentRoute || !position || position.accuracy > 85 || !progress ||
        progress.distance > Math.max(45, position.accuracy)) return
    setRoutePosition(previous => {
      if (previous?.route === currentRoute && previous.remaining <= progress.remaining) return previous
      return { route: currentRoute, remaining: progress.remaining }
    })
  }, [currentRoute, position, progress])
  useEffect(() => {
    if (!map?.getLayer('journey-route-line') || !position || position.accuracy > 50 ||
        !progress || progress.distance > Math.max(45, position.accuracy * 2)) return
    const fraction = Math.min(1, Math.max(traveled.current, 1 - progress.remaining))
    if (fraction <= traveled.current) return
    traveled.current = fraction
    map.setPaintProperty('journey-route-line', 'line-gradient', [
      'step', ['line-progress'], 'transparent', fraction, routeColor,
    ])
    map.setPaintProperty('journey-route-outline', 'line-gradient', [
      'step', ['line-progress'], 'transparent', fraction, routeOutline,
    ])
  }, [map, position, progress])

  useEffect(() => {
    if (!navigating) {
      cameraStarted.current = false
      cameraZoom.current = navigationZoom
      setRecentering(false)
      setFollowing(true)
      if (map && (map.getPitch() || map.getBearing())) map.easeTo({ pitch: 0, bearing: 0, duration: 400 })
      return
    }
    if (!map) return
    const pause = () => {
      setRecentering(false)
      setFollowing(false)
    }
    const rememberZoom = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) cameraZoom.current = map.getZoom()
    }
    map.on('dragstart', pause)
    map.on('zoomend', rememberZoom)
    return () => {
      map.off('dragstart', pause)
      map.off('zoomend', rememberZoom)
    }
  }, [map, navigating, setFollowing])

  useEffect(() => {
    if (!map || !navigating) return
    const container = map.getContainer()
    function measure() {
      const viewport = container.getBoundingClientRect()
      const top = topOverlay ? topOverlay.getBoundingClientRect().bottom - viewport.top : 0
      const bottom = bottomOverlay ? bottomOverlay.getBoundingClientRect().top - viewport.top : viewport.height
      const gap = Math.max(0, bottom - top)
      const markerClearance = Math.min(32, gap / 2)
      const target = Math.min(bottom - markerClearance, top + gap * .72)
      setCameraOffset(Math.round(target - viewport.height / 2))
    }
    measure()
    const observer = new ResizeObserver(measure)
    for (const element of [container, topOverlay, bottomOverlay]) if (element) observer.observe(element)
    return () => observer.disconnect()
  }, [map, navigating, topOverlay, bottomOverlay])
  useEffect(() => {
    if (!map || !navigating || !following || !cameraPoint) return
    const first = !cameraStarted.current
    cameraStarted.current = true
    map.easeTo({
      center: [cameraPoint.longitude, cameraPoint.latitude],
      zoom: cameraZoom.current,
      pitch: navigationPitch,
      bearing: heading ?? map.getBearing(),
      offset: [0, cameraOffset],
      duration: first ? 650 : 500,
    })
  }, [map, navigating, following, cameraPoint, heading, cameraOffset])
  useEffect(() => {
    if (!position || position.accuracy > 45 || !progress || calculating) return
    const state = deviation.current
    if (state.lastFix === position.timestamp) return
    state.lastFix = position.timestamp
    if (progress.distance <= Math.max(65, position.accuracy * 2)) {
      state.count = 0
      return
    }
    if (++state.count < 3 || Date.now() - state.lastRequest < 25000) return
    state.count = 0
    state.lastRequest = Date.now()
    setDetour({ key: routeKey, from: [position.longitude, position.latitude] })
  }, [position, progress, calculating, routeKey])
  useEffect(() => {
    if (!map || carLat === undefined || carLon === undefined) {
      car.current?.remove()
      car.current = null
      setCarElement(null)
      return
    }
    if (!car.current) {
      const marker = document.createElement('div')
      marker.className = 'driver-marker'
      marker.setAttribute('aria-label', 'Sua posição atual')
      car.current = new maplibre.Marker({ element: marker }).setLngLat([carLon, carLat]).addTo(map)
      car.current.setRotationAlignment('map')
      setCarElement(marker)
    } else car.current.setLngLat([carLon, carLat])
    car.current.setRotation(heading ?? 0)
  }, [map, carLat, carLon, heading])

  return <>
    <div className="map" ref={element} aria-label="Mapa interativo" />
    {maneuverTarget && maneuver && createPortal(
      <div className="maneuver-banner" aria-label="Próxima manobra">
        <ManeuverIcon size={31} aria-hidden="true" />
        <div>
          <strong>{maneuver.meters >= 1000 ? kilometers.format(maneuver.meters / 1000) + ' km' :
            Math.round(maneuver.meters / 10) * 10 + ' m'}</strong>
          <span>{maneuver.instruction}{maneuver.street && ' · ' + maneuver.street}</span>
        </div>
      </div>, maneuverTarget,
    )}
    {navigating && estimateTarget && (estimate || calculating) && createPortal(
      <div className="navigation-estimate" aria-label="Previsão até o próximo ponto">
        {calculating ? <span role="status">{detourFrom ? 'Recalculando rota…' : 'Calculando rota…'}</span> : estimate && <>
          <div><strong>{Math.max(1, Math.ceil(estimate.seconds / 60))} min</strong><small>Restantes</small></div>
          <div><strong><span className="arrival-prefix">às </span>{arrivalTime.format(now + estimate.seconds * 1000)}</strong><small>Chegada prevista</small></div>
          <div><strong>{kilometers.format(estimate.meters / 1000)} km</strong><small>Restantes</small></div>
        </>}
      </div>, estimateTarget,
    )}
    {carElement && createPortal(vehicleType === 'motorcycle'
      ? <span className="driver-moto" aria-hidden="true"><span /></span>
      : <span className="driver-car" aria-hidden="true">
        <span className="driver-car-body"><span className="driver-car-cabin" /></span>
      </span>, carElement)}
    {navigating && cameraPoint && !following && <button className="route-recenter surface" disabled={recentering} onClick={() => {
      if (!map) return
      map.stop()
      setRecentering(true)
      cameraZoom.current = navigationZoom
      map.once('moveend', () => {
        cameraStarted.current = true
        setRecentering(false)
        setFollowing(true)
      })
      map.easeTo({
        center: [cameraPoint.longitude, cameraPoint.latitude], zoom: cameraZoom.current,
        pitch: navigationPitch, bearing: heading ?? map.getBearing(), offset: [0, cameraOffset], duration: 500,
      })
    }}><LocateFixed size={22} aria-hidden="true" /> {recentering ? 'Recentralizando…' : 'Recentralizar veículo'}</button>}
    {failed && <div className="map-status" role="status">Mapa indisponível. Confira a conexão e o suporte a WebGL.</div>}
    {!failed && routeFailed && <div className="map-status" role="status">
      Rota indisponível. <button className="text-button" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button>
    </div>}
  </>
}
