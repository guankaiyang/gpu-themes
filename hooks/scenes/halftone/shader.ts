// Halftone Dawn and Halftone Dusk on the GPU: the whole sheet, repainted over the still in still.ts, so every dot of
// both ink plates can swell and thin in its travelling wave. The coral sun's dots pulse outward in rings from the sun
// (24 s), the blue hills' dots thin in a wave that runs along the ground away from the sun (40 s); both walk their
// keyframes in steps(4), as the CSS did.
// Derived from theme-examples' scenes/halftone-dawn.ts (Apache License 2.0): the same lattice, tones, rounding, bands,
// delays, keyframes, colours and blending, drawn here instead of by CSS.
//
// Coordinates: the sheet is a 1600 x 1000 view box laid over the window with "xMidYMid slice", y down. The shader's
// points run y up, so every pixel goes back to the view box through `vbOf`.
//
// Variant 0 is Dawn (cream stock, inks multiply), variant 1 Dusk (night-blue stock, inks laid on top with opacity).
import { abs, buffer, clamp, cos, exp, floor, length, max, min, mix, mod, PI, picture, pow, shader, sin, size, sqrt, table, time, values, vec2, vec3, vec4 } from 'claude-code/shader'

const params = values({ variant: [0, 1] })

const PITCH = 11
// The lattice reaches ceil(2000 / PITCH) cells each way from the sheet's centre: 365 cells a side.
const REACH = 182
const SUN_X = 1408
const SUN_Y = 786
const SUN_RADIUS = 220
const BAND = 12
const SUN_SECONDS = 24
const SUN_LENGTH = 132
const HILL_SECONDS = 40
const HILL_LENGTH = 560

// The keyframes, as waveKeyframes() writes them: [offset (its percent, to 2 places, over 100), stroke-width scale to 3 places].
const SUN_KEYS = table([[0, 1.32], [0.0833, 1.272], [0.1667, 1.148], [0.25, 0.997], [0.3333, 0.875], [0.4167, 0.812], [0.5, 0.8], [0.5833, 0.812], [0.6667, 0.875], [0.75, 0.997], [0.8333, 1.148], [0.9167, 1.272], [1, 1.32]])
const HILL_KEYS = table([[0, 0.7], [0.0833, 0.733], [0.1667, 0.816], [0.25, 0.913], [0.3333, 0.989], [0.4167, 1.024], [0.5, 1.03], [0.5833, 1.024], [0.6667, 0.989], [0.75, 0.913], [0.8333, 0.816], [0.9167, 0.733], [1, 0.7]])

// The two stocks.
const DAWN_TOP = vec3(0.9647, 0.9255, 0.8627)
const DAWN_FOOT = vec3(0.949, 0.8627, 0.7765)
const DAWN_CORAL = vec3(0.8314, 0.3608, 0.2392)
const DAWN_BLUE = vec3(0.3843, 0.5137, 0.7137)
const DUSK_TOP = vec3(0.1059, 0.1216, 0.1882)
const DUSK_FOOT = vec3(0.1529, 0.1647, 0.2471)
const DUSK_CORAL = vec3(0.851, 0.3765, 0.2275)
const DUSK_BLUE = vec3(0.498, 0.5647, 0.7294)
const DUSK_CORAL_OPACITY = 0.86
const DUSK_BLUE_OPACITY = 0.7

// The scene's own smooth(): clamped, then t * t * (3 - 2t).
const smooth = (from: number, to: number, value: number): number => {
  const t = clamp((value - from) / (to - from), 0, 1)
  return t * t * (3 - 2 * t)
}
const bell = (x: number, peakX: number, halfWidth: number, height: number): number => {
  const t = (x - peakX) / halfWidth
  return height * exp(-t * t)
}
const awayFromColumn = (x: number): number => max(1 - smooth(300, 520, x), smooth(1080, 1260, x))
const farCrest = (x: number): number =>
  968 - 34 * awayFromColumn(x) - bell(x, 150, 250, 205) - bell(x, 1600, 330, 135) - 13 * sin(x / 150 + 1) - 5 * sin(x / 53)
