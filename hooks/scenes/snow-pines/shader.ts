// Snow Pines' moving parts on the GPU, over the still forest in still.ts: the three layers of falling, swaying snow,
// the snow that settles on the boughs and melts again in four waves, the rose glow drifting along the horizon, and
// the cabin's lamp and lit window breathing.
// Derived from theme-examples' scenes/snow-pines.ts (Apache License 2.0): the same cells, flakes, colours and
// timings, drawn here instead of by CSS. The tables are generated from that file's own code (run as JavaScript), so
// every flake, tree and snowy cell is where the original puts it. The glyphs ('.', '*', '+', "'", '^', '/', '\',
// '[', ']') are drawn as strokes, since a shader has no font.
//
// Coordinates: the scene is a 1600 x 1000 view box laid over the window with "xMidYMid slice", y down. The shader's
// points run y up, so every placement goes through `clipOf` and every pixel back through `vbOf`.
//
// How it lies over the still: the still holds the settled snow at full strength, the lamp and window at their
// faintest, and no falling snow or rose glow. What this adds follows the original's layers (rose; far trees, back
// hill, cabin, faint snow; middle trees, middle snow; near trees, bright snow; hush): a tree cell lets 0.22 of what is
// under it through (its ground is drawn at 0.78), a hill or cabin tile none, and a snowy cell is repainted whole for
// its wave's settling.
import {
  abs, buffer, clamp, dot, floor, length, max, min, mix, mod, picture, range, shader, shapes, sin, size, table, time,
  values, vec2, vec3, vec4,
} from 'claude-code/shader'
import type { Spot } from 'claude-code/shader'

// Snow Pines has one look; the harness still passes a variant.
const params = values({ variant: [0, 1] })

// Each pine, as farForest(), middleForest() and nearForest() place them: (apex column + 20) * 4096 + foot row * 32 +
// height in rows. The first STAND_FAR are far, the next STAND_MIDDLE middle, the rest near.
const STANDS = table([79717, 92038, 104327, 108423, 137061, 165801, 169923, 174024, 182185, 186313, 198568, 214983, 219080, 227300, 247814, 251908, 264166, 268263, 280551, 288805, 296998, 325635, 329764, 337924, 342019, 358404, 362500, 370723, 382979, 620643, 624707, 632901, 641125, 649316, 686147, 698405, 702531, 710692, 714755, 718852, 735268, 747492, 751620, 763878, 767973, 780230, 788420, 792515, 800741, 808931, 95821, 132688, 165451, 579214, 546474, 485037, 87577, 120307, 67055, 439797, 419342])
const STAND_COUNT = 61
const STAND_FAR = 50
const STAND_MIDDLE = 6
// Each snowy (rim or cap) cell, in order of a key: row * 200 + column + 20 + its depth's offset. Each entry is (the key
// less the one before) * 25 + code, with code cap * 12 + wave * 3 + glyph (glyph 0 '^', 1 '/', 2 '\'), or 24 for a
// step with no cell; two entries to a number, the first times 4096.
const FROST = table([90090, 2134342, 1011690, 995457, 389555, 237761, 16687195, 213796, 16687330, 168047, 2261021, 1495127, 12554916, 2396214, 2601012, 12538660, 180550, 499850, 1482834, 12509374, 382057, 221521, 426036, 12804225, 266320, 5570670, 778266, 950327, 1624081, 598231, 1521195, 336318, 931435, 1626164, 290902, 381088, 909388, 8515669, 250021, 8413210, 544746, 1933290, 4948025, 253930, 1716325, 131130, 16691178, 16689680, 228223, 9570907, 214968, 491775, 477132, 16688030, 225787, 8413298, 438498, 434154, 1642654, 9269356, 2390451, 9257111, 636784, 635310, 7920278, 890959, 1040507, 323739, 16691178, 4829339, 1028201, 16688084, 16691178, 7258273, 106566, 16691178, 7503980, 8690401, 661558, 12443626, 2883695, 516157, 7723795, 661466, 662132, 864307, 446442, 11487944, 311457, 8842054, 210803, 829974, 417999, 648951, 11268248, 704717, 7289817, 8110257, 10575980, 8298654, 739806, 2084842, 1745107, 464749, 1224682, 2691227, 11075736, 620325, 1583535, 839799, 1109994, 2617395, 7860554, 10576180, 7299295])
const FROST_OFFSETS = [-10644, -4520, 997]
const FROST_STARTS = [0, 2711, 6017]
const FROST_SLOTS = 230
// The first slot of the near trees' snowy cells.
const FROST_NEAR = 148
// Each flake, in order of its key (layer * 52 + row) * 120 + column + 2: (the key less the one before) * 5 + glyph
// (1 '.', 2 '*', 3 '+', 4 "'"), two to a number as above.
const FLAKES = table([1438488, 663813, 3076918, 4309198, 598177, 250197, 1831415, 1274074, 987377, 1032243, 1978926, 159806, 3568587, 1171685, 946702, 2195462, 2523317, 3551448, 147492, 741392, 1642632, 209297, 496167, 2236437, 332027, 581693, 2072752, 1360158, 1016114, 2830842, 189323, 1847978, 479653, 1417570, 1540137, 2400563, 495627, 1401550, 1355902, 6538042, 516692, 1728938, 1479213, 90568, 147613, 147780, 1008169, 114709, 332288, 229753, 172508, 475622, 929893, 3895322, 463004, 1191972, 720937, 1478813, 2060387, 4468879, 1647498, 1196214, 6435447, 253988, 561268, 1929274, 2474400, 3326285, 139316, 496032, 192618, 192633, 1962315, 45133, 659482, 1654811, 602189, 1376457, 4349989, 418223, 663564, 172598, 1974289, 397324, 37481, 1601718, 233868, 3305864, 2531469, 1912840, 2568200, 376908, 3527340, 4776073, 2093097, 2531894, 3391750, 1094865, 3858724, 1233182, 2388276, 114959, 2384153, 24648, 1007627, 28709, 1220645, 3485713, 1213058, 1053013, 2445589, 1278223, 1404940, 1161794, 2564112, 49485, 1073470, 2301999, 1385009, 1299589, 172054, 25124, 1298485, 1029608, 2297922, 966674, 233779, 950608])
const FLAKE_SLOTS = 256

