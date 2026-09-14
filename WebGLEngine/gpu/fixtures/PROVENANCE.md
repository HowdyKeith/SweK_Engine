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
animation, which is consistent with `gpu/fbxLoad.js`'s own header: this round's normal/UV/position path is
verified against a committed, repo-owned fixture; the skinned+animated code path was instead spot-checked
**once, informally, locally, uncommitted** against three.js's own `Samba Dancing.fbx` (downloaded to a
scratch directory outside this repository, never staged, deleted immediately after the check) — see
`tools/ship/fbxIngest-selfcheck.mjs`'s own header for exactly what that check did and did not prove, and why
its numbers are not repeated here as a repo-verified claim.

`tools/ship/fbxIngest-selfcheck.mjs` round-trips this file through the real pipeline (HEAD-probe →
`GPUAssetLoader._loadFBX` → `gpu/fbxLoad.js`'s `parseFbx`/`normalizeFbxGroup` → `_uploadParsedMesh`) in a
real headless-Chromium page, via `tools/ship/webgpuHarness.mjs`'s `runInEngineOrigin`, and asserts exact
measured vertex/index/normal/UV counts against it — not "it loaded", specific numbers.

## `regressionTri.glb` — same round, the GLB-side regression fixture

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
