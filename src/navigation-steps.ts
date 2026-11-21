export type RoutingStep = {
  distance: number
  name: string
  maneuver: { type: string; modifier?: string; exit?: number }
}

export function nextManeuver(legs: { steps: RoutingStep[] }[], traveledMeters: number) {
  let offset = 0
  for (const [legIndex, leg] of legs.entries()) {
    for (const step of leg.steps) {
      const at = offset
      offset += step.distance
      const { type, modifier, exit } = step.maneuver
      if (at + 8 < traveledMeters || type === 'depart' || (type === 'arrive' && legIndex < legs.length - 1)) continue
      const direction = modifier?.includes('right') ? 'right' : modifier?.includes('left') ? 'left' : 'straight'
      const turn = direction === 'right' ? 'direita' : direction === 'left' ? 'esquerda' : ''
      if (type === 'arrive') return { direction: 'arrive', instruction: 'Chegada ao ponto', street: '', meters: Math.max(0, at - traveledMeters) }
      if (type === 'notification' || type === 'new name' || (type === 'continue' && !turn)) continue
      const instruction = type.includes('roundabout') || type.includes('rotary')
        ? exit ? 'Na rotatória, pegue a saída ' + exit : 'Entre na rotatória'
        : modifier === 'uturn' ? 'Faça o retorno'
          : type === 'fork' || type === 'merge' ? (turn ? 'Mantenha-se à ' + turn : 'Siga em frente')
            : turn ? 'Vire à ' + turn : 'Siga em frente'
      return { direction: modifier === 'uturn' ? 'uturn' : direction, instruction, street: step.name, meters: Math.max(0, at - traveledMeters) }
    }
  }
  return null
}
