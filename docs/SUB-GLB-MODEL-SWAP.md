# Sub .glb model swap -- DESIGN NOTE (2026-11-01, nothing built)

Asked for by Keith on 2026-10-30, held until after the v4906-v4908 publishes: let a submarine in the Sub Aquarium wear a free
.glb submarine (Sketchfab or anywhere) instead of the procedural hull. This note is written BEFORE code, from reading
ev/esShipModels.js, ev/esShipModelsCore.js, render/subAquarium3d.mjs, render/subBallastCues.mjs, ui/seaDepthTint.mjs and
physics/mechanics/subHulls.mjs. It says what is reusable, what is not, the choices that are Keith's, a gate plan and the phases.
Everything below that says "found" was read in the code; everything that says "unchecked" was not run.

## 1. What already exists, and what it does NOT do

The aircraft (ui/planeMeshLayer.js) and ships (ev/esShipModels.js on the pure ev/esShipModelsCore.js) already take a per-class
.glb. The ship version, which is the one to copy:

- `esShipClass(ship)` classifies into a small fixed set (raider, marauder, corsair, unknown); `makeModelStore(storage)` keeps
  `{ url, yaw }` per class under localStorage key `swek.esShipModels.v1` (storage injected, so the gate runs headless); a bad
  class or a bad yaw is refused; yaw snaps to 0/90/180/270.
- `mountShipModels()` loads with GLTFLoader, caches one template per url+yaw, and `hullFor()` returns a Group that holds the
  PROCEDURAL hull immediately and swaps the clone in when the load finishes (a failed load silently keeps the procedural hull).
- The picker (`buildPicker`) takes a URL, a datalist of /assets/list, a local file, a yaw and an "Assign" button.

What it does NOT do, and a submarine needs:
1. **Size.** It scales every model so its LARGEST DIMENSION is 2.2 units ("~unit size"). A sub drawn at HULL_LENGTH = 16 needs the
   LENGTH scaled to 16 (a conning tower makes the tallest dimension the wrong one, and a sub is long, not round).
2. **Orientation.** It corrects yaw about the vertical only. Downloaded subs are very often Z-up or nose along -Z or +Y; a yaw
   cannot fix those.
