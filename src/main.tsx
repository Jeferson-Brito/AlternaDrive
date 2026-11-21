import { StrictMode, useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, ChartNoAxesCombined, CarFront, ChevronDown, CircleAlert, Eye, EyeOff, Flag, Fuel, Gauge, History, LogOut, Menu, Navigation, Plus, Receipt, Route, Settings, Users, X } from 'lucide-react'
import { JourneyMap, type DriverPosition, type VehicleType } from './journey-map'
import { FuelStationField, fuelUnit, type StationPrice } from './fuel-stations'
import { AddressField, formatJourneyAddress, JourneyOrigin } from './addresses'
import { arrivalRadius, distanceMeters, isArrival, type Point } from './arrival'
import { travelBearing } from './route-geometry'
import { workDuration } from './journey-time'
import { VehicleModelField, type VehicleSpec } from './vehicle-catalog'
import { ProfitDashboard } from './profit-dashboard'
import { formatNumberDigits, parseNumber } from './localized-number'

type Vehicle = { id: string; name: string; efficiency: number; fuel: string; type: VehicleType; referenceFuelPrice?: number | null }
type Journey = {
  id: string; vehicleId: string; origin: string; destination: string; startedAt: string; endedAt: string | null;
  turnedAt: string | null; startKm: number; turnKm: number | null; endKm: number | null;
  pointA: Point | null; pointB: Point | null; arrivals: number;
  outboundFuelPrice: number;
  fare: number; vehicle: { name: string; type: VehicleType; referenceFuelPrice?: number | null }; boardings: { id: string; count: number; fare: number }[];
}
type Period = 'day' | 'week' | 'month'
type Summary = {
  period: Period; passengers: number; revenue: number; distance: number; fuel: number;
  expenses: number; refills: number; profit: number | null; target: number; unpricedDistance: number;
  emptyLegs: { from: string; to: string; arrivedAt: string; distanceKm: number | null; cost: number | null }[];
  emptyLoss: number;
  traffic: { hour: string; direction: string; passengers: number; empty: number; completed: number }[];
}
type Closing = {
  startedAt: string; endedAt: string; distance: number; passengers: number; revenue: number;
  fuel: number | null; otherExpenses: number; profit: number | null; perHour: number | null;
}
type Dashboard = {
  defaults: { defaultOrigin: string | null; defaultDestination: string | null; defaultFare: number | null; defaultPointA: Point | null; defaultPointB: Point | null };
  user: { name: string }; stationPrices: StationPrice[]; vehicles: Vehicle[]; active: Journey | null; history: Journey[];
  entries: { id: string; label: string; amount: number; liters: number | null; fuelUnitPrice: number | null; stationName: string | null; createdAt: string }[];
  summaries: Summary[];
  nextReportingDay: string;
  pendingLegs: { journeyId: string; index: number; motorcycle: boolean; from: string; to: string }[];
}
type Panel = 'menu' | 'settings' | 'journey-settings' | 'vehicle' | 'journey' | 'turn' | 'finish' | 'boarding' | 'fuel' | 'expense' | 'goal' | 'history' | 'finance' | 'profit' | 'fuel-reference' | 'dashboard'
const vehicleLabel = (type: VehicleType) => type === 'motorcycle' ? 'Moto' : 'Carro'
const financialPrivacyKey = 'alternadrive.hideFinancialValues'
const labels = { day: 'Hoje', week: 'Semana', month: 'Mês' }
const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
const date = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}
async function api<T = unknown>(path: string, body?: object): Promise<T> {
  const response = await fetch('/api/' + path, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('API indisponível.')
  const data = await response.json()
  if (!response.ok) throw new ApiError(data.error || 'Falha na solicitação.', response.status)
  return data
}
const message = (error: unknown) => error instanceof ApiError ? error.message : 'Servidor local indisponível. Verifique se o comando npm run dev está em execução e tente novamente.'

function Brand() {
  return <div className="brand"><img src="/alternadrive-logo.svg" alt="" width={34} height={34} />AlternaDrive</div>
}
function Field({ name, title, type = 'text', min, max, step, value, optional }: {
  name: string; title: string; type?: string; min?: number; max?: number; step?: number; value?: number; optional?: boolean;
}) {
  return <label>{title}<input name={name} type={type} min={min} max={max} step={step} defaultValue={value}
    required={!optional} maxLength={type === 'text' ? 100 : undefined} /></label>
}
function PasswordField({ register }: { register: boolean }) {
  const [visible, setVisible] = useState(false)
  return <div className="password">
    <label htmlFor="account-password">Senha</label>
    <div className="password-input">
      <input id="account-password" name="password" type={visible ? 'text' : 'password'}
        autoComplete={register ? 'new-password' : 'current-password'} minLength={8} maxLength={128}
        aria-describedby={register ? 'password-hint' : undefined} required />
      <button type="button" onClick={() => setVisible(value => !value)}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} aria-controls="account-password">
        {visible ? <EyeOff size={20} /> : <Eye size={20} />}
      </button>
    </div>
    {register && <small id="password-hint">Use pelo menos 8 caracteres.</small>}
  </div>
}

