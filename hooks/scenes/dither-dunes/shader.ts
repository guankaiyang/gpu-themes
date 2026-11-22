// Dither Dunes' moving parts on the GPU, over the still desert in still.ts: each dune's outline wandering sideways a
// dither pixel at a time over a still dither screen, every threshold layer of the dunes' dots creeping a tile at a time
// there and back, the sun climbing up and a little left, one pixel at a time, and the grains blown along two crests.
// Derived from theme-examples' scenes/dither-dunes.ts (Apache License 2.0): the same crests, tones, Bayer matrix,
// colours, delays and stepped timings (steps(n), alternate), drawn here instead of by CSS. Its crestAt(), crestRow(),
// fieldTone(), leePath(), glintPath(), grainsPart() and the layers' delays are worked out again here, once, from the
// same numbers (checked against that file's own output, cell by cell, at many times).
//
// The whole scene lies on the 5-unit dither grid, so it is worked out once per dither pixel into `land` (320 x 200),
// and the picture only looks each window pixel's dither pixel up. The sky is left to the still, save round the sun.
//
// Coordinates: the scene is a 1600 x 1000 view box laid over the window with "xMidYMid slice", y down. The shader's
// points run y up, so every pixel goes back to the view box through `vbOf`. Buffer cells here run y down, as rows do.
//
// Variant 0 is Dither Dunes (sand paper), variant 1 Dither Dunes Night (umber paper).
import { abs, buffer, clamp, cos, floor, fract, max, min, mix, mod, PI, picture, pow, range, shader, sign, sin, size, smoothstep, table, time, values, vec2, vec3, vec4 } from 'claude-code/shader'

const params = values({ variant: [0, 1] })

const CELL = 5
// The crest lines, back to front: [x, y, 1 for a peak], as DUNES lists them. Dune i's points start at FIRSTS[i].
const POINTS = table([
  [0, 566, 0], [250, 532, 1], [560, 592, 0], [900, 604, 0], [1200, 574, 0], [1430, 524, 1], [1600, 552, 0],
  [0, 676, 0], [330, 640, 1], [700, 724, 0], [1000, 734, 0], [1290, 644, 1], [1600, 706, 0],
  [0, 806, 0], [200, 764, 1], [520, 864, 0], [820, 904, 0], [1100, 844, 0], [1390, 724, 1], [1600, 794, 0],
  [0, 934, 0], [300, 904, 0], [640, 962, 0], [900, 972, 0], [1250, 930, 1], [1600, 902, 0],
])
const FIRSTS = vec4(0, 7, 13, 20)
const COUNTS = vec4(7, 6, 7, 6)
// Each dune's drift: [dither pixels (signed, = driftUnits / 5, one step each), driftSeconds, delay (index * 31 % driftSeconds)].
const DRIFTS = table([[8, 200, 0], [-12, 150, 31], [16, 120, 62], [-20, 100, 93]])
// The light's creep period per dune (seconds); the soft ink's stacks take 1.3 times as long.
const SECONDS = vec4(104, 88, 96, 80)
// Columns of the outline buffer start 20 dither pixels left of the window, for the widest drift.
const SPARE = 20

const rgb = (r: number, g: number, b: number): vec3 => vec3(r / 255, g / 255, b / 255)
const ink = (day: vec3, night: vec3): vec3 => vec3(mix(day, night, params.variant))
const paperInk = (): vec3 => ink(rgb(236, 226, 205), rgb(35, 29, 23))
const hazeInk = (): vec3 => ink(rgb(227, 216, 194), rgb(42, 35, 28))
const leeInk = (): vec3 => ink(rgb(211, 197, 168), rgb(64, 54, 42))
const softInk = (): vec3 => ink(rgb(191, 173, 139), rgb(107, 92, 71))
const strongInk = (): vec3 => ink(rgb(111, 93, 73), rgb(152, 132, 98))
const SUN = rgb(200, 87, 58)
const sandInk = (i: number): vec3 =>
  i < 0.5
    ? ink(rgb(232, 221, 199), rgb(39, 33, 26))
    : i < 1.5
      ? ink(rgb(228, 216, 192), rgb(43, 36, 28))
      : i < 2.5
        ? ink(rgb(224, 211, 186), rgb(47, 39, 31))
        : ink(rgb(220, 207, 180), rgb(51, 43, 33))