// Per depth of forest (far, middle, near): its grid [cell width, cell height, baseline in the cell, font size].
const DEPTHS = table([[9, 11, 9, 10], [13, 16, 13, 15], [18, 22, 18, 21]])
// Per layer of snow (faint, middle, bright): the same.
const LAYERS = table([[14, 20, 16, 17], [16, 20, 16, 17], [22, 26, 21, 22]])
// Per layer of snow: its sway period and its two bands' sway delays; its bands' fall periods and delays.
const SWAYS = table([[19, 1, 1], [14.5, 1, 8], [11.5, 1, 8]])
const FALLS = table([[61, 14.03, 61, 14.03], [43, 9.89, 53, 28.62], [31, 7.13, 38, 20.52]])
// Colours, 0 to 255. Per depth, rows 4k to 4k + 3: shadow ground, mid needle glyph, rim ground, cap ground. Then the
// three snow layers' fill with its opacity in hundredths (12 to 14), the snow field (15), the lamp (16) and the lit
// window (17).
const PAL = table([[51, 51, 106, 0], [106, 112, 168, 0], [108, 112, 166, 0], [138, 142, 190, 0], [20, 45, 68, 0], [90, 152, 166, 0], [90, 115, 150, 0], [134, 159, 190, 0], [12, 40, 50, 0], [79, 154, 150, 0], [90, 115, 150, 0], [134, 159, 190, 0], [180, 188, 236, 34], [195, 203, 242, 50], [211, 218, 248, 55], [64, 60, 114, 0], [255, 182, 92, 0], [240, 160, 64, 0]])
// The sky's gradient stops: [offset in hundredths, r, g, b].
const SKY = table([[0, 24, 26, 70], [22, 28, 29, 77], [40, 36, 34, 83], [52, 48, 41, 91], [60, 60, 49, 98], [67, 72, 57, 103], [74, 82, 64, 107]])
// The rose glow's stop opacities in hundredths, every 0.2.
const ROSE = table([32, 27, 20, 12, 5, 0])
// The glyphs '.', '*', '+', "'", '^', '/' and '[' ('\' and ']' are their mirrors): three strokes each [from x, y, to
// x, y] in hundredths of the font size, from the glyph's centre on its baseline, y up.
const GLYPHS = table([[0, 8, 0, 8], [0, 8, 0, 8], [0, 8, 0, 8], [0, 32, 0, 72], [-17, 42, 17, 62], [-17, 62, 17, 42], [-24, 34, 24, 34], [0, 10, 0, 58], [0, 10, 0, 58], [0, 50, 0, 74], [0, 50, 0, 74], [0, 50, 0, 74], [-20, 38, 0, 72], [0, 72, 20, 38], [0, 72, 20, 38], [-20, -8, 20, 77], [-20, -8, 20, 77], [-20, -8, 20, 77], [-9, -15, -9, 80], [-9, 80, 14, 80], [-9, -15, 14, -15]])

