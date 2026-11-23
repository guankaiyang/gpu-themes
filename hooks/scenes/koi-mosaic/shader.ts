// Koi Mosaic's moving parts on the GPU, over the still pond in still.ts: two tile-mosaic koi that glide a cell per step
// down the right side and up the left, their two stepped shadows, the ring ripples, and the slow swell of deep water.
// Derived from theme-examples' scenes/koi-mosaic.ts (Apache License 2.0, see ../LICENSE): the same paths, tiles, colours
// and timings, drawn here instead of by CSS. The koi tables are generated from that file's maps.
//
// Coordinates: the scene is a 1600 x 1000 view box laid over the window with "xMidYMid slice", y down. The shader's
// points run y up, so every placement goes through `pointOf` and every pixel back through `vbOf`.
import {
  abs, atan, buffer, clamp, floor, fract, int, length, max, mix, mod, PI, picture, range, shader, shapes, size,
  smoothstep, table, time, unsigned, vec2, vec3, vec4,
  first,
} from 'claude-code/shader'
import type { Spot, Buffer, Pixel } from 'claude-code/shader'

const CELL = 20
const STEP_COUNT = 124
const SWIM_SECONDS = 273
const STEP_SECONDS = SWIM_SECONDS / STEP_COUNT
const KOHAKU_TILES = 123
const ALL_TILES = 246
const KOHAKU_START = 34
const TANCHO_START = 83

