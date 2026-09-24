# gpu/fixtures — where these bytes came from, and what they are not

## What is here

Two files, both derived from **A Beautiful Game** in the Khronos glTF-Sample-Assets repository:

| file | derived from |
|---|---|
| `ABeautifulGame-draco.header.glb`  | `Models/ABeautifulGame/glTF-Binary-KTX-ETC1S-Draco/ABeautifulGame.glb` |
| `ABeautifulGame-plain.header.glb`  | `Models/ABeautifulGame/glTF-Binary/ABeautifulGame.glb` |

## What they ARE NOT: models

Neither file is loadable, and that is on purpose. Each is the original GLB's **12-byte header and its
genuine JSON chunk, with the BIN chunk removed** — 22 KB and 32 KB instead of 12 MB and 43 MB. The JSON
still declares buffers whose bytes are not present, so any real loader will and should refuse them.

They exist for `gpu/glbLoad.js`, which decides *which loader a file needs* by reading the JSON chunk and
nothing else. A fixture carrying the real JSON chunk therefore exercises the routing code path exactly as
the full file would, offline, with no network and no 55 MB in the repository.

## What they prove, and the limit

They prove **routing** against a real file's real declarations: that a genuinely Draco-compressed GLB, with
`KHR_draco_mesh_compression` in `extensionsRequired` and 15 of 15 primitives compressed, routes to the Draco
path — and that the *same model's* plain variant, with the same 15 primitives, routes to the plain parser.
Until v4175 the dracoWeld gate had to state that no such file existed in this tree to check against.

They do **not** prove decoding. That still needs the full 12 MB and a browser, and the gate says so rather
than letting a routing pass read as a decode pass.

## Licence

**A Beautiful Game is CC-BY-4.0**, which permits redistribution *and requires attribution*, so the credit
travels with the bytes:

> A Beautiful Game — original model by the **MaterialX Project** (owner: ASWF, 2020); conversion to glTF by
> **Ed Mackey** (2022). Licensed CC-BY-4.0: https://creativecommons.org/licenses/by/4.0/legalcode
> Source: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ABeautifulGame

Verified by reading `Models/ABeautifulGame/LICENSE.md` and `metadata.json`, not assumed from the fact that
Khronos published it. That assumption is false for other models in the same repository — `BrainStem` is
under a Poser EULA and `Duck` under Sony's SCEA Shared Source License — which is why
`gpu/khronosSamples.mjs` records postures per model and its `mayVendor()` fails closed.

## `fbxIngest.ascii.fbx` — task #44, the FBX ingest round

A third file, added when `gpu/fbxLoad.js` and `gpu/gpuAssetLoader.js`'s `.fbx` path were wired up. This one
is **not derived from anything** — it is a hand-authored, plain-ASCII FBX 7.4 file, written directly against
`vendor/three/jsm/loaders/FBXLoader.js`'s own `TextParser`/`FBXTreeParser`/`GeometryParser` source (the
grammar, the `Vertices`/`PolygonVertexIndex` encoding including the bitwise-NOT end-of-polygon marker, the
`LayerElementNormal`/`LayerElementUV` mapping/reference types, and the `Connections` `C: "OO", geomID,
modelID` wiring that makes a `Geometry` node resolve to a `Model`) rather than exported from any tool or
copied from any sample.

That is **the point, not a shortcut**: the same third-party-FBX licensing question `ABeautifulGame` raised
for GLB applies at least as sharply to FBX, where the common test fixtures the whole ecosystem reaches for —
Mixamo exports, most game-asset-marketplace samples, and three.js's own
`examples/models/fbx/Samba Dancing.fbx` — are frequently Adobe/Mixamo-sourced under terms separate from
three.js's own MIT license and not confirmed redistributable by this repository's owner. Writing the bytes
instead of sourcing them removes the question entirely: there is no license to verify because there is no
external content.

