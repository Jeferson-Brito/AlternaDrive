import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { Text } from './type'
import MapView, { Marker, Polyline, type MapStyleElement } from 'react-native-maps'
import { navigationPadding, navigationPitch, navigationZoom, type RouteView } from './road-route'
import type { RoadLine } from '../../src/route-geometry'
import { useRouteHighlight } from './route-trail'
import { StopMarker } from './StopMarker'
import { MapPencil } from './MapPencil'
import { useDriverName } from './use-driver-name'
import { DriverMarker } from './DriverMarker'

const initialRegion = { latitude: -7.132, longitude: -34.871, latitudeDelta: .033, longitudeDelta: .030 }
const previewPalette: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#e9eae8' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#4d5a61' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 2 }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#e9eae8' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#e2e9e1' }] },
  { featureType: 'landscape.natural.landcover', elementType: 'geometry', stylers: [{ color: '#c8dfc7' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }, { weight: 3 }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#d4d9d7' }] },
  { featureType: 'road.local', elementType: 'geometry.stroke', stylers: [{ color: '#e2e5e3' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ saturation: -45 }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#c8dfc7' }] },
  { featureType: 'poi.park', elementType: 'labels.text', stylers: [{ visibility: 'on' }] },
  { featureType: 'transit.line', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station.bus', elementType: 'labels.icon', stylers: [{ visibility: 'on' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#b9d9eb' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#527384' }] },
]

function PreviewRouteHighlight({ road }: { road: RoadLine }) {
  const highlight = useRouteHighlight(road)
  return <>{highlight.map((band, index) => <Polyline key={band.id}
    coordinates={band.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }))}
    strokeColor={band.color} strokeWidth={band.width} lineCap="round" lineJoin="round" zIndex={3 + index} />)}</>
}

export function PreviewMap({ a, b, active, route, following = true, onExplore, drivers = [], demand = [], passengerCenter, carColor, waitingStop, drawPoint, drawRevision, routeEditor, decorative = false }: Partial<RouteView> & { decorative?: boolean }) {
  const driverName = useDriverName()
  const map = useRef<MapView>(null)
  const { height } = useWindowDimensions()
  const [ready, setReady] = useState(false)
  const { road, visibleRoad, from, current, heading, routeKey } = route ?? {}
  const center = active ? (current ?? from) : null
  const routeCoordinates = (active ? visibleRoad : road?.geometry)?.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }))
  useEffect(() => {
    if (!ready || (active && !following)) return
    if (center) map.current?.animateCamera({
      center, zoom: navigationZoom, pitch: navigationPitch, heading: heading ?? 0,
    }, { duration: 280 })
    else if (passengerCenter) map.current?.animateCamera({ center: passengerCenter, zoom: 15 }, { duration: 450 })
    else if (a && b) map.current?.fitToCoordinates([a, b], { edgePadding: { top: 120, right: 48, bottom: 190, left: 48 } })
  }, [ready, routeKey, center, heading, height, following, passengerCenter])

  return <>
  <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={initialRegion} customMapStyle={previewPalette}
    userInterfaceStyle="light" onMapReady={() => setReady(true)}
    scrollEnabled={!decorative} zoomEnabled={!decorative} rotateEnabled={!decorative} pitchEnabled={!decorative}
    showsBuildings={false} showsIndoorLevelPicker={false} showsIndoors={false} toolbarEnabled={false}
    mapPadding={active ? navigationPadding(height) : undefined}
    onPanDrag={() => { if (active && following) onExplore?.() }}
    onRegionChangeStart={(_, details) => { if (active && following && details?.isGesture) onExplore?.() }}>
    {routeCoordinates && <>
      <Polyline coordinates={routeCoordinates} strokeColor="#51329a" strokeWidth={8} zIndex={1} />
      <Polyline coordinates={routeCoordinates} strokeColor="#9763f1" strokeWidth={5} zIndex={2} />
    </>}
    {!active && !decorative && !routeEditor && road && <PreviewRouteHighlight road={road.geometry} />}
    {a && <Marker coordinate={a} title="Ponto A"><Text style={styles.pin}>A</Text></Marker>}
    {b && <Marker coordinate={b} title="Ponto B"><Text style={styles.pin}>B</Text></Marker>}
    {demand.map(stop => <Marker key={'stop-' + stop.id} coordinate={stop} title={stop.name}>
      <StopMarker count={stop.count} />
    </Marker>)}
    {waitingStop && <Marker coordinate={waitingStop} title={waitingStop.name}><StopMarker count={1} /></Marker>}
    {drivers.map(driver => <Marker key={driver.id} coordinate={driver} anchor={{ x: .5, y: .5 }} onPress={() => driverName.show(driver.id)}>
      <View style={styles.driverMarker}>
      {driverName.selected === driver.id && !!driver.firstName && <Text style={styles.driverName} numberOfLines={1}>{driver.firstName}</Text>}
          <DriverMarker nearby motorcycle={driver.type === 'motorcycle'} carColor={driver.carColor} />
        {driver.arrivalSeconds !== undefined && <Text style={styles.arrival}>{Math.max(1, Math.ceil(driver.arrivalSeconds / 60))} min</Text>}
      </View>
    </Marker>)}
    {active && current && <Marker coordinate={current} title="Seu veículo" anchor={{ x: .5, y: .5 }}>
      <DriverMarker motorcycle={active.vehicle.type === 'motorcycle'} carColor={carColor} />
    </Marker>}
  </MapView>
    {drawPoint && <MapPencil key={drawRevision} onPoint={drawPoint} locate={async (x, y) =>
      map.current?.coordinateForPoint({ x, y })} />}
  </>
}

const styles = StyleSheet.create({
  driverName: { maxWidth: 120, color: '#164338', fontWeight: '800', fontSize: 12,
    paddingHorizontal: 7, paddingVertical: 3, marginBottom: 2, borderRadius: 8, backgroundColor: '#fff' },
  driverMarker: { alignItems: 'center' },
  arrival: { fontSize: 11, fontWeight: '800', color: '#0b5a48', backgroundColor: '#fff', padding: 3, borderRadius: 4 },
  pin: { backgroundColor: '#0b5a48', color: 'white', textAlign: 'center', width: 26, height: 26, lineHeight: 26, borderRadius: 13, overflow: 'hidden', fontWeight: '800' },
})