// Each step of the swim: the head's cell. Down the right lane, then up the left.
const STEPS = table([[72, -6], [71, -5], [71, -4], [70, -3], [70, -2], [69, -1], [68, 0], [68, 1], [68, 2], [68, 3], [68, 4], [68, 5], [68, 6], [69, 7], [69, 8], [70, 9], [70, 10], [71, 11], [71, 12], [71, 13], [71, 14], [71, 15], [70, 16], [70, 17], [69, 18], [69, 19], [68, 20], [68, 21], [67, 22], [67, 23], [67, 24], [67, 25], [68, 26], [68, 27], [68, 28], [69, 29], [70, 30], [70, 31], [70, 32], [70, 33], [70, 34], [70, 35], [69, 36], [69, 37], [68, 38], [68, 39], [67, 40], [66, 41], [65, 42], [65, 43], [64, 44], [64, 45], [64, 46], [64, 47], [64, 48], [65, 49], [65, 50], [66, 51], [66, 52], [66, 53], [66, 54], [66, 55], [11, 56], [11, 55], [11, 54], [11, 53], [10, 52], [10, 51], [10, 50], [9, 49], [9, 48], [8, 47], [8, 46], [8, 45], [8, 44], [9, 43], [9, 42], [10, 41], [10, 40], [11, 39], [12, 38], [12, 37], [13, 36], [13, 35], [13, 34], [13, 33], [12, 32], [12, 31], [11, 30], [11, 29], [10, 28], [9, 27], [9, 26], [9, 25], [8, 24], [8, 23], [9, 22], [9, 21], [9, 20], [10, 19], [10, 18], [11, 17], [11, 16], [12, 15], [12, 14], [12, 13], [12, 12], [12, 11], [12, 10], [11, 9], [11, 8], [10, 7], [10, 6], [10, 5], [9, 4], [9, 3], [9, 2], [10, 1], [10, 0], [11, -1], [11, -2], [12, -3], [13, -4], [13, -5]])
// Each tile: [slice behind the head, cells across the spine, colour row, pose * 5 + glyph].
// Pose 0 is the body, 1 the tail swept one way, 2 the other. Glyph 0 none, 1 and 2 light, 3 and 4 cream; odd two dots, even a ring.
const TILES = table([[0, -1, 3, 4], [0, 0, 3, 3], [0, 1, 4, 4], [1, -2, 12, 0], [1, -1, 1, 1], [1, 0, 4, 3], [1, 1, 1, 2], [1, 2, 13, 0], [2, -3, 5, 4], [2, -2, 0, 2], [2, -1, 0, 2], [2, 0, 1, 2], [2, 1, 1, 2], [2, 2, 5, 4], [2, 3, 4, 4], [3, -4, 16, 0], [3, -3, 2, 2], [3, -2, 1, 1], [3, -1, 1, 2], [3, 0, 0, 2], [3, 1, 0, 2], [3, 2, 2, 2], [3, 3, 3, 4], [3, 4, 17, 0], [4, -5, 15, 0], [4, -4, 15, 0], [4, -3, 1, 2], [4, -2, 0, 1], [4, -1, 2, 2], [4, 0, 1, 2], [4, 1, 2, 1], [4, 2, 1, 1], [4, 3, 4, 4], [4, 4, 17, 0], [4, 5, 17, 0], [5, -5, 16, 0], [5, -4, 16, 0], [5, -3, 0, 2], [5, -2, 2, 1], [5, -1, 2, 1], [5, 0, 1, 2], [5, 1, 0, 1], [5, 2, 2, 2], [5, 3, 0, 2], [5, 4, 17, 0], [5, 5, 15, 0], [6, -2, 0, 2], [6, -1, 1, 2], [6, 0, 0, 2], [6, 1, 5, 3], [6, 2, 0, 1], [7, -2, 5, 3], [7, -1, 3, 4], [7, 0, 4, 3], [7, 1, 5, 3], [7, 2, 3, 3], [8, -2, 5, 4], [8, -1, 4, 3], [8, 0, 3, 4], [8, 1, 3, 4], [8, 2, 5, 4], [9, -2, 3, 3], [9, -1, 4, 4], [9, 0, 1, 2], [9, 1, 4, 4], [9, 2, 5, 4], [10, -1, 2, 2], [10, 0, 1, 1], [10, 1, 2, 2], [11, -1, 1, 2], [11, 0, 1, 2], [11, 1, 0, 2], [12, -1, 0, 1], [12, 0, 0, 2], [12, 1, 0, 2], [13, -1, 4, 4], [13, 0, 1, 1], [13, 1, 5, 4], [14, -1, 5, 4], [14, 0, 3, 3], [14, 1, 4, 3], [15, -1, 22, 8], [15, 0, 22, 9], [15, 1, 22, 9], [16, -3, 22, 9], [16, -2, 23, 9], [16, -1, 22, 9], [16, 0, 23, 9], [16, 1, 22, 8], [17, -3, 23, 9], [17, -2, 21, 9], [17, -1, 23, 9], [17, 0, 21, 8], [17, 1, 23, 9], [18, -4, 22, 9], [18, -3, 21, 9], [18, -2, 23, 9], [18, -1, 21, 8], [18, 0, 22, 8], [19, -4, 19, 5], [19, -3, 18, 5], [19, 0, 19, 5], [15, -1, 22, 13], [15, 0, 22, 14], [15, 1, 22, 14], [16, -1, 22, 14], [16, 0, 23, 14], [16, 1, 22, 13], [16, 2, 21, 13], [16, 3, 23, 14], [17, -1, 23, 14], [17, 0, 21, 13], [17, 1, 23, 14], [17, 2, 21, 14], [17, 3, 21, 14], [18, 0, 22, 13], [18, 1, 21, 13], [18, 2, 23, 14], [18, 3, 22, 13], [18, 4, 22, 13], [19, 0, 19, 10], [19, 3, 19, 10], [19, 4, 20, 10], [0, -1, 3, 4], [0, 0, 3, 3], [0, 1, 4, 4], [1, -2, 12, 0], [1, -1, 4, 3], [1, 0, 7, 1], [1, 1, 4, 4], [1, 2, 13, 0], [2, -3, 5, 4], [2, -2, 3, 4], [2, -1, 6, 2], [2, 0, 7, 2], [2, 1, 7, 2], [2, 2, 5, 4], [2, 3, 4, 4], [3, -4, 16, 0], [3, -3, 5, 4], [3, -2, 4, 3], [3, -1, 4, 4], [3, 0, 6, 2], [3, 1, 3, 4], [3, 2, 5, 4], [3, 3, 3, 4], [3, 4, 17, 0], [4, -5, 15, 0], [4, -4, 15, 0], [4, -3, 4, 4], [4, -2, 3, 3], [4, -1, 5, 4], [4, 0, 4, 4], [4, 1, 5, 3], [4, 2, 4, 3], [4, 3, 4, 4], [4, 4, 17, 0], [4, 5, 17, 0], [5, -5, 16, 0], [5, -4, 16, 0], [5, -3, 3, 4], [5, -2, 5, 3], [5, -1, 5, 3], [5, 0, 4, 4], [5, 1, 3, 3], [5, 2, 5, 4], [5, 3, 3, 4], [5, 4, 17, 0], [5, 5, 15, 0], [6, -2, 9, 2], [6, -1, 10, 2], [6, 0, 3, 4], [6, 1, 5, 3], [6, 2, 3, 3], [7, -2, 11, 1], [7, -1, 9, 2], [7, 0, 10, 1], [7, 1, 5, 3], [7, 2, 3, 3], [8, -2, 5, 4], [8, -1, 10, 1], [8, 0, 3, 4], [8, 1, 3, 4], [8, 2, 5, 4], [9, -2, 3, 3], [9, -1, 4, 4], [9, 0, 4, 4], [9, 1, 4, 4], [9, 2, 5, 4], [10, -1, 5, 4], [10, 0, 4, 3], [10, 1, 11, 2], [11, -1, 4, 4], [11, 0, 10, 2], [11, 1, 9, 2], [12, -1, 3, 3], [12, 0, 9, 2], [12, 1, 3, 4], [13, -1, 4, 4], [13, 0, 4, 3], [13, 1, 5, 4], [14, -1, 5, 4], [14, 0, 3, 3], [14, 1, 4, 3], [15, -1, 22, 8], [15, 0, 22, 9], [15, 1, 22, 9], [16, -3, 22, 9], [16, -2, 23, 9], [16, -1, 22, 9], [16, 0, 23, 9], [16, 1, 22, 8], [17, -3, 23, 9], [17, -2, 21, 9], [17, -1, 23, 9], [17, 0, 21, 8], [17, 1, 23, 9], [18, -4, 22, 9], [18, -3, 21, 9], [18, -2, 23, 9], [18, -1, 21, 8], [18, 0, 22, 8], [19, -4, 19, 5], [19, -3, 18, 5], [19, 0, 19, 5], [15, -1, 22, 13], [15, 0, 22, 14], [15, 1, 22, 14], [16, -1, 22, 14], [16, 0, 23, 14], [16, 1, 22, 13], [16, 2, 21, 13], [16, 3, 23, 14], [17, -1, 23, 14], [17, 0, 21, 13], [17, 1, 23, 14], [17, 2, 21, 14], [17, 3, 21, 14], [18, 0, 22, 13], [18, 1, 21, 13], [18, 2, 23, 14], [18, 3, 22, 13], [18, 4, 22, 13], [19, 0, 19, 10], [19, 3, 19, 10], [19, 4, 20, 10]])
// Each colour row: rgb and the tile's own opacity. Rows go by kind (O W C K E f t T) and shade (0 1 2).
const COLORS = table([[0.9255, 0.4863, 0.2353, 1], [0.8784, 0.4235, 0.1804, 1], [0.8353, 0.3725, 0.1451, 1], [0.9608, 0.9451, 0.902, 1], [0.9255, 0.9059, 0.851, 1], [0.9725, 0.9608, 0.9255, 1], [0.8196, 0.2902, 0.2275, 1], [0.7529, 0.2392, 0.1804, 1], [0.8471, 0.3333, 0.2667, 1], [0.2824, 0.3294, 0.3569, 1], [0.2314, 0.2745, 0.298, 1], [0.3333, 0.3843, 0.4196, 1], [0.149, 0.2039, 0.2353, 1], [0.149, 0.2039, 0.2353, 1], [0.149, 0.2039, 0.2353, 1], [0.9608, 0.9451, 0.902, 0.85], [0.9255, 0.9059, 0.851, 0.85], [0.9725, 0.9608, 0.9255, 0.85], [0.9608, 0.9451, 0.902, 0.74], [0.9255, 0.9059, 0.851, 0.74], [0.9725, 0.9608, 0.9255, 0.74], [0.9608, 0.9451, 0.902, 0.95], [0.9255, 0.9059, 0.851, 0.95], [0.9725, 0.9608, 0.9255, 0.95]])

