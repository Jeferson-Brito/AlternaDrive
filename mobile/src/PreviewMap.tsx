import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import MapView, { Marker, Polyline, type MapStyleElement } from 'react-native-maps'
import { type RouteView } from './road-route'

const initialRegion = { latitude: -7.132, longitude: -34.871, latitudeDelta: .033, longitudeDelta: .030 }
const previewPalette: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#e9eae8' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4d5a61' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 2 }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#e9eae8' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#e2e9e1' }] },
  { featureType: 'landscape.natural.landcover', elementType: 'geometry', stylers: [{ color: '#c8dfc7' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#c8cecc' }] },
  { featureType: 'road.local', elementType: 'geometry.stroke', stylers: [{ color: '#e2e5e3' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ saturation: -25 }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#c8dfc7' }] },
  { featureType: 'poi.park', elementType: 'labels.text', stylers: [{ visibility: 'on' }] },
  { featureType: 'transit.line', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station.bus', elementType: 'labels.icon', stylers: [{ visibility: 'on' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#b9d9eb' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#527384' }] },
]

export function PreviewMap({ a, b, active, route, decorative = false }: Partial<RouteView> & { decorative?: boolean }) {
  const map = useRef<MapView>(null)
  const [ready, setReady] = useState(false)
  const { road, from, current, progress, routeKey } = route ?? {}
  const center = active ? (current ?? from) : null
  const routeCoordinates = road?.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }))
  useEffect(() => {
    if (!ready) return
    if (center) map.current?.animateCamera({
      center, zoom: 17, pitch: 47, heading: (current?.heading ?? -1) >= 0 ? current?.heading ?? 0 : progress?.bearing ?? 0,
    }, { duration: 550 })
    else if (a && b) map.current?.fitToCoordinates([a, b], { edgePadding: { top: 120, right: 48, bottom: 190, left: 48 } })
  }, [ready, routeKey, center, progress?.bearing])

  return <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={initialRegion} customMapStyle={previewPalette}
    userInterfaceStyle="light" onMapReady={() => setReady(true)}
    scrollEnabled={!decorative} zoomEnabled={!decorative} rotateEnabled={!decorative} pitchEnabled={!decorative}
    toolbarEnabled={false}>
    {routeCoordinates && <>
      <Polyline coordinates={routeCoordinates} strokeColor="#51329a" strokeWidth={8} zIndex={1} />
      <Polyline coordinates={routeCoordinates} strokeColor="#9763f1" strokeWidth={5} zIndex={2} />
    </>}
    {a && <Marker coordinate={a} title="Ponto A"><Text style={styles.pin}>A</Text></Marker>}
    {b && <Marker coordinate={b} title="Ponto B"><Text style={styles.pin}>B</Text></Marker>}
    {active && current && <Marker coordinate={current} title="Seu veículo" anchor={{ x: .5, y: .5 }}>
      <Text style={styles.driver}>{active.vehicle.type === 'motorcycle' ? '🏍' : '🚙'}</Text>
    </Marker>}
  </MapView>
}

const styles = StyleSheet.create({
  pin: { backgroundColor: '#0b5a48', color: 'white', textAlign: 'center', width: 26, height: 26, lineHeight: 26, borderRadius: 13, overflow: 'hidden', fontWeight: '800' },
  driver: { fontSize: 22, backgroundColor: '#f9fffc', color: '#0b5a48', borderRadius: 20, overflow: 'hidden', padding: 4 },
})