const pick4 = (v: vec4, i: number): number => (i < 0.5 ? v.x : i < 1.5 ? v.y : i < 2.5 ? v.z : v.w)
const twoTo = (k: number): number => (k < 0.5 ? 1 : k < 1.5 ? 2 : k < 2.5 ? 4 : k < 3.5 ? 8 : k < 4.5 ? 16 : 32)
// bayerMatrix(8) at a dither pixel: each bit of x and y, lowest first, adds 16, 4, 1 times (2 * (x ^ y) + y).
const bitOf = (v: number, k: number): number => mod(floor(v / k), 2)
const quarterOf = (x: number, y: number, k: number): number => 2 * abs(bitOf(x, k) - bitOf(y, k)) + bitOf(y, k)
const levelAt = (x: number, y: number): number => 16 * quarterOf(x, y, 1) + 4 * quarterOf(x, y, 2) + quarterOf(x, y, 4)
const thresholdOf = (x: number, y: number): number => (levelAt(x, y) + 0.5) / 64
// Math.round, for the positive numbers here.
const roundOf = (v: number): number => floor(v + 0.5)

// crestAt(): between plain points it eases like a cosine; into a peak it runs as t^1.7, out of one as 1 - (1 - t)^1.7.
const crestAt = (i: number, x: number): number => {
  const first = pick4(FIRSTS, i)
  const count = pick4(COUNTS, i)
  let y = POINTS.at(first + count - 1).y
  let found = x <= POINTS.at(first).x
  y = found ? POINTS.at(first).y : y
  for (const k of range(1, 7)) {
    const from = POINTS.at(first + k - 1)
    const to = POINTS.at(first + k)
    const here = !found && k < count - 0.5 && x <= to.x
    const t = (x - from.x) / (to.x - from.x)
    const intoPeak = to.z > 0.5 && from.z < 0.5
    const outOfPeak = from.z > 0.5 && to.z < 0.5
    const eased = intoPeak ? pow(max(t, 0), 1.7) : outOfPeak ? 1 - pow(max(1 - t, 0), 1.7) : (1 - cos(PI * t)) / 2
    y = here ? from.y + (to.y - from.y) * eased : y
    found = found || here
  }
  return y
}

// An alternate animation's directed progress, 0 to 1 and back, with a negative delay already that far in.
const swing = (seconds: number, delay: number): number => {
  const e = (time + delay) / seconds
  const lap = floor(e)
  const f = e - lap
  return mod(lap, 2) < 0.5 ? f : 1 - f
}

// The view box on the window.
const scaleOf = (): number => max(size.x / 1600, size.y / 1000)
const originOf = (s: number): vec2 => vec2((size.x - 1600 * s) * 0.5, (size.y - 1000 * s) * 0.5)
const vbOf = (pt: vec2, s: number, o: vec2): vec2 => vec2((pt.x - o.x) / s, (size.y - pt.y - o.y) / s)

// 0 under the conversation, 1 at the window's edges, as edgeWeight() has it.
const edgeWeight = (x: number): number => max(1 - smoothstep(0.06, 0.24, x / 1600), smoothstep(0.76, 0.93, x / 1600))

// Each dune's outline, worked out once per dither column (x = (j - 20) * 5), as texels: x the column, y the dune.
// r: the crest's dither row (crestRow()) + 256 * the lee's two rows (leePath()) + 1024 * the glint's six (glintPath());
// g: crestAt() at the column's centre, unrounded, for the shading's depth.
const crests = buffer({ size: [360, 4], float: 32, filter: 'nearest', once: true }, p => {
  const j = p.cell.x
  const i = p.cell.y
  const column = j - SPARE
  const x = column * CELL
  const line = crestAt(i, x + CELL / 2)
  const top = roundOf(line / CELL)
  // The lee: where the crest crosses the conversation, a half then a quarter, from x 240 to 1360.
  const middle = 1 - edgeWeight(x)
  const inLee = x > 239.5 && x < 1359.5
  const lee0 = inLee && 0.5 * middle > thresholdOf(column, top) ? 1 : 0
  const lee1 = inLee && 0.25 * middle > thresholdOf(column, top + 1) ? 2 : 0
  // The glint: the third dune only, from x 1230 to 1600, nearly solid for two rows, thinning over four.
  const ends = min(smoothstep(1230, 1350, x), 1 - smoothstep(1540, 1660, x))
  const inGlint = i > 1.5 && i < 2.5 && x > 1229.5 && x < 1599.5
  let glint = 0
  for (const deep of range(6)) {
    const tone = deep < 1.5 ? 0.9 : 0.55 * pow(1 - (deep - 2) / 4, 1.5)
    glint = glint + (inGlint && tone * ends > thresholdOf(column, top + deep) ? twoTo(deep) : 0)
  }
  return vec4(top + 256 * (lee0 + lee1) + 1024 * glint, line, 0, 1)
})

