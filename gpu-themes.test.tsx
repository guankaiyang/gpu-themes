import { expect, mock, test } from 'claude-code/testing'

const IDS = [
  'koi-mosaic', 'snow-pines', 'halftone-dawn', 'halftone-dusk', 'plotter-tide', 'plotter-tide-night', 'deep-water', 'night-reef',
  'paper-garden', 'paper-garden-kraft', 'honu-lagoon', 'dither-dunes', 'dither-dunes-night', 'vector-range',
]
// theme-examples' own: shader scenes, and CSS scenes (an Svg alone).
const SHADER_IDS = [
  'duck-pond', 'duck-pond-night', 'falling-sand', 'falling-sand-night', 'field-lines', 'field-lines-night', 'garden-beetles',
  'garden-beetles-night', 'koi-pond', 'koi-pond-night', 'ripple-tank', 'ripple-tank-night', 'sea-sparkle', 'sea-sparkle-night',
  'semicolony', 'semicolony-night', 'star-chart', 'star-chart-night',
]
const CSS_IDS = ['braille-stars', 'teletext-clouds', 'departure-board', 'blueprint', 'aurora', 'ember']
const ALL_IDS = [...IDS, ...SHADER_IDS, ...CSS_IDS]
const GLASS = { blur: 12, opacity: 0.4 }

for (const id of [...IDS, ...SHADER_IDS]) {
  test(`${id}: a still Svg under its Shader`, async $ => {
    const ui = await $.ui.mount({ plugin: 'gpu-themes', surface: 'desktop', component: 'Backdrop', props: { scene: `gpu-${id}`, plugin: 'gpu-themes', glass: GLASS } })
    expect(await ui.find({ type: 'Shader' })).toBeDefined()
    expect(await ui.find({ type: 'Svg' })).toBeDefined()
    await ui.unmount()
  })
}

for (const id of CSS_IDS) {
  test(`${id}: its animated Svg, with no Shader`, async $ => {
    const ui = await $.ui.mount({ plugin: 'gpu-themes', surface: 'desktop', component: 'Backdrop', props: { scene: `gpu-${id}`, plugin: 'gpu-themes', glass: GLASS } })
    expect(await ui.find({ type: 'Shader' })).toBeUndefined()
    expect(await ui.find({ type: 'Svg' })).toBeDefined()
    await ui.unmount()
  })
}

test("theme-examples' own scenes and unknown names are left alone", async $ => {
  for (const [scene, plugin] of [['koi-mosaic', 'theme-examples'], ['gpu-koi-mosaic', 'someone-else'], ['gpu-nothing', 'gpu-themes']]) {
    const ui = await $.ui.mount({ plugin: 'gpu-themes', surface: 'desktop', component: 'Backdrop', props: { scene, plugin, glass: GLASS } })
    expect(await ui.find({ type: 'Shader' })).toBeUndefined()
    await ui.unmount()
  }
})

// --- The picker card (/gpu-theme alone) ---


const RUN = { command: 'gpu-theme', origin: { kind: 'composer' }, presentation: { isFullscreen: false } } as const
const CARD = { plugin: 'gpu-themes', surface: 'desktop', component: 'Placed', props: { id: 'gpu-theme-card', plugin: 'gpu-themes' } } as const

/** Stands for the engine: records every theme set and clear. */
type Fail = { set?: (scene: string) => boolean; store?: boolean; get?: boolean; noSession?: boolean }

function engine(on: Parameters<Parameters<typeof test>[1]>[1], fail: Fail = {}, placed = true) {
  const shown: (string | undefined)[] = []
  // While `wait` is set, store writes hold there: a save still in progress.
  const gate: { wait?: Promise<void>; getHold?: Promise<void>; holdNextGet?: boolean } = {}
  // The store in memory, readable by the test.
  const store = new Map<string, unknown>()
  on('store.get', async (_, e) => {
    if (fail.get) throw new Error('store down')
    const key = (e as { key: string }).key
    const value = store.get(key)
    // Holds one read of 'theme' after it is read: a session start still in progress.
    const hold = gate.getHold
    if (hold && key === 'theme' && gate.holdNextGet) {
      gate.holdNextGet = false
      await hold
    }
    return { value }
  })
  on('store.set', async (_, e) => {
    if (fail.store) throw new Error('store down')
    if (gate.wait) await gate.wait
    const { key, value } = e as { key: string; value: unknown }
    store.set(key, value)
    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    if (fail.store) throw new Error('store down')
    store.delete((e as { key: string }).key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...store.keys()] }))
  const clock = mock.clock(on)
  on('ui.place', () => ({ value: placed ? { isPlaced: true } : { isPlaced: false, reason: 'no placed rows' } }))
  on('theme.set', (_, e) => {
    const scene = (e as { backdrop: { scene: string } }).backdrop.scene
    if (fail.set?.(scene)) throw new Error('refused')
    shown.push(scene)
    return { value: { isDrawn: true, requestId: 'r' } }
  })
  on('theme.clear', () => {
    shown.push(undefined)
    return { value: { isDrawn: false, reason: 'cleared' } }
  })
  on('session.id', () => ({ value: fail.noSession ? '' : 'test-session' }))
  on('env.get', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'gpu-theme' } }))
  on('session.start', (_, e) => ({ cwd: (e as { cwd: string }).cwd }))
  return { shown, clock, store, gate }
}

