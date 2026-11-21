const dayMs = 86_400_000
export const periods = ['day', 'week', 'month'] as const

type FuelJourney = {
  startKm: number; turnKm: number | null; endKm: number | null;
  efficiency: number; outboundFuelPrice: number; returnFuelPrice: number | null;
  turnedAt: Date | null; endedAt: Date | null;
}
type Entry = { kind: string; amount: number; createdAt: Date }
type RevenueJourney = FuelJourney & { boardings: { count: number; fare: number; createdAt: Date }[] }

function fuelCharges(journey: FuelJourney) {
  const charges: { at: Date; km: number; cost: number | null }[] = []
  function add(at: Date, km: number, price: number) {
    charges.push({ at, km, cost: price > 0 || km === 0 ? Math.round(km / journey.efficiency * price) : null })
  }
  if (journey.turnedAt && journey.turnKm !== null) add(journey.turnedAt, journey.turnKm - journey.startKm, journey.outboundFuelPrice)
  if (journey.endedAt && journey.endKm !== null) add(journey.endedAt,
    journey.endKm - (journey.turnKm ?? journey.startKm), journey.returnFuelPrice ?? journey.outboundFuelPrice)
  return charges
}

export function summarize(
  journeys: (Omit<RevenueJourney, 'boardings'> & {
    origin: string; destination: string;
    completedLegs: { index: number; arrivedAt: Date; distanceKm: number | null; review: string }[];
    boardings: { count: number; fare: number; createdAt: Date; leg: string }[];
  })[],
  entries: Entry[],
  goals: { period: string; amount: number }[],
  now = new Date(),
  timeZone = process.env.APP_TIME_ZONE ?? 'America/Fortaleza',
) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const date = (value: Date) => formatter.format(value)
  const hour = new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', hourCycle: 'h23' })
  const today = date(now)
  const weekday = new Date(today).getUTCDay()
  const monday = new Date(Date.parse(today) - ((weekday + 6) % 7) * dayMs).toISOString().slice(0, 10)
  const starts = { day: today, week: monday, month: today.slice(0, 7) + '-01' }
  return periods.map(period => {
    const includes = (value: Date) => date(value) >= starts[period] && date(value) <= today
    let passengers = 0, revenue = 0, distance = 0, fuel = 0, expenses = 0, refills = 0, unpricedDistance = 0
    const emptyLegs = journeys.flatMap(journey => journey.completedLegs
      .filter(leg => leg.review === 'empty' && includes(leg.arrivedAt))
      .map(leg => ({
        arrivedAt: leg.arrivedAt, distanceKm: leg.distanceKm,
        from: leg.index % 2 ? journey.destination : journey.origin,
        to: leg.index % 2 ? journey.origin : journey.destination,
        cost: leg.distanceKm !== null && journey.outboundFuelPrice > 0
          ? Math.round(leg.distanceKm / journey.efficiency * journey.outboundFuelPrice) : null,
      })))
    const emptyLoss = emptyLegs.reduce((sum, leg) => sum + (leg.cost ?? 0), 0)
    const traffic = new Map<string, { hour: string; direction: string; passengers: number; empty: number; completed: number }>()
    function bucket(at: Date, direction: string) {
      const hourLabel = hour.format(at)
      const key = hourLabel + ':' + direction
      const row = traffic.get(key) ?? { hour: hourLabel, direction, passengers: 0, empty: 0, completed: 0 }
      traffic.set(key, row)
      return row
    }
    for (const journey of journeys) {
      for (const leg of journey.completedLegs.filter(leg => includes(leg.arrivedAt))) {
        const row = bucket(leg.arrivedAt, leg.index % 2 ? 'return' : 'outbound')
        row.completed++
        if (leg.review === 'empty') row.empty++
      }
      for (const boarding of journey.boardings.filter(b => includes(b.createdAt))) {
        passengers += boarding.count
        bucket(boarding.createdAt, boarding.leg).passengers += boarding.count
        revenue += boarding.count * boarding.fare
      }
      for (const charge of fuelCharges(journey).filter(charge => includes(charge.at))) {
        distance += charge.km
        if (charge.cost === null) unpricedDistance += charge.km
        else fuel += charge.cost
      }
    }
    for (const entry of entries.filter(e => includes(e.createdAt))) {
      if (entry.kind === 'fuel') refills += entry.amount
      else expenses += entry.amount
    }
    const profit = unpricedDistance > 0 ? null : revenue - fuel - expenses
    const target = goals.find(goal => goal.period === period)?.amount ?? 0
    return { period, passengers, revenue, distance, fuel, expenses, refills, profit, target, unpricedDistance, emptyLegs, emptyLoss, traffic: [...traffic.values()].sort((a, b) => a.hour.localeCompare(b.hour) || a.direction.localeCompare(b.direction)) }
  })
}

