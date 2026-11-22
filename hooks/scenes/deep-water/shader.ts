// Deep Water on the GPU: the whole scene, painted opaque over the still in still.ts, with its moving parts: three light
// shafts that sway, two pairs of caustic bands that drift, four bubbles that rise up the far edges, and the turtle that
// glides in the bottom right corner. The still holds the same scene at time 0, so the two meet without a jump.
// Derived from theme-examples' scenes/classic.ts (Apache License 2.0): the same shapes, gradients, colours and
// timings (ease-in-out, alternate / alternate-reverse, linear rise with negative delays), drawn here instead of by CSS.
//
// Coordinates: the scene is a 1600 x 1000 view box laid over the window with "xMidYMid slice", y down. The shader's
// points run y up, so every pixel goes back to the view box through `vbOf`.
import { abs, buffer, clamp, cos, floor, length, max, mix, mod, PI, picture, range, shader, sin, size, sqrt, time, values, vec2, vec3, vec4 } from 'claude-code/shader'

// The harness always passes a variant; Deep Water has one look, so both draw the same.
const params = values({ variant: [0, 1] })

const DEEP_TOP = vec3(15 / 255, 111 / 255, 134 / 255)
const DEEP_MID = vec3(10 / 255, 70 / 255, 96 / 255)
const DEEP_LOW = vec3(4 / 255, 28 / 255, 48 / 255)
const RAY = vec3(191 / 255, 243 / 255, 255 / 255)
const CAUSTIC = vec3(159 / 255, 233 / 255, 245 / 255)
const ORB = vec3(201 / 255, 246 / 255, 255 / 255)
const GLINT = vec3(232 / 255, 253 / 255, 255 / 255)
const HONU_DARK = vec3(11 / 255, 58 / 255, 77 / 255)
const HONU_SHELL = vec3(18 / 255, 77 / 255, 99 / 255)

// The view box on the window.
const scaleOf = (): number => max(size.x / 1600, size.y / 1000)
const originOf = (s: number): vec2 => vec2((size.x - 1600 * s) * 0.5, (size.y - 1000 * s) * 0.5)
const vbOf = (pt: vec2, s: number, o: vec2): vec2 => vec2((pt.x - o.x) / s, (size.y - pt.y - o.y) / s)

// CSS ease-in-out, cubic-bezier(0.42, 0, 0.58, 1): solve x(t) = x by Newton's method, answer y(t).
const easeInOut = (x: number): number => {
  let t = x
  for (const _n of range(6)) {
    const u = 1 - t
    const xt = 3 * u * u * t * 0.42 + 3 * u * t * t * 0.58 + t * t * t
    const slope = 1.26 * u * u + 0.96 * u * t + 1.26 * t * t
    t = clamp(t - (xt - x) / slope, 0, 1)
  }
  return 3 * (1 - t) * t * t + t * t * t
}

// An `infinite alternate` animation's eased progress, 0 to 1; `reverse` 1 for alternate-reverse.
const swing = (period: number, reverse: number): number => {
  const c = time / period
  const n = floor(c)
  const f = c - n
  const flip = abs(mod(n, 2) - reverse)
  return easeInOut(flip > 0.5 ? 1 - f : f)
}

const DEG = PI / 180
const tanOf = (degrees: number): number => sin(degrees * DEG) / cos(degrees * DEG)

// Each frame, once: texel 0 holds the two sways' tan(skew) (38 s alternate, 52 s alternate-reverse) and the two
// bands' drift (70 s alternate, 95 s alternate-reverse); texel 1 the turtle's glide (80 s alternate).
const motion = buffer({ size: [2, 1], float: 32, filter: 'nearest' }, p => {
  const swayA = tanOf(-5 + 11 * swing(38, 0))
  const swayB = tanOf(-5 + 11 * swing(52, 1))
  const driftA = -90 + 180 * swing(70, 0)
  const driftB = -90 + 180 * swing(95, 1)
  return p.cell.x < 0.5 ? vec4(swayA, swayB, driftA, driftB) : vec4(swing(80, 0), 0, 0, 1)
})

// The turtle, painted once in its own frame (x -136..152, y -112..112, y down, 4 texels a unit):
// r, the dark body, head, flippers and tail; g, the lighter shell over them.
const HONU_X = -136
const HONU_Y = -112
const HONU_W = 288
const HONU_H = 224

