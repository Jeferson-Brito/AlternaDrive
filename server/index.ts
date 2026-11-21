import 'dotenv/config'
import express, { type ErrorRequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import { PrismaClient, Prisma } from '@prisma/client'
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { combinedEfficiency } from './vehicle-efficiency'
import { chartPeriods, dailyProfit, nextReportingDay, periods, summarize } from './finance'
import { findAddresses } from '../src/address-search'
import { distanceMeters, isArrival } from '../src/arrival'
import { habitualRoute, routeCheckpoints } from '../src/route-geometry'

const prisma = new PrismaClient()
const derive = promisify(scrypt)
const hash = (token: string) => createHash('sha256').update(token).digest('hex')
const lifetime = 7 * 24 * 60 * 60 * 1000
const production = process.env.NODE_ENV === 'production'
const cookie = { httpOnly: true, sameSite: 'lax' as const, secure: production, path: '/' }
const secret = z.string().min(8).max(128)
const email = z.string().trim().email().max(254).toLowerCase()
const label = z.string().trim().min(1).max(100)
const positive = z.number().min(0.01).max(100_000)
const odometer = z.number().min(0).max(10_000_000)
const cents = z.number().int().min(1).max(10_000_000)
const address = z.string().trim().min(1).max(240)
const point = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
const station = point.extend({ id: z.string().regex(/^[NWR][0-9]{1,18}$/), name: address })
const unitPrice = z.number().int().min(1).max(100_000)
const journeyDefaults = {
  defaultFare: true, defaultOrigin: true, defaultDestination: true, defaultPointA: true, defaultPointB: true,
} as const
const id = z.string().cuid()
const userFields = { id: true, name: true, email: true }
const app = express()
if (production) app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use('/api', express.json({ limit: '32kb' }), (req, res, next) => {
  res.set('Cache-Control', 'no-store')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.is('application/json')) {
    res.status(415).json({ error: 'Envie dados no formato JSON.' })
    return
  }
  next()
})
app.get('/api/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`
  res.json({ ok: true })
})

