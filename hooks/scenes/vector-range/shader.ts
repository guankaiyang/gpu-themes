// Vector Range's moving parts on the GPU, over the still in still.ts: the two massifs swaying to and fro, the far range
// drifting left for ever, the cross lines of the ground grid creeping toward the viewer, the four beams retracing the
// ridges in turn, and the stars that breathe.
// Derived from theme-examples' scenes/vector-range.ts (Apache License 2.0): the same ridges, colours, widths and timings,
// drawn here instead of by CSS. The tables below are that file's geometry, generated from it and checked against its SVG.
//
// Almost everything near the horizon moves, and the massifs are painted with the sky so they hide what is behind them,
// so from y 455 down this shader paints the whole scene, in the original's order, opaque: sky, stars, afterglow, rays,
// cross lines, haze, far range, horizon, the middle massif, the near massif, and the tube glow on top. Above that the still
// shows through, but for a small disc around each breathing star, which is painted the same way.
//
// Coordinates: the scene is a 1600 x 1000 view box laid over the window with "xMidYMid slice", y down. The shader's
// points run y up, so every pixel goes back to the view box through `vbOf`.
import { abs, buffer, clamp, floor, fract, length, max, min, mix, mod, picture, px, range, shader, size, table, time, values, vec2, vec3, vec4 } from 'claude-code/shader'

// The harness always sends a variant; Vector Range has one look, so both variants draw the same.
const params = values({ variant: [0, 1] })

