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