const nearCrest = (x: number): number => 1014 - bell(x, -50, 270, 190) - bell(x, 1340, 250, 100) - 7 * sin(x / 90 + 2)

const hillTone = (x: number, y: number): number => {
  const nc = nearCrest(x)
  const fc = farCrest(x)
  const near = 0.42 * smooth(0, 36, y - nc) - 0.12 * smooth(36, 150, y - nc)
  const far = 0.21 * smooth(0, 36, y - fc) - 0.06 * smooth(36, 160, y - fc)
  return max(max(near, far), 0) * (0.3 + 0.7 * awayFromColumn(x))
}

const sunTone = (x: number, y: number): number => {
  const d = length(vec2(x - SUN_X, y - SUN_Y))
  const behindHills = 1 - smooth(2, 38, y - min(farCrest(x), nearCrest(x)))
  const q = d / SUN_RADIUS
  const body = d < SUN_RADIUS ? 0.37 * (1 - q * q * q * q) : 0
  const fade = 1 - smooth(0, 150, d - SUN_RADIUS * 0.9)
  const glow = fade > 0 ? 0.06 * pow(fade, 1.3) : 0
  return max(body, glow) * behindHills
}

// A dot's printed diameter from its tone: dots under 2.3 are not drawn, the rest round to half a unit.
const widthOf = (tone: number): number => {
  const diameter = 2 * PITCH * sqrt(tone / PI)
  return diameter < 2.3 ? 0 : floor(diameter * 2 + 0.5) / 2
}

// A path's animation-delay, as the CSS wrote it: the band's lag through the wave, less a whole cycle, to 2 places.
const delayOf = (band: number, seconds: number, waveLength: number): number => {
  const lag = mod(((band + 0.5) * BAND) / waveLength, 1)
  return -floor((seconds - lag * seconds) * 100 + 0.5) / 100
}

const TURN = (15 * PI) / 180

// Each lattice cell, drawn once: r, g the coral dot's width and delay on this lattice point; b, a the blue dot's, half
// a cell over. A width of 0 is no dot.
const dots = buffer({ size: [2 * REACH + 1, 2 * REACH + 1], once: true, float: 32, filter: 'nearest' }, p => {
  const c = cos(TURN)
  const s = sin(TURN)
  const i = p.cell.x - REACH
  const j = p.cell.y - REACH
  const sx = 800 + (i * c - j * s) * PITCH
  const sy = 500 + (i * s + j * c) * PITCH
  const bx = 800 + ((i + 0.5) * c - (j + 0.5) * s) * PITCH
  const by = 500 + ((i + 0.5) * s + (j + 0.5) * c) * PITCH
  const sunIn = sx >= -6 && sx <= 1606 && sy >= -6 && sy <= 1006 ? 1 : 0
  const hillIn = bx >= -6 && bx <= 1606 && by >= -6 && by <= 1006 ? 1 : 0
  const sunWidth = widthOf(sunTone(sx, sy)) * sunIn
  const hillWidth = widthOf(hillTone(bx, by)) * hillIn
  const sunDelay = delayOf(floor(length(vec2(sx - SUN_X, sy - SUN_Y)) / BAND), SUN_SECONDS, SUN_LENGTH)
  const hillDelay = delayOf(floor(abs(SUN_X - bx) / BAND), HILL_SECONDS, HILL_LENGTH)
  return vec4(sunWidth, sunDelay, hillWidth, hillDelay)
})

