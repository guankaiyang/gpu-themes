// The still part of Deep Water: the whole scene frozen at the first frame of the CSS original (time 0, with each
// bubble's negative delay already played), drawn once. shader.ts paints the whole scene again, opaque, over it and
// moves the light shafts, caustic bands, bubbles and turtle; so this still shows only where no shader plays.
// Derived from theme-examples' scenes/classic.ts (Apache License 2.0). Changed: the <style> with its keyframes and the
// reduced-motion rule is removed, and each animated element holds its pose at time 0 as a transform attribute
// (shafts skewX(-5) / skewX(6), bands translate(-90) / translate(90), bubbles risen 25 units a second of delay with
// the first one still fading in, turtle rotate(-4)).

const DEEP = `<linearGradient id="deep" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f6f86"/><stop offset="0.45" stop-color="#0a4660"/><stop offset="1" stop-color="#041c30"/></linearGradient>`
const RAY = `<linearGradient id="ray" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#bff3ff" stop-opacity="0"/><stop offset="0.5" stop-color="#bff3ff" stop-opacity="0.3"/><stop offset="1" stop-color="#bff3ff" stop-opacity="0"/></linearGradient>`
const DOWN = `<linearGradient id="down" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="0.92" stop-color="#000"/></linearGradient>`
const FADE = `<mask id="fade" maskUnits="userSpaceOnUse" x="-400" y="-40" width="2400" height="900"><rect x="-400" y="-40" width="2400" height="900" fill="url(#down)"/></mask>`
const CALM = `<radialGradient id="calm" cx="0.5" cy="0.55" r="0.6"><stop offset="0" stop-color="#000" stop-opacity="0.12"/><stop offset="0.6" stop-color="#000" stop-opacity="0.05"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`

function soft(id: string, color: string, peak: number): string {
  return `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${peak}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`
}

function build(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" font-family="monospace" color="#888"><defs>${DEEP}
   ${RAY}
   ${DOWN}
   ${FADE}
   ${soft('caustic', '#9fe9f5', 0.2)}
   ${soft('orb', '#c9f6ff', 0.22)}${soft('glint', '#e8fdff', 0.3)}${CALM}</defs>
<rect width="1600" height="1000" fill="url(#deep)"/>
<g mask="url(#fade)">
<g transform="translate(-60 0) skewX(-14)"><rect transform="skewX(-5)" x="0" y="-40" width="460" height="900" fill="url(#ray)"/></g>
<g transform="translate(1180 0) skewX(11)"><rect transform="skewX(6)" x="0" y="-40" width="520" height="900" fill="url(#ray)"/></g>
<g transform="translate(250 0) skewX(-20)"><rect transform="skewX(6)" x="0" y="-40" width="420" height="900" fill="url(#ray)" opacity="0.55"/></g>
</g>
<g transform="translate(-90 0)"><ellipse cx="380" cy="130" rx="620" ry="70" fill="url(#caustic)"/><ellipse cx="1280" cy="170" rx="540" ry="56" fill="url(#caustic)"/></g>
<g transform="translate(90 0)"><ellipse cx="300" cy="900" rx="700" ry="80" fill="url(#caustic)"/><ellipse cx="1350" cy="880" rx="560" ry="64" fill="url(#caustic)"/></g>
<g transform="translate(0 -100)" opacity="0.7246"><circle cx="70" cy="1060" r="46" fill="url(#orb)"/></g>
<g transform="translate(0 -525)"><circle cx="1535" cy="1080" r="62" fill="url(#orb)"/><circle cx="1518" cy="1060" r="15" fill="url(#glint)"/></g>
<g transform="translate(0 -825)"><circle cx="1470" cy="1050" r="30" fill="url(#orb)"/></g>
<g transform="translate(0 -350)"><circle cx="150" cy="1070" r="26" fill="url(#orb)"/></g>
<g transform="translate(1300 800)"><g transform="rotate(-4)" opacity="0.5"><g fill="#0b3a4d">
  <ellipse cx="0" cy="0" rx="92" ry="62"/>
  <ellipse cx="108" cy="-10" rx="30" ry="20"/>
  <path d="M40 -52 q60 -64 104 -40 q-44 10 -78 62z"/><path d="M36 52 q58 60 96 34 q-40 -6 -70 -54z"/>
  <path d="M-58 -44 q-52 -30 -70 -6 q38 0 56 34z"/><path d="M-58 44 q-50 30 -66 8 q36 -2 54 -34z"/>
  <path d="M-92 0 l-30 6 l28 6z"/></g>
  <ellipse cx="0" cy="0" rx="70" ry="44" fill="#124d63"/></g></g>
<rect width="1600" height="1000" fill="url(#calm)"/></svg>`
}

const cache: { svg?: string } = {}

/** The still scene. Deep Water has one look, so both variants are the same string. */
export function stillSvg(variant: 0 | 1): string {
  void variant
  if (cache.svg === undefined) {
    cache.svg = build()
  }
  return cache.svg
}
