// Plotter Tide's moving parts on the GPU: the pens that draw every tide line, coast line and hatch stroke, the strokes
// washing away again from their start, the fade of a finished stroke, and the tide that sways the sea's line sets.
// Derived from theme-examples' scenes/plotter-tide.ts (Apache License 2.0): the same curves, colours, widths,
// opacities and timings, drawn here instead of by CSS. The curves are worked out here from that file's own formulas
// (radiusAt, the smooth paths through the samples); the tables hold only the whole numbers its generator chose (which
// samples each line keeps, where each hatch stroke starts and ends) and each stroke's animation delay, all read from
// its output.
//
// The picture is opaque: it repaints the paper and the land, so the still's finished lines underneath never show
// through. Coordinates: the scene is a 1600 x 1000 view box laid over the window with "xMidYMid slice", y down. The
// shader's points run y up, so every placement goes through `pointOf` and every pixel back through `vbOf`.
import {
  abs, atan, buffer, clamp, cos, floor, length, max, min, mix, mod, picture, PI, pow, px, shader, shapes, sin, size,
  table, time, values, vec2, vec3, vec4,
  smoothstep,
  first,
} from 'claude-code/shader'
import type { Buffer, Pixel } from 'claude-code/shader'

// 0: warm paper (plotter-tide), 1: blue-black night paper (plotter-tide-night).
const params = values({ variant: [0, 1] })

// The two stocks: DAY (#f3eee3, #e8d6bd, #1f2a48, #c4552d) and NIGHT (#141a27, #1c2333, #aab6d0, #e98a5e).
const PAPER_DAY = vec3(0.9529, 0.9333, 0.8902)
const PAPER_NIGHT = vec3(0.0784, 0.102, 0.1529)
const LAND_DAY = vec3(0.9098, 0.8392, 0.7412)
const LAND_NIGHT = vec3(0.1098, 0.1373, 0.2)
const INK_DAY = vec3(0.1216, 0.1647, 0.2824)
const INK_NIGHT = vec3(0.6667, 0.7137, 0.8157)
const RUST_DAY = vec3(0.7686, 0.3333, 0.1765)
const RUST_NIGHT = vec3(0.9137, 0.5412, 0.3686)

// Each pen's job, in tenths: its cycle, and in percent of it when the stroke is drawn, when it has faded to .74, and
// when the washing away starts (it takes as long as the drawing). Jobs: east sea, west sea, islet sea, east land,
// west land, islet land.
const JOBS = table([[1360, 71, 178, 729], [1260, 59, 148, 741], [1500, 50, 125, 810], [1180, 37, 93, 923], [1040, 30, 75, 930], [1400, 60, 150, 880]])
// The tide's sway for each set: how far (view box units) and how many seconds into its 70 s cycle. None, east near,
// east far, west near, west far, islet.
const TIDES = table([[0, 0, 0], [-5, -5, 0], [-17, -15, 0], [5, -5, 35], [16, -16, 35], [-3, 3, 36]])
// The curves in the original's order: the east sea's tide lines 1-14, the west's 1-17, the islet's rings 1-5, then the
// coast lines of the east, the west and the islet. Each: tenths of a second into its cycle, the first sample kept, how
// many are kept, and how many curve pieces come before it.
const CURVES = table([[300, 5, 31, 0], [203, 5, 32, 30], [106, 5, 33, 61], [9, 6, 33, 93], [1271, 6, 35, 125], [1174, 6, 36, 159], [1077, 6, 37, 194], [980, 12, 31, 230], [883, 10, 35, 260], [786, 24, 20, 294], [689, 28, 20, 313], [591, 25, 21, 332], [494, 28, 19, 352], [397, 40, 10, 370], [750, 7, 29, 379], [676, 7, 31, 407], [602, 8, 31, 437], [528, 8, 32, 467], [454, 8, 33, 498], [379, 8, 35, 530], [305, 8, 36, 564], [231, 8, 38, 599], [157, 9, 36, 636], [83, 9, 35, 671], [9, 9, 32, 705], [1195, 11, 28, 736], [1121, 15, 28, 763], [1046, 11, 20, 790], [972, 11, 17, 809], [898, 14, 13, 825], [824, 20, 12, 837], [400, 0, 14, 848], [100, 0, 19, 862], [1300, 0, 25, 881], [1000, 0, 32, 906], [700, 0, 40, 938], [600, 5, 30, 978], [200, 7, 28, 1007], [90, 0, 12, 1034]])
const SEGMENTS = 1046
// The hatch strokes, east land then west: tenths of a second into the cycle, which hatch line (it starts at
// x = 15 * n - 1000 on the top edge and runs down-left), and the quarter steps where the stroke starts and ends.
const HATCHES = table([[556, 214, 190, 197], [513, 215, 190, 201], [469, 216, 191, 205], [425, 217, 191, 210], [381, 218, 192, 218], [338, 219, 191, 223], [294, 220, 191, 226], [250, 221, 191, 230], [207, 222, 191, 233], [163, 223, 192, 246], [119, 224, 194, 250], [76, 225, 195, 253], [32, 226, 197, 255], [1168, 227, 198, 257], [1124, 228, 198, 257], [1081, 229, 202, 257], [1037, 230, 206, 257], [993, 231, 209, 257], [950, 232, 213, 257], [906, 233, 217, 257], [862, 234, 221, 257], [819, 235, 224, 257], [775, 236, 228, 257], [731, 237, 232, 257], [687, 238, 236, 257], [644, 239, 239, 257], [168, 119, 199, 203], [137, 120, 200, 207], [105, 121, 200, 211], [74, 122, 200, 214], [42, 123, 201, 218], [11, 124, 202, 222], [1019, 125, 204, 226], [988, 126, 206, 229], [956, 127, 207, 233], [925, 128, 208, 237], [893, 129, 208, 241], [862, 130, 207, 244], [830, 131, 207, 248], [799, 132, 207, 252], [767, 133, 207, 256], [736, 134, 209, 257], [704, 135, 210, 257], [673, 136, 212, 257], [641, 137, 214, 257], [610, 138, 216, 257], [578, 139, 217, 257], [547, 140, 219, 257], [515, 141, 220, 257], [484, 142, 222, 257], [452, 143, 225, 257], [421, 144, 228, 257], [389, 145, 232, 257], [358, 146, 238, 257], [326, 147, 244, 257], [295, 148, 247, 257], [263, 149, 250, 257], [232, 150, 253, 257]])