// The ripples: [centre x, centre y, period, delay] in cells and seconds. The first four are the wakes beside the lanes,
// whose rings play in the first 50 seconds of the swim's period; the last four are slow ripples that use their whole period.
const RIPPLES = table([
  [75, 34, 273, 259.790323], [75, 34, 273, 94.669355], [9, 36, 273, 167.322581], [9, 36, 273, 2.201613],
  [73, 29, 29, 4], [11, 14, 37, 20], [72, 46, 43, 31], [11, 43, 31, 9],
])
// Each of the four rings: when it rises, holds and fades (percent of the period), its three opacities and its radius.
const RING_TIMES = table([[2, 6, 12, 18], [9, 15, 21, 27], [18, 24, 30, 36], [27, 33, 39, 45]])
const RING_LOOKS = table([[0.16, 0.12, 0.06, 1.8], [0.15, 0.11, 0.06, 3.6], [0.13, 0.09, 0.05, 5.3], [0.11, 0.08, 0.04, 7]])

const SHADE = vec3(0.051, 0.353, 0.4)
const RING = vec3(0.949, 1, 0.984)
const DEEP = vec3(0.09, 0.514, 0.549)
const LIGHT_GLYPH = vec3(1, 0.945, 0.863)
const CREAM_GLYPH = vec3(0.718, 0.765, 0.741)

