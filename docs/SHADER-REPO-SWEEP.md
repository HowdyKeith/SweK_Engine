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

## Named candidate, not built: Transvoxel (transvoxel.org / EricLengyel/Transvoxel)

Checked, not vendored, not implemented — logged so a future round has this written down instead of
re-deriving it. Confirmed by fetching the actual repo content (not just the README): `Transvoxel.cpp` is
MIT (Copyright 2009 Eric Lengyel), and — its own README says so — it is "the data tables used in the
Transvoxel Algorithm," not a working mesher. `transvoxel.org` itself (the dissertation-level writeup) is
blocked by this session's egress proxy and was never read.

**What it actually solves, precisely**: not marching cubes, and not heightmap-terrain LOD (already solved
here — see below) — the seam between two octree cells of a volumetric isosurface meshed at *different
resolutions*, via a special "transition cell" triangulation on the boundary face.

**Checked against what's here**: `simulation/MarchingCubes.js` (classic MC, Paul Bourke's tables) and
`physics/mesh/dualContour.mjs` (feature-preserving alternative) both mesh a scalar field at exactly one
fixed resolution — confirmed by grep, neither function takes a resolution/LOD argument, and there is no
`octree` anywhere in `world/*.js`. Every one of their ~15 callers (`world/chunkMarchingCubes.js`,
`physics/soft/fleshSph.js`/`boneField.js`, `simulation/cosmo/zeldovich.js`, `simulation/tomo/volume.js`,
`AquariumDemo.js`) runs single-resolution. `physics/mesh/manifoldCensus.mjs` already exists as a
crack/non-manifold detector and is the tool that would grade a Transvoxel port's seams. LOD-crack avoidance
*is* already solved in this tree, but only for 2.5D heightmap/planet patches — `render/screenSpaceError.js`
cites Terrain3D's "succumb to your neighbour" edge-matching trick, and `world/planetSurface.js` separately
guarantees seamless cube-sphere faces "by construction." Neither technique reaches a true 3D volumetric
isosurface, which is what caves and an overhang-capable planet body actually need.

**Aimed at, per Keith**: cave rendering (`world/terrainGenerator.js`'s `noise3D` cave-carving density field,
today meshed by `world/chunkMarchingCubes.js` as a fixed-resolution cosmetic pass over the blocky grid, not
rendered to any distance) and a planet body (a true volumetric/overhang-capable surface, as opposed to the
heightmap `render/bodyTerrain.mjs` currently draws). Both would need octree-chunked LOD with seamless
stitching to render at more than close range, which nothing here provides today.

**Not built.** If taken up: the seven lookup tables (`regularCellClass`/`Data`/`VertexData`,
`transitionCellClass`/`Data`/`CornerData`/`VertexData`) would be vendored as data — the same posture
`simulation/MarchingCubes.js`'s own header already states for Paul Bourke's tables — with the stitching
logic hand-written fresh in this tree's style and graded by `manifoldCensus.mjs` for actual watertightness
across a fine/coarse boundary, not by a picture. Worth a full round of its own rather than a quick add.

## Named candidate, not built: glTF-Asset-Generator (KhronosGroup)

Checked, not vendored, not implemented. Confirmed by fetching the actual repo (LICENSE, README, the
`Output/` tree), not just the summary: it's a Khronos-official C# tool that generates synthetic glTF 2.0
conformance assets — sparse accessors, interleaved vertex buffers, every primitive mode, skin/morph
animation, the full material matrix (metallic-roughness, specular-glossiness, alpha blend/mask,
double-sided), split into `Positive` (valid, should load) and `Negative` (deliberately invalid, should be
rejected) categories. MIT, Copyright Khronos Group.

**Two facts that matter, both confirmed rather than assumed:**
- **The generated assets are not committed in the repo.** `Output/Positive/*` and `Output/Negative/*` hold
  only per-category READMEs; the actual `.gltf`/`.glb` files ship solely as versioned release zips
  (`GeneratedAssets-0.6.1.zip`, etc.), not files `raw.githubusercontent.com` serves.
