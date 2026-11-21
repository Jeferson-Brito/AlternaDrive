import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Camera, GeoJSONSource, Layer, Map, ViewAnnotation, type CameraRef, type MapProps } from '@maplibre/maplibre-react-native'
import { monochromeStreets } from '../../src/map-style'
import { coords, type RouteView } from './road-route'
import libertyStyle from '../assets/openfreemap-liberty.json'
// Both renderers use style v8, with separate TypeScript style packages.
const mapStyle = monochromeStreets(libertyStyle as Parameters<typeof monochromeStreets>[0]) as unknown as MapProps['mapStyle']
const cityView = { center: [-34.871, -7.132] as [number, number], zoom: 14 }

export function LoginMap({ bottomInset }: { bottomInset: number }) {
  return <Map androidView="texture" style={StyleSheet.absoluteFill} mapStyle={mapStyle}
    dragPan={false} touchZoom={false} touchRotate={false} touchPitch={false} logo={false}
    attributionPosition={{ bottom: bottomInset + 8, left: 12 }}>
    <Camera initialViewState={cityView} />
  </Map>
}
export function JourneyMap({ a, b, active, route }: RouteView) {
  const camera = useRef<CameraRef>(null)
  const [loaded, setLoaded] = useState(false)
  const { from, current, road, progress, routeError, routeKey, estimate } = route

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

  return <>
    <Map style={StyleSheet.absoluteFill} mapStyle={mapStyle} onDidFinishLoadingMap={() => setLoaded(true)} logo={false}>
      <Camera ref={camera} initialViewState={cityView} />
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
    {!active && (routeError || estimate) && <View pointerEvents="none" style={styles.status}>
      <Text style={styles.statusLabel}>{routeError ? 'Rota indisponível' :
        Math.ceil(estimate!.seconds / 60) + ' min  ·  ' + (estimate!.meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' km'}</Text>
    </View>}
  </>
}

const styles = StyleSheet.create({
  pin: { backgroundColor: '#0b5a48', color: 'white', textAlign: 'center', borderRadius: 13, overflow: 'hidden', width: 26, height: 26, lineHeight: 26, fontWeight: '800' },
  driver: { fontSize: 24, backgroundColor: '#f9fffc', borderRadius: 24, borderWidth: 2, borderColor: '#0b5a48', padding: 4 },
  status: { position: 'absolute', right: 14, top: 150, borderRadius: 12, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, elevation: 3 },
  statusLabel: { fontWeight: '700', color: '#2e2152' },
})