// The view box on the window.
const scaleOf = (): number => max(size.x / 1600, size.y / 1000)
const originOf = (s: number): vec2 => vec2((size.x - 1600 * s) * 0.5, (size.y - 1000 * s) * 0.5)
const pointOf = (vb: vec2, s: number, o: vec2): vec2 => vec2(o.x + vb.x * s, size.y - (o.y + vb.y * s))
const vbOf = (pt: vec2, s: number, o: vec2): vec2 => vec2((pt.x - o.x) / s, (size.y - pt.y - o.y) / s)

// koi-mosaic.ts's hashOf, the same integer mixing, so the stone bank's ragged edge matches the still.
const hashOf = (x: number, y: number, salt: number): number => {
  let h = int((int(x + 11) * 374761393) ^ (int(y + 7) * 668265263) ^ (int(salt + 3) * 1274126177))
  h = int((h ^ (h >>> 13)) * 1274126177)
  h = int(h ^ (h >>> 16))
  return unsigned(h) / 4294967296
}

// A lily pad's tiles, as lilyPad() lays them: a disc of cells with one notch cut toward the middle.
const padAt = (x: number, y: number, cx: number, cy: number, radius: number, notchDegrees: number): number => {
  const dx = x - cx
  const dy = y - cy
  const distance = length(vec2(dx, dy))
  const off = mod(atan(dy, dx) - (notchDegrees * PI) / 180 + PI, 2 * PI) - PI
  const notched = distance > 0.6 && abs(off) < 0.24 + 0.28 / max(distance, 1) ? 1 : 0
  return distance <= radius ? 1 - notched : 0
}
const isPad = (x: number, y: number): number =>
  max(max(padAt(x, y, 73, 20, 3.6, 150), padAt(x, y, 75, 37, 2.6, 300)), padAt(x, y, 7, 30, 3.6, 60))

