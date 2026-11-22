import { useState } from 'react'
import { Alert, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from './type'
import { SafeAreaView } from 'react-native-safe-area-context'
import { distanceMeters } from '../../src/arrival'
import { api } from './api'
import { JourneyMap } from './AppMap'
import { Button, Field, ui } from './controls'
import { adjustToStreets } from './adjust-route'
import { coords, useRoadRoute } from './road-route'
import type { Point } from './model'

type Driver = { id: string; name: string; email: string; suspended: boolean; isAdmin: boolean }
type DriverPage = { drivers: Driver[]; next: string | null }
type SavedRoute = { id: string; name: string; points: Point[] }
const city = { latitude: -7.132, longitude: -34.871 }

export function Admin({ token, center = city, close }: { token: string; center?: Point; close: () => void }) {
  const [section, setSection] = useState<'home' | 'routes' | 'draw' | 'drivers' | 'edit'>('home')
  const [drivers, setDrivers] = useState<DriverPage>()
  const [routes, setRoutes] = useState<SavedRoute[]>([])
  const [editing, setEditing] = useState<Driver>()
  const [viewing, setViewing] = useState<SavedRoute>()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [sketch, setSketch] = useState<{ point: Point; stroke: symbol }[]>([])
  const [adjusted, setAdjusted] = useState<Point[]>()
  const [adjusting, setAdjusting] = useState(false)
  const [drawRevision, setDrawRevision] = useState(0)
  const [pencil, setPencil] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const emptyRoute = useRoadRoute({ a: null, b: null, active: null, position: null, token })

  async function run(action: () => Promise<void>) {
    if (busy) return
    setError('')
    setBusy(true)
    try { await action() }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Tente novamente.') }
    finally { setBusy(false) }
  }

  async function loadDrivers(cursor?: string) {
    const page = await api<DriverPage>('admin/drivers' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), undefined, token)
    setDrivers(current => cursor && current ? { ...page, drivers: [...current.drivers, ...page.drivers] } : page)
  }

  async function changeDriver(driver: Driver, patch: Partial<Driver>) {
    const updated = await api<Driver>('admin/drivers/' + driver.id, patch, token)
    setDrivers(current => current && { ...current, drivers: current.drivers.map(item => item.id === updated.id ? updated : item) })
  }

  async function loadRoutes() { setRoutes(await api<SavedRoute[]>('admin/routes', undefined, token)) }

  function back() {
    setError('')
    if (section === 'home') close()
    else if (section === 'edit') setSection('drivers')
    else if (section === 'draw') { setPencil(false); setSection('routes') }
    else setSection('home')
  }

  if (section === 'draw') {
    const points = viewing?.points ?? adjusted ?? sketch.map(({ point }) => point)
    const shape = points.length > 1 ? {
      geometry: { type: 'LineString' as const, coordinates: points.map(coords) }, distance: 0, duration: 0,
    } : undefined
    const end = points.length > 1 ? points[points.length - 1] : null
    const valid = end && distanceMeters(points[0], end) >= 60
    return <View style={styles.map}>
      <JourneyMap a={points[0] ?? null} b={end} active={null} drivers={[]} route={{ ...emptyRoute, road: shape }}
        following onExplore={() => undefined} passengerCenter={viewing?.points[0] ?? center} routeEditor
        drawRevision={drawRevision}
        drawPoint={pencil && !busy && !adjusted ? (point, stroke) => setSketch(current => {
          const last = current.at(-1)?.point
          if (last && distanceMeters(last, point) < 5) return current
          const retained = current.length < 300 ? current : current.filter((sample, index) =>
            index % 2 === 0 || sample.stroke !== current[index - 1]?.stroke)
          return [...retained.slice(0, 299), { point, stroke }]
        }) : undefined} />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.card}>
          {viewing ? <Text style={styles.title}>{viewing.name}</Text>
            : <Field label="Nome da rota" value={name} onChangeText={setName} maxLength={100} />}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {!viewing && <>
            <Text style={ui.muted}>{adjusted ? 'Confira a rota ajustada no mapa antes de publicar.'
              : pencil ? 'Arraste pelas ruas. Solte o dedo para encerrar cada trecho.'
              : 'Aproxime o mapa e ative o lápis para traçar a rota.'}</Text>
            <View style={styles.actions}>
              <Button disabled={busy || !!adjusted} title={pencil ? '✓ Lápis ativo' : '✎ Lápis'} secondary={!pencil} onPress={() => setPencil(value => !value)} />
              <Button title="Desfazer trecho" secondary disabled={busy || !!adjusted || !sketch.length} onPress={() => {
                setDrawRevision(revision => revision + 1)
                setSketch(current => current.filter(sample => sample.stroke !== current.at(-1)?.stroke))
              }} />
              <Button title="Limpar desenho" secondary disabled={busy || !points.length} onPress={() => { setPencil(false); setAdjusted(undefined); setSketch([]) }} />
            </View>
            {adjusted ? <Button title="Voltar ao desenho original" secondary disabled={busy} onPress={() => setAdjusted(undefined)} />
              : <Button title={adjusting ? 'Ajustando…' : 'Ajustar às ruas'} secondary disabled={busy || !valid} onPress={() => {
                setPencil(false)
                void run(async () => {
                  setAdjusting(true)
                  try { setAdjusted(await adjustToStreets(points)) }
                  finally { setAdjusting(false) }
                })
              }} />}
            <Button title={busy && !adjusting ? 'Salvando…' : 'Publicar rota'} disabled={busy || !valid || !name.trim()} onPress={() => {
              setPencil(false)
              void run(async () => {
                const saved = await api<SavedRoute>('admin/routes', { name: name.trim(), points }, token)
                setRoutes(current => [saved, ...current])
                setSection('routes')
              })
            }} />
          </>}
          <Button secondary title="Voltar" disabled={busy} onPress={back} />
        </View>
      </SafeAreaView>
    </View>
  }

  return <SafeAreaView style={styles.page}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{section === 'edit' ? 'Editar motorista' : section === 'drivers' ? 'Motoristas'
        : section === 'routes' ? 'Rotas habituais' : 'Administração'}</Text>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {section === 'home' && <>
        <Button title="Rotas habituais" onPress={() => { setSection('routes'); void run(loadRoutes) }} />
        <Button title="Motoristas" onPress={() => { setSection('drivers'); void run(() => loadDrivers()) }} />
      </>}
      {section === 'routes' && <>
        <Button title="Criar rota habitual" onPress={() => { setViewing(undefined); setName(''); setAdjusted(undefined); setSketch([]); setSection('draw') }} />
        {!routes.length && !busy && <Text style={ui.muted}>Nenhuma rota manual cadastrada.</Text>}
        {routes.map(route => <Button key={route.id} secondary title={route.name} onPress={() => {
          setViewing(route); setSection('draw')
        }} />)}
      </>}
      {section === 'drivers' && <>
        {drivers?.drivers.map(driver => <View style={styles.card} key={driver.id}>
          <Text style={ui.label}>{driver.name}</Text>
          <Text style={ui.muted}>{driver.email}</Text>
          <Text style={ui.muted}>{driver.isAdmin ? 'Administrador' : driver.suspended ? 'Suspenso' : 'Ativo'}</Text>
          {!driver.isAdmin && <View style={styles.actions}>
            <Button secondary title="Editar" disabled={busy} onPress={() => {
              setEditing(driver); setName(driver.name); setEmail(driver.email); setError(''); setSection('edit')
            }} />
            <Button secondary title={driver.suspended ? 'Reativar' : 'Suspender'} disabled={busy} onPress={() => {
              if (driver.suspended) void run(() => changeDriver(driver, { suspended: false }))
              else Alert.alert('Suspender motorista?', 'O acesso à conta será bloqueado até a reativação.', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Suspender', style: 'destructive', onPress: () => void run(() => changeDriver(driver, { suspended: true })) },
              ])
            }} />
          </View>}
        </View>)}
        {drivers?.next && <Button secondary title="Carregar mais" disabled={busy} onPress={() => void run(() => loadDrivers(drivers.next!))} />}
      </>}
      {section === 'edit' && editing && <>
        <Field label="Nome" value={name} maxLength={100} onChangeText={setName} />
        <Field label="E-mail" value={email} maxLength={254} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Button title="Salvar motorista" disabled={busy || !name.trim() || !email.trim()} onPress={() => void run(async () => {
          await changeDriver(editing, { name: name.trim(), email: email.trim() })
          setSection('drivers')
        })} />
      </>}
      {busy && <Text style={ui.muted}>Aguarde…</Text>}
      <Button secondary title="Voltar" disabled={busy} onPress={back} />
    </ScrollView>
  </SafeAreaView>
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f0f5f2' },
  content: { gap: 12, padding: 16 },
  title: { color: '#17362d', fontSize: 21, fontWeight: '800' },
  map: { flex: 1, backgroundColor: '#e9eae8' },
  overlay: { flex: 1, justifyContent: 'flex-end', padding: 12 },
  card: { gap: 8, padding: 12, borderRadius: 14, backgroundColor: '#fff' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: '#8a2019' },
})
