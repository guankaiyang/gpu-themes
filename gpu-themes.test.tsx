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
type Fail = { set?: (scene: string) => boolean; store?: boolean; get?: boolean; noSession?: boolean; noFolder?: boolean; del?: boolean }

function engine(on: Parameters<Parameters<typeof test>[1]>[1], fail: Fail = {}, placed = true) {
  const shown: (string | undefined)[] = []
  // While `wait` is set, store writes hold there: a save still in progress.
  const gate: { wait?: Promise<void>; getHold?: Promise<void>; holdNextGet?: boolean } = {}
  // The store in memory, readable by the test.
  const store = new Map<string, unknown>()
  // Every key written, in order.
  const writes: string[] = []
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
    writes.push(key)
    store.set(key, value)
    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    if (fail.store || fail.del) throw new Error('store down')
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
  on('session.root', () => ({ value: fail.noFolder ? '' : '/proj' }))
  on('env.get', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'gpu-theme' } }))
  on('session.start', (_, e) => ({ cwd: (e as { cwd: string }).cwd }))
  return { shown, clock, store, gate, writes }
}

test('/gpu-theme alone opens the card with Apply, This folder, This session and Preview for every theme', async ($, on) => {
  engine(on)
  const said = await $.command.run({ ...RUN, args: '' })
  expect(said.text).toBe('Pick a GPU theme on the card.')
  const ui = await $.ui.mount(CARD)
  for (const id of ALL_IDS) {
    expect(await ui.find({ key: `apply-${id}` })).toBeDefined()
    expect(await ui.find({ key: `folder-${id}` })).toBeDefined()
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
  expect(store.get('session:test-session')).toMatchObject({ theme: 'vector-range' })
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
  expect(store.get('session:test-session')).toMatchObject({ theme: 'night-reef' })
  await ui.press({ key: 'session-honu-lagoon' })
  expect(shown.at(-1)).toBe('gpu-night-reef')
  expect(store.get('session:test-session')).toMatchObject({ theme: 'night-reef' })
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

// --- This folder ---

const FOLDER = 'folder:/proj'
const backdrop = (id: string) =>
  ({ plugin: 'gpu-themes', surface: 'desktop', component: 'Backdrop', props: { scene: `gpu-${id}`, plugin: 'gpu-themes', glass: GLASS } }) as const

test('This folder keeps the choice for every session in this folder', async ($, on) => {
  const { shown, store } = engine(on)
  store.set('theme', 'koi-mosaic')
  store.set('session:test-session', { theme: 'ember' })
  await $.command.run({ ...RUN, args: '' })
  const ui = await $.ui.mount(CARD)
  await ui.press({ key: 'folder-honu-lagoon' })
  expect(shown.at(-1)).toBe('gpu-honu-lagoon')
  expect(store.get(FOLDER)).toMatchObject({ theme: 'honu-lagoon' })
  expect(store.get('theme')).toBe('koi-mosaic')
  // This session follows its folder again.
  expect(store.has('session:test-session')).toBe(false)
  await ui.unmount()
  await $.command.run({ ...RUN, args: '' })
  const again = await $.ui.mount(CARD)
  expect((await again.find({ key: 'folder-honu-lagoon' }))?.props.label).toBe('✓ This folder')
  expect((await again.find({ key: 'apply-honu-lagoon' }))?.props.label).toBe('Apply')
  await again.unmount()
  expect((await $.command.run({ ...RUN, args: 'status' })).text).toMatch(/Honu Lagoon .* every session in this folder/)
})

test("at a start a session's own choice wins, then its folder's, then the one for every session", async ($, on) => {
  const { shown, store } = engine(on)
  store.set('theme', 'koi-mosaic')
  store.set(FOLDER, { theme: 'honu-lagoon' })
  await $.session.start(START)
  expect(shown.at(-1)).toBe('gpu-honu-lagoon')
  store.set('session:test-session', { theme: 'ember' })
  await $.session.start(START)
  expect(shown.at(-1)).toBe('gpu-ember')
  store.delete('session:test-session')
  store.delete(FOLDER)
  await $.session.start(START)
  expect(shown.at(-1)).toBe('gpu-koi-mosaic')
})

test("Apply for every session drops this folder's choice; other folders keep theirs", async ($, on) => {
  const { store } = engine(on)
  store.set(FOLDER, { theme: 'honu-lagoon' })
  store.set('folder:/elsewhere', { theme: 'ember' })
  await $.command.run({ ...RUN, args: 'vector-range' })
  expect(store.get('theme')).toBe('vector-range')
  expect(store.has(FOLDER)).toBe(false)
  expect(store.get('folder:/elsewhere')).toEqual({ theme: 'ember' })
})

test('"<name> folder" and "off folder" on the command line', async ($, on) => {
  const { shown, store } = engine(on)
  const said = await $.command.run({ ...RUN, args: 'honu lagoon folder' })
  expect(said.text).toMatch(/Honu Lagoon applied to every session in this folder/)
  expect(store.get(FOLDER)).toMatchObject({ theme: 'honu-lagoon' })
  const off = await $.command.run({ ...RUN, args: 'off folder' })
  expect(off.text).toMatch(/off for this folder/)
  expect(store.get(FOLDER)).toMatchObject({ theme: null })
  expect(shown.at(-1)).toBeUndefined()
})

test('This folder is refused where the session has no folder, and nothing changes', async ($, on) => {
  const { shown, store } = engine(on, { noFolder: true })
  const said = await $.command.run({ ...RUN, args: 'honu-lagoon folder' })
  expect(said.text).toMatch(/That did not work: .*no folder/)
  expect(shown.length).toBe(0)
  expect([...store.keys()]).toEqual([])
})

test("an open session follows its folder's choice, made in another session there, over the all-sessions one", async ($, on) => {
  const { shown, store, clock } = engine(on)
  store.set('theme', 'koi-mosaic')
  await $.session.start(START)
  store.set(FOLDER, { theme: 'honu-lagoon' })
  await clock.advance(3_000)
  expect(shown.at(-1)).toBe('gpu-honu-lagoon')
  expect((await $.command.run({ ...RUN, args: 'status' })).text).toMatch(/every session in this folder/)
  // A change for every session does not reach a folder with its own choice.
  const before = shown.length
  store.set('theme', 'ember')
  await clock.advance(9_000)
  expect(shown.length).toBe(before)
  // Its folder's choice taken off elsewhere: this session keeps what it shows.
  store.set(FOLDER, { theme: null })
  await clock.advance(9_000)
  expect(shown.length).toBe(before)
})

test('a This folder choice is not undone by the follow check', async ($, on) => {
  const { shown, store, clock } = engine(on)
  store.set('theme', 'koi-mosaic')
  await $.session.start(START)
  await $.command.run({ ...RUN, args: 'honu-lagoon folder' })
  const before = shown.length
  await clock.advance(9_000)
  expect(shown.length).toBe(before)
  expect(shown.at(-1)).toBe('gpu-honu-lagoon')
})

test('at a start, a folder turned off beats the all-sessions choice', async ($, on) => {
  const { shown, store } = engine(on)
  store.set('theme', 'koi-mosaic')
  store.set(FOLDER, { theme: null })
  await $.session.start(START)
  expect(shown.length).toBe(0)
  expect((await $.command.run({ ...RUN, args: 'status' })).text).toBe('No GPU theme is on.')
})

test('a store failure on This folder puts back only what it wrote, and the window', async ($, on) => {
  const fail: Fail = {}
  const { shown, store, writes } = engine(on, fail)
  await $.command.run({ ...RUN, args: 'koi-mosaic' })
  store.set('session:test-session', { theme: 'ember' })
  // The folder's choice is written; dropping this session's own then fails.
  fail.del = true
  writes.length = 0
  const said = await $.command.run({ ...RUN, args: 'honu-lagoon folder' })
  expect(said.text).toMatch(/did not work/)
  expect(shown.at(-1)).toBe('gpu-koi-mosaic')
  expect(store.get('session:test-session')).toEqual({ theme: 'ember' })
  // The all-sessions choice was never written, by the folder write or the rollback.
  expect(writes.includes('theme')).toBe(false)
  expect(store.get('theme')).toBe('koi-mosaic')
})

test('past 200 folders, the one chosen longest ago is dropped, not one chosen again since', async ($, on) => {
  const { store, clock } = engine(on)
  for (let index = 0; index < 200; index += 1) store.set(`folder:/f${index}`, { theme: 'ember', at: 1_000 + index })
  // /f0 is the first stored, but chosen again just now.
  store.set('folder:/f0', { theme: 'ember', at: 10_000 })
  await clock.advance(20_000)
  await $.command.run({ ...RUN, args: 'honu-lagoon folder' })
  expect(store.has('folder:/f0')).toBe(true)
  expect(store.has('folder:/f1')).toBe(false)
  expect(store.has(FOLDER)).toBe(true)
  expect([...store.keys()].filter(key => key.startsWith('folder:')).length).toBe(200)
})

// --- The change from one theme to the next ---

// The app crossfades from the old backdrop to the new one's still; each shader then fades its own picture in over that
// still (a clock of its own, in the shader file: nothing a test here can run). The mod adds nothing to the change.

test('a change of theme is one set, at once: nothing waits, and the still is drawn as it is', async ($, on) => {
  const { shown } = engine(on)
  await $.command.run({ ...RUN, args: 'koi-mosaic' })
  let ui = await $.ui.mount(backdrop('koi-mosaic'))
  await ui.unmount()
  // No time passes on the mocked clock: a wait would hold this command forever.
  await $.command.run({ ...RUN, args: 'honu-lagoon' })
  expect(shown.slice(-2)).toEqual(['gpu-koi-mosaic', 'gpu-honu-lagoon'])
  ui = await $.ui.mount(backdrop('honu-lagoon'))
  expect(String((await ui.find({ type: 'Svg' }))?.props.source)).not.toContain('gpu-themes-')
  await ui.unmount()
})

test("each shader is given only the values its file declares: a rebuilt scene's variant, or none", async $ => {
  for (const id of [...IDS, ...SHADER_IDS]) {
    const ui = await $.ui.mount(backdrop(id))
    const values = (await ui.find({ type: 'Shader' }))?.props.values
    // Koi Mosaic's shader has one look; Koi Pond takes the session's six; theme-examples' others take nothing.
    if (IDS.includes(id) && id !== 'koi-mosaic') expect(Object.keys(values as object), id).toEqual(['variant'])
    else if (id.startsWith('koi-pond')) expect(Object.keys(values as object).sort(), id).toEqual(POND_KEYS)
    else expect(values, id).toBeUndefined()
    await ui.unmount()
  }
})

// --- A name that is no theme's ---

test('a misspelt name suggests the theme it is close to, and applies nothing', async ($, on) => {
  const { shown, store } = engine(on)
  for (const [typed, meant] of [['koi moisaic', 'Koi Mosaic (koi-mosaic)'], ['start chart', 'Star Chart (star-chart)']] as const) {
    const said = await $.command.run({ ...RUN, args: typed })
    expect(said.text).toBe(`No GPU theme named "${typed}". Did you mean ${meant}?`)
  }
  // With "session" after it, the same.
  expect((await $.command.run({ ...RUN, args: 'koi moisaic session' })).text).toMatch(/Did you mean Koi Mosaic/)
  expect(shown.length).toBe(0)
  expect([...store.keys()]).toEqual([])
})

test('a name close to several themes lists them, closest first, three at most', async ($, on) => {
  engine(on)
  const said = (await $.command.run({ ...RUN, args: 'halftone dusc' })).text
  expect(said.split('\n')).toEqual([
    'No GPU theme named "halftone dusc". Did you mean:',
    '  Halftone Dusk (halftone-dusk)',
    '  Halftone Dawn (halftone-dawn)',
  ])
})

test('a name close to none says where to see them all, with no list', async ($, on) => {
  engine(on)
  const said = (await $.command.run({ ...RUN, args: 'volcano' })).text
  expect(said).toBe('No GPU theme named "volcano". /gpu-theme list shows all 38; a name may end with "folder" or "session".')
  // A misspelt last word is named the same way.
  expect((await $.command.run({ ...RUN, args: 'koi mosaic sesion' })).text).toMatch(/end with "folder" or "session"/)
})

// --- Koi Pond's view of the session ---

const POND_KEYS = ['busy', 'helpers', 'making', 'pace', 'trouble', 'waiting']
type Dollar = Parameters<Parameters<typeof test>[1]>[0]
type On = Parameters<Parameters<typeof test>[1]>[1]
type Tool = Parameters<Dollar['tool']['call']>[0]
type Complete = Parameters<Dollar['turn']['complete']>[0]

/**
 * The engine, with turns, tool results and AskUserQuestion answered: `helpers` lists the agents `$.agent.list()`
 * names (a fork is one it does not), and a question waits until `answer()`.
 */
function pondEngine(on: On) {
  const parts = engine(on)
  const helpers = new Set<string>()
  const answers: (() => void)[] = []
  const asked = { open: 0 }
  on('turn.start', (_, e) => ({ turnId: (e as { turnId: string }).turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.list', () => ({ value: [...helpers].map(id => ({ id, description: id, type: 'general-purpose' })) }))
  on('classic.PostToolUse', () => ({}))
  on('classic.PostToolUseFailure', () => ({}))
  on('tool.call', async () => {
    asked.open += 1
    await new Promise<void>(done => answers.push(done))
    return { result: 'answered' }
  })
  return { ...parts, helpers, asked, answer: () => answers.shift()?.() }
}

/** Lets the pond's bookkeeping, which nothing waits for, settle. */
const settle = () => new Promise(done => setTimeout(done, 30))

async function pond($: Dollar) {
  await settle()
  const ui = await $.ui.mount(backdrop('koi-pond'))
  const values = (await ui.find({ type: 'Shader' }))?.props.values as Record<string, number>
  await ui.unmount()
  return values
}

const ran = ($: Dollar, tool: string, how: { fails?: boolean; interrupt?: boolean; agent?: string } = {}) => {
  const base = { tool_name: tool, tool_input: {}, tool_use_id: `u-${tool}`, ...(how.agent ? { agent_id: how.agent } : {}) }
  return how.fails || how.interrupt
    ? $.classic.PostToolUseFailure({ ...base, error: 'failed', ...(how.interrupt ? { is_interrupt: true } : {}) } as never)
    : $.classic.PostToolUse({ ...base, tool_response: {} } as never)
}
const end = (turnId: string, agentId?: string) =>
  ({ answer: '', durationMs: 1, isAborted: false, turnId, reason: 'answer', ...(agentId ? { agentId } : {}) }) as Complete
const QUIET = { busy: 0, pace: 0, waiting: 0, making: 0, trouble: 0, helpers: 0 }

test('Koi Pond is quiet when nothing is happening', async ($, on) => {
  pondEngine(on)
  await $.session.start(START)
  expect(await pond($)).toEqual(QUIET)
})

test('Koi Pond follows a turn: busy, its pace, a file written, a failure and its mending, then calm', async ($, on) => {
  const { clock } = pondEngine(on)
  await $.turn.start({ text: 'fix it', turnId: 't1' })
  expect(await pond($)).toMatchObject({ busy: 1, pace: 0 })
  await ran($, 'Write')
  expect(await pond($)).toMatchObject({ busy: 1, pace: 1, making: 1, trouble: 0 })
  await clock.advance(25_000)
  expect((await pond($)).making).toBe(1)
  await clock.advance(5_000)
  expect((await pond($)).making).toBe(0)
  await ran($, 'Bash', { fails: true })
  expect((await pond($)).trouble).toBe(1)
  await ran($, 'Read')
  expect((await pond($)).trouble).toBe(0)
  // A failed write is a failure, not a file written.
  await ran($, 'Edit', { fails: true })
  expect(await pond($)).toMatchObject({ trouble: 1, making: 0 })
  await $.turn.complete(end('t1'))
  expect(await pond($)).toEqual(QUIET)
})

test("Koi Pond's pace rises with the calls of the last 20 seconds, and falls back once they stop", async ($, on) => {
  const { clock } = pondEngine(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  const levels: number[] = []
  for (let n = 0; n < 6; n += 1) {
    await ran($, 'Read')
    levels.push((await pond($)).pace ?? -1)
  }
  expect(levels).toEqual([1, 1, 2, 2, 2, 3])
  await clock.advance(20_000)
  expect((await pond($)).pace).toBe(0)
})

test('Koi Pond counts helper agents while they run, four at most; a fork of the engine is no helper', async ($, on) => {
  const { helpers } = pondEngine(on)
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) helpers.add(id)
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) await $.turn.start({ text: 'help', turnId: `t-${id}`, agentId: id })
  // The engine's own fork (compaction, memory): no agent the list names.
  await $.turn.start({ text: 'compact', turnId: 't-fork', agentId: 'fork-1' })
  expect((await pond($)).helpers).toBe(4)
  // A helper's turn is not yours: you are not busy.
  expect((await pond($)).busy).toBe(0)
  // A fork's tool results count for nothing.
  await ran($, 'Write', { agent: 'fork-1' })
  expect((await pond($)).making).toBe(0)
  for (const id of ['a1', 'a2', 'a3', 'a4']) await $.turn.complete(end(`t-${id}`, id))
  expect((await pond($)).helpers).toBe(1)
})

test('a result that lands once nothing is at work changes nothing: the pond does not stay troubled', async ($, on) => {
  const { helpers } = pondEngine(on)
  // Your turn ends (stopped), then the command it ran fails.
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete({ ...end('t1'), isAborted: true, reason: 'aborted' } as Complete)
  await ran($, 'Bash', { fails: true })
  expect(await pond($)).toEqual(QUIET)
  // A helper fails, then ends: once nothing is at work, calm again.
  helpers.add('a1')
  await $.turn.start({ text: 'help', turnId: 't-a1', agentId: 'a1' })
  await settle()
  await ran($, 'Bash', { fails: true, agent: 'a1' })
  expect((await pond($)).trouble).toBe(1)
  await $.turn.complete(end('t-a1', 'a1'))
  expect(await pond($)).toEqual(QUIET)
})

test('an interrupted call (Esc) is no failure', async ($, on) => {
  pondEngine(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await ran($, 'Bash', { interrupt: true })
  expect((await pond($)).trouble).toBe(0)
})

test('Koi Pond waits with you while Claude asks you something, until the last question is answered', async ($, on) => {
  const { answer, asked } = pondEngine(on)
  const first = $.tool.call({ tool: 'AskUserQuestion', questions: [] } as unknown as Tool)
  const second = $.tool.call({ tool: 'AskUserQuestion', questions: [], agentId: 'a1' } as unknown as Tool)
  for (let n = 0; n < 100 && asked.open < 2; n += 1) await new Promise(done => setTimeout(done, 10))
  expect((await pond($)).waiting).toBe(1)
  answer()
  // Every call goes on as it came.
  expect(await first).toMatchObject({ result: 'answered' })
  expect((await pond($)).waiting).toBe(1)
  answer()
  await second
  expect((await pond($)).waiting).toBe(0)
})

test('a reload starts Koi Pond quiet', async ($, on) => {
  pondEngine(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await ran($, 'Bash', { fails: true })
  await $.session.start(START)
  expect(await pond($)).toEqual(QUIET)
})

test('an answer that ends with a question has the pond wait with you until your next turn', async ($, on) => {
  pondEngine(on)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.turn.complete({ ...end('t1'), answer: 'Done. Shall I push it, or hold off?' } as Complete)
  expect((await pond($)).waiting).toBe(1)
  // Your reply starts the next turn: no longer waited for.
  await $.turn.start({ text: 'push', turnId: 't2' })
  expect((await pond($)).waiting).toBe(0)
  // An answer that asks nothing leaves the koi free; so does a stopped turn, whatever it said.
  await $.turn.complete({ ...end('t2'), answer: 'Pushed.' } as Complete)
  expect((await pond($)).waiting).toBe(0)
  await $.turn.start({ text: 'go', turnId: 't3' })
  await $.turn.complete({ ...end('t3'), answer: 'Which one?', isAborted: true, reason: 'aborted' } as Complete)
  expect((await pond($)).waiting).toBe(0)
  // A question mark inside closing marks still counts.
  await $.turn.start({ text: 'go', turnId: 't4' })
  await $.turn.complete({ ...end('t4'), answer: 'Is it **smooth now?**' } as Complete)
  expect((await pond($)).waiting).toBe(1)
  // And the full-width question mark.
  await $.turn.start({ text: 'go', turnId: 't5' })
  await $.turn.complete({ ...end('t5'), answer: '\u8981\u63a8\u9001\u5417\uff1f' } as Complete)
  expect((await pond($)).waiting).toBe(1)
})
