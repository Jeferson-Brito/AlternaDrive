import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Camera, GeoJSONSource, Layer, Map, ViewAnnotation, type CameraRef } from '@maplibre/maplibre-react-native'
import type { LocationObject } from 'expo-location'
import { distanceMeters } from '../../src/arrival'
import { routeProgress, type RoadLine } from '../../src/route-geometry'
import { api } from './api'
import type { Journey, Point } from './model'

const coords = ({ longitude, latitude }: Point): [number, number] => [longitude, latitude]
const mapStyle = 'https://tiles.openfreemap.org/styles/liberty'
type Road = { geometry: RoadLine; distance: number; duration: number }

export function JourneyMap({ a, b, active, position, token }: {
  a: Point | null; b: Point | null; active: Journey | null; position: LocationObject | null; token: string
}) {
  const camera = useRef<CameraRef>(null)
  const [loaded, setLoaded] = useState(false)
  const [road, setRoad] = useState<Road>()
  const [routeError, setRouteError] = useState(false)
  const [recalculate, setRecalculate] = useState(0)
  const fix = useRef(position)
  fix.current = position
  const returning = (active?.arrivals ?? 0) % 2 === 1
  const from = returning ? b : a
  const to = returning ? a : b
  const routeKey = [active?.id, active?.arrivals, from?.latitude, from?.longitude, to?.latitude, to?.longitude].join(':')
  const current = position?.coords
  const progress = useMemo(() => road && current ? routeProgress(current, road.geometry.coordinates) : null, [current, road])

  useEffect(() => {
    if (!from || !to) { setRoad(undefined); return }
    const abort = new AbortController()
    setRoad(undefined)
    setRouteError(false)
    const nearby = active && fix.current?.coords && (fix.current.coords.accuracy ?? Infinity) <= 50 ? fix.current.coords : null
    const start = nearby ?? from
    async function load() {
      const far = distanceMeters(start, from!) > 150
      const habitual = !far ? await api<{ checkpoints: Point[] | null }>('routes/habitual', { from, to }, token).catch(() => null) : null
      if (abort.signal.aborted) return
      const points = [start, ...(habitual?.checkpoints?.slice(1, -1) ?? []), to!].map(coords).join(';')
      const response = await fetch('https://routing.openstreetmap.de/routed-car/route/v1/driving/' + points + '?overview=full&geometries=geojson', { signal: abort.signal })
      if (!response.ok) throw new Error('Rota indisponível.')
      const data = await response.json() as { routes?: Road[] }
      const route = data.routes?.[0]
      if (!route || route.geometry.coordinates.length < 2) throw new Error('Rota indisponível.')
      if (!abort.signal.aborted) setRoad(route)
    }
    void load().catch(() => { if (!abort.signal.aborted) setRouteError(true) })
    return () => abort.abort()
  }, [routeKey, recalculate, token])

  useEffect(() => {
    if (!active || !current || (current.accuracy ?? Infinity) > 50 || !progress || progress.distance < 90) return
    const timer = setTimeout(() => setRecalculate(value => value + 1), 3000)
    return () => clearTimeout(timer)
  }, [active?.id, !!current && (current.accuracy ?? Infinity) <= 50, !!progress && progress.distance >= 90])

  useEffect(() => {
    if (!loaded) return
    if (active) {
      const center = current ?? from
      if (center) camera.current?.easeTo({
        center: coords(center), zoom: 17, pitch: 52, bearing: current?.heading && current.heading > 0 ? current.heading : progress?.bearing ?? 0,
        padding: { top: 20, bottom: 175, left: 0, right: 0 }, duration: 700,
      })
    } else if (a && b) {
      camera.current?.fitBounds([Math.min(a.longitude, b.longitude), Math.min(a.latitude, b.latitude),
        Math.max(a.longitude, b.longitude), Math.max(a.latitude, b.latitude)], {
        padding: { top: 120, bottom: 190, left: 40, right: 40 }, duration: 450, pitch: 0, bearing: 0,
      })
    }
  }, [loaded, routeKey, current, progress?.bearing])

  const meters = road && road.distance * (active ? progress?.remaining ?? 1 : 1)
  const seconds = road && road.duration * (active ? progress?.remaining ?? 1 : 1)

  return <>
    <Map style={StyleSheet.absoluteFill} mapStyle={mapStyle} onDidFinishLoadingMap={() => setLoaded(true)} logo={false}>
      <Camera ref={camera} initialViewState={{ center: [-34.874, -7.122], zoom: 12 }} />
      {road && <GeoJSONSource id="journey" data={road.geometry}>
        <Layer type="line" paint={{ 'line-color': '#51329a', 'line-width': 8 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
        <Layer type="line" paint={{ 'line-color': '#9763f1', 'line-width': 5 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
      </GeoJSONSource>}
      {a && <ViewAnnotation id="point-a" lngLat={coords(a)}><Text style={styles.pin}>A</Text></ViewAnnotation>}
      {b && <ViewAnnotation id="point-b" lngLat={coords(b)}><Text style={styles.pin}>B</Text></ViewAnnotation>}
      {active && current && <ViewAnnotation id="driver" lngLat={coords(current)}>
        <Text accessibilityLabel="Seu veículo" style={styles.driver}>{active.vehicle.type === 'motorcycle' ? '🏍' : '🚙'}</Text>
      </ViewAnnotation>}
    </Map>
    {(routeError || (seconds !== undefined && meters !== undefined)) && <View pointerEvents="none" style={styles.status}>
      <Text style={styles.statusLabel}>{routeError ? 'Rota indisponível' :
        Math.ceil(seconds! / 60) + ' min  ·  ' + (meters! / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' km'}</Text>
    </View>}
  </>
}

const styles = StyleSheet.create({
  pin: { backgroundColor: '#0b5a48', color: 'white', textAlign: 'center', borderRadius: 13, overflow: 'hidden', width: 26, height: 26, lineHeight: 26, fontWeight: '800' },
  driver: { fontSize: 24, backgroundColor: '#f9fffc', borderRadius: 24, borderWidth: 2, borderColor: '#0b5a48', padding: 4 },
  status: { position: 'absolute', right: 14, top: 150, borderRadius: 12, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, elevation: 3 },
  statusLabel: { fontWeight: '700', color: '#2e2152' },
})