// The view box on the window.
const scaleOf = (): number => max(size.x / 1600, size.y / 1000)
const originOf = (s: number): vec2 => vec2((size.x - 1600 * s) * 0.5, (size.y - 1000 * s) * 0.5)
const pointOf = (vb: vec2, s: number, o: vec2): vec2 => vec2(o.x + vb.x * s, size.y - (o.y + vb.y * s))
const vbOf = (pt: vec2, s: number, o: vec2): vec2 => vec2((pt.x - o.x) / s, (size.y - pt.y - o.y) / s)

// The three coasts of plotter-tide.ts (0 EAST_COAST, 1 WEST_SPIT, 2 ISLET).
const pick3 = (c: number, a: number, b: number, d: number): number => (c < 0.5 ? a : c < 1.5 ? b : d)
const centreOf = (c: number): vec2 => vec2(pick3(c, 1650, -50, 1436), pick3(c, 1050, 1070, 334))
const landRadiusOf = (c: number): number => pick3(c, 300, 300, 26)
const angleFromOf = (c: number): number => pick3(c, PI * 0.95, -PI * 0.58, 0)
const angleToOf = (c: number): number => pick3(c, PI * 1.55, PI * 0.05, PI * 2)

// bays(): the coast's shape in -1..1 at a place `along` the shore; `calm` smooths the small bays out.
const baysOf = (along: number, c: number, calm: number): number => {
  const seed = pick3(c, 1, 2, 5)
  const turn = along / landRadiusOf(c)
  const islet = c > 1.5
  const wide = islet ? sin(turn * 2 + seed) : sin(along / 97 + seed * 1.7)
  const middle = (islet ? sin(turn * 3 + seed * 2) : sin(along / 41 + seed * 3.1)) * (1 - calm)
  const small = (islet ? sin(turn * 5 + seed * 3) : sin(along / 17 + seed * 5.3)) * (1 - calm) * (1 - calm)
  return (wide + 0.55 * middle + 0.25 * small) / 1.8
}