- **The licensing is materially cleaner than the other Khronos repo already vendored from here.**
  `gpu/khronosSamples.mjs` exists because `glTF-Sample-Assets` mixes licenses per model (`BrainStem` is a
  Poser EULA, `Duck` is Sony's SCEA license, `ABeautifulGame` is CC-BY-4.0 requiring attribution) and needs
  a `mayVendor()` gate that fails closed per model. `glTF-Asset-Generator`'s output is entirely synthetic
  geometry from Khronos's own MIT tool, not third-party art — one root LICENSE covers everything.

**Checked against what's here.** `gpu/fixtures/` already holds exactly this shape of fixture — two
header-only, BIN-chunk-stripped GLBs derived from Khronos's `ABeautifulGame` (22 KB/32 KB instead of
12 MB/43 MB) — and its own `PROVENANCE.md` is explicit about the limit: they prove `gpu/glbLoad.js`'s
Draco-vs-plain **routing**, and "do NOT prove decoding... the gate says so rather than letting a routing
pass read as a decode pass." That's routing coverage for one real model's two variants. Grepped for any
coverage of sparse accessors, interleaved buffers, or skin/morph edge cases in this tree's own code (not
inside `vendor/three`'s `GLTFLoader.js`, which presumably handles the spec correctly as a mature loader) and
found none. So the precise gap: nothing here exercises `gpu/GLBParser.js` / `gpu/glbLoad.js`'s own routing
and parsing logic against the feature matrix this generator exists to test, or against the negative/malformed
cases at all.

**Not built.** If taken up: pull specific fixtures from a release zip (not raw file content, per above),
strip them the same header-only way `gpu/fixtures/` already does if only routing needs exercising, or keep
them whole if decode-level coverage of `GLBParser.js`'s edge-case handling is wanted. Lower-risk than most
of this sweep — fixtures, not a technique to reimplement, and a licensing story simpler than the Khronos
repo already vendored from.

## The wider KhronosGroup org sweep

`glTF-Asset-Generator`'s own page links to nothing else (only the glTF spec repo and its own issue
tracker), so this widened to the full `KhronosGroup` org — 189 repositories as of this sweep. Most of it is
out of scope by construction: Vulkan/OpenXR/OpenCL/SYCL/ANARI/OpenVX/COLLADA/MoltenVK/SPIR-V tooling is
native-API or the wrong runtime for a browser engine, and a good third of the remainder is Blender/Unity/
3ds-Max plugins, or pure spec/registry/documentation repos with no code to port. What's actually in-domain,
checked against this tree:

- **glTF-IBL-Sampler** — the strongest find. Khronos's reference tool for generating prefiltered
  environment maps (diffuse irradiance + roughness-convolved specular) for image-based lighting. Grepped
  for IBL/prefiltered-environment/irradiance-map code anywhere in this tree's own render path and found
  nothing — confirmed absent. That absence sits right next to work that IS here: `physics/render/
  microfacetVndf-selfcheck.mjs` (VNDF importance sampling), `physics/render/energyCompensation.mjs` /
  `energyCompWgsl.mjs` (multi-scatter GGX energy compensation), `physics/render/roughDiffuse.mjs`,
  `physics/render/dielectricWalk-selfcheck.mjs` — a genuinely research-grade microfacet BRDF stack, already
  ahead of plain glTF PBR, with no environment lighting to feed it. Not built.
- **glTF-Sample-Viewer** / **glTF-Sample-Renderer** — Khronos's own PBR reference renderer (WebGL),
  implementing the glTF metallic-roughness spec exactly. Framed precisely: since this tree's microfacet
  work is already past the base glTF spec, this isn't a technique upgrade — its value is as a
  **conformance reference**, the same shape `img2threejs`'s hard-gate rule already gave
  `render/perceptual.mjs` / `render/silhouette.mjs`: does glTF-spec content render the way Khronos's own
  implementation says it should, through the vendored `GLTFLoader.js`. Not built.
- **glTF-Validator** — validates glTF/GLB against the spec. SweK exports GLB from at least
  `tools/export/sceneGlb.mjs` and `tools/export/voxelGlb.mjs` (both through `vendor/three/jsm/exporters/
  GLTFExporter.js`), and no spec-conformance check on that output was found anywhere — only that the one
  loader that made it can also read it back. Not built.
- **gltf-asset-auditor** — checks glTF attributes (polycount, texture size, etc.) against practical
  use-case limits. Relevant to the Kenney/Quaternius GLB pipeline (`ui/cityPack.js`, discussed earlier in
  this sweep) as a QA pass before assets hit the city grid, rather than finding a problem at runtime. Not
  built.
- **WebGL** (the official Khronos repo) — includes the canonical WebGL conformance test suite. An obvious
  resource for validating SweK's own WebGL2 backend, the same spirit as `gpu/khronosSamples.mjs` /
  `gpu/fixtures/` validating against Khronos assets — never checked against here. Bigger lift than the
  others above; flagged rather than sized.

**Checked and set aside, lower confidence either way:**
- `dfdutils` / `KTX-Specification` — only relevant if `gpu/gltfKtx2.js` parses KTX2's data-format
  descriptor itself; at 96 lines it almost certainly just routes to `vendor/three/jsm/loaders/
  KTX2Loader.js`, which already handles this, so likely no gap.