// The stroke-width scale at `p` (0 to 1) through a cycle: between two keyframes, steps(4) holds each quarter's start.
const sunScale = (p: number): number => {
  const k0 = clamp(floor(p * 12), 0, 11)
  const k1 = p < SUN_KEYS.at(k0).x ? k0 - 1 : k0
  const k = p >= SUN_KEYS.at(k1 + 1).x ? k1 + 1 : k1
  const a = SUN_KEYS.at(k)
  const b = SUN_KEYS.at(k + 1)
  return mix(a.y, b.y, floor(((p - a.x) / (b.x - a.x)) * 4) / 4)
}
const hillScale = (p: number): number => {
  const k0 = clamp(floor(p * 12), 0, 11)
  const k1 = p < HILL_KEYS.at(k0).x ? k0 - 1 : k0
  const k = p >= HILL_KEYS.at(k1 + 1).x ? k1 + 1 : k1
  const a = HILL_KEYS.at(k)
  const b = HILL_KEYS.at(k + 1)
  return mix(a.y, b.y, floor(((p - a.x) / (b.x - a.x)) * 4) / 4)
}

// The view box on the window ("xMidYMid slice").
const scaleOf = (): number => max(size.x / 1600, size.y / 1000)
const originOf = (s: number): vec2 => vec2((size.x - 1600 * s) * 0.5, (size.y - 1000 * s) * 0.5)
const vbOf = (pt: vec2, s: number, o: vec2): vec2 => vec2((pt.x - o.x) / s, (size.y - pt.y - o.y) / s)

// toFixed(1), as the path data holds each dot's centre.
const tenth = (v: number): number => floor(v * 10 + 0.5) / 10

const view = picture(p => {
  const s = scaleOf()
  const vb = vbOf(p.point, s, originOf(s))
  const pixel = p.px / s
  const c = cos(TURN)
  const n = sin(TURN)
  const u = vec2((vb - vec2(800, 500)) / PITCH)
  const li = u.x * c + u.y * n
  const lj = u.y * c - u.x * n

  // The coral dot of the nearest lattice point; the blue dot of the nearest point of the half-cell lattice.
  const si = floor(li + 0.5)
  const sj = floor(lj + 0.5)
  const bi = floor(li)
  const bj = floor(lj)
  const sd = dots.at(vec2(si + REACH, sj + REACH))
  const bd = dots.at(vec2(bi + REACH, bj + REACH))
  const sunAt = vec2(tenth(800 + (si * c - sj * n) * PITCH), tenth(500 + (si * n + sj * c) * PITCH))
  const hillAt = vec2(tenth(800 + ((bi + 0.5) * c - (bj + 0.5) * n) * PITCH), tenth(500 + ((bi + 0.5) * n + (bj + 0.5) * c) * PITCH))

  const sunPhase = mod(time - sd.g, SUN_SECONDS) / SUN_SECONDS
  const hillPhase = mod(time - bd.a, HILL_SECONDS) / HILL_SECONDS
  const sunR = (sd.r * sunScale(sunPhase)) / 2
  const hillR = (bd.b * hillScale(hillPhase)) / 2
  const sunCover = sd.r > 0 ? clamp((sunR - length(vec2(vb - sunAt))) / pixel + 0.5, 0, 1) : 0
  const hillCover = bd.b > 0 ? clamp((hillR - length(vec2(vb - hillAt))) / pixel + 0.5, 0, 1) : 0

  const v = params.variant
  const paper = vec3(mix(mix(DAWN_TOP, DAWN_FOOT, clamp(vb.y / 1000, 0, 1)), mix(DUSK_TOP, DUSK_FOOT, clamp(vb.y / 1000, 0, 1)), v))
  // Dawn: each ink multiplies the sheet. Dusk: each ink lies over it at its own opacity.
  const dawn = vec3(paper * (1 - sunCover + sunCover * DAWN_CORAL) * (1 - hillCover + hillCover * DAWN_BLUE))
  const dusk = vec3(mix(mix(paper, DUSK_CORAL, sunCover * DUSK_CORAL_OPACITY), DUSK_BLUE, hillCover * DUSK_BLUE_OPACITY))
  return vec4(mix(dawn, dusk, v), 1)
})

export default shader({ fps: 30, passes: [dots, view] })