// The stone bank's tiles, as stoneBank() lays them: a ragged quarter ring in the bottom right corner.
const isStone = (x: number, y: number): number => {
  const inBox = x >= 60 && x < 80 && y >= 30 && y < 50 ? 1 : 0
  const fromCorner =
    length(vec2((x + 0.5 - 80) / 1.3, y + 0.5 - 50)) + (hashOf(floor(x / 2), floor(y / 2), 34) - 0.5) * 0.9
  return fromCorner >= 4.4 && fromCorner <= 6.9 ? inBox : 0
}

// Per cell, drawn once: r, a pad or stone tile the koi pass under; g, how much the pads' and stones' shadows darken what is under them.
const mask = buffer({ size: [80, 50], once: true, filter: 'nearest' }, p => {
  const x = p.cell.x
  const y = p.cell.y
  const solid = max(isPad(x, y), isStone(x, y))
  const nearStone = max(max(max(isStone(x, y), isStone(x - 1, y)), max(isStone(x + 1, y), isStone(x, y - 1))), isStone(x, y + 1))
  const underPad = isPad(x - 1, y - 1)
  return vec4(solid, 1 - (1 - 0.22 * nearStone) * (1 - 0.3 * underPad), 0, 1)
})

// One ring's opacity at `x` percent of its period: up, two holds, down, then nothing.
const ringOpacity = (ring: number, x: number): number => {
  const t = RING_TIMES.at(ring)
  const o = RING_LOOKS.at(ring)
  return x < t.x
    ? (o.x * x) / t.x
    : x < t.y
      ? mix(o.x, o.y, (x - t.x) / (t.y - t.x))
      : x < t.z
        ? mix(o.y, o.z, (x - t.y) / (t.z - t.y))
        : x < t.w
          ? mix(o.z, 0, (x - t.z) / (t.w - t.z))
          : 0
}

// Per cell, each frame: how much of the pale ring colour lies on it. Whole cells, as the rings are drawn on the grid.
const rings = buffer({ size: [80, 50], filter: 'nearest' }, p => {
  let clear = 1
  for (const n of range(8)) {
    const r = RIPPLES.at(n)
    const fraction = n < 3.5 ? 50 / SWIM_SECONDS : 1
    const x = (mod(time + r.w, r.z) / r.z) * (100 / fraction)
    const distance = length(vec2(p.cell.x - r.x, p.cell.y - r.y))
    for (const ring of range(4)) {
      const on = abs(distance - RING_LOOKS.at(ring).w) < 0.62 ? 1 : 0
      clear = clear * (1 - on * ringOpacity(ring, x))
    }
  }
  return vec4(1 - clear, 0, 0, 1)
})

// The tail's two sweeps take turns every 1.6 seconds, crossing over in 0.4.
const sweepOf = (): number => {
  const q = fract(time / 3.2)
  return q < 0.375 ? 1 : q < 0.5 ? 1 - (q - 0.375) / 0.125 : q < 0.875 ? 0 : (q - 0.875) / 0.125
}

const QX = [-1, 1, -1, 1, 1, -1]
const QY = [-1, -1, 1, -1, 1, 1]
const pick6 = (l: readonly number[], i: number): number =>
  i < 0.5 ? l[0]! : i < 1.5 ? l[1]! : i < 2.5 ? l[2]! : i < 3.5 ? l[3]! : i < 4.5 ? l[4]! : l[5]!