- `basis_universal` — already vendored, via three's own `vendor/three/jsm/libs/basis/
  basis_transcoder.{js,wasm}`. Not a new find.
- `ToneMapping` (a collection of tone-mapping operators) — no tone-mapping code found in this tree's render
  path to compare it against, so this is genuinely unconfirmed rather than a real gap.
- `glTF-InteractivityGraph-AuthoringTool` / `glTF-Test-Assets-Interactivity` — an emerging KHR_interactivity
  node-graph spec for embedding behaviour in glTF files. Interesting, speculative, no established want.
- `MaterialX` — a real, actively-used standard, but a large XML shading-graph system. A bigger idea than a
  quick candidate; noted rather than sized.

## The CesiumGS org sweep

67 repositories as of this sweep. Same shape as the Khronos org: most is out of scope by construction —
`cesium-native`/`cesium-unity`/`cesium-unreal`/`cesium-omniverse` and their samples are wrong platform, and
a large fraction is dev infra, AWS/Terraform tooling, AI-assistant scaffolding, and workshop/sandcastle
samples with no engine code to check. What's actually in-domain, checked against this tree:

- **spz / spz-loader** — the strongest find. `.spz` is Cesium/Niantic's compressed Gaussian-splat format,
  "about 10x smaller than the PLY equivalent with virtually no perceptible loss." Precise fit: `engine/
  plyWriter.mjs`'s own header says this tree "WRITES the Gaussian-splat .ply and .splat formats this tree
  has only ever READ" — real splat infrastructure already exists (`SplatRenderer`, `SplatLoader`,
  `splatSort.mjs`, `gaussianSplat.js`, `splatParser.js`) built around exactly the content `.spz` compresses,
  and grep confirmed no `.spz` support anywhere. `spz-loader` (TS/JS wrapping the reference C++ codec,
  compiled to WASM via Emscripten) fits this tree's toolchain better than most things checked in this whole
  sweep — SweK already vendors precompiled WASM artifacts (`box3d.wasm`, the terrain WASM stack), so this
  isn't the usual C++/wrong-runtime mismatch. Unconfirmed: a LICENSE file exists on both `spz` (Niantic) and
  `spz-loader` but the actual terms weren't readable from what was fetched — needs checking before anything
  is decided, same posture as the meshwalk/light-probes situation earlier in this doc. Not built.
- **meshoptimizer** (mesh simplification/LOD generation) — checked and ruled out: SweK already has this.
  `engine/quadricDecimate.js` (+selfcheck) is its own quadric-error-metric mesh decimator, same algorithm
  family. Not a gap.
- **3d-tiles** (the streaming/LOD spec) — checked and ruled out as a technique gap: `render/
  screenSpaceError.js` already drives LOD refinement by projected geometric error, the same core mechanism
  3D Tiles' `geometricError` field expresses. The only open question is data-interop (consuming
  externally-authored 3D Tiles content), not a missing capability.
- **xatlas** (UV unwrapping / lightmap chart packing) — confirmed absent by grep, no established want. Would
  matter if lightmap baking for procedural geometry (the procedural-buildings idea earlier in this
  conversation) becomes a real goal.
- **quantized-mesh** (the terrain-streaming quantization spec) — confirmed absent by grep, despite SweK
  already ingesting real-world terrain (`world/realTerrainStamp.js`, `ai-bridge/terrainBuildBridge.js`). No
  confirmed need to stream terrain over a network today.
- **gltf-pipeline** / **obj2gltf** — the one pair in this whole sweep that actually matches SweK's own
  toolchain exactly (Node.js, Apache-licensed). SweK's own GLB export already goes through three.js's
  `GLTFExporter`, so these read as a validation reference rather than a gap.
- **gdal** — the real-world geospatial library SweK's own terrain-ingestion work is conceptually adjacent
  to, but C/C++ and enormous; not something to vendor, just worth knowing the domain exists.
- **cesium-materials-pack** — old procedurally-shaded material shaders (brick/wood/noise); minor, could be
  read for technique, no strong pull.
- Set aside as wrong language/toolchain or an unneeded format: `tinygltf`, `collada-dom`, `COLLADA2GLTF`,
  `libjpeg-turbo`, `LAStools`, `glutess`, `libcitygml`, `zstr`, `xerces-c`, `webglreport`.

## An individual profile sweep: github.com/visualbruno

Different flavour from the org sweeps: a specialist in ComfyUI wrapper nodes for 3D-generation AI models,
plus several from-scratch mesh-processing research tools. Checked against source, not just descriptions:

- **AutoUV** — directly answers the xatlas gap named in the CesiumGS sweep above. MIT, Python, genuinely
  from-scratch (not a wrapper): KD-tree topology welding, bounded-curvature segmentation with exact
  normal-cone constraints, LSCM-validated chart merging, LSCM/ARAP flattening, skyline packing. Its own
  pitch — "better UV than xatlas for low-poly mesh" — fits SweK's actual asset profile (Kenney/Quaternius
  kits, procedurally-generated voxel meshes), with numbers to back it (810 disconnected components welded to
  3 in one example; ARAP drops area distortion 0.84 to 0.09). Wrong language for a direct port; a
  well-specified MIT algorithm worth reading and hand-writing if UV unwrapping becomes a real want. Not
  built.
- **Faithful Contouring (FaithC)** — a real, very recent alternative to what `physics/mesh/dualContour.mjs`
  already does. Implements a genuine Nov-2025 arXiv paper (Imperial College London et al.): operates
  directly on a raw mesh rather than converting to a distance field, to preserve sharp edges and handle
  open/non-manifold input without the surface-thickening and jagged-isosurface artifacts SDF methods
  (marching cubes, dual contouring included) are prone to — directly relevant to the exact problem
  `dualContour.mjs`'s own header discusses. **CC BY-NC 4.0 — non-commercial only**, same hard block as
  `SurceBeats/Atlas` earlier in this sweep. The published technique, not the NC-licensed code, is what's
  reachable here (the keyhunt/mmacklin posture). Not built.
- **CelloCut** — Apache 2.0, a real arXiv-published algorithm ("Constructive Watertight Remeshing via
  Tetrahedral Cell Cuts") relevant to `physics/mesh/csg.mjs` / `manifoldCensus.mjs`'s watertightness
  concerns: embeds a defective mesh into a tetrahedral cell complex and solves a graph-cut interior/exterior
  labelling, guaranteeing a watertight boundary by construction rather than by boolean-op patching. C++/CUDA
  plus CGAL/Eigen/libigl — heavy, wrong-toolchain dependency stack, clean licence, a genuinely different
  approach than ad-hoc CSG repair. Read-the-technique candidate, not built.
- **CuMesh** — MIT, but honestly a wrapper/aggregation layer (wraps `cubvh` for BVH, **wraps xatlas itself**
  for UV, adapts an edge-collapse algorithm from elsewhere) rather than a novel algorithm — lower value than
  the underlying pieces directly. Its remeshing path uses Dual Contouring, an independent confirmation that
  this tree's own choice of algorithm there is sound and production-used.
- **AutoRetopo** — PolyForm Noncommercial, same hard block as FaithC. A real, generic four-stage retopology
  pipeline (occupancy-field voxelisation, curvature-adaptive isotropic remeshing, tangential relaxation +
  closest-point snap-back) — relevant only if cleaning up AI-generated/scanned meshes becomes a real need,
  given `ai-bridge/kaggle_templates/` already generates meshes via TripoSR/InstantMesh/etc.
- **PartUV-Windows** — a Windows fork of `EricWang12/PartUV`, a SIGGRAPH Asia 2025 publication doing
  part-aware UV unwrapping (segment into semantic parts first, then unwrap per part). License unclear on
  this fork; a second data point that UV unwrapping is an active 2025 research area if ever prioritised.
- **The ComfyUI-* wrapper repos** (Trellis2, Hunyuan3D-2.1, Direct3D-S2, HY-Motion, HunyuanVideo-Foley,
  InvSR, Meshflow, Meshlib, QRemeshify, flux2fun-controlnet) — `ai-bridge/kaggle_templates/` already tracks
  several of the same underlying models (`trellis2.js`, `hunyuan3d.js`, `direct3d_s2.js`, `rig_anything.js`
  already exist) via a different orchestration path (Kaggle notebooks, not ComfyUI nodes). Confirms the
  model roster is current; the wrapper code itself isn't portable (Python, ComfyUI-specific).
- `AspNet.Security.OAuth.Providers` (C#) — unrelated to this author's graphics work, an old/separate repo.
  Ignored.

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

### isaac-mason/splatmesh -- BUILT as `physics/splat/splatMesh.mjs` (v4511)

**What it is.** MIT, (c) 2026 Isaac Mason (LICENSE read first-hand). A TypeScript library and a
three.js/Spark editor: `rasterise.ts` stamps each splat's opacity into the voxel under its
centre or into every voxel within its footprint radius, max-accumulated; `volume.ts` keeps the
density in 16-cubed chunks with per-voxel edit flags; `mesh.ts` extracts the iso-surface by
naive surface nets, plus a heightfield and a greedy mesher; the editor lets you cut and force
voxels before exporting a collider glb.

**Why it matters here.** The tree has a splat loader, scene, renderer and sorter, and a physics
module that grades the projection math and says outright that Spark stays a viewer. Nothing
gave a splat scene a collision surface. Now `physics/splat/splatMesh.mjs` does, and hands back
the shape `mesh/meshBVH.mjs` takes, so a splat scene can be raycast.

**What was taken and what was not.** The method, re-derived: centers and coverage
rasterisation with the max, and naive surface nets with the same vertex rule and the same
solid-to-empty winding. Not a byte; the volume is a sparse map rather than chunks (said in the
header: exact, slower on a million-splat scene), the footprint is the largest of the tree's
three scales per splat, and the editor, edit flags, heightfield, greedy mesher and glb export
were left where they are.

**Measured** (`tools/ship/splatMesh-selfcheck.mjs`): an analytic ball meshes watertight with
Euler characteristic 2, one vertex per straddling cell, every vertex inside its cell and
within 1.5 cells of the sphere, every triangle facing outward; a second mesher written the
other way round gives the same 1,994 vertices and 3,984 triangles on the ball and the same
4,140 and 7,856 on a rasterised cloud; a shell three cells thick meshes watertight with
Euler characteristic 4 (two closed surfaces); the BVH raycasts the collider to within a cell
of the sphere. The finding: both meshers' first drafts started the stitching pass one voxel
late and agreed on a mesh with 122 boundary edges. A twin written the same way round proves
nothing about that step; the watertight hold caught it.

### isaac-mason/three-spark-light-probes -- TECHNIQUE ONLY as `render/splatProbes.mjs` (v4513)

**What it is.** NO LICENSE FILE. The tree at commit 27cadd2 (2026-08-06) has no LICENSE,
LICENSE.md or COPYING; `package.json` says `"license": "MIT"` and names Isaac Mason. A
manifest field without the text beside it is not a grant, so this is recorded UNPAPERED in
`world/reachedLicences.mjs` under the same rule as ZachSaucier/Asset-Loading-Effects, and
nothing of its source was read into the tree. What its README describes: a box fitted to the
splat scene's occupancy, a dense probe grid through it at a fixed spacing, six cube-face
renders per probe folded by three's LightProbeGenerator into order-2 spherical harmonics, the
nine RGB coefficients packed across seven RGBA sub-volumes of one Data3DTexture, and a material
that samples the volume per fragment by world position.

**Why it matters here.** A splat scene could be looked at (the loader, scene, renderer and
sorter) and, since v4511, walked into; it still lit nothing around it. An irradiance volume is
how an ordinary mesh standing in a splat scene takes its ambient colour.

**What was built and from what.** `render/splatProbes.mjs`, from the published forms only:
the nine real SH basis functions in the tree's own order (splatParser puts Y00 first), the
exact per-texel solid angle of a cube face, Ramamoorthi and Hanrahan's projection and their
clamped-cosine convolution, a probe grid with probes on the box corners, trilinear
interpolation clamped to the grid, a seven-plane packing whose layout is this file's own, and
a nearest-hit ray-versus-sphere radiance over a splat cloud as the bake source. Not built:
the device-side sampler (the packed planes are the shape a 3D texture takes; no lit pipeline
reads one yet), the occupancy fit, any page.

**Measured** (`tools/ship/splatProbes-selfcheck.mjs`): the faces cover 4 pi at every size and
the basis is orthonormal under them; a constant radiance projects to L sqrt(4 pi); one lit
face to (2 pi / 3) c0 exactly and to the reduced integrals of z and z^2 within 1e-6; a
gradient to (c1 / 2)(4 pi / 3); a constant's irradiance is pi L in every normal; the lit
face's irradiance by SH is 0.80 % from the direct cosine integral, which is order-2
truncation and is said; the packing round-trips exactly in Float32. The finding: flipping
the sign of one basis function left every symmetric closed form green. A sign is invisible
to a symmetric radiance, so the gate projects an x ramp and a y ramp on purpose.

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

Restated after the second pass and the org sweeps below it: the split held every time it was
tried again. splatmesh, three-spark-light-probes, buildingGrammar and asciiShape all shipped
because each had a right answer a gate could fail; kugiri, Faithful Contouring and AutoRetopo
were read and not taken because a licence or a missing target stopped them, not because the
technique was wrong. The registers (`world/reachedLicences.mjs`, `world/vendoredLicences.mjs`)
are worth checking first now — they no longer come back empty.