test('/gpu-theme alone opens the card with Apply, This session and Preview for every theme', async ($, on) => {
  engine(on)
  const said = await $.command.run({ ...RUN, args: '' })
  expect(said.text).toBe('Pick a GPU theme on the card.')
  const ui = await $.ui.mount(CARD)
  for (const id of ALL_IDS) {
    expect(await ui.find({ key: `apply-${id}` })).toBeDefined()
    expect(await ui.find({ key: `session-${id}` })).toBeDefined()
    expect(await ui.find({ key: `preview-${id}` })).toBeDefined()
  }
  expect(await ui.find({ type: 'Text', text: /For light windows/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /For dark windows/ })).toBeDefined()
  await ui.unmount()
})

test('Apply sets the theme for every session, marks it, and closes the card', async ($, on) => {
  const { shown, store } = engine(on)
  await $.command.run({ ...RUN, args: '' })
  const ui = await $.ui.mount(CARD)
  await ui.press({ key: 'apply-honu-lagoon' })
  expect(shown.at(-1)).toBe('gpu-honu-lagoon')
  expect(store.get('theme')).toBe('honu-lagoon')
  // Put away: the placed row draws nothing of ours.
  expect(await ui.find({ key: 'apply-honu-lagoon' })).toBeUndefined()
  await ui.unmount()
  await $.command.run({ ...RUN, args: '' })
  const again = await $.ui.mount(CARD)
  expect((await again.find({ key: 'apply-honu-lagoon' }))?.props.label).toBe('Applied')
  await again.unmount()
})

test('This session keeps the choice for this session only', async ($, on) => {
  const { shown, store } = engine(on)
  store.set('theme', 'koi-mosaic')
  await $.command.run({ ...RUN, args: '' })
  const ui = await $.ui.mount(CARD)
  await ui.press({ key: 'session-vector-range' })
  expect(shown.at(-1)).toBe('gpu-vector-range')
  expect(store.get('theme')).toBe('koi-mosaic')
  expect(store.get('session:test-session')).toEqual({ theme: 'vector-range' })
  await ui.unmount()
  // A new start of this session takes its own choice, not the all-sessions one.
  const before = shown.length
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(shown.length).toBe(before + 1)
  expect(shown.at(-1)).toBe('gpu-vector-range')
  const status = await $.command.run({ ...RUN, args: 'status' })
  expect(status.text).toMatch(/Vector Range .* this session only/)
})

test('Preview shows a theme for 20 seconds, then goes back to the applied one', async ($, on) => {
  const { shown, clock, store } = engine(on)
  await $.command.run({ ...RUN, args: 'deep water' })
  expect(shown.at(-1)).toBe('gpu-deep-water')
  await $.command.run({ ...RUN, args: '' })
  const ui = await $.ui.mount(CARD)
  await ui.press({ key: 'preview-paper-garden' })
  expect(shown.at(-1)).toBe('gpu-paper-garden')
  expect((await ui.find({ key: 'preview-paper-garden' }))?.props.label).toBe('Previewing')
  // A preview stores nothing.
  expect(store.get('theme')).toBe('deep-water')
  await clock.advance(20_000)
  expect(shown.at(-1)).toBe('gpu-deep-water')
  expect((await ui.find({ key: 'preview-paper-garden' }))?.props.label).toBe('Preview')
  await ui.unmount()
})

test('Applying during a preview keeps the applied theme when the 20 seconds end', async ($, on) => {
  const { shown, clock } = engine(on)
  await $.command.run({ ...RUN, args: '' })
  const ui = await $.ui.mount(CARD)
  await ui.press({ key: 'preview-paper-garden' })
  await ui.press({ key: 'apply-snow-pines' })
  const after = shown.length
  await clock.advance(25_000)
  expect(shown.at(-1)).toBe('gpu-snow-pines')
  // Nothing was set after the apply: the preview's end was called off.
  expect(shown.length).toBe(after)
  await ui.unmount()
})

