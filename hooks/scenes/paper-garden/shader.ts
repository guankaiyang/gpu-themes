// Paper Garden on the GPU: the whole scene, drawn opaque over still.ts (the same scene at time 0). The cut-paper leaves,
// sprigs, grass and bloom sway, flex, stir, lift, open and nod as the CSS original did; the sheet, the ground and its
// paper fibres are drawn here too, so the still never shows beside a moving copy of itself.
// Derived from theme-examples' scenes/paper-garden.ts (Apache License 2.0): the same outlines, cut by the same rules from
// the same numbers (its facet, bend, hash and jitter, rebuilt here), the same paints, shadow and lip offsets, keyframes,
// durations, delays and ease-in-out timing. The tables hold the groups and pieces of paper that file lays out.
//
// Coordinates: the scene is a 1600 x 1000 view box laid over the window with "xMidYMid slice", y down. The shader's
// points run y up, so every placement goes through `pointOf` and every pixel back through `vbOf`.
// A placement is a turn-and-scale `a` and a shift `b`, as complex numbers: z -> a * z + b.
import {
  abs, buffer, clamp, cos, dx, dy, floor, fract, int, length, max, min, mix, mod, PI, picture, range, shader, shapes,
  sign, sin, size, sqrt, table, time, unsigned, values, vec2, vec3, vec4,
  smoothstep,
  first,
} from 'claude-code/shader'
import type { Spot, Buffer, Pixel } from 'claude-code/shader'

// 0: Paper Garden (cream sheet, light windows), 1: Paper Garden, Kraft (dark kraft, dark windows).
const params = values({ variant: [0, 1] })

const GROUPS = 46
const PIECES = 38
// Groups above a group, at most, counting itself.
const DEPTH = 4
// The three slit leaves (pieces), drawn on their own layer under everything else that moves.
const PALE0 = 0
const PALE1 = 13
const PALE2 = 29
// Corners a ring of an outline has at most, and rings there are (9 for the great leaf, 7 for the middle leaf, then one each).
const CORNERS = 32
const RINGS = 34
// Fibre tile texels per view-box unit.
const FLECK_RES = 2