const FALL = 1040

const colourOf = (row: number): vec3 => vec3(PAL.at(row).xyz / 255)

// Whole-number division and remainder that a GPU's rounding cannot tip over: v is a whole number.
const quot = (v: number, n: number): number => floor((v + 0.5) / n)
const rem = (v: number, n: number): number => v - n * quot(v, n)

// The view box on the window.
const scaleOf = (): number => max(size.x / 1600, size.y / 1000)
const originOf = (s: number): vec2 => vec2((size.x - 1600 * s) * 0.5, (size.y - 1000 * s) * 0.5)
const vbOf = (pt: vec2, s: number, o: vec2): vec2 => vec2((pt.x - o.x) / s, (size.y - pt.y - o.y) / s)
// A view-box point as the shapes' -1 to 1.
const clipOf = (vb: vec2): vec2 => {
  const s = scaleOf()
  const o = originOf(s)
  return vec2((vec2(o.x + vb.x * s, size.y - (o.y + vb.y * s)) / size) * 2 - 1)
}

const over = (top: vec4, under: vec4): vec4 => vec4(top + under * (1 - top.a))

// CSS ease-in-out, cubic-bezier(0.42, 0, 0.58, 1), on four progresses at once: solve x(s) = p, answer y(s).
const easeInOut = (p: vec4): vec4 => {
  let s = p
  for (let k = 0; k < 6; k++) {
    const x = vec4(((0.52 * s - 0.78) * s + 1.26) * s - p)
    const d = vec4((1.56 * s - 1.56) * s + 1.26)
    s = vec4(clamp(s - x / d, 0, 1))
  }
  return vec4(s * s * (3 - 2 * s))
}
// An `alternate` animation's directed progress, `elapsed` seconds in (a negative delay counts as time already run).
const swing = (elapsed: number, period: number): number => {
  const q = elapsed / period
  const n = floor(q)
  return mod(n, 2) < 0.5 ? q - n : 1 - (q - n)
}
// settle: fill-opacity .1, .4 at 12%, 1 at 56%, 1 at 86%, .1 at 100%, linear, 160 s, each wave 14 s further on.
const settleOf = (wave: number): number => {
  const p = mod(time + 14 * wave, 160) / 160
  return p < 0.12 ? 0.1 + 2.5 * p : p < 0.56 ? 0.4 + (0.6 * (p - 0.12)) / 0.44 : p < 0.86 ? 1 : 1 - (0.9 * (p - 0.86)) / 0.14
}

// This frame's timings, worked out once. Texels 0 to 2, per layer of snow: its left band's sway (translate -28px to
// 14px, ease-in-out, alternate) and fall (translateY 0 to 1040px, linear), then its right band's. Texel 3: the four
// waves of settling snow. Texel 4: the glow (fill-opacity .7 to 1, 7 s) and the dusk's progress (170 s), both
// ease-in-out, alternate.
const clock = buffer({ size: [5, 1], float: 32, filter: 'nearest' }, p => {
  const k = min(p.cell.x, 2)
  const sway = SWAYS.at(k)
  const fall = FALLS.at(k)
  const eased = easeInOut(vec4(swing(time + sway.y, sway.x), swing(time + sway.z, sway.x), swing(time, 7), swing(time, 170)))
  const fallL = (mod(time + fall.y, fall.x) / fall.x) * FALL
  const fallR = (mod(time + fall.w, fall.z) / fall.z) * FALL
  const bands = vec4(-28 + 42 * eased.x, fallL, -28 + 42 * eased.y, fallR)
  const waves = vec4(settleOf(0), settleOf(1), settleOf(2), settleOf(3))
  return p.cell.x < 2.5 ? bands : p.cell.x < 3.5 ? waves : vec4(0.7 + 0.3 * eased.z, eased.w, 0, 0)
})

