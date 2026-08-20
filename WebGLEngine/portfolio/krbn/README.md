# SweK x Krbn — the rig, drawn

`swek-ragdoll.krbn.ts` renders **SweK Engine's actual ragdoll rig** as a pencil technical drawing, through
[vpalos/Krbn](https://github.com/vpalos/Krbn) (MIT).

Every position in the scene is copied from `ragdoll.html`'s `BONES` and `JOINTS` arrays — the same numbers Box3D
simulates. SweK is Y-up and Krbn is Z-up, so the scene maps `(x, y, z) -> (x, z, y)`. The bones are cylinders
because a bone **is** a segment with a radius; the physics boxes are an implementation detail of the solver, not of
the figure. The joints are marked `role: "focus"` and the ground `role: "context"`, which is Krbn's inversion: you
supply the semantics, it decides what to draw and what to quieten.

## Why this pairing is worth anything

Krbn does not render surfaces. It **derives strokes from geometry** — a sphere's silhouette is an exact conic in
closed form, hidden lines are split analytically into visible and ghosted runs. The 56 dashed segments in the SVG
are bones passing behind bones, classified exactly rather than z-buffered away.

And its headline claim is one we can test: *the same scene always emits the same, byte-identical, diffable SVG.*

## Verified here, not taken on trust

| what | result |
|---|---|
| Krbn's own suite, on a box its author has never seen | **326 tests, 0 fail, 60,518 assertions, 15s** |
| its gallery rendered twice, byte-compared | **22/22 identical** (7,341,748 bytes) |
| **this** scene rendered twice, byte-compared | **identical** — 347,017 bytes, sha `bb862fa8fa6c5fbe` |

A drawing that diffs is a drawing you can put in a gate.

## Rebuild it

```bash
git clone https://github.com/vpalos/Krbn && cd Krbn && bun install
cp .../swek-ragdoll.krbn.ts examples/gallery/
bun run render examples/gallery/swek-ragdoll.krbn.ts
```

## The chain closes: flesh, drawn

`swek-flesh.krbn.ts` is the whole stack in one picture:

```
box3d rig (v2515 joints) -> physics/soft/boneField.js -> simulation/MarchingCubes.js -> OBJ -> Krbn -> SVG
```

The same eleven bones, wearing a capsule field with a smooth-min blend of 0.16, marched to **904 triangles** and fed
to Krbn as a mesh. Nothing is sculpted: the surface is derived from the numbers Box3D simulates. **804 paths, 628
ghosted runs, byte-identical across runs** (487,385 bytes, sha `aeb98e52`) -- so the determinism claim holds on
*mesh* input too, not only on analytic primitives.

### And a measured limit worth knowing

Krbn's mesh path is **quadratic in triangle count**. Measured here on one CPU:

| triangles | render |
|---:|---:|
| 904 | 4s |
| 1,732 | 14s |
| 2,608 | 34s |
| 10,520 | timed out (predicted ~542s) |

That is an exponent of **2.0** across the measured points, and the prediction it makes for the 10,520-triangle mesh
is exactly why that one never finished. This is not a complaint: exact silhouette extraction over a mesh is
inherently a comparison problem, and Krbn's own README says exactness is the value it is optimising for.

**The lesson is on our side of the seam:** the flesh module cannot see its own downstream cost, and a pencil
drawing does not need 10,000 triangles. `fitGrid(bones, 28, blend)` gives a figure a draftsman would recognise; a
higher grid buys resolution the hatching then throws away.

## A blob, drawn -- and the model breaks

`swek-blob.krbn.ts` is blobulator's own recipe: inverse-square Blinn metaballs, `field = 1.0 - sum`, marched at
zero. Eight seeds, fixed rather than random, because a drawing you cannot reproduce is not a drawing you can diff.

**A blob has no edges.** The ragdoll has limbs and joints; this is nothing but curvature, and it is the case where
Krbn's exact conics do not help -- it is a mesh, so every silhouette is found the hard way. The result:

| | triangles | paths | ghosted runs | bytes |
|---|---:|---:|---:|---:|
| ragdoll flesh | 904 | 804 | 628 | 487,385 |
| blob | 4,662 | 2,862 | **2,370** | 1,930,290 |

**83% of the blob's strokes are ghosted.** A blob folds over itself constantly, so most of what it draws is
something hiding behind something else -- classified, not discarded. That is a drawing you cannot get from a
renderer, and it renders byte-identically: `sha256 c36eb04d...`, twice.

### The quadratic under-predicted, and that is the finding

The v2524 model said 4,662 triangles would take **106s**. It took **152s** -- **1.43x off**.

That model was fitted on one shape family: the ragdoll flesh, which is mostly limbs -- cylinder-ish, little
silhouette per triangle. **A blob is all curvature and has far more silhouette per triangle.** So triangle count is
not the whole cost, and my "exponent 2.0" quietly folded a second variable into the first. The scaling is still
roughly quadratic; the constant is a property of the *shape*, not of the mesh size.

Worth stating plainly: the earlier number was measured honestly and generalised carelessly.

## Would an animated blob boil?

Krbn's README claims the hand-drawn lines **don't boil between frames** -- wobble is seeded on stable stroke
identity, never re-randomised. His design doc puts "temporal boiling" in a risk table and says the discipline
"starts in Phase 1 so it is not retrofitted".

**Tested, on an analytic scene so the mesh cannot contaminate the answer.** Camera nudged 0.004 units -- a 0.1%
move:

| | |
|---|---|
| paths | 89 -> 89 |
| paths with matching point-counts | **89 / 89** |
| mean coordinate shift | **0.056 px** (max 0.157) |

Not one stroke gained or lost a point, and every stroke moved by six hundredths of a pixel. If the wobble re-dealt
per frame the point counts would differ and the shifts would be pixels. **His claim holds.**

### But a marched blob would boil, and it would be our fault

Marching cubes is discontinuous. Nudge a metaball and a cell flips topology -- the mesh itself re-tessellates:

| nudge | triangles |
|---|---|
| 0.0001 | 1548 -> 1548 |
| 0.01 | 1548 -> 1548 |
| **0.05** | 1548 -> **1546** |
| 0.2 | 1548 -> **1542** |

Small motion keeps the topology and Krbn's coherence carries straight through. Real motion -- a blobulator river,
where balls rise and merge -- flips cells constantly. **And a stroke on a triangle that did not exist last frame has
no identity to be stable about.** Krbn cannot fix that from its side; the mesh arrives already boiling.

That is a genuine open problem (temporally coherent isosurfaces), not a bug in anyone's code. Worth knowing before
anyone points a pencil at an animation.

## A splat cloud, drawn -- and the boiling question answered

`swek-splat.krbn.ts` draws 44 Gaussian splats as Krbn `Ellipsoid`s with stable ids. It exists to settle the
question the blob raised.

**The mechanism, read from `src/pipeline/wobble.ts` rather than guessed:** the wobble is a 3-D noise field keyed on
each vertex's *object-space position*. A marched blob is **one object** whose vertices **slide through** that
stationary field as the field deforms -- so the wobble under them changes. **That is the boil.** A Gaussian splat is
the opposite by construction: it is its own object with its own frame, so its noise travels with it.

**Tested.** Move exactly one splat of 44:

| | survives the move |
|---|---:|
| our marched blob (a 0.05 nudge) | **0%**, and the triangle count changed |
| a splat cloud (one splat moved) | **91.9%** byte-identical (385 / 419 paths) |

The 8% that changed is splat 7's own strokes plus what it newly occludes -- which *should* change.

**And splats are cheap here for a reason worth knowing:** an ellipsoid is a **quadric**, so Krbn draws it with an
exact conic, not the mesh path. 44 splats render in **7s** against 152s for a 4,662-triangle blob. The quadratic
does not apply.

**Not extrapolated:** a real splat scene is a million-plus primitives. 44 is a toy. The last time I extrapolated a
cost model here it was 43% wrong, so this number is what it is and nothing more.

## Honest limits

The figure is the **rest pose**, not a simulated frame. Wiring live Box3D transforms into a Krbn scene is the
obvious next step and is not done: it would need the engine to export a pose, which is a real change and not
something this file can claim. Nothing here runs inside SweK — Krbn is a separate TypeScript engine and this is a
scene fed to it, which is exactly what it is for.