test('No theme and Close', async ($, on) => {
  const { shown, store } = engine(on)
  await $.command.run({ ...RUN, args: 'koi mosaic' })
  await $.command.run({ ...RUN, args: '' })
  let ui = await $.ui.mount(CARD)
  await ui.press({ key: 'close' })
  expect(await ui.find({ key: 'apply-koi-mosaic' })).toBeUndefined()
  expect(shown.at(-1)).toBe('gpu-koi-mosaic')
  await ui.unmount()
  await $.command.run({ ...RUN, args: '' })
  ui = await $.ui.mount(CARD)
  await ui.press({ key: 'off' })
  expect(shown.at(-1)).toBeUndefined()
  expect(store.get('theme')).toBeUndefined()
  expect(await ui.find({ key: 'apply-koi-mosaic' })).toBeUndefined()
  await ui.unmount()
})

test('a name with "session" applies to this session only', async ($, on) => {
  const { store } = engine(on)
  const said = await $.command.run({ ...RUN, args: 'dither dunes night session' })
  expect(said.text).toMatch(/Dither Dunes Night applied to this session only/)
  expect(store.get('theme')).toBeUndefined()
})

test('where placed rows are not drawn, the card shows above the prompt and closes there', async ($, on) => {
  engine(on, {}, false)
  await $.command.run({ ...RUN, args: '' })
  const ui = await $.ui.mount({ plugin: 'gpu-themes', surface: 'desktop', component: 'AbovePrompt', props: {} })
  expect(await ui.find({ key: 'apply-koi-mosaic' })).toBeDefined()
  await ui.press({ key: 'close' })
  expect(await ui.find({ key: 'apply-koi-mosaic' })).toBeUndefined()
  await ui.unmount()
})

test('a refused Apply during a preview: the preview still ends after 20 seconds', async ($, on) => {
  const fail: Fail = {}
  const { shown, clock } = engine(on, fail)
  await $.command.run({ ...RUN, args: 'deep water' })
  await $.command.run({ ...RUN, args: '' })
  const ui = await $.ui.mount(CARD)
  await ui.press({ key: 'preview-paper-garden' })
  fail.set = scene => scene === 'gpu-koi-mosaic'
  await ui.press({ key: 'apply-koi-mosaic' })
  // The card stays up for another pick.
  expect(await ui.find({ key: 'apply-koi-mosaic' })).toBeDefined()
  await clock.advance(25_000)
  expect(shown.at(-1)).toBe('gpu-deep-water')
  expect((await ui.find({ key: 'preview-paper-garden' }))?.props.label).toBe('Preview')
  await ui.unmount()
})

test('a store failure on Apply puts the window and the store back', async ($, on) => {
  const fail: Fail = {}
  const { shown, store } = engine(on, fail)
  await $.command.run({ ...RUN, args: 'deep water' })
  await $.command.run({ ...RUN, args: 'night reef session' })
  fail.store = true
  await $.command.run({ ...RUN, args: '' })
  const ui = await $.ui.mount(CARD)
  await ui.press({ key: 'apply-koi-mosaic' })
  expect(shown.at(-1)).toBe('gpu-night-reef')
  expect(store.get('theme')).toBe('deep-water')
  expect(store.get('session:test-session')).toEqual({ theme: 'night-reef' })
  await ui.press({ key: 'session-honu-lagoon' })
  expect(shown.at(-1)).toBe('gpu-night-reef')
  expect(store.get('session:test-session')).toEqual({ theme: 'night-reef' })
  const status = await $.command.run({ ...RUN, args: 'status' })
  expect(status.text).toMatch(/Night Reef .* this session only/)
  await ui.unmount()
})

test('a reload during a preview drops it and shows what is due', async ($, on) => {
  const { shown, clock } = engine(on)
  await $.command.run({ ...RUN, args: 'deep water' })
  await $.command.run({ ...RUN, args: '' })
  let ui = await $.ui.mount(CARD)
  await ui.press({ key: 'preview-paper-garden' })
  await ui.unmount()
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(shown.at(-1)).toBe('gpu-deep-water')
  await $.command.run({ ...RUN, args: '' })
  ui = await $.ui.mount(CARD)
  expect((await ui.find({ key: 'preview-paper-garden' }))?.props.label).toBe('Preview')
  await clock.advance(25_000)
  expect(shown.at(-1)).toBe('gpu-deep-water')
  await ui.unmount()
})

const tick = () => new Promise(resolve => setTimeout(resolve, 20))