// radiusAt(): the distance from the coast's centre to tide line `line` at `angle`; line 0 is the coast itself.
const radiusOf = (angle: number, line: number, c: number): number => {
  const radius = landRadiusOf(c)
  const lineCount = pick3(c, 14, 17, 5)
  const growth = pick3(c, 1.062, 1.058, 1.2)
  const along = angle * radius
  let r = radius + pick3(c, 62, 56, 7) * baysOf(along, c, 0)
  let gap = pick3(c, 11, 11, 7.5)
  for (let step = 1; step < 18; step += 1) {
    if (step <= line) {
      const calm = min(1, step / (lineCount * 0.8))
      r = r + gap * (1 - 0.36 * baysOf(along, c, calm))
      gap = gap * growth
    }
  }
  return r
}

// What a curve row is: its coast, its tide line, its pen's job, its place in that job, and its tide set.
const curveOf = (row: number) => {
  const coast = row < 13.5 ? 0 : row < 30.5 ? 1 : row < 35.5 ? 2 : row - 36
  const isCoast = row > 35.5 ? 1 : 0
  const inJob = row < 13.5 ? row : row < 30.5 ? row - 14 : row < 35.5 ? row - 31 : 0
  const line = isCoast > 0.5 ? 0 : inJob + 1
  const job = isCoast > 0.5 ? coast + 3 : coast
  const tide = isCoast > 0.5 ? 0 : coast < 0.5 ? (inJob < 6.5 ? 1 : 2) : coast < 1.5 ? (inJob < 7.5 ? 3 : 4) : 5
  // The job's opacity less its fade along the set, rounded as penJob() rounds it (to thousandths); coast lines are firmer.
  const jobCount = pick3(coast, 14, 17, 5)
  const fade = coast > 1.5 ? 0.8 - 0.3 * (inJob / jobCount) : 1 - 0.4 * (inJob / jobCount)
  const alpha = isCoast > 0.5 ? 0.9 : floor(fade * 1000 + 0.5) / 1000
  // Pen widths: 1.15 for the sea, 1.1 for the islet's rings, 1.3 for a coast line.
  const kind = isCoast > 0.5 ? 3 : coast > 1.5 ? 1 : 0
  return { coast, line, job, tide, alpha, kind, ring: coast > 1.5 ? 1 : 0 }
}

// The kept samples of every curve, worked out once: texel (k, row) is the curve's k-th point, in the order its pen
// goes (odd tide lines run backward). tideLines() steps the angle 16 units of the line at a time; isletRings() spaces
// its points evenly round a turn, each ring turned on by 0.9.
const samples = buffer({ size: [64, 39], float: 32, filter: 'nearest', once: true }, p => {
  const k = p.cell.x
  const row = p.cell.y
  const C = CURVES.at(row)
  const info = curveOf(row)
  const c = info.coast
  const from = angleFromOf(c)
  const stepAngle = 16 / radiusOf((from + angleToOf(c)) / 2, info.line, c)
  const backward = info.ring < 0.5 && mod(info.line, 2) > 0.5 ? 1 : 0
  const index = backward > 0.5 ? C.y + C.z - 1 - k : C.y + k
  const angle = info.ring > 0.5 ? (k / C.z) * PI * 2 + info.line * 0.9 : from + index * stepAngle
  const r = radiusOf(angle, info.line, c)
  const centre = centreOf(c)
  return vec4(centre.x + r * cos(angle), centre.y + r * sin(angle), 0, 1)
})

const sampleAt = (k: number, row: number): vec2 => vec2(samples.at(vec2(k, row)).xy)

// Curve piece j of a row, as smoothPath() and smoothRing() write it: a quadratic from `a` by `c` to `b`, through the
// midpoints of the samples. An open path starts at its first sample and ends with a straight run to its last.
const pieceOf = (row: number, j: number, count: number, ring: number) => {
  const prev = ring > 0.5 ? mod(j - 1 + count, count) : j
  const mid = ring > 0.5 ? j : j + 1
  const next = ring > 0.5 ? mod(j + 1, count) : j + 2
  const c = sampleAt(mid, row)
  const before = sampleAt(prev, row)
  const after = sampleAt(next, row)
  const a = ring < 0.5 && j < 0.5 ? before : vec2((before + c) * 0.5)
  const b = ring < 0.5 && j > count - 2.5 ? c : vec2((c + after) * 0.5)
  return { a, c, b }
}