// halfWidthAt() of the original: a slim taper, with boughs that flare within a tier and tuck back in at the next.
const halfWidthAt = (row: number, tier: number): number =>
  row < 0.5 ? 0 : max(1, floor(row * 0.25 + rem(row - 1, tier) * 0.55 + 0.5))

// The three forests on their own grids, drawn once: texel (column + 20, row), one lane a depth (r far, g middle,
// b near): 0 no tree, 1 a needle cell, 2 + code a snowy cell.
const grid = buffer({ size: [200, 70], float: 16, filter: 'nearest', once: true }, p => {
  const column = p.cell.x - 20
  const row = p.cell.y
  let trees = vec3(0)
  for (const n of range(STAND_COUNT)) {
    const packed = STANDS.at(n)
    const height = rem(packed, 32)
    const foot = rem(quot(packed, 32), 128)
    const apex = quot(packed, 4096) - 20
    const r = row - (foot - height + 1)
    const tier = n < STAND_FAR + STAND_MIDDLE ? 3 : 4
    const half = r >= height - (height > 12 ? 2 : 1) ? 0 : halfWidthAt(r, tier)
    const inTree = r >= 0 && r < height && abs(column - apex) <= half ? 1 : 0
    const depth = n < STAND_FAR ? vec3(1, 0, 0) : n < STAND_FAR + STAND_MIDDLE ? vec3(0, 1, 0) : vec3(0, 0, 1)
    trees = vec3(max(trees, depth * inTree))
  }
  const key = vec3(vec3(row * 200 + p.cell.x) + vec3(FROST_OFFSETS[0]!, FROST_OFFSETS[1]!, FROST_OFFSETS[2]!))
  let at = 0
  let snowy = vec3(-1)
  for (const n of range(FROST_SLOTS / 2)) {
    const pair = FROST.at(n)
    for (const side of range(2)) {
      const half = side < 0.5 ? quot(pair, 4096) : rem(pair, 4096)
      const code = rem(half, 25)
      at = at + (half - code) / 25
      // A cell counts only on its own depth's run of keys, and a step with no cell not at all.
      const depth = code > 23.5 ? -1 : at < FROST_STARTS[1]! ? 0 : at < FROST_STARTS[2]! ? 1 : 2
      snowy = vec3(at === key.x && depth === 0 ? code : snowy.x, at === key.y && depth === 1 ? code : snowy.y, at === key.z && depth === 2 ? code : snowy.z)
    }
  }
  return vec4(snowy.x >= 0 ? snowy.x + 2 : trees.x, snowy.y >= 0 ? snowy.y + 2 : trees.y, snowy.z >= 0 ? snowy.z + 2 : trees.z, 1)
})

// Each flake and each snowy cell as a row, worked out once from the tables: texel (n, 0) is flake n [layer, column,
// row, glyph], texel (n, 1) snowy cell n [depth, column, row, code] (code 24: no cell).
const lists = buffer({ size: [256, 2], float: 16, filter: 'nearest', once: true }, p => {
  let at = 0
  let flake = vec4(0)
  for (const n of range(FLAKE_SLOTS / 2)) {
    const pair = FLAKES.at(n)
    const hi = quot(pair, 4096)
    const lo = rem(pair, 4096)
    at = at + quot(hi, 5)
    const a = quot(at, 120)
    flake = n * 2 === p.cell.x ? vec4(quot(a, 52), rem(at, 120) - 2, rem(a, 52), rem(hi, 5)) : flake
    at = at + quot(lo, 5)
    const b = quot(at, 120)
    flake = n * 2 + 1 === p.cell.x ? vec4(quot(b, 52), rem(at, 120) - 2, rem(b, 52), rem(lo, 5)) : flake
  }
  at = 0
  let snowy = vec4(0, 0, 0, 24)
  for (const n of range(FROST_SLOTS / 2)) {
    const pair = FROST.at(n)
    for (const side of range(2)) {
      const half = side < 0.5 ? quot(pair, 4096) : rem(pair, 4096)
      at = at + quot(half, 25)
      const depth = at < FROST_STARTS[1]! ? 0 : at < FROST_STARTS[2]! ? 1 : 2
      const raw = at - (depth < 0.5 ? FROST_OFFSETS[0]! : depth < 1.5 ? FROST_OFFSETS[1]! : FROST_OFFSETS[2]!)
      snowy = n * 2 + side === p.cell.x ? vec4(depth, rem(raw, 200) - 20, quot(raw, 200), rem(half, 25)) : snowy
    }
  }
  return p.cell.y < 0.5 ? flake : snowy
})