// Crossings of the ray from (px, py) toward +x with a quadratic Bezier (none of the turtle's is flat in y).
const quadCross = (px: number, py: number, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): number => {
  const a = y0 - 2 * cy + y1
  const b = 2 * (cy - y0)
  const c = y0 - py
  const disc = b * b - 4 * a * c
  const sq = sqrt(max(disc, 0))
  const t1 = (-b - sq) / (2 * a)
  const t2 = (-b + sq) / (2 * a)
  const x1t = (1 - t1) * (1 - t1) * x0 + 2 * t1 * (1 - t1) * cx + t1 * t1 * x1
  const x2t = (1 - t2) * (1 - t2) * x0 + 2 * t2 * (1 - t2) * cx + t2 * t2 * x1
  const k1 = disc >= 0 && t1 >= 0 && t1 < 1 && x1t > px ? 1 : 0
  const k2 = disc > 0 && t2 >= 0 && t2 < 1 && x2t > px ? 1 : 0
  return k1 + k2
}
// Crossings of the same ray with a straight edge.
const lineCross = (px: number, py: number, x0: number, y0: number, x1: number, y1: number): number => {
  const spans = (y0 <= py && py < y1) || (y1 <= py && py < y0) ? 1 : 0
  const x = x0 + ((py - y0) / (y1 - y0 + (spans > 0.5 ? 0 : 1))) * (x1 - x0)
  return spans > 0.5 && x > px ? 1 : 0
}
// A flipper: "M x0 y0 q .. .. q .. .. z" in absolute points.
const flipper = (
  px: number, py: number,
  x0: number, y0: number, c1x: number, c1y: number, x1: number, y1: number, c2x: number, c2y: number, x2: number, y2: number,
): number => {
  const k = quadCross(px, py, x0, y0, c1x, c1y, x1, y1) + quadCross(px, py, x1, y1, c2x, c2y, x2, y2) + lineCross(px, py, x2, y2, x0, y0)
  return mod(k, 2)
}
const inEllipse = (px: number, py: number, cx: number, cy: number, rx: number, ry: number): number =>
  length(vec2((px - cx) / rx, (py - cy) / ry)) <= 1 ? 1 : 0

const honu = buffer({ size: [1152, 896], once: true, filter: 'mipmap' }, p => {
  const x = HONU_X + p.uv.x * HONU_W
  const y = HONU_Y + p.uv.y * HONU_H
  const body = max(inEllipse(x, y, 0, 0, 92, 62), inEllipse(x, y, 108, -10, 30, 20))
  // M40 -52 q60 -64 104 -40 q-44 10 -78 62z, M36 52 q58 60 96 34 q-40 -6 -70 -54z
  const front = max(flipper(x, y, 40, -52, 100, -116, 144, -92, 100, -82, 66, -30), flipper(x, y, 36, 52, 94, 112, 132, 86, 92, 80, 62, 32))
  // M-58 -44 q-52 -30 -70 -6 q38 0 56 34z, M-58 44 q-50 30 -66 8 q36 -2 54 -34z
  const back = max(flipper(x, y, -58, -44, -110, -74, -128, -50, -90, -50, -72, -16), flipper(x, y, -58, 44, -108, 74, -124, 52, -88, 50, -70, 18))
  // M-92 0 l-30 6 l28 6z
  const tail = mod(lineCross(x, y, -92, 0, -122, 6) + lineCross(x, y, -122, 6, -94, 12) + lineCross(x, y, -94, 12, -92, 0), 2)
  const dark = max(max(body, front), max(back, tail))
  return vec4(dark, inEllipse(x, y, 0, 0, 70, 44), 0, 1)
})

// One shaft's opacity: its rect, x 0..w and y -40..860, skewed by `skew` (the group's and the sway's tangents added)
// and moved right by `tx`; the ray gradient across the rect's width, 0 to 0.3 to 0.
const shaftOf = (vb: vec2, tx: number, skew: number, w: number): number => {
  const u = (vb.x - tx - skew * vb.y) / w
  return u > 0 && u < 1 && vb.y > -40 && vb.y < 860 ? 0.3 * (1 - abs(2 * u - 1)) : 0
}

// A soft gradient ellipse or circle: `peak` at the centre to 0 at the rim.
const softOf = (vb: vec2, cx: number, cy: number, rx: number, ry: number, peak: number): number =>
  peak * max(1 - length(vec2((vb.x - cx) / rx, (vb.y - cy) / ry)), 0)

