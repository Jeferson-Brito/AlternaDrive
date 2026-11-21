import { useEffect, useRef } from 'react'
import { StyleSheet } from 'react-native'
import MapView, { Marker, Polyline } from 'react-native-maps'
import { type RouteView } from './road-route'

const initialRegion = { latitude: -7.132, longitude: -34.871, latitudeDelta: .055, longitudeDelta: .045 }
const previewPalette = [
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#d3d8d7' }] },
  { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#e9eae8' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#c8dfc7' }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#b9d9eb' }] },
]

export function PreviewMap({ a, b, active, route, decorative = false }: Partial<RouteView> & { decorative?: boolean }) {
  const map = useRef<MapView>(null)
  const { road, from, current, progress, routeKey } = route ?? {}
  const center = active ? (current ?? from) : null
  useEffect(() => {
    if (center) map.current?.animateCamera({
      center, zoom: 17, pitch: 47, heading: (current?.heading ?? -1) >= 0 ? current?.heading ?? 0 : progress?.bearing ?? 0,
    }, { duration: 550 })
    else if (a && b) map.current?.fitToCoordinates([a, b], { edgePadding: { top: 120, right: 48, bottom: 190, left: 48 } })
  }, [routeKey, center, progress?.bearing])

  return <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={initialRegion} customMapStyle={previewPalette}
    scrollEnabled={!decorative} zoomEnabled={!decorative} rotateEnabled={!decorative} pitchEnabled={!decorative}
    toolbarEnabled={false}>
    {road && <Polyline
      coordinates={road.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }))}
      strokeColor="#7446d6" strokeWidth={6} />}
    {a && <Marker coordinate={a} title="Ponto A" />}
    {b && <Marker coordinate={b} title="Ponto B" />}
    {active && current && <Marker coordinate={current} title="Seu veículo" pinColor="#0b5a48" />}
  </MapView>
}