type PublicUser = { id: string; email: string; name: string }
async function login(req: express.Request, res: express.Response, user: PublicUser) {
  const token = randomBytes(32).toString('hex')
  await prisma.session.create({ data: { id: hash(token), userId: user.id, expiresAt: new Date(Date.now() + lifetime) } })
  if (req.get('X-AlternaDrive-Client') === 'android') {
    res.json({ user, token })
    return
  }
  res.cookie('alternadrive_session', token, { ...cookie, maxAge: lifetime })
  res.json(user)
}
function sessionId(req: express.Request) {
  const authorization = req.get('Authorization')
  if (authorization) {
    const bearer = authorization.match(/^Bearer ([a-f0-9]{64})$/i)?.[1]
    return bearer ? hash(bearer) : undefined
  }
  const token = req.headers.cookie?.match(/(?:^|;\s*)alternadrive_session=([a-f0-9]{64})(?:;|$)/)?.[1]
  return token ? hash(token) : undefined
}
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos.' },
})
app.post('/api/register', authLimit, async (req, res) => {
  const data = z.object({ name: label, email, password: secret }).parse(req.body)
  const salt = randomBytes(16).toString('hex')
  const key = await derive(data.password, salt, 64) as Buffer
  const user = await prisma.user.create({
    data: { ...data, password: salt + ':' + key.toString('hex') }, select: userFields,
  })
  await login(req, res, user)
})
app.post('/api/login', authLimit, async (req, res) => {
  const data = z.object({ email, password: secret }).parse(req.body)
  const user = await prisma.user.findUnique({ where: { email: data.email } })
  const [salt, expected] = user?.password.split(':') ?? ['0'.repeat(32), '0'.repeat(128)]
  const key = await derive(data.password, salt, 64) as Buffer
  if (!timingSafeEqual(key, Buffer.from(expected, 'hex')) || !user) {
    res.status(401).json({ error: 'E-mail ou senha incorretos.' })
    return
  }
  await login(req, res, { id: user.id, name: user.name, email: user.email })
})
app.post('/api/logout', async (req, res) => {
  const token = sessionId(req)
  if (token) await prisma.session.deleteMany({ where: { id: token } })
  res.clearCookie('alternadrive_session', cookie).json({ ok: true })
})
app.use('/api', async (req, res, next) => {
  const token = sessionId(req)
  const session = token && await prisma.session.findFirst({
    where: { id: token, expiresAt: { gt: new Date() } }, include: { user: { select: userFields } },
  })
  if (!session) {
    res.status(401).json({ error: 'Entre para acessar sua conta.' })
    return
  }
  res.locals.user = session.user
  next()
})
const recentStationPrices = () => prisma.stationPrice.findMany({ orderBy: { updatedAt: 'desc' }, take: 500 })
app.get('/api/stations/prices', async (_req, res) => {
  res.json(await recentStationPrices())
})
app.get('/api/addresses', rateLimit({
  windowMs: 60_000, limit: 90, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Muitas buscas. Aguarde alguns segundos.' },
}), async (req, res) => {
  const { q } = z.object({ q: z.string().trim().min(3).max(240) }).parse(req.query)
  try {
    const matches = await findAddresses('api/', {
      q, limit: '6', lat: '-7.132', lon: '-34.871', countrycode: 'BR',
    }, AbortSignal.timeout(9_000))
    res.json(matches)
  } catch {
    res.status(503).json({ error: 'Busca de endereços indisponível. Tente novamente.' })
  }
})
app.get('/api/dashboard', async (_req, res) => {
  const user: PublicUser = res.locals.user
  const where = { userId: user.id }
  const [vehicles, journeys, entries, goals, defaults, stationPrices] = await Promise.all([
    prisma.vehicle.findMany({ where, orderBy: { name: 'asc' } }),
    prisma.journey.findMany({ where, orderBy: { startedAt: 'desc' }, include: { vehicle: { select: { name: true, type: true } }, boardings: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }, completedLegs: { orderBy: { index: 'asc' } } } }),
    prisma.entry.findMany({ where, orderBy: { createdAt: 'desc' } }),
    prisma.goal.findMany({ where }),
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: journeyDefaults }),
    recentStationPrices(),
  ])
  const now = new Date()
  res.json({
    user, vehicles, defaults, stationPrices, active: journeys.find(journey => journey.activeUserId) ?? null,
    history: journeys.filter(journey => journey.endedAt).slice(0, 30), entries: entries.slice(0, 30),
    pendingLegs: journeys.flatMap(journey => journey.completedLegs.filter(leg => leg.review === 'pending').map(leg => ({
      journeyId: journey.id, index: leg.index, motorcycle: journey.vehicle.type === 'motorcycle',
      from: leg.index % 2 ? journey.destination : journey.origin, to: leg.index % 2 ? journey.origin : journey.destination,
    }))),
    summaries: summarize(journeys, entries, goals, now),
    nextReportingDay: nextReportingDay(now),
  })
})
app.get('/api/reports/daily-profit', async (req, res) => {
  const query = z.object({ period: z.enum(chartPeriods), start: z.iso.date().optional(), end: z.iso.date().optional() }).parse(req.query)
  const where = { userId: res.locals.user.id as string }
  const [journeys, entries] = await Promise.all([
    prisma.journey.findMany({ where, include: {
      boardings: { select: { createdAt: true, count: true, fare: true } },
      completedLegs: { select: { arrivedAt: true, distanceKm: true, review: true } },
    } }),
    prisma.entry.findMany({ where, orderBy: { createdAt: 'desc' },
      select: { kind: true, amount: true, createdAt: true, label: true, stationName: true, liters: true } }),
  ])
  const series = dailyProfit(journeys, entries, query.period, query.start && query.end ? { start: query.start, end: query.end } : undefined)
  if (!series) return res.status(422).json({ error: 'Escolha um intervalo de até 366 dias, com término até hoje.' })
  res.json(series)
})
app.post('/api/vehicles', async (req, res) => {
  const data = z.object({
    name: label, type: z.enum(['car', 'motorcycle']).default('car'), fuel: z.enum(['Gasolina', 'Etanol', 'Diesel', 'GNV']),
    tank: positive.nullable(), efficiency: positive.optional(), cityEfficiency: positive.optional(),
    highwayEfficiency: positive.optional(), urbanShare: z.number().int().min(0).max(100).default(100),
    catalogId: z.string().min(1).max(100).optional(), capacity: z.number().int().min(1).max(100).optional(),
  }).parse(req.body)
  const capacity = data.type === 'motorcycle' ? 1 : data.capacity
  const { cityEfficiency, highwayEfficiency, urbanShare, ...vehicle } = data
  const efficiency = cityEfficiency === undefined ? data.efficiency : combinedEfficiency(cityEfficiency, highwayEfficiency, urbanShare)
  if (efficiency === undefined) return res.status(422).json({ error: 'Informe o consumo do veículo.' })
  if (!capacity) return res.status(422).json({ error: 'Informe quantos passageiros cabem no veículo.' })
  res.status(201).json(await prisma.vehicle.create({ data: { ...vehicle, capacity, efficiency, cityEfficiency, highwayEfficiency, urbanShare, userId: res.locals.user.id } }))
})
app.post('/api/vehicles/:id/fuel-reference', async (req, res) => {
  const { price } = z.object({ price: unitPrice.nullable() }).parse(req.body)
  const userId = res.locals.user.id as string
  const vehicleId = req.params.id
  const saved = await prisma.$transaction(async tx => {
    const result = await tx.vehicle.updateMany({
      where: { id: vehicleId, userId }, data: { referenceFuelPrice: price },
    })
    if (!result.count || price === null) return result.count > 0
    const unpriced = { vehicleId, userId }
    await tx.journey.updateMany({ where: { ...unpriced, outboundFuelPrice: 0 }, data: { outboundFuelPrice: price } })
    await tx.journey.updateMany({ where: { ...unpriced, returnFuelPrice: 0 }, data: { returnFuelPrice: price } })
    return true
  })
  if (!saved) return res.status(404).json({ error: 'Veículo indisponível.' })
  res.json({ ok: true })
})
app.post('/api/settings/journey', async (req, res) => {
  const { defaultPointA, defaultPointB, ...fields } = z.object({
    defaultOrigin: address, defaultDestination: address, defaultFare: cents,
    defaultPointA: point.optional(), defaultPointB: point.optional(),
  }).parse(req.body)
  if ((defaultPointA && !defaultPointB) || (!defaultPointA && defaultPointB) ||
      (defaultPointA && defaultPointB && distanceMeters(defaultPointA, defaultPointB) < 60)) {
    return res.status(422).json({ error: 'Selecione dois pontos separados por pelo menos 60 metros.' })
  }
  const data = { ...fields, defaultPointA: defaultPointA ?? Prisma.DbNull, defaultPointB: defaultPointB ?? Prisma.DbNull }
  res.json(await prisma.user.update({ where: { id: res.locals.user.id }, data, select: journeyDefaults }))
})
app.post('/api/journeys', async (req, res) => {
  const { fuelPrice, currentLocation, origin, destination, fare, ...data } = z.object({
    vehicleId: id, origin: address.optional(), destination: address.optional(), fare: cents.optional(),
    startKm: odometer, fuelPrice: cents.optional(),
    currentLocation: point.extend({ address }).optional(),
  }).parse(req.body)
  const userId = res.locals.user.id as string
  const [vehicle, defaults, latestFuel] = await Promise.all([
    prisma.vehicle.findFirst({ where: { id: data.vehicleId, userId } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: journeyDefaults }),
    prisma.entry.findFirst({
      where: { userId, vehicleId: data.vehicleId, kind: 'fuel' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { fuelUnitPrice: true, amount: true, liters: true },
    }),
  ])
  if (!vehicle) return res.status(404).json({ error: 'Veículo indisponível.' })
  const journeyOrigin = currentLocation?.address ?? defaults.defaultOrigin ?? origin
  const journeyDestination = defaults.defaultDestination ?? destination
  const journeyFare = defaults.defaultFare ?? fare
  if (!journeyOrigin || !journeyDestination || !journeyFare) {
    return res.status(422).json({ error: 'Cadastre o percurso e a tarifa em Configurações.' })
  }
  const pointA = defaults.defaultPointB && currentLocation ? point.parse(currentLocation) : point.safeParse(defaults.defaultPointA).data
  const pointB = point.safeParse(defaults.defaultPointB).data
  if (pointA && pointB && distanceMeters(pointA, pointB) < 60) {
    return res.status(422).json({ error: 'A origem e o destino precisam estar separados por pelo menos 60 metros.' })
  }
  const savedFuelPrice = latestFuel?.fuelUnitPrice ?? (latestFuel?.liters
    ? Math.max(1, Math.round(latestFuel.amount / latestFuel.liters)) : vehicle.referenceFuelPrice ?? 0)
  const journey = await prisma.journey.create({
    data: {
      ...data, userId, activeUserId: userId, efficiency: vehicle.efficiency, outboundFuelPrice: fuelPrice ?? savedFuelPrice,
      origin: journeyOrigin, destination: journeyDestination, fare: journeyFare,
      startLatitude: currentLocation?.latitude, startLongitude: currentLocation?.longitude,
      pointA, pointB,
    },
  })
  res.status(201).json(journey)
})
app.post('/api/routes/habitual', async (req, res) => {
  const { from, to } = z.object({ from: point, to: point }).parse(req.body)
  const matchRadius = 250
  const latitudeMargin = matchRadius / 110_000
  const around = (value: number) => ({ gte: value - latitudeMargin, lte: value + latitudeMargin })
  const samples = await prisma.routeExperience.findMany({
    where: { fromLat: around(from.latitude), toLat: around(to.latitude) },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const nearby = samples.flatMap(sample => {
    const checkpoints = z.array(point).length(7).safeParse(sample.checkpoints).data
    if (!checkpoints || distanceMeters(from, { latitude: sample.fromLat, longitude: sample.fromLon }) > matchRadius ||
        distanceMeters(to, { latitude: sample.toLat, longitude: sample.toLon }) > matchRadius) return []
    return [{ userId: sample.userId, checkpoints }]
  })
  res.json({ checkpoints: habitualRoute(nearby) })
})
app.post('/api/journeys/:id/arrival', async (req, res) => {
  const { arrivals, trace, routeKm, ...position } = point.extend({
    arrivals: z.number().int().min(0), accuracy: z.number().nonnegative(), trace: z.array(point).max(240).optional(), routeKm: z.number().positive().max(5000).optional(),
  }).parse(req.body)
  const where = { id: req.params.id, activeUserId: res.locals.user.id as string }
  const journey = await prisma.journey.findFirst({ where })
  if (!journey) return res.status(404).json({ error: 'Jornada ativa indisponível.' })
  const a = point.safeParse(journey.pointA).data
  const b = point.safeParse(journey.pointB).data
  if (arrivals !== journey.arrivals || !a || !b || !isArrival(a, b, arrivals, position)) {
    return res.json({ arrivals: journey.arrivals })
  }
  const [from, to] = arrivals % 2 ? [b, a] : [a, b]
  const fixes = trace ? [...trace, position] : []
  const checkpoints = routeCheckpoints(fixes, from, to)
  const distanceKm = checkpoints.length
    ? fixes.slice(1).reduce((sum, fix, index) => sum + distanceMeters(fixes[index], fix), 0) / 1000
    : routeKm
  const result = await prisma.$transaction(async tx => {
    const updated = await tx.journey.updateMany({
      where: { ...where, arrivals }, data: { arrivals: { increment: 1 } },
    })
    if (updated.count) {
      const boarded = await tx.boarding.findFirst({
        where: { journeyId: journey.id, OR: [{ legIndex: arrivals }, { legIndex: null, leg: arrivals % 2 ? 'return' : 'outbound' }] },
        select: { id: true },
      })
      await tx.completedLeg.create({ data: {
        journeyId: journey.id, index: arrivals, distanceKm, review: boarded ? 'boarded' : 'pending',
      } })
    }
    if (updated.count && checkpoints.length) {
      await tx.routeExperience.create({ data: {
        userId: journey.userId, journeyId: journey.id, leg: arrivals,
        fromLat: from.latitude, fromLon: from.longitude, toLat: to.latitude, toLon: to.longitude, checkpoints,
      } })
    }
    return updated
  })
  if (result.count) return res.json({ arrivals: arrivals + 1 })
  const latest = await prisma.journey.findFirst({ where, select: { arrivals: true } })
  res.json({ arrivals: latest?.arrivals ?? arrivals })
})
app.post('/api/journeys/:id/legs/:index/review', async (req, res) => {
  const index = z.coerce.number().int().min(0).parse(req.params.index)
  const count = z.object({ count: z.number().int().min(0).max(100) }).parse(req.body).count
  const journeyId = req.params.id
  const userId = res.locals.user.id as string
  const result = await prisma.$transaction(async tx => {
    const leg = await tx.completedLeg.findFirst({
      where: { journeyId, index, journey: { userId } },
      include: { journey: { select: { fare: true, vehicle: { select: { type: true } } } } },
    })
    if (!leg) return 'missing'
    if (leg.review !== 'pending') return 'done'
    if (count > 1 && leg.journey.vehicle.type === 'motorcycle') return 'capacity'
    const updated = await tx.completedLeg.updateMany({
      where: { journeyId, index, review: 'pending' }, data: { review: count ? 'boarded' : 'empty' },
    })
    if (updated.count && count) await tx.boarding.create({ data: {
      journeyId, legIndex: index, leg: index % 2 ? 'return' : 'outbound',
      count, fare: leg.journey.fare, createdAt: leg.arrivedAt,
    } })
    return 'done'
  }, { isolationLevel: 'Serializable' })
  if (result === 'missing') return res.status(404).json({ error: 'Trecho indisponível.' })
  if (result === 'capacity') return res.status(422).json({ error: 'Na moto, registre um passageiro por trecho.' })
  res.json({ ok: true })
})
app.post('/api/journeys/:id/boardings', async (req, res) => {
  const data = z.object({ count: z.number().int().min(1).max(100), fare: cents.optional() }).parse(req.body)
  const boarding = await prisma.$transaction(async tx => {
    const journey = await tx.journey.findFirst({
      where: { id: req.params.id, activeUserId: res.locals.user.id },
      include: { vehicle: { select: { type: true } } },
    })
    if (!journey) return null
    if (journey.vehicle.type === 'motorcycle' && data.count > 1) return 'motorcycle' as const
    return tx.boarding.create({ data: {
      journeyId: journey.id, legIndex: journey.pointB ? journey.arrivals : null, count: data.count, fare: data.fare ?? journey.fare, leg: (journey.pointB ? journey.arrivals % 2 : journey.turnedAt) ? 'return' : 'outbound',
    } })
  }, { isolationLevel: 'Serializable' })
  if (boarding === 'motorcycle') return res.status(422).json({ error: 'Na moto, registre um passageiro por embarque.' })
  if (!boarding) return res.status(404).json({ error: 'Jornada ativa indisponível.' })
  res.status(201).json(boarding)
})
app.post('/api/journeys/:id/boardings/undo', async (req, res) => {
  const { boardingId } = z.object({ boardingId: id }).parse(req.body)
  const journeyId = req.params.id
  const userId = res.locals.user.id as string
  const result = await prisma.$transaction(async tx => {
    const journey = await tx.journey.findFirst({ where: { id: journeyId, activeUserId: userId }, select: { id: true } })
    if (!journey) return 'missing'
    const target = await tx.boarding.findFirst({ where: { id: boardingId, journeyId } })
    if (!target) return 'done'
    const latest = await tx.boarding.findFirst({
      where: { journeyId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true },
    })
    if (latest?.id !== boardingId) return 'changed'
    await tx.boarding.delete({ where: { id: boardingId } })
    if (target.legIndex !== null && !await tx.boarding.findFirst({
      where: { journeyId, legIndex: target.legIndex }, select: { id: true },
    })) {
      await tx.completedLeg.updateMany({ where: { journeyId, index: target.legIndex, review: 'boarded' },
        data: { review: 'pending' } })
    }
    return 'done'
  }, { isolationLevel: 'Serializable' })
  if (result === 'missing') return res.status(404).json({ error: 'Jornada ativa indisponível.' })
  if (result === 'changed') return res.status(409).json({ error: 'Há um embarque mais recente. Atualize e tente novamente.' })
  res.json({ ok: true })
})
app.post('/api/journeys/:id/:action', async (req, res) => {
  const action = z.enum(['turn', 'finish']).parse(req.params.action)
  const { km, fuelPrice } = z.object({ km: odometer, fuelPrice: cents.optional() }).parse(req.body)
  const where = { id: req.params.id, activeUserId: res.locals.user.id }
  const journey = await prisma.journey.findFirst({ where })
  if (!journey) return res.status(404).json({ error: 'Jornada ativa indisponível.' })
  if (km < (journey.turnKm ?? journey.startKm)) return res.status(422).json({ error: 'Informe uma quilometragem a partir da última leitura.' })
  if (action === 'turn' && journey.pointB) return res.status(409).json({ error: 'As chegadas nesta jornada são registradas pelo GPS.' })
  if (action === 'turn' && journey.turnedAt) return res.status(409).json({ error: 'A volta já começou.' })
  const now = new Date()
  const result = await prisma.journey.updateMany({
    where: { ...where, turnedAt: journey.turnedAt },
    data: action === 'turn'
      ? { turnKm: km, turnedAt: now, returnFuelPrice: fuelPrice ?? journey.outboundFuelPrice }
      : { endKm: km, endedAt: now, activeUserId: null },
  })
  if (!result.count) return res.status(409).json({ error: 'A jornada mudou. Atualize e tente novamente.' })
  if (action === 'turn') return res.json({ ok: true })
  const [boardings, expenses] = await Promise.all([
    prisma.boarding.findMany({ where: { journeyId: journey.id }, select: { count: true, fare: true } }),
    prisma.entry.aggregate({
      where: { userId: journey.userId, kind: 'expense', createdAt: { gte: journey.startedAt, lte: now } },
      _sum: { amount: true },
    }),
  ])
  const firstKm = (journey.turnKm ?? km) - journey.startKm
  const returnKm = journey.turnKm === null ? 0 : km - journey.turnKm
  const returnPrice = journey.returnFuelPrice ?? journey.outboundFuelPrice
  const fuel = (firstKm > 0 && !journey.outboundFuelPrice) || (returnKm > 0 && !returnPrice)
    ? null : Math.round(firstKm / journey.efficiency * journey.outboundFuelPrice) + Math.round(returnKm / journey.efficiency * returnPrice)
  const revenue = boardings.reduce((sum, boarding) => sum + boarding.fare * boarding.count, 0)
  const otherExpenses = expenses._sum.amount ?? 0
  const profit = fuel === null ? null : revenue - fuel - otherExpenses
  const hours = (now.getTime() - journey.startedAt.getTime()) / 3_600_000
  res.json({ ok: true, closing: {
    startedAt: journey.startedAt, endedAt: now, distance: km - journey.startKm,
    passengers: boardings.reduce((sum, boarding) => sum + boarding.count, 0),
    revenue, fuel, otherExpenses, profit, perHour: profit === null || hours <= 0 ? null : Math.round(profit / hours),
  } })
})
app.post('/api/entries', async (req, res) => {
  const data = z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('fuel'), vehicleId: id, liters: positive.optional(),
      amount: cents, fuelUnitPrice: unitPrice.optional(), station: station.optional(),
    }),
    z.object({ kind: z.literal('expense'), label, amount: cents }),
  ]).parse(req.body)
  const userId = res.locals.user.id as string
  if (data.kind === 'expense') return res.status(201).json(await prisma.entry.create({ data: { ...data, userId } }))

  const vehicle = await prisma.vehicle.findFirst({ where: { userId, id: data.vehicleId } })
  if (!vehicle) return res.status(404).json({ error: 'Veículo indisponível.' })
  const { station: selectedStation, fuelUnitPrice, liters, ...refill } = data
  if ((!fuelUnitPrice && !liters) || (selectedStation && !fuelUnitPrice)) {
    return res.status(422).json({ error: 'Informe o preço unitário do combustível.' })
  }
  const price = fuelUnitPrice ?? Math.max(1, Math.round(refill.amount / liters!))
  const entry = await prisma.$transaction(async tx => {
    const created = await tx.entry.create({ data: {
      ...refill, userId, label: 'Abastecimento', stationName: selectedStation?.name,
      liters: fuelUnitPrice ? refill.amount / fuelUnitPrice : liters,
      fuelUnitPrice: price,
    } })
    const unpriced = { userId, vehicleId: vehicle.id }
    await tx.journey.updateMany({ where: { ...unpriced, outboundFuelPrice: 0 }, data: { outboundFuelPrice: price } })
    await tx.journey.updateMany({ where: { ...unpriced, returnFuelPrice: 0 }, data: { returnFuelPrice: price } })
    if (selectedStation && fuelUnitPrice) {
      const { id: stationId, ...details } = selectedStation
      const quote = { ...details, unitPrice: fuelUnitPrice }
      await tx.stationPrice.upsert({
        where: { stationId_fuel: { stationId, fuel: vehicle.fuel } },
        create: { ...quote, stationId, fuel: vehicle.fuel }, update: quote,
      })
    }
    return created
  })
  res.status(201).json(entry)
})
app.post('/api/goals', async (req, res) => {
  const data = z.object({ period: z.enum(periods), amount: cents }).parse(req.body)
  const userId = res.locals.user.id
  res.json(await prisma.goal.upsert({
    where: { userId_period: { userId, period: data.period } },
    create: { userId, ...data }, update: { amount: data.amount },
  }))
})
app.use('/api', (_req, res) => { res.status(404).json({ error: 'Recurso indisponível.' }) })
if (!production) {
  app.use(express.static(resolve('dist')))
  app.get('/', (_req, res) => res.sendFile(resolve('dist/index.html')))
}
const errors: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof z.ZodError || error.status === 400 || error.status === 413) {
    res.status(error.status === 413 ? 413 : 422).json({ error: 'Confira os campos e tente novamente.' })
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
    const target = String(error.meta?.target ?? '')
    const message = target.includes('email') ? 'Já existe uma conta com esse e-mail.'
      : target.includes('activeUserId') ? 'Encerre a jornada atual antes de iniciar outra.'
      : 'O registro foi atualizado. Atualize e tente novamente.'
    res.status(409).json({ error: message })
  } else {
    console.error(error.name, error.code)
    res.status(500).json({ error: 'Erro ao acessar o servidor.' })
  }
}
app.use(errors)

export { app, prisma }
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 3001)
  app.listen(port, production ? '0.0.0.0' : '127.0.0.1', () => console.log('AlternaDrive API · porta ' + port))
}


