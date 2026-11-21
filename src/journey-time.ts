export function workDuration(startedAt: string, end: string | number) {
  const finish = typeof end === 'string' ? Date.parse(end) : end
  const minutes = Math.max(0, Math.floor((finish - Date.parse(startedAt)) / 60_000))
  const hours = Math.floor(minutes / 60)
  if (hours === 0) return minutes === 0 ? '< 1 min' : minutes + ' min'
  return hours + ' h ' + String(minutes % 60).padStart(2, '0') + ' min'
}

export function navigationEstimate(distance: number, duration: number, remaining: number, speed?: number) {
  const fraction = Math.max(0, Math.min(1, remaining))
  const meters = distance * fraction
  const routeSpeed = distance / duration
  // Blend the routing estimate with recent movement without extrapolating brief slowdowns.
  const observed = speed !== undefined && speed >= 1 && Number.isFinite(speed)
    ? Math.max(routeSpeed * .55, Math.min(routeSpeed * 1.5, speed)) : routeSpeed
  const seconds = routeSpeed > 0 ? meters / (routeSpeed * .7 + observed * .3) : duration * fraction
  return { meters, seconds }
}
