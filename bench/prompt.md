# Theme CPU benchmark: prompt

## What was asked, and why
The user said some theme-examples backdrops (Koi Mosaic first) make the Claude desktop chat lag. They asked to "fix all the
other problematic themes". This benchmark decides which themes count as problematic, so that only those are ported to
GPU shaders in the gpu-themes mod.

## Data source
- theme-examples 0.6.0, the account plugin bundled with the Claude desktop app (its hooks/themes.ts and hooks/scenes/*.ts).
- `dump.test.ts.txt` (rename to dump.test.ts in a copy of the plugin), run with `claude plugin test` in a copy of that plugin, prints every theme that has no shader as
  its full SVG (20 themes). Each SVG was saved as `<id>.svg` beside `index.html`.

## Method and key choices
- `index.html` shows one scene full-window (1512x945) under two frosted panels, with the theme's own blur
  (`backdrop-filter`), standing in for the chat. It waits 1.5 s, then measures for 5 s.
- `bench_server.py` serves the page and, at each scene's start and end mark, sums the CPU time of all Chrome
  processes of that run's profile (`ps`). Result = CPU seconds / wall seconds, i.e. share of one core.
- Run: headless Chrome (`--headless=new --window-size=1512,945`), a throwaway profile, on the user's own Mac
  (the cost on this machine is the point). 3 full runs; the table gives the mean and each run.
- Frame rate was measured first and rejected: it stayed at 60 fps for every scene, because the cost is in Chrome's
  raster and compositor threads, not the main thread.
- The "none" row (empty page) ran first each time and is not a reliable baseline (scenes measured below it).
- Cut-off chosen: >= 25% of a core is "problematic" and was ported (Koi Mosaic, 40%, was the user's confirmed lag).
  20-24% was borderline: left at first, then ported too at the user's request (Paper Garden and Kraft,
  Honu Lagoon, Dither Dunes and Night, Vector Range). Under 18% is light and was not ported.

## Results (share of one CPU core: mean, then runs 1 / 2 / 3)
| theme | mean | runs |
|---|---|---|
| snow-pines | 109.9% | 109.9 / 109.9 / 109.8 |
| koi-mosaic | 40.2% | 42.0 / 38.0 / 40.6 |
| halftone-dawn | 35.9% | 36.6 / 36.5 / 34.6 |
| plotter-tide | 35.7% | 34.5 / 37.0 / 35.5 |
| plotter-tide-night | 35.3% | 35.2 / 35.8 / 34.9 |
| halftone-dusk | 31.4% | 32.0 / 32.8 / 29.4 |
| deep-water | 29.1% | 28.9 / 30.2 / 28.3 |
| night-reef | 26.6% | 25.7 / 28.7 / 25.3 |
| paper-garden | 24.1% | 23.9 / 26.9 / 21.5 |
| honu-lagoon | 22.8% | 22.3 / 24.9 / 21.2 |
| dither-dunes | 22.7% | 22.3 / 22.0 / 23.9 |
| vector-range | 22.5% | 22.2 / 21.2 / 24.0 |
| dither-dunes-night | 22.3% | 23.0 / 21.6 / 22.3 |
| paper-garden-kraft | 20.6% | 20.0 / 18.4 / 23.4 |
| none | 19.7% | 20.2 / 19.3 / 19.6 |
| blueprint | 17.2% | 15.6 / 19.7 / 16.4 |
| teletext-clouds | 16.2% | 16.6 / 15.3 / 16.8 |
| aurora | 14.1% | 13.1 / 15.8 / 13.5 |
| ember | 12.7% | 11.1 / 14.1 / 12.9 |
| braille-stars | 9.6% | 10.9 / 8.9 / 9.1 |
| departure-board | 8.9% | 9.1 / 9.1 / 8.5 |
