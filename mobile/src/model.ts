import { parseNumber } from '../../src/localized-number'
import type { Point } from '../../src/arrival'

export type { Point }
export type Place = Point & { label: string }
export type Boarding = { id: string; count: number; fare: number; createdAt: string }
export type Journey = {
  id: string; vehicleId: string; origin: string; destination: string; startKm: number; startedAt: string; arrivals: number
  boardings: Boarding[]; pointA: Point | null; pointB: Point | null; fare: number; vehicle: { name: string; type: string }
}
export type Summary = { period: string; passengers: number; revenue: number; profit: number | null }
export type Vehicle = {
  id: string; name: string; type: 'car' | 'motorcycle'; fuel: string; tank: number | null; capacity: number
  efficiency: number; cityEfficiency: number | null; highwayEfficiency: number | null; urbanShare: number; catalogId: string | null
}
export type Dashboard = {
  user: { name: string; email: string; carColor?: string | null }
  vehicles: Vehicle[]
  defaults: { defaultOrigin: string | null; defaultDestination: string | null; defaultFare: number | null; defaultPointA: Point | null; defaultPointB: Point | null }
  active: Journey | null
  nextReportingDay: string
  summaries: Summary[]
}
export type Closing = { revenue: number; profit: number | null; distance: number; startedAt: string; endedAt: string; passengers: number; fuel: number | null; otherExpenses: number }
export const money = (value: number | null) => value === null ? 'Pendente' : (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const numeric = parseNumber