// How much of a pixel a monospace glyph covers: `q` from the glyph's centre on its baseline, y up, in view-box units;
// `em` the font size; `pix` a pixel's size. Codes 1 '.', 2 '*', 3 '+', 4 "'" in the regular weight of the snow; 5 '^',
// 6 '/', 7 '\', 8 '[', 9 ']' in the bold of the trees and cabin.
const glyphCover = (code: number, q: vec2, em: number, pix: number): number => {
  const mirrored = abs(code - 7) < 0.5 || code > 8.5
  const m = vec2(mirrored ? -q.x : q.x, q.y)
  const slot = code < 6.5 ? code - 1 : code < 7.5 ? 5 : 6
  let d = 99
  for (const k of range(3)) {
    const stroke = GLYPHS.at(slot * 3 + k)
    const a = vec2(stroke.xy * (em / 100))
    const ab = vec2(stroke.zw * (em / 100) - a)
    const t = clamp(dot(vec2(m - a), ab) / max(dot(ab, ab), 0.0001), 0, 1)
    d = min(d, length(vec2(m - a - ab * t)))
  }
  const half = code < 1.5 ? 0.075 : code < 4.5 ? 0.04 : 0.06
  return clamp(0.5 - (d - half * em) / pix, 0, 1)
}

// The back hill's crest, as the original draws it: a line through a point every 20 units.
const backCrest = (x: number): number =>
  716 - clamp((abs(x - 816) / 800 - 0.4) / 0.5, 0, 1) * 52 + sin(x * 0.0061 + 0.4) * 9 + (x - 800) * 0.03
const backEdge = (x: number): number => {
  const x0 = floor(x / 20) * 20
  return mix(backCrest(x0), backCrest(x0 + 20), (x - x0) / 20)
}

// Roughly what lies under a tree: the sky's gradient above the back hill, the snow field below it.
const groundAt = (vb: vec2): vec3 => {
  const t = vb.y / 10
  let c = vec3(SKY.at(0).yzw)
  for (const k of range(6)) {
    const a = SKY.at(k)
    const b = SKY.at(k + 1)
    c = t >= a.x ? vec3(mix(a.yzw, b.yzw, clamp((t - a.x) / (b.x - a.x), 0, 1))) : c
  }
  return vb.y < backEdge(vb.x) ? vec3(c / 255) : colourOf(15)
}

// The rose glow at a view-box point, premultiplied: an ellipse drifting from 420 units left to 300 right and back
// over 170 s, brightening as it goes. Its stops run from #a8607a to #8c567a.
const roseAt = (vb: vec2, dusk: number): vec4 => {
  const rho = min(length(vec2((vb.x - 620 - 720 * dusk) / 760, (vb.y - 760) / 240)), 1)
  const i = min(floor(rho * 5), 4)
  const a = (mix(ROSE.at(i), ROSE.at(i + 1), rho * 5 - i) / 100) * (0.5 + 0.5 * dusk)
  return vec4(vec3(168 - 28 * rho, 96 - 10 * rho, 122) * (a / 255), a)
}

// How much of what lies under depth k (1 or 2) shows through it at a view-box point: all of it off the trees, 0.22
// through a needle cell, and 0.22 of what the snow on a snowy cell leaves.
const throughAt = (vb: vec2, k: number, waves: vec4): number => {
  const look = DEPTHS.at(k)
  const lanes = grid.at(vec2(floor(vb.x / look.x) + 20, floor(vb.y / look.y)))
  const n = k < 1.5 ? lanes.g : lanes.b
  const wave = quot(rem(floor(n + 0.5) - 2, 12), 3)
  const f = wave < 0.5 ? waves.x : wave < 1.5 ? waves.y : wave < 2.5 ? waves.z : waves.w
  return n < 0.5 ? 1 : n < 1.5 ? 0.22 : 0.22 * (1 - f)
}

