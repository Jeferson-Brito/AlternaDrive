import { useEffect, useState, type FormEvent, type PointerEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const periods = {
  week: 'Semana', month: 'Mês', bimester: 'Bimestre', quarter: 'Trimestre',
  semester: 'Semestre', year: 'Ano', custom: 'Personalizado',
}
type Period = keyof typeof periods
type Payment = { label: string; time: string; amount: number; liters: number | null }
type DailyReport = {
  date: string; profit: number | null; passengers: number; revenue: number; fuel: number; expenses: number;
  refills: number; distance: number; unpricedDistance: number; journeys: number; emptyLegs: number;
  emptyLoss: number; unpricedEmptyLegs: number; expenseItems: Payment[]; refillItems: Payment[];
}
type Series = { start: string; end: string; today: string; points: DailyReport[] }
const formatMoney = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const shortDate = (value: string) => value.slice(8, 10) + '/' + value.slice(5, 7)
const fullDate = (value: string) => shortDate(value) + '/' + value.slice(0, 4)
const money = (value: number) => formatMoney.format(value / 100)

const decimal = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

function PaymentList({ title, payments, total, empty }: { title: string; payments: Payment[]; total: number; empty: string }) {
  return <section className="daily-payments">
    <header><h4>{title}</h4><strong>{money(total)}</strong></header>
    {payments.length ? <ul className="records">{payments.map((payment, index) => <li key={index}>
      <div><strong>{payment.label}</strong><small>{payment.time}</small></div>
      <strong>{money(payment.amount)}</strong>
    </li>)}</ul> : <p className="muted">{empty}</p>}
  </section>
}

function SelectedDayReport({ day }: { day: DailyReport }) {
  return <section className="daily-profit-report" aria-label={'Relatório de ' + fullDate(day.date)}>
    <header>
      <h3>Relatório do dia</h3><time dateTime={day.date}>{fullDate(day.date)}</time>
    </header>
    <dl className="daily-report-metrics">
      <div><dt>Embarques</dt><dd>{day.passengers}</dd></div>
      <div><dt>Jornadas encerradas</dt><dd>{day.journeys}</dd></div>
      <div><dt>Distância registrada</dt><dd>{decimal(day.distance)} km</dd></div>
    </dl>
    <dl className="details daily-report-balances">
      <div><dt>Faturamento bruto</dt><dd>{money(day.revenue)}</dd></div>
      <div><dt>Combustível consumido (estimado)</dt><dd>{day.unpricedDistance > 0 ? 'Pendente' : money(day.fuel)}</dd></div>
      <div><dt>Outras despesas</dt><dd>{money(day.expenses)}</dd></div>
      <div><dt>Lucro líquido estimado</dt><dd>{day.profit === null ? 'Pendente' : money(day.profit)}</dd></div>
    </dl>
    {day.unpricedDistance > 0 && <p className="muted">Falta o preço de combustível para estimar o custo de {decimal(day.unpricedDistance)} km.</p>}
    {day.emptyLegs > 0 && <p className="muted">Trechos vazios confirmados: {day.emptyLegs} · {money(day.emptyLoss)} em combustível estimado
      {day.unpricedEmptyLegs > 0 && ' · ' + day.unpricedEmptyLegs + ' com custo pendente'}. O valor faz parte do custo de combustível.</p>}
    <PaymentList title="Despesas registradas" payments={day.expenseItems} total={day.expenses} empty="Nenhuma despesa registrada." />
    <PaymentList title="Abastecimentos pagos" payments={day.refillItems} total={day.refills} empty="Nenhum abastecimento registrado." />
  </section>
}
const axisMoney = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const chartWidth = 400
const plotLeft = 62
const plotRight = 389

function ProfitChart({ series }: { series: Series }) {
  const [index, setIndex] = useState(series.points.length - 1)
  const { points } = series
  const values = points.flatMap(point => point.profit === null ? [] : [point.profit])
  const total = values.reduce((sum, profit) => sum + profit, 0)
  const pending = points.length - values.length
  const low = Math.min(0, ...values)
  const high = Math.max(0, ...values)
  const padding = Math.max(50, (high - low) * .085)
  const min = low - padding
  const max = high + padding
  const x = (i: number) => points.length === 1 ? (plotLeft + plotRight) / 2 :
    plotLeft + i * (plotRight - plotLeft) / (points.length - 1)
  const y = (value: number) => 12 + (max - value) * 144 / (max - min)
  const active = points[index]
  const path = points.map(({ profit }, i) => profit === null ? ''
    : (i === 0 || points[i - 1].profit === null ? 'M' : 'L') + x(i) + ',' + y(profit)).join(' ')
  const xTicks = [...new Set([0, Math.floor((points.length - 1) / 3), Math.floor((points.length - 1) * 2 / 3), points.length - 1])]
  const yTicks = [0, ...[high, low].filter(value => Math.abs(y(value) - y(0)) >= 18)]
  const dotSize = points.length <= 31 ? 3.5 : points.length <= 100 ? 2.4 : 1.4

  function selectDay(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const cursor = (event.clientX - rect.left) * chartWidth / rect.width
    const day = Math.round((cursor - plotLeft) * (points.length - 1) / (plotRight - plotLeft))
    setIndex(Math.max(0, Math.min(points.length - 1, day)))
  }

  return <>
    <div className="profit-chart-overview">
      <div>
        <span>{pending ? 'Lucro apurado até agora' : 'Lucro estimado no período'}</span>
        <strong>{values.length ? money(total) : 'Pendente'}</strong>
      </div>
      <small>{fullDate(series.start)} a {fullDate(series.end)}</small>
    </div>
    <div className="profit-chart-card">
      <div className="profit-chart-heading">
        <h3>Lucro diário</h3>
        <span>Toque no gráfico para escolher um dia</span>
      </div>
      <svg className="profit-chart" viewBox="0 0 400 185" role="img"
        aria-label="Gráfico em linha do lucro diário em reais" onPointerDown={selectDay}>
        {yTicks.map(value => <g key={value}>
          <line x1={plotLeft} x2={plotRight} y1={y(value)} y2={y(value)}
            stroke={value === 0 ? '#8aa99e' : '#d8e5df'} strokeDasharray={value === 0 ? '4 4' : undefined} />
          <text x={plotLeft - 7} y={y(value) + 4} textAnchor="end">R$ {axisMoney.format(value / 100)}</text>
        </g>)}
        <line x1={x(index)} x2={x(index)} y1="10" y2="156" stroke="#a0bfb4" />
        <path d={path} fill="none" stroke="#0b725b" strokeWidth="2.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {points.map(({ profit, date }, i) => profit !== null &&
          <circle key={date} cx={x(i)} cy={y(profit)} r={dotSize} fill="#0b725b" stroke="#fff"
            strokeWidth={points.length <= 31 ? 1 : 0} />)}
        {active.profit !== null && <circle cx={x(index)} cy={y(active.profit)} r="5.6" fill="#0b725b" stroke="#fff" strokeWidth="2" />}
        {xTicks.map(i => <text key={i} x={x(i)} y="177" textAnchor={points.length === 1 ? 'middle' :
          i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>{shortDate(points[i].date)}</text>)}
      </svg>
      <div className="profit-chart-selection">
        <button className="icon" aria-label="Dia anterior" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft size={20} /></button>
        <div aria-live="polite"><span>{fullDate(active.date)}</span>
          <strong>{active.profit === null ? 'Lucro pendente' : money(active.profit)}</strong></div>
        <button className="icon" aria-label="Próximo dia" disabled={index === points.length - 1} onClick={() => setIndex(index + 1)}><ChevronRight size={20} /></button>
      </div>
      {points.length > 1 && <label className="profit-chart-day"><span className="sr-only">Selecionar dia</span>
        <input type="range" min={0} max={points.length - 1} value={index}
          aria-valuetext={fullDate(active.date)} onChange={event => setIndex(Number(event.target.value))} />
      </label>}
    </div>
    <SelectedDayReport day={active} />
    {pending > 0 && <p className="profit-chart-note"><strong>{pending} {pending === 1 ? 'dia pendente' : 'dias pendentes'}.</strong> As lacunas indicam dias sem custo de combustível calculado.</p>}
  </>
}
export function ProfitDashboard() {
  const [period, setPeriod] = useState<Period>('month')
  const [dates, setDates] = useState({ start: '', end: '' })
  const [custom, setCustom] = useState<typeof dates | null>(null)
  const [series, setSeries] = useState<Series | null>(null)
  const [today, setToday] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (period === 'custom' && !custom) return
    const request = new AbortController()
    const query = new URLSearchParams({ period, ...(period === 'custom' && custom ? custom : {}) })
    setLoading(true)
    setError('')
    setSeries(null)
    void fetch('/api/reports/daily-profit?' + query, { signal: request.signal }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar o gráfico.')
      if (!request.signal.aborted) {
        setSeries(result)
        setToday(result.today)
        setDates(previous => ({
          start: previous.start || result.start, end: previous.end || result.end,
        }))
      }
    }).catch(error => {
      if (!request.signal.aborted) setError(error instanceof Error ? error.message : 'Não foi possível carregar o gráfico.')
    }).finally(() => { if (!request.signal.aborted) setLoading(false) })
    return () => request.abort()
  }, [period, custom])

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCustom({ ...dates })
  }

  const showing = period !== 'custom' || custom !== null
  return <section className="profit-dashboard">
    <label>Período<select value={period} onChange={event => {
      setSeries(null)
      setError('')
      setLoading(false)
      setPeriod(event.target.value as Period)
      setCustom(null)
    }}>
      {Object.entries(periods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    {period === 'custom' && <form onSubmit={filter}>
      <div className="columns">
        <label>De<input type="date" max={dates.end || today || undefined} required value={dates.start}
          onChange={event => setDates({ ...dates, start: event.target.value })} /></label>
        <label>Até<input type="date" min={dates.start || undefined} max={today || undefined} required value={dates.end}
          onChange={event => setDates({ ...dates, end: event.target.value })} /></label>
      </div>
      <button className="primary">Aplicar filtro</button>
    </form>}
    {showing && loading && <p role="status">Carregando o gráfico…</p>}
    {showing && error && <p className="error" role="alert">{error}</p>}
    {showing && series && <ProfitChart key={series.start + series.end} series={series} />}
  </section>
}
