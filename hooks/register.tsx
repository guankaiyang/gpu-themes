import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { GpuActivity, GpuChoice } from '../types'

import { stillSvg as deepWaterStill } from './scenes/deep-water/still'
import { stillSvg as ditherDunesStill } from './scenes/dither-dunes/still'
import { stillSvg as halftoneStill } from './scenes/halftone/still'
import { stillSvg as honuLagoonStill } from './scenes/honu-lagoon/still'
import { koiMosaicStillSvg } from './scenes/koi-mosaic/still'
import { stillSvg as nightReefStill } from './scenes/night-reef/still'
import { stillSvg as paperGardenStill } from './scenes/paper-garden/still'
import { stillSvg as plotterTideStill } from './scenes/plotter-tide/still'
import { stillSvg as snowPinesStill } from './scenes/snow-pines/still'
import { stillSvg as vectorRangeStill } from './scenes/vector-range/still'
import { blueprintSvg } from './scenes/blueprint'
import { brailleStarsSvg } from './scenes/braille-stars'
import { auroraSvg, emberSvg } from './scenes/classic'
import { departureBoardSvg } from './scenes/departure-board'
import { teletextCloudsSvg } from './scenes/teletext-clouds'
import { duckPondSvg } from './scenes/duck-pond/still'
import { fallingSandSvg } from './scenes/falling-sand/still'
import { fieldLinesSvg } from './scenes/field-lines/still'
import { gardenBeetlesSvg } from './scenes/garden-beetles/still'
import { koiPondSvg } from './scenes/koi-pond/still'
import { rippleTankSvg } from './scenes/ripple-tank/still'
import { seaSparkleSvg } from './scenes/sea-sparkle/still'
import { semicolonySvg } from './scenes/semicolony/still'
import { starChartSvg } from './scenes/star-chart/still'
import { FALLING_SAND_SOUND, KOI_POND_SOUND } from './sounds'
import type { Sound } from './sounds'

// All of theme-examples' themes, under this mod's own name. The 14 heavier ones animated one big SVG with CSS, which
// the app redraws on the CPU every frame; here each is a still SVG (drawn once) with its moving parts in a shader on
// the GPU. The other 24 are theme-examples' own scenes, unchanged. theme-examples draws only backdrops it set itself
// and answers those without passing them on, so this mod sets each scene under its own name and draws it here.
const PLUGIN = 'gpu-themes'
const COMMAND = 'gpu-theme'
const CARD = 'gpu-theme-card'
// The theme every session follows unless it has its own; absent, none.
const CHOICE_KEY = 'theme'
// A session's own choice is stored under this prefix and the session's id.
const SESSION_PREFIX = 'session:'
const SESSIONS_KEPT = 200
// A folder's own choice is stored under this prefix and the folder's path.
const FOLDER_PREFIX = 'folder:'
const FOLDERS_KEPT = 200
const PREVIEW_MS = 20_000
// How often an open session checks whether another one applied a theme to this folder or to every session.
const FOLLOW_MS = 3_000
const SCENE_PREFIX = 'gpu-'
const WINDOWS = ['light', 'dark'] as const

// Rebuilt here: a still plus this mod's own shader.
type RebuiltScene =
  | 'koi-mosaic' | 'snow-pines' | 'halftone' | 'plotter-tide' | 'deep-water' | 'night-reef'
  | 'paper-garden' | 'honu-lagoon' | 'dither-dunes' | 'vector-range'
// theme-examples' own, unchanged: light CSS scenes, and stills under its own shaders (which follow the pointer).
type CssScene = 'braille-stars' | 'teletext-clouds' | 'departure-board' | 'blueprint' | 'aurora' | 'ember'
type ShaderScene =
  | 'duck-pond' | 'falling-sand' | 'field-lines' | 'garden-beetles' | 'koi-pond' | 'ripple-tank' | 'sea-sparkle'
  | 'semicolony' | 'star-chart'
type Scene = RebuiltScene | CssScene | ShaderScene
type Glass = { blur: number; tint: string; opacity: number }
type GpuTheme = {
  id: string
  title: string
  blurb: string
  scene: Scene
  variant: 0 | 1
  window: 'light' | 'dark'
  /** The same scene made for the other kind of window. */
  twin?: string
  glass: Glass
  sound?: Sound
}