// A bubble's rise: 46 s linear, 1150 units up, fading in over the first 12% and out over the last 15%.
// `delay` is how far into its cycle it starts. x is the rise, y the opacity.
const riseOf = (delay: number): vec2 => {
  const f = mod(time + delay, 46) / 46
  const opacity = f < 0.12 ? f / 0.12 : f < 0.85 ? 1 : (1 - f) / 0.15
  return vec2(-1150 * f, opacity)
}

const over = (acc: vec3, rgb: vec3, a: number): vec3 => vec3(rgb * a + acc * (1 - a))

const view = picture(p => {
  const s = scaleOf()
  const vb = vbOf(p.point, s, originOf(s))
  const m0 = motion.at(vec2(0, 0))
  const m1 = motion.at(vec2(1, 0))

  // The water: three stops down the view box.
  const y = clamp(vb.y / 1000, 0, 1)
  let acc = vec3(y < 0.45 ? mix(DEEP_TOP, DEEP_MID, y / 0.45) : mix(DEEP_MID, DEEP_LOW, (y - 0.45) / 0.55))

  // The shafts, in one group under the fade mask (white at y -40 to black at 0.92 of its 900).
  const s1 = shaftOf(vb, -60, -0.2493280028 + m0.x, 460)
  const s2 = shaftOf(vb, 1180, 0.1943803091 + m0.y, 520)
  const s3 = shaftOf(vb, 250, -0.3639702343 + m0.y, 420) * 0.55
  const fade = clamp(1 - (vb.y + 40) / 828, 0, 1)
  acc = over(acc, RAY, (1 - (1 - s1) * (1 - s2) * (1 - s3)) * fade)

  // The caustic bands: the top pair drifts one way, the bottom pair the other.
  const b1 = softOf(vb, 380 + m0.z, 130, 620, 70, 0.2)
  const b2 = softOf(vb, 1280 + m0.z, 170, 540, 56, 0.2)
  const b3 = softOf(vb, 300 + m0.w, 900, 700, 80, 0.2)
  const b4 = softOf(vb, 1350 + m0.w, 880, 560, 64, 0.2)
  acc = over(acc, CAUSTIC, 1 - (1 - b1) * (1 - b2) * (1 - b3) * (1 - b4))

  // The bubbles, each a group with its own opacity; the big one carries a glint.
  const r1 = riseOf(4)
  acc = over(acc, ORB, softOf(vb, 70, 1060 + r1.x, 46, 46, 0.22) * r1.y)
  const r2 = riseOf(21)
  const orb2 = softOf(vb, 1535, 1080 + r2.x, 62, 62, 0.22)
  const glint2 = softOf(vb, 1518, 1060 + r2.x, 15, 15, 0.3)
  const alpha2 = glint2 + orb2 * (1 - glint2)
  acc = vec3((GLINT * glint2 + ORB * orb2 * (1 - glint2)) * r2.y + acc * (1 - alpha2 * r2.y))
  const r3 = riseOf(33)
  acc = over(acc, ORB, softOf(vb, 1470, 1050 + r3.x, 30, 30, 0.22) * r3.y)
  const r4 = riseOf(14)
  acc = over(acc, ORB, softOf(vb, 150, 1070 + r4.x, 26, 26, 0.22) * r4.y)

  // The turtle: translate(1300 800), then the glide's translate(-70p, -26p) rotate(-4 + 7p deg), at half opacity.
  const g = m1.x
  const turn = (-4 + 7 * g) * DEG
  const rel = vec2(vb.x - 1300 + 70 * g, vb.y - 800 + 26 * g)
  const q = vec2(rel.x * cos(turn) + rel.y * sin(turn), rel.y * cos(turn) - rel.x * sin(turn))
  const h = honu.sample(vec2((q.x - HONU_X) / HONU_W, (q.y - HONU_Y) / HONU_H))
  const honuAlpha = (h.g + h.r * (1 - h.g)) * 0.5
  acc = vec3((HONU_SHELL * h.g + HONU_DARK * h.r * (1 - h.g)) * 0.5 + acc * (1 - honuAlpha))

  // The calm: black, 0.12 at the middle to 0.05 at 0.6 to 0 at the rim of an ellipse 0.6 of the view box.
  const d = length(vec2((vb.x / 1600 - 0.5) / 0.6, (vb.y / 1000 - 0.55) / 0.6))
  const calm = d < 0.6 ? mix(0.12, 0.05, d / 0.6) : d < 1 ? mix(0.05, 0, (d - 0.6) / 0.4) : 0
  acc = vec3(acc * (1 - calm) + params.variant * 0)

  return vec4(acc, 1)
})

export default shader({ fps: 30, passes: [motion, honu, view] })
