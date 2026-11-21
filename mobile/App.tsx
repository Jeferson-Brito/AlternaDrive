import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AppState, Image, Modal, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import { StatusBar } from 'expo-status-bar'
import { api, ApiError, authenticate, clearSession, readSession } from './src/api'
import { Address, Button, Field, ui } from './src/controls'
import { JourneyMap } from './src/JourneyMap'
import { type Closing, type Dashboard, type Place, money, numeric } from './src/model'
import { onArrival, recordForegroundLocation, startTracking, stopTracking } from './src/tracking'
import { workDuration } from '../src/journey-time'

type Panel = 'menu' | 'route' | 'vehicle' | 'start' | 'group' | 'finish' | 'fuel' | 'expense'
const titles: Record<Panel, string> = {
  menu: 'Menu', route: 'Percurso e tarifa', vehicle: 'Cadastrar veículo', start: 'Iniciar jornada',
  group: 'Registrar grupo', finish: 'Finalizar jornada', fuel: 'Abastecimento', expense: 'Registrar despesa',
}

function Brand() {
  return <View style={styles.brandRow}>
    <Image accessibilityIgnoresInvertColors source={require('./assets/alternadrive.png')} style={styles.brandIcon} />
    <Text style={styles.brand}>AlternaDrive</Text>
  </View>
}