// The blown grains, worked out once, as grainsPart() places them: [start column, row, period, delay].
const grains = buffer({ size: [22, 1], float: 32, filter: 'nearest', once: true }, p => {
  const g = p.cell.x
  const right = mod(g, 3) > 0.5
  const startX = right ? 1260 + mod(g * 29, 120) : 40 + mod(g * 31, 120)
  const row = roundOf(crestAt(right ? 2 : 1, startX + 110 + CELL / 2) / CELL) - (2 + mod(g * 37, 5))
  return vec4(floor(startX / CELL), row, 34 + mod(g * 13, 25), roundOf(g * 61) / 10)
})

// One dune's dots at a dither pixel where they lie at rest: 1 for the soft ink, 2 for the strong, as fieldTone() and
// levelPath() decide them (the tone at the pixel's centre against the pixel's threshold).
const duneBits = (cx: number, cy: number, i: number, tone0: number, reach: number, threshold: number): number => {
  const x = cx * CELL + 2.5
  const y = cy * CELL + 2.5
  const rel = y - crests.at(vec2(cx + SPARE, i)).g
  const depth = max(0, rel)
  const swell = 0.86 + 0.14 * sin(x / 120 + i * 2.3)
  const tone = tone0 * swell * pow(max(0, 1 - depth / reach), 1.4)
  const soft = min(0.34, tone * edgeWeight(x))
  const strong = min(0.28, 1.4 * max(0, tone * smoothstep(0.82, 0.97, x / 1600) - 0.1))
  const live = rel > -120 ? 1 : 0
  return live * ((soft > threshold ? 1 : 0) + (strong > threshold ? 2 : 0))
}

// The still dither screens, per dither pixel: each dune's dots in its own lane, and the sky's haze as 4 in the first.
const dots = buffer({ size: [320, 200], filter: 'nearest', once: true }, p => {
  const cx = p.cell.x
  const cy = p.cell.y
  const threshold = thresholdOf(cx, cy)
  const x = cx * CELL + 2.5
  const y = cy * CELL + 2.5
  const sides = max(1 - smoothstep(0.08, 0.27, x / 1600), smoothstep(0.73, 0.92, x / 1600))
  const haze = 0.2 * smoothstep(0, 620, y + 50 * sin(x / 210)) * sides > threshold ? 4 : 0
  const bits = vec4(
    duneBits(cx, cy, 0, 0.34, 150, threshold) + haze,
    duneBits(cx, cy, 1, 0.42, 190, threshold),
    duneBits(cx, cy, 2, 0.48, 220, threshold),
    duneBits(cx, cy, 3, 0.5, 160, threshold),
  )
  return vec4(bits / 255)
})

// The sun's tone at a point: a solid disc inside two rings, a half and a quarter (34, 1.45 and 1.9 radii, squared).
const sunTone = (x: number, y: number): number => {
  const d2 = (x - 1376) * (x - 1376) + (y - 446) * (y - 446)
  return d2 <= 1156 ? 1 : d2 <= 2430.49 ? 0.5 : d2 <= 4173.16 ? 0.25 : 0
}

// One creeping stack's step for this level of the front dune: 0, 1 or 2 tiles (steps(3), alternate).
// Its period is the dune's seconds (times 1.3 for the soft ink), its delay (phase + level * 2.9) % period to a tenth,
// where the phase is the dune's index times 19, 23 or 29.
const creepStep = (stack: number, dune: number, level: number): number => {
  const seconds = pick4(SECONDS, dune) * (stack < 1.5 ? 1.3 : 1)
  const phase = dune * (stack < 0.5 ? 19 : stack < 1.5 ? 23 : 29)
  const delay = roundOf(mod(phase + level * 2.9, seconds) * 10) / 10
  return floor(3 * swing(seconds, delay))
}

