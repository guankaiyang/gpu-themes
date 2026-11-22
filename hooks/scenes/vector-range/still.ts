// The still part of Vector Range: the night sky, stars, the crescent, the ground grid, the far range, the horizon and
// both massifs, each at the pose the original shows with motion switched off. shader.ts draws the moving scene over it.
// Derived from theme-examples' scenes/vector-range.ts (Apache License 2.0). Changed: every animation is removed (the
// massifs' sway, the far range's drift, the creeping cross lines, the beam traces and the breathing stars). What is left
// is the original's reduced-motion picture: the groups stand at no offset, the cross lines at their own places, the
// breathing stars at .55, and only the one beam the original keeps at rest (the near massif's right side, mid-ridge).
// The parked beams, which draw nothing at rest, are left out. Pure string building, no imports, cached per variant.

const WIDTH = 1600
const HEIGHT = 1000
const HORIZON = 745
/** The grid's vanishing point sits under the right-hand cards, not under the prompt box. */
const VANISH_X = 1230
const SKY_TOP = '#030a08'
const SKY_LOW = '#071a15'
const GROUND_FAR = '#051210'
const GROUND_NEAR = '#030a08'
const HOT = '#9ff0dc'
const WARM = '#3fb89a'
const COLD = '#237a68'
const AMBER = '#ffb454'
const MOON_X = 1268
const MOON_Y = 306
const MOON_RADIUS = 30