3. **Materials.** `tpl.clone(true)` SHARES geometry and materials between clones. A sub needs its own material per boat (a hue
   to tell the boats apart; the depth tint's uniforms live on the material).
4. **Moving parts.** A ship hull has none. A sub's procedural hull animates stern planes and rudder from the pilot's command.
5. **Cues.** Nothing in the ship path puts a gauge or a ballast slab on the model.
6. **Licence.** Nothing records who made a model or under what terms.
7. **Draco -- CORRECTED the same day I wrote this.** I first wrote that the tree could not load a Draco-compressed .glb, because
   vendor/three/jsm/loaders holds GLTFLoader, KTX2Loader and a meshopt decoder and no DRACOLoader. That was wrong: the tree has
   `vendor/draco/DRACOLoader.js` (mrdoob/draco.js, 256 KB, decoder inside, vendored unmodified at v4416) and `gpu/gltfDraco.js`, whose
   `parseGlb(buffer, GLTFLoaderCtor)` peeks the GLB header (gpu/glbPeek.mjs `needsDraco`) and attaches the decoder lazily ONLY for a Draco
   file, so a plain model never fetches it. It is gated (tools/ship/dracoWeld-selfcheck.mjs, dracoEncode-selfcheck.mjs, the latter
   including a decode in a real browser). So nothing needs vendoring; the sub path must load through `parseGlb` (fetch the bytes,
   then parse) and not through `GLTFLoader.load`, which is what the ship path does and which dies on "No DRACOLoader instance provided".

## 2. What the sub view does today (render/subAquarium3d.mjs), as it constrains the swap

- `buildSub(THREE, material, geo)` makes a Group in the hull frame (nose +X, up +Y, vessel left +Z, rotation order YZX): an
  ellipsoid hull of L x R x R (L = HULL_LENGTH = 16, R = 0.28 L), a tower, a periscope, a stern-plane box and a rudder box each
  on a hinge at x = -0.69 L, chord 0.25 L. `group.userData.parts = { hull, tower, scope, planes, rudder }`.
- `poseFins(group, cmd)` writes `parts.planes.rotation.z` and `parts.rudder.rotation.y` from the command (finAngles, the physics'
  own signs and the EXPLORER's finMax). It REQUIRES `parts`; a model without it would throw.
- `attachCues` adds a ballast gauge (frame + fill, at x = -0.1 L, y = +1.55 R) and a drop-weight slab (y = -1.05 R) as children
  of the group, all hull-relative to the ELLIPSOID, with `userData.cues`; `poseCues` shows them from the snapshot's tank state.
  Bubbles and the falling weight are world objects emitted from the sub's position, not from the mesh.
- Per sub: a MeshStandardMaterial coloured by the boat's hue, with `applyDepthTint` (a shader patch on THAT material) so the boat
  dims toward the water colour by depth. The group is scaled by `subScale`.
- The pose is `subPose(row)`: position at the hull centre, rotation Y = heading, Z = pitch. The follow camera tracks the GROUP's
  position, so it needs nothing from the mesh. **I found no selected-sub highlight in the 3D view** (the list and the 2D views do
  that), so the earlier worry that a highlight and the brain panel need the model's bounds mostly does not arise; it would only
  if a highlight is added.
- **The tank has one hull at a time.** `createTank({ hull })` and `setHull` set the vessel for EVERY sub in the tank (physics/
  mechanics/subHulls.mjs: nominal, munk3, munk0, fins06, righting25, light, heavy, draggy, tinyFins, weakRighting, munk5, awkward).
  So an assignment per HULL is natural (one model for "all Explorers"), and per-sub assignment is not needed for the physics. The
  sim's real hull is 8 m x 1.2 m diameter; the view draws it 16 m long "larger than life" so a 500 m tank can be read. The model
  is therefore fitted to the DRAWN length (16 x subScale), not to the physics length.

## 3. The decisions that are Keith's (my recommendation first)

1. **Control surfaces.** (A) Rigid model, the fins NOT drawn moving; the sub list already prints the pilot's command, and the page
   says "rigid model" beside the picker. (B) Draw the procedural fins as an overlay at hull-relative positions. (C) Animate named
   nodes of the model when it has them (a node whose name contains rudder, plane or fin), with the hinge axis unknown for most
   models. **Recommend A for phase 1** (honest, nothing to get wrong), C later as an opt-in, and not B: two sets of tail surfaces
   on a real model would look wrong and say something false about the steering.
2. **Telling the boats apart.** A real model keeps its own colours, so ten Explorers become ten identical boats. **Recommend a hue
   cue that never hides the model**: a small hue-coloured marker (a ring or a sphere on the sail) AND a partial tint of the model's
   materials toward the boat's hue (a lerp of 0.25-0.35), with a "keep the model's colours" checkbox.
3. **Where the files live.** As the Pip-Boy and head models do: Keith downloads a .glb (Sketchfab needs a login for a download;
   nothing here may fetch from Sketchfab by itself) and drops it in GPU_Assets/subs/ (a new folder, like GPU_Assets/ships). A picked
   local file lasts the session (a blob URL), as for ships.
4. **What may be committed or shipped.** A model's licence decides. **Recommend: a model is never added to the repository or the
   release zip unless its licence allows redistribution AND its attribution travels with it** (GPU_Assets already commits small
   sample GLBs, about 200 KB; a Sketchfab sub is usually 5-50 MB). The default is: models stay on the machine that has them.
5. **Assignment unit.** Per hull (12 of them) plus a "default for all hulls", resolution: per hull > default > procedural.

## 4. Licensing, which is real

Sketchfab models are free to view but each carries its OWN licence: many CC-BY (attribution required), some CC-BY-NC, some CC0,
some not downloadable. The assignment therefore records, with the url: `name`, `author`, `licence` (a string such as "CC-BY-4.0"),
and `sourceUrl`. **The store refuses an assignment that has a url and an empty licence field** (a model with no stated licence is
not assigned; "unknown" is allowed, and is shown as such). While a model is in use the page shows its attribution line
(name, author, licence, source). The tree's existing register of read-but-not-vendored sources (world/reachedLicences.mjs) is for
code and data; a short entry for "user-supplied Sketchfab models: per-model licence, never fetched" belongs there so the census
knows the case exists.

## 5. Design

**Pure core, `render/subModelsCore.mjs`** (gated by an answer key, no Three.js):
- `subModelClass(hullName)` -> the hull (or "default"); `makeSubModelStore(storage)` over key `swek.subModels.v1`: set/get/clear/all/reload, bad hull refused, licence fields validated as above, the same snap rules as the ships.
- `orientationOf({ yaw, up })`: the rotation (as a plain matrix or quaternion array) that takes the model's own axes to the hull frame
  (nose +X, up +Y): yaw 0/90/180/270 and an up axis of +Y, +Z or -Z.
- `fitScale(bounds, targetLength)`: scale so the LONG HORIZONTAL axis of the oriented bounds equals the target length; refuses empty or degenerate bounds.
- `cuePlacement(bounds, scale)`: where the gauge and the slab go for a model (above the highest point; below the lowest), as hull-relative numbers.
- `triangleBudget(count)`: ok / warn / refuse thresholds (a warning above about 150k triangles; the ships path has none).

**Three.js half, `render/subModels3d.mjs`**: fetch the bytes and parse with gpu/gltfDraco.js `parseGlb` (Draco files get the lazy decoder, plain ones do not; meshopt files need the vendored meshopt decoder wired, unchecked end to end),
build a template once per url+orientation, and `hullFor(hull)` returns a Group with the SAME contract as `buildSub`:
`userData.parts` present but with `planes` and `rudder` as inert empty Object3Ds (so `poseFins` does not throw and nothing moves),
`userData.cues` placed by `cuePlacement`, materials CLONED per boat with the depth tint applied to every one, the hue cue added, and
the procedural hull kept as the fallback while the model loads or when it fails. `createView3d` gets one new option (a model source)
and nothing else about its camera, follow, bubbles or weights changes.

**Picker**: in the page, beside the hull menu: URL / datalist of GPU_Assets/subs / local file, yaw, up axis, name, author, licence,
source, "Assign", "Clear", the attribution line, the rigid-model note and the triangle count.

## 6. Gate plan (what is checked and how it will be broken)

- `render/subModelsCore-selfcheck.mjs`: the store (persist/reload with a mock storage, refusals, the licence rule), `orientationOf` on all 12 yaw/up combinations against hand-written vectors, `fitScale` on bounds with a tall sail (the long axis wins), degenerate bounds refused, `cuePlacement`, `triangleBudget` edges. Mutants: each constant and each refusal.
- `render/subModels3d-selfcheck.mjs`: a SYNTHETIC .glb built inside the gate from a few bytes of JSON and a binary buffer (a long box with a sail box), parsed by GLTFLoader.parse in Node (geometry only, no textures), then: the Group has `parts` with inert planes/rudder, `poseFins` does not throw and moves nothing, the bounds are 16 long after the fit, two boats have different material objects (a hue change on one does not change the other), the depth tint is on every material, a failed parse leaves the procedural hull. Mutants as usual, identity 0.
- A browser check (Playwright with SwiftShader is installed in this sandbox) renders the tank with the synthetic model and compares a screenshot against a no-model render: the model is present, the right size and the right way round. **I have not run this and the real look of a Sketchfab model can only be judged once Keith supplies one**; the synthetic model proves the plumbing, not the taste.

## 7. Phases (each one shippable)

1. Core + gate (pure). 2. Loader + hull swap, rigid, cues placed, tint and hue, fallback, gate with the synthetic model. 3. Picker + licence fields + attribution line + the register entry. 4. Optional: named-node fin animation; a per-sub override; a "model preview" panel.
Phase 1-2 are about one ship of work; 3 is the user-facing part and needs Keith to supply a real .glb to look at.

## 8. Unchecked, and risks

- Whether a typical Sketchfab submarine .glb (many materials, transparency for glass, embedded textures, KHR extensions, an animation we ignore) loads and tints cleanly through this loader: unchecked, depends on the file.
- Draco-compressed models load through gpu/gltfDraco.js (see 1.7); a Draco file in the synthetic gate would need the tree's encoder (tools/export/dracoEncode.mjs) to produce one, which is a cheap addition. Meshopt models should work (decoder vendored; unchecked end to end).
- Texture memory with ten boats sharing one template's textures but not its materials: the clone shares the texture objects, which is fine and cheap; unchecked under load.
- The depth tint patches `onBeforeCompile` of MeshStandardMaterial; a glTF material of another class (MeshPhysicalMaterial for KHR_materials_*) may need the same patch tested.
- A model whose origin is far from its hull centre: `fitScale` centres on the bounds; a sail makes the vertical centre high, so a sub may sit slightly high on its pose. A vertical-offset trim in the picker is the answer if it shows.
