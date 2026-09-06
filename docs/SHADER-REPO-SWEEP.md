# Sixteen outside repos, checked against what the tree already has

Keith sent sixteen links (warp, trimesh, two MenacingMecha Godot demos, three StefanJo3107
repos, eight Cyanilux repos, occt-wasm, shaderloom, mmacklin/sandbox) asking whether any of
them are new shaders, ideas, or repos worth pulling into SweK. This is that check, done
before anything is built: `world/reachedLicences.mjs` and `world/vendoredLicences.mjs`
searched for each name, then the tree itself grepped for the technique each repo actually
sells, because "is this new" and "is this legal to take" are different questions and the
retroRaster precedent (below) says to ask both before writing a line of shader.

## What was already reached

**mmacklin/sandbox** is the only one of the sixteen with a prior record. `render/vorticity.mjs`
and `brain/brain.js` v4440 read its smoke demo for the vorticity-confinement technique
(Fedkiw/Stam/Jensen 2001) and did not vendor it — C++/CUDA, and the round's own measurement
found confinement is a forcing term with no value of eps that is a correction rather than an
energy injection, which is a finding about the *technique*, not about mmacklin's code. It is
not in `world/reachedLicences.mjs`'s formal register (that file's own scope is licences quoted
verbatim for sources read and not vendored, and this citation predates that convention), but
the changelog entry is the same shape: read, credited, not copied.

The other fifteen are not mentioned anywhere in either registry or in the changelog. This is
the first time this tree has looked at any of them.

## Already built here, independently — no port closes a gap

Four of the sixteen turn out to be techniques SweK already has, built without reference to
these repos:

- **StefanJo3107/ASCII-Rendering-Shader-in-Unity** (character-atlas, luminance-to-glyph) —
  `ascii-avatar.html`, `ascii-object.html`, `ascii-video.html` already do this. Worth a diff
  pass on the atlas-sampling math specifically (its README describes tile-count-driven glyph
  selection; worth confirming SweK's luminance bucketing isn't cruder), but not a new capability.
- **Cyanilux/URP_WatercolourShaders** (triplanar noise, shadow-sampled edge darkening, noisy
  vignette fade) — `aquarelle.html` is SweK's watercolour pass already.
- **Cyanilux/URP_RetroCRTShader** (scanlines, curvature, chromatic aberration, phosphor
  stripes, static) — `render/crtPass.js` and `fx/dither.js` cover the falsifiable half of this
  family already (see next section); the rest is the same aesthetic-only category retroRaster
  already declined.