// Each snowy cell at its wave's strength f, worked out a frame at a time at the cell's middle. The original draws the
// needle cell (shadow ground at 0.78 over what is under it, a mid glyph), then the frost tile at f, then the frost
// glyph at f: where the glyph covers g of a pixel that comes to B + g * C1 + g * g * C2. Texel (n, 0) holds B and f,
// (n, 1) C1, (n, 2) C2.
const settling = buffer({ size: [256, 3], float: 16, filter: 'nearest' }, p => {
  const e = lists.at(vec2(p.cell.x, 1))
  const look = DEPTHS.at(e.x)
  const waves = clock.at(vec2(3, 0))
  const wave = quot(rem(e.w, 12), 3)
  const f = wave < 0.5 ? waves.x : wave < 1.5 ? waves.y : wave < 2.5 ? waves.z : waves.w
  const mid = vec2((e.y + 0.5) * look.x, (e.z + 0.5) * look.y)
  const rose = e.x < 0.5 ? roseAt(mid, clock.at(vec2(4, 0)).y) : vec4(0)
  const bare = vec3(colourOf(e.x * 4) * 0.78 + (rose.rgb + groundAt(mid) * (1 - rose.a)) * 0.22)
  const tile = colourOf(e.x * 4 + 2 + quot(e.w, 12))
  const needle = colourOf(e.x * 4 + 1)
  return p.cell.y < 0.5 ? vec4(bare, f) : p.cell.y < 1.5 ? vec4(tile * f + needle - bare * (1 + f), 0) : vec4((bare - needle) * f, 0)
})

// The moving parts drawn as shapes, onto their own layer: first the snowy cells, back to front, then the flakes.
const layer = buffer({ filter: 'nearest' })

// The corners of a quad's two triangles.
const QX = [0, 1, 0, 1, 1, 0]
const QY = [0, 0, 1, 0, 1, 1]
const pick6 = (l: readonly number[], i: number): number =>
  i < 0.5 ? l[0]! : i < 1.5 ? l[1]! : i < 2.5 ? l[2]! : i < 3.5 ? l[3]! : i < 4.5 ? l[4]! : l[5]!

// A snowy cell's quad, slot `i`.
const frostCorner = (v: number, i: number) => {
  const e = lists.at(vec2(i, 1))
  const look = DEPTHS.at(e.x)
  const corner = vec2(pick6(QX, v), pick6(QY, v))
  const vb = vec2((e.y + corner.x) * look.x, (e.z + corner.y) * look.y)
  const q = vec2((corner.x - 0.5) * look.x, look.z - corner.y * look.y)
  return { at: clipOf(vb), a: vec4(vb, q), b: vec4(i, e.x, rem(e.w, 3) + 5, look.w), hide: e.w > 23.5 }
}
// A snowy cell repainted whole over the settled still, before anything nearer hides it: premultiplied, and its
// opacity 1 - f.
const frostPaint = (sp: Spot): vec4 => {
  const i = floor(sp.b.x + 0.5)
  const base = settling.at(vec2(i, 0))
  const g = glyphCover(floor(sp.b.z + 0.5), vec2(sp.a.zw), sp.b.w, sp.px / scaleOf())
  const shown = vec3(base.rgb + settling.at(vec2(i, 1)).rgb * g + settling.at(vec2(i, 2)).rgb * (g * g))
  return vec4(shown * (1 - base.a), 1 - base.a)
}

// The far and middle trees' snowy cells, hidden where the back hill or nearer trees lie over them.
const frostBack = shapes(
  { count: 6, instances: FROST_NEAR, cover: 0.3, draw: 'triangles', into: layer, clear: true },
  frostCorner,
  sp => {
    const vb = vec2(sp.a.xy)
    const waves = clock.at(vec2(3, 0))
    const far = sp.b.y < 0.5
    const hill = far ? clamp((backEdge(vb.x) - vb.y) / (sp.px / scaleOf()) + 0.5, 0, 1) * throughAt(vb, 1, waves) : 1
    return vec4(frostPaint(sp) * hill * throughAt(vb, 2, waves))
  },
)
// The near trees' snowy cells, with nothing over them.
const frostNear = shapes(
  { count: 6, instances: FROST_SLOTS - FROST_NEAR, cover: 0.5, draw: 'triangles', into: layer },
  (v, i) => frostCorner(v, i + FROST_NEAR),
  frostPaint,
)

