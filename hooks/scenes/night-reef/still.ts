// The still part of Night Reef: the dark water, the deep glow in the corner, the faint grid, the grain, the reef band
// and the faint specks in the reading column, with no animation. shader.ts draws everything that moves over it.
// Derived from theme-examples' scenes/night-reef.ts (Apache License 2.0). Changed: every animation is removed. The
// turtle, the manta ray, their halos, wakes and ripples, the four plankton swarms and the two moonlight bands are
// left out, because they move and the shader draws them (in the still too they would show twice). The reef's
// anemones and amber tips and the middle specks stay, held at the dimmest point of their pulse, so the shader can
// brighten them to the right value from there.

type Cell = { x: number; y: number; kind: string }
type Paint = { tile: string; glyph: string; opacity?: number }

const CELL = 20
const GLYPHS = '$%tSX:;t$%S'
const TEAL = '#4fe6cf'
const TEAL_INK = '#35c4ae'
const WARM = '#e0a060'
const WARM_INK = '#c98a4c'

/** Tile kinds: what a map letter paints. Glyphs sit one shade off their tile: texture, never text. */
const KINDS: Record<string, Paint> = {
  x: { tile: '#16305c', glyph: '#1e3c6c' },
  y: { tile: '#1c4468', glyph: '#255478' },
}

/** A band of reef along the bottom right, three to six cells tall, uneven. */
const CORAL = `
....................yy......
.....yy............yyyy..y..
....yyyy....y.....yyxyyyyyy.
.y.yyxyy...yyy..yyyxxyyxxyy.
yyyyxxyyy.yyxyy.yxyxxyxxxyyy
yxyxxxxyyyyxxxyyyxxxxxxxxxyx
xxxxxxxxxxxxxxxxxxxxxxxxxxxx
`

// The lowest opacity of each pulse in the original; shader.ts brightens from here.
const RIM_LOW = 0.14
const EMBER_LOW = 0.35
const SPECK_LOW = 0.28

function hash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function cellsOf(map: string): Cell[] {
  const cells: Cell[] = []
  const lines = map.split('\n').filter(line => line.length > 0).map(line => (line === ',' ? '' : line))
  lines.forEach((line, y) => {
    for (let x = 0; x < line.length; x += 1) {
      const kind = line[x] ?? '.'
      if (kind !== '.') cells.push({ x, y, kind })
    }
  })
  return cells
}

function glyphAt(x: number, y: number): string {
  return GLYPHS[(x * 7 + y * 13 + ((x * y) % 3) + 22) % GLYPHS.length] ?? ''
}

function tilePath(list: Cell[]): string {
  return list.map(c => `M${c.x * CELL + 1} ${c.y * CELL + 1}h18v18h-18z`).join('')
}

function glyphRows(list: Cell[], fill: string): string {
  const rows = new Map<number, Cell[]>()
  for (const c of list) {
    const row = rows.get(c.y) ?? []
    row.push(c)
    rows.set(c.y, row)
  }
  let out = ''
  for (const [y, row] of rows) {
    const xs = row.map(c => c.x * CELL + 10).join(' ')
    const text = row.map(c => glyphAt(c.x, y)).join('')
    out += `<text x="${xs}" y="${y * CELL + 15}" fill="${fill}">${text}</text>`
  }
  return out
}

/** Tiles of one kind in a single path; glyphs in one text per row with a per-glyph x list. */
function mosaic(cells: Cell[]): string {
  const byKind = new Map<string, Cell[]>()
  for (const cell of cells) {
    const list = byKind.get(cell.kind) ?? []
    list.push(cell)
    byKind.set(cell.kind, list)
  }
  let out = ''
  for (const [kind, list] of byKind) {
    const paint = KINDS[kind]
    if (paint === undefined) continue
    const faded = paint.opacity === undefined ? '' : ` opacity="${paint.opacity}"`
    out += `<g${faded}><path d="${tilePath(list)}" fill="${paint.tile}" stroke="#aab8ff" stroke-opacity="0.06"/>${glyphRows(list, paint.glyph)}</g>`
  }
  return out
}

