import assert from 'node:assert/strict'
import { once } from 'node:events'
import { closeSync, mkdtempSync, openSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { routeProgress, travelBearing } from '../src/route-geometry'
import { navigationEstimate, workDuration } from '../src/journey-time'
import { formatNumberDigits, parseNumber } from '../src/localized-number'
import { nextManeuver } from '../src/navigation-steps'
import { dailyProfit, nextReportingDay } from '../server/finance'

test('isolates accounts and computes the net result of a round trip', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'alternadrive-'))
  const file = join(folder, 'test.db')
  const previousUrl = process.env.DATABASE_URL
  process.env.DATABASE_URL = 'file:' + file.replaceAll('\\', '/')
  try {
    closeSync(openSync(file, 'a'))
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { stdio: 'pipe' })
    const { app, prisma } = await import('../server/index')
    const server = app.listen(0, '127.0.0.1')
    try {
      await once(server, 'listening')
      const address = server.address()
      assert(address && typeof address === 'object')
      async function call(path: string, body?: object, cookie?: string, status = 200, headers?: Record<string, string>) {
        const response = await fetch('http://127.0.0.1:' + address.port + '/api/' + path, {
          method: body ? 'POST' : 'GET',
          headers: { ...(body && { 'content-type': 'application/json' }), ...(cookie && { cookie }), ...headers },
          body: body && JSON.stringify(body),
        })
        const result = await response.json()
        assert.equal(response.status, status, JSON.stringify(result))
        return { result, cookie: response.headers.get('set-cookie')?.split(';')[0] }
      }
      const password = 'test-password'
      const { cookie: first } = await call('register', { name: 'Primeira', email: 'first@example.test', password })
      const { cookie: second } = await call('register', { name: 'Segunda', email: 'second@example.test', password })
      assert(first && second)
      await call('addresses?q=Rua%20Dom%20Bosco', undefined, undefined, 401)
      await call('addresses?q=Ru', undefined, first, 422)
      const fetchAddress = globalThis.fetch
      globalThis.fetch = async (input, init) => {
        if (typeof input !== 'string' || !input.startsWith('https://photon.komoot.io/')) return fetchAddress(input, init)
        const query = new URL(input).searchParams
        assert.equal(query.get('q'), 'Rua Dom Bosco')
        assert.equal(query.get('countrycode'), 'BR')
        return Response.json({ features: [{ properties: { name: 'Rua Dom Bosco', city: 'João Pessoa' },
          geometry: { coordinates: [-34.881, -7.151] } }] })
      }
      try {
        const { result } = await call('addresses?q=Rua%20Dom%20Bosco', undefined, first)
        assert.deepEqual(result, [{ label: 'Rua Dom Bosco · João Pessoa', latitude: -7.151, longitude: -34.881 }])
      } finally {
        globalThis.fetch = fetchAddress
      }
      const mobile = await call('login', { email: 'first@example.test', password }, undefined, 200, { 'X-AlternaDrive-Client': 'android' })
      assert.equal(mobile.cookie, undefined)
      assert.match(mobile.result.token, /^[a-f0-9]{64}$/)
      const bearer = { Authorization: 'Bearer ' + mobile.result.token }
      assert.equal((await call('dashboard', undefined, undefined, 200, bearer)).result.user.email, 'first@example.test')
      await call('logout', {}, undefined, 200, bearer)
      await call('dashboard', undefined, undefined, 401, bearer)

      const { result: vehicle } = await call('vehicles', { name: 'Van', fuel: 'Gasolina', tank: 60, efficiency: 10, capacity: 8 }, first, 201)
      assert.equal(vehicle.type, 'car')
      const journeyData = { vehicleId: vehicle.id, startKm: 1000 }
      await call('journeys', journeyData, first, 422)
      const a = { latitude: -7.132, longitude: -34.871 }
      const b = { latitude: -7.142, longitude: -34.871 }
      await call('settings/journey', {
        defaultOrigin: 'Centro', defaultDestination: 'Terminal', defaultFare: 700,
        defaultPointA: a, defaultPointB: b,
      }, first)
      await call('journeys', journeyData, second, 404)
      const { result: journey } = await call('journeys', journeyData, first, 201)
      assert.deepEqual([journey.origin, journey.destination, journey.fare], ['Centro', 'Terminal', 700])
      const presence = 'drivers/nearby'
      const location = { latitude: -7.13219, longitude: -34.87132 }
      assert.deepEqual((await call(presence, { center: location, journeyId: journey.id }, second)).result, [])
      assert.deepEqual((await call(presence, { center: location, journeyId: journey.id }, first)).result, [])
      let visible = (await call(presence, { center: location }, second)).result
      assert.equal(visible.length, 1)
      assert.deepEqual(Object.keys(visible[0]).sort(), ['id', 'latitude', 'longitude', 'type'])
      assert.deepEqual([visible[0].latitude, visible[0].longitude], [-7.132, -34.871])
      const anonymousId = visible[0].id
      await call(presence, { center: { ...location, latitude: -7.13324 }, journeyId: journey.id }, first)
      visible = (await call(presence, { center: location }, second)).result
      assert.equal(visible[0].id, anonymousId)
      assert.equal(visible[0].latitude, -7.133)
      await call('drivers/hide', {}, first)
      assert.deepEqual((await call(presence, { center: location }, second)).result, [])

      await call('journeys', journeyData, first, 409)
      const path = 'journeys/' + journey.id
      await call(path + '/boardings', { count: 1 }, second, 404)
      const initialBoarding = (await call(path + '/boardings', { count: 3 }, first, 201)).result
      assert.equal(initialBoarding.leg, 'outbound')
      const accidental = (await call(path + '/boardings', { count: 1 }, first, 201)).result
      await call(path + '/boardings/undo', { boardingId: initialBoarding.id }, first, 409)
      await call(path + '/boardings/undo', { boardingId: accidental.id }, second, 404)
      await call(path + '/boardings/undo', { boardingId: accidental.id }, first)
      await call(path + '/boardings/undo', { boardingId: accidental.id }, first)
      const trace = [a, { ...a, latitude: -7.137 }]
      const arrive = async (point: typeof a, arrivals: number, accuracy = 10) =>
        (await call(path + '/arrival', { ...point, accuracy, arrivals, trace: arrivals < 2 ? trace : [], routeKm: 2 }, first)).result.arrivals
      assert.equal(await arrive(a, 0), 0)
      assert.equal(await arrive(b, 0, 100), 0)
      await call(path + '/arrival', { ...b, accuracy: 10, arrivals: 0 }, second, 404)
      assert.equal(await arrive(b, 0), 1)
      assert.equal(await arrive(b, 0), 1)
      assert.equal(await arrive(b, 1), 1)
      assert.equal((await call(path + '/boardings', { count: 2 }, first, 201)).result.leg, 'return')
      assert.equal(await arrive(a, 1), 2)
      assert.equal(await arrive(b, 2), 3)
      const pending = (await call('dashboard', undefined, first)).result.pendingLegs
      assert.deepEqual(pending.map((leg: { index: number }) => leg.index), [2])
      await call(path + '/legs/2/review', { count: 0 }, second, 404)
      await call(path + '/legs/2/review', { count: 0 }, first)
      await call(path + '/legs/2/review', { count: 1 }, first)
      assert.deepEqual((await call('dashboard', undefined, first)).result.pendingLegs, [])
      assert.equal((await call('dashboard', undefined, first)).result.active.arrivals, 3)
      await call(path + '/finish', { km: 999 }, first, 422)
      await call(presence, { center: location, journeyId: journey.id }, first)
      const closed = (await call(path + '/finish', { km: 1020 }, first)).result.closing
      assert.deepEqual((await call(presence, { center: location }, second)).result, [])
      assert.equal(closed.passengers, 5)
      assert.equal(closed.revenue, 3500)
      assert.equal(closed.distance, 20)
      assert.equal(closed.profit, null)
      await call(path + '/arrival', { ...a, accuracy: 10, arrivals: 3 }, first, 404)
      await call('entries', { kind: 'expense', label: 'Pedágio', amount: 500 }, first, 201)
      assert.equal((await call('dashboard', undefined, first)).result.summaries[0].profit, null)
      const station = { id: 'N2797085773', name: 'Posto Expressão - Torre', latitude: -7.13, longitude: -34.87 }
      const refill = { kind: 'fuel', vehicleId: vehicle.id, amount: 6000, fuelUnitPrice: 600, station }
      const { result: receipt } = await call('entries', refill, first, 201)
      assert.equal(receipt.liters, 10)
      assert.equal(receipt.stationName, station.name)
      const { result: prices } = await call('stations/prices', undefined, second)
      assert.deepEqual(prices.map(({ updatedAt, ...price }: { updatedAt: string }) => price), [{
        stationId: station.id, name: station.name, latitude: station.latitude, longitude: station.longitude,
        fuel: 'Gasolina', unitPrice: 600,
      }])
      await call('goals', { period: 'day', amount: 3600 }, first)
      const { result } = await call('dashboard', undefined, first)
      assert.equal(result.active, null)
      assert.equal(result.history.length, 1)
      const { emptyLegs, traffic, ...daily } = result.summaries[0]
      assert.equal(traffic.reduce((total: number, row: { empty: number }) => total + row.empty, 0), 1)
      assert.equal(traffic.filter((row: { direction: string }) => row.direction === 'return')
        .reduce((total: number, row: { passengers: number }) => total + row.passengers, 0), 2)
      assert.equal(emptyLegs[0].distanceKm, 2)
      assert.equal(emptyLegs[0].cost, 120)
      assert.deepEqual(daily, {
        period: 'day', target: 3600, passengers: 5, revenue: 3500, distance: 20,
        fuel: 1200, expenses: 500, refills: 6000, profit: 1800, unpricedDistance: 0, emptyLoss: 120,
      })
      const other = (await call('dashboard', undefined, second)).result
      assert.deepEqual([other.vehicles, other.history, other.entries], [[], [], []])
      assert.equal(other.summaries[0].profit, 0)
      assert.deepEqual(other.defaults, { defaultOrigin: null, defaultDestination: null, defaultFare: null, defaultPointA: null, defaultPointB: null })
      await call('vehicles/' + vehicle.id + '/fuel-reference', { price: 900 }, second, 404)
      await call('vehicles/' + vehicle.id + '/fuel-reference', { price: 900 }, first)
      const currentLocation = { address: 'Ponto de saída GPS', latitude: -7.134, longitude: -34.871 }
      const { result: gpsJourney } = await call('journeys', { ...journeyData, currentLocation }, first, 201)
      assert.deepEqual([gpsJourney.origin, gpsJourney.startLatitude, gpsJourney.startLongitude, gpsJourney.fare], [
        currentLocation.address, currentLocation.latitude, currentLocation.longitude, 700,
      ])
      assert.equal(gpsJourney.outboundFuelPrice, 600)
      assert.deepEqual(gpsJourney.pointA, { latitude: currentLocation.latitude, longitude: currentLocation.longitude })
      assert.deepEqual((await call('dashboard', undefined, first)).result.defaults.defaultPointA, a)
      assert.equal((await call('routes/habitual', { from: a, to: b }, first)).result.checkpoints.length, 7)
      const originalRoute = (await call('routes/habitual', { from: a, to: b }, first)).result.checkpoints
      const otherTrace = [a, { ...a, latitude: -7.137, longitude: -34.877 }]
      for (const driver of ['third', 'fourth']) {
        const auth = await call('register', { name: driver, email: driver + '@example.test', password })
        assert(auth.cookie)
        const motorcycle = driver === 'third'
        const ride = (await call('vehicles', motorcycle
          ? { name: 'Moto', type: 'motorcycle', fuel: 'Gasolina', tank: 12, efficiency: 30 }
          : { name: 'Van', fuel: 'Gasolina', tank: 60, efficiency: 10, capacity: 8 }, auth.cookie, 201)).result
        if (motorcycle) assert.deepEqual([ride.type, ride.capacity], ['motorcycle', 1])
        const nearbyA = { ...a, longitude: a.longitude + .0004 }
        const nearbyB = { ...b, longitude: b.longitude + .0004 }
        await call('settings/journey', {
          defaultOrigin: 'Outra referência de origem', defaultDestination: 'Outra referência de destino', defaultFare: 700,
          defaultPointA: nearbyA, defaultPointB: nearbyB,
        }, auth.cookie)
        const trip = (await call('journeys', { ...journeyData, vehicleId: ride.id }, auth.cookie, 201)).result
        if (motorcycle) {
          const activeRide = (await call('dashboard', undefined, auth.cookie)).result.active
          assert.equal(activeRide.vehicle.type, 'motorcycle')
          await call('journeys/' + trip.id + '/boardings', { count: 2 }, auth.cookie, 422)
          await call('journeys/' + trip.id + '/boardings', { count: 1 }, auth.cookie, 201)
        }
        await call('journeys/' + trip.id + '/arrival', { ...nearbyB, arrivals: 0, accuracy: 10, trace: otherTrace }, auth.cookie)
        if (!motorcycle) {
          const reviewPath = 'journeys/' + trip.id + '/legs/0/review'
          await call(reviewPath, { count: 2 }, auth.cookie)
          await call(reviewPath, { count: 2 }, auth.cookie)
          const reviewed = (await call('dashboard', undefined, auth.cookie)).result
          assert.equal(reviewed.active.boardings.length, 1)
          assert.equal(reviewed.active.boardings[0].legIndex, 0)
          assert.equal(reviewed.summaries[0].revenue, 1400)
        }
        const recommendation = (await call('routes/habitual', { from: a, to: b }, first)).result.checkpoints
        assert.equal(recommendation?.length, 7)
        if (driver === 'third') assert.deepEqual(recommendation, originalRoute)
        else assert.notDeepEqual(recommendation, originalRoute)
      }
      assert.equal((await call('routes/habitual', { from: b, to: a }, first)).result.checkpoints, null)
      assert.equal((await call('routes/habitual', { from: a, to: { ...b, longitude: b.longitude + .01 } }, first)).result.checkpoints, null)
      const otherVan = (await call('vehicles', {
        name: 'Outra van', fuel: 'Gasolina', tank: 60, efficiency: 10, capacity: 8,
      }, second, 201)).result
      await call('entries', { ...refill, vehicleId: otherVan.id, fuelUnitPrice: 630 }, second, 201)
      const currentPrices = (await call('stations/prices', undefined, first)).result
      assert.equal(currentPrices.length, 1)
      assert.equal(currentPrices[0].unitPrice, 630)
      assert.equal((await call('dashboard', undefined, first)).result.entries.find((entry: { kind: string }) => entry.kind === 'fuel').fuelUnitPrice, 600)
      await prisma.journey.update({ where: { id: gpsJourney.id }, data: { startedAt: new Date(Date.now() - 3600000) } })
      const completed = (await call('journeys/' + gpsJourney.id + '/finish', { km: 1010 }, first)).result.closing
      assert.equal(completed.fuel, 600)
      assert.equal(completed.profit, -1100)
      assert(Math.abs(completed.perHour + 1100) <= 1)
      const referenceVehicle = (await call('vehicles', { name: 'Carro de teste', fuel: 'Gasolina', tank: 50, efficiency: 10, capacity: 4 }, first, 201)).result
      await call('vehicles/' + referenceVehicle.id + '/fuel-reference', { price: 625 }, first)
      const referenced = await call('journeys', { ...journeyData, vehicleId: referenceVehicle.id }, first, 201)
      assert.equal(referenced.result.outboundFuelPrice, 625)
      const chart = (await call('reports/daily-profit?period=month', undefined, first)).result
      assert.equal(chart.points.at(-1).date, chart.today)
      const report = chart.points.at(-1)
      assert.equal(report.expenseItems[0].label, 'Pedágio')
      assert.equal(report.expenseItems[0].amount, 500)
      assert.equal(report.refillItems[0].amount, 6000)
      assert.equal(report.profit, report.revenue - report.fuel - report.expenses)
      const otherChart = (await call('reports/daily-profit?period=month', undefined, second)).result
      assert(otherChart.points.every((point: { profit: number }) => point.profit === 0))
      await call('reports/daily-profit?period=custom&start=2026-02-30&end=2026-03-01', undefined, first, 422)
      await call('logout', {}, first)
      await call('dashboard', undefined, first, 401)
      const { cookie: signedIn } = await call('login', { email: 'first@example.test', password })
      assert(signedIn)
      assert.equal((await call('dashboard', undefined, signedIn)).result.history.length, 2)
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      await prisma.$disconnect()
    }
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousUrl
    rmSync(folder, { recursive: true, force: true })
  }
})



