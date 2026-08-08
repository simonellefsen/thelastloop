import type { CoatColor } from './types'

export const coatColors: Record<CoatColor, string> = {
  gold: '#f5be3e',
  berry: '#d85d67',
  ocean: '#3f8d9f',
}

const coatOrder: CoatColor[] = ['gold', 'berry', 'ocean']

export function nextCoatColor(current: CoatColor): CoatColor {
  return coatOrder[(coatOrder.indexOf(current) + 1) % coatOrder.length]
}
