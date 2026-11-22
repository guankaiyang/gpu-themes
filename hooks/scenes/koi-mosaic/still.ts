// The still part of Koi Mosaic: water, deep terraces, the tile grid, the stone bank and the lily pads, with no animation.
// The koi, their shadows, the ripples and the swell are drawn over it by koi-shader.ts on the GPU.
// Derived from theme-examples' scenes/koi-mosaic.ts (Apache License 2.0, see ../LICENSE). Changed: every animated
// layer is removed, and the lily pads no longer rock.

const CELL = 20
const COLUMNS = 80
const ROWS = 50

type Cell = { x: number; y: number; kind: string }
type Paint = { tile: string; glyph: string; glyphOpacity: number; glyphs: string }
type Seed = { x: number; y: number; tone: string }

/** A deterministic 0..1 value for a cell, so every build is the same. */
function hashOf(x: number, y: number, salt: number): number {
  let h = Math.imul(x + 11, 374761393) ^ Math.imul(y + 7, 668265263) ^ Math.imul(salt + 3, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967296
}

function tileAt(x: number, y: number): string {
  return `M${x * CELL + 1} ${y * CELL + 1}h18v18h-18z`
}

/** Whole cells in one path, each row's neighbours joined into one rectangle to keep the string short. */
function blocksOf(keys: Iterable<string>, size: number): string {
  const rows = new Map<number, number[]>()
  for (const key of keys) {
    const parts = key.split(',').map(Number)
    const x = parts[0] ?? 0
    const y = parts[1] ?? 0
    const list = rows.get(y) ?? []
    list.push(x)
    rows.set(y, list)
  }
  let d = ''
  for (const [y, list] of rows) {
    list.sort((a, b) => a - b)
    let from = list[0] ?? 0
    for (let i = 1; i <= list.length; i += 1) {
      const previous = list[i - 1] ?? 0
      const current = list[i]
      if (current === previous + 1) continue
      const width = (previous - from + 1) * size
      d += `M${from * size} ${y * size}h${width}v${size}h-${width}z`
      from = current ?? 0
    }
  }
  return d
}

/** Tile kinds: what a cell letter paints. */
const KINDS: Record<string, Paint> = {
  a: { tile: '#2f8552', glyph: '#8fd09f', glyphOpacity: 0.5, glyphs: 'o:o;' },
  b: { tile: '#57b56f', glyph: '#1f6b45', glyphOpacity: 0.3, glyphs: ':;o' },
  c: { tile: '#267a50', glyph: '#8fd09f', glyphOpacity: 0.25, glyphs: ':;' },
  p: { tile: '#edb4cc', glyph: '#ffffff', glyphOpacity: 0.7, glyphs: 'o' },
  q: { tile: '#eec25a', glyph: '#d9a93a', glyphOpacity: 0.8, glyphs: '*' },
  s: { tile: '#c9bf9a', glyph: '#6f8378', glyphOpacity: 0, glyphs: ':.;.' },
  t: { tile: '#8ea398', glyph: '#64796e', glyphOpacity: 0.4, glyphs: '.:;' },
  u: { tile: '#d9cfa8', glyph: '#7d9085', glyphOpacity: 0, glyphs: '.;:.' },
  v: { tile: '#7d968c', glyph: '#b9c8bd', glyphOpacity: 0.35, glyphs: ':.' },
}

/** Tiles of one kind in a single path; glyphs in one text per row with a per-glyph x list. */
function mosaic(cells: readonly Cell[]): string {
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
    out += `<path d="${list.map(c => tileAt(c.x, c.y)).join('')}" fill="${paint.tile}" stroke="#fff" stroke-opacity="0.22"/>`
    const rows = new Map<number, Cell[]>()
    for (const c of list) {
      const row = rows.get(c.y) ?? []
      row.push(c)
      rows.set(c.y, row)
    }
    for (const [y, row] of rows) {
      const xs = row.map(c => c.x * CELL + 10).join(' ')
      const text = row.map(c => paint.glyphs[Math.floor(hashOf(c.x, c.y, 5) * paint.glyphs.length)] ?? '').join('')
      out += `<text x="${xs}" y="${y * CELL + 14.5}" fill="${paint.glyph}" opacity="${paint.glyphOpacity}">${text}</text>`
    }
  }
  return out
}

/** Darker water around a thing: its footprint grown by `reach` cells, moved by (shiftX, shiftY) cells, on the grid so the edge steps. */
function halo(cells: readonly Cell[], reach: number, shiftX: number, shiftY: number, opacity: number): string {
  const seen = new Set<string>()
  for (const c of cells) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      for (let dy = -reach; dy <= reach; dy += 1) {
        if (Math.abs(dx) + Math.abs(dy) > reach + (reach > 1 ? 1 : 0)) continue
        seen.add(`${c.x + dx + shiftX},${c.y + dy + shiftY}`)
      }
    }
  }
  return `<path d="${blocksOf(seen, CELL)}" fill="#0d5a66" opacity="${opacity}"/>`
}