// The glass and window kind of each, as theme-examples gives them.
// All 38 of theme-examples' themes, in its own order. The 14 it drew with CSS animation on the CPU are rebuilt here as
// a still plus a GPU shader; the other 24 are its own scenes, copied unchanged (they already ran smoothly).
const THEMES: readonly GpuTheme[] = [
  { id: 'honu-lagoon', title: 'Honu Lagoon', blurb: 'A live ASCII lagoon from above: a tile turtle swims by a sand island.', scene: 'honu-lagoon', variant: 0, window: 'light', glass: { blur: 7, tint: '#e6fbff', opacity: 0.42 } },
  { id: 'koi-mosaic', title: 'Koi Mosaic', blurb: 'A tiled koi pond from above: two koi, lily pads, slow ripples.', scene: 'koi-mosaic', variant: 0, window: 'light', glass: { blur: 12, tint: '#eef8f1', opacity: 0.36 } },
  { id: 'halftone-dawn', title: 'Halftone Dawn', blurb: 'A two-ink riso sunrise: halftone dots that breathe outward.', scene: 'halftone', variant: 0, window: 'light', twin: 'halftone-dusk', glass: { blur: 14, tint: '#f6ead9', opacity: 0.55 } },
  { id: 'halftone-dusk', title: 'Halftone Dusk', blurb: 'The riso sunrise on night-blue stock: an ember sun in breathing dots.', scene: 'halftone', variant: 1, window: 'dark', twin: 'halftone-dawn', glass: { blur: 14, tint: '#1f2336', opacity: 0.5 } },
  { id: 'plotter-tide', title: 'Plotter Tide', blurb: 'Pen-plotter tide lines drawing themselves on warm paper.', scene: 'plotter-tide', variant: 0, window: 'light', twin: 'plotter-tide-night', glass: { blur: 0, tint: '#f4efe4', opacity: 0.32 } },
  { id: 'plotter-tide-night', title: 'Plotter Tide, Night', blurb: 'The plotter\'s tide chart in pale ink on blue-black night paper.', scene: 'plotter-tide', variant: 1, window: 'dark', twin: 'plotter-tide', glass: { blur: 0, tint: '#141a27', opacity: 0.32 } },
  { id: 'dither-dunes', title: 'Dither Dunes', blurb: 'One-bit dunes on sand paper, shaded in dots, under a terracotta sun.', scene: 'dither-dunes', variant: 0, window: 'light', twin: 'dither-dunes-night', glass: { blur: 18, tint: '#f1e8d6', opacity: 0.34 } },
  { id: 'dither-dunes-night', title: 'Dither Dunes Night', blurb: 'The same dunes after dark: pale dots on umber, an ember sun.', scene: 'dither-dunes', variant: 1, window: 'dark', twin: 'dither-dunes', glass: { blur: 18, tint: '#1c1712', opacity: 0.4 } },
  { id: 'paper-garden', title: 'Paper Garden', blurb: 'Cut-paper leaves at the edges of a warm white sheet, one coral bloom.', scene: 'paper-garden', variant: 0, window: 'light', twin: 'paper-garden-kraft', glass: { blur: 16, tint: '#fbf6ec', opacity: 0.5 } },
  { id: 'paper-garden-kraft', title: 'Paper Garden, Kraft', blurb: 'Cut-paper leaves at the edges of dark kraft paper, one coral bloom.', scene: 'paper-garden', variant: 1, window: 'dark', twin: 'paper-garden', glass: { blur: 16, tint: '#35312a', opacity: 0.5 } },
  { id: 'night-reef', title: 'Night Reef', blurb: 'The lagoon after dark: a turtle and a ray that glow as they swim.', scene: 'night-reef', variant: 0, window: 'dark', glass: { blur: 14, tint: '#0a1430', opacity: 0.4 } },
  { id: 'snow-pines', title: 'Snow Pines', blurb: 'An ASCII pine forest at dusk, snow drifting down through the trees.', scene: 'snow-pines', variant: 0, window: 'dark', glass: { blur: 16, tint: '#14143a', opacity: 0.5 } },
  { id: 'braille-stars', title: 'Braille Stars', blurb: 'A slow night sky drawn dot by dot on a braille grid.', scene: 'braille-stars', variant: 0, window: 'dark', glass: { blur: 20, tint: '#0a1430', opacity: 0.3 } },
  { id: 'teletext-clouds', title: 'Block Clouds', blurb: 'Night clouds built from blocks on a teletext grid, drifting in', scene: 'teletext-clouds', variant: 0, window: 'dark', glass: { blur: 12, tint: '#0d173f', opacity: 0.34 } },
  { id: 'vector-range', title: 'Vector Range', blurb: 'Phosphor mountains on black; an amber beam keeps retracing them.', scene: 'vector-range', variant: 0, window: 'dark', glass: { blur: 22, tint: '#0e2f27', opacity: 0.42 } },
  { id: 'departure-board', title: 'Departure Board', blurb: 'An amber LED board re-lettering itself, row by row.', scene: 'departure-board', variant: 0, window: 'dark', glass: { blur: 14, tint: '#1a120b', opacity: 0.34 } },
  { id: 'blueprint', title: 'Blueprint', blurb: 'A cyanotype sheet; a comet goes round its plotted orbit in the corner.', scene: 'blueprint', variant: 0, window: 'dark', glass: { blur: 14, tint: '#0c2444', opacity: 0.42 } },
  { id: 'deep-water', title: 'Deep Water', blurb: 'Light falling through deep water, and one quiet turtle.', scene: 'deep-water', variant: 0, window: 'dark', glass: { blur: 14, tint: '#062c3a', opacity: 0.34 } },
  { id: 'aurora', title: 'Aurora', blurb: 'Northern lights swaying over a dark ridge', scene: 'aurora', variant: 0, window: 'dark', glass: { blur: 18, tint: '#14123a', opacity: 0.3 } },
  { id: 'ember', title: 'Ember', blurb: 'A warm glow in the corners and a few embers rising', scene: 'ember', variant: 0, window: 'dark', glass: { blur: 12, tint: '#2a0d12', opacity: 0.3 } },
  { id: 'duck-pond', title: 'Duck Pond', blurb: 'Rubber ducks on a pixel pond, and a press drops bugs for them to eat.', scene: 'duck-pond', variant: 0, window: 'light', twin: 'duck-pond-night', glass: { blur: 16, tint: '#e8ecd9', opacity: 0.6 } },
  { id: 'duck-pond-night', title: 'Duck Pond, Night', blurb: 'Rubber ducks on a pixel pond, and a press drops bugs for them to eat.', scene: 'duck-pond', variant: 0, window: 'dark', twin: 'duck-pond', glass: { blur: 16, tint: '#0f2433', opacity: 0.6 } },
  { id: 'falling-sand', title: 'Falling Sand', blurb: 'Pixel sand pours down stone shelves, and a press pours more.', scene: 'falling-sand', variant: 0, window: 'light', twin: 'falling-sand-night', glass: { blur: 16, tint: '#f5ebd6', opacity: 0.6 }, sound: FALLING_SAND_SOUND },
  { id: 'falling-sand-night', title: 'Falling Sand, Night', blurb: 'Pixel sand pours down stone shelves, and a press pours more.', scene: 'falling-sand', variant: 0, window: 'dark', twin: 'falling-sand', glass: { blur: 16, tint: '#1c1424', opacity: 0.6 }, sound: FALLING_SAND_SOUND },
  { id: 'field-lines', title: 'Field Lines', blurb: 'A magnetic field drawn in short dashes that turn toward your pointer.', scene: 'field-lines', variant: 0, window: 'light', twin: 'field-lines-night', glass: { blur: 16, tint: '#f3f1e7', opacity: 0.6 } },
  { id: 'field-lines-night', title: 'Field Lines, Night', blurb: 'A magnetic field drawn in short dashes that turn toward your pointer.', scene: 'field-lines', variant: 0, window: 'dark', twin: 'field-lines', glass: { blur: 16, tint: '#22282b', opacity: 0.6 } },
  { id: 'garden-beetles', title: 'Garden Beetles', blurb: 'Pixel beetles on a garden path that hide when your pointer comes near.', scene: 'garden-beetles', variant: 0, window: 'light', twin: 'garden-beetles-night', glass: { blur: 16, tint: '#ece5d3', opacity: 0.6 } },
  { id: 'garden-beetles-night', title: 'Garden Beetles, Night', blurb: 'Pixel beetles on a garden path that hide when your pointer comes near.', scene: 'garden-beetles', variant: 0, window: 'dark', twin: 'garden-beetles', glass: { blur: 16, tint: '#27393a', opacity: 0.6 } },
  { id: 'koi-pond', title: 'Koi Pond', blurb: 'A pond from above with ripples at your pointer and koi fed by a press.', scene: 'koi-pond', variant: 0, window: 'light', twin: 'koi-pond-night', glass: { blur: 16, tint: '#d7e4e0', opacity: 0.6 }, sound: KOI_POND_SOUND },
  { id: 'koi-pond-night', title: 'Koi Pond, Night', blurb: 'A pond from above with ripples at your pointer and koi fed by a press.', scene: 'koi-pond', variant: 0, window: 'dark', twin: 'koi-pond', glass: { blur: 16, tint: '#0e1824', opacity: 0.6 }, sound: KOI_POND_SOUND },
  { id: 'ripple-tank', title: 'Ripple Tank', blurb: 'Water striders on a printed pond, where your pointer sends out rings.', scene: 'ripple-tank', variant: 0, window: 'light', twin: 'ripple-tank-night', glass: { blur: 16, tint: '#d6e7e0', opacity: 0.6 } },
  { id: 'ripple-tank-night', title: 'Ripple Tank, Night', blurb: 'Water striders on a printed pond, where your pointer sends out rings.', scene: 'ripple-tank', variant: 0, window: 'dark', twin: 'ripple-tank', glass: { blur: 16, tint: '#112e34', opacity: 0.6 } },
  { id: 'sea-sparkle', title: 'Sea Sparkle', blurb: 'A night sea in three inks, where your pointer stirs plankton to glow.', scene: 'sea-sparkle', variant: 0, window: 'light', twin: 'sea-sparkle-night', glass: { blur: 16, tint: '#ecf0ee', opacity: 0.6 } },
  { id: 'sea-sparkle-night', title: 'Sea Sparkle, Night', blurb: 'A night sea in three inks, where your pointer stirs plankton to glow.', scene: 'sea-sparkle', variant: 0, window: 'dark', twin: 'sea-sparkle', glass: { blur: 16, tint: '#090e1c', opacity: 0.6 } },
  { id: 'semicolony', title: 'Semicolony', blurb: 'Code punctuation living as small creatures, magnified at your pointer.', scene: 'semicolony', variant: 0, window: 'light', twin: 'semicolony-night', glass: { blur: 16, tint: '#f1ece0', opacity: 0.6 } },
  { id: 'semicolony-night', title: 'Semicolony, Night', blurb: 'Code punctuation living as small creatures, magnified at your pointer.', scene: 'semicolony', variant: 0, window: 'dark', twin: 'semicolony', glass: { blur: 16, tint: '#13161c', opacity: 0.6 } },
  { id: 'star-chart', title: 'Star Chart', blurb: 'An engraved sky map that links nearby stars to your pointer.', scene: 'star-chart', variant: 0, window: 'light', twin: 'star-chart-night', glass: { blur: 16, tint: '#ece2ca', opacity: 0.6 } },
  { id: 'star-chart-night', title: 'Star Chart, Night', blurb: 'An engraved sky map that links nearby stars to your pointer.', scene: 'star-chart', variant: 0, window: 'dark', twin: 'star-chart', glass: { blur: 16, tint: '#101b30', opacity: 0.6 } },
]

