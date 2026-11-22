// The still part of Halftone Dawn (variant 0) and Halftone Dusk (variant 1): the paper and both ink plates, every dot
// at its own printed size, with no animation. shader.ts repaints the whole sheet over it on the GPU, so the dots can
// swell and thin in their travelling waves; this still is what shows where no shader plays.
// Derived from theme-examples' scenes/halftone-dawn.ts (Apache License 2.0). Changed: the wave animations, their
// keyframes and the reduced-motion rule are removed; each dot is drawn at its rest width `--w` (what the original shows
// under Reduce Motion), so dots are grouped by width alone and the width is a plain stroke-width.

interface Stock {
  paperTop: string
  paperFoot: string
  coral: string
  coralOpacity: number
  blue: string
  blueOpacity: number
  blend: string
}

const WIDTH = 1600
const HEIGHT = 1000
const PITCH = 11
const SCREEN_DEGREES = 15
const SUN = { x: 1408, y: 786, radius: 220 }
// Inks multiply on cream like real overprint; on the dark stock multiply would vanish, so they sit on top.
const DAWN_STOCK: Stock = { paperTop: '#f6ecdc', paperFoot: '#f2dcc6', coral: '#d45c3d', coralOpacity: 1, blue: '#6283b6', blueOpacity: 1, blend: 'multiply' }
const DUSK_STOCK: Stock = { paperTop: '#1b1f30', paperFoot: '#272a3f', coral: '#d9603a', coralOpacity: 0.86, blue: '#7f90ba', blueOpacity: 0.7, blend: 'normal' }

function smooth(from: number, to: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

/** A single rounded hill: a bell of the given height and half-width. */
function bell(x: number, peakX: number, halfWidth: number, height: number): number {
  const t = (x - peakX) / halfWidth
  return height * Math.exp(-t * t)
}

/** 0 under the reading column, 1 at the side panels. */
function awayFromColumn(x: number): number {
  return Math.max(1 - smooth(300, 520, x), smooth(1080, 1260, x))
}

/** Far crest: one range across the whole sheet. */
function farCrest(x: number): number {
  return 968 - 34 * awayFromColumn(x) - bell(x, 150, 250, 205) - bell(x, 1600, 330, 135) - 13 * Math.sin(x / 150 + 1) - 5 * Math.sin(x / 53)
}

/** Near crest: darker foothills at the two sides only. */
function nearCrest(x: number): number {
  return 1014 - bell(x, -50, 270, 190) - bell(x, 1340, 250, 100) - 7 * Math.sin(x / 90 + 2)
}

/** Blue tone: a pale far range and darker foothills, lighter towards their feet. */
function hillTone(x: number, y: number): number {
  const near = 0.42 * smooth(0, 36, y - nearCrest(x)) - 0.12 * smooth(36, 150, y - nearCrest(x))
  const far = 0.21 * smooth(0, 36, y - farCrest(x)) - 0.06 * smooth(36, 160, y - farCrest(x))
  return Math.max(near, far, 0) * (0.3 + 0.7 * awayFromColumn(x))
}

/** Coral tone: a level body, a soft rim, then a short halo, hidden behind the hills. */
function sunTone(x: number, y: number): number {
  const d = Math.hypot(x - SUN.x, y - SUN.y)
  const behindHills = 1 - smooth(2, 38, y - Math.min(farCrest(x), nearCrest(x)))
  const body = d < SUN.radius ? 0.37 * (1 - Math.pow(d / SUN.radius, 4)) : 0
  const glow = 0.06 * Math.pow(1 - smooth(0, 150, d - SUN.radius * 0.9), 1.3)
  return Math.max(body, glow) * behindHills
}

/** Dots of one ink, one path per diameter, on the shared tilted lattice (the second ink half a cell over). */
function screen(toneAt: (x: number, y: number) => number, halfCell: boolean): string {
  const turn = (SCREEN_DEGREES * Math.PI) / 180
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const reach = Math.ceil(2000 / PITCH)
  const offset = halfCell ? 0.5 : 0
  const groups = new Map<number, string>()
  for (let i = -reach; i <= reach; i += 1) {
    for (let j = -reach; j <= reach; j += 1) {
      const x = 800 + ((i + offset) * cos - (j + offset) * sin) * PITCH
      const y = 500 + ((i + offset) * sin + (j + offset) * cos) * PITCH
      if (x < -6 || x > WIDTH + 6 || y < -6 || y > HEIGHT + 6) continue
      const diameter = 2 * PITCH * Math.sqrt(toneAt(x, y) / Math.PI)
      if (diameter < 2.3) continue
      const width = Math.round(diameter * 2) / 2
      groups.set(width, (groups.get(width) ?? '') + `M${x.toFixed(1)} ${y.toFixed(1)}h0`)
    }
  }
  let markup = ''
  for (const [width, d] of groups) {
    markup += `<path stroke-width="${width}" d="${d}"/>`
  }
  return markup
}

/** One sheet: the same two plates on the given stock. */
function sheetSvg(stock: Stock): string {
  const sun = screen(sunTone, false)
  const hills = screen(hillTone, true)
  const style = `.ink{mix-blend-mode:${stock.blend}}.ink path{fill:none;stroke-linecap:round}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" font-family="monospace" color="#888"><style>${style}</style><defs>
<linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${stock.paperTop}"/><stop offset="1" stop-color="${stock.paperFoot}"/></linearGradient></defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#paper)"/>
<g class="ink" stroke="${stock.coral}" stroke-opacity="${stock.coralOpacity}">${sun}</g>
<g class="ink" stroke="${stock.blue}" stroke-opacity="${stock.blueOpacity}">${hills}</g>
</svg>`
}

const cache: [string | undefined, string | undefined] = [undefined, undefined]

/** Variant 0 is Halftone Dawn (cream stock, light windows); variant 1 Halftone Dusk (night-blue stock, dark windows). */
export function stillSvg(variant: 0 | 1): string {
  const hit = cache[variant]
  if (hit !== undefined) return hit
  const svg = sheetSvg(variant === 1 ? DUSK_STOCK : DAWN_STOCK)
  cache[variant] = svg
  return svg
}