test('a preview ending while an Apply is saving does not undo the Apply', async ($, on) => {
  const { shown, clock, gate, store } = engine(on)
  await $.command.run({ ...RUN, args: '' })
  const ui = await $.ui.mount(CARD)
  await ui.press({ key: 'preview-paper-garden' })
  await clock.advance(19_000)
  let release!: () => void
  gate.wait = new Promise(resolve => { release = resolve })
  const pressing = ui.press({ key: 'apply-snow-pines' })
  await tick()
  await clock.advance(2_000)
  await tick()
  gate.wait = undefined
  release()
  await pressing
  await clock.advance(25_000)
  expect(shown.at(-1)).toBe('gpu-snow-pines')
  expect(store.get('theme')).toBe('snow-pines')
  await ui.unmount()
})

test('a Preview pressed while an Apply is saving runs after it, then ends on the applied theme', async ($, on) => {
  const { shown, clock, gate } = engine(on)
  await $.command.run({ ...RUN, args: '' })
  const ui = await $.ui.mount(CARD)
  await ui.press({ key: 'preview-paper-garden' })
  let release!: () => void
  gate.wait = new Promise(resolve => { release = resolve })
  const applying = ui.press({ key: 'apply-snow-pines' })
  await tick()
  gate.wait = undefined
  const previewing = ui.press({ key: 'preview-paper-garden' })
  await tick()
  release()
  await applying
  await previewing
  expect(shown.at(-1)).toBe('gpu-paper-garden')
  await clock.advance(25_000)
  expect(shown.at(-1)).toBe('gpu-snow-pines')
  await ui.unmount()
})

test('a session start with nothing due leaves the window alone', async ($, on) => {
  const { shown } = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(shown.length).toBe(0)
})

test('an Apply pressed during a session start is not undone by the start', async ($, on) => {
  const { shown, store, gate } = engine(on)
  await $.command.run({ ...RUN, args: 'deep water' })
  await $.command.run({ ...RUN, args: '' })
  const ui = await $.ui.mount(CARD)
  let release!: () => void
  gate.getHold = new Promise(resolve => { release = resolve })
  gate.holdNextGet = true
  const starting = $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await tick()
  gate.getHold = undefined
  const pressing = ui.press({ key: 'apply-snow-pines' })
  await tick()
  release()
  await starting
  await pressing
  expect(store.get('theme')).toBe('snow-pines')
  expect(shown.at(-1)).toBe('gpu-snow-pines')
  const status = await $.command.run({ ...RUN, args: 'status' })
  expect(status.text).toMatch(/Snow Pines/)
  await ui.unmount()
})

test('a preview whose end cannot show the applied theme still ends on the card', async ($, on) => {
  const fail: Fail = {}
  const { clock } = engine(on, fail)
  await $.command.run({ ...RUN, args: 'deep water' })
  await $.command.run({ ...RUN, args: '' })
  const ui = await $.ui.mount(CARD)
  await ui.press({ key: 'preview-paper-garden' })
  fail.set = scene => scene === 'gpu-deep-water'
  await clock.advance(25_000)
  fail.set = undefined
  expect((await ui.find({ key: 'preview-paper-garden' }))?.props.label).toBe('Preview')
  await ui.unmount()
})

test('a theme with a sound is set with it; where the app refuses the sound, without it', async ($, on) => {
  const sets: unknown[] = []
  let refuseSound = false
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('store.delete', () => ({ value: undefined }))
  on('session.id', () => ({ value: 's' }))
  on('env.get', () => ({ value: undefined }))
  on('theme.set', (_, e) => {
    if (refuseSound && (e as { sound?: unknown }).sound !== undefined) throw new Error('does not know the attribute "sound"')
    sets.push(e)
    return { value: { isDrawn: true, requestId: 'r' } }
  })
  await $.command.run({ ...RUN, args: 'koi pond' })
  expect((sets.at(-1) as { sound?: unknown }).sound).toBeDefined()
  refuseSound = true
  const said = await $.command.run({ ...RUN, args: 'falling sand night' })
  expect(said.text).toMatch(/Falling Sand, Night applied/)
  expect((sets.at(-1) as { sound?: unknown }).sound).toBeUndefined()
  await $.command.run({ ...RUN, args: 'aurora' })
  expect((sets.at(-1) as { sound?: unknown }).sound).toBeUndefined()
})

test('a theme with a twin names it on the card', async ($, on) => {
  engine(on)
  await $.command.run({ ...RUN, args: '' })
  const ui = await $.ui.mount(CARD)
  expect((await ui.find({ type: 'Text', text: /For dark windows: Koi Pond, Night/ }))).toBeDefined()
  await ui.unmount()
})

// --- Open sessions follow an Apply made in another one ---