// Each massif's ridge vertices, every `step` units from x -260 with a jitter under a quarter step: x, y,
// the segment to the next vertex (1: on the ridge, + 2 if it starts a ridge stroke, + 4 if it ends one, both
// flat-ended), and the beam it carries (0-1 middle, 2-3 near; -1 none).
const MID_V = table([[-246.8, 745, 0, -1], [-184.4, 745, 0, -1], [-142.6, 745, 0, -1], [-70.7, 745, 0, -1], [-18.8, 745, 0, -1], [42.3, 745, 0, -1], [107.2, 745, 0, -1], [169.8, 745, 3, 0], [236.2, 689.2, 1, 0], [291.8, 700.7, 1, 0], [358.2, 661.6, 1, 0], [416.6, 681.3, 1, 0], [490.3, 711.3, 5, 0], [546.8, 745, 0, -1], [611.5, 745, 0, -1], [664, 745, 0, -1], [740, 745, 0, -1], [793.7, 745, 0, -1], [864.1, 745, 0, -1], [924.5, 745, 0, -1], [967.3, 745, 0, -1], [1029.6, 745, 0, -1], [1097.7, 745, 3, 1], [1178.5, 708.3, 1, 1], [1237.7, 626.5, 1, 1], [1292.2, 655.6, 1, 1], [1341, 465.6, 1, 1], [1423.4, 557.7, 1, 1], [1474.7, 551.1, 1, 1], [1533.3, 609.2, 1, 1], [1612.7, 598.4, 1, 1], [1676.2, 721.7, 1, -1], [1711.9, 736, 5, -1], [1796.3, 745, 0, -1], [1837.6, 745, 0, -1]])
// The arc lengths (0 to 1 along its beam) at both ends of each segment a beam runs along.
const MID_T = table([[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0.202856], [0.202856, 0.335649], [0.335649, 0.515874], [0.515874, 0.660026], [0.660026, 0.846133], [0.846133, 1], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0.096011], [0.096011, 0.205254], [0.205254, 0.272095], [0.272095, 0.484325], [0.484325, 0.618025], [0.618025, 0.673983], [0.673983, 0.76326], [0.76326, 0.849953], [0.849953, 1], [0, 0], [0, 0], [0, 0], [0, 0]])
// Each summit's spur: shoulder x, y, foot x (at the horizon), and 1 for a spur and dot, 2 with a lit face too.
const MID_F = table([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [376.3, 705.2, 403.3, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [1260.5, 682.4, 1294.8, 2], [0, 0, 0, 0], [1361.7, 620.6, 1392.8, 2], [0, 0, 0, 0], [1503.6, 632.6, 1546.8, 2], [0, 0, 0, 0], [1636.4, 667.8, 1672.1, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
const NEAR_V = table([[-259.7, 745, 3, -1], [-218.2, 737.7, 1, -1], [-161.7, 712.4, 1, -1], [-122.1, 723.1, 1, -1], [-72.4, 685, 1, 2], [-9.2, 698.4, 1, 2], [36.6, 638.6, 1, 2], [91.8, 705.2, 1, 2], [129, 637.3, 1, 2], [197.7, 713.5, 1, 2], [232.2, 705.8, 1, 2], [302.4, 728.5, 1, 2], [335.2, 736.2, 5, 2], [399.3, 745, 0, -1], [435.4, 745, 0, -1], [486.8, 745, 0, -1], [552, 745, 0, -1], [582.3, 745, 0, -1], [638.2, 745, 0, -1], [688.8, 745, 0, -1], [727.7, 745, 0, -1], [785.1, 745, 0, -1], [841.3, 745, 0, -1], [890.3, 745, 0, -1], [947, 745, 0, -1], [1001.9, 745, 0, -1], [1035.6, 745, 0, -1], [1094.4, 745, 0, -1], [1152.4, 745, 0, -1], [1194.7, 745, 0, -1], [1236.5, 745, 0, -1], [1296.2, 745, 3, 3], [1338, 726.4, 1, 3], [1402.2, 705.6, 1, 3], [1443.4, 672, 1, 3], [1492.8, 648.2, 1, 3], [1548.8, 603.4, 1, 3], [1588.4, 641.3, 1, 3], [1628.7, 592.8, 1, -1], [1692.7, 692, 1, -1], [1736.8, 626.4, 1, -1], [1795.3, 712.3, 5, -1], [1842.7, 725.2, 0, -1]])
const NEAR_T = table([[0, 0], [0, 0], [0, 0], [0, 0], [0, 0.105225], [0.105225, 0.227908], [0.227908, 0.368797], [0.368797, 0.494899], [0.494899, 0.662002], [0.662002, 0.719577], [0.719577, 0.839743], [0.839743, 0.894618], [0.894618, 1], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0.111366], [0.111366, 0.275635], [0.275635, 0.405043], [0.405043, 0.538518], [0.538518, 0.713082], [0.713082, 0.846507], [0.846507, 1], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]])
const NEAR_F = table([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [-89.7, 714.1, -115.8, 2], [0, 0, 0, 0], [56, 693.2, 85.2, 2], [0, 0, 0, 0], [113, 693.7, 89, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [1457.9, 707.3, 1479.8, 2], [0, 0, 0, 0], [1565.3, 679.1, 1590, 2], [0, 0, 0, 0], [1613.8, 669, 1591.3, 2], [0, 0, 0, 0], [1752.4, 696.6, 1775.9, 2], [0, 0, 0, 0], [0, 0, 0, 0]])
// The far range's ridge vertices, x, y; it repeats every 1638 units.
const FAR = table([[-98.5, 721.3], [-26.6, 735.7], [69.7, 723.8], [121.5, 735.1], [209.5, 720.2], [303.4, 717.7], [369, 722.9], [449.8, 722.8], [530.6, 722.4], [590, 730.6], [666.9, 718.8], [769, 733.2], [847.7, 711.6], [914.2, 717.9], [1007, 707.7], [1079.3, 733.8], [1156.8, 718.8], [1229.5, 722], [1296.1, 717.8], [1379.1, 725.5], [1460.8, 712.8], [1539.5, 721.3], [1611.4, 735.7], [1707.7, 723.8], [1759.5, 735.1], [1847.5, 720.2], [1941.4, 717.7], [2007, 722.9], [2087.8, 722.8], [2168.6, 722.4], [2228, 730.6], [2304.9, 718.8], [2407, 733.2], [2485.7, 711.6], [2552.2, 717.9], [2645, 707.7], [2717.3, 733.8], [2794.8, 718.8], [2867.5, 722], [2934.1, 717.8], [3017.1, 725.5], [3098.8, 712.8], [3177.5, 721.3], [3249.4, 735.7], [3345.7, 723.8]])
// The breathing stars: x, y, period and how far into it each starts, in seconds.
const BREATH = table([[1373.3, 251, 10, 5.2], [1386.8, 125, 7, 7], [1517.5, 52.9, 19, 1.4], [1562.4, 36.8, 16, 0.5], [1411.1, 132.3, 13, 9], [1539.6, 66.3, 10, 1.6], [1423.6, 339.4, 7, 3.2], [1323.5, 450.6, 19, 7.8], [1460.3, 262, 16, 4.3], [1226.4, 427.4, 13, 8.2], [1213.1, 476.8, 10, 2], [1270.6, 480.8, 19, 7.7], [1318.2, 401.9, 16, 1.3], [1574.5, 442.1, 13, 5.2], [1392.8, 397.5, 10, 5]])
// The plain stars low enough to fall in the band this shader paints: x, y, radius, opacity.
const BAND_STARS = table([[59.7, 474, 1.5, 0.75], [226.1, 451.8, 1.5, 0.75]])
// The creep keyframes: percent of the 144 s cycle, y.
const CREEP = table([[0, 775.6], [8.3, 778.3], [16.7, 781.4], [25, 785.3], [33.3, 790], [41.7, 796], [50, 803.8], [58.3, 814.5], [64.6, 825.5], [66.7, 830], [68.8, 835], [70.8, 840.6], [72.9, 847], [75, 854.3], [77.1, 862.7], [79.2, 872.5], [81.3, 884.1], [83.3, 898], [85.4, 915], [87.5, 936.3], [89.6, 963.6], [91.7, 1000], [93.8, 1051], [95.8, 1127.5], [97.9, 1255], [100, 1510]])
// Per 32 units of x, the highest y either massif can reach there, with its sway and widest stroke (9999: nowhere).
const GUARD = table([[9999, 631.6], [9999, 630.3], [9999, 630.3], [9999, 630.3], [682.2, 630.3], [682.2, 630.3], [682.2, 630.3], [682.2, 630.3], [654.6, 698.8], [654.6, 698.8], [654.6, 698.8], [654.6, 721.5], [654.6, 729.2], [654.6, 729.2], [674.3, 9999], [674.3, 9999], [674.3, 9999], [704.3, 9999], [9999, 9999], [9999, 9999], [9999, 9999], [9999, 9999], [9999, 9999], [9999, 9999], [9999, 9999], [9999, 9999], [9999, 9999], [9999, 9999], [9999, 9999], [9999, 9999], [9999, 9999], [9999, 9999], [9999, 9999], [701.3, 9999], [701.3, 9999], [701.3, 9999], [619.5, 9999], [619.5, 9999], [619.5, 9999], [458.6, 719.4], [458.6, 698.6], [458.6, 698.6], [458.6, 665.0], [458.6, 641.2], [458.6, 641.2], [458.6, 596.4], [544.1, 596.4], [544.1, 596.4], [544.1, 585.8], [544.1, 585.8]])

const HORIZON = 745
const SKY_TOP = vec3(0.0118, 0.0392, 0.0314)
const SKY_LOW = vec3(0.0275, 0.102, 0.0824)
const GROUND_FAR = vec3(0.0196, 0.0706, 0.0627)
const GROUND_NEAR = vec3(0.0118, 0.0392, 0.0314)
const HOT = vec3(0.6235, 0.9412, 0.8627)
const WARM = vec3(0.2471, 0.7216, 0.6039)
const COLD = vec3(0.1373, 0.4784, 0.4078)
const AMBER = vec3(1, 0.7059, 0.3294)
const PALE = vec3(0.8392, 0.949, 0.6902)
const LIT = vec3(0.6235, 0.9098, 0.8118)
const FLOOR = vec3(0.1843, 0.6039, 0.5098)
const AFTERGLOW = vec3(0.0863, 0.2784, 0.2275)
const TUBE = vec3(0.1216, 0.3333, 0.2784)

// The view box on the window.
const scaleOf = (): number => max(size.x / 1600, size.y / 1000)
const originOf = (s: number): vec2 => vec2((size.x - 1600 * s) * 0.5, (size.y - 1000 * s) * 0.5)
const vbOf = (pt: vec2, s: number, o: vec2): vec2 => vec2((pt.x - o.x) / s, (size.y - pt.y - o.y) / s)

// CSS's cubic-bezier(x1, y1, x2, y2) at progress x, solved by halving.
const bezier = (x1: number, y1: number, x2: number, y2: number, x: number): number => {
  let lo = 0
  let hi = 1
  for (const _ of range(22)) {
    const m = (lo + hi) * 0.5
    const xm = 3 * (1 - m) * (1 - m) * m * x1 + 3 * (1 - m) * m * m * x2 + m * m * m
    lo = xm < x ? m : lo
    hi = xm < x ? hi : m
  }
  const t = (lo + hi) * 0.5
  return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t
}

// Everything that moves, worked out once a frame, one texel each:
// 0-3 the beams' heads along their ridges (0 to 1.42), 4-5 the two massifs' sway, 6 the far range's drift,
// 7-18 the twelve cross lines' y, from the horizon down, 19-33 the breathing stars' opacity.
const clock = buffer({ size: [34, 1], float: 32, filter: 'nearest' }, p => {
  const k = p.cell.x
  let v = 0
  if (k < 3.5) {
    // Each beam runs in the first quarter of a 120 s cycle (cubic-bezier(.3,.1,.7,.9)) and rests past its end after.
    const delay = k < 0.5 ? 42 : k < 1.5 ? 102 : k < 2.5 ? 72 : 12
    const q = mod(time + delay, 120) / 120
    v = q < 0.25 ? 1.42 * bezier(0.3, 0.1, 0.7, 0.9, q / 0.25) : 1.42
  } else if (k < 5.5) {
    // translateX(-reach) to translateX(reach), 120 s ease-in-out, alternate.
    const reach = k < 4.5 ? 15 : 40
    const e = (time + (k < 4.5 ? 70 : 5)) / 120
    const n = floor(e)
    const f = e - n
    v = -reach + 2 * reach * bezier(0.42, 0, 0.58, 1, mod(n, 2) > 0.5 ? 1 - f : f)
  } else if (k < 6.5) {
    v = -1638 * fract(time / 520)
  } else if (k < 18.5) {
    // The creep keyframes, linear between stops, 144 s; line n starts (11 - n) * 12 s along, so the twelve lines stand
    // one cell apart on the road at every moment. Texel 7 + j holds the j-th nearest the horizon.
    const pct = ((fract(time / 12) + k - 7) / 12) * 100
    v = CREEP.at(0).y
    for (const i of range(25)) {
      const a = CREEP.at(i)
      const b = CREEP.at(i + 1)
      v = pct >= a.x ? mix(a.y, b.y, clamp((pct - a.x) / (b.x - a.x), 0, 1)) : v
    }
  } else {
    // .12 at 0% and 100%, 1 at 50%, ease-in-out each way.
    const b = BREATH.at(k - 19)
    const q = mod(time + b.w, b.z) / b.z
    v = q < 0.5 ? 0.12 + 0.88 * bezier(0.42, 0, 0.58, 1, q * 2) : 1 - 0.88 * bezier(0.42, 0, 0.58, 1, q * 2 - 1)
  }
  return vec4(v, 0, 0, 1)
})

// Which breathing star, if any, lies near each 6-unit cell of the sky's right side: its index + 1, else 0.
// The stars stand at least 25 units apart, so no cell is near two.
const STAR_CELL = 6
const starGrid = buffer({ size: [65, 78], float: 16, filter: 'nearest', once: true }, p => {
  const centre = vec2(1200 + (p.cell.x + 0.5) * STAR_CELL, 24 + (p.cell.y + 0.5) * STAR_CELL)
  let found = 0
  for (const k of range(15)) {
    const b = BREATH.at(k)
    found = length(vec2(centre.x - b.x, centre.y - b.y)) < 12.3 ? k + 1 : found
  }
  return vec4(found, 0, 0, 1)
})

// A stroke's cover at distance d from its middle line, half width hw, box-filtered over a pixel w wide.
const cover = (d: number, hw: number, w: number): number =>
  clamp((hw - d) / w + 0.5, 0, 1) - clamp((-hw - d) / w + 0.5, 0, 1)

// The distance from p to the segment a-b.
const segment = (p: vec2, a: vec2, b: vec2): number => {
  const ab = vec2(b - a)
  const u = clamp(((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / max(ab.x * ab.x + ab.y * ab.y, 0.0001), 0, 1)
  return length(vec2(p - a - ab * u))
}

// The same with flat ends: nothing past the start if `cutStart`, nor past the end if `cutEnd`.
const segmentCut = (p: vec2, a: vec2, b: vec2, cutStart: number, cutEnd: number): number => {
  const ab = vec2(b - a)
  const u = ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / max(ab.x * ab.x + ab.y * ab.y, 0.0001)
  const cut = (cutStart > 0.5 && u < 0) || (cutEnd > 0.5 && u > 1)
  return cut ? 1000 : length(vec2(p - a - ab * clamp(u, 0, 1)))
}

// The fade the floor and horizon strokes are painted with: full at the edges, `low` across the reading column.
const fade = (x: number, low: number): number => {
  const t = clamp(x / 1600, 0, 1)
  const u = min(t, 1 - t)
  return u < 0.12 ? 1 : u < 0.24 ? mix(1, 0.6, (u - 0.12) / 0.12) : u < 0.36 ? mix(0.6, low, (u - 0.24) / 0.12) : low
}

const skyAt = (y: number): vec3 => vec3(mix(SKY_TOP, SKY_LOW, clamp(y / HORIZON, 0, 1)))

// One side of a lit-face quad, for the nonzero winding count.
const crossing = (p: vec2, a: vec2, b: vec2): number => {
  const side = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y)
  return a.y <= p.y ? (b.y > p.y && side > 0 ? 1 : 0) : b.y <= p.y && side < 0 ? -1 : 0
}

const TRACE_LENGTH = [0.42, 0.24, 0.12, 0.07]

// The middle massif, painted over `c0` at view-box point q: its sky cover, lit faces, fall lines, three-stroke ridge,
// and its two beams, in the original's order.
const middleMassif = (c0: vec3, q: vec2, w: number, above: number): vec3 => {
  const x = q.x - clock.at(vec2(4, 0)).x
  const p = vec2(x, q.y)
  const i0 = floor((x + 260) / 62)
  let c = vec3(c0)
  // Nothing of the massif lies above its local summits, less the widest stroke's reach.
  const top = min(min(MID_V.at(i0 - 1).y, MID_V.at(i0).y), min(MID_V.at(i0 + 1).y, MID_V.at(i0 + 2).y))
  if (q.y > top - 7 && q.y < HORIZON + 7) {
    // The cover and the ridge: three segments always hold the one under p and all near enough to touch it.
    let ridgeY = HORIZON
    let slope = 0
    let dRidge = 1000
    let dTrace = vec4(1000)
    for (const k of range(3)) {
      const j = i0 - 1 + k
      const a = MID_V.at(j)
      const b = MID_V.at(j + 1)
      const inside = x >= a.x && x < b.x
      ridgeY = inside ? mix(a.y, b.y, (x - a.x) / (b.x - a.x)) : ridgeY
      slope = inside ? (b.y - a.y) / (b.x - a.x) : slope
      // Every stroke here reaches at most 7 from its line, so only a segment whose box, grown by 7, holds p is measured.
      const near = x > a.x - 7 && x < b.x + 7 && q.y > min(a.y, b.y) - 7 && q.y < max(a.y, b.y) + 7
      if (near && mod(a.z, 2) > 0.5) {
        dRidge = min(dRidge, segmentCut(p, vec2(a.x, a.y), vec2(b.x, b.y), mod(floor(a.z / 2), 2), floor(a.z / 4)))
      }
      const head = clock.at(vec2(max(a.w, 0), 0)).x
      const s = MID_T.at(j)
      if (near && a.w > -0.5 && head > s.x && head - 0.42 < s.y) {
        // The beam's dashes on this segment: arc lengths [head - length, head], as stretches of the segment.
        const ab = vec2(b.x - a.x, b.y - a.y)
        const u = ((x - a.x) * ab.x + (q.y - a.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y)
        for (const n of range(4)) {
          const lo = clamp((head - TRACE_LENGTH[n]! - s.x) / (s.y - s.x), 0, 1)
          const hi = clamp((head - s.x) / (s.y - s.x), 0, 1)
          const dn = length(vec2(p - vec2(a.x, a.y) - ab * clamp(u, lo, hi)))
          dTrace[n] = lo < hi ? min(dTrace[n]!, dn) : dTrace[n]!
        }
      }
    }
    c = mix(c, skyAt(q.y), clamp((q.y - ridgeY) / (length(vec2(1, slope)) * w) + 0.5, 0, 1) * above)

    // Fall lines, summit dots and lit faces of the summits near p: the even vertices among i0 - 1 .. i0 + 2.
    let dFall = 1000
    let dDot = 1000
    let wind = 0
    const firstSummit = i0 - 1 + mod(i0 - 1, 2)
    for (const k of range(2)) {
      const j = firstSummit + 2 * k
      const f = MID_F.at(j)
      const a = MID_V.at(j)
      const b = MID_V.at(j + 1)
      // Everything of a summit lies below it and between its spur's foot and the next saddle, give or take a stroke.
      const left = min(min(a.x, f.x), f.z) - 3
      const right = max(max(b.x, f.x), f.z) + 3
      if (f.w > 0.5 && x > left && x < right && q.y > min(a.y, b.y) - 3) {
        const summit = vec2(a.x, a.y)
        const shoulder = vec2(f.x, f.y)
        dFall = min(dFall, min(segmentCut(p, summit, shoulder, 1, 0), segmentCut(p, shoulder, vec2(f.z, HORIZON), 0, 1)))
        dDot = min(dDot, length(vec2(p - summit)))
        const saddle = vec2(b.x, b.y)
        const faceFoot = vec2(min(f.z, b.x), HORIZON)
        const faceShoulder = vec2(min(f.x, b.x), f.y)
        const turns =
          crossing(p, summit, saddle) + crossing(p, saddle, faceFoot) + crossing(p, faceFoot, faceShoulder) + crossing(p, faceShoulder, summit)
        wind = f.w > 1.5 ? wind + turns : wind
      }
    }
    c = mix(c, LIT, abs(wind) > 0.5 ? 0.055 : 0)
    if (dFall < 0.5 + w) {
      c = mix(c, COLD, 0.7 * cover(dFall, 0.5, w))
    }
    if (dRidge < 4.8 + w) {
      c = mix(c, WARM, 0.03 * cover(dRidge, 4.8, w))
      c = mix(c, WARM, 0.07 * cover(dRidge, 1.9, w))
      c = mix(c, WARM, 0.36 * cover(dRidge, 0.6, w))
    }

    // The beam: three green tails, the amber halo and head, each its own round-capped dash.
    if (dTrace.x < 5 + w) {
      c = mix(c, HOT, 0.4 * cover(dTrace.x, 0.9, w))
      c = mix(c, HOT, 0.6 * cover(dTrace.y, 1, w))
      c = mix(c, PALE, 0.85 * cover(dTrace.z, 1.1, w))
      c = mix(c, AMBER, 0.2 * cover(dTrace.w, 5, w))
      c = mix(c, AMBER, cover(dTrace.w, 1.3, w))
    }
  }
  return c
}

// The near massif, painted over `c0` at view-box point q: its sky cover, lit faces, fall lines, three-stroke ridge,
// summit dots and its two beams, in the original's order.
const nearMassif = (c0: vec3, q: vec2, w: number, above: number): vec3 => {
  const x = q.x - clock.at(vec2(5, 0)).x
  const p = vec2(x, q.y)
  const i0 = floor((x + 260) / 50)
  let c = vec3(c0)
  // Nothing of the massif lies above its local summits, less the widest stroke's reach.
  const top = min(min(NEAR_V.at(i0 - 1).y, NEAR_V.at(i0).y), min(NEAR_V.at(i0 + 1).y, NEAR_V.at(i0 + 2).y))
  if (q.y > top - 7 && q.y < HORIZON + 7) {
    // The cover and the ridge: three segments always hold the one under p and all near enough to touch it.
    let ridgeY = HORIZON
    let slope = 0
    let dRidge = 1000
    let dTrace = vec4(1000)
    for (const k of range(3)) {
      const j = i0 - 1 + k
      const a = NEAR_V.at(j)
      const b = NEAR_V.at(j + 1)
      const inside = x >= a.x && x < b.x
      ridgeY = inside ? mix(a.y, b.y, (x - a.x) / (b.x - a.x)) : ridgeY
      slope = inside ? (b.y - a.y) / (b.x - a.x) : slope
      // Every stroke here reaches at most 7 from its line, so only a segment whose box, grown by 7, holds p is measured.
      const near = x > a.x - 7 && x < b.x + 7 && q.y > min(a.y, b.y) - 7 && q.y < max(a.y, b.y) + 7
      if (near && mod(a.z, 2) > 0.5) {
        dRidge = min(dRidge, segmentCut(p, vec2(a.x, a.y), vec2(b.x, b.y), mod(floor(a.z / 2), 2), floor(a.z / 4)))
      }
      const head = clock.at(vec2(max(a.w, 0), 0)).x
      const s = NEAR_T.at(j)
      if (near && a.w > -0.5 && head > s.x && head - 0.42 < s.y) {
        // The beam's dashes on this segment: arc lengths [head - length, head], as stretches of the segment.
        const ab = vec2(b.x - a.x, b.y - a.y)
        const u = ((x - a.x) * ab.x + (q.y - a.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y)
        for (const n of range(4)) {
          const lo = clamp((head - TRACE_LENGTH[n]! - s.x) / (s.y - s.x), 0, 1)
          const hi = clamp((head - s.x) / (s.y - s.x), 0, 1)
          const dn = length(vec2(p - vec2(a.x, a.y) - ab * clamp(u, lo, hi)))
          dTrace[n] = lo < hi ? min(dTrace[n]!, dn) : dTrace[n]!
        }
      }
    }
    c = mix(c, skyAt(q.y), clamp((q.y - ridgeY) / (length(vec2(1, slope)) * w) + 0.5, 0, 1) * above)

    // Fall lines, summit dots and lit faces of the summits near p: the even vertices among i0 - 1 .. i0 + 2.
    let dFall = 1000
    let dDot = 1000
    let wind = 0
    const firstSummit = i0 - 1 + mod(i0 - 1, 2)
    for (const k of range(2)) {
      const j = firstSummit + 2 * k
      const f = NEAR_F.at(j)
      const a = NEAR_V.at(j)
      const b = NEAR_V.at(j + 1)
      // Everything of a summit lies below it and between its spur's foot and the next saddle, give or take a stroke.
      const left = min(min(a.x, f.x), f.z) - 3
      const right = max(max(b.x, f.x), f.z) + 3
      if (f.w > 0.5 && x > left && x < right && q.y > min(a.y, b.y) - 3) {
        const summit = vec2(a.x, a.y)
        const shoulder = vec2(f.x, f.y)
        dFall = min(dFall, min(segmentCut(p, summit, shoulder, 1, 0), segmentCut(p, shoulder, vec2(f.z, HORIZON), 0, 1)))
        dDot = min(dDot, length(vec2(p - summit)))
        const saddle = vec2(b.x, b.y)
        const faceFoot = vec2(min(f.z, b.x), HORIZON)
        const faceShoulder = vec2(min(f.x, b.x), f.y)
        const turns =
          crossing(p, summit, saddle) + crossing(p, saddle, faceFoot) + crossing(p, faceFoot, faceShoulder) + crossing(p, faceShoulder, summit)
        wind = f.w > 1.5 ? wind + turns : wind
      }
    }
    c = mix(c, LIT, abs(wind) > 0.5 ? 0.055 : 0)
    if (dFall < 0.5 + w) {
      c = mix(c, COLD, 0.6 * cover(dFall, 0.5, w))
    }
    if (dRidge < 5.2 + w) {
      c = mix(c, HOT, 0.04 * cover(dRidge, 5.2, w))
      c = mix(c, HOT, 0.1 * cover(dRidge, 2.1, w))
      c = mix(c, HOT, 0.5 * cover(dRidge, 0.65, w))
    }
    if (dDot < 1.3 + w) {
      c = mix(c, HOT, 0.6 * cover(dDot, 1.3, w))
    }

    // The beam: three green tails, the amber halo and head, each its own round-capped dash.
    if (dTrace.x < 5 + w) {
      c = mix(c, HOT, 0.4 * cover(dTrace.x, 0.9, w))
      c = mix(c, HOT, 0.6 * cover(dTrace.y, 1, w))
      c = mix(c, PALE, 0.85 * cover(dTrace.z, 1.1, w))
      c = mix(c, AMBER, 0.2 * cover(dTrace.w, 5, w))
      c = mix(c, AMBER, cover(dTrace.w, 1.3, w))
    }
  }
  return c
}

// Piecewise-linear gradient stops.
const afterglowA = (y: number): number => {
  const t = (y - 475) / 270
  return t < 0 ? 0 : t < 0.35 ? mix(0, 0.06, t / 0.35) : t < 0.65 ? mix(0.06, 0.2, (t - 0.35) / 0.3) : t < 0.85 ? mix(0.2, 0.36, (t - 0.65) / 0.2) : t <= 1 ? mix(0.36, 0.5, (t - 0.85) / 0.15) : 0
}
const hazeA = (y: number): number => {
  const t = (y - HORIZON) / 170
  return t < 0 ? 0 : t < 0.25 ? mix(1, 0.95, t / 0.25) : t < 0.6 ? mix(0.95, 0.5, (t - 0.25) / 0.35) : t < 1 ? mix(0.5, 0, (t - 0.6) / 0.4) : 0
}
const tubeA = (q: vec2): number => {
  const d = length(vec2((q.x - 800) / 1180, (q.y - 480) / 760))
  return d < 0.4 ? mix(0.34, 0.28, d / 0.4) : d < 0.75 ? mix(0.28, 0.16, (d - 0.4) / 0.35) : d < 1 ? mix(0.16, 0, (d - 0.75) / 0.25) : 0
}

const view = picture(p => {
  const s = scaleOf()
  const q = vbOf(p.point, s, originOf(s))
  const w = px / s

  // The breathing star near q, if any, and how much of the window around it this shader takes over.
  const found = starGrid.at(vec2(floor((q.x - 1200) / STAR_CELL), floor((q.y - 24) / STAR_CELL))).x
  let starA = 0
  let disc = 0
  if (found > 0.5) {
    const b = BREATH.at(found - 1)
    const d = length(vec2(q.x - b.x, q.y - b.y))
    starA = clock.at(vec2(18 + found, 0)).x * cover(d, 1.6, w)
    disc = clamp((min(1.6 + 2.5 * w, 8) - d) / w, 0, 1)
  }
  const band = clamp((q.y - 455) / 4, 0, 1)
  const take = max(band, disc)
  let out = vec4(0)
  if (take > 0) {
    // The sky above the horizon, the ground below, meeting at y 745.
    const above = clamp((HORIZON - q.y) / w + 0.5, 0, 1)
    let c = vec3(mix(vec3(mix(GROUND_FAR, GROUND_NEAR, clamp((q.y - HORIZON) / 255, 0, 1))), skyAt(q.y), above))
    // The two plain stars low enough to fall in the band.
    if (q.y < 480 && q.x < 240) {
      for (const k of range(2)) {
        const st = BAND_STARS.at(k)
        c = mix(c, WARM, st.w * cover(length(vec2(q.x - st.x, q.y - st.y)), st.z, w))
      }
    }
    c = mix(c, WARM, starA)
    c = mix(c, AFTERGLOW, afterglowA(q.y) * above)

    // The ground grid: rays from the vanishing point, then the cross lines, then the haze.
    if (q.y > HORIZON - 2) {
      // The rays' feet are 480 units apart at y 1051; the two whose feet straddle the line from the vanishing point
      // through q are the only ones near it.
      const footX = 1230 + ((q.x - 1230) * 306) / max(q.y - HORIZON, 0.01)
      const r0 = clamp(floor(((footX - 1230) / 1.2 + 2200) / 400), 0, 13)
      const dRay = min(
        segment(q, vec2(1230, HORIZON), vec2(1230 + (-2200 + 400 * r0) * 1.2, HORIZON + 306)),
        segment(q, vec2(1230, HORIZON), vec2(1230 + (-1800 + 400 * r0) * 1.2, HORIZON + 306)),
      )
      const floorFade = fade(q.x, 0.13)
      // The rays start at the horizon with a flat end.
      c = mix(c, FLOOR, 0.85 * floorFade * cover(dRay, 0.6, w) * (1 - above))
      // The cross lines near q: its own place on the road (depth 382.5 / (y - 745)), less this moment's offset.
      const road = 12.5 - 382.5 / max(q.y - HORIZON, 0.01) - fract(time / 12)
      if (q.y > 772) {
        const j0 = floor(road) - 1
        for (const n of range(4)) {
          const j = j0 + n
          const there = j > -0.5 && j < 11.5 ? 1 : 0
          c = mix(c, FLOOR, there * floorFade * cover(abs(q.y - clock.at(vec2(7 + j, 0)).x), 0.6, w))
        }
      }
      c = mix(c, GROUND_FAR, hazeA(q.y) * (1 - above))
    }

    // The far range, drifting left, painted with the sky. Its hills stand at most 40 high.
    if (q.y > HORIZON - 48 && q.y < HORIZON + 2) {
      const fx = q.x - clock.at(vec2(6, 0)).x
      const fp = vec2(fx, q.y)
      const f0 = floor((fx + 100) / 78)
      let farY = HORIZON
      let farSlope = 0
      let dFar = 1000
      for (const k of range(3)) {
        const a = FAR.at(f0 - 1 + k)
        const b = FAR.at(f0 + k)
        const inside = fx >= a.x && fx < b.x
        farY = inside ? mix(a.y, b.y, (fx - a.x) / (b.x - a.x)) : farY
        farSlope = inside ? (b.y - a.y) / (b.x - a.x) : farSlope
        dFar = min(dFar, segment(fp, vec2(a.x, a.y), vec2(b.x, b.y)))
      }
      c = mix(c, skyAt(q.y), clamp((q.y - farY) / (length(vec2(1, farSlope)) * w) + 0.5, 0, 1) * above)
      c = mix(c, COLD, 0.4 * cover(dFar, 0.55, w))
    }

    // The horizon: three strokes, widest and faintest first.
    const dH = abs(q.y - HORIZON)
    if (dH < 4 + 2 * w) {
      const hFade = fade(q.x, 0.12)
      c = mix(c, WARM, 0.02 * hFade * cover(dH, 4, w))
      c = mix(c, WARM, 0.06 * hFade * cover(dH, 1.6, w))
      c = mix(c, WARM, 0.28 * hFade * cover(dH, 0.5, w))
    }

    // Each massif only where its ridges can reach.
    const guard = GUARD.at(floor(q.x / 32))
    if (q.y < HORIZON + 7 && q.y > guard.x) {
      c = middleMassif(c, q, w, above)
    }
    if (q.y < HORIZON + 7 && q.y > guard.y) {
      c = nearMassif(c, q, w, above)
    }

    c = mix(c, TUBE, tubeA(q))
    out = vec4(c * take, take)
  }
  return vec4(out * (1 + params.variant * 0))
})

export default shader({ fps: 30, passes: [clock, starGrid, view] })