const curveAt = (a: vec2, c: vec2, b: vec2, t: number): vec2 => vec2(a * (1 - t) * (1 - t) + c * 2 * (1 - t) * t + b * t * t)
const speedAt = (a: vec2, c: vec2, b: vec2, t: number): number => length(vec2((c - a) * (1 - t) + (b - c) * t)) * 2
// The length of the curve from 0 to t (4-point Gauss-Legendre).
const lengthTo = (a: vec2, c: vec2, b: vec2, t: number): number => {
  const h = t * 0.5
  return (
    h *
    (0.3478548451 * (speedAt(a, c, b, h * (1 - 0.8611363116)) + speedAt(a, c, b, h * (1 + 0.8611363116))) +
      0.6521451549 * (speedAt(a, c, b, h * (1 - 0.3399810436)) + speedAt(a, c, b, h * (1 + 0.3399810436))))
  )
}

// How far along its curve each piece starts, worked out once: texel (k, row) is the length of pieces 0 to k - 1.
const lengths = buffer({ size: [64, 39], float: 32, filter: 'nearest', once: true }, p => {
  const k = p.cell.x
  const row = p.cell.y
  const C = CURVES.at(row)
  const ring = curveOf(row).ring
  const pieces = ring > 0.5 ? C.z : C.z - 1
  let total = 0
  for (let j = 0; j < 64; j += 1) {
    if (j < k && j < pieces) {
      const q = pieceOf(row, j, C.z, ring)
      total = total + lengthTo(q.a, q.c, q.b, 1)
    }
  }
  return vec4(total, 0, 0, 1)
})

// The land under the hatching, drawn once: the coast curve (radiusAt, line 0) round each piece, as landShape() fills it.
const landOf = (vb: vec2, pixel: number, c: number): number => {
  const centre = centreOf(c)
  const d = vec2(vb - centre)
  const raw = atan(d.y, d.x)
  const angle = c < 1.5 && raw < angleFromOf(c) - 0.5 ? raw + 2 * PI : raw
  return clamp((radiusOf(angle, 0, c) - length(d)) / pixel + 0.5, 0, 1)
}
const land = buffer({ once: true, filter: 'nearest' }, p => {
  const s = scaleOf()
  const vb = vbOf(p.point, s, originOf(s))
  const pixel = p.px / s
  return vec4(clamp(landOf(vb, pixel, 0) + landOf(vb, pixel, 1) + landOf(vb, pixel, 2), 0, 1), 0, 0, 1)
})

// The paper, and the land at .6 over it.
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
  const v = params.variant
  const paper = vec3(mix(PAPER_DAY, PAPER_NIGHT, v))
  const ground = vec3(mix(LAND_DAY, LAND_NIGHT, v))
  return vec4(mix(paper, ground, 0.6 * land.sample(p.uv).r), 1)
}
const view = picture(p => fadingIn(viewColor(p)))

// CSS ease-in-out, cubic-bezier(.42, 0, .58, 1): solve for the curve's parameter, then read its height.
const easeInOut = (f: number): number => {
  let u = f
  for (let n = 0; n < 6; n += 1) {
    const w = 1 - u
    const x = 3 * w * w * u * 0.42 + 3 * w * u * u * 0.58 + u * u * u - f
    const slope = 1.26 * w * w + 0.96 * w * u + 1.26 * u * u
    u = clamp(u - x / slope, 0, 1)
  }
  return u * u * (3 - 2 * u)
}

// The tide: each sea set sways to and fro, 70 s each way (alternate), eased in and out.
const swayOf = (tide: number): vec2 => {
  const T = TIDES.at(tide)
  const cycles = (time + T.z) / 70
  const lap = floor(cycles)
  const way = mod(lap, 2) < 0.5 ? cycles - lap : 1 - (cycles - lap)
  return vec2(vec2(T.x, T.y) * easeInOut(way))
}

const halfWidthOf = (kind: number): number => (kind < 0.5 ? 0.575 : kind < 1.5 ? 0.55 : kind < 2.5 ? 0.5 : 0.65)

const QX = [0, 1, 0, 1, 1, 0]
const QY = [-1, -1, 1, -1, 1, 1]
const pick6 = (l: readonly number[], i: number): number =>
  i < 0.5 ? l[0]! : i < 1.5 ? l[1]! : i < 2.5 ? l[2]! : i < 3.5 ? l[3]! : i < 4.5 ? l[4]! : l[5]!