const keyOf = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const themeNamed = (text: string): GpuTheme | undefined =>
  THEMES.find(theme => theme.id === keyOf(text) || keyOf(theme.title) === keyOf(text))

/** How many one-letter changes (one added, dropped or swapped for another) turn one text into the other. */
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i]
    for (let j = 1; j <= b.length; j += 1) {
      next[j] = Math.min((row[j] ?? 0) + 1, (next[j - 1] ?? 0) + 1, (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    row = next
  }
  return row[b.length] ?? 0
}

/**
 * The themes whose id or title is only a few letters off the name typed, closest first, three at most. A few: a
 * third of the name's letters, at least 1 and at most 4.
 */
function closeTo(text: string): GpuTheme[] {
  const typed = keyOf(text)
  if (typed === '') return []
  const most = Math.min(4, Math.max(1, Math.floor(typed.length / 3)))
  return THEMES.map((theme, order) => ({ theme, order, off: Math.min(distance(typed, theme.id), distance(typed, keyOf(theme.title))) }))
    .filter(near => near.off <= most)
    .sort((a, b) => a.off - b.off || a.order - b.order)
    .slice(0, 3)
    .map(near => near.theme)
}

/** The answer to a name that is no theme's: the close ones to type instead, or where to see them all. Nothing is applied. */
function unknownName(name: string): string {
  const near = closeTo(name)
  const head = `No GPU theme named "${name}".`
  // The words a name may end with are named too: a misspelt one leaves the whole as no theme's.
  if (near.length === 0) return `${head} /${COMMAND} list shows all ${THEMES.length}; a name may end with "folder" or "session".`
  const [only] = near
  if (near.length === 1 && only !== undefined) return `${head} Did you mean ${only.title} (${only.id})?`
  return [`${head} Did you mean:`, ...near.map(theme => `  ${theme.title} (${theme.id})`)].join('\n')
}

const themeOfScene = (scene: string): GpuTheme | undefined =>
  scene.startsWith(SCENE_PREFIX) ? THEMES.find(theme => theme.id === scene.slice(SCENE_PREFIX.length)) : undefined

// The loader reads this reference: both names are written as string literals.
const choice = atom({ plugin: 'gpu-themes', key: 'choice' } as const, {}, { shape: 'choice-1' })
const activity = atom({ plugin: 'gpu-themes', key: 'activity' } as const, {}, { shape: 'activity-1' })
let previewEnding: Timer | undefined
// The check that keeps an open session on the all-sessions choice; started at each session start.
let following: Timer | undefined
// True while a follow check runs.
let checking = false
type Scope = NonNullable<GpuChoice['scope']>
// True once the app has said it takes no theme sounds; a reload learns it again.
let appLacksSound = false
// Counts the preview timers started; a timer's end acts only if it is still the last one (an apply calls it off).
let looks = 0
// Every change this mod makes to the window and its choice runs here, one after another, so a Preview pressed
// while an apply saves, or a preview's end firing then, waits its turn instead of crossing it.
let queue: Promise<unknown> = Promise.resolve()

function inTurn<T>(step: () => Promise<T>): Promise<T> {
  const run = queue.then(step)
  queue = run.catch(() => undefined)
  return run
}

const twinOf = (theme: GpuTheme): GpuTheme | undefined => themeOf(theme.twin)
const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))
const themeOf = (id: string | undefined): GpuTheme | undefined =>
  id === undefined ? undefined : THEMES.find(theme => theme.id === id)

async function orNothing<T>(step: () => Promise<T>): Promise<T | undefined> {
  try {
    return await step()
  } catch {
    return undefined
  }
}

