# morphicons -- provenance

Recorded at v4498 (task 44), when physics/mesh/strokeMorph.mjs's refusal expired: that file derived a single-open-stroke
morph for the gauge digits and wrote into its header that "the moment somebody wants a closed or multi-subpath icon, this
file is the wrong tool and morphicons is the thing to reach for. Do not re-derive that half." Font glyphs are closed,
multi-subpath outlines (an 8 is three contours), so the Slug glyph morph reaches for it.

| field | value |
|---|---|
| upstream | https://github.com/guillermolg00/morphicons |
| npm | morphicons@1.7.1, fetched from registry.npmjs.org (tarball sha256 455276d20395d23d8fdbf387fc14eb53d6c22f98c06f311b3680cf98e0c16034) |
| licence | MIT -- `LICENSE` beside this file |
| dependencies | none (`dependencies: {}`; react / vue / svelte / react-native are optional peers of adapters not vendored) |

## What is vendored, and what is not

Vendored: the CORE and nothing else -- `index.js` (the entry, 458 bytes), `spring-CFHloqPP.js` (resample, plan, interpolate,
spring), `normalize-CYnN3Npw.js` (path parsing to cubics, serialize). 32 KB. The core imports no DOM and runs in node,
which is what makes the morph gateable headless (tools/ship/slugMorph-selfcheck.mjs).

Not vendored: `dom.js`, `element.js`, `adapters.js`, the react / react-native / vue / svelte / astro wrappers, the .d.ts
files and the README. The engine draws the morph through Slug, not through an SVG element, so the DOM half has no consumer.

The two internal file names carry the upstream's content hashes (`-CFHloqPP`, `-CYnN3Npw`) and are kept verbatim so a
re-vendor from the same version is byte-identical and a different one is visibly different.