// One straight piece of a stroke, from q0 (at s0 along its path, 0 to 1) to q1 (at s1), as one quad round it. tLo and
// tHi are the curve's directions at the two ends, where it is cut against its neighbours. The stroke shows only between
// `lo` and `hi`: CSS's stroke-dashoffset on a 1-long dash with a gap of 2 (pathLength 1), keyframed as in penJob().
const placePiece = (
  corner: number, q0: vec2, q1: vec2, s0: number, s1: number, tLo: vec2, tHi: vec2,
  job: number, into: number, kind: number, alpha: number,
) => {
  const J = JOBS.at(job)
  const cycle = J.x / 10
  const drawnAt = J.y / 10
  const fadedAt = J.z / 10
  const restUntil = J.w / 10
  const x = (mod(time + into / 10, cycle) / cycle) * 100
  const offset = x < drawnAt ? 1.01 * (1 - x / drawnAt) : x < restUntil ? 0 : x < restUntil + drawnAt ? (-1.01 * (x - restUntil)) / drawnAt : -1.01
  const fade = x < drawnAt ? 1 : x < fadedAt ? mix(1, 0.74, (x - drawnAt) / (fadedAt - drawnAt)) : 0.74
  const lo = max(0, -offset)
  const hi = min(1, 1 - offset)
  const from = max(s0, lo)
  const to = min(s1, hi)
  const drawn = from < to ? 1 : 0
  // The pen: a dot 8 across on the front while the stroke is drawn, carried by the one piece it is over.
  const hasPen = job < 1.5 || (job > 2.5 && job < 4.5) ? 1 : 0
  const penAt = min(x / drawnAt, 1)
  const penOn = hasPen > 0.5 && x < drawnAt + 0.01 && penAt >= s0 && (penAt < s1 || s1 > 0.99999) ? 1 : 0

  const along = vec2(q1 - q0)
  const len = max(length(along), 0.0001)
  const u = vec2(along / len)
  const n = vec2(-u.y, u.x)
  const dLo = vec2(tLo / max(length(tLo), 0.0001))
  const dHi = vec2(tHi / max(length(tHi), 0.0001))
  const slopeLo = clamp((dLo.x * n.x + dLo.y * n.y) / max(dLo.x * u.x + dLo.y * u.y, 0.3), -3, 3)
  const slopeHi = clamp((dHi.x * n.x + dHi.y * n.y) / max(dHi.x * u.x + dHi.y * u.y, 0.3), -3, 3)

  const span = max(s1 - s0, 0.0000001)
  const capLo = drawn > 0.5 && lo >= s0 ? 1 : 0
  const capHi = drawn > 0.5 && hi <= s1 ? 1 : 0
  const startAt = drawn > 0.5 ? ((from - s0) / span) * len : 1
  const endAt = drawn > 0.5 ? ((to - s0) / span) * len : 0
  const penLocal = penOn > 0.5 ? ((penAt - s0) / span) * len : -10000

  const s = scaleOf()
  const aa = (2 * px) / s
  const reach = (penOn > 0.5 ? 4 : halfWidthOf(kind)) + aa
  const endLo = capLo > 0.5 || penOn > 0.5 ? reach : reach * abs(slopeLo) + aa
  const endHi = capHi > 0.5 || penOn > 0.5 ? reach : reach * abs(slopeHi) + aa
  const cx = pick6(QX, corner)
  const cy = pick6(QY, corner)
  const l = cx < 0.5 ? -endLo : len + endHi
  const c = cy * reach
  const pt = pointOf(vec2(q0 + u * l + n * c), s, originOf(s))
  return {
    at: vec2((pt / size) * 2 - 1),
    a: vec4(l, c, startAt, endAt),
    b: vec4(capLo + 2 * capHi + 4 * kind + 0.01 + 0.98 * fade * alpha, penLocal, slopeLo, slopeHi),
    hide: drawn < 0.5 && penOn < 0.5,
  }
}