// The scene, one texel per dither pixel, premultiplied: the front dune with its dots, lee and glint; or the sky round
// the sun and where a dune of the still has drifted off; then the grains. Elsewhere in the sky it is clear, and the
// still's own sky shows.
const land = buffer({ size: [320, 200], filter: 'nearest' }, p => {
  const cx = p.cell.x
  const cy = p.cell.y

  // Which dune is in front here: each outline slides by whole dither pixels, steps(|driftUnits| / 5), alternate.
  let front = -1
  let packed = 0
  // Whether the still has a dune here, where it lies at rest: if the dunes have drifted off it, the sky is repainted.
  let rest = false
  for (const i of range(4)) {
    const d = DRIFTS.at(i)
    const shift = sign(d.x) * floor(abs(d.x) * swing(d.y, d.z))
    const v = crests.at(vec2(cx - shift + SPARE, i)).r
    const inside = cy >= mod(v, 256)
    front = inside ? i : front
    packed = inside ? v : packed
    rest = rest || cy >= mod(crests.at(vec2(cx + SPARE, i)).r, 256)
  }
  const dune = max(front, 0)

  // Its dots stay on the screen and creep: left soft stack (-1, +1) tiles a step, right soft and strong (+1, +1).
  const level = levelAt(cx, cy)
  const kl = creepStep(0, dune, level)
  const kr = creepStep(1, dune, level)
  const ks = creepStep(2, dune, level)
  const left = vec2(cx + 8 * kl, cy - 8 * kl)
  const right = vec2(cx - 8 * kr, cy - 8 * kr)
  const hard = vec2(cx - 8 * ks, cy - 8 * ks)
  const bitsL = floor(pick4(dots.at(left), dune) * 255 + 0.5)
  const bitsR = floor(pick4(dots.at(right), dune) * 255 + 0.5)
  const bitsS = floor(pick4(dots.at(hard), dune) * 255 + 0.5)
  const softL = left.x < 159.5 && left.y > -0.5 && mod(bitsL, 2) > 0.5
  const softR = right.x > 159.5 && right.y > -0.5 && mod(bitsR, 2) > 0.5
  const strongOn = hard.x > 159.5 && hard.y > -0.5 && mod(floor(bitsS / 2), 2) > 0.5

  // Its lee and glint ride with the outline.
  const top = mod(packed, 256)
  const lee = mod(floor(packed / 256), 4)
  const glint = floor(packed / 1024)
  const deep = cy - top
  const leeOn = deep < 0.5 ? mod(lee, 2) > 0.5 : deep < 1.5 ? lee > 1.5 : false
  const glintOn = deep < 5.5 ? mod(floor(glint / twoTo(deep)), 2) > 0.5 : false

  let ground = sandInk(dune)
  ground = softL || softR ? softInk() : ground
  ground = strongOn ? strongInk() : ground
  ground = leeOn ? leeInk() : ground
  ground = glintOn ? SUN : ground

  // The sky round the sun: it climbs 38 pixels and veers 19 left over 200 s, steps(38) and steps(19), alternate.
  const q = swing(200, 0)
  const sx = cx + floor(19 * q)
  const sy = cy + floor(38 * q)
  const tone = sunTone(sx * CELL + 2.5, sy * CELL + 2.5)
  const sunOn = tone > thresholdOf(sx, sy)
  const repaint = rest || tone > 0 || sunTone(cx * CELL + 2.5, cy * CELL + 2.5) > 0
  const hazeOn = floor(dots.at(vec2(cx, cy)).r * 255 + 0.5) > 3.5
  const sky = sunOn ? SUN : hazeOn ? hazeInk() : paperInk()

  let acc = front > -0.5 ? vec4(ground, 1) : repaint ? vec4(sky, 1) : vec4(0)

  // The grains: one soft pixel each, 44 steps downwind a period; in over the first 8%, out over the last 20%.
  if (cy > 125.5 && cy < 151.5) {
    for (const n of range(22)) {
      const g = grains.at(vec2(n, 0))
      const f = fract((time + g.w) / g.z)
      const hit = abs(cx - g.x - floor(44 * f)) < 0.5 && abs(cy - g.y) < 0.5
      const fade = f < 0.08 ? floor((44 * f) / 0.08) / 44 : f < 0.8 ? 1 : 1 - floor((44 * (f - 0.8)) / 0.2) / 44
      const o = hit ? fade : 0
      acc = vec4(softInk() * o + acc.rgb * (1 - o), o + acc.a * (1 - o))
    }
  }
  return acc
})

// Each window pixel shows its dither pixel.
const view = picture(p => {
  const s = scaleOf()
  const vb = vbOf(p.point, s, originOf(s))
  const cell = vec2(clamp(floor(vec2(vb / CELL)), vec2(0, 0), vec2(319, 199)))
  return land.at(cell)
})

export default shader({ fps: 30, passes: [crests, grains, dots, land, view] })