/** The store key of this session's own choice: one per row in the desktop app, else one per Claude Code session. */
async function sessionKey($: EngineInterface): Promise<string | undefined> {
  const id =
    (await orNothing(() => $.env.get('CLAUDE_CODE_HOST_SESSION_ID'))) || (await orNothing(() => $.session.id()))
  return id === undefined || id === '' ? undefined : `${SESSION_PREFIX}${id}`
}

/** This session's own stored choice: a theme's id, null for "none", or undefined where it made none. */
async function sessionChoice($: EngineInterface): Promise<string | null | undefined> {
  const key = await sessionKey($)
  if (key === undefined) return undefined
  return ownOf(await orNothing(() => $.store.get(key)))
}

/** Reads a stored own choice: a theme's id, null for "none", or undefined where it holds none. */
function ownOf(kept: unknown): string | null | undefined {
  if (typeof kept !== 'object' || kept === null || !('theme' in kept)) return undefined
  const theme = (kept as { theme: unknown }).theme
  if (theme === null) return null
  return typeof theme === 'string' && themeOf(theme) !== undefined ? theme : undefined
}

/** The store key of the choice for the folder this session runs in, its project root. */
async function folderKey($: EngineInterface): Promise<string | undefined> {
  const root = await orNothing(() => $.session.root())
  return root === undefined || root === '' ? undefined : `${FOLDER_PREFIX}${root}`
}

/** This folder's stored choice: a theme's id, null for "none", or undefined where it has none. */
async function folderChoice($: EngineInterface): Promise<string | null | undefined> {
  const key = await folderKey($)
  if (key === undefined) return undefined
  return ownOf(await orNothing(() => $.store.get(key)))
}

/** The choice every session follows unless it or its folder has its own. */
async function allChoice($: EngineInterface): Promise<string | undefined> {
  return allOf(await orNothing(() => $.store.get(CHOICE_KEY)))
}

/** Reads the stored all-sessions choice: a theme's id, or undefined for none. */
function allOf(stored: unknown): string | undefined {
  return typeof stored === 'string' && themeOf(stored) !== undefined ? stored : undefined
}

/**
 * Stores a session's or a folder's own choice; past `kept` of that kind, the one chosen longest ago is dropped.
 * A failed write is put back by `apply`, which notes what the store held first.
 */
async function keep($: EngineInterface, key: string | undefined, id: string | undefined, prefix: string, kept: number): Promise<void> {
  if (key === undefined) return
  // Written in place, never taken out first: another session reading meanwhile must not find it gone. The time
  // says which was chosen longest ago.
  await $.store.set(key, { theme: id ?? null, at: await $.clock.now() })
  await orNothing(async () => {
    const keys = (await $.store.keys()).filter(name => name.startsWith(prefix))
    if (keys.length <= kept) return
    const dated: { name: string; at: number }[] = []
    for (const name of keys) {
      const value = await $.store.get(name)
      const at = typeof value === 'object' && value !== null && 'at' in value ? Number((value as { at: unknown }).at) : 0
      dated.push({ name, at: Number.isFinite(at) ? at : 0 })
    }
    dated.sort((a, b) => a.at - b.at)
    for (const oldest of dated.slice(0, dated.length - kept)) await $.store.delete(oldest.name)
  })
}

/** Shows a GPU theme, or with none clears the window. Answers whether a surface draws it. */
async function show($: EngineInterface, id: string | undefined): Promise<boolean> {
  const theme = themeOf(id)
  if (theme === undefined) {
    await $.theme.clear()
    return true
  }
  return setTheme($, theme)
}

async function setTheme($: EngineInterface, theme: GpuTheme): Promise<boolean> {
  const base = { backdrop: { scene: `${SCENE_PREFIX}${theme.id}`, glass: theme.glass }, overrideColorScheme: theme.window }
  if (theme.sound !== undefined && !appLacksSound) {
    // The sound is a try of its own: where the app refuses it, the theme is set without it.
    try {
      return (await $.theme.set({ ...base, sound: theme.sound })).isDrawn
    } catch (error) {
      // An app from before theme sounds says so: no sound is tried again in this load.
      if (reasonOf(error).includes('does not know the attribute "sound"')) appLacksSound = true
      await orNothing(async () => {
        await $.ui.log(`${theme.title} was set without its sound: ${reasonOf(error)}`, { to: 'debug' })
      })
    }
  }
  return (await $.theme.set(base)).isDrawn
}

/**
 * Applies a theme (or none) to this session; with scope `folder` to every session in this folder, and with `all`
 * to every session. The window changes first; only then is the choice kept. A wider choice drops the narrower ones
 * here (this session's own, and for `all` this folder's), so this session follows it again.
 */
function apply($: EngineInterface, id: string | undefined, scope: Scope): Promise<boolean> {
  return inTurn(() => applyNow($, id, scope))
}

async function applyNow($: EngineInterface, id: string | undefined, scope: Scope): Promise<boolean> {
  const stood = await read($, choice)
  const own = await sessionKey($)
  const folder = await folderKey($)
  if (scope === 'folder' && folder === undefined) throw new Error('this session has no folder to keep the choice for')
  // What the store held, to put back if a write fails.
  const held = new Map<string, unknown>()
  const touched = scope === 'all' ? [CHOICE_KEY, folder, own] : scope === 'folder' ? [folder, own] : [own]
  for (const key of touched) if (key !== undefined) held.set(key, await $.store.get(key))

  // A refused set throws here with nothing changed: a preview in progress keeps its timer and ends as usual.
  const drawn = await show($, id)

  try {
    if (scope === 'all') {
      // The all-sessions choice first, so a failure there leaves the narrower ones in place.
      await (id === undefined ? $.store.delete(CHOICE_KEY) : $.store.set(CHOICE_KEY, id))
      if (folder !== undefined) await $.store.delete(folder)
      if (own !== undefined) await $.store.delete(own)
    } else if (scope === 'folder') {
      await keep($, folder, id, FOLDER_PREFIX, FOLDERS_KEPT)
      if (own !== undefined) await $.store.delete(own)
    } else {
      await keep($, own, id, SESSION_PREFIX, SESSIONS_KEPT)
    }
    await update($, choice, (was): GpuChoice => ({
      cardInBand: was.cardInBand,
      cardAway: was.cardAway,
      applied: id,
      scope,
    }))
  } catch (error) {
    // Put the store and the window back, so what is shown and what is kept agree; a preview that stood keeps its
    // timer and ends as usual. The first fault is the one told.
    for (const [key, value] of held) {
      await orNothing(() => (value === undefined ? $.store.delete(key) : $.store.set(key, value)))
    }
    await orNothing(() => show($, stood.preview ?? stood.applied))
    throw error
  }

  // Applied: a preview's end has nothing left to do.
  looks += 1
  previewEnding?.cancel()
  previewEnding = undefined
  return drawn
}

/**
 * What this session should show now, where another session may have changed a choice since this one started: its
 * folder's, else the one for every session. Undefined keeps what it shows: a session with its own choice, and one
 * whose choice was taken off or is a theme this version does not know, since a clear would wipe whatever theme
 * stands, another plugin's included. Rejects where the store cannot be read.
 */
async function dueNow($: EngineInterface, now: GpuChoice): Promise<{ due: string; scope: Scope } | undefined> {
  if (now.scope === 'session') return undefined
  const own = await sessionKey($)
  if (own !== undefined && ownOf(await $.store.get(own)) !== undefined) return undefined
  const folder = await folderKey($)
  if (folder !== undefined) {
    const kept = ownOf(await $.store.get(folder))
    if (kept === null) return undefined
    if (kept !== undefined) return { due: kept, scope: 'folder' }
  }
  const all = allOf(await $.store.get(CHOICE_KEY))
  return all === undefined ? undefined : { due: all, scope: 'all' }
}

/** Keeps an open session on its folder's choice or the one for every session; a preview is left to end first. */
async function followAll($: EngineInterface): Promise<void> {
  // One check at a time: where the store is slow, checks must not pile up ahead of a person's Apply.
  if (checking) return
  checking = true
  try {
    await inTurn(async () => {
      const now = await read($, choice)
      if (now.preview !== undefined) return
      const next = await dueNow($, now)
      if (next === undefined || (next.due === now.applied && next.scope === now.scope)) return
      if (next.due !== now.applied) await show($, next.due)
      await update($, choice, was => ({ ...was, applied: next.due, scope: next.scope }))
    })
  } finally {
    checking = false
  }
}

/** Ends a look at a theme unless its timer was called off since: back to what the session shows. */
async function endPreview($: EngineInterface, id: string, mine: number): Promise<void> {
  if (looks !== mine) return
  previewEnding = undefined
  const now = await read($, choice)
  if (now.preview !== id) return
  // Back to what is due now, so a change another session made during the look shows at once.
  const next = await orNothing(() => dueNow($, now))
  const back = next?.due ?? now.applied
  let shown = false
  try {
    await show($, back)
    shown = true
  } finally {
    // The look is over even where the window could not go back: the card must not say Previewing for good.
    await update($, choice, was =>
      was.preview !== id
        ? was
        : shown && next !== undefined
          ? { ...was, preview: undefined, applied: next.due, scope: next.scope }
          : { ...was, preview: undefined },
    )
  }
}

function preview($: EngineInterface, theme: GpuTheme): Promise<void> {
  return inTurn(() => previewNow($, theme))
}

async function previewNow($: EngineInterface, theme: GpuTheme): Promise<void> {
  const stood = await read($, choice)
  let drawn: boolean
  try {
    drawn = await show($, theme.id)
  } catch (error) {
    void $.ui.toast(`${theme.title} could not be shown: ${reasonOf(error)}`)
    return
  }
  try {
    await update($, choice, was => ({ ...was, preview: theme.id }))
  } catch (error) {
    // No state, no timer: the look would never end. Put back what stood.
    await orNothing(() => show($, stood.preview ?? stood.applied))
    void $.ui.toast(`${theme.title} could not be shown: ${reasonOf(error)}`)
    return
  }
  // This look's seconds start now: an earlier timer is called off, or it would end this look early.
  const mine = ++looks
  previewEnding?.cancel()
  previewEnding = $.clock.after(PREVIEW_MS, () => {
    void inTurn(() => endPreview($, theme.id, mine)).catch(error =>
      $.ui.log(`a preview could not end (${reasonOf(error)})`, { to: 'debug' }),
    )
  })
  if (!drawn) void $.ui.toast('If no theme shows, this window may not draw themes yet.')
}

async function putCardAway($: EngineInterface): Promise<void> {
  await update($, choice, was => ({ ...was, cardInBand: false, cardAway: true }))
}

/** A pick on the card: applied, and the card put away as a menu closes on a choice. A fault keeps the card up. */
async function pick($: EngineInterface, theme: GpuTheme | undefined, scope: Scope): Promise<void> {
  try {
    const drawn = await apply($, theme?.id, scope)
    if (!drawn) void $.ui.toast('If no theme shows, this window may not draw themes yet. Your choice is saved.')
  } catch (error) {
    void $.ui.toast(
      theme === undefined
        ? `The theme could not be cleared: ${reasonOf(error)}`
        : `${theme.title} could not be applied: ${reasonOf(error)}`,
    )
    return
  }
  await putCardAway($)
}

type CardElements = Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Text' | 'Button'>

/**
 * The card, laid out as theme-examples' own: Close and No theme at its head, then each theme under the kind of
 * window it is made for, with its title, its four buttons and its blurb. The desktop draws a button's `label`
 * and not its children, so both carry the same short word.
 */
