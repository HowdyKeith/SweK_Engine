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
