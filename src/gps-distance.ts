import { distanceMeters, type Point } from './arrival'

export type DistanceFix = Point & { timestamp: number; accuracy: number; speed: number | null }
export type DistanceTrack = { meters: number; samples: number; last?: DistanceFix }
export const emptyTrack: DistanceTrack = { meters: 0, samples: 0 }

export function accumulateDistance(track: DistanceTrack, fix: DistanceFix): DistanceTrack {
  if (!Number.isFinite(fix.timestamp) || fix.accuracy > 35 || fix.accuracy < 0) return track
  const last = track.last
  if (!last) return { ...track, last: fix, samples: 1 }
  const elapsed = (fix.timestamp - last.timestamp) / 1000
  if (elapsed <= 0) return track
  const distance = distanceMeters(last, fix)
  if (elapsed > 90 || distance / elapsed > 70) return { ...track, last: fix }
  const stopped = fix.speed != null && fix.speed >= 0 && fix.speed < .7
  const uncertainty = fix.accuracy + last.accuracy
  const noise = stopped ? Math.max(12, uncertainty)
    : fix.speed == null || fix.speed < 0 ? Math.max(8, uncertainty * .6) : Math.max(4, uncertainty * .38)
  if (distance < noise) {
    return stopped ? { ...track, last: fix, samples: track.samples + 1 } : track
  }
  return { meters: track.meters + distance, samples: track.samples + 1, last: fix }
}