The fixture is two triangles sharing an edge (the same quad shape `tools/ship/dracoEncode-selfcheck.mjs`'s
own `QUAD` fixture uses: control points `(0,0,0) (2,0,0) (0,2,0) (2,2,0)`, triangles `[0,1,2]` and `[1,3,2]`),
carrying per-corner normals (`(0,0,1)` — the quad's flat-plane normal) and per-corner UVs, so
`gpu/fbxLoad.js`'s normal and UV paths are exercised and not only positions. It has no skin and no
animation on purpose — this round's normal/UV/position path is verified against a committed, repo-owned
fixture, while the skinned+animated code path was instead spot-checked **once, informally, locally,
uncommitted** against three.js's own `Samba Dancing.fbx` (downloaded to a scratch directory outside this
repository, never staged, deleted immediately after the check). That gap is closed by `fbxAnim.ascii.fbx`,
below (task #59) — see that entry, and `tools/ship/fbxIngest-selfcheck.mjs`'s header, for what is proven now
and what still isn't.

`tools/ship/fbxIngest-selfcheck.mjs` round-trips this file through the real pipeline (HEAD-probe →
`GPUAssetLoader._loadFBX` → `gpu/fbxLoad.js`'s `parseFbx`/`normalizeFbxGroup` → `_uploadParsedMesh`) in a
real headless-Chromium page, via `tools/ship/webgpuHarness.mjs`'s `runInEngineOrigin`, and asserts exact
measured vertex/index/normal/UV counts against it — not "it loaded", specific numbers.

## `fbxAnim.ascii.fbx` — task #59, the deferred animation-mapping round

A fourth file, added when `gpu/fbxLoad.js`'s `mapFbxAnimations()` mapped FBX animation clips into
GLBParser's `animations` shape (round 2, task #44, shipped skin/joint extraction but left `animations: null`
unconditionally — a named gap, not an oversight, because no committed license-clean rigged+animated fixture
existed to check it against). Same discipline as `fbxIngest.ascii.fbx` above, for the same reason: hand-
authored, plain-ASCII FBX 7.4, written directly against `vendor/three/jsm/loaders/FBXLoader.js`'s
`DeformerParser` (`parseDeformers`/`parseSkeleton`, the `Skin`/`Cluster` `Deformer` node shapes and their
`Indexes`/`Weights`/`TransformLink` sub-properties) and `AnimationParser` (`parseAnimationCurveNodes`/
`parseAnimationCurves`/`parseAnimationLayers`/`parseAnimStacks`, and the `Connections` wiring between
`AnimationCurve` → `AnimationCurveNode` → `AnimationLayer` → `AnimationStack`, plus the `"OP"`
curve-node-to-Model property connection) — confirmed by reading that source directly, then iterated against
the real headless-Chromium harness (`tools/ship/webgpuHarness.mjs`'s `runInEngineOrigin`) until FBXLoader
produced a populated `SkinnedMesh`/`Skeleton` and a non-empty `group.animations`, rather than trusted from
the grammar alone.

**What it is:** the smallest rig that exercises skin and animation together, not a realistic character. Two
bones — a root at the origin and a child offset `(0, 1, 0)` — and the same quad `fbxIngest.ascii.fbx` uses,
skinned to them with no blending (the quad's bottom edge, control points 0 and 1, weighted 100% to the root;
the top edge, control points 2 and 3, 100% to the child). One animation clip, `"TestClip"`, with a single
`QuaternionKeyframeTrack` rotating the child bone 0 → 90 degrees about X over 1 second (2 keyframes, LINEAR
interpolation — the only interpolation FBXLoader's own `AnimationParser` ever produces).

**What it proves, and the limit:** `tools/ship/fbxIngest-selfcheck.mjs` section 6 round-trips this file
through the exact same shipped pipeline as `fbxIngest.ascii.fbx`, and asserts exact measured values — node
names and their pre-order indices, `skin.joints`, the full `skinIndex`/`skinWeight` GPU attribute contents,
the clip's name/duration, its sampler's times/values/interpolation, and its channel's `targetNode`/`path` —
each hand-derived from the fixture's own authored numbers (see that gate's own comments for the derivation,
including the float64→float32 rounding of the quaternion values). This closes the specific gap task #44's
gate named: skin extraction and animation mapping are now proven **together**, on one committed fixture, not
assumed compatible or checked once informally on a file nobody can re-run. It does **not** prove
`preRotation`/`postRotation` handling, non-default Euler rotation orders, a `VectorKeyframeTrack`
(position/scale) channel, or more than one clip in a file — `fbxAnimAdvanced.ascii.fbx`, below (task #59,
closed this round), closes those. CUBICSPLINE interpolation is a separate matter, not a gap — see that
entry's own note.

## `fbxAnimAdvanced.ascii.fbx` — task #59, closed this round: the gaps `fbxAnim.ascii.fbx` left named

A fifth file, added when `fbxAnim.ascii.fbx`'s own remaining named gaps — `preRotation`/`postRotation`
composition, a non-default Euler rotation order, `VectorKeyframeTrack` (position/scale) channels, and
multiple `AnimationStack`s in one file — were closed. Same discipline as the other four: hand-authored,
plain-ASCII FBX 7.4, written directly against `vendor/three/jsm/loaders/FBXLoader.js`'s `AnimationParser`
source (`generateRotationTrack`, `generateVectorTrack`, `parseAnimationCurveNodes`, `parseAnimationLayers`,
`parseAnimStacks`, and `getTransformData`/`getEulerOrder` for how `PreRotation`/`PostRotation`/
`RotationOrder` reach a track) — confirmed by reading that source directly, then run against the real
headless-Chromium harness before being trusted (it passed first try; that is not a licence to skip the real
run next time, only this round's actual result). Unlike `fbxAnim.ascii.fbx`, this fixture carries **no
geometry and no skin at all** — `gpu/fbxLoad.js`'s `mapFbxAnimations()` reads `group.animations` up front,
independent of whether a mesh is found (see that file's `normalizeFbxGroup()`), so a mesh-less file is a
smaller, more isolated way to exercise the animation-mapping code specifically, without also re-proving skin
extraction `fbxAnim.ascii.fbx` already covers.

**What it is:** two `LimbNode` bones, `root` and `mover`, with no parent/child relationship between them
(both attach directly to the scene root) and no `Mesh`/`Geometry` object anywhere in the file. `root`'s
`Properties70` carry `RotationOrder` (enum `5`, `"XYZ"` — FBXLoader's `getEulerOrder()` table, NOT the
implicit default when the property is absent, which is enum `0`, `"ZYX"`), `PreRotation` (`30,0,0` degrees)
and `PostRotation` (`0,45,0` degrees). Two `AnimationStack`s (clips):

- `"ClipA"` — `root`'s rotation (`QuaternionKeyframeTrack`, 2 keyframes, a single-axis animated Euler value
  of `(0,0,0)` → `(60,0,0)` degrees composed through the non-identity preRotation/postRotation/RotationOrder
  above) and `mover`'s position (`VectorKeyframeTrack`, 2 keyframes, `(0,0,0)` → `(5,-3,2)`).
- `"ClipB"` — `mover`'s scale (`VectorKeyframeTrack`, 2 keyframes, `(1,1,1)` → `(2,1,0.5)`), in its own
  `AnimationLayer`/`AnimationStack`, separate from `ClipA`'s.

**What it proves, and the limit:** `tools/ship/fbxIngest-selfcheck.mjs` section 7 round-trips this file
through the same shipped pipeline and asserts exact measured values for both clips: names, durations,
sampler times/values/interpolation, and channel `targetNode`/`path`, including that the two clips are
distinct entries in `mapFbxAnimations()`'s output with non-overlapping channels. The composed rotation
quaternions are checked against an **independent three.js Quaternion/Euler script** (mirroring
`generateRotationTrack`'s own composition — `Quaternion.setFromEuler` per keyframe, then
`.premultiply(preRotationQuat)`, then `.multiply(postRotationQuat.invert())`, all three built from
`vendor/three/three.module.js`'s own classes, not from this repository's arithmetic) rather than by hand —
see that gate section's own comments for the exact script and its output. It does **not** prove morph-target
(`DeformPercent`) animation tracks (`mapFbxAnimations()` deliberately skips these — see its own comment in
`gpu/fbxLoad.js`) or a rotation curve whose per-axis span exceeds 180 degrees between keyframes (FBXLoader's
`interpolateRotations()` switches to a slerp-subdivided sub-interval path above that threshold — a
genuinely different code path this fixture's small single-axis 60-degree span never reaches).

CUBICSPLINE interpolation is not attempted here either, and deliberately not a gap: FBXLoader's own
`AnimationParser` never calls `.setInterpolation()` on any track it builds (confirmed by reading that class
in full), so every track it can produce carries `KeyframeTrack`'s class default, `InterpolateLinear` — no
FBX file, however constructed, could make the currently-vendored loader emit anything else. A missing
CUBICSPLINE fixture is not an open item to close; it would need a patched or newer `FBXLoader` to even be
reachable.

## `regressionTri.glb` — same round as `fbxIngest.ascii.fbx`, the GLB-side regression fixture

Also self-authored, but by code rather than by hand: `tools/export/voxelGlb.mjs`'s own `writeGlb()` (the
same writer `tools/ship/voxelGlb-selfcheck.mjs` grades) generating two triangles with positions, normals and
per-vertex colors. No third-party bytes, so the same "no license to verify" reasoning as the FBX fixture
above applies. Its job is narrower than proving a GLB loads: `_loadGLBFromBytes` was refactored this round to
extract everything after `GLBParser.parse()` into a new `_uploadParsedMesh(name, parsed, opts)` method (so
`gpu/fbxLoad.js`'s FBX path can reuse the same GPU-upload code `GLBParser.parse()`'s GLB path already had),
and this fixture is what proved that refactor changed nothing: loaded through
`GPUAssetLoader.loadAsset()` in a real WebGL2 context, byte-for-byte identical — every returned field
including actual `gl.getBufferSubData()` readback of the VBO/IBO/NBO contents, not just their existence —
both immediately before the refactor (`git stash` on `gpu/gpuAssetLoader.js` alone, HEAD's version) and
after. `tools/ship/fbxIngest-selfcheck.mjs` re-runs the "after" half of that as a standing regression check,
pinned to the values that comparison measured.

## `SimpleSparseAccessor.glb` — task #7, glTF conformance fixtures (sparse accessors)

A sixth file, added when `gpu/GLBParser.js`'s own `_readAccessor()` was found to silently ignore
`accessor.sparse` entirely (zero occurrences of `sparse` anywhere in that file before this round) —
returning the UNPATCHED base array for any accessor that combines a real `bufferView` with `sparse`
overrides, no throw and no warning, just the wrong numbers. Unlike the other fixtures in this file, this one
is **not self-authored and not a header-only strip** — it is the FULL, complete, working Khronos
glTF-Sample-Assets model **"Simple Sparse Accessor"**, converted from its original `.gltf` + `.bin` pair into
a single `.glb` container via this tree's own `tools/export/voxelGlb.mjs`'s `packGlb()` (the same packer
`sceneGlb.mjs`/`voxelGlb.mjs` already use, so no second, independently-spelled GLB-assembly routine exists) —
the JSON's `buffers[0].uri` was dropped and the original `.bin` bytes embedded as the GLB's own BIN chunk,
byte-for-byte, at the SAME internal byte offsets the source model's own `bufferViews` already declare, so
nothing about the accessor data itself was touched.

**Why full, not header-only.** `ABeautifulGame-*.header.glb`, above, proves ROUTING against a real file's
real declarations, and is deliberately unloadable — the BIN chunk is removed, so the model's `buffers`
declare bytes that are not present. Sparse-accessor DECODING is exactly the thing a header-only fixture
cannot prove: there is nothing to decode without the real BIN chunk, sparse index/value sub-buffers
included. At 284 bytes of BIN data (1,056 bytes total, GLB-packed) there was no size reason to strip it
either — the whole reason `ABeautifulGame` needed stripping (55 MB raw) does not apply to a fixture this
small.

**What it is**, read directly off the model's own JSON: a flat 2×7 vertex grid (`POSITION`, accessor 1, 14
vertices, `VEC3`/`FLOAT`, `bufferView` 1) forming two rows along X (`y=0` and `y=1`, `z=0` throughout) before
any sparse patch, indexed into 12 triangles (accessor 0, `bufferView` 0). The `POSITION` accessor's own
`sparse` object overrides 3 of the 14 vertices — indices `[8, 10, 12]` (all in the `y=1` row) — with new
values `[[1,2,0], [3,3,0], [5,4,0]]` (`bufferView` 2 for the `UNSIGNED_SHORT` indices, `bufferView` 3 for the
`FLOAT` values, both hand-decoded directly from the raw BIN bytes before writing the gate, not assumed from
the JSON's own `max`/`min`). The accessor's own declared `max: [6,4,0]` only becomes true once the sparse
patch is correctly applied — the unpatched base data's own real max is `[6,1,0]` — which is itself a live,
spec-provided regression check: a reader that ignores `sparse` produces geometry the file's own JSON says is
wrong.

**Licence.** CC-BY-4.0, per `Models/SimpleSparseAccessor/LICENSE.md` and `metadata.json` in the
glTF-Sample-Assets repository (read directly, not assumed from Khronos publishing it — the SAME discipline
`ABeautifulGame`'s own entry above already applies, and the same repository `BrainStem`/`Duck` are NOT
CC-BY-4.0 in, which is exactly why this check is never skipped):

> Simple Sparse Accessor — by **Marco Hutter** (https://github.com/javagl/), 2017. Licensed CC-BY-4.0:
> https://creativecommons.org/licenses/by/4.0/legalcode
> Source: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SimpleSparseAccessor

**What it proves, and the limit.** `tools/ship/gltfConformance-selfcheck.mjs` parses this fixture through the
real, shipped `GLBParser.parse()` and asserts the exact patched position array — all 14 vertices, not just
the 3 sparse-overridden ones — against the hand-decoded indices/values above. It proves the
`bufferView`-present-AND-`sparse` shape specifically; the OTHER spec-valid shape (`bufferView` entirely
omitted, base implicitly all-zero) has no small Khronos sample fixture and is instead exercised with a
synthetic, inline-constructed accessor built directly in the gate itself (no file, no license question — the
same "no bytes to license" reasoning `fbxIngest.ascii.fbx` and `regressionTri.glb` already state). It does
not prove sparse accessors combined with `byteStride` (interleaved) bufferViews, or sparse on a non-`FLOAT`
componentType — named as the honest remaining scope for whichever round widens this file's own feature
matrix next, not silently assumed covered.

## `autoRigUnrigged.glb` — task #38/#39, the auto-rig-wiring fixture

Self-authored, hand-built directly against the glTF 2.0 container spec (not through `writeGlb()`, which does
not emit `NORMAL`/`TEXCOORD_0`/image accessors) — see `tools/ship/trellisAutoRig-selfcheck.mjs`'s own header
for the generator script's shape, reproduced in that gate's comments. A single mesh, single primitive, 12
vertices (a vertical 2-column "ladder" spanning y=0..26, x=-1..1, z=0 — chosen to match
`rig/templates/kaijuBiped.js`'s `KAIJU_BIPED_RIG` bone span so the gate's force-skin assertions bind to
geometrically sensible bones), with `POSITION`, `NORMAL`, `TEXCOORD_0`, and an embedded 2x2 checkerboard PNG
base-color texture (encoded with `tools/ship/pngWrite.mjs`'s own `encodePNG`, already vendored in this tree
for exactly this kind of self-authored fixture). Deliberately carries **no** `JOINTS_0`/`WEIGHTS_0`/skin/
animations — that is the entire point: it is shaped exactly like a Trellis-generated GLB
(`ai/ComfyUIClient.js`'s image-to-3D pipeline), which lands with geometry but no skeleton. No third-party
bytes anywhere, same "no license to verify" reasoning as the fixtures above.

## `fbxMultiMaterial.ascii.fbx`, `fbxEmbeddedTexture.ascii.fbx`, `fbxMorphTarget.ascii.fbx`, `fbxRotation180.ascii.fbx` — the round that closed `fbxAnimAdvanced.ascii.fbx`'s own remaining gap list

Four more files, added when the four gaps `fbxAnimAdvanced.ascii.fbx`'s entry above named as still open —
multi-mesh/multi-material concat, embedded-texture extraction, morph-target (`DeformPercent`) animation
tracks, and a rotation curve spanning >=180 degrees between keyframes — were closed. Same discipline as all
five fixtures above: hand-authored, plain-ASCII FBX 7.4, written directly against
`vendor/three/jsm/loaders/FBXLoader.js`'s own source (this round read `GeometryParser`'s
`parseMaterialIndices`/`genGeometry` for the `LayerElementMaterial` → `geo.groups` pipeline,
`DeformerParser`/`AnimationParser` for the `Shape`/`BlendShapeChannel`/`BlendShape` connection chain and the
`DeformPercent` curve's own connection path, and `interpolateRotations` for the >=180-degree slerp-subdivision
loop) — each confirmed against the real headless-Chromium harness before any gate assertion was written, not
trusted from the reading alone. No third-party bytes anywhere, same reasoning as every fixture above.

- **`fbxMultiMaterial.ascii.fbx`** — the same two-triangle quad as `fbxIngest.ascii.fbx`, split into two
  materials via `LayerElementMaterial` (`MappingInformationType: "ByPolygon"`,
  `ReferenceInformationType: "IndexToDirect"`, `Materials: *2 { a: 0,1 }`): triangle 0 → `Material::matA`,
  triangle 1 → `Material::matB`. `tools/ship/fbxIngest-selfcheck.mjs` section 8 proves `normalizeFbxGroup()`'s
  `primitiveRanges` comes back as exactly the two triangle-sized ranges FBXLoader's own `genGeometry()` derives
  from that layer, with `materialIdx` 0 then 1 in the order the fixture's `Connections` block lists the two
  materials — not assumed, traced against this exact fixture (see that section's own comments).
- **`fbxEmbeddedTexture.ascii.fbx`** — the same quad, one material, one embedded base64 PNG (a hand-built,
  original 2x2 RGB image — red/green/blue/white corners, encoded with `tools/ship/pngWrite.mjs`'s
  `encodePNG`, the same helper `autoRigUnrigged.glb` above uses) in a `Video` node's `Content`, bound to the
  material's `DiffuseColor` slot via a `Texture` node. Section 9 proves the full path — `parseFbx()`'s
  `LoadingManager` wait, `createImageBitmap()`, and the real `gl.texImage2D` upload — by reading the actual GL
  texture back with `gl.readPixels()` and asserting it matches the fixture's authored pixels exactly, plus a
  second check (9b) that omitting the `LoadingManager` (any caller written before this round) still works
  safely: no throw, `texture` stays `null`, reproducing v1-v3's behavior rather than breaking it.
- **`fbxMorphTarget.ascii.fbx`** — the same quad, one `Shape` blend target (`"bulge"`, a uniform `(0,0,1)`
  delta at all 4 control points) wired through a `BlendShape`/`BlendShapeChannel` deformer chain, animated by
  a `DeformPercent` curve sweeping 0 → 100 over one second. Section 10 proves both halves together: the static
  delta extraction (`readFbxMorphTargets()`, matching `GLBParser.js`'s own `_readMorphTargets` shape) and the
  animation-curve routing (`mapFbxAnimations()`'s `MORPH_TRACK_RE` branch, producing a `morphChannels` entry
  rather than a regular TRS channel) — against exact measured values, including the `/100` scaling FBXLoader's
  own `generateMorphTrack` performs before this file ever sees the sampler values.
- **`fbxRotation180.ascii.fbx`** — the same quad plus a separate, unskinned `LimbNode` (`"spinner"`) rotating
  0 → 270 degrees about X over one second — a span FBXLoader's own `interpolateRotations()` subdivides via
  slerp before the track ever reaches this repo's code. This fixture needed **no code change** in
  `gpu/fbxLoad.js` (see that file's header and `tools/ship/fbxIngest-selfcheck.mjs` section 11 for why); it
  exists purely to prove faithful pass-through, and its own construction surfaced a genuine, if surprising,
  quirk of the currently-vendored loader: `interpolateRotations()`'s subdivision loop
  (`for (let t = 0; t < 1; t += 1 / numSubIntervals)`) never emits a sample at `t = 1`, so with a 270-degree
  span (`numSubIntervals = 1.5`) the fixture's own authored final keyframe value never appears in the output
  track at all — the last sample is a partial (t≈0.667) interpolation, not the full 270-degree end state.
  Section 11 measures this directly (comparing `normalizeFbxGroup()`'s sampler against FBXLoader's own raw
  `group.animations` track from the same parse) rather than hand-deriving what a "clean" subdivision should
  produce, because what the vendored loader actually produces is the only thing worth proving pass-through
  against.

**What is still not proven after this round**, named plainly rather than silently: narrower
`LayerElementMaterial` mapping types (`ByPolygonVertex`/`ByVertice`/`AllSame`) and more than one separate Mesh
Model in a file; non-`DiffuseColor` texture slots (bump/normal/emissive/specular/alpha) and external (non-
embedded) texture references; more than one morph target on a mesh, or morph targets combined with skin. The
"mixed skin scope" simplification's real severity, understated by an earlier, softer wording of this note, is
fixed as of `fbxMixedSkinScope.ascii.fbx` below — see that entry.

## `fbxMixedSkinScope.ascii.fbx` — the round that fixed the mixed-skin-scope risk an earlier round's own adversarial review found

A tenth file, added when an adversarial review of the four-gap-closure round above (`fbxMultiMaterial.ascii.fbx`
et al.) found that the pre-existing "mixed skin scope" simplification was a REAL, silent production risk that
round's own multi-mesh support made reachable for the first time, not merely a narrower named behavior: a
secondary mesh bound to a synthetic joint 0 inherited joint 0's ENTIRE ANIMATED MOTION at render time, so a
static prop bundled in the same file would visibly swing with a character's root-bone animation, and a mesh
meant to follow a different bone would visibly detach from it. Same discipline as every fixture above: hand-
authored, plain-ASCII FBX 7.4, no third-party content, this time written directly against `gpu/
SkeletalAnimator.js`'s own real-time joint-matrix computation (confirmed by reading that file directly, not
assumed) to design a fix that mirrors `gpu/GLBParser.js`'s own PRIMARY `unskinnedPrims` strategy — registering
a secondary mesh's own node as a new joint with an identity inverse-bind matrix, rather than that file's older
fallback of baking a parent-chain-relative offset.

**What it is:** the same 2-bone skinned quad as `fbxAnim.ascii.fbx` (root at the origin, child offset
`(0,1,0)`), but with BOTH bones now animating INDEPENDENTLY — root 0 → 90 degrees about X (so joint 0, root's
position in `skin.joints`, genuinely animates) and child ALSO 0 → 90 degrees about Y, its own separate curve
on a separate axis — plus TWO plain, unskinned secondary meshes: `"propMesh"` (a small quad offset to
`x=10..12`) with no parent-Model connection, so FBXLoader attaches it directly to the scene root, unrelated to
any bone; and `"attachMesh"` (a small unit quad) WITH a parent-Model connection to `"child"`, a genuine bone
attachment (e.g. a held item meant to track a wrist).

**What it proves, and the limit:** `tools/ship/fbxIngest-selfcheck.mjs` section 12 proves the fix through the
shipped pipeline (`skin.joints` comes back `[3, 4, 2, 5]` — root, child, then propMesh's and attachMesh's OWN
nodes each appended as a new joint, rather than either being silently absent from `skin.joints` and bound to
existing joint 0, v4's bug) and at RENDER TIME, two ways: propMesh's 6 corners come back EXACTLY their
authored coordinates at the clip's midpoint (not dragged by root's rotation), and attachMesh's 6 corners match
an INDEPENDENT three.js oracle (a plain root/child/attach `Object3D` chain, real `Quaternion.setFromAxisAngle`,
no `FBXLoader`/`normalizeFbxGroup` involved) EXACTLY — correctly tracking CHILD's own Y-rotation composed with
root's X-rotation, not merely root's rotation alone (what the old joint-0-only binding would give). The
attachMesh half was added specifically because an adversarial review of this fix's first draft named
"correctly follows a different bone" as the more discriminating, still-untested scenario next to "stays
static" — the oracle values were built and cross-checked BEFORE being written into the gate, after a first
hand-trigonometry attempt at them had its own rotation-order mistake (caught by the cross-check, not shipped).
The `SHADER_JOINT_LIMIT`-exceeded fallback path (walking the real parent chain for the nearest existing joint
ancestor and baking the relative transform) is proven separately and directly — see
`tools/ship/fbxIngest-selfcheck.mjs` section 13, a synthetic 65-joint graph built in plain Node with no FBX
file at all (this fixture only carries 2 real joints). That fallback's first draft had a genuine math bug an
adversarial review caught (baking an ancestor-relative delta double-applies the ancestor's own inverse-bind
matrix and silently drops its accumulated world offset, wrong even at rest pose); section 13 regression-gates
the corrected formula directly. Not proven anywhere: a `SkinnedMesh` bound to a genuinely different skeleton
than the reference, which now takes the same new-joint path (no longer dragged by a foreign character's
motion) but loses its OWN internal multi-bone deformation, a real, narrower, named remaining gap.