/** A set of tiles that glow together, held still at the low point of its pulse. */
function litGroup(list: Cell[], colour: string, ink: string, opacity: number): string {
  if (list.length === 0) return ''
  return `<g opacity="${opacity}"><path d="${tilePath(list)}" fill="${colour}"/>${glyphRows(list, ink)}</g>`
}

/** The reef band: dark tiles, a few teal anemones low down, and four single amber tips, never two side by side. */
function reefBand(column: number, row: number): string {
  const cells = cellsOf(CORAL).map(c => ({ x: c.x + column, y: c.y + row, kind: c.kind }))
  const filled = new Set(cells.map(c => `${c.x},${c.y}`))
  const anemones = cells.filter(c => c.y > row + 2 && hash(c.x * 3 + 9, c.y * 11) < 0.08)
  const tips = cells.filter(c => !filled.has(`${c.x},${c.y - 1}`) && c.x % 6 === 2).slice(0, 4)
  return mosaic(cells) + litGroup(anemones, TEAL, TEAL_INK, RIM_LOW) + litGroup(tips, WARM, WARM_INK, EMBER_LOW)
}

/** A thin scatter of the faintest specks through the reading column, so the middle is water and not a hole. */
function middleScatter(): string {
  let d = ''
  for (let i = 0; i < 18; i += 1) d += `M${Math.round(470 + hash(51, i) * 700)} ${Math.round(60 + hash(52, i) * 860)}h1.5v1.5h-1.5z`
  return `<path opacity="${SPECK_LOW}" d="${d}" fill="${TEAL}" fill-opacity="0.3"/>`
}

/** Grain: a tile of barely visible light and dark pixels that dithers the dark gradient so it cannot band. */
function grainPattern(): string {
  let light = ''
  let dark = ''
  for (let i = 0; i < 150; i += 1) {
    const x = Math.floor(hash(11, i) * 48) * 2
    const y = Math.floor(hash(12, i) * 48) * 2
    if (i % 2 === 0) light += `M${x} ${y}h2v2h-2z`
    else dark += `M${x} ${y}h2v2h-2z`
  }
  return `<pattern id="grain" width="96" height="96" patternUnits="userSpaceOnUse"><path d="${light}" fill="#9db4ff" fill-opacity="0.022"/><path d="${dark}" fill="#000" fill-opacity="0.09"/></pattern>`
}

function nightReefStill(): string {
  const style = `
text{font:700 13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-anchor:middle}`

  const defs = `
<radialGradient id="water" gradientUnits="userSpaceOnUse" cx="720" cy="420" r="1050"><stop offset="0" stop-color="#1b2d5a"/><stop offset="0.3" stop-color="#13224a"/><stop offset="0.6" stop-color="#0a1430"/><stop offset="0.85" stop-color="#060c1f"/><stop offset="1" stop-color="#040816"/></radialGradient>
<radialGradient id="deep" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#0d3a56" stop-opacity="0.6"/><stop offset="0.35" stop-color="#0d3a56" stop-opacity="0.34"/><stop offset="0.7" stop-color="#0d3a56" stop-opacity="0.1"/><stop offset="1" stop-color="#0d3a56" stop-opacity="0"/></radialGradient>
<pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M0 0.5h20M0.5 0v20" stroke="#9db4ff" stroke-opacity="0.045" fill="none"/></pattern>
<linearGradient id="edgeward" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="0.24" stop-color="#fff" stop-opacity="0"/><stop offset="0.74" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient>
<mask id="edges" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="1000"><rect width="1600" height="1000" fill="url(#edgeward)"/></mask>
${grainPattern()}`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" font-family="monospace" color="#888"><style>${style}</style><defs>${defs}</defs>
<rect width="1600" height="1000" fill="url(#water)"/>
<ellipse cx="1640" cy="1040" rx="900" ry="640" fill="url(#deep)"/>
<rect width="1600" height="1000" fill="url(#grid)" opacity="0.35"/><rect width="1600" height="1000" fill="url(#grid)" mask="url(#edges)"/>
<rect width="1600" height="1000" fill="url(#grain)"/>
${middleScatter()}
${reefBand(64, 44)}
</svg>`
}

const cache: { svg?: string } = {}

/** Night Reef has one look, so both variants are the same still. */
export function stillSvg(variant: 0 | 1): string {
  void variant
  cache.svg ??= nightReefStill()
  return cache.svg
}