const START = { cwd: '/', surface: 'desktop', isInteractive: true } as const

test('an open session follows what another session applies to every session, and its "off"', async ($, on) => {
  const { shown, store, clock } = engine(on)
  store.set('theme', 'koi-mosaic')
  await $.session.start(START)
  expect(shown.at(-1)).toBe('gpu-koi-mosaic')
  // Another session applies Honu Lagoon to every session: it writes the shared store.
  store.set('theme', 'honu-lagoon')
  await clock.advance(3_000)
  expect(shown.at(-1)).toBe('gpu-honu-lagoon')
  expect((await $.command.run({ ...RUN, args: 'status' })).text).toMatch(/Honu Lagoon .* every session/)
  // Nothing new: nothing is set again.
  const before = shown.length
  await clock.advance(9_000)
  expect(shown.length).toBe(before)
  // Another session turns it off for every session: this one keeps what it shows (a clear could wipe another
  // plugin's theme), until it starts again.
  store.delete('theme')
  await clock.advance(9_000)
  expect(shown.length).toBe(before)
  await $.session.start(START)
  expect(shown.length).toBe(before)
})

test('a theme this version does not know, applied elsewhere, changes nothing here', async ($, on) => {
  const { shown, store, clock } = engine(on)
  store.set('theme', 'koi-mosaic')
  await $.session.start(START)
  const before = shown.length
  store.set('theme', 'a-theme-from-a-later-version')
  await clock.advance(9_000)
  expect(shown.length).toBe(before)
})

test("this session's own Apply for every session is not set again by the follow check", async ($, on) => {
  const { shown, clock } = engine(on)
  await $.session.start(START)
  await $.command.run({ ...RUN, args: 'honu-lagoon' })
  const before = shown.length
  await clock.advance(9_000)
  expect(shown.length).toBe(before)
})

test('a This session choice with no session id to store it under is not undone by the follow check', async ($, on) => {
  const { shown, store, clock } = engine(on, { noSession: true })
  store.set('theme', 'koi-mosaic')
  await $.session.start(START)
  await $.command.run({ ...RUN, args: 'vector-range session' })
  expect(shown.at(-1)).toBe('gpu-vector-range')
  store.set('theme', 'honu-lagoon')
  await clock.advance(9_000)
  expect(shown.at(-1)).toBe('gpu-vector-range')
})

test('a store that cannot be read leaves the window alone during the follow check', async ($, on) => {
  const fail: Fail = {}
  const { shown, store, clock } = engine(on, fail)
  store.set('theme', 'koi-mosaic')
  await $.session.start(START)
  const before = shown.length
  fail.get = true
  await clock.advance(9_000)
  expect(shown.length).toBe(before)
  // Readable again: the next check follows.
  fail.get = false
  store.set('theme', 'honu-lagoon')
  await clock.advance(3_000)
  expect(shown.at(-1)).toBe('gpu-honu-lagoon')
})

test('a session with its own choice does not follow an all-sessions change', async ($, on) => {
  const { shown, store, clock } = engine(on)
  store.set('theme', 'koi-mosaic')
  store.set('session:test-session', { theme: 'vector-range' })
  await $.session.start(START)
  expect(shown.at(-1)).toBe('gpu-vector-range')
  const before = shown.length
  store.set('theme', 'honu-lagoon')
  await clock.advance(9_000)
  expect(shown.length).toBe(before)
})

test('with nothing due and nothing of ours shown, the follow check leaves the window alone', async ($, on) => {
  const { shown, clock } = engine(on)
  await $.session.start(START)
  await clock.advance(30_000)
  expect(shown.length).toBe(0)
})

test('a preview is not cut short by an all-sessions change; the change follows once it ends', async ($, on) => {
  const { shown, store, clock } = engine(on)
  store.set('theme', 'koi-mosaic')
  await $.session.start(START)
  await $.command.run({ ...RUN, args: '' })
  const ui = await $.ui.mount(CARD)
  await ui.press({ key: 'preview-snow-pines' })
  expect(shown.at(-1)).toBe('gpu-snow-pines')
  store.set('theme', 'honu-lagoon')
  await clock.advance(9_000)
  expect(shown.at(-1)).toBe('gpu-snow-pines')
  await clock.advance(15_000)
  // Straight to the new choice when the look ends: the old one is not shown again first.
  expect(shown.slice(-3)).toEqual(['gpu-koi-mosaic', 'gpu-snow-pines', 'gpu-honu-lagoon'])
  expect((await $.command.run({ ...RUN, args: 'status' })).text).toMatch(/Honu Lagoon .* every session/)
  await ui.unmount()
})