export const chartPeriods = ['week', 'month', 'bimester', 'quarter', 'semester', 'year', 'custom'] as const

type ReportEntry = Entry & { label?: string; stationName?: string | null; liters?: number | null }
type ReportJourney = RevenueJourney & { completedLegs?: { arrivedAt: Date; distanceKm: number | null; review: string }[] }
type DailyPayment = { label: string; time: string; amount: number; liters: number | null }
type DailyReport = {
  date: string; passengers: number; revenue: number; fuel: number; expenses: number;
  refills: number; distance: number; unpricedDistance: number; journeys: number;
  emptyLegs: number; emptyLoss: number; unpricedEmptyLegs: number;
  expenseItems: DailyPayment[]; refillItems: DailyPayment[];
}

export function dailyProfit(journeys: ReportJourney[], entries: ReportEntry[], period: typeof chartPeriods[number],
  custom?: { start: string; end: string }, now = new Date(), timeZone = process.env.APP_TIME_ZONE ?? 'America/Fortaleza') {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const today = format.format(now)
  const current = new Date(today)
  const iso = (day: number) => new Date(day).toISOString().slice(0, 10)
  const startOfMonths = (size: number) => iso(Date.UTC(current.getUTCFullYear(), Math.floor(current.getUTCMonth() / size) * size, 1))
  const sizes = { month: 1, bimester: 2, quarter: 3, semester: 6, year: 12 }
  const start = period === 'custom' ? custom?.start : period === 'week'
    ? iso(current.getTime() - ((current.getUTCDay() + 6) % 7) * dayMs) : startOfMonths(sizes[period])
  const end = period === 'custom' ? custom?.end : today
  if (!start || !end || start > end || end > today || Date.parse(end) - Date.parse(start) >= 366 * dayMs) return null
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const days = new Map<string, DailyReport>()
  for (let day = Date.parse(start); day <= Date.parse(end); day += dayMs) {
    const date = iso(day)
    days.set(date, {
      date, passengers: 0, revenue: 0, fuel: 0, expenses: 0, refills: 0, distance: 0,
      unpricedDistance: 0, journeys: 0, emptyLegs: 0, emptyLoss: 0, unpricedEmptyLegs: 0,
      expenseItems: [], refillItems: [],
    })
  }
  const reportFor = (at: Date) => days.get(format.format(at))
  for (const journey of journeys) {
    for (const boarding of journey.boardings) {
      const day = reportFor(boarding.createdAt)
      if (!day) continue
      day.passengers += boarding.count
      day.revenue += boarding.count * boarding.fare
    }
    for (const charge of fuelCharges(journey)) {
      const day = reportFor(charge.at)
      if (!day) continue
      day.distance += charge.km
      if (charge.cost === null) day.unpricedDistance += charge.km
      else day.fuel += charge.cost
    }
    const closing = journey.endedAt && reportFor(journey.endedAt)
    if (closing) closing.journeys++
    for (const leg of journey.completedLegs ?? []) {
      if (leg.review !== 'empty') continue
      const day = reportFor(leg.arrivedAt)
      if (!day) continue
      day.emptyLegs++
      if (leg.distanceKm === null || journey.outboundFuelPrice <= 0) day.unpricedEmptyLegs++
      else day.emptyLoss += Math.round(leg.distanceKm / journey.efficiency * journey.outboundFuelPrice)
    }
  }
  for (const entry of entries) {
    const day = reportFor(entry.createdAt)
    if (!day) continue
    const payment = {
      label: entry.stationName ?? entry.label ?? (entry.kind === 'fuel' ? 'Abastecimento' : 'Despesa'),
      time: time.format(entry.createdAt), amount: entry.amount, liters: entry.liters ?? null,
    }
    if (entry.kind === 'fuel') {
      day.refills += entry.amount
      day.refillItems.push(payment)
    } else {
      day.expenses += entry.amount
      day.expenseItems.push(payment)
    }
  }
  return { start, end, today, points: [...days.values()].map(day => ({
    ...day, profit: day.unpricedDistance > 0 ? null : day.revenue - day.fuel - day.expenses,
  })) }
}
export function nextReportingDay(now = new Date(), timeZone = process.env.APP_TIME_ZONE ?? 'America/Fortaleza') {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const today = format.format(now)
  let start = now.getTime()
  let end = start + 27 * 3_600_000
  while (end - start > 1) {
    const middle = Math.floor((start + end) / 2)
    if (format.format(middle) === today) start = middle
    else end = middle
  }
  return new Date(end)
}