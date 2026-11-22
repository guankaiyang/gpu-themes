import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { GpuChoice } from '../types'

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
const PREVIEW_MS = 20_000
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

const themeOfScene = (scene: string): GpuTheme | undefined =>
  scene.startsWith(SCENE_PREFIX) ? THEMES.find(theme => theme.id === scene.slice(SCENE_PREFIX.length)) : undefined

// The loader reads this reference: both names are written as string literals.
const choice = atom({ plugin: 'gpu-themes', key: 'choice' } as const, {}, { shape: 'choice-1' })
let previewEnding: Timer | undefined
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
  const kept = await orNothing(() => $.store.get(key))
  if (typeof kept !== 'object' || kept === null || !('theme' in kept)) return undefined
  const theme = (kept as { theme: unknown }).theme
  if (theme === null) return null
  return typeof theme === 'string' && themeOf(theme) !== undefined ? theme : undefined
}

/** The choice every session follows unless it has its own. */
async function allChoice($: EngineInterface): Promise<string | undefined> {
  const stored = await orNothing(() => $.store.get(CHOICE_KEY))
  return typeof stored === 'string' && themeOf(stored) !== undefined ? stored : undefined
}

/**
 * Stores this session's own choice; past SESSIONS_KEPT, the session that chose longest ago is dropped.
 * A failed write is put back by `apply`, which notes what the store held first.
 */
async function keepForSession($: EngineInterface, key: string | undefined, id: string | undefined): Promise<void> {
  if (key === undefined) return
  // Out first, so the store's order is the order of the last writes.
  await $.store.delete(key)
  await $.store.set(key, { theme: id ?? null })
  await orNothing(async () => {
    const keys = (await $.store.keys()).filter(name => name.startsWith(SESSION_PREFIX))
    for (const oldest of keys.slice(0, Math.max(0, keys.length - SESSIONS_KEPT))) await $.store.delete(oldest)
  })
}

/** Shows a GPU theme, or with none clears the window. Answers whether a surface draws it. */
async function show($: EngineInterface, id: string | undefined): Promise<boolean> {
  const theme = themeOf(id)
  if (theme === undefined) {
    await $.theme.clear()
    return true
  }
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
 * Applies a theme (or none) to this session, and with `forAll` to every later session. The window changes first;
 * only then is the choice kept. A choice for every session drops this session's own, so it follows again.
 */
function apply($: EngineInterface, id: string | undefined, forAll: boolean): Promise<boolean> {
  return inTurn(() => applyNow($, id, forAll))
}

async function applyNow($: EngineInterface, id: string | undefined, forAll: boolean): Promise<boolean> {
  const stood = await read($, choice)
  const own = await sessionKey($)
  // What the store held, to put back if a write fails.
  const heldAll = await $.store.get(CHOICE_KEY)
  const heldOwn = own === undefined ? undefined : await $.store.get(own)

  // A refused set throws here with nothing changed: a preview in progress keeps its timer and ends as usual.
  const drawn = await show($, id)

  try {
    if (forAll) {
      // The all-sessions choice first, so a failure there leaves this session's own choice in place.
      await (id === undefined ? $.store.delete(CHOICE_KEY) : $.store.set(CHOICE_KEY, id))
      if (own !== undefined) await $.store.delete(own)
    } else {
      await keepForSession($, own, id)
    }
    await update($, choice, (was): GpuChoice => ({
      cardInBand: was.cardInBand,
      cardAway: was.cardAway,
      applied: id,
      scope: forAll ? 'all' : 'session',
    }))
  } catch (error) {
    // Put the store and the window back, so what is shown and what is kept agree; a preview that stood keeps its
    // timer and ends as usual. The first fault is the one told.
    await orNothing(() => (heldAll === undefined ? $.store.delete(CHOICE_KEY) : $.store.set(CHOICE_KEY, heldAll)))
    if (own !== undefined) await orNothing(() => (heldOwn === undefined ? $.store.delete(own) : $.store.set(own, heldOwn)))
    await orNothing(() => show($, stood.preview ?? stood.applied))
    throw error
  }

  // Applied: a preview's end has nothing left to do.
  looks += 1
  previewEnding?.cancel()
  previewEnding = undefined
  return drawn
}

/** Ends a look at a theme unless its timer was called off since: back to what the session shows. */
async function endPreview($: EngineInterface, id: string, mine: number): Promise<void> {
  if (looks !== mine) return
  previewEnding = undefined
  const now = await read($, choice)
  if (now.preview !== id) return
  try {
    await show($, now.applied)
  } finally {
    // The look is over even where the window could not go back: the card must not say Previewing for good.
    await update($, choice, was => (was.preview === id ? { ...was, preview: undefined } : was))
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
async function pick($: EngineInterface, theme: GpuTheme | undefined, forAll: boolean): Promise<void> {
  try {
    const drawn = await apply($, theme?.id, forAll)
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
 * window it is made for, with its title, its three buttons and its blurb. The desktop draws a button's `label`
 * and not its children, so both carry the same short word.
 */
function card($: EngineInterface, { Box, Text, Button }: CardElements, now: GpuChoice) {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} gap="md">
      <Box flexDirection="row" gap={1}>
        <Text bold>GPU themes</Text>
        <Button key="off" label="No theme" onPress={() => pick($, undefined, true)}>
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
            const applyWord = isOn && now.scope !== 'session' ? 'Applied' : 'Apply'
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
                    <Button key={`apply-${theme.id}`} label={applyWord} onPress={() => pick($, theme, true)}>
                      {applyWord}
                    </Button>
                    <Button key={`session-${theme.id}`} label={sessionWord} onPress={() => pick($, theme, false)}>
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
    `/${COMMAND} alone opens the picker. /${COMMAND} <name> applies one to every session; add "session" for this session only. /${COMMAND} off clears it.`,
  ].join('\n')
}

async function answer($: EngineInterface, args: string): Promise<string> {
  const words = args.trim().split(/\s+/).filter(word => word !== '')
  const last = words.at(-1)?.toLowerCase()
  // "session" as the last of two or more words: this session only.
  const forAll = !(words.length > 1 && last === 'session')
  const name = (forAll ? words : words.slice(0, -1)).join(' ')
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
    return `${theme.title} is on, ${now.scope === 'session' ? 'for this session only' : 'for every session'}.`
  }

  if (word === 'off') {
    await apply($, undefined, forAll)
    return forAll
      ? 'GPU theme off for every session. Pick any theme again with /custom-theme or /gpu-theme.'
      : 'GPU theme off for this session only.'
  }

  const theme = themeNamed(name)
  if (theme === undefined) return `No GPU theme named "${name}". ${list()}`

  const drawn = await apply($, theme.id, forAll)
  return (
    (forAll
      ? `${theme.title} applied to every session. Other open sessions take it at their next start.`
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: COMMAND,
        description: 'Pick an animated theme that does not lag the chat. Add a name to apply it, "list" to see all, "off" to clear.',
        argumentHint: '[name [session]|list|status|off]',
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
        // This session's own choice wins; else the one every session follows.
        const own = await sessionChoice($)
        const due = own === undefined ? await allChoice($) : own ?? undefined
        const scope: GpuChoice['scope'] = own === undefined ? 'all' : 'session'
        await update($, choice, was => ({ ...was, applied: due, scope }))
        // Nothing due: leave the window alone, so another plugin's theme stays.
        if (due !== undefined) await show($, due)
      })
    } catch (error) {
      await orNothing(async () => {
        await $.ui.log(`the GPU theme could not be shown at the start (${reasonOf(error)})`, { to: 'debug' })
      })
    }

    return result
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    try {
      return { text: await answer($, e.args) }
    } catch (error) {
      return { text: `That did not work: ${reasonOf(error)}` }
    }
  })

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
  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.plugin !== PLUGIN) return next(e)

    const theme = themeOfScene(e.props.scene)
    if (theme === undefined) return next(e)

    const { Shader, Svg } = $.ui.resolve(e)
    const isRebuilt = REBUILT.includes(theme.scene)
    // theme-examples' own scenes take the pointer (its shaders follow it); the rebuilt ones do not.
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
      case 'koi-pond':
        return <Shader module="./scenes/koi-pond/scene.ts">{still}</Shader>
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