/** A lily pad: a round cluster of green tiles with one notch cut to the middle. The shader repeats this test to hide the koi under it. */
function lilyPad(centerX: number, centerY: number, radius: number, notchDegrees: number, bloom: readonly [number, number] | null): Cell[] {
  const cells: Cell[] = []
  const notch = (notchDegrees * Math.PI) / 180
  const reach = Math.ceil(radius)
  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      const distance = Math.hypot(dx, dy)
      if (distance > radius) continue
      let off = Math.atan2(dy, dx) - notch
      while (off > Math.PI) off -= 2 * Math.PI
      while (off < -Math.PI) off += 2 * Math.PI
      if (distance > 0.6 && Math.abs(off) < 0.24 + 0.28 / Math.max(distance, 1)) continue
      const x = centerX + dx
      const y = centerY + dy
      let kind = 'a'
      if (distance > radius - 0.85) kind = 'c'
      else if (radius > 3 && Math.abs(distance - radius * 0.5) < 0.5) kind = 'b'
      cells.push({ x, y, kind })
    }
  }
  if (bloom !== null) {
    for (const c of cells) {
      const dx = c.x - (centerX + bloom[0])
      const dy = c.y - (centerY + bloom[1])
      if (dx === 0 && dy === 0) c.kind = 'q'
      else if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) c.kind = 'p'
    }
  }
  return cells
}

/** The pond's stone rim in the bottom right corner. The shader repeats the ring test to hide the koi under it. */
function stoneBank(): Cell[] {
  const seeds: Seed[] = []
  for (let n = 0; n < 40; n += 1) seeds.push({ x: 62 + hashOf(n, 1, 31) * 20, y: 34 + hashOf(n, 2, 32) * 18, tone: 'su'[Math.floor(hashOf(n, 3, 33) * 2)] ?? 's' })
  const cells: Cell[] = []
  for (let y = 30; y < ROWS; y += 1) {
    for (let x = 60; x < COLUMNS; x += 1) {
      const fromCorner = Math.hypot((x + 0.5 - 80) / 1.3, y + 0.5 - 50) + (hashOf(Math.floor(x / 2), Math.floor(y / 2), 34) - 0.5) * 0.9
      if (fromCorner < 4.4 || fromCorner > 6.9) continue
      let tone = 's'
      let bestDistance = Infinity
      for (const seed of seeds) {
        const d = Math.hypot(seed.x - x, seed.y - y)
        if (d < bestDistance) {
          bestDistance = d
          tone = seed.tone
        }
      }
      cells.push({ x, y, kind: hashOf(x, y, 35) < 0.06 ? 'c' : tone })
    }
  }
  return cells
}

/** Deeper water in terraces growing out of a corner; the edge of each is a one-tile checker. */
function stairZone(cornerX: number, cornerY: number, radius: number, squash: number, opacity: number, fill: string): string {
  const seen = new Set<string>()
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLUMNS; x += 1) {
      const distance = Math.hypot(x + 0.5 - cornerX, (y + 0.5 - cornerY) * squash)
      const coarse = Math.sin(x * 0.45 + cornerY) * 1.2 + Math.sin(y * 0.6 + cornerX) * 1.2
      const dither = (x + y) % 2 === 0 ? 1.1 : -1.1
      if (distance < radius + coarse + dither) seen.add(`${x},${y}`)
    }
  }
  return `<path d="${blocksOf(seen, CELL)}" fill="${fill}" opacity="${opacity}"/>`
}

/** A pad with its shadow one cell down and right. */
function pad(cells: readonly Cell[]): string {
  return `${halo(cells, 0, 1, 1, 0.3)}${mosaic(cells)}`
}

let built: string | undefined

/** The still scene, built once per load. */
export function koiMosaicStillSvg(): string {
  if (built !== undefined) return built

  const style = 'text{font:700 12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-anchor:middle}'
  const defs = `
<linearGradient id="water" x1="0" y1="0" x2="1" y2="0.62"><stop offset="0" stop-color="#6fc3bb"/><stop offset="0.2" stop-color="#90d5ca"/><stop offset="0.52" stop-color="#93d6cb"/><stop offset="0.74" stop-color="#4fb1b1"/><stop offset="1" stop-color="#17697d"/></linearGradient>
<pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M0 0.5h20M0.5 0v20" stroke="#f1fbf5" stroke-opacity="0.16" fill="none"/></pattern>
<linearGradient id="sides" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.24" stop-color="#fff" stop-opacity="0.18"/><stop offset="0.76" stop-color="#fff" stop-opacity="0.18"/><stop offset="0.97" stop-color="#fff" stop-opacity="1"/></linearGradient>
<mask id="outward" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="1000"><rect width="1600" height="1000" fill="url(#sides)"/></mask>`

  const stones = stoneBank()

  built = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" font-family="monospace" color="#888"><style>${style}</style><defs>${defs}</defs>
<rect width="1600" height="1000" fill="url(#water)"/>
${[28, 24, 20, 16, 12].map(radius => stairZone(86, 56, radius, 1.1, 0.045, '#0f6a73')).join('')}${[27, 23, 19, 15, 11].map(radius => stairZone(-4, -4, radius, 1.3, 0.04, '#0f6a73')).join('')}${stairZone(84, -6, 18, 1.2, 0.05, '#12767f')}
<rect width="1600" height="1000" fill="url(#grid)" mask="url(#outward)"/>
${halo(stones, 1, 0, 0, 0.22)}${mosaic(stones)}
${pad(lilyPad(73, 20, 3.6, 150, [0, -1]))}${pad(lilyPad(75, 37, 2.6, 300, null))}${pad(lilyPad(7, 30, 3.6, 60, null))}
</svg>`

  return built
}