function NumberField({ name, title, min = .01, integer, value, optional, currency, kilometers }: {
  name: string; title: string; min?: number; integer?: boolean; value?: number; optional?: boolean;
  currency?: boolean; kilometers?: boolean;
}) {
  const id = useId()
  const masked = Boolean(currency || kilometers)
  const fractionDigits = integer || kilometers ? 0 : 2
  const format = (number: number) => number.toLocaleString('pt-BR', {
    minimumFractionDigits: currency ? 2 : 0, maximumFractionDigits: fractionDigits,
  })
  function validate(input: HTMLInputElement) {
    const number = parseNumber(input.value, fractionDigits)
    input.setCustomValidity(input.value === '' ? '' : !Number.isFinite(number)
      ? (integer ? 'Digite um número inteiro.' : 'Digite um número com até duas casas decimais, como 12,50.')
      : number < min ? 'Informe um valor a partir de ' + format(min) + '.' : '')
    return number
  }

  return <div className={kilometers ? 'numeric-field odometer-field' : 'numeric-field'}>
    <label htmlFor={id}>{kilometers && <Gauge size={18} aria-hidden="true" />} {title}</label>
    {kilometers && <small id={id + '-hint'}>Informe a quilometragem total que aparece no painel do veículo.</small>}
    <div className="numeric-input">
      {currency && <span aria-hidden="true">R$</span>}
      <input id={id} name={name} type="text" inputMode={masked || integer ? 'numeric' : 'decimal'}
        autoComplete="off" maxLength={32} defaultValue={value === undefined ? undefined : format(value)}
        placeholder={currency ? '0,00' : kilometers ? 'Ex.: 82.450' : undefined}
        aria-describedby={kilometers ? id + '-hint' : undefined} required={!optional}
        onChange={event => {
          const input = event.currentTarget
          if (masked) {
            const rightDigits = input.value.slice(input.selectionStart ?? input.value.length).replace(/\D/g, '').length
            input.value = formatNumberDigits(input.value, Boolean(currency))
            let cursor = input.value.length
            let remaining = rightDigits
            while (cursor > 0 && remaining > 0) {
              if (/\d/.test(input.value[--cursor])) remaining--
            }
            input.setSelectionRange(cursor, cursor)
          }
          validate(input)
        }}
        onKeyDown={event => {
          const input = event.currentTarget
          if (currency && event.key === 'Backspace' && input.value === '0,00' && input.selectionStart === input.value.length) {
            event.preventDefault()
            input.value = ''
            validate(input)
          }
        }}
        onPaste={event => {
          const text = event.clipboardData.getData('text')
          if (!currency || !/[,.]|R\$/i.test(text)) return
          const amount = parseNumber(text)
          if (!Number.isFinite(amount)) return
          event.preventDefault()
          event.currentTarget.value = format(amount)
          validate(event.currentTarget)
        }}
        onBlur={event => {
          const input = event.currentTarget
          const number = validate(input)
          if (input.validity.valid && Number.isFinite(number)) input.value = format(number)
        }} />
      {kilometers && <span aria-hidden="true">km</span>}
    </div>
  </div>
}