function Operation() {
  const [token, setToken] = useState<string | null>(null)
  const [data, setData] = useState<Dashboard | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const gate = useRef(false)
  const [register, setRegister] = useState(false)
  const [visiblePassword, setVisiblePassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [panel, setPanel] = useState<Panel | null>(null)
  const [period, setPeriod] = useState('month')
  const [hide, setHide] = useState(false)
  const [position, setPosition] = useState<Location.LocationObject | null>(null)
  const [gpsStatus, setGpsStatus] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const [third, setThird] = useState('')
  const [motorcycle, setMotorcycle] = useState(false)
  const [fuel, setFuel] = useState('Gasolina')
  const [pointA, setPointA] = useState<Place | null>(null)
  const [pointB, setPointB] = useState<Place | null>(null)
  const [useCurrent, setUseCurrent] = useState(false)

  const reload = useCallback(async (session: string) => {
    try {
      const dashboard = await api<Dashboard>('dashboard', undefined, session)
      setData(dashboard)
      return dashboard
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) {
        await stopTracking().catch(() => undefined)
        await clearSession()
        setToken(null)
        setData(null)
      }
      throw failure
    }
  }, [])

  async function run(action: () => Promise<void>) {
    if (gate.current) return
    gate.current = true
    setError('')
    setBusy(true)
    try { await action() }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Tente novamente.') }
    finally { setBusy(false); gate.current = false }
  }

  useEffect(() => {
    void readSession().then(async saved => {
      setToken(saved)
      if (saved) await reload(saved)
    }).catch(failure => setError(failure.message)).finally(() => setReady(true))
  }, [reload])

  useEffect(() => {
    if (!token) return
    const refresh = () => { void reload(token).catch(() => undefined) }
    const remove = onArrival(refresh)
    const resume = AppState.addEventListener('change', value => { if (value === 'active') refresh() })
    return () => { remove(); resume.remove() }
  }, [token, reload])

  const active = data?.active
  const activeId = active?.id
  useEffect(() => {
    if (!activeId) { setPosition(null); return }
    let watcher: Location.LocationSubscription | undefined
    let cancelled = false
    void Location.getForegroundPermissionsAsync().then(async permission => {
      if (!permission.granted || cancelled) return
      watcher = await Location.watchPositionAsync({
        accuracy: Location.Accuracy.High, distanceInterval: 8, timeInterval: 3000,
      }, location => {
        if (cancelled) return
        setPosition(location)
        recordForegroundLocation(location)
      })
      if (cancelled) watcher.remove()
    }).catch(() => { if (!cancelled) setGpsStatus('GPS indisponível.') })
    return () => { cancelled = true; watcher?.remove() }
  }, [activeId, gpsStatus])

  async function enableTracking(journey: NonNullable<Dashboard['active']>) {
    try {
      const background = await startTracking(journey)
      setGpsStatus(background ? 'GPS em segundo plano ativo' : 'Permita a localização em segundo plano para acompanhar com a tela bloqueada.')
    } catch {
      setGpsStatus('GPS em segundo plano indisponível. Você pode tentar ativá-lo novamente.')
    }
  }

  function show(next: Panel | null) {
    setPanel(next)
    setError('')
    setFirst(next === 'route' && data?.defaults.defaultFare ? (data.defaults.defaultFare / 100).toFixed(2) : '')
    setSecond('')
    setThird('')
    setUseCurrent(false)
    if (next === 'route' && data) {
      const defaults = data.defaults
      setPointA(defaults.defaultPointA && defaults.defaultOrigin ? { ...defaults.defaultPointA, label: defaults.defaultOrigin } : null)
      setPointB(defaults.defaultPointB && defaults.defaultDestination ? { ...defaults.defaultPointB, label: defaults.defaultDestination } : null)
    }
    if (next === 'start' || next === 'fuel') setVehicleId(active?.vehicleId ?? data?.vehicles[0]?.id ?? '')
  }

  async function save(path: string, body: object) {
    if (!token) return
    await api(path, body, token)
    show(null)
    await reload(token)
  }

  async function begin() {
    if (!token) return
    let currentLocation
    if (useCurrent) {
      if (!(await Location.requestForegroundPermissionsAsync()).granted) throw new Error('Autorize o GPS para usar a localização atual.')
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      currentLocation = { latitude: coords.latitude, longitude: coords.longitude, address: 'Localização atual' }
    }
    await api('journeys', { vehicleId, startKm: numeric(first), currentLocation }, token)
    show(null)
    const dashboard = await reload(token)
    if (dashboard.active) await enableTracking(dashboard.active)
  }

  async function finish() {
    if (!active || !token) return
    const { closing } = await api<{ closing: Closing }>('journeys/' + active.id + '/finish', { km: numeric(first) }, token)
    await stopTracking().catch(() => undefined)
    setData(previous => previous ? { ...previous, active: null } : previous)
    setGpsStatus('')
    show(null)
    Alert.alert('Jornada finalizada', [
      workDuration(closing.startedAt, closing.endedAt), closing.distance.toLocaleString('pt-BR') + ' km',
      'Receita ' + (hide ? '••••' : money(closing.revenue)), 'Lucro estimado ' + (hide ? '••••' : money(closing.profit)),
    ].join('\n'))
    await reload(token)
  }

  const secureError = !!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
  if (!ready || !token || !data) return <SafeAreaView style={styles.login}>
    <ScrollView contentContainerStyle={styles.loginBody} keyboardShouldPersistTaps="handled">
      <Brand />
      <Text style={styles.title}>{!ready ? 'Carregando…' : token ? 'Conectando à sua conta' : register ? 'Criar conta' : 'Entre na sua conta'}</Text>
      {secureError}
      {ready && (token ? <Button title="Tentar novamente" disabled={busy} onPress={() => void run(async () => { await reload(token) })} /> : <>
        {register && <Field label="Nome" value={name} onChangeText={setName} />}
        <Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry={!visiblePassword} autoCapitalize="none" />
        <Button title={visiblePassword ? 'Ocultar senha' : 'Mostrar senha'} onPress={() => setVisiblePassword(!visiblePassword)} secondary />
        <Button title={register ? 'Cadastrar' : 'Entrar'} disabled={busy} onPress={() => void run(async () => {
          const session = await authenticate(register ? 'register' : 'login', register ? { email, password, name } : { email, password })
          setPassword('')
          setToken(session)
          await reload(session)
        })} />
        <Button secondary title={register ? 'Já tenho conta' : 'Criar conta'} onPress={() => { setRegister(!register); setError('') }} />
      </>)}
    </ScrollView>
  </SafeAreaView>

  const stats = data.summaries.find(item => item.period === (active ? 'day' : period))
  const destination = active ? (active.arrivals % 2 ? active.origin : active.destination) : data.defaults.defaultDestination
  const vehicles = data.vehicles.map(vehicle => <Button key={vehicle.id} secondary={vehicle.id !== vehicleId}
    title={vehicle.name} onPress={() => setVehicleId(vehicle.id)} />)
  const submit = (title: string, action: () => Promise<void>, invalid = false) =>
    <Button title={busy ? 'Aguarde…' : title} disabled={busy || invalid} onPress={() => void run(action)} />
  const decimal = { keyboardType: 'decimal-pad' as const }
  const cents = (input: string) => Math.round(numeric(input) * 100)
  const minPrice = (input: string) => numeric(input) > 0

  return <View style={styles.root}>
    <JourneyMap a={active?.pointA ?? data.defaults.defaultPointA} b={active?.pointB ?? data.defaults.defaultPointB}
      position={position} token={token} active={active ?? null} />
    <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
      <View style={styles.stack} pointerEvents="box-none">
        {!active && <View style={styles.cardRow}><Brand />
          <Button secondary title="Menu" onPress={() => show('menu')} /></View>}
        <View style={styles.stats}>
          <Text style={styles.stat}>Embarques{'\n'}{stats?.passengers ?? 0}</Text>
          <Text style={styles.stat}>Receita{'\n'}{hide ? '••••' : money(stats?.revenue ?? 0)}</Text>
          <Text style={styles.stat}>Lucro est.{'\n'}{hide ? '••••' : money(stats?.profit ?? null)}</Text>
          <Button secondary title={hide ? 'Exibir' : 'Ocultar'} onPress={() => setHide(!hide)} />
        </View>
      </View>
      <View style={styles.card}>
        {!!error && !panel && secureError}
        {!active && <View style={styles.row}><Button title="Hoje" secondary={period !== 'day'} onPress={() => setPeriod('day')} />
          <Button title="Mês" secondary={period !== 'month'} onPress={() => setPeriod('month')} /></View>}
        <Text style={styles.label}>{active ? 'Próximo destino · Ponto ' + (active.arrivals % 2 ? 'A' : 'B') : 'Percurso habitual'}</Text>
        <Text numberOfLines={1} style={ui.muted}>{destination ?? 'Configure os pontos A e B para começar.'}</Text>
        {active ? <>
          {!!gpsStatus && <Text style={ui.muted}>{gpsStatus}</Text>}
          {submit('＋ Passageiro  ' + money(active.fare), async () => {
            await api('journeys/' + active.id + '/boardings', { count: 1 }, token)
            await reload(token)
          })}
          <View style={styles.actionRow}>
            {active.vehicle.type !== 'motorcycle' && <Button secondary title="Grupo" onPress={() => show('group')} />}
            <Button secondary title="Abastecer" onPress={() => show('fuel')} />
            <Button secondary title="Finalizar" onPress={() => show('finish')} />
          </View>
          {gpsStatus !== 'GPS em segundo plano ativo' && <Button secondary title="Ativar GPS em segundo plano"
            disabled={busy} onPress={() => void run(() => enableTracking(active))} />}
        </> : <Button title="Iniciar jornada" onPress={() => show(!data.vehicles.length ? 'vehicle' : !data.defaults.defaultPointA ? 'route' : 'start')} />}
      </View>
    </SafeAreaView>

    <Modal visible={panel !== null} transparent animationType="slide" onRequestClose={() => { if (!busy) show(null) }}>
      <SafeAreaView style={styles.modalBase} edges={['bottom']}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}><Text style={styles.title}>{panel && titles[panel]}</Text><Button secondary title="Fechar" disabled={busy} onPress={() => show(null)} /></View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.stack} keyboardShouldPersistTaps="handled">
            {secureError}
            {panel === 'menu' && <>
              <Button secondary title="Percurso e tarifa" onPress={() => show('route')} />
              <Button secondary title="Cadastrar veículo" onPress={() => show('vehicle')} />
              {!!data.vehicles.length && <Button secondary title="Abastecimento" onPress={() => show('fuel')} />}
              <Button secondary title="Registrar despesa" onPress={() => show('expense')} />
              {submit('Sair', async () => {
                await api('logout', {}, token)
                await stopTracking().catch(() => undefined)
                await clearSession()
                show(null)
                setToken(null)
                setData(null)
              })}
            </>}
            {panel === 'route' && <>
              <Address label="Ponto A" value={pointA} onChange={setPointA} />
              <Address label="Ponto B" value={pointB} onChange={setPointB} />
              <Field label="Tarifa por passageiro (R$)" {...decimal} value={first} onChangeText={setFirst} />
              {submit('Salvar percurso', () => save('settings/journey', {
                defaultOrigin: pointA?.label, defaultDestination: pointB?.label,
                defaultPointA: pointA, defaultPointB: pointB, defaultFare: cents(first),
              }), !pointA || !pointB || !minPrice(first))}
            </>}
            {panel === 'vehicle' && <>
              <View style={styles.row}><Button title="Carro" secondary={motorcycle} onPress={() => setMotorcycle(false)} />
                <Button title="Moto" secondary={!motorcycle} onPress={() => setMotorcycle(true)} /></View>
              <Field label="Modelo do veículo" value={first} onChangeText={setFirst} />
              <View style={styles.actionRow}>{['Gasolina', 'Etanol', 'Diesel', 'GNV'].map(item => <Button key={item} title={item}
                secondary={fuel !== item} onPress={() => setFuel(item)} />)}</View>
              <Field label={'Consumo médio (km/' + (fuel === 'GNV' ? 'm³' : 'L') + ')'} {...decimal} value={second} onChangeText={setSecond} />
              {!motorcycle && <Field label="Lugares para passageiros" keyboardType="number-pad" value={third} onChangeText={setThird} />}
              {submit('Salvar veículo', () => save('vehicles', {
                name: first, type: motorcycle ? 'motorcycle' : 'car', fuel, tank: null,
                efficiency: numeric(second), capacity: motorcycle ? 1 : numeric(third),
              }), !first.trim() || !minPrice(second) || (!motorcycle && (!Number.isInteger(numeric(third)) || !minPrice(third))))}
            </>}
            {(panel === 'start' || panel === 'fuel') && <><Text style={styles.label}>Veículo</Text>{vehicles}</>}
            {panel === 'start' && <>
              <Field label="Hodômetro inicial (km)" keyboardType="number-pad" value={first} onChangeText={setFirst} />
              <Text style={ui.muted}>Informe a quilometragem total exibida no painel.</Text>
              <Button secondary={!useCurrent} title={useCurrent ? '✓ Usar localização atual' : 'Usar localização atual'} onPress={() => setUseCurrent(!useCurrent)} />
              {submit('Iniciar jornada', begin, !vehicleId || !Number.isInteger(numeric(first)))}
            </>}
            {panel === 'group' && <>
              <Field label="Número de passageiros" keyboardType="number-pad" value={first} onChangeText={setFirst} />
              {submit('Registrar grupo', () => save('journeys/' + active?.id + '/boardings', { count: numeric(first) }), !Number.isInteger(numeric(first)) || !minPrice(first))}
            </>}
            {panel === 'finish' && <>
              <Field label="Hodômetro final (km)" keyboardType="number-pad" value={first} onChangeText={setFirst} />
              {submit('Confirmar encerramento', finish, !Number.isInteger(numeric(first)) || numeric(first) < (active?.startKm ?? 0))}
            </>}
            {panel === 'fuel' && <>
              <Field label="Total pago (R$)" {...decimal} value={first} onChangeText={setFirst} />
              <Field label="Preço por litro ou m³ (R$)" {...decimal} value={second} onChangeText={setSecond} />
              {submit('Salvar abastecimento', () => save('entries', { kind: 'fuel', vehicleId, amount: cents(first), fuelUnitPrice: cents(second) }),
                !vehicleId || !minPrice(first) || !minPrice(second))}
            </>}
            {panel === 'expense' && <>
              <Field label="Nome da despesa" value={first} onChangeText={setFirst} />
              <Field label="Valor (R$)" {...decimal} value={second} onChangeText={setSecond} />
              {submit('Salvar despesa', () => save('entries', { kind: 'expense', label: first, amount: cents(second) }), !first.trim() || !minPrice(second))}
            </>}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  </View>
}