function card($: EngineInterface, { Box, Text, Button }: CardElements, now: GpuChoice) {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} gap="md">
      <Box flexDirection="row" gap={1}>
        <Text bold>GPU themes</Text>
        <Button key="off" label="No theme" onPress={() => pick($, undefined, 'all')}>
          No theme
        </Button>
        <Button key="close" label="Close" role="dismiss" autoFocus onPress={() => putCardAway($)}>
          Close
        </Button>
      </Box>
      {WINDOWS.map(window => (
        <Box key={`group-${window}`} flexDirection="column" gap="md">
          <Text key={`head-${window}`} size="heading" bold>{`For ${window} windows`}</Text>
          {THEMES.filter(theme => theme.window === window).map(theme => {
            const isOn = now.applied === theme.id
            const applyWord = isOn && (now.scope ?? 'all') === 'all' ? 'Applied' : 'Apply'
            const folderWord = isOn && now.scope === 'folder' ? '✓ This folder' : 'This folder'
            const sessionWord = isOn && now.scope === 'session' ? '✓ This session' : 'This session'
            const previewWord = now.preview === theme.id ? 'Previewing' : 'Preview'

            return (
              <Box key={`theme-${theme.id}`} flexDirection="column" gap="xs">
                <Box flexDirection="row" flexWrap="wrap" justifyContent="space-between" columnGap="md" rowGap="xs">
                  <Text bold={isOn}>
                    {isOn ? '✓ ' : ''}
                    {theme.title}
                  </Text>
                  <Box flexDirection="row" gap={1}>
                    <Button key={`apply-${theme.id}`} label={applyWord} onPress={() => pick($, theme, 'all')}>
                      {applyWord}
                    </Button>
                    <Button key={`folder-${theme.id}`} label={folderWord} onPress={() => pick($, theme, 'folder')}>
                      {folderWord}
                    </Button>
                    <Button key={`session-${theme.id}`} label={sessionWord} onPress={() => pick($, theme, 'session')}>
                      {sessionWord}
                    </Button>
                    <Button key={`preview-${theme.id}`} label={previewWord} onPress={() => preview($, theme)}>
                      {previewWord}
                    </Button>
                  </Box>
                </Box>
                <Text dimColor>{theme.blurb}</Text>
                {twinOf(theme) === undefined ? [] : [
                  <Text key={`twin-${theme.id}`} dimColor>{`For ${twinOf(theme)?.window} windows: ${twinOf(theme)?.title}`}</Text>,
                ]}
              </Box>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}

function list(): string {
  return [
    `Themes (${THEMES.length}; * rebuilt on the GPU):`,
    ...THEMES.map(theme => `  ${REBUILT.includes(theme.scene) ? '*' : ' '} ${theme.id}: ${theme.title} (${theme.window} windows)`),
    `/${COMMAND} alone opens the picker. /${COMMAND} <name> applies one to every session; add "folder" for this folder only, or "session" for this session only. /${COMMAND} off clears it.`,
  ].join('\n')
}

const SCOPE_WORDS: Record<Scope, string> = {
  session: 'for this session only',
  folder: 'for every session in this folder',
  all: 'for every session',
}

async function answer($: EngineInterface, args: string): Promise<string> {
  const words = args.trim().split(/\s+/).filter(word => word !== '')
  const last = words.at(-1)?.toLowerCase()
  // "session" or "folder" as the last of two or more words: this session or this folder only.
  const scope: Scope = words.length > 1 && (last === 'session' || last === 'folder') ? last : 'all'
  const name = (scope === 'all' ? words : words.slice(0, -1)).join(' ')
  const word = keyOf(name)

  if (word === '') {
    // A surface that draws no placed rows gets the card above the prompt.
    const placed = await $.ui.place({ id: CARD })
    await update($, choice, was => ({ ...was, cardInBand: !placed.isPlaced, cardAway: false }))
    return 'Pick a GPU theme on the card.'
  }

  if (word === 'list') return list()

  if (word === 'status') {
    const now = await read($, choice)
    const theme = themeOf(now.applied)
    if (theme === undefined) return 'No GPU theme is on.'
    return `${theme.title} is on, ${SCOPE_WORDS[now.scope ?? 'all']}.`
  }

  if (word === 'off') {
    await apply($, undefined, scope)
    return scope === 'all'
      ? 'GPU theme off for every session. Open sessions keep what they show until they start again. Pick any theme again with /custom-theme or /gpu-theme.'
      : scope === 'folder'
        ? 'GPU theme off for this folder. Other open sessions here keep what they show until they start again.'
        : 'GPU theme off for this session only.'
  }

  const theme = themeNamed(name)
  if (theme === undefined) return unknownName(name)

  const drawn = await apply($, theme.id, scope)
  return (
    (scope === 'all'
      ? `${theme.title} applied to every session, open ones included.`
      : scope === 'folder'
        ? `${theme.title} applied to every session in this folder, open ones included.`
        : `${theme.title} applied to this session only.`) +
    ` Made for ${theme.window} windows.` +
    (drawn ? '' : ' This window may not draw themes yet.')
  )
}

// Each still is built once per load and kept: some are over 100 KB of SVG, and a backdrop is drawn again often.
const stills = new Map<string, string>()

function stillOf(theme: GpuTheme): string {
  const kept = stills.get(theme.id)
  if (kept !== undefined) return kept
  const built = buildStill(theme)
  stills.set(theme.id, built)
  return built
}

function buildStill(theme: GpuTheme): string {
  switch (theme.scene) {
    case 'koi-mosaic':
      return koiMosaicStillSvg()
    case 'snow-pines':
      return snowPinesStill(theme.variant)
    case 'halftone':
      return halftoneStill(theme.variant)
    case 'plotter-tide':
      return plotterTideStill(theme.variant)
    case 'deep-water':
      return deepWaterStill(theme.variant)
    case 'night-reef':
      return nightReefStill(theme.variant)
    case 'paper-garden':
      return paperGardenStill(theme.variant)
    case 'honu-lagoon':
      return honuLagoonStill(theme.variant)
    case 'dither-dunes':
      return ditherDunesStill(theme.variant)
    case 'vector-range':
      return vectorRangeStill(theme.variant)
    case 'braille-stars':
      return brailleStarsSvg()
    case 'teletext-clouds':
      return teletextCloudsSvg()
    case 'departure-board':
      return departureBoardSvg()
    case 'blueprint':
      return blueprintSvg()
    case 'aurora':
      return auroraSvg()
    case 'ember':
      return emberSvg()
    case 'duck-pond':
      return duckPondSvg()
    case 'falling-sand':
      return fallingSandSvg()
    case 'field-lines':
      return fieldLinesSvg()
    case 'garden-beetles':
      return gardenBeetlesSvg()
    case 'koi-pond':
      return koiPondSvg()
    case 'ripple-tank':
      return rippleTankSvg()
    case 'sea-sparkle':
      return seaSparkleSvg()
    case 'semicolony':
      return semicolonySvg()
    case 'star-chart':
      return starChartSvg()
  }
}

const isCss = (scene: Scene): scene is CssScene =>
  scene === 'braille-stars' || scene === 'teletext-clouds' || scene === 'departure-board' || scene === 'blueprint' ||
  scene === 'aurora' || scene === 'ember'
const REBUILT: readonly Scene[] = [
  'koi-mosaic', 'snow-pines', 'halftone', 'plotter-tide', 'deep-water', 'night-reef', 'paper-garden', 'honu-lagoon',
  'dither-dunes', 'vector-range',
]

// --- Koi Pond's view of the session ---
// theme-examples' Koi Pond takes six values a mod may set from what Claude is doing (see the top of its scene.ts):
// midges while a turn runs, more of them at a faster pace, leaves falling while a file is written, the fish sinking
// after a failure, gathering at the prompt box while you are asked something, and a small fish for each helper.
// This mod only watches. It hears a tool's result after the tool has run (classic PostToolUse and PostToolUseFailure),
// never wrapping the call: a hook on a call would turn off its move to the background and its live output. Each hook
// returns at once and keeps its books after, so no call or turn waits on the pond.

const PACE_WINDOW_MS = 20_000
// The pond lets a leaf fall every 2 seconds while `making` is on: 30 seconds gives about fifteen.
const MAKING_MS = 30_000
const WRITERS: ReadonlySet<string> = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const POND_KEYS = ['busy', 'pace', 'waiting', 'making', 'trouble', 'helpers'] as const
// What the pond is told is worked out from these; a reload starts them over, and the session start clears the values.
let mainBusy = false
// The helper agents at work, by their loop's id: only those `$.agent.list()` names, so the engine's own forks
// (compaction, memory) are not counted. `finished` keeps a helper's end from being undone by a late count.
const helpersAtWork = new Set<string>()
const finished = new Set<string>()
let asksOpen = 0
// True from the end of a turn whose answer ends with a question to you, until your next turn starts.
let replyAwaited = false
let recentCalls: number[] = []
let paceCheck: Timer | undefined
let makingEnd: Timer | undefined
let told: Promise<unknown> = Promise.resolve()
// Counts the session's starts: books kept for an earlier one are dropped.
let era = 0

/**
 * Whether an answer ends by asking you something: it ends with a question mark (or the full-width one), past any
 * closing marks.
 */
const endsAsking = (answer: string): boolean => /[?\uff1f]["'\u201d\u2019)\]*_`]*\s*$/.test(answer.trim())
/** The pond waits with you while a question is open, or since an answer asked you something. */
const waitingNow = (): number => (asksOpen > 0 || replyAwaited ? 1 : 0)

const paceOf = (calls: number): number => (calls === 0 ? 0 : calls < 3 ? 1 : calls < 6 ? 2 : 3)
const atWork = (): boolean => mainBusy || helpersAtWork.size > 0

function clearPond(): void {
  era += 1
  mainBusy = false
  helpersAtWork.clear()
  finished.clear()
  asksOpen = 0
  replyAwaited = false
  recentCalls = []
  paceCheck?.cancel()
  makingEnd?.cancel()
}

/**
 * Changes what the pond is told. Changes run one after another, so none is lost to another in flight, and each is
 * written only where a value changed, so the pond is drawn again only then. Nothing waits for it.
 */
function tell($: EngineInterface, change: (was: GpuActivity) => GpuActivity): void {
  told = told.then(() =>
    orNothing(async () => {
      const was = await read($, activity)
      if (POND_KEYS.every(key => (was[key] ?? 0) === (change(was)[key] ?? 0))) return
      await update($, activity, last => change(last))
    }),
  )
}

/** Once nothing is at work, the pond is calm: no pace and no trouble. */
function calmIfIdle($: EngineInterface): void {
  if (atWork()) return
  recentCalls = []
  paceCheck?.cancel()
  tell($, was => ({ ...was, busy: 0, pace: 0, trouble: 0, helpers: 0 }))
}

/**
 * A tool's result: the pace, a file written, a failure or a success. Only yours or a counted helper's, and only while
 * something is at work: a result that lands later (a stopped command, a helper's after it ended) changes nothing.
 */
function noteResult($: EngineInterface, tool: string, failed: boolean, agentId: string | undefined): void {
  if (!atWork()) return
  if (agentId !== undefined && !helpersAtWork.has(agentId)) return
  const mine = era
  void orNothing(async () => {
    const now = await $.clock.now()
    // Checked again: the turn, or the helper, may have ended while the clock was read.
    if (era !== mine || !atWork() || (agentId !== undefined && !helpersAtWork.has(agentId))) return
    recentCalls = [...recentCalls.filter(at => now - at < PACE_WINDOW_MS), now]
    paceCheck?.cancel()
    // When the calls stop, the pace falls back to nothing once the last has aged out.
    paceCheck = $.clock.after(PACE_WINDOW_MS, () => {
      void orNothing(async () => {
        const later = await $.clock.now()
        recentCalls = recentCalls.filter(at => later - at < PACE_WINDOW_MS)
        tell($, was => ({ ...was, pace: paceOf(recentCalls.length) }))
      })
    })
    const wrote = WRITERS.has(tool) && !failed
    if (wrote) {
      makingEnd?.cancel()
      makingEnd = $.clock.after(MAKING_MS, () => tell($, was => ({ ...was, making: 0 })))
    }
    const pace = paceOf(recentCalls.length)
    tell($, was => ({ ...was, pace, trouble: failed ? 1 : 0, ...(wrote ? { making: 1 } : {}) }))
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // A new start, or a reload: nothing is known to be running. Cleared in turn after any change still queued.
    clearPond()
    tell($, (): GpuActivity => ({}))
    await told

    try {
      await $.command.register({
        name: COMMAND,
        description: 'Pick an animated theme that does not lag the chat. Add a name to apply it, "list" to see all, "off" to clear.',
        argumentHint: '[name [folder|session]|list|status|off [folder|session]]',
      })
    } catch (error) {
      void $.ui.toast(`${PLUGIN}: /${COMMAND} is not available (${String(error)})`)
    }

    // A preview left in the state has no timer in this load: drop it. Where nothing is due the window is left
    // alone, as theme-examples does: no call says whether that preview still stands, and a clear would wipe
    // whatever theme does.
    await orNothing(() =>
      inTurn(async () => {
        if ((await read($, choice)).preview !== undefined) await update($, choice, was => ({ ...was, preview: undefined }))
      }),
    )

    // What the plugins beneath set at the start runs first, so the GPU theme due here is the one that stays.
    const result = await next(e)

    try {
      // In turn: a press on a card left open across a reload must not cross it.
      await inTurn(async () => {
        // This session's own choice wins; else its folder's; else the one every session follows.
        const own = await sessionChoice($)
        const folder = own === undefined ? await folderChoice($) : undefined
        let due: string | undefined
        let scope: Scope
        if (own !== undefined) {
          due = own ?? undefined
          scope = 'session'
        } else if (folder !== undefined) {
          due = folder ?? undefined
          scope = 'folder'
        } else {
          due = await allChoice($)
          scope = 'all'
        }
        await update($, choice, was => ({ ...was, applied: due, scope }))
        // Nothing due: leave the window alone, so another plugin's theme stays.
        if (due !== undefined) await show($, due)
      })
    } catch (error) {
      await orNothing(async () => {
        await $.ui.log(`the GPU theme could not be shown at the start (${reasonOf(error)})`, { to: 'debug' })
      })
    }

    // From now on, follow what any other session applies to this folder or to every session.
    following?.cancel()
    following = $.clock.every(FOLLOW_MS, () => {
      void orNothing(() => followAll($))
    })

    return result
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    try {
      return { text: await answer($, e.args) }
    } catch (error) {
      return { text: `That did not work: ${reasonOf(error)}` }
    }
  })

  // Your turn, and each helper agent's: busy while yours runs; a helper counted while its runs. Each returns first.
  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    const id = e.agentId
    if (id === undefined) {
      mainBusy = true
      // Your reply has come: no longer waited for.
      replyAwaited = false
      tell($, was => ({ ...was, busy: 1, waiting: waitingNow() }))
    } else {
      finished.delete(id)
      const mine = era
      void orNothing(async () => {
        const agents = await $.agent.list()
        if (era !== mine || finished.has(id) || !agents.some(agent => agent.id === id)) return
        helpersAtWork.add(id)
        tell($, was => ({ ...was, helpers: helpersAtWork.size }))
      })
    }
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const ended = await next(e)
    const id = e.agentId
    if (id === undefined) {
      mainBusy = false
      // An answer that ends by asking you something: the pond waits with you until you reply.
      replyAwaited = !e.isAborted && endsAsking(e.answer)
      tell($, was => ({ ...was, busy: 0, waiting: waitingNow() }))
    } else {
      finished.add(id)
      helpersAtWork.delete(id)
      tell($, was => ({ ...was, helpers: helpersAtWork.size }))
    }
    calmIfIdle($)
    return ended
  })

  // A tool's result, heard after it ran. An interrupted call (Esc) is no failure; a call you declined never gets here.
  on('classic.PostToolUse', ($, e, next) => {
    noteResult($, e.tool_name, false, e.agent_id)
    return next(e)
  }).catch(($, e, next) => next(e))
  on('classic.PostToolUseFailure', ($, e, next) => {
    if (e.is_interrupt !== true) noteResult($, e.tool_name, true, e.agent_id)
    return next(e)
  }).catch(($, e, next) => next(e))

  // While Claude asks you something, the pond waits with you. This one tool's calls are wrapped; no other's are.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    asksOpen += 1
    tell($, was => ({ ...was, waiting: 1 }))
    try {
      return await next(e)
    } finally {
      asksOpen = Math.max(0, asksOpen - 1)
      tell($, was => ({ ...was, waiting: waitingNow() }))
    }
  }).catch(($, e, next) => next(e)) // Should this hook fail, the call goes on as it came (next is replay-safe).

  on('ui.render', { component: 'Placed' }, async ($, e, next) => {
    if (e.props.plugin !== PLUGIN || e.props.id !== CARD) return next(e)
    const now = await read($, choice)
    // Put away: a placed row whose hook passes draws nothing.
    if (now.cardAway === true) return next(e)
    return card($, $.ui.resolve(e), now)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await read($, choice)
    if (now.cardInBand !== true) return next(e)
    return card($, $.ui.resolve(e), now)
  })

  // Each scene: a still SVG drawn once, the moving parts in a shader on the GPU. The still shows alone where the app
  // plays no shader, under Reduce Motion, or if the shader fails or runs slowly.
  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.plugin !== PLUGIN) return next(e)

    const theme = themeOfScene(e.props.scene)
    if (theme === undefined) return next(e)

    const { Shader, Svg } = $.ui.resolve(e)
    const isRebuilt = REBUILT.includes(theme.scene)
    // theme-examples' own scenes take the pointer (its shaders follow it); the rebuilt ones do not. (A rebuilt still
    // drawn in a frame instead was tried: the app still cut to it, after a white flash while the frame loaded.)
    const still = isRebuilt ? (
      <Svg alt={`${theme.title}, drawn on the GPU`} source={stillOf(theme)} />
    ) : (
      <Svg isInteractive alt={`${theme.title}: ${theme.blurb}`} source={stillOf(theme)} />
    )

    // A CSS scene is the whole picture. An app from before shaders hands no Shader: the still is the whole scene there.
    if (isCss(theme.scene) || Shader === undefined) return still

    // The app finds each shader file by reading its path, written out, in an element named Shader: one per scene.
    const variant = theme.variant
    switch (theme.scene) {
      case 'koi-mosaic':
        return <Shader module="./scenes/koi-mosaic/shader.ts">{still}</Shader>
      case 'snow-pines':
        return <Shader module="./scenes/snow-pines/shader.ts" values={{ variant }}>{still}</Shader>
      case 'halftone':
        return <Shader module="./scenes/halftone/shader.ts" values={{ variant }}>{still}</Shader>
      case 'plotter-tide':
        return <Shader module="./scenes/plotter-tide/shader.ts" values={{ variant }}>{still}</Shader>
      case 'deep-water':
        return <Shader module="./scenes/deep-water/shader.ts" values={{ variant }}>{still}</Shader>
      case 'night-reef':
        return <Shader module="./scenes/night-reef/shader.ts" values={{ variant }}>{still}</Shader>
      case 'paper-garden':
        return <Shader module="./scenes/paper-garden/shader.ts" values={{ variant }}>{still}</Shader>
      case 'honu-lagoon':
        return <Shader module="./scenes/honu-lagoon/shader.ts" values={{ variant }}>{still}</Shader>
      case 'dither-dunes':
        return <Shader module="./scenes/dither-dunes/shader.ts" values={{ variant }}>{still}</Shader>
      case 'vector-range':
        return <Shader module="./scenes/vector-range/shader.ts" values={{ variant }}>{still}</Shader>
      case 'duck-pond':
        return <Shader module="./scenes/duck-pond/scene.ts">{still}</Shader>
      case 'falling-sand':
        return <Shader module="./scenes/falling-sand/scene.ts">{still}</Shader>
      case 'field-lines':
        return <Shader module="./scenes/field-lines/scene.ts">{still}</Shader>
      case 'garden-beetles':
        return <Shader module="./scenes/garden-beetles/scene.ts">{still}</Shader>
      case 'koi-pond': {
        // Read here alone, so only Koi Pond is drawn again as the session changes.
        const now: GpuActivity = (await orNothing(() => read($, activity))) ?? {}
        const pond = {
          busy: now.busy ?? 0,
          pace: now.pace ?? 0,
          waiting: now.waiting ?? 0,
          making: now.making ?? 0,
          trouble: now.trouble ?? 0,
          helpers: Math.min(4, now.helpers ?? 0),
        }
        return (
          <Shader module="./scenes/koi-pond/scene.ts" values={pond}>
            {still}
          </Shader>
        )
      }
      case 'ripple-tank':
        return <Shader module="./scenes/ripple-tank/scene.ts">{still}</Shader>
      case 'sea-sparkle':
        return <Shader module="./scenes/sea-sparkle/scene.ts">{still}</Shader>
      case 'semicolony':
        return <Shader module="./scenes/semicolony/scene.ts">{still}</Shader>
      case 'star-chart':
        return <Shader module="./scenes/star-chart/scene.ts">{still}</Shader>
      default:
        return still
    }
  })
}