function OdometerField({ title, min }: { title: string; min: number }) {
  return <NumberField name="km" title={title} min={min} kilometers />
}
function VehicleFields() {
  const [type, setType] = useState<VehicleType>('car')
  const [spec, setSpec] = useState<VehicleSpec>()
  const [fuel, setFuel] = useState('Gasolina')
  const consumption = spec?.consumption?.[fuel]
  return <>
    <label>Tipo de veículo<select name="type" value={type} onChange={event => {
      setType(event.target.value as VehicleType)
      setSpec(undefined)
      setFuel('Gasolina')
    }}>
      <option value="car">Carro</option><option value="motorcycle">Moto</option>
    </select></label>
    <VehicleModelField key={type} type={type} onSelect={item => {
      setSpec(item)
      if (item?.fuel) setFuel(item.fuel)
      else if (item?.consumption && !item.consumption[fuel]) setFuel(Object.keys(item.consumption)[0])
    }} />
    <label>Combustível<select name="fuel" value={fuel} onChange={event => setFuel(event.target.value)}>
      {['Gasolina', 'Etanol', 'Diesel', 'GNV'].map(f => <option key={f}>{f}</option>)}
    </select></label>
    <NumberField key={(spec?.id ?? '') + (fuel === 'GNV' ? '-gnv' : '-liquid')} name="tank"
      title={'Capacidade do tanque (' + fuelUnit(fuel) + ')'} value={fuel === 'GNV' ? undefined : spec?.tank} optional />
    <div key={(spec?.id ?? '') + fuel} className="vehicle-consumption">
      <div className="columns">
        <NumberField name="cityEfficiency" title={'Cidade (km/' + fuelUnit(fuel) + ')'} value={consumption?.[0]} />
        <NumberField name="highwayEfficiency" title={'Estrada (km/' + fuelUnit(fuel) + ')'} value={consumption?.[1]} optional />
      </div>
      <label>Uso na jornada<select name="urbanShare" defaultValue="100">
        <option value="100">Cidade</option>
        <option value="75">Mais cidade · 75% da distância</option>
        <option value="50">Cidade e estrada · meio a meio</option>
        <option value="25">Mais estrada · 75% da distância</option>
        <option value="0">Estrada</option>
      </select></label>
      <small>O consumo estimado usa a quilometragem da jornada e o tipo de trajeto escolhido. Se deixar o consumo na estrada em branco, o app usa o da cidade.</small>
    </div>
    {type === 'car' ? <NumberField name="capacity" title="Lugares para passageiros" min={1} integer />
      : <small>Moto-táxi · um passageiro por embarque</small>}
  </>
}
function FuelReferenceFields({ vehicles, activeVehicle }: { vehicles: Vehicle[]; activeVehicle?: string }) {
  const [vehicleId, setVehicleId] = useState(activeVehicle ?? vehicles[0]?.id ?? '')
  const vehicle = vehicles.find(item => item.id === vehicleId)
  return <>
    <p className="muted">Use o preço que você pagou pelo combustível que já está no tanque. Quando houver um abastecimento registrado, o app usa o preço mais recente desse veículo.</p>
    <label>Veículo<select name="vehicleId" required value={vehicleId} onChange={event => setVehicleId(event.target.value)}>
      {vehicles.map(item => <option key={item.id} value={item.id}>{item.name} · {item.fuel}</option>)}
    </select></label>
    <NumberField key={vehicleId} currency name="price" title={'Preço de referência por ' + fuelUnit(vehicle?.fuel ?? '')}
      value={vehicle?.referenceFuelPrice ? vehicle.referenceFuelPrice / 100 : undefined} optional />
    <small>Deixe o valor em branco para remover a referência.</small>
  </>
}
function FuelFields({ vehicles, activeVehicle }: { vehicles: Vehicle[]; activeVehicle?: string }) {
  const [vehicleId, setVehicleId] = useState(activeVehicle ?? (vehicles.length === 1 ? vehicles[0].id : ''))
  const vehicle = vehicles.find(item => item.id === vehicleId)
  const unit = vehicle ? fuelUnit(vehicle.fuel) : 'L ou m³'
  return <>
    <label>Veículo<select name="vehicleId" required value={vehicleId} onChange={event => setVehicleId(event.target.value)}>
      <option value="" disabled>Selecione um veículo</option>
      {vehicles.map(item => <option key={item.id} value={item.id}>{item.name} · {vehicleLabel(item.type)} · {item.fuel}</option>)}
    </select></label>
    <FuelStationField />
    <NumberField currency name="amount" title="Total pago (R$)" />
    <NumberField currency name="fuelUnitPrice" title={`Preço por ${unit} (R$)`} />
  </>
}
function Modal({ title, children, close, journey, report }: { title: string; children: ReactNode; close: () => void; journey?: boolean; report?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className={report ? 'report-dialog' : journey ? 'journey-dialog' : undefined} onCancel={close} aria-labelledby="panel-title">
    <header className="dialog-header"><h2 id="panel-title">{title}</h2><button aria-label="Fechar" onClick={close}><X size={22} /></button></header>
    {report ? <div className="report-scroll" role="region" aria-labelledby="panel-title" tabIndex={0}>{children}</div> : children}
  </dialog>
}
function App() {
  const [data, setData] = useState<Dashboard | null>(null)
  const [ready, setReady] = useState(false)
  const [register, setRegister] = useState(false)
  const [hideValues, setHideValues] = useState(() => {
    try {
      return window.localStorage.getItem(financialPrivacyKey) === 'true'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(financialPrivacyKey, String(hideValues))
    } catch {
      // The button still works for the current page when storage is blocked.
    }
  }, [hideValues])
  const [expandedJourney, setExpandedJourney] = useState<string | null>(null)
  const panelDrag = useRef<{ y: number; moved: boolean } | null>(null)
  const [now, setNow] = useState(Date.now)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [estimateTarget, setEstimateTarget] = useState<HTMLDivElement | null>(null)
  const [maneuverTarget, setManeuverTarget] = useState<HTMLDivElement | null>(null)
  const [topOverlay, setTopOverlay] = useState<HTMLDivElement | null>(null)
  const [bottomOverlay, setBottomOverlay] = useState<HTMLDivElement | null>(null)
  const [followingVehicle, setFollowingVehicle] = useState(true)
  const [period, setPeriod] = useState<Period>('day')
  const [homePeriod, setHomePeriod] = useState<'day' | 'month'>('month')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [closing, setClosing] = useState<Closing | null>(null)
  const [undoOffer, setUndoOffer] = useState<string | null>(null)
  const [dismissedReview, setDismissedReview] = useState('')
  const [recordReview, setRecordReview] = useState(false)
  const legDistance = useRef<{ key: string; km: number } | null>(null)
  const rememberLegDistance = useCallback((key: string, km: number) => {
    legDistance.current = { key, km }
  }, [])
  const lock = useRef(false)

  const refresh = useCallback(async () => {
    try { setData(await api<Dashboard>('dashboard')) }
    catch (err) {
      if (err instanceof ApiError && err.status === 401) setData(null)
      else throw err
    } finally { setReady(true) }
  }, [])
  useEffect(() => { void refresh().catch(err => setError(message(err))) }, [refresh])
  const rollover = data?.nextReportingDay
  useEffect(() => {
    if (!rollover) return
    const midnight = Date.parse(rollover)
    let timer: number
    let disposed = false
    async function refreshAtMidnight() {
      try {
        await refresh()
      } catch {
        if (!disposed) timer = window.setTimeout(refreshAtMidnight, 15_000)
      }
    }
    timer = window.setTimeout(refreshAtMidnight, Math.max(0, midnight - Date.now()) + 50)
    return () => { disposed = true; window.clearTimeout(timer) }
  }, [rollover, refresh])
  const authenticated = Boolean(data)
  useEffect(() => {
    if (!authenticated) return
    let disposed = false
    async function refreshPrices() {
      if (document.hidden) return
      try {
        const prices = await api<StationPrice[]>('stations/prices')
        if (!disposed) setData(current => {
          if (!current || JSON.stringify(prices) === JSON.stringify(current.stationPrices)) return current
          return { ...current, stationPrices: prices }
        })
      } catch {
        // Keep the last prices visible when the network is unavailable.
      }
    }
    const interval = window.setInterval(refreshPrices, 60_000)
    window.addEventListener('focus', refreshPrices)
    return () => {
      disposed = true
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshPrices)
    }
  }, [authenticated])
  function show(next: Panel | null) { setPanel(next); setError(''); setNotice('') }
  async function save(path: string, body: object, feedback: string) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const result = await api<{ closing?: Closing; id?: string }>(path, body)
      setUndoOffer(path.endsWith('/boardings') ? result.id ?? null : null)
      if (result.closing) setClosing(result.closing)
      setPanel(null)
      if (path === 'logout') setData(null)
      setNotice(feedback)
      await refresh()
    } catch (err) { setError(message(err)) }
    finally { lock.current = false; setBusy(false) }
  }
  function form(event: FormEvent<HTMLFormElement>, handler: (f: FormData) => void) {
    event.preventDefault()
    handler(new FormData(event.currentTarget))
  }
  const active = data?.active
  const activeId = active?.id
  const lastBoarding = active?.boardings[0]
  function undoBoarding(boardingId = lastBoarding?.id) {
    if (active && boardingId) {
      void save('journeys/' + active.id + '/boardings/undo', { boardingId }, 'Último embarque desfeito.')
    }
  }
  const expanded = Boolean(activeId && expandedJourney === activeId)
  useEffect(() => {
    if (!activeId) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [activeId])
  const [driver, setDriver] = useState<{ journeyId: string; point: DriverPosition } | null>(null)
  const arrivalCount = active?.arrivals ?? 0
  const pointA = active?.pointA
  const pointB = active?.pointB
  const automatic = Boolean(pointA && pointB)
  const returning = automatic ? arrivalCount % 2 === 1 : Boolean(active?.turnedAt)
  const [gpsError, setGpsError] = useState('')
  const trace = useRef<{ key: string; points: Point[] } | null>(null)
  useEffect(() => {
    setGpsError('')
    if (!activeId) return
    if (!window.isSecureContext) {
      setGpsError('No celular, abra o site por HTTPS para ativar o GPS.')
      return
    }
    if (!navigator.geolocation) {
      setGpsError('GPS indisponível neste navegador.')
      return
    }
    let disposed = false
    let pending = false
    setGpsError('Aguardando localização do GPS…')
    const legKey = activeId + ':' + arrivalCount
    if (trace.current?.key !== legKey) trace.current = { key: legKey, points: [] }
    const samples = trace.current.points
    const watch = navigator.geolocation.watchPosition(async ({ coords, timestamp }) => {
      if (disposed) return
      const { latitude, longitude, accuracy } = coords
      const position = { latitude, longitude, accuracy }
      if (accuracy <= 100) setDriver(previous => {
        const prior = previous?.journeyId === activeId ? previous.point : undefined
        const heading = coords.heading !== null && Number.isFinite(coords.heading) ? coords.heading :
          prior && accuracy <= 45 && distanceMeters(prior, position) > Math.max(8, accuracy)
            ? travelBearing(prior, position) : prior?.heading
        const seconds = prior ? (timestamp - prior.timestamp) / 1000 : 0
        const displacement = prior && seconds >= 1 && seconds <= 15 ? distanceMeters(prior, position) : 0
        const observedSpeed = coords.speed ?? (displacement >= 6 ? displacement / seconds : undefined)
        const speed = accuracy <= 45 && observedSpeed !== undefined && observedSpeed >= 1 && observedSpeed <= 55
          ? prior?.speed === undefined ? observedSpeed : prior.speed * .8 + observedSpeed * .2
          : prior?.speed
        return { journeyId: activeId, point: { ...position, timestamp, heading, speed } }
      })
      const last = samples.at(-1)
      if (accuracy <= 50 && samples.length < 240 && (!last || distanceMeters(last, position) >= 100)) {
        samples.push({ latitude, longitude })
      }
      const arrivalAccuracy = pointA && pointB ? Math.min(50, arrivalRadius(pointA, pointB)) : 50
      setGpsError(accuracy > arrivalAccuracy ? 'GPS impreciso para confirmar chegada.' : '')
      if (pending || !pointA || !pointB || !isArrival(pointA, pointB, arrivalCount, position)) return
      pending = true
      try {
        await api<{ arrivals: number }>('journeys/' + activeId + '/arrival', {
          ...position, arrivals: arrivalCount, trace: samples,
          ...(legDistance.current?.key === legKey ? { routeKm: legDistance.current.km } : {}),
        })
        if (!disposed) await refresh()
      } catch {
        if (!disposed) setGpsError('Falha ao registrar a chegada. O GPS continuará tentando.')
      } finally {
        pending = false
      }
    }, error => {
      if (!disposed) setGpsError(error.code === 1
        ? 'Autorize a localização para mostrar sua posição no mapa e detectar chegadas.'
        : 'Aguardando sinal de GPS.')
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 })
    return () => { disposed = true; navigator.geolocation.clearWatch(watch) }
  }, [activeId, arrivalCount, pointA, pointB])
  const defaults = data?.defaults
  const vehicles = data?.vehicles ?? []
  const summary = data?.summaries.find(s => s.period === period)
  const indicatorPeriod = active ? 'day' : homePeriod
  const indicators = data?.summaries.find(s => s.period === indicatorPeriod)
  const goalSummary = summary?.target ? summary : data?.summaries.find(item => item.target > 0)
  const progress = goalSummary && goalSummary.profit !== null ? Math.max(0, Math.min(100, Math.floor(goalSummary.profit / goalSummary.target * 100))) : 0
  const remaining = goalSummary && goalSummary.profit !== null ? Math.max(0, goalSummary.target - goalSummary.profit) : 0
  const errors = error && <p className="error" role="alert">{error}</p>
  const titles: Record<Panel, string> = {
    menu: 'Minha operação', settings: 'Configurações', 'journey-settings': 'Percurso e tarifa', vehicle: 'Cadastrar veículo', journey: 'Iniciar jornada', turn: 'Iniciar volta',
    finish: 'Finalizar jornada', boarding: 'Registrar embarque', fuel: 'Registrar abastecimento', expense: 'Registrar despesa',
    goal: 'Definir meta líquida', history: 'Histórico de jornadas', finance: 'Resumo financeiro', dashboard: 'Lucro por dia', profit: 'Como o lucro é calculado', 'fuel-reference': 'Preço de referência do combustível',
  }
  function fields(children: ReactNode, submit: string, handler: (f: FormData) => void) {
    return <form onSubmit={e => form(e, handler)}>{children}{errors}<button className="primary" disabled={busy}>{busy ? 'Salvando…' : submit}</button></form>
  }
  function panelContent() {
    switch (panel) {
      case 'dashboard': return <ProfitDashboard />
      case 'menu': return <div className="menu-grid">
        <button onClick={() => show('dashboard')}><ChartNoAxesCombined /> Lucro por dia</button>
        <p>Conta de <strong>{data?.user.name}</strong></p>
        <button onClick={() => show('vehicle')}><CarFront /> Cadastrar veículo</button>
        <button onClick={() => show(vehicles.length ? 'fuel' : 'vehicle')}><Fuel /> Abastecimento</button>
        <button onClick={() => show('expense')}><Receipt /> Despesa</button>
        <button onClick={() => show('settings')}><Settings /> Configurações</button>
        <button onClick={() => show('history')}><History /> Histórico</button>
        <button disabled={busy} onClick={() => void save('logout', {}, '')}><LogOut /> Sair</button>
        {errors}
      </div>
      case 'settings': return <div className="menu-grid">
        <button onClick={() => show('fuel-reference')}><Fuel /> Preço de referência do combustível</button>
        <button onClick={() => show('journey-settings')}><Route /> Percurso e tarifa</button>
        <button onClick={() => show('goal')}><Flag /> Metas de lucro</button>
      </div>
      case 'fuel-reference': return vehicles.length ? fields(<FuelReferenceFields vehicles={vehicles} activeVehicle={active?.vehicleId} />,
        'Salvar referência', f => void save('vehicles/' + f.get('vehicleId') + '/fuel-reference', {
          price: f.get('price') ? toCents(f, 'price') : null,
        }, 'Preço de referência atualizado.'))
        : <div className="menu-grid"><p>Cadastre um veículo para informar o preço de referência.</p>
          <button onClick={() => show('vehicle')}><CarFront /> Cadastrar veículo</button></div>
      case 'profit': return indicators && <div className="menu-grid">
        <small>Período · {labels[indicatorPeriod]}</small>
        <dl className="details profit-breakdown">
          <div><dt>Receita das passagens</dt><dd>{money(indicators.revenue)}</dd></div>
          <div><dt>Combustível estimado</dt><dd>{indicators.unpricedDistance ? 'Pendente' : '− ' + money(indicators.fuel)}</dd></div>
          <div><dt>Outras despesas</dt><dd>− {money(indicators.expenses)}</dd></div>
          <div><dt>Lucro líquido estimado</dt><dd>{indicators.profit === null ? 'Pendente' : money(indicators.profit)}</dd></div>
        </dl>
        {(indicators.unpricedDistance > 0 || active?.outboundFuelPrice === 0) && <>
          <p className="muted">Falta um preço de combustível para calcular o custo. Cadastre um preço de referência ou registre um abastecimento.</p>
          <button onClick={() => show('fuel-reference')}><Fuel /> Informar preço de referência</button>
        </>}
        {active && <p className="muted">O combustível da jornada em andamento entra na conta ao finalizar, com a quilometragem percorrida.</p>}
      </div>
      case 'journey-settings': return fields(<>
        <AddressField name="origin" title="Ponto A · Origem habitual" initial={defaults?.defaultOrigin} initialPoint={defaults?.defaultPointA} />
        <AddressField name="destination" title="Ponto B · Destino habitual" initial={defaults?.defaultDestination} initialPoint={defaults?.defaultPointB} />
        <NumberField currency name="fare" title="Tarifa por passageiro (R$)" value={defaults?.defaultFare ? defaults.defaultFare / 100 : undefined} />
      </>, 'Salvar configurações', f => {
        const a = f.get('originPoint')
        const b = f.get('destinationPoint')
        if (typeof a !== 'string' || typeof b !== 'string') {
          setError('Selecione uma sugestão para cada endereço para marcar os pontos no GPS.')
          return
        }
        void save('settings/journey', {
          defaultOrigin: f.get('origin'), defaultDestination: f.get('destination'), defaultFare: toCents(f, 'fare'),
          defaultPointA: JSON.parse(a), defaultPointB: JSON.parse(b),
        }, 'Percurso e tarifa salvos.')
      })
      case 'vehicle': return fields(<VehicleFields />, 'Cadastrar veículo', f => void save('vehicles', {
        name: f.get('name'), type: f.get('type'), fuel: f.get('fuel'),
        tank: f.get('tank') ? parseNumber(f.get('tank')) : null,
        cityEfficiency: parseNumber(f.get('cityEfficiency')),
        ...(f.get('highwayEfficiency') ? { highwayEfficiency: parseNumber(f.get('highwayEfficiency')) } : {}),
        urbanShare: Number(f.get('urbanShare')),
        ...(f.get('catalogId') ? { catalogId: f.get('catalogId') } : {}),
        ...(f.has('capacity') ? { capacity: parseNumber(f.get('capacity')) } : {}),
      }, 'Veículo cadastrado.'))
      case 'journey': {
        if (!defaults?.defaultOrigin || !defaults.defaultDestination || !defaults.defaultFare || !defaults.defaultPointA || !defaults.defaultPointB) {
          return <div className="menu-grid">
            <p>Selecione os endereços dos pontos A e B e salve a tarifa nas configurações.</p>
            <button onClick={() => show('journey-settings')}><Settings /> Configurar percurso e tarifa</button>
          </div>
        }
        return <form className="journey-form" onSubmit={event => form(event, f => {
          const location = f.get('currentLocation')
          void save('journeys', {
            vehicleId: f.get('vehicleId'), startKm: parseNumber(f.get('km')),
            ...(typeof location === 'string' ? { currentLocation: JSON.parse(location) } : {}),
          }, 'Jornada iniciada.')
        })}>
          <div className="journey-form-body">
            <label className="journey-vehicle">
              <span>Veículo</span>
              <span className="journey-select">
                <CarFront size={20} aria-hidden="true" />
                <select name="vehicleId" required defaultValue={vehicles.length === 1 ? vehicles[0].id : ''}>
                  <option value="" disabled>Selecione um veículo</option>
                  {vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.name} · {vehicleLabel(vehicle.type)} · {vehicle.fuel}
                  </option>)}
                </select>
                <ChevronDown size={17} aria-hidden="true" />
              </span>
            </label>
            <section className="journey-route" aria-label="Percurso">
              <ol className="journey-stops">
                <li>
                  <span className="journey-stop-marker" aria-hidden="true">A</span>
                  <JourneyOrigin saved={defaults.defaultOrigin} />
                </li>
                <li>
                  <span className="journey-stop-marker destination-marker" aria-hidden="true">B</span>
                  <div><span className="journey-stop-label">Destino</span><strong>{formatJourneyAddress(defaults.defaultDestination)}</strong></div>
                </li>
              </ol>
              <div className="journey-fare"><span>Tarifa por passageiro</span><strong>{money(defaults.defaultFare)}</strong></div>
            </section>
            <OdometerField title="Hodômetro inicial (km)" min={0} />
            {errors}
          </div>
          <footer className="journey-form-footer">
            <button className="primary" disabled={busy}><Navigation size={19} aria-hidden="true" />
              {busy ? 'Iniciando…' : 'Iniciar jornada'}
            </button>
          </footer>
        </form>
      }
      case 'turn':
      case 'finish': {
        const turning = panel === 'turn'
        if (!active) return null
        return fields(<>
          {!turning && <p className="muted">Tempo trabalhado · {workDuration(active.startedAt, now)}</p>}
          <OdometerField title={turning ? 'Hodômetro ao chegar (km)' : 'Hodômetro final (km)'} min={active.turnKm ?? active.startKm} />
        </>, titles[panel], f => void save('journeys/' + active.id + '/' + panel, {
          km: parseNumber(f.get('km')),
        }, turning ? 'Volta iniciada.' : 'Jornada encerrada.'))
      }
      case 'boarding': return active && active.vehicle.type !== 'motorcycle' && fields(<>
        <NumberField name="count" title="Passageiros embarcados" min={1} integer value={1} />
        <small>{money(active.fare)} por passageiro</small>
      </>, 'Registrar embarque', f => void save('journeys/' + active.id + '/boardings', {
        count: parseNumber(f.get('count')),
      }, 'Embarque registrado.'))
      case 'fuel': return fields(<FuelFields vehicles={vehicles} activeVehicle={active?.vehicleId} />,
        'Registrar abastecimento', f => {
          const station = f.get('station')
          void save('entries', {
            kind: 'fuel', vehicleId: f.get('vehicleId'), fuelUnitPrice: toCents(f, 'fuelUnitPrice'), amount: toCents(f, 'amount'),
            ...(typeof station === 'string' ? { station: JSON.parse(station) } : {}),
          }, 'Abastecimento registrado.')
        })
      case 'expense': return fields(<>
        <p className="muted">Registre gastos como pedágio, estacionamento ou lavagem. Para combustível, use Abastecer.</p>
        <Field name="label" title="Com o que você gastou?" />
        <NumberField currency name="amount" title="Valor pago (R$)" />
      </>,
        'Registrar despesa', f => void save('entries', { kind: 'expense', label: f.get('label'), amount: toCents(f, 'amount') }, 'Despesa registrada. Consulte Outras despesas no Resumo financeiro.'))
      case 'goal': return fields(<><label>Período<select name="period" defaultValue={period}>
        <option value="day">Diária</option><option value="week">Semanal</option><option value="month">Mensal</option>
      </select></label><NumberField currency name="amount" title="Lucro desejado (R$)" /></>, 'Salvar meta', f => {
        setPeriod(f.get('period') as Period)
        void save('goals', { period: f.get('period'), amount: toCents(f, 'amount') }, 'Meta atualizada.')
      })
      case 'finance': return summary && <>
        <div className="periods">{Object.entries(labels).map(([key, label]) =>
          <button key={key} aria-pressed={period === key} onClick={() => setPeriod(key as Period)}>{label}</button>)}</div>
        <dl className="details">
          <div><dt>Receita dos embarques</dt><dd>{money(summary.revenue)}</dd></div>
          <div><dt>Distância registrada</dt><dd>{summary.distance.toLocaleString('pt-BR')} km</dd></div>
          <div><dt>Combustível consumido (estimativa)</dt><dd>{money(summary.fuel)}</dd></div>
          <div><dt>Outras despesas</dt><dd>{money(summary.expenses)}</dd></div>
          <div><dt>Lucro estimado</dt><dd>{summary.profit === null ? 'Pendente' : money(summary.profit)}</dd></div>
          <div><dt>Abastecimentos pagos</dt><dd>{money(summary.refills)}</dd></div>
        </dl>
        {summary.unpricedDistance > 0 && <p className="muted">O lucro fica pendente até registrar um abastecimento para o veículo sem preço de combustível.</p>}
        <details className="traffic-report">
          <summary>Embarques por horário e sentido</summary>
          {summary.traffic?.length ? <table>
            <thead><tr><th>Horário</th><th>Sentido</th><th>Embarques</th><th>Vazios</th></tr></thead>
            <tbody>{summary.traffic.map(row => <tr key={row.hour + row.direction}>
              <td>{row.hour}h</td><td>{row.direction === 'return' ? 'Volta' : 'Ida'}</td>
              <td>{row.passengers}</td><td>{row.completed ? row.empty + '/' + row.completed : '—'}</td>
            </tr>)}</tbody>
          </table> : <p className="muted">Sem embarques ou trechos concluídos neste período.</p>}
          <small>Vazios indica quantos dos trechos concluídos naquela hora foram confirmados sem passageiros.</small>
        </details>
        <h3>Prejuízo em trechos sem passageiros</h3>
        {summary.emptyLegs?.length ? <>
          <p className="muted">Combustível estimado · {money(summary.emptyLoss)}. Esse gasto faz parte do custo de combustível da jornada.</p>
          <ul className="records">{summary.emptyLegs.map((leg, index) => <li key={index}>
            <strong>{formatJourneyAddress(leg.from)} → {formatJourneyAddress(leg.to)}</strong>
            <small>{date(leg.arrivedAt)} · {leg.distanceKm === null ? 'Distância indisponível' : leg.distanceKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' km'}
              {' · '}{leg.cost === null ? 'Custo pendente' : money(leg.cost)}</small>
          </li>)}</ul>
        </> : <p className="muted">Nenhum trecho vazio confirmado neste período.</p>}
        <h3>Lançamentos recentes</h3>
        {data?.entries.length ? <ul className="records">{data.entries.map(e => <li key={e.id}><strong>{e.label} · {money(e.amount)}{e.stationName && (' · ' + e.stationName)}</strong>
          <small>{date(e.createdAt)}{e.liters !== null ? ' · ' + e.liters.toLocaleString('pt-BR') + ' L ou m³' : ''}</small></li>)}</ul> : <p className="muted">Nenhum lançamento.</p>}
      </>
      case 'history': return data?.history.length ? <ul className="records">{data.history.map(j => <li key={j.id}>
        <strong>{j.origin} → {j.destination}{!j.pointB && j.turnedAt && ' → ' + j.origin}</strong>
        <small>{date(j.startedAt)} · {j.vehicle.name}{j.endedAt && (' · ' + workDuration(j.startedAt, j.endedAt) + ' de trabalho')}{j.pointB && (' · ' + j.arrivals + ' chegadas')}</small>
        <small>{((j.endKm ?? j.startKm) - j.startKm).toLocaleString('pt-BR')} km · {j.boardings.reduce((n, b) => n + b.count, 0)} embarques · {money(j.boardings.reduce((n, b) => n + b.count * b.fare, 0))} de receita</small>
      </li>)}</ul> : <p className="muted">As jornadas encerradas aparecem aqui.</p>
      default: return null
    }
  }

  const visibilityLabel = hideValues ? 'Mostrar receita e lucro' : 'Ocultar receita e lucro'
  const revenueToggle = <button className="icon revenue-toggle" aria-label={visibilityLabel} title={visibilityLabel}
    onClick={() => setHideValues(value => !value)}>
    {hideValues ? <EyeOff size={21} /> : <Eye size={21} />}
  </button>
  const review = data?.pendingLegs?.[0]
  const reviewKey = review ? review.journeyId + ':' + review.index : ''
  function resolveReview(count: number) {
    if (!review) return
    void save('journeys/' + review.journeyId + '/legs/' + review.index + '/review', { count },
      count ? 'Embarque registrado no trecho concluído.' : 'Trecho sem passageiros registrado.')
    setRecordReview(false)
  }
  const stats = indicators && <div className={active ? 'stats driving-stats surface' : 'stats'} aria-label={active ? 'Indicadores de hoje' : 'Indicadores de ' + labels[indicatorPeriod]}>
    <div><span>Embarques</span><strong>{indicators.passengers}</strong></div>
    <div><span>Receita</span><strong>{hideValues ? '••••' : money(indicators.revenue)}</strong></div>
    <div><button className="profit-trigger" type="button" aria-label="Ver cálculo do lucro estimado" onClick={() => show('profit')}>
      <span>Lucro est.</span><strong>{hideValues ? '••••' : indicators.profit === null ? 'Pendente' : money(indicators.profit)}</strong>
    </button></div>
    {active && revenueToggle}
  </div>

  return <main className={active ? 'is-driving' : undefined}>
    <JourneyMap following={followingVehicle} setFollowing={setFollowingVehicle} maneuverTarget={maneuverTarget} onLegDistance={rememberLegDistance} now={now} topOverlay={topOverlay} bottomOverlay={bottomOverlay} vehicleType={active?.vehicle.type} estimateTarget={estimateTarget} stationPrices={data?.stationPrices} pointA={active ? pointA : defaults?.defaultPointA} pointB={active ? pointB : defaults?.defaultPointB} returning={returning} activeLeg={activeId ? activeId + ':' + arrivalCount : undefined}
      position={activeId && driver?.journeyId === activeId ? driver.point : undefined} />
    {!data || !summary ? <div className="auth surface">
      <Brand />
      <h1>{!ready ? 'Carregando…' : register ? 'Crie sua conta' : 'Entre na sua conta'}</h1>
      {ready && <form onSubmit={e => form(e, f => void save(register ? 'register' : 'login', Object.fromEntries(f), ''))}>
        {register && <Field name="name" title="Nome" />}
        <label>E-mail<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
        <PasswordField key={String(register)} register={register} />
        {errors}<button className="primary" disabled={busy}>{busy ? 'Aguarde…' : register ? 'Criar conta' : 'Entrar'}</button>
        <button type="button" className="text-button" onClick={() => { setRegister(!register); setError('') }}>
          {register ? 'Já tenho conta' : 'Criar uma conta'}</button>
      </form>}
    </div> : <>
      <div ref={setTopOverlay} className="top overlay">
        {!active && <div className="bar surface">
          <Brand />
          <div className="bar-actions">
            <button aria-label="Resumo financeiro" className="icon" onClick={() => show('finance')}><Activity size={21} /></button>
            <button className="icon" aria-label="Menu da operação" onClick={() => show('menu')}><Menu size={23} /></button>
          </div>
        </div>}
        {active && stats}
        {active && <div ref={setManeuverTarget} className="maneuver-slot" />}
        <div className="map-meta">
          {goalSummary && <details className="goal surface">
          <summary>
            <Flag size={15} aria-hidden="true" />
            <span>Meta líquida <span className="goal-period">· {labels[goalSummary.period]}</span></span>
            {!hideValues && <strong>{goalSummary.profit === null ? 'Pendente' : progress + '%'}</strong>}
            <ChevronDown size={14} className="goal-chevron" aria-hidden="true" />
          </summary>
          <div className="goal-body">
            <strong>{hideValues ? 'Meta de ' : (goalSummary.profit === null ? 'Lucro pendente' : money(goalSummary.profit)) + ' de '}{money(goalSummary.target)}</strong>
            {!hideValues && goalSummary.profit !== null && <progress max="100" value={progress} aria-label="Progresso da meta" />}
            {!hideValues && active && remaining > 0 &&
              <small>{Math.ceil(remaining / active.fare)} embarques à tarifa atual, sem custos adicionais</small>}
          </div>
          </details>}
        </div>
      </div>
      <div ref={setBottomOverlay} className="bottom overlay">
        {(!active || followingVehicle) && notice && <div className="notice">
          <span role="status">{notice}</span>
          <div className="notice-actions">
            {active && undoOffer && <button disabled={busy} onClick={() => undoBoarding(undoOffer)}>Desfazer</button>}
            <button aria-label="Dispensar aviso" onClick={() => setNotice('')}><X size={15} /></button>
          </div>
        </div>}
        {!panel && errors}
        {review && dismissedReview === reviewKey && <button className="notice" onClick={() => setDismissedReview('')}>
          Confirmar passageiros do trecho
        </button>}
        {active ? followingVehicle && <section className="operations driving-operations surface" data-expanded={expanded} aria-label="Operação">
          <button type="button" className="journey-drawer-toggle"
            aria-expanded={expanded} aria-controls="journey-extra-actions"
            onPointerDown={event => {
              panelDrag.current = { y: event.clientY, moved: false }
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerUp={event => {
              const drag = panelDrag.current
              if (!drag) return
              const change = event.clientY - drag.y
              if (Math.abs(change) < 28) return
              drag.moved = true
              setExpandedJourney(change < 0 ? active.id : null)
            }}
            onPointerCancel={() => { panelDrag.current = null }}
            onClick={() => {
              if (panelDrag.current?.moved) {
                panelDrag.current = null
                return
              }
              setExpandedJourney(expanded ? null : active.id)
            }}>
            <span className="journey-drawer-grip" aria-hidden="true" />
            <span className="journey-drawer-destination">
              <strong>{automatic ? (returning ? 'Próximo destino · Ponto A' : 'Próximo destino · Ponto B')
                : returning ? 'Volta em andamento' : 'Ida em andamento'}</strong>
              <small>{returning ? active.origin : active.destination}</small>
            </span>
            {!expanded && gpsError && <span className="journey-gps-indicator" title={gpsError}>
              <CircleAlert size={15} aria-hidden="true" /><span className="sr-only">{gpsError}</span>
            </span>}
            <ChevronDown size={20} className="journey-drawer-chevron" aria-hidden="true" />
            <span className="sr-only">{expanded ? 'Recolher ações' : 'Expandir ações'}</span>
          </button>
          <div ref={setEstimateTarget} className="route-estimate-slot" />
          <button className="primary passenger-action" disabled={busy} onClick={() => void save('journeys/' + active.id + '/boardings', { count: 1 }, 'Embarque registrado.')}>
            <Plus size={26} /><span>Passageiro</span><span className="passenger-fare">{money(active.fare)}</span>
          </button>
          <div id="journey-extra-actions" className="journey-extra-actions" hidden={!expanded}>
            {gpsError && <small role="status">{gpsError}</small>}
            {lastBoarding && <button className="text-button undo-boarding" disabled={busy} onClick={() => undoBoarding()}>Desfazer último embarque</button>}
            <div className="journey-work-time">
              <span><strong>Tempo trabalhado</strong><small>{workDuration(active.startedAt, now)}</small></span>
              <button className="icon" aria-label="Resumo financeiro" onClick={() => show('finance')}><Activity size={21} /></button>
            </div>
            <div className="shortcuts">
              {active.vehicle.type !== 'motorcycle' && <button onClick={() => show('boarding')}><Users size={22} /> Grupo</button>}
              <button onClick={() => show('fuel')}><Fuel size={22} /> Abastecer</button>
              <button onClick={() => show('expense')}><Receipt size={22} /> Despesa</button>
              {!automatic && !active.turnedAt && <button onClick={() => show('turn')}><Route size={22} /> Volta</button>}
              <button className="finish-action" onClick={() => show('finish')}><Flag size={22} /> Finalizar</button>
            </div>
          </div>
        </section> : <section className="operations surface" aria-label="Operação">
          <div className="trip"><span className="dot" /><strong>Sem jornada ativa</strong></div>
          <div className="home-indicators-period">
            <div className="periods" aria-label="Período dos indicadores">
              <button aria-pressed={homePeriod === 'day'} onClick={() => setHomePeriod('day')}>Hoje</button>
              <button aria-pressed={homePeriod === 'month'} onClick={() => setHomePeriod('month')}>Mês</button>
            </div>
            <button className="icon" aria-label="Abrir gráfico de lucro por dia" onClick={() => show('dashboard')}><ChartNoAxesCombined size={21} /></button>
          </div>
          {stats}
          <button className="primary start-action w-full" onClick={() => show(vehicles.length ? 'journey' : 'vehicle')}>
            {vehicles.length ? <Route size={22} /> : <CarFront size={22} />} {vehicles.length ? 'Iniciar jornada' : 'Cadastrar primeiro veículo'}
          </button>
        </section>}
      </div>
      {closing && <Modal title="Jornada finalizada" close={() => setClosing(null)}>
        <dl className="details">
          <div><dt>Tempo trabalhado</dt><dd>{workDuration(closing.startedAt, closing.endedAt)}</dd></div>
          <div><dt>Distância</dt><dd>{closing.distance.toLocaleString('pt-BR')} km</dd></div>
          <div><dt>Embarques</dt><dd>{closing.passengers}</dd></div>
          <div><dt>Receita</dt><dd>{money(closing.revenue)}</dd></div>
          <div><dt>Combustível estimado</dt><dd>{closing.fuel === null ? 'Pendente' : money(closing.fuel)}</dd></div>
          <div><dt>Outras despesas</dt><dd>{money(closing.otherExpenses)}</dd></div>
          <div><dt>Lucro líquido estimado</dt><dd>{closing.profit === null ? 'Pendente' : money(closing.profit)}</dd></div>
          <div><dt>Lucro por hora</dt><dd>{closing.perHour === null ? 'Pendente' : money(closing.perHour)}</dd></div>
        </dl>
        <button className="primary w-full" onClick={() => setClosing(null)}>Concluir</button>
      </Modal>}
      {!closing && !panel && review && reviewKey !== dismissedReview && <Modal key={reviewKey} title="Nenhum passageiro registrado"
        close={() => { setDismissedReview(reviewKey); setRecordReview(false) }}>
        <div className="leg-review">
          <div className="leg-review-route">
            <span><small>Origem</small><strong>{formatJourneyAddress(review.from)}</strong></span>
            <span><small>Destino</small><strong>{formatJourneyAddress(review.to)}</strong></span>
          </div>
          <p>Você levou algum passageiro nesse trecho?</p>
          {recordReview ? fields(<NumberField name="count" title="Passageiros embarcados" min={1} integer value={1} />,
            'Registrar passageiros', f => resolveReview(parseNumber(f.get('count'))))
            : <>
              <button className="primary" type="button" disabled={busy} onClick={() => review.motorcycle ? resolveReview(1) : setRecordReview(true)}><Users size={19} /> Registrar passageiros</button>
              <button className="leg-review-empty" type="button" disabled={busy} onClick={() => resolveReview(0)}>Não levei ninguém</button>
              {errors}
            </>}
        </div>
      </Modal>}
      {panel && <Modal title={titles[panel]} journey={panel === 'journey'} report={panel === 'dashboard'} close={() => show(null)}>{panelContent()}</Modal>}
    </>}
  </main>
}
const toCents = (form: FormData, key: string) => Math.round(parseNumber(form.get(key)) * 100)
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)