/** A repeatable number in 0..1 from two integers, so every build draws the same range. */
function hashUnit(index: number, salt: number): number {
  let value = (Math.imul(index, 374761393) + Math.imul(salt, 668265263)) | 0
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  value ^= value >>> 16
  return (value >>> 0) / 4294967296
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/** A smooth bump: 1 at the centre, 0 at halfWidth away and beyond. */
function lobe(x: number, centre: number, halfWidth: number): number {
  const distance = Math.abs(x - centre) / halfWidth
  if (distance >= 1) return 0
  const inner = 1 - distance * distance
  return inner * inner
}

/** A line drawn three times, widest and faintest first. That is the whole glow; no filter. */
function glowLine(d: string, colour: string, width: number, opacity: number): string {
  return (
    `<path d="${d}" stroke="${colour}" stroke-width="${round(width * 8)}" stroke-opacity="${Math.round(opacity * 7) / 100}"/>` +
    `<path d="${d}" stroke="${colour}" stroke-width="${round(width * 3.2)}" stroke-opacity="${Math.round(opacity * 20) / 100}"/>` +
    `<path d="${d}" stroke="${colour}" stroke-width="${width}" stroke-opacity="${opacity}"/>`
  )
}

/** The beam's trace: a short amber head with a halo, and three longer, fainter green tails behind it, all ending at the head. */
type TracePart = { name: string; length: number; width: number; opacity: number; colour: string }

/** The longest tail. */
const LONGEST_TAIL = 0.42

const TRACE_PARTS: TracePart[] = [
  { name: 'tailLong', length: LONGEST_TAIL, width: 1.8, opacity: 0.4, colour: HOT },
  { name: 'tailMiddle', length: 0.24, width: 2, opacity: 0.6, colour: HOT },
  { name: 'tailShort', length: 0.12, width: 2.2, opacity: 0.85, colour: '#d6f2b0' },
  { name: 'halo', length: 0.07, width: 10, opacity: 0.2, colour: AMBER },
  { name: 'head', length: 0.07, width: 2.6, opacity: 1, colour: AMBER },
]
/** Where the head sits along the ridge when motion is switched off. */
const TRACE_REST_AT = 0.62

function trace(d: string, shownAtRest: boolean): string {
  // With motion switched off only one beam is left on the picture, caught mid-ridge; the others draw nothing and are left out.
  if (!shownAtRest) return ''
  return TRACE_PARTS.map(
    part =>
      `<path d="${d}" pathLength="1" stroke="${part.colour}" stroke-linecap="round" stroke-width="${part.width}" stroke-opacity="${part.opacity}" ` +
      `stroke-dasharray="${part.length} 3" stroke-dashoffset="${Math.round((part.length - TRACE_REST_AT) * 1000) / 1000}"/>`,
  ).join('')
}

type MassifLayer = {
  salt: number
  step: number
  maximumHeight: number
  leftCentre: number
  leftHalfWidth: number
  leftScale: number
  rightCentre: number
  rightHalfWidth: number
  fallLineAbove: number
  fallLineOpacity: number
  colour: string
  width: number
  opacity: number
  dots: boolean
  restBeamSide: number
}

type RidgeVertex = { x: number; height: number; summit: boolean }

/** A massif: tall at one or both edge thirds, sinking to nothing toward the middle so the reading column stays calm. */
function massif(layer: MassifLayer): string {
  const vertices: RidgeVertex[] = []
  let index = 0
  for (let x = -260; x <= WIDTH + 260; x += layer.step) {
    const jitteredX = x + (hashUnit(index, layer.salt) - 0.5) * layer.step * 0.5
    const envelope =
      lobe(jitteredX, layer.leftCentre, layer.leftHalfWidth) * layer.leftScale +
      lobe(jitteredX, layer.rightCentre, layer.rightHalfWidth)
    const saddle = index % 2 === 1 ? 0.6 : 1
    const roughness = 0.55 + 0.45 * hashUnit(index, layer.salt + 7)
    const height = envelope * layer.maximumHeight * saddle * roughness
    vertices.push({ x: round(jitteredX), height: round(height < 6 ? 0 : height), summit: index % 2 === 0 })
    index += 1
  }
  const top = vertices.map(vertex => `${vertex.x} ${round(HORIZON - vertex.height)}`)
  // The cover is painted with the sky itself, so a nearer ridge hides the lines of the ridges behind it.
  const cover = `M${top.join('L')}L${WIDTH + 400} ${HORIZON}L-400 ${HORIZON}Z`
  // The ridge line is drawn only where there is a ridge; flat stretches are left to the horizon.
  let ridge = ''
  let penDown = false
  vertices.forEach((vertex, position) => {
    const next = vertices[position + 1]
    const flat = vertex.height === 0 && (!next || next.height === 0)
    if (flat && !penDown) return
    ridge += `${penDown ? 'L' : 'M'}${top[position] ?? ''}`
    penDown = !flat
  })
  // The beam only retraces what can be seen: the same ridge, cut a little outside the frame.
  let traced = ''
  penDown = false
  vertices.forEach((vertex, position) => {
    const next = vertices[position + 1]
    const flat = vertex.height === 0 && (!next || next.height === 0)
    const outside = vertex.x < -90 || vertex.x > WIDTH + 90
    if (outside || (flat && !penDown)) {
      penDown = false
      return
    }
    traced += `${penDown ? 'L' : 'M'}${top[position] ?? ''}`
    penDown = !flat
  })

  // One fall line per summit: down to a shoulder, then on to the foot. Nothing crosses anything.
  let fallLines = ''
  let dots = ''
  let litFaces = ''
  vertices.forEach((vertex, position) => {
    if (!vertex.summit || vertex.height < layer.fallLineAbove) return
    // A spur leans well off the vertical, or it looks like a tent pole.
    const side = hashUnit(position, layer.salt + 13) < 0.5 ? -1 : 1
    const lean = side * (0.55 + 0.4 * hashUnit(position, layer.salt + 19)) * layer.step
    const shoulderX = round(vertex.x + lean * 0.5)
    const shoulderY = round(HORIZON - vertex.height * (0.38 + 0.2 * hashUnit(position, layer.salt + 17)))
    const footX = round(vertex.x + lean * 1.25)
    const summitPoint = top[position] ?? ''
    fallLines += `M${summitPoint}L${shoulderX} ${shoulderY}L${footX} ${HORIZON}`
    dots += `M${summitPoint}h0`
    // The face between the spur and the next saddle toward the moon catches a little light, so a peak has form.
    const saddle = vertices[position + 1]
    if (saddle) {
      const faceFoot = Math.min(footX, saddle.x)
      litFaces += `M${summitPoint}L${top[position + 1] ?? ''}L${faceFoot} ${HORIZON}L${Math.min(shoulderX, saddle.x)} ${shoulderY}Z`
    }
  })

  return (
    `<g>` +
    `<path class="cover" d="${cover}"/>` +
    `<path class="lit" d="${litFaces}"/>` +
    `<path d="${fallLines}" stroke="${COLD}" stroke-width="1" stroke-opacity="${layer.fallLineOpacity}"/>` +
    glowLine(ridge, layer.colour, layer.width, layer.opacity) +
    // A vector beam dwells at the corners, so the summits are a little brighter than the lines between them.
    (layer.dots ? `<path d="${dots}" stroke="${HOT}" stroke-width="2.6" stroke-linecap="round" stroke-opacity="0.6"/>` : '') +
    // Dashes restart on every subpath, so each side of the massif gets its own beam, and they take turns.
    traced
      .split('M')
      .filter(part => part.length > 0)
      .map((part, side) => trace(`M${part}`, side === layer.restBeamSide))
      .join('') +
    `</g>`
  )
}

/**
 * The far range: low rolling hills along the whole horizon. It repeats exactly every FAR_TILE units,
 * so it can drift one way for ever. It is the only thing that crosses the reading column, so it is low and faint there.
 */
const FAR_STEP = 78
const FAR_COUNT = 21
const FAR_TILE = FAR_STEP * FAR_COUNT

function farRange(): string {
  let ridge = ''
  for (let index = 0; index * FAR_STEP <= WIDTH + FAR_TILE + 200; index += 1) {
    const wrapped = index % FAR_COUNT
    const x = round(-100 + index * FAR_STEP + (hashUnit(wrapped, 3) - 0.5) * FAR_STEP * 0.4)
    const height = round((wrapped % 2 === 1 ? 8 : 20) + hashUnit(wrapped, 5) * 20)
    ridge += `${index === 0 ? 'M' : 'L'}${x} ${HORIZON - height}`
  }
  const cover = `${ridge}L${WIDTH + FAR_TILE + 300} ${HORIZON}L-100 ${HORIZON}Z`
  return (
    `<g>` +
    `<path class="cover" d="${cover}"/>` +
    // One flat faint stroke: a paint that fades across the column would have to stand still while the ridge drifts under it.
    `<path d="${ridge}" stroke="${COLD}" stroke-width="1.1" stroke-opacity="0.4"/>` +
    `</g>`
  )
}

/** Depth of the nearest cross line, and the count of cross lines beyond it. */
const NEAR_DEPTH = 1.5
const CROSS_LINES = 11

function crossLineY(depth: number): number {
  return round(HORIZON + ((HEIGHT - HORIZON) * NEAR_DEPTH) / depth)
}

function groundGrid(): string {
  let rays = ''
  // The feet straddle the vanishing point so that no ray is a plain vertical, and the shallowest rays are left out: they only stack up.
  for (let foot = -2200; foot <= 3400; foot += 400) {
    rays += `M${VANISH_X} ${HORIZON}L${round(VANISH_X + foot * 1.2)} ${round(HORIZON + (HEIGHT - HORIZON) * 1.2)}`
  }
  let crossLines = ''
  for (let line = 0; line <= CROSS_LINES; line += 1) {
    const y = crossLineY(NEAR_DEPTH + line)
    crossLines += `<path transform="translate(0 ${y})" d="M-100 0H1700"/>`
  }
  return (
    `<g stroke="url(#floorStroke)" stroke-width="1.2">` +
    `<path d="${rays}" stroke-opacity="0.85"/>` +
    crossLines +
    `</g>` +
    `<rect x="0" y="${HORIZON}" width="${WIDTH}" height="170" fill="url(#haze)"/>`
  )
}

/** The moon: a proper crescent of two arcs at one weight, small, in the beam's amber. */
function crescent(centreX: number, centreY: number, radius: number): string {
  const topX = round(centreX - radius * 0.5)
  const topY = round(centreY - radius * 0.866)
  const bottomX = round(centreX + radius * 0.866)
  const bottomY = round(centreY + radius * 0.5)
  const inner = round(radius * 1.55)
  const outline = `M${topX} ${topY}A${radius} ${radius} 0 0 1 ${bottomX} ${bottomY}A${inner} ${inner} 0 0 0 ${topX} ${topY}Z`
  return glowLine(outline, AMBER, 1.25, 0.5)
}

/** Stars in the left and right thirds only, three tiers; about one in four breathes, each on its own period. */
function stars(): string {
  let small = ''
  let large = ''
  let middling = ''
  let breathing = ''
  for (let index = 0; index < 64; index += 1) {
    const onLeft = index % 2 === 0
    const x = round(onLeft ? 20 + hashUnit(index, 101) * 400 : 1205 + hashUnit(index, 101) * 375)
    const y = round(16 + hashUnit(index, 103) * 470)
    // No star may shine through the moon.
    if (Math.hypot(x - MOON_X, y - MOON_Y) < MOON_RADIUS + 60) continue
    if (index % 4 === 1) {
      breathing += `<path d="M${x} ${y}h0"/>`
    } else if (index % 3 === 0) {
      large += `M${x} ${y}h0`
    } else if (index % 3 === 2) {
      middling += `M${x} ${y}h0`
    } else {
      small += `M${x} ${y}h0`
    }
  }
  return (
    `<g stroke="${WARM}" stroke-linecap="round">` +
    `<path d="${small}" stroke-width="1.9" stroke-opacity="0.45"/><path d="${middling}" stroke-width="2.4" stroke-opacity="0.6"/><path d="${large}" stroke-width="3" stroke-opacity="0.75"/>` +
    `<g stroke-width="3.2" stroke-opacity="0.55">${breathing}</g></g>`
  )
}

/**
 * A stroke paint that is full at the edges and `low` across the reading column, with long soft shoulders.
 * It does a mask's job without a mask: a mask over anything that moves makes the browser repaint an offscreen layer every frame.
 */
function fadeStroke(name: string, colour: string, low: number): string {
  const half = round((1 + low) / 2)
  return (
    `<linearGradient id="${name}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${WIDTH}" y2="0">` +
    `<stop offset="0" stop-color="${colour}"/><stop offset="0.12" stop-color="${colour}"/><stop offset="0.24" stop-color="${colour}" stop-opacity="${half}"/>` +
    `<stop offset="0.36" stop-color="${colour}" stop-opacity="${low}"/><stop offset="0.64" stop-color="${colour}" stop-opacity="${low}"/>` +
    `<stop offset="0.76" stop-color="${colour}" stop-opacity="${half}"/><stop offset="0.88" stop-color="${colour}"/><stop offset="1" stop-color="${colour}"/></linearGradient>`
  )
}

function buildStill(): string {
  const style = `
path{fill:none;stroke-linejoin:round}
.cover{fill:url(#sky);stroke:none}
.lit{fill:#9fe8cf;fill-opacity:.055;stroke:none}
`

  const defs = `
<linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${HORIZON}"><stop offset="0" stop-color="${SKY_TOP}"/><stop offset="1" stop-color="${SKY_LOW}"/></linearGradient>
<linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${GROUND_FAR}"/><stop offset="1" stop-color="${GROUND_NEAR}"/></linearGradient>
<linearGradient id="afterglow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16473a" stop-opacity="0"/><stop offset="0.35" stop-color="#16473a" stop-opacity="0.06"/><stop offset="0.65" stop-color="#16473a" stop-opacity="0.2"/><stop offset="0.85" stop-color="#16473a" stop-opacity="0.36"/><stop offset="1" stop-color="#16473a" stop-opacity="0.5"/></linearGradient>
<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${GROUND_FAR}"/><stop offset="0.25" stop-color="${GROUND_FAR}" stop-opacity="0.95"/><stop offset="0.6" stop-color="${GROUND_FAR}" stop-opacity="0.5"/><stop offset="1" stop-color="${GROUND_FAR}" stop-opacity="0"/></linearGradient>
<radialGradient id="tube" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#1f5547" stop-opacity="0.34"/><stop offset="0.4" stop-color="#1f5547" stop-opacity="0.28"/><stop offset="0.75" stop-color="#1f5547" stop-opacity="0.16"/><stop offset="1" stop-color="#1f5547" stop-opacity="0"/></radialGradient>
${fadeStroke('floorStroke', '#2f9a82', 0.13)}${fadeStroke('horizonStroke', WARM, 0.12)}`

  const middleMassif = massif({
    salt: 11, step: 62, maximumHeight: 345,
    leftCentre: 350, leftHalfWidth: 200, leftScale: 0.4, rightCentre: 1420, rightHalfWidth: 330,
    fallLineAbove: 60, fallLineOpacity: 0.7, colour: WARM, width: 1.2, opacity: 0.36, dots: false,
    restBeamSide: -1,
  })
  const nearMassif = massif({
    salt: 29, step: 50, maximumHeight: 200,
    leftCentre: 60, leftHalfWidth: 340, leftScale: 0.6, rightCentre: 1590, rightHalfWidth: 310,
    fallLineAbove: 40, fallLineOpacity: 0.6, colour: HOT, width: 1.3, opacity: 0.5, dots: true,
    restBeamSide: 1,
  })

  const horizonLine = glowLine(`M-100 ${HORIZON}H1700`, 'url(#horizonStroke)', 1, 0.28)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" font-family="monospace" color="#888"><style>${style}</style><defs>${defs}</defs>
<rect width="${WIDTH}" height="${HORIZON}" fill="url(#sky)"/>
<rect y="${HORIZON}" width="${WIDTH}" height="${HEIGHT - HORIZON}" fill="url(#ground)"/>
${stars()}
${crescent(MOON_X, MOON_Y, MOON_RADIUS)}
<rect y="${HORIZON - 270}" width="${WIDTH}" height="270" fill="url(#afterglow)"/>
${groundGrid()}
${farRange()}
${horizonLine}
${middleMassif}
${nearMassif}
<ellipse cx="800" cy="480" rx="1180" ry="760" fill="url(#tube)"/>
</svg>`
}


const cache: string[] = []

/** The still scene. Vector Range has one look, so variant 1 is variant 0. */
export function stillSvg(variant: 0 | 1): string {
  const key = variant === 1 ? 1 : 0
  const cached = cache[key]
  if (cached !== undefined) return cached
  const svg = buildStill()
  cache[key] = svg
  return svg
}
