import { parseNumber } from '../../src/localized-number'
import type { Point } from '../../src/arrival'

export type { Point }
export type Place = Point & { label: string }
export type Journey = {
  id: string; vehicleId: string; origin: string; destination: string; startKm: number; startedAt: string; arrivals: number
  pointA: Point | null; pointB: Point | null; fare: number; vehicle: { name: string; type: string }
}
export type Summary = { period: string; passengers: number; revenue: number; profit: number | null }
export type Dashboard = {
  user: { name: string }
  vehicles: { id: string; name: string }[]
  defaults: { defaultOrigin: string | null; defaultDestination: string | null; defaultFare: number | null; defaultPointA: Point | null; defaultPointB: Point | null }
  active: Journey | null
  summaries: Summary[]
}
export type Closing = { revenue: number; profit: number | null; distance: number; startedAt: string; endedAt: string }
export const money = (value: number | null) => value === null ? 'Pendente' : (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const numeric = parseNumber
