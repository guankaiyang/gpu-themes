# gpu-themes

All 38 animated backdrops of Claude's built-in `theme-examples` plugin, in one picker, without the chat lag.

14 of the originals animate one big SVG with CSS. The desktop app redraws that on the CPU every frame, which measured
at 21–110% of a CPU core and made the chat slow (see `bench/prompt.md`). This mod rebuilds those 14 as a still SVG,
drawn once, with every moving part in a shader on the GPU:

Koi Mosaic, Snow Pines, Halftone Dawn and Dusk, Plotter Tide and Plotter Tide Night, Deep Water, Night Reef,
Paper Garden and Kraft, Honu Lagoon, Dither Dunes and Dither Dunes Night, Vector Range.

The other 24 already ran smoothly and are included unchanged, with their sounds (Koi Pond, Falling Sand):
Duck Pond, Falling Sand, Field Lines, Garden Beetles, Koi Pond, Ripple Tank, Sea Sparkle, Semicolony and Star Chart
(each with a night version), plus Braille Stars, Block Clouds, Departure Board, Blueprint, Aurora and Ember.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install gpu-themes --marketplace guankaiyang/gpu-themes
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```bash
claude plugin install gpu-themes --marketplace guankaiyang/gpu-themes
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**,
**Add marketplace** with `guankaiyang/gpu-themes`, then **Add plugin**.

Backdrops are drawn by the Claude desktop app.

## Use

`/gpu-theme` alone opens a picker card, laid out like theme-examples' own. Each theme has three buttons:
**Apply** (every session), **This session** (this session only) and **Preview** (shows it for 20 seconds, then goes back).
The card also has **No theme** and **Close**.

From the command line: `/gpu-theme <name>` (every session), `/gpu-theme <name> session` (this session only),
`/gpu-theme list`, `/gpu-theme status`, `/gpu-theme off` (add `session` to clear this session only).
A session's own choice wins over the all-sessions one. Other open sessions follow an all-sessions Apply within a few seconds, unless they have their own. An all-sessions "off" reaches them at their next start, so that it never wipes another plugin's theme.

The window has one backdrop. A pick on theme-examples' own `/custom-theme` card replaces this mod's theme in that
window; pick on `/gpu-theme` again to bring it back. Under Reduce Motion, or where the app plays no shader, the still
shows alone.

## License

Apache License 2.0, see `LICENSE` and `NOTICE`. Derived from Anthropic's `theme-examples` plugin.