// One corner of one tile's quad. Every slice of a koi follows the head's path one step later than the slice ahead of it,
// gliding in a line from step to step; across the jump between the lanes (off the window) it holds, then jumps.
const tileCorner = (v: number, i: number, shift: number, half: number) => {
  const row = TILES.at(i)
  const start = i < KOHAKU_TILES - 0.5 ? KOHAKU_START : TANCHO_START
  const u = mod(time / STEP_SECONDS + start - row.x, STEP_COUNT)
  const at = floor(u)
  const p0 = STEPS.at(at)
  const p1 = STEPS.at(mod(at + 1, STEP_COUNT))
  const jumps = abs(p1.x - p0.x) + abs(p1.y - p0.y) > 2 ? 1 : 0
  const head = vec2(mix(p0, p1, fract(u) * (1 - jumps)) * CELL + CELL / 2)
  const corner = vec2(pick6(QX, v), pick6(QY, v))
  const s = scaleOf()
  const pt = pointOf(vec2(head.x + row.y * CELL + shift + corner.x * half, head.y + shift + corner.y * half), s, originOf(s))
  const pose = floor(row.w / 5 + 0.01)
  const sweep = sweepOf()
  const shown = pose < 0.5 ? 1 : pose < 1.5 ? sweep : 1 - sweep
  return { at: vec2((pt / size) * 2 - 1), a: vec4(corner.x * half, corner.y * half, row.z, row.w), b: vec4(shown, 0, 0, 0) }
}

// A shadow tile: a whole cell of shade, as the shadow layers in the SVG are.
const shadowPaint = (s: Spot, opacity: number): vec4 => {
  const pixel = s.px / scaleOf()
  const edge = max(abs(s.a.x), abs(s.a.y))
  const cover = clamp((10 - edge) / pixel + 0.5, 0, 1) * opacity * s.b.x
  return vec4(SHADE * cover, cover)
}

// A koi tile: 18 units square, a thin dark edge, and a light glyph on most of them.
const fishPaint = (s: Spot): vec4 => {
  const pixel = s.px / scaleOf()
  const local = vec2(s.a.x, s.a.y)
  const edge = max(abs(local.x), abs(local.y))
  const fill = clamp((9 - edge) / pixel + 0.5, 0, 1)
  const outer = clamp((9.5 - edge) / pixel + 0.5, 0, 1)
  const band = 1 - clamp((8.5 - edge) / pixel + 0.5, 0, 1)
  const c = COLORS.at(floor(s.a.z + 0.5))
  const tile = vec3(mix(c.rgb, SHADE, 0.3 * band))
  const own = c.a * s.b.x
  const alpha = (fill + (outer - fill) * 0.3) * own
  const tileLight = vec3((tile * fill + SHADE * 0.3 * (outer - fill)) * own)
  // The glyph: two dots for ':' and ';', a small ring for the letters.
  const code = s.a.w - floor(s.a.w / 5 + 0.01) * 5
  const glyph = floor(code + 0.5)
  const dots = max(
    clamp((1.5 - length(vec2(local - vec2(0, -2.6)))) / pixel + 0.5, 0, 1),
    clamp((1.5 - length(vec2(local - vec2(0, 2.4)))) / pixel + 0.5, 0, 1),
  )
  const ring = clamp((0.7 - abs(length(vec2(local - vec2(0, 0.3))) - 2.6)) / pixel + 0.5, 0, 1)
  const mark = glyph < 0.5 ? 0 : glyph === 1 || glyph === 3 ? dots : ring
  const glyphColor = glyph < 2.5 ? LIGHT_GLYPH : CREAM_GLYPH
  const g = mark * (glyph < 2.5 ? 0.5 : 0.8) * s.b.x * fill
  return vec4(glyphColor * g + tileLight * (1 - g), g + alpha * (1 - g))
}

// The koi and their shadows, redrawn each frame onto their own layer: the far shadow, the near one, then the fish.
const koiLayer = buffer({ filter: 'nearest' })
const farShadows = shapes(
  { count: 6, instances: ALL_TILES, cover: 1.5, draw: 'triangles', into: koiLayer, clear: true },
  (v, i) => tileCorner(v, i, 40, 10.5),
  s => shadowPaint(s, 0.07),
)
const nearShadows = shapes(
  { count: 6, instances: ALL_TILES, cover: 1.5, draw: 'triangles', into: koiLayer },
  (v, i) => tileCorner(v, i, 20, 10.5),
  s => shadowPaint(s, 0.16),
)
const fish = shapes(
  { count: 6, instances: ALL_TILES, cover: 1.5, draw: 'triangles', into: koiLayer },
  (v, i) => tileCorner(v, i, 0, 10.5),
  fishPaint,
)