- **MenacingMecha/godot-psx-style-demo** and **godot-n64-shader-demo** (vertex snapping, affine
  texture warp, dithering, limited colour depth, fog) — this is *the same three techniques*
  `render/retroRaster.mjs` v4442 already took, read that time from DaveFace/UnrealRetroShaders
  (a dead Unreal 4.27 asset pack) rather than from a Godot demo. The file's own header is the
  right model for this whole sweep, so it's worth quoting: it split the pack by whether a
  technique "can be WRONG" — affine warping and vertex wobble are closed-form and gated (
  `fx/dither.js`, `tools/ship/dither-selfcheck.mjs`, and retroRaster's own gate), while
  YUV/posterise is "AESTHETIC ONLY. There is no wrong answer to be caught, so it is not taken."
  The Godot demos add nothing past that split — same 1994 console constraints, same verdict.
  Their MIT licences are irrelevant because, per retroRaster's header, the techniques
  themselves are 1994 hardware constraints and not anyone's to license.

## Hard-blocked — wrong tool, wrong licence, or wrong stage

- **Cyanilux/ShaderGraphVariables, BakeShader, ShaderGraphToPNG, URP_ShaderGraphCustomLighting,
  URP_BlitRenderFeature** — five Unity-Editor / Shader-Graph-authoring tools, not shading
  techniques. Confirmed by fetching each README: ShaderGraphVariables patches invisible wires
  into the *graph editor*; BakeShader and ShaderGraphToPNG are asset-pipeline utilities that
  only exist because Unity's material system needs them; BlitRenderFeature is a URP
  RenderGraph integration and its own README calls the underlying blit-to-texture idea general
  but the implementation "pipeline-specific." SweK has no node-graph editor and no asset
  pipeline these would plug into — `gfx/device.js` (a device abstraction) and
  `render/tslSource.mjs` (a shell/transplant system for TSL graphs) already cover the *general*
  idea each of these wraps (full-screen blit passes, baking a shader's output to a texture).
  Nothing to port; these are Unity-workflow conveniences, not portable code or algorithms.
- **StefanJo3107/hexgen** — GPL-2.0. Every entry in `world/vendoredLicences.mjs` is
  MIT/Apache/OFL/0BSD; the tree's own note on `vendor/keyhunt` (MIT) draws the vendoring line
  at "the clause that decides everything for this tree is the same in both: DO NOT
  REDISTRIBUTE" for restrictive terms, and GPL's copyleft is a stronger version of the same
  problem — vendoring GPL-2.0 into this tree would obligate the whole tree under it. Not
  vendorable. The *idea* (hex-grid terrain from noise) isn't GPL's to own, and SweK doesn't have
  a hex-terrain generator today (grep found `hex` only in unrelated grid/lattice physics code)
  — if hex terrain is ever wanted, it would need to be built from a description of the
  technique, never from hexgen's Rust/Glium source.
- **NVIDIA/warp, mikedh/trimesh, mikedh/occt-wasm** — Python+CUDA, pure Python, and
  Rust/C++/Emscripten-WASM respectively. None target this tree's browser-JS + hand-written
  GLSL/WGSL toolchain, and occt-wasm's compiled output is LGPL-2.1 (inherited from OpenCascade),
  which fails the same permissive-only bar hexgen fails. The keyhunt/mmacklin precedent is the
  right model if any of these becomes relevant later: read the *algorithm* (trimesh's
  watertight-repair logic is the most plausible fit, next to `physics/mesh/meshCSG.mjs`; warp's
  differentiable-kernel style has no shader-relevant analogue here — this tree's own device
  passes are already hand-verified against closed-form keys, which is the thing warp's autodiff
  is a substitute for in a context that needs gradients) and reimplement natively with this
  tree's own gate, never vendor the bytes.
- **mikedh/shaderloom** — a Rust CLI that preprocesses WGSL with Lua-scripted includes and
  build-time logic. This is exactly the three-stage IR shape (`parse, lower, emit`)
  `docs/TSL-ROADMAP.md`'s closing section already has a standing argument against adopting
  before the pair-count trigger fires: "a hand-written pair is cheaper than an IR while few
  files carry both languages... the honest figures are 10 both, 23 WGSL-only, 99 GLSL-only, and
  the trigger is twenty and it has not fired." shaderloom is also a Cargo/Rust tool with no
  place in this tree's Node-based `tools/ship/` toolchain. Skip until that trigger fires — and
  if it does, TSL (already vendored, already the tree's chosen IR) is the thing that gets
  reopened, not a second, unrelated preprocessor.

## Worth a closer look

- **StefanJo3107/2D-Water-Shader** (MIT, HLSL/Unity: two scrolling normal/height layers,
  parallax offset, foam threshold, optional vertex displacement) — the one repo in the list
  that is (a) a real technique, (b) not already in the tree under another name, and (c) has a
  falsifiable core in the retroRaster sense: the parallax offset between layers is a closed-form
  function of layer depth and view angle, and a foam mask driven by a height threshold is a
  monotonic comparison, not an aesthetic judgement call. That's the same shape
  `docs/PHYSICS-SHADER-CANDIDATES.md` ranks candidates by — a pipeline on `gfx/device.js`, both
  languages, and a gate that reads an exact number back rather than eyeballing a picture. Not
  built here; flagged as the one candidate from this sweep that clears the bar the rest don't.
- **mmacklin/sandbox, the parts not yet reached** — vorticity/confinement is the only piece
  read so far. The rest of its contents (Cornell CS5643 cloth, FEM with fracture, rigid-body
  LCP, path tracing, spherical harmonics, metaballs, HDR light-probe visualisation) mostly
  duplicate things already in this tree under different algorithms: `physics/render/
  pathTracerWgsl.mjs` already exists (graded against its own furnace-test twin per
  PHYSICS-SHADER-CANDIDATES.md), spherical harmonics already back the Gaussian-splat renderer
  (`physics/splat/gaussianSplat.js`), and metaballs already have a whole family (`blobulator.html`
  and the other blob-*.html pages). Two pieces are genuinely absent: an LCP-based rigid-body
  solver (the tree uses box3d's sequential-impulse solver instead, which is the standard game-
  engine choice over a direct LCP solve, so this isn't obviously a gap worth closing) and FEM
  fracture specifically (the tree's fracture is Voronoi/voxel-cell based — `physics/voxel/
  fracture.js`, `fx/fracture/cellFracture.js` — not deformation-driven FEM, which is a real but
  expensive difference). Neither is recommended without a specific reason to want it; noted so
  a future round doesn't re-derive "is there a gap here" from scratch.

## The method, for next time

Sixteen links in, the split that mattered every time was the one retroRaster already wrote
down: does the technique have a right answer a gate can fail? Affine warp, vertex snap, and now
2D-Water's parallax and foam threshold — yes. A vignette's noise pattern, a Shader Graph node's
wire-routing convenience, a CRT's static texture — no, and no amount of source-reading changes
that. The second split, just as decisive here, is what a repo actually *is* underneath its
README: five of sixteen turned out to be Unity-Editor tooling with no shader in them at all,
and three turned out to be languages/runtimes (Python, Rust+WASM, Rust+CUDA) this tree's
browser toolchain can't run regardless of licence. Checking `world/reachedLicences.mjs` and
`world/vendoredLicences.mjs` first would have saved nothing this round — only mmacklin/sandbox
was ever there — but it's the first thing to check next time, before re-deriving from grep
that nothing else has been looked at yet.

## Second pass: three more repos (v4505 onward)

This file was written on the shader-porting branch (commit 8e131bd8) and carried onto the
upgrade branch unchanged above this line, so the two lines of work can merge on it. Three more
links, checked the same way -- `world/reachedLicences.mjs` and `world/vendoredLicences.mjs`
first (none of the three was there), then the tree grepped for the technique -- and this time
two of them were built rather than filed, because each had a right answer a gate can fail.

### edoardolunardi/ascii-logo -- BUILT as `render/asciiShape.mjs` (v4505)

**What it is.** MIT, (c) 2009-2026 Codrops (a Codrops piece under Edoardo Lunardi's account;
LICENSE read first-hand, 21 lines, sha256 3b56d635b76c). `src/ascii-logo/glyph-atlas.js`
rasterises the 95 printable ASCII glyphs on a canvas and measures each at six interior points
(`samples.js`: two columns, the right one riding higher so a diagonal reads as one), a disc
average at each, giving every glyph a six-dimensional coverage vector normalised per sample
position across the set; `shaders/cell.frag.glsl` takes the same six luminance samples of the
scene per cell (a centre tap plus a six-tap ring) and picks the nearest vector by squared
distance over the 95, strict `<`, the index leaving in alpha. It also weighs the six by ten
outer samples through two `pow` contrasts, and prints through a glyph sheet.

**Why it is not what SweK had.** `tools/ship/asciiLut.mjs` (v3776) picks by ONE scalar per
cell, a ramp of ink counts from a 5 x 7 bitmask font, so a diagonal edge and a flat mid-grey
patch of the same mean get the same glyph. Its own header names the multi-sample category as
the better method stong/gradscii-art (AGPL-3.0) set out to beat the traditional approach with,
and declines it for the licence alone. ascii-logo is that category under MIT.

**What was taken and what was not.** The method, re-derived: the six points and the disc
average, the per-column normalisation, the argmin. Not one byte: the glyphs are rasterised from
the vendored Plex through `text/slugEval.js` (the evaluator every Slug gate keys on) rather
than a canvas, the table ships as rgba8 quantised to bytes so the CPU twin and both fragments
compare the same numbers, the scene is read by integer texel, and there is a WGSL twin. Left
out: the outer ring and both contrast powers (weights on the same six numbers; `pow` in f32
would move the near-ties the gate counts) and the glyph sheet (`ascii-shape.html` prints the
picks through Slug from the same font the vectors were measured on).

**Measured** (`tools/ship/asciiShape-selfcheck.mjs`): the fragment's argmin is the CPU twin's
on 504 of 504 cells of procPlanet's bake on both backends, 0 near-ties under 1e-5; three cells
of one mean (white left, white right, flat grey) pick `L`, `4` and `1` where asciiLut prints
`#` three times. Sabotage C -- the table left unnormalised -- kept every cell-for-cell hold
green, because both sides read the same bytes; the derivation holds caught it. Parity sees that
two sides agree, never what they agree on.

### StefanJo3107/2D-Water-Shader -- BUILT as `render/water2d.mjs` (v4506)

**What it is.** MIT, (c) 2020 Stefan Jovanovic (LICENSE read first-hand, 21 lines, sha256
8f28396b9a62). A Unity CG surface shader after Kingdom's water: two displacement textures
scrolled in x at two speeds and by the camera's x over a parallax divider, their red and green
summed into an offset, the scene (a reflection render in the original) read at
`uv + (offset - 0.5) / amount`, a per-channel contrast curve on the tint driven by the
sample's greyness, and foam where both offset channels exceed a threshold or the fragment sits
below an edge line that leans with the offset; optional vertex displacement and perspective
correction behind toggles. The first pass of this sweep (above) flagged it as the one of
sixteen with a falsifiable core.

**What was taken and what was not.** The method, re-derived as a full-screen pass on
`gfx/device.js` in both languages with a CPU twin. Every read is an integer texel (floor of a
fract-wrapped or clamped coordinate times the size, no sampler), the displacement maps are
generated from a seed on the CPU, so the twin names the exact texel every fragment reads. Not
taken: bilinear sampling (softer, and holds nothing exactly), the two toggles, the reflection
render as the scene (`water-2d.html` uses procPlanet's bake), and the Craftpix background
sprites in its Assets, which were not looked at.

**Measured** (`tools/ship/water2d-selfcheck.mjs`): on a ramp scene whose colour is twice its
texel index the fragment reads the twin's texel on every pixel not within 2e-6 of a texel
boundary (15,349 to 15,356 of 15,360 exact, 0 wrong) and the foam mask is the twin's pixel for
pixel; a camera shift of three map texels moves the mask exactly eight pixels on 14,592 of
14,592; the bake with the tint and translucent foam is within 2 of 255 off-boundary on both
backends. The gate's own arithmetic needed three corrections before the pass needed none: odd
indices halved to a .5 the two precisions round apart, 64-texel maps that put every fifth
column and every third row exactly on a texel boundary, and a parallax shift compared
backwards. Sabotages red at 7 / 7 / 6 / 7.

**mmacklin/sandbox, restated.** Its remaining pieces (path tracer, spherical harmonics,
metaballs) duplicate `physics/render/pathTracerWgsl.mjs`, the splat renderer's SH and the
blob pages, as the first pass said; nothing further was read from it this pass.

### edoardolunardi/kugiri -- READ, NOT TAKEN, and where it would fit (v4507)

**What it is.** A DOM-surgery tool, not a shader: MIT, (c) 2026 Edoardo Lunardi (LICENSE read
first-hand, 21 lines, sha256 0ebd02b11864, v0.5.2 at commit 7534878, 2026-09-06). It reads
`Range.getClientRects()` per word to find where the browser's own layout engine already broke a
paragraph into lines, cuts the DOM at those points with `Range.extractContents()`, and uses
`Intl.Segmenter` for word and grapheme boundaries; one read phase, one write phase, no forced
reflow; every unit gets `data-line` / `data-word` / `data-char` and a CSS custom property so a
stylesheet or the Web Animations API can stagger the reveal. Zero canvas, zero WebGL or WebGPU,
zero glyph atlas, no dependencies. It is in this file because it is the same sweep -- a link,
checked against what the tree has -- with a DOM-text repo instead of a shader repo.

**Slug, TSL and WebGPU text: categorically inapplicable.** `text/slugShader.js`, its WGSL twin
and everything on `render/slugDevice.mjs` render glyphs from a packed curve atlas in a
fragment shader; there is no DOM text node anywhere in that path for kugiri to find, split, or
call `getClientRects()` on. That is not "already covered" -- it is the wrong universe. kugiri
needs real HTML/CSS layout to exist first, and the ship-label and world-space text pipeline
never creates any.

**The ticker: it fails earlier than torph did.** `ui/textMorph.js` (v4158) records that text
morphing after lochie/torph was DELIBERATELY kept off the ticker, with the arithmetic:
server.html's marquee scrolls one continuous line at 0.9 px a frame (54 px/s) across a 220 px
clip with a 40-message queue, so its problem is throughput, and successive log lines share no
structure for a transition to exploit. kugiri fails before that reasoning is even reached: it
works by reading where the browser wrapped a multi-line block, and the ticker is one line that
never wraps, so `getClientRects()` has no break to report. Not declined for a design reason
this time; it has no input to operate on in that widget.

**Where it is not covered.** The lochie family has been mined twice by reading, never by
vendoring: `ui/springMotion.js` took torph's spring easing and `ui/haptics.mjs` took
lochie/web-haptics. The consumers a wrap-aware splitter would feed already exist --
`ui/stagger.mjs` for per-item delays as data and `ui/domAnimation.mjs` / WAAPI for execution,
chosen so `engine/frameDirty.js` can see the animation. What is missing is only the front end:
something that turns a real multi-line paragraph into per-line or per-word DOM nodes at the
browser's actual wrap points. Checked by grep at v4507: `getClientRects` and
`extractContents` appear nowhere in the tree, and `Intl.Segmenter` appears once, in
`ui/textMorph.js`, for graphemes rather than wrapping. So if a spot with real paragraph copy
should reveal line by line or stagger word by word -- a HUD tooltip, in-app docs, a dashboard
blurb; not the ticker -- kugiri's technique would close a real, currently absent gap, cheaply,
since it is dependency-free. Recorded in `world/reachedLicences.mjs` as read and not taken;
nothing built, because no such spot was named this round.

### VladimirKobranov/configurator-unreal-building -- RULES TAKEN as `world/buildingGrammar.mjs` (v4509)

**What it is.** Apache-2.0 (LICENSE read first-hand, 201 lines, sha256 c71d239df917). One UE5
actor, `MyActor.cpp` (631 lines), with its module meshes on a Google Drive link. It loops cells on
three axes with a seeded stream, gives each cell a role by position (corner, wall, interior, roof
cap; first-floor and last-floor variants), places stairs pieces on one facade at a chosen or
seeded column, swaps a Brandmauer (party-wall) side's modules for blank ones and removes the
stairs from it, and places accessories where a seeded percentage roll falls. Every roll a cell
might need is drawn before its branch runs.

**Why it is not what SweK had.** `world/CityGen.js` stamps solid voxel columns by height tier
for the Kaiju sandbox: no facade, no floors, no windows, a silhouette generator. And until
v4508 it drew every decision from Math.random, so no building claim could be held by hash.

**What was taken and what was not.** The rules, as data, in a pure module with a CPU-only
gate: cell counts, seeded variants, stairs by column, a party-wall flag per side (the actor has
one flag, for its left and right; buildings 3 derives the flags from adjacency), accessories by
percentage, and the roll-before-branch structure held as a property. Not one line of C++, no
Unreal transform arithmetic, no meshes. Apache is permissive; the reason not to vendor is the
engine, not the licence.

**Measured** (`tools/ship/buildingGrammar-selfcheck.mjs`): one seed one hash; five sizes match
the closed-form counts; a party wall on any side blanks its cells and moves zero placements on
the other sides; the accessory rate over 14,400 wall cells is 25.37% at 25 and 60.67% at 60.
Sabotages red at 3 / 2 / 1 / 6. The first sabotage said something about gating: the party-wall
property holds trivially on the LAST side the loop visits, so a hold on one side would have
been blind; the gate holds all four.