// Each group: its parent (-1: none), motion (0 none, 1 sway, 2 swayWide, 3 swayBack, 4 flex, 5 nod, 6 stir, 7 open, 8 openBack), seconds, delay (negative: already that far in).
const NODE_A = table([[-1, 1, 61, -48.1], [0, 0, 0, 0], [-1, 1, 38, -15.2], [2, 0, 0, 0], [3, 6, 11, -2.6], [2, 4, 17, -3.8], [5, 6, 9, -3.3], [5, 6, 13, -4.5], [5, 6, 11, -5.8], [5, 6, 9, -8.1], [5, 4, 23, -3.4], [10, 6, 9, -7.2], [10, 6, 7, -9.9], [10, 6, 11, -9.8], [10, 6, 11, -13.2], [-1, 3, 23, -1.4], [15, 0, 0, 0], [-1, 2, 19, -3.3], [17, 0, 0, 0], [18, 6, 13, -.5], [17, 4, 17, -3.6], [20, 6, 9, -3.4], [20, 6, 9, -4.8], [20, 6, 9, -4.5], [20, 6, 9, -7.9], [-1, 2, 14, -13], [25, 0, 0, 0], [25, 4, 17, -8.3], [27, 6, 11, -2.1], [27, 6, 11, -2.5], [27, 6, 11, -4.7], [27, 4, 23, -19.9], [31, 6, 7, -4], [31, 6, 13, -7.2], [-1, 3, 29, -27.6], [34, 0, 0, 0], [-1, 2, 11, -2.9], [36, 0, 0, 0], [-1, 2, 17, -8.5], [38, 0, 0, 0], [-1, 2, 23, -4], [40, 5, 11, 0], [41, 0, 0, 0], [42, 8, 19, -3], [42, 7, 19, -3], [42, 7, 19, -1]])
// Each group: the transform-origin of its motion (x, y), then the shift of its fixed placement (x, y).
const NODE_B = table([[20, 1190, 0, 0], [0, 0, 20, 1190], [190, 1130, 0, 0], [0, 0, 190, 1130], [0, 0, 5, -159], [6, -172, 190, 1130], [0, 0, 8, -199], [0, 0, 11, -240], [0, 0, 15, -280], [0, 0, 20, -320], [23, -343, 0, 0], [0, 0, 26, -360], [0, 0, 32, -400], [0, 0, 38, -439], [0, 0, 50, -503], [1720, 330, 0, 0], [0, 0, 1720, 330], [1680, 318, 0, 0], [0, 0, 1680, 318], [0, 0, 7, -123], [11, -148, 1680, 318], [0, 0, 12, -158], [0, 0, 18, -194], [0, 0, 26, -229], [0, 0, 41, -288], [1672, 282, 0, 0], [0, 0, 1672, 282], [-4, -129, 1672, 282], [0, 0, -6, -146], [0, 0, -10, -196], [0, 0, -16, -246], [-17, -257, 0, 0], [0, 0, -23, -295], [0, 0, -38, -377], [1600, 1150, 0, 0], [0, 0, 1600, 1150], [1630, 1060, 0, 0], [0, 0, 1630, 1060], [1680, 1090, 0, 0], [0, 0, 1680, 1090], [1570, 1100, 0, 0], [0, 0, 1440, 832], [0, 0, 0, 0], [0, 0, -5, 4], [0, 0, 4, -3], [0, 0, -2, 2]])
// Each group: the turn (degrees) and scale of its fixed placement, which goes outside its motion.
const NODE_C = table([[0, 1], [14, 1], [0, 1], [-10, 1], [-140.3, .7], [-10, 1], [-38.1, .8], [-130.9, .9], [-32, 1], [-127.9, 1], [0, 1], [-38.7, 1], [-122.8, 1], [-40.3, 1], [-78.9, .8], [0, 1], [244, 1], [0, 1], [222, 1], [-140.7, .7], [222, 1], [-32.3, 1], [-133.6, 1.2], [-25.6, 1], [-74.6, 1], [0, 1], [203, 1], [203, 1], [-153.3, .8], [-39.8, .9], [-157.8, 1.1], [0, 1], [-42.1, .8], [-101.1, .9], [0, 1], [-12, 1], [0, 1], [-26, 1], [0, 1], [-44, 1], [0, 1], [0, 1], [0, .9], [8, 1], [-14, 1], [20, 1]])
// Each motion: rotation from, to (degrees); scale from, to. swayBack also shifts, from (-5, 3) to (4, -4).
const KIND = table([[0, 0, 1, 1], [-2.4, 2.8, 1, 1], [-4, 4.5, 1, 1], [1.6, -1.8, 1, 1], [-3, 3.6, 1, 1], [-9, 7, 1, 1], [-7, 8, 1, 1], [-4, 5, .95, 1.05], [3, -3, .98, 1.03]])
// Each piece of paper, back to front: its group, outline, paint, and flags (1 lifts, 2 no lip, 4 the bloom stalk, 8 a seed dot).
const PIECE_A = table([[1, 0, 5, 3], [3, 9, 6, 0], [4, 4, 6, 1], [5, 10, 6, 0], [6, 4, 6, 1], [7, 4, 6, 1], [8, 4, 6, 1], [9, 4, 6, 1], [10, 11, 6, 0], [11, 4, 6, 1], [12, 4, 6, 1], [13, 4, 6, 1], [14, 4, 6, 1], [16, 1, 5, 3], [18, 12, 6, 0], [19, 5, 6, 1], [20, 13, 6, 0], [21, 5, 6, 1], [22, 5, 6, 1], [23, 5, 6, 1], [24, 5, 6, 1], [26, 14, 8, 0], [27, 15, 8, 0], [28, 5, 8, 1], [29, 5, 8, 1], [30, 5, 8, 1], [31, 16, 8, 0], [32, 5, 8, 1], [33, 5, 8, 1], [35, 1, 5, 3], [37, 3, 8, 1], [39, 2, 7, 1], [40, 17, 9, 6], [43, 6, 12, 0], [44, 7, 10, 0], [45, 8, 11, 0], [42, 18, 12, 10], [42, 19, 13, 10]])
// Each piece: lift (how far its shadows fall), facing (degrees, to turn them down and right), and the seconds and delay of its lift.
const PIECE_B = table([[4, 14, 14, -4.9], [3, -10, 0, 0], [7.14286, -150.3199, 11, -2.6], [3, -10, 0, 0], [6.25, -48.1114, 9, -3.3], [5.55556, -140.9146, 13, -4.5], [5, -41.9888, 11, -5.8], [5, -137.9166, 9, -8.1], [3, -10, 0, 0], [5, -48.6759, 9, -7.2], [5, -132.7927, 7, -9.9], [5, -50.2686, 11, -9.8], [6.25, -88.8554, 11, -13.2], [4, 244, 14, -1.4], [2.4, 222, 0, 0], [5.71429, 81.2743, 13, -.5], [2.4, 222, 0, 0], [4, 189.6607, 9, -3.4], [3.33333, 88.4494, 9, -4.8], [4, 196.4331, 9, -4.5], [4, 147.4189, 9, -7.9], [3.6, 203, 0, 0], [3.6, 203, 0, 0], [7.5, 49.7208, 11, -2.1], [6.66667, 163.1537, 11, -2.5], [5.45455, 45.1883, 11, -4.7], [3.6, 203, 0, 0], [7.5, 160.8543, 7, -4], [6.66667, 101.8554, 13, -7.2], [4, -12, 14, -7.4], [7, -26, 14, -8.7], [6, -44, 14, -9.9], [0, 0, 0, 0], [4, 8, 0, 0], [4, -14, 0, 0], [3, 20, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
// Paint rows, paint * 2 + variant: r, g, b out of 255. Paints: 0 ground, 1 page, 2 fleck, 3 shadow, 4 lip, 5 pale, 6 sage, 7 mid, 8 fern, 9 olive, 10 coral, 11 coralLight, 12 coralDark, 13 seed.
const COLORS = table([[239, 232, 216], [36, 33, 29], [248, 243, 233], [46, 43, 38], [143, 124, 80], [184, 173, 140], [92, 74, 38], [0, 0, 0], [255, 255, 255], [243, 236, 217], [211, 219, 193], [57, 67, 47], [180, 194, 159], [75, 95, 69], [139, 162, 116], [93, 116, 85], [127, 155, 108], [98, 121, 90], [111, 138, 92], [111, 133, 102], [220, 101, 73], [201, 96, 74], [229, 130, 103], [228, 132, 106], [198, 90, 66], [181, 80, 58], [138, 58, 44], [110, 44, 33]])
// The sheet's cut long edges: left x and right x at y = -40 + 36 * row.
const PAGE = table([[425, 1202], [426, 1201], [429, 1201], [428, 1203], [422, 1199], [425, 1199], [420, 1193], [416, 1196], [420, 1195], [414, 1189], [420, 1189], [418, 1193], [421, 1192], [421, 1193], [429, 1195], [427, 1200], [425, 1199], [425, 1199], [426, 1203], [422, 1203], [424, 1200], [420, 1197], [413, 1197], [416, 1195], [415, 1190], [419, 1194], [420, 1194], [421, 1190], [425, 1192], [428, 1194], [427, 1196]])
// Each slit-leaf ring (rows as in `corners`): a pivot the whole ring can be seen from, so its fan never folds back.
const PIVOT = table([[3, -107], [-29, -214], [75, -264], [-27, -301], [83, -351], [-4, -384], [93, -429], [21, -455], [100, -501], [-4, -81], [-54, -149], [26, -185], [-59, -218], [5, -256], [-65, -284], [-19, -324]])

// ---- the view box on the window

const scaleOf = (): number => max(size.x / 1600, size.y / 1000)
const originOf = (s: number): vec2 => vec2((size.x - 1600 * s) * 0.5, (size.y - 1000 * s) * 0.5)
const pointOf = (vb: vec2, s: number, o: vec2): vec2 => vec2(o.x + vb.x * s, size.y - (o.y + vb.y * s))
const vbOf = (pt: vec2, s: number, o: vec2): vec2 => vec2((pt.x - o.x) / s, (size.y - pt.y - o.y) / s)

const cmul = (u: vec2, v: vec2): vec2 => vec2(u.x * v.x - u.y * v.y, u.x * v.y + u.y * v.x)
const turnOf = (degrees: number, scale: number): vec2 => vec2(vec2(cos((degrees * PI) / 180), sin((degrees * PI) / 180)) * scale)

// ---- the original's own helpers

// paper-garden.ts's hash: the same integer mixing (its one float multiply is kept as an int multiply, a few
// millionths off at most, which never changes a rounded corner here).
const hash = (a: number, b: number): number => {
  let h = int(int(floor(a + 0.5)) * 374761393 + int(floor(b + 0.5)) * 668265263)
  h = int((h ^ (h >>> 13)) * 1274126177)
  return unsigned(int(h ^ (h >>> 16))) / 4294967296
}
const jitter = (seed: number, index: number, spread: number): number => 1 + (hash(seed, index) - 0.5) * 2 * spread
// Math.round, and Number(x.toFixed(1)).
const round = (x: number): number => floor(x + 0.5)
const fixed = (x: number): number => (sign(x) * floor(abs(x) * 10 + 0.5)) / 10
// Leans a point sideways by the square of its height, which bends a straight leaf into an arc.
const bendPoint = (p: vec2, L: number, amount: number): vec2 => {
  const h = max(0, -p.y / L)
  return vec2(p.x + amount * L * h * h, p.y + abs(amount) * L * h * h * 0.18)
}
const cubicAt = (p0: vec2, p1: vec2, p2: vec2, p3: vec2, t: number): vec2 => {
  const u = 1 - t
  return vec2(p0 * (u * u * u) + p1 * (3 * u * u * t) + p2 * (3 * u * t * t) + p3 * (t * t * t))
}
// An offset on the page, in a frame turned by `degrees`, to one decimal.
const turnedOffset = (x: number, y: number, degrees: number): vec2 => {
  const t = turnOf(degrees, 1)
  return vec2(fixed(x * t.x - y * t.y), fixed(x * t.y + y * t.x))
}
// CSS ease-in-out, cubic-bezier(0.42, 0, 0.58, 1): solve x(u) = f by Newton's method, then y(u) = u * u * (3 - 2u).
const easeInOut = (f: number): number => {
  let u = f
  for (const _ of range(5)) {
    const x = 3 * (1 - u) * (1 - u) * u * 0.42 + 3 * (1 - u) * u * u * 0.58 + u * u * u - f
    const slope = 1.26 * (1 - u) * (1 - u) + 0.96 * (1 - u) * u + 1.26 * u * u
    u = u - x / slope
  }
  return u * u * (3 - 2 * u)
}
// How far along its keyframes an alternate, eased motion is: `delay` is negative, already that far into the cycle.
const eased = (seconds: number, delay: number): number => {
  const phase = (time - delay) / max(seconds, 0.001)
  const lap = floor(phase)
  const f = phase - lap
  return easeInOut(mod(lap, 2) > 0.5 ? 1 - f : f)
}

// ---- the outlines: every corner cut as paper-garden.ts cuts it, once

// Outlines: 0 great leaf, 1 middle leaf, 2 long blade, 3 short blade, 4 paddle, 5 coin, 6-8 discs (back, middle, front),
// 9-16 stem pieces (fern 0-2, under 0-1, vine 0-2), 17 the bloom's stalk, 18-19 the seed dots.
// RINGS rows: 0-8 the great leaf's outline then its slits, 9-15 the middle leaf's, then one row for each other outline.
const shapeOfRow = (row: number): number => (row < 8.5 ? 0 : row < 15.5 ? 1 : row - 14)
const ringOfRow = (row: number): number => (row < 8.5 ? row : row < 15.5 ? row - 9 : 0)
const firstRow = (shape: number): number => (shape < 0.5 ? 0 : shape < 1.5 ? 9 : shape + 14)

// broadLeafPath(length, width, bend, seed, veins): the outline, or one slit; then bent.
const leafPoint = (L: number, W: number, bend: number, seed: number, veins: number, ring: number, j: number): vec2 => {
  const fat = jitter(seed, 1, 0.1)
  const outline =
    j < 1.5 ? vec2(-4, 0)
    : j < 2.5 ? vec2(-4, -L * 0.1)
    : j < 3.5 ? vec2(-3, -L * 0.16)
    : j < 4.5 ? vec2(-W * 1.02 * fat, -L * 0.24)
    : j < 5.5 ? vec2(-W * 0.74, -L * 0.8)
    : j < 6.5 ? vec2(0, -L)
    : j < 7.5 ? vec2(W * 0.7, -L * 0.78)
    : j < 8.5 ? vec2((W * 1.06) / fat, -L * 0.3)
    : j < 9.5 ? vec2(3, -L * 0.16)
    : j < 10.5 ? vec2(4, -L * 0.1)
    : vec2(4, 0)
  const i = floor((ring - 1) / 2 + 0.25)
  const side = ring - 1 - i * 2 < 0.5 ? -1 : 1
  const from = -L * (0.3 + (0.5 * (i + (side > 0 ? 0.5 : 0))) / veins)
  const span = W * (0.56 - 0.24 * (i / veins)) * jitter(seed, i * 2 + side + 5, 0.1)
  const rise = L * 0.12
  const gap = 5 + W * 0.03
  const cut =
    j < 0.5 ? vec2(side * 9, from)
    : j < 1.5 ? vec2(side * (9 + span * 0.4), from - rise * 0.2 - gap)
    : j < 2.5 ? vec2(side * (9 + span * 0.8), from - rise * 0.7 - gap)
    : j < 3.5 ? vec2(side * (9 + span), from - rise)
    : j < 4.5 ? vec2(side * (9 + span * 0.85), from - rise * 0.6 + gap)
    : j < 5.5 ? vec2(side * (9 + span * 0.4), from - rise * 0.1 + gap)
    : vec2(side * 9, from)
  return bendPoint(ring < 0.5 ? outline : cut, L, bend)
}
// bladePath(length, width, bend, seed), bent.
const bladePoint = (L: number, w: number, bend: number, j: number): vec2 =>
  bendPoint(
    j < 0.5 ? vec2(-w * 0.25, 0)
    : j < 1.5 ? vec2(-w * 0.7, -L * 0.2)
    : j < 2.5 ? vec2(-w * 0.6, -L * 0.7)
    : j < 3.5 ? vec2(0, -L)
    : j < 4.5 ? vec2(w * 0.5, -L * 0.66)
    : j < 5.5 ? vec2(w * 0.75, -L * 0.22)
    : j < 7.5 ? vec2(w * 0.25, 0)
    : vec2(-w * 0.25, 0),
    L,
    bend,
  )
// paddlePath(reach, thickness, seed): not bent.
const paddlePoint = (r: number, t: number, j: number): vec2 =>
  j < 0.5 ? vec2(0, t * 0.3)
  : j < 1.5 ? vec2(r * 0.3, t * 0.35)
  : j < 2.5 ? vec2(r * 0.96, t * 1.5)
  : j < 3.5 ? vec2(r, 0)
  : j < 4.5 ? vec2(r * 1.02, -t * 1.35)
  : j < 5.5 ? vec2(r * 0.34, -t * 0.45)
  : j < 7.5 ? vec2(0, -t * 0.3)
  : vec2(0, t * 0.3)

// The smooth outline a faceted shape is cut from: point j of [start, c1, c2, end, c1, c2, end, ...].
const controlPoint = (shape: number, ring: number, j: number): vec2 =>
  shape < 0.5 ? leafPoint(660, 150, 0.16, 5, 4, ring, j)
  : shape < 1.5 ? leafPoint(440, 108, -0.2, 8, 3, ring, j)
  : shape < 2.5 ? bladePoint(430, 30, 0.2, j)
  : shape < 3.5 ? bladePoint(300, 24, -0.26, j)
  : paddlePoint(150, 30, j)

// facet(points, snip, seed): corner k, cut in straight snips about `snip` long, the way scissors would, in whole units.
// The corner count goes in z.
const facetCorner = (shape: number, ring: number, k: number): vec3 => {
  const leaf = shape < 1.5 ? 1 : 0
  const L = shape < 0.5 ? 660 : 440
  const W = shape < 0.5 ? 150 : 108
  const veins = shape < 0.5 ? 4 : 3
  const leafSeed = shape < 0.5 ? 5 : 8
  const slit = floor((ring - 1) / 2 + 0.25)
  const slitSpan = W * (0.56 - 0.24 * (slit / veins)) * jitter(leafSeed, slit * 2 + (ring - 1 - slit * 2 < 0.5 ? -1 : 1) + 5, 0.1)
  const snip =
    leaf > 0.5 ? (ring < 0.5 ? L / 9 : slitSpan / 2.5)
    : shape < 2.5 ? 430 / 7
    : shape < 3.5 ? 300 / 7
    : 150 / 8
  const seed =
    leaf > 0.5 ? (ring < 0.5 ? leafSeed : leafSeed + slit)
    : shape < 2.5 ? 4
    : shape < 3.5 ? 6
    : 12
  const segments = leaf > 0.5 && ring > 0.5 ? 2 : leaf > 0.5 ? 4 : 3
  let corner = controlPoint(shape, ring, 0)
  let before = 0
  let total = 1
  for (const s of range(4)) {
    const live = s < segments - 0.5 ? 1 : 0
    const i = 1 + s * 3
    const p0 = controlPoint(shape, ring, i - 1)
    const p1 = controlPoint(shape, ring, i)
    const p2 = controlPoint(shape, ring, i + 1)
    const p3 = controlPoint(shape, ring, i + 2)
    const span = length(vec2(p3 - p0)) + length(vec2(p1 - p0)) * 0.5
    const cuts = max(1, round(span / snip))
    const j = k - before
    if (live > 0.5 && j > 0.5 && j < cuts + 0.5) {
      const point = cubicAt(p0, p1, p2, p3, j / cuts)
      const wobble = j < cuts - 0.5 ? (hash(seed + i, j) - 0.5) * snip * 0.07 : 0
      corner = vec2(point.x + wobble, point.y - wobble)
    }
    before = before + live * cuts
    total = total + live * cuts
  }
  return vec3(round(corner.x), round(corner.y), total)
}

// coinPath(31, 21), its corners in fan order around the coin's middle: the stalk's lower edge, up the rim's cut edge,
// round the coin the other way, down the cut edge, the stalk's upper edge. The same outline, walked without overlap.
const coinCorner = (u: number): vec2 => {
  const k = u < 1.5 || u > 22.5 ? u : 24 - u
  const angle = PI - ((k - 1) / 22) * PI * 2
  const reach = 31 * jitter(21, k - 1, 0.035)
  const rim = vec2(31 * 1.3 + cos(angle) * reach, -sin(angle) * reach * 0.92)
  const c = k < 0.5 ? vec2(0, 2) : k < 1.5 ? vec2(31 * 0.35, 2) : k < 22.5 ? rim : k < 23.5 ? vec2(31 * 0.35, -2) : vec2(0, -2)
  return vec2(round(c.x), round(c.y))
}
// discPath(radius, scallops, seed): a scalloped disc cut by hand.
const discCorner = (radius: number, scallops: number, seed: number, i: number): vec2 => {
  const angle = (i / (scallops * 4)) * PI * 2
  const reach = radius * (1 + 0.09 * cos(angle * scallops + seed)) * jitter(seed, i, 0.035)
  return vec2(round(cos(angle) * reach), round(sin(angle) * reach))
}
// stemPiece(item, from, to): up the left side, down the right. One corner of the under sprig's sits a hair below a
// half, where the original rounds down; the 0.0001 keeps it there.
const stemCorner = (thick: number, L: number, bend: number, from: number, to: number, k: number): vec2 => {
  const left = k < 3.5 ? 1 : 0
  const j = left > 0.5 ? k : 7 - k
  const along = from + ((to - from) * j) / 3
  const half = thick * (1 - 0.8 * along) + 1
  const p = bendPoint(vec2(left > 0.5 ? -half : half, -along * L), L, bend)
  return vec2(round(p.x - 0.0001), round(p.y - 0.0001))
}
const stemOf = (shape: number, k: number): vec2 =>
  shape < 9.5 ? stemCorner(6, 520, 0.1, 0, 1 / 3 + 0.01, k)
  : shape < 10.5 ? stemCorner(6, 520, 0.1, 1 / 3, 2 / 3 + 0.01, k)
  : shape < 11.5 ? stemCorner(6, 520, 0.1, 2 / 3, 1, k)
  : shape < 12.5 ? stemCorner(4, 300, 0.14, 0, 0.5 + 0.01, k)
  : shape < 13.5 ? stemCorner(4, 300, 0.14, 0.5, 1, k)
  : shape < 14.5 ? stemCorner(4, 390, -0.1, 0, 1 / 3 + 0.01, k)
  : shape < 15.5 ? stemCorner(4, 390, -0.1, 1 / 3, 2 / 3 + 0.01, k)
  : stemCorner(4, 390, -0.1, 2 / 3, 1, k)
// The bloom's tapered stalk.
const stalkCorner = (k: number): vec2 =>
  k < 0.5 ? vec2(1564, 1100)
  : k < 1.5 ? vec2(1530, 1000)
  : k < 2.5 ? vec2(1484, 900)
  : k < 3.5 ? vec2(1438, 832)
  : k < 4.5 ? vec2(1443, 832)
  : k < 5.5 ? vec2(1492, 896)
  : k < 6.5 ? vec2(1540, 996)
  : vec2(1576, 1100)

// Every corner of every ring, drawn once: x, y and the ring's corner count.
const corners = buffer({ size: [CORNERS, RINGS], float: 32, filter: 'nearest', once: true }, p => {
  const k = p.cell.x
  const row = p.cell.y
  const shape = shapeOfRow(row)
  const ring = ringOfRow(row)
  let out = vec3(0, 0, 8)
  if (shape < 4.5) {
    out = facetCorner(shape, ring, k)
  } else if (shape < 5.5) {
    out = vec3(coinCorner(k), 25)
  } else if (shape < 6.5) {
    out = vec3(discCorner(58, 5, 2, k), 20)
  } else if (shape < 7.5) {
    out = vec3(discCorner(45, 6, 5, k), 24)
  } else if (shape < 8.5) {
    out = vec3(discCorner(30, 5, 9, k), 20)
  } else if (shape < 16.5) {
    out = vec3(stemOf(shape, k), 8)
  } else if (shape < 17.5) {
    out = vec3(stalkCorner(k), 8)
  } else {
    out = vec3(turnOf((k / 32) * 360, shape < 18.5 ? 13 : 6), 32)
  }
  return vec4(out, 1)
})
const cornerAt = (row: number, k: number): vec2 => vec2(corners.at(vec2(k, row)).xy)
const countOf = (row: number): number => corners.at(vec2(0, row)).z

// ---- the moving groups

// Each group's placement in the view box this frame: its fixed placement outside its motion about its origin, then up
// through its parent groups.
const placements = buffer({ size: [GROUPS, 1], float: 32, filter: 'nearest' }, p => {
  let a = vec2(1, 0)
  let b = vec2(0, 0)
  let at = p.cell.x
  for (const _ of range(DEPTH)) {
    if (at > -0.5) {
      const g = NODE_A.at(at)
      const o = NODE_B.at(at)
      const fixedTurn = NODE_C.at(at)
      const k = KIND.at(g.y)
      const e = g.y > 0.5 ? eased(g.z, g.w) : 0
      const fa = turnOf(mix(k.x, k.y, e), mix(k.z, k.w, e))
      const shift = g.y > 2.5 && g.y < 3.5 ? vec2(mix(vec2(-5, 3), vec2(4, -4), e)) : vec2(0, 0)
      // the motion about its origin: z -> o + shift + fa * (z - o)
      const origin = vec2(o.x, o.y)
      const mb = vec2(origin + shift - cmul(fa, origin))
      // then the fixed placement outside it
      const pa = turnOf(fixedTurn.x, fixedTurn.y)
      const la = cmul(pa, fa)
      const lb = vec2(cmul(pa, mb) + vec2(o.z, o.w))
      b = vec2(cmul(la, b) + lb)
      a = cmul(la, a)
      at = g.x
    }
  }
  return vec4(a.x, a.y, b.x, b.y)
})

// Each piece's four layers this frame (0 far shadow, 1 near shadow, 2 lip, 3 paper): its group's placement after the
// layer's offset, turned so shadows fall down and right whatever way the piece lies, and the lift of its shadows.
const layers = buffer({ size: [PIECES, 4], float: 32, filter: 'nearest' }, p => {
  const piece = PIECE_A.at(p.cell.x)
  const look = PIECE_B.at(p.cell.x)
  const layer = p.cell.y
  const lift = look.x
  const facing = -look.y
  const stalk = mod(floor(piece.w / 4 + 0.01), 2) > 0.5 ? 1 : 0
  const far = turnedOffset(lift * 1.9, lift * 2.4, facing)
  const near = stalk > 0.5 ? vec2(4, 5) : turnedOffset(lift * 0.9, lift * 1.15, facing)
  const lip = turnedOffset(-1.2, -1.2, facing)
  let offset = layer < 0.5 ? far : layer < 1.5 ? near : layer < 2.5 ? lip : vec2(0, 0)
  if (mod(piece.w, 2) > 0.5 && layer < 1.5) {
    offset = vec2(offset + turnedOffset(lift * 1.3, lift * 1.6, facing) * eased(look.z, look.w))
  }
  const g = placements.at(vec2(piece.x, 0))
  const ga = vec2(g.x, g.y)
  return vec4(ga, vec2(cmul(ga, offset) + vec2(g.z, g.w)))
})

// Which layers a piece has: the bloom's stalk a near shadow and paper, the seed dots paper alone, the pale leaves no lip.
const hasLayer = (flags: number, layer: number): number => {
  const noLip = mod(floor(flags / 2 + 0.01), 2)
  const stalk = mod(floor(flags / 4 + 0.01), 2)
  const dot = floor(flags / 8 + 0.01)
  return layer < 0.5 ? 1 - max(stalk, dot) : layer < 1.5 ? 1 - dot : layer < 2.5 ? 1 - noLip : 1
}
const paintOf = (paint: number): vec3 => vec3(COLORS.at(paint * 2 + floor(params.variant + 0.5)).rgb / 255)
const toneOf = (layer: number): number =>
  layer < 0.5 ? mix(0.05, 0.2, params.variant)
  : layer < 1.5 ? mix(0.11, 0.35, params.variant)
  : layer < 2.5 ? mix(0.38, 0.14, params.variant)
  : 1
// A point of a piece's outline, in the view box, onto the window.
const onWindow = (local: vec2, place: vec4): vec2 => {
  const w = vec2(cmul(vec2(place.x, place.y), local) + vec2(place.z, place.w))
  const s = scaleOf()
  const pt = pointOf(w, s, originOf(s))
  return vec2((pt / size) * 2 - 1)
}

// ---- the slit leaves: an even-odd fill, added up from fans, so a slit cut across the edge works as it did

// Every ring of a slit leaf is a fan from a pivot it can all be seen from, so each fan triangle adds its cover, in steps
// of 64 / 255 (exact in 8 bits), to the layer's channel (r far shadow, g near shadow, b paper); a cut edge fades over half
// a pixel. A slit inside the leaf makes 2 there, one across the edge 1 outside it: `tent` of the count is the even-odd
// cover.
const leafCounts = buffer({ filter: 'nearest' })
const leaves = shapes(
  { count: 66, instances: 81, cover: 2.5, draw: 'triangles', into: leafCounts, blend: 'add', clear: true },
  (v, i) => {
    const which = floor(i / 27 + 0.01)
    const rest = i - which * 27
    const layer = floor(rest / 9 + 0.01)
    const ring = rest - layer * 9
    const piece = which < 0.5 ? PALE0 : which < 1.5 ? PALE1 : PALE2
    const shape = PIECE_A.at(piece).y
    const row = firstRow(shape) + ring
    const n = countOf(row)
    const tri = floor(v / 3 + 0.01)
    const k = v - tri * 3
    const local = k < 0.5 ? PIVOT.at(row) : cornerAt(row, k < 1.5 ? tri : mod(tri + 1, n))
    const place = layers.at(vec2(piece, layer < 1.5 ? layer : 3))
    const step = 64 / 255
    const channel = layer < 0.5 ? vec4(step, 0, 0, 0) : layer < 1.5 ? vec4(0, step, 0, 0) : vec4(0, 0, step, 0)
    const hide = ring > (shape < 0.5 ? 8.5 : 6.5) || tri > n - 0.5
    return { at: onWindow(local, place), a: vec4(k < 0.5 ? 1 : 0, 0, 0, 0), b: channel, hide }
  },
  (s: Spot): vec4 => {
    const grow = sqrt(dx(s.a.x) * dx(s.a.x) + dy(s.a.x) * dy(s.a.x))
    const cover = clamp((s.a.x / max(grow, 0.000001)) * 2, 0, 1)
    return vec4(s.b * cover)
  },
)
const tent = (w: number): number => 1 - abs(1 - mod(w, 2))

// ---- every other piece, back to front, each as far shadow, near shadow, lip and paper

// Fans for the round outlines (coin, discs, dots), a ladder up both sides for the long ones (blades, paddle, stems,
// stalk). `a` holds the corner's weight toward each cut edge (1000 for an edge that is not a cut edge, so it never fades).
const paperLayer = buffer({ filter: 'nearest' })
const pieces = shapes(
  { count: CORNERS * 3, instances: PIECES * 4, cover: 3, draw: 'triangles', into: paperLayer, clear: true },
  (v, i) => {
    const index = floor(i / 4 + 0.01)
    const layer = i - index * 4
    const piece = PIECE_A.at(index)
    const shape = piece.y
    const row = firstRow(shape)
    const n = countOf(row)
    const tri = floor(v / 3 + 0.01)
    const k = v - tri * 3
    const ladder = (shape > 1.5 && shape < 4.5) || (shape > 8.5 && shape < 17.5) ? 1 : 0
    // a ladder: left side up from corner 0, right side up from corner `last`
    const last = shape < 4.5 ? n - 2 : n - 1
    const rungs = floor(last / 2 + 0.01)
    const q = floor(tri / 2 + 0.01)
    const second = tri - q * 2
    const leftA = cornerAt(row, q)
    const leftB = cornerAt(row, q + 1)
    const rightA = cornerAt(row, last - q)
    const rightB = cornerAt(row, last - q - 1)
    const ladderCorner = second < 0.5 ? (k < 0.5 ? leftA : k < 1.5 ? leftB : rightA) : k < 0.5 ? leftB : k < 1.5 ? rightB : rightA
    const ladderCut =
      second < 0.5
        ? vec3(1000, q < 0.5 ? 0 : 1000, 0)
        : vec3(0, 1000, q > rungs - 1.5 ? 0 : 1000)
    // a fan round the middle
    const middle = shape > 4.5 && shape < 5.5 ? vec2(31 * 1.3, 0) : vec2(0, 0)
    const fanCorner = k < 0.5 ? middle : k < 1.5 ? cornerAt(row, tri) : cornerAt(row, mod(tri + 1, n))
    const fanCut = vec3(0, 1000, 1000)
    const local = ladder > 0.5 ? ladderCorner : fanCorner
    const cut = ladder > 0.5 ? ladderCut : fanCut
    const weights = vec4((k < 0.5 ? 1 : 0) + cut.x, (k > 0.5 && k < 1.5 ? 1 : 0) + cut.y, (k > 1.5 ? 1 : 0) + cut.z, 0)
    // shadows in the shadow paint, the lip in the lip paint, the paper in its own
    const color = paintOf(layer < 1.5 ? 3 : layer < 2.5 ? 4 : piece.z)
    const hide =
      shape < 1.5 || hasLayer(piece.w, layer) < 0.5 || (ladder > 0.5 ? tri > rungs * 2 - 0.5 : tri > n - 0.5)
    return {
      at: onWindow(local, layers.at(vec2(index, layer))),
      a: weights,
      b: vec4(color, toneOf(layer)),
      hide,
    }
  },
  (s: Spot): vec4 => {
    const gx = vec4(dx(s.a))
    const gy = vec4(dy(s.a))
    const grow = vec4(sqrt(gx * gx + gy * gy))
    const d = vec4(s.a / max(grow, 0.000001))
    const cover = clamp(min(min(d.x, d.y), d.z) * 2, 0, 1) * s.b.w
    return vec4(s.b.x * cover, s.b.y * cover, s.b.z * cover, cover)
  },
)

// ---- the ground's paper fibres, drawn once

// fleckPath(): 26 short fibres, scattered by hash. Each is the triangle (x, y), (x+dx, y+dy), (x+dx+1, y+dy+1).
const fleckData = buffer({ size: [26, 1], float: 32, filter: 'nearest', once: true }, p => {
  const i = p.cell.x
  const angle = hash(i, 3) * PI
  const reach = 2 + hash(i, 4) * 3
  return vec4(round(hash(i, 1) * 168), round(hash(i, 2) * 206), fixed(cos(angle) * reach), fixed(sin(angle) * reach))
})
// One 173 x 211 tile of the pattern: how much of each texel the fibres cover, clipped to the tile as the pattern is.
const fibres = buffer({ size: [173 * FLECK_RES, 211 * FLECK_RES], filter: 'linear', wrap: 'repeat', once: true }, p => {
  const q = vec2((p.cell + 0.5) / FLECK_RES)
  let cover = 0
  for (const n of range(26)) {
    const f = fleckData.at(vec2(n, 0))
    const a = vec2(f.x, f.y)
    const b = vec2(f.x + f.z, f.y + f.w)
    const c = vec2(b.x + 1, b.y + 1)
    const turn = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0 ? 1 : -1
    const e1 = vec2(b - a)
    const e2 = vec2(c - b)
    const e3 = vec2(a - c)
    const d1 = (turn * (e1.x * (q.y - a.y) - e1.y * (q.x - a.x))) / max(length(e1), 0.0001)
    const d2 = (turn * (e2.x * (q.y - b.y) - e2.y * (q.x - b.x))) / max(length(e2), 0.0001)
    const d3 = (turn * (e3.x * (q.y - c.y) - e3.y * (q.x - c.x))) / max(length(e3), 0.0001)
    cover = max(cover, clamp(min(min(d1, d2), d3) * FLECK_RES + 0.5, 0, 1))
  }
  return vec4(cover, 0, 0, 1)
})

// ---- the sheet

// How much of a pixel the sheet covers when shifted by `shift`: inside its two hand-cut long edges.
const sheetCover = (vb: vec2, shift: vec2, pixels: number): number => {
  const y = vb.y - shift.y
  const along = (y + 40) / 36
  const row = clamp(floor(along), 0, 29)
  const f = along - row
  const e0 = PAGE.at(row)
  const e1 = PAGE.at(row + 1)
  const x = vb.x - shift.x
  const inside = y > -40 && y < 1040 ? 1 : 0
  return clamp(min(x - mix(e0.x, e1.x, f), mix(e0.y, e1.y, f) - x) * pixels + 0.5, 0, 1) * inside
}

// The paints of both stocks, from paper-garden.ts.
const stock = (cream: vec3, kraft: vec3): vec3 => vec3(mix(cream, kraft, params.variant) / 255)

// The ground and its fibres, the sheet with its shadows and lip, the slit leaves, then every other piece. Opaque.
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
  const pixels = s / p.px
  const shade = stock(vec3(92, 74, 38), vec3(0, 0, 0))
  const farTone = mix(0.05, 0.2, params.variant)
  const nearTone = mix(0.11, 0.35, params.variant)
  const fibre = fibres.sample(vec2(fract(vb.x / 173), fract(vb.y / 211))).r * 0.09
  let c = vec3(mix(stock(vec3(239, 232, 216), vec3(36, 33, 29)), stock(vec3(143, 124, 80), vec3(184, 173, 140)), fibre))
  // The sheet's cut edges wander within x 413..429 and 1190..1203. Its lip peeks out only along the left edge, its
  // shadows only along the right; elsewhere the sheet hides them, or they are not there.
  let sheet = vb.x > 421 && vb.x < 1197 ? 1 : 0
  if (vb.x > 405 && vb.x < 440) {
    c = vec3(mix(c, stock(vec3(255, 255, 255), vec3(243, 236, 217)), sheetCover(vb, vec2(-1.2, -1.2), pixels) * mix(0.38, 0.14, params.variant)))
    sheet = sheetCover(vb, vec2(0, 0), pixels)
  } else if (vb.x > 1180 && vb.x < 1220) {
    c = vec3(mix(c, shade, sheetCover(vb, vec2(5.7, 7.2), pixels) * farTone))
    c = vec3(mix(c, shade, sheetCover(vb, vec2(2.7, 3.4), pixels) * nearTone))
    sheet = sheetCover(vb, vec2(0, 0), pixels)
  }
  c = vec3(mix(c, stock(vec3(248, 243, 233), vec3(46, 43, 38)), sheet))
  const leaf = vec4((leafCounts.sample(p.uv) * 255) / 64)
  c = vec3(mix(c, shade, tent(leaf.r) * farTone))
  c = vec3(mix(c, shade, tent(leaf.g) * nearTone))
  c = vec3(mix(c, stock(vec3(211, 219, 193), vec3(57, 67, 47)), tent(leaf.b)))
  const top = paperLayer.sample(p.uv)
  return vec4(top.rgb + c * (1 - top.a), 1)
}
const view = picture(p => fadingIn(viewColor(p)))

export default shader({
  fps: 30,
  passes: [fadeClock, corners, fleckData, fibres, placements, layers, leafCounts, leaves, paperLayer, pieces, view],
})