// What lies over the still pond: the swell, the rings, the koi layer; darkened under the pads' and stones' shadows and
// cut away where a pad or stone tile lies over the water, so the koi swim under them.
// gpu-themes: the scene fades in when its shader starts, so its moving parts do not pop in over the still. The app
// crossfades from the old backdrop to this one's still; the shader then rises over the still in FADE_IN seconds,
// after FADE_WAIT. A one-texel clock notes the first frame, whatever time the app starts the shader's clock at.
const FADE_WAIT = 0.15
const FADE_IN = 0.8
// x: how much of the scene is still hidden, 1 to 0. y: the time the fade starts from. w: 1 once noted.
const fadeClock: Buffer = buffer({ size: [1, 1], float: 32, filter: 'nearest' }, () => {
  const last = fadeClock.at(vec2(0, 0))
  // Frame 0 starts the fade; a clock wiped later (the app may clear buffers) counts as long risen, with no replay.
  const startAt = last.w > 0.5 ? last.y : first ? time : time - FADE_WAIT - FADE_IN - 1
  return vec4(1 - smoothstep(startAt + FADE_WAIT, startAt + FADE_WAIT + FADE_IN, time), startAt, 0, 1)
})
// The picture or a shape over it, as far as the scene has risen: until then the still shows through.
function fadingIn(c: vec4): vec4 {
  return vec4(c * (1 - fadeClock.at(vec2(0, 0)).x))
}

function viewColor(p: Pixel) {
  const s = scaleOf()
  const vb = vbOf(p.point, s, originOf(s))
  const cell = floor(vec2(vb / CELL))
  const local = vec2(vb - cell * CELL)
  const inside = cell.x >= 0 && cell.x < 80 && cell.y >= 0 && cell.y < 50 ? 1 : 0
  const m = mask.at(cell)
  const onTile = local.x >= 1 && local.x <= 19 && local.y >= 1 && local.y <= 19 ? 1 : 0
  const solid = m.r * inside * onTile
  const shade = m.g * inside

  // The swell: two pools of deep water drifting to and fro over 67 seconds.
  const lap = time / 67
  const way = mod(floor(lap), 2) < 0.5 ? 1 - fract(lap) : fract(lap)
  const drift = vec2(mix(vec2(-50, -16), vec2(60, 22), smoothstep(0, 1, way)))
  const d1 = length(vec2((vb.x - 1440 - drift.x) / 560, (vb.y - 820 - drift.y) / 460))
  const d2 = length(vec2((vb.x - 40 - drift.x) / 440, (vb.y - 60 - drift.y) / 360))
  const a1 = 0.5 * max(1 - d1, 0)
  const a2 = 0.35 * max(1 - d2, 0)
  let acc = vec4(DEEP * a1, a1)
  acc = vec4(acc.rgb * (1 - a2) + DEEP * a2, acc.a * (1 - a2) + a2)

  const ra = rings.at(cell).r * inside
  acc = vec4(acc.rgb * (1 - ra) + RING * ra, acc.a * (1 - ra) + ra)

  const k = koiLayer.sample(p.uv)
  acc = vec4(k.rgb + acc.rgb * (1 - k.a), k.a + acc.a * (1 - k.a))
  acc = vec4(acc.rgb * (1 - shade) + SHADE * shade * acc.a, acc.a)
  return vec4(acc * (1 - solid))
}
const view = picture(p => fadingIn(viewColor(p)))

export default shader({ fps: 30, passes: [fadeClock, mask, rings, koiLayer, farShadows, nearShadows, fish, view] })
