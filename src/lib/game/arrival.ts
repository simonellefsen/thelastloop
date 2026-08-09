import type { DistrictId } from './types'

export interface ArrivalCopy {
  place: string
  route: string
  copy: string
}

/** Brief, non-interactive place cards shown when the loop reaches a district. */
export const arrivalCopy: Record<DistrictId, ArrivalCopy> = {
  hillside: {
    place: 'RAVNBRO',
    route: 'SUNSET LOOP',
    copy: 'A river-town station waits for its name.',
  },
  harbour: {
    place: 'HARBOUR WORKS',
    route: 'LOW TIDE LINE',
    copy: 'The dock clock has fallen silent by the water.',
  },
  observatory: {
    place: 'MOONHILL',
    route: 'NIGHT SIGNAL',
    copy: 'The telescope is listening for a lost moonlight.',
  },
}
