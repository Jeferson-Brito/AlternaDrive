export function combinedEfficiency(city: number, highway: number | undefined, urbanShare: number) {
  const cityFraction = urbanShare / 100
  return 1 / (cityFraction / city + (1 - cityFraction) / (highway ?? city))
}