test('measures progress along a road and detects a parallel deviation', () => {
  const line: [number, number][] = [[-34.87, -7.15], [-34.87, -7.14], [-34.87, -7.13]]
  const onRoute = routeProgress({ longitude: -34.87, latitude: -7.14 }, line)
  assert.equal(onRoute.distance, 0)
  assert(Math.abs(onRoute.remaining - .5) < .001)
  assert(routeProgress({ longitude: -34.869, latitude: -7.14 }, line).distance > 100)
})
test('derives the heading of the car from GPS movement', () => {
  const start = { latitude: -7.14, longitude: -34.87 }
  assert.equal(travelBearing(start, { ...start, latitude: -7.13 }), 0)
  assert.equal(travelBearing(start, { ...start, latitude: -7.15 }), 180)
  assert(Math.abs(travelBearing(start, { ...start, longitude: -34.86 }) - 90) < .1)
})
test('reports elapsed work across midnight and estimates the rest of the current leg', () => {
  assert.equal(workDuration('2026-11-20T22:40:00Z', '2026-11-21T01:05:00Z'), '2 h 25 min')
  assert.equal(workDuration('2026-11-21T00:00:00Z', '2026-11-21T00:00:40Z'), '< 1 min')
  assert.deepEqual(navigationEstimate(12000, 1200, .5), { meters: 6000, seconds: 600 })
  assert(navigationEstimate(12000, 1200, .25, 8).seconds < 600)
  assert.equal(navigationEstimate(12000, 1200, 0).meters, 0)
})
test('accepts the Brazilian formatting used for money and odometer readings', () => {
  assert.equal(parseNumber('R$ 1.234,50'), 1234.5)
  assert.equal(parseNumber('82.450 km'), 82450)
  assert.equal(parseNumber('82450.25'), 82450.25)
  assert.equal(parseNumber('12,50'), 12.5)
  assert.equal(parseNumber('0'), 0)
  assert(Number.isNaN(parseNumber('1,5', 0)))
  assert(Number.isNaN(parseNumber('7,559')))
  assert(Number.isNaN(parseNumber('')))
})
test('formats money as cents and adds kilometers grouping during typing', () => {
  assert.deepEqual(['0', '1', '10', '100', '123450'].map(value => formatNumberDigits(value, true)),
    ['0,00', '0,01', '0,10', '1,00', '1.234,50'])
  assert.equal(formatNumberDigits('82.45' + '0', false), '82.450')
  assert.equal(formatNumberDigits('', true), '')
})
test('shows the next OSRM maneuver and advances after passing it', () => {
  const legs = [{ steps: [
    { distance: 200, name: 'Rua Um', maneuver: { type: 'depart' } },
    { distance: 300, name: 'Rua Dois', maneuver: { type: 'turn', modifier: 'right' } },
    { distance: 0, name: '', maneuver: { type: 'arrive' } },
  ] }]
  assert.deepEqual(nextManeuver(legs, 50), { direction: 'right', instruction: 'Vire à direita', street: 'Rua Dois', meters: 150 })
  assert.equal(nextManeuver(legs, 220)?.direction, 'arrive')
  assert.equal(nextManeuver([], 1), null)
})
test('groups every journey by its local calendar day and switches at midnight', () => {
  const zone = 'America/Fortaleza'
  const now = new Date('2026-11-22T03:00:00Z')
  const journey = (timestamp: string, fare: number) => ({
    startKm: 10, endKm: 20, turnKm: null, efficiency: 10, outboundFuelPrice: 600, returnFuelPrice: null,
    turnedAt: null, endedAt: new Date(timestamp), boardings: [{ createdAt: new Date(timestamp), count: 2, fare }],
  })
  const records = [
    journey('2026-11-21T10:00:00Z', 1000),
    journey('2026-11-21T17:00:00Z', 1000),
    journey('2026-11-22T02:59:59Z', 1000),
    journey('2026-11-22T03:00:00Z', 1000),
  ]
  const chart = dailyProfit(records, [], 'custom', { start: '2026-11-21', end: '2026-11-22' }, now, zone)
  assert.deepEqual(chart?.points.map(({ date, profit }) => ({ date, profit })), [{ date: '2026-11-21', profit: 4200 }, { date: '2026-11-22', profit: 1400 }])
  assert.deepEqual(chart?.points.map(({ passengers, revenue, fuel, journeys }) => [passengers, revenue, fuel, journeys]),
    [[6, 6000, 1800, 3], [2, 2000, 600, 1]])
  assert.equal(nextReportingDay(new Date('2026-11-22T02:59:59Z'), zone).toISOString(), now.toISOString())
  assert.equal(dailyProfit(records, [], 'bimester', undefined, now, zone)?.start, '2026-11-01')
  assert.equal(dailyProfit(records, [], 'semester', undefined, now, zone)?.start, '2026-07-01')
})