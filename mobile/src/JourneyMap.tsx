import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Camera, GeoJSONSource, Layer, Map, ViewAnnotation, type CameraRef, type MapProps } from '@maplibre/maplibre-react-native'
import { monochromeStreets } from '../../src/map-style'
import { coords, navigationPadding, navigationPitch, navigationZoom, type RouteView } from './road-route'
import type { RoadLine } from '../../src/route-geometry'
import { useRouteHighlight } from './route-pulse'
import { DriverMarker } from './DriverMarker'
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
function NativeRouteHighlight({ road }: { road: RoadLine }) {
  const highlight = useRouteHighlight(road)
  return <>{highlight.map(band => <GeoJSONSource key={band.id} id={'journey-highlight-' + band.id}
    data={{ type: 'LineString', coordinates: band.coordinates }}>
    <Layer type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      paint={{ 'line-color': band.color, 'line-width': band.width }} />
  </GeoJSONSource>)}</>
}

export function JourneyMap({ a, b, active, route, following, onExplore, drivers }: RouteView) {
  const camera = useRef<CameraRef>(null)
  const { height } = useWindowDimensions()
  const [loaded, setLoaded] = useState(false)
  const { from, current, road, heading, routeError, routeKey, estimate } = route

  useEffect(() => {
    if (!loaded || (active && !following)) return
    if (active) {
      const center = current ?? from
      if (center) camera.current?.easeTo({
        center: coords(center), zoom: navigationZoom, pitch: navigationPitch, bearing: heading,
        padding: navigationPadding(height), duration: 700,
      })
    } else if (a && b) {
      camera.current?.fitBounds([Math.min(a.longitude, b.longitude), Math.min(a.latitude, b.latitude),
        Math.max(a.longitude, b.longitude), Math.max(a.latitude, b.latitude)], {
        padding: { top: 120, bottom: 190, left: 40, right: 40 }, duration: 450, pitch: 0, bearing: 0,
      })
    }
  }, [loaded, routeKey, current, heading, height, following])

  return <>
    <Map style={StyleSheet.absoluteFill} mapStyle={mapStyle} onDidFinishLoadingMap={() => setLoaded(true)} logo={false}
      onRegionWillChange={event => { if (active && following && event.nativeEvent.userInteraction) onExplore() }}>
      <Camera ref={camera} initialViewState={cityView} />
      {road && <GeoJSONSource id="journey" data={road.geometry}>
        <Layer type="line" paint={{ 'line-color': '#51329a', 'line-width': 8 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
        <Layer type="line" paint={{ 'line-color': '#9763f1', 'line-width': 5 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
      </GeoJSONSource>}
      {!active && road && <NativeRouteHighlight road={road.geometry} />}
      {a && <ViewAnnotation id="point-a" lngLat={coords(a)}><Text style={styles.pin}>A</Text></ViewAnnotation>}
      {b && <ViewAnnotation id="point-b" lngLat={coords(b)}><Text style={styles.pin}>B</Text></ViewAnnotation>}
      {drivers.map(driver => <ViewAnnotation key={driver.id} id={'nearby-' + driver.id} lngLat={coords(driver)}>
        <DriverMarker nearby motorcycle={driver.type === 'motorcycle'} />
      </ViewAnnotation>)}
      {active && current && <ViewAnnotation id="driver" lngLat={coords(current)}>
        <DriverMarker motorcycle={active.vehicle.type === 'motorcycle'} />
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
  status: { position: 'absolute', right: 14, top: 150, borderRadius: 12, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, elevation: 3 },
  statusLabel: { fontWeight: '700', color: '#2e2152' },
})