// Each flake: its layer's band sways it and lets it fall, a screen apart twice over so the fall has no seam. The
// faint layer goes behind the middle and near trees, the middle layer behind the near trees.
const snow = shapes(
  { count: 6, instances: FLAKE_SLOTS, cover: 0.5, draw: 'triangles', into: layer },
  (v, i) => {
    const e = lists.at(vec2(i, 0))
    const look = LAYERS.at(e.x)
    const band = clock.at(vec2(e.x, 0))
    const left = e.y * look.x < 800
    const fallen = mod(e.z * look.y + look.z + (left ? band.y : band.w), FALL)
    const baseline = fallen > FALL - look.y ? fallen - FALL : fallen
    // The quad around the glyph: a small one for a '.', else one for the widest and tallest of '*', '+' and "'".
    const dot = e.w < 1.5
    const q = vec2((pick6(QX, v) - 0.5) * (dot ? 0.3 : 0.64) * look.w, (dot ? pick6(QY, v) * 0.3 - 0.07 : pick6(QY, v) * 0.83 - 0.03) * look.w)
    const vb = vec2((e.y + 0.5) * look.x + (left ? band.x : band.z) + q.x, baseline - q.y)
    return { at: clipOf(vb), a: vec4(q, e.x, e.w), b: vec4(vb, 0, 0), hide: e.w < 0.5 }
  },
  sp => {
    const k = floor(sp.a.z + 0.5)
    const waves = clock.at(vec2(3, 0))
    const tint = PAL.at(12 + k)
    const shade = (k < 0.5 ? throughAt(vec2(sp.b.xy), 1, waves) : 1) * (k < 1.5 ? throughAt(vec2(sp.b.xy), 2, waves) : 1)
    const a = glyphCover(floor(sp.a.w + 0.5), vec2(sp.a.xy), LAYERS.at(k).w, sp.px / scaleOf()) * (tint.w / 100) * shade
    return vec4((tint.rgb / 255) * a, a)
  },
)

const view = picture(p => {
  const s = scaleOf()
  const vb = vbOf(p.point, s, originOf(s))
  const pix = p.px / s
  const waves = clock.at(vec2(3, 0))
  const lights = clock.at(vec2(4, 0))

  // The rose glow, under the far trees (0.22 through a needle cell; a snowy cell is repainted with it) and the back
  // hill, which hides everything under it.
  const far = grid.at(vec2(floor(vb.x / 9) + 20, floor(vb.y / 11))).r
  let acc = vec4(roseAt(vb, lights.y) * (far < 0.5 ? 1 : far < 1.5 ? 0.22 : 0) * clamp((backEdge(vb.x) - vb.y) / pix + 0.5, 0, 1))

  // The cabin: the lamp's glow, the cabin's own tiles over it, then the lit window. The still holds both lights at
  // fill-opacity 0.7; drawing the light again at `lift` takes a pixel to what fill-opacity `glow` gives.
  if (vb.x > 1315 && vb.x < 1415 && vb.y > 780 && vb.y < 852) {
    const glow = lights.x
    const l = 0.16 * max(1 - length(vec2((vb.x - 1365) / 44, (vb.y - 836) / 12)), 0)
    const lift = 1 - (1 - glow * l) / (1 - 0.7 * l)
    acc = over(vec4(colourOf(16) * lift, lift), acc)
    const roof = vb.y >= 800 || (vb.x >= 1352 && vb.x < 1391)
    acc = vec4(acc * (vb.y >= 784 && vb.y < 832 && vb.x >= 1339 && vb.x < 1404 && roof ? 0 : 1))
    const right = vb.x > 1365
    const pane = glyphCover(right ? 9 : 8, vec2(vb.x - (right ? 1371.5 : 1358.5), 829 - vb.y), 15, pix)
    const shine = 1 - (1 - glow * pane) / (1 - 0.7 * pane)
    acc = over(vec4(colourOf(17) * shine, shine), acc)
  }

  // The middle and near trees over both, then the layer of snowy cells and flakes, then the hush: a dark veil in the
  // top right, over everything.
  acc = vec4(acc * throughAt(vb, 1, waves) * throughAt(vb, 2, waves))
  acc = over(layer.sample(p.uv), acc)
  const hush = 0.85 * clamp((1 - length(vec2((vb.x - 1370) / 260, (vb.y - 150) / 170))) / 0.45, 0, 1)
  return vec4(acc * (1 - hush))
})

export default shader({ fps: 30, passes: [clock, grid, lists, settling, layer, frostBack, frostNear, snow, view] })