// A piece's colour: the stroke's own coverage (a flat cut where it meets the next piece, a round cap where the dash
// ends) at its opacity, and the pen's dot over it, both in the job's ink.
const paintPiece = (sp: { px: number; a: vec4; b: vec4 }): vec4 => {
  const pixel = sp.px / scaleOf()
  const l = sp.a.x
  const c = sp.a.y
  const startAt = sp.a.z
  const endAt = sp.a.w
  const code = floor(sp.b.x)
  const alpha = (sp.b.x - code - 0.01) / 0.98
  const kind = floor(code / 4 + 0.01)
  const capHi = floor((code - kind * 4) / 2 + 0.01)
  const capLo = code - kind * 4 - capHi * 2
  const below = capLo > 0.5 ? (l < startAt ? 1 : 0) : l + c * sp.b.z < 0 ? 1 : 0
  const above = capHi > 0.5 ? (l > endAt ? 1 : 0) : l + c * sp.b.w >= endAt ? 1 : 0
  const capDistance = below > 0.5 ? (capLo > 0.5 ? length(vec2(l - startAt, c)) : 10000) : capHi > 0.5 ? length(vec2(l - endAt, c)) : 10000
  const distance = below > 0.5 || above > 0.5 ? capDistance : abs(c)
  const stroke = clamp((halfWidthOf(kind) - distance) / pixel + 0.5, 0, 1) * alpha
  const dot = clamp((4 - length(vec2(l - sp.b.y, c))) / pixel + 0.5, 0, 1)
  const cover = dot + stroke * (1 - dot)
  const v = params.variant
  const ink = kind > 1.5 ? vec3(mix(RUST_DAY, RUST_NIGHT, v)) : vec3(mix(INK_DAY, INK_NIGHT, v))
  return vec4(ink * cover, cover)
}

// The curves: one instance per quadratic, cut into four straight parts of six corners each.
const curves = shapes(
  { count: 24, instances: SEGMENTS, cover: 0.8, draw: 'triangles' },
  (v, i) => {
    let row = 0
    for (let n = 0; n < 6; n += 1) {
      const probe = row + pow(2, 5 - n)
      if (probe < 38.5 && CURVES.at(probe).w <= i) {
        row = probe
      }
    }
    const C = CURVES.at(row)
    const info = curveOf(row)
    const j = i - C.w
    const pieces = info.ring > 0.5 ? C.z : C.z - 1
    const q = pieceOf(row, j, C.z, info.ring)
    const before = lengths.at(vec2(j, row)).x
    const after = lengths.at(vec2(j + 1, row)).x
    const total = max(lengths.at(vec2(pieces, row)).x, 0.0001)
    const part = floor(v / 6 + 0.01)
    const t0 = part / 4
    const t1 = (part + 1) / 4
    const s0 = (before + (part < 0.5 ? 0 : lengthTo(q.a, q.c, q.b, t0))) / total
    const s1 = part > 2.5 ? after / total : (before + lengthTo(q.a, q.c, q.b, t1)) / total
    const shift = swayOf(info.tide)
    const p0 = vec2(curveAt(q.a, q.c, q.b, t0) + shift)
    const p1 = vec2(curveAt(q.a, q.c, q.b, t1) + shift)
    const chord = vec2(p1 - p0)
    const d0 = vec2((q.c - q.a) * (1 - t0) + (q.b - q.c) * t0)
    const d1 = vec2((q.c - q.a) * (1 - t1) + (q.b - q.c) * t1)
    const tLo = vec2(length(d0) > 0.001 ? d0 : chord)
    const tHi = vec2(length(d1) > 0.001 ? d1 : chord)
    return placePiece(v - part * 6, p0, p1, s0, s1, tLo, tHi, info.job, C.x, info.kind, info.alpha)
  },
  spot => fadingIn(paintPiece(spot)),
)

// The hatch strokes: straight, one quad each, every other one drawn the other way (landHatch()).
const hatches = shapes(
  { count: 6, instances: 58, cover: 0.6, draw: 'triangles' },
  (v, i) => {
    const H = HATCHES.at(i)
    const east = i < 25.5 ? 1 : 0
    const stroke = east > 0.5 ? i : i - 26
    const offset = 15 * H.y - 1000
    const first = vec2(offset - H.z * 4, H.z * 4)
    const last = vec2(offset - H.w * 4, H.w * 4)
    const flip = mod(stroke, 2) > 0.5 ? 1 : 0
    const p0 = flip > 0.5 ? last : first
    const p1 = flip > 0.5 ? first : last
    const dir = vec2(p1 - p0)
    return placePiece(v, p0, p1, 0, 1, dir, dir, east > 0.5 ? 3 : 4, H.x, 2, 0.8)
  },
  spot => fadingIn(paintPiece(spot)),
)

export default shader({ fps: 30, passes: [fadeClock, samples, lengths, land, view, curves, hatches] })