export default function App() {
  return <SafeAreaProvider><StatusBar style="dark" /><Operation /></SafeAreaProvider>
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#dbe9e2' },
  login: { flex: 1, backgroundColor: '#e7f1eb' },
  loginBody: { padding: 24, gap: 13, flexGrow: 1, justifyContent: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandIcon: { width: 34, height: 34, borderRadius: 9 },
  brand: { fontSize: 23, fontWeight: '900', color: '#0b5a48', letterSpacing: -.7 },
  title: { fontSize: 21, fontWeight: '800', color: '#142d24' },
  label: { color: '#142d24', fontWeight: '800' },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8 },
  card: { borderRadius: 19, padding: 12, gap: 7, backgroundColor: '#fff', elevation: 4 },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, backgroundColor: '#fff', padding: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, flexWrap: 'wrap' },
  stats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, gap: 4, borderRadius: 15, backgroundColor: '#13392e' },
  stat: { color: '#fff', fontSize: 12, fontWeight: '700' },
  stack: { gap: 9 },
  error: { color: '#8a2019', backgroundColor: '#fff0ef', padding: 9, borderRadius: 9 },
  modalBase: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#142f2963' },
  sheet: { maxHeight: '88%', backgroundColor: '#fff', padding: 15, borderTopLeftRadius: 22, borderTopRightRadius: 22, gap: 12 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  scroll: { flexGrow: 0 },
})
