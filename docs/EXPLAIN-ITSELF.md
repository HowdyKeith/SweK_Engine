# Getting the engine to explain itself

Keith raised three things in one message: 3Blue1Brown-style animations, the `manim_skill`
agent skill, and ValkyrienSkies/Valkyrien-Skies-2. They are one thread.

**All three are ways of getting a simulation to explain itself**, and manim's real
discipline is not animation. It is that **the explanation is generated from the same
objects as the argument**, so it cannot drift from it. A caption can be wrong about a
number. A number rendered from the number cannot be. VS2's shipyard is the same move in
space: keep the canonical thing where it is exact, project it for viewing -- which is
this engine's own device-versus-shell split, and what v4388 to v4393 measured.

This file is the roadmap for that thread. Each item names what it would measure.

## 1. The register keeps a rendering where it should keep the source -- MEASURED v4401, SURFACED v4402, INVERTED v4430

`tools/ship/redCensus.mjs` stores a **quoted failing line**: a projection of a gate run,
frozen at the moment somebody typed it. Three rounds in a row found it stale, each in a
different way -- v4380 filed `shaderCensus` at 14 against a line saying 4; v4383 found the
14 itself was false; v4386 found `referenceKind`'s line describing sweep bucketing rather
than the gate. One shape: **the stored projection went stale because the canonical thing
was elsewhere.**

`tools/ship/register-audit.mjs` already holds real runs. The move is to invert which is
canonical -- the audit becomes the record, `fails:` becomes derived, and `registerDrift`
stops being a comparison and becomes a projection.

**Measured.** Of 27 entries: **5** match a recorded line exactly, **12** are a
whitespace-normalised truncation of one -- a rendering by definition -- and **10** are
backed by no run at all. Those ten split cleanly: **9 quote a stale READING of a live
check**, 1 cannot be checked because the audit's 120 s cap cut the gate off before it
printed, and **zero name a check the gate no longer has**. So the register is not wrong
about *what* is failing; it is wrong about *how much*.

**And the check that existed to catch this was green throughout**, because it compares the
first 45 characters -- which reaches the end of an assertion's *name* and stops before its
*reading*. The two claims are now two checks.

**The source could not say when it was taken.** `freezeRegisterAudit.mjs` wrote
`at: "v4380"` as a string literal, so every re-freeze for twenty rounds produced a file
claiming v4380 -- including one taken at v4399 while measuring exactly this. It reads
`main.js` now, and the audit's age in rounds is a gated number.

**And there was no point of use to render at.** `fails:` is read by four files, all gates
or the freezer, two of which only assert it is a string longer than ten characters. **Zero
HTML files mention the register.** The tree's own debt list -- 27 standing reds -- was
reachable only by reading a `.mjs` or running a gate, which is v4379's RIG_ONLY finding on
the most consequential list it keeps. v4402 gives it one: `registerDrift` emits the
register through v4395's mechanism with **the audit's line beside the filed one**, and
`instruments.html` renders it. The nine divergences stop being a count and become a column.

**Shipped at v4402:** `tools/ship/registerRender.mjs` derives the display line from the audit
and classifies each entry into five outcomes rather than "matches / differs".

**Inverted at v4430, and the measurement is what made it obvious.** Of the 25 entries, **24
had a line the audit could re-derive** -- 7 matching exactly, 16 a whitespace truncation of
one, 1 drifted -- and exactly **one could not**: `shaderRefs-selfcheck.mjs`, whose 379-second
run the audit's cap ends before it prints. All but one of the field was a hand-typed copy of
something the tree already had.

`fails` and `ms` are **getters over `register-audit.mjs`** now. What stays canonical in
`redCensus.mjs` is the **name list** -- which gates were red at v4279 is a claim about a
moment, and no later run can establish it; the reading belongs to the run. `RED_AT_V4408` was
inverted the same way, since it held the file's last typed literal, and the audit runs both
registers now.

The one entry the audit cannot supply sits in `UNVERIFIED_LINE` with its reason, because an
absent reading and a stale one are different facts. And the inversion is **asserted rather
than assumed**: `registerDrift` fails if a typed `fails:` literal returns to the file, and
fails if a non-derived entry answers with anything but its own admission -- a row that exists
only because sabotaging for it cost zero red the first time.

## 2. Gates emit verdicts, not explanations -- DONE at v4395

Measured before building: **1429 gates, 67 print rows of formatted numbers, 0 wrote
anything a second reader could open.** And `tools/ship/artefactWriters.mjs`, the register
that exists to answer exactly that question, could not see one of them -- its walk skips
`-selfcheck.mjs` by construction, so its zero read clean.

Shipped: `tools/ship/gateReport.mjs`, a place to put a table a gate already computed;
`shipyard-selfcheck` wired as the first, because its three tables are what the last four
rounds argued from; `instruments.html` renders any emitted report, cell for cell, with
each cell's exact value in its title. `gateReport-selfcheck` ratchets the population of
gates whose argument dies with the terminal: **66, and it may only shrink.**

Emitting is off by default (`SWEK_GATE_REPORT=1`), because registerResidue's rule is that
a stale artefact from an accidental run is worse than none, and a gate's table is not a
pure function of the tree -- the shipyard gate's device rows need a GPU.

## 3. Animate the emitted tables -- DONE at v4399

The tree already has `ui/canvasRecorder.js` and `ui/recordFloat.js` on 25 pages. A page
that animates an emitted report, plus the recorder, is manim's **output shape** with no
Python, no LaTeX and no FFmpeg. First subject: the four float32 encodings walking a body
out to 8.4 million while the error curves diverge -- already measured, already emitted.

**The reason this comes after item 2 and not before:** without emitted data an animation
is a caption with a timeline. It has to draw the report, not a copy of it.

**Measured, and the prediction landed:** the argument's strongest number is the one the
chart cannot draw. The shipyard's claim-local error is **exactly zero** at every distance
-- the whole point of that encoding -- and a log axis has no place for a zero. Nor does
the first distance, x = 0. **Nine of that table's twenty-one values are unplottable, 43%
of it, seven of them the value 0**, and the plot names every one under itself rather than
nudging a zero to 1e-16 and drawing a line that says "very small" where the measurement
says "none".

And the check that earned its keep was not membership but **coverage**: drawn plus
named-as-undrawable must account for every value the table holds. Membership is nearly
free when the plot reads the report directly, and it stays true when a plot draws *less*
-- only coverage sees a number quietly disappear.

The panel lives on `instruments.html` beside the tables, with the reference data-viz
palette's dark slots validated against that page's real surface (`#0e1512`), one log y
axis, a legend, selective endpoint labels, a hover crosshair giving the exact figure, and
`ui/canvasRecorder.js` wired so the unfolding can leave as a clip.

## 4. Claims have the register's problem too -- MEASURED at v4404

241 claims, stored as prose plus a settled/open/broken flag. Each carries `kill:` -- the
condition that would kill it -- and `where:` -- the files it rests on. **Both are
sentences.** Nothing resolved the path, nothing ran the gate, and nothing had ever asked
whether a claim's own stated killer was firing.

**One was.** *"The selfchecks and the server survive Windows path semantics"* was marked
**settled**; its kill named `tools/ship/winPathGuard-selfcheck.mjs`; its measured read
*"it is, so every straggler was caught"*. That gate reports **twenty offending
occurrences** and has been in the red register as long as the register has existed. The
claim is marked **broken** at v4404 with the measurement -- what this tree does with a
falsified prediction, and what its other nine broken entries are for.

Measured across 241: **182 gated** (the falsifier is runnable), **52 prose** (no runnable
falsifier -- 32 of them settled), **7 dangling** (evidence names a file that is gone),
**1 contradicted**, now 0. `tools/ship/claimEvidence.mjs` classifies into those four and
excludes each field's `SABOTAGE:` clause, which names files *on purpose* that should not
resolve -- counting those reported three references never meant to exist.

**The limit, stated in the gate itself:** this can only see a claim whose falsifier is a
gate the red register already tracks. A claim naming a *green* gate that no longer tests
what the claim says is invisible to it. The one contradiction was found because the
register already knew -- not because the detector is good at looking.

## 5. A scanner counts a record ABOUT a thing as the thing -- DONE at v4412

`tools/ship/orreryFleetScan.mjs` decides which files import a vendored body by looking for
its path. It strips **comments** -- which is why `physics/backendDivergence.mjs`, whose
header discusses box3d and imports nothing, correctly dropped out at v4406 -- but it does
not strip **string literals**. So `tools/ship/gateSweep.mjs` became a box3d importer,
because a sweep closing's `verdict:` string quotes `"/vendor/box3d/box3d.js"` at line 565
while explaining that `box3dLoader` imports it.

**Fifth sighting of the shader census's defect, in a fifth scanner:** a detector that
counts the *word* rather than the *thing*. v4383 found it in `shaderCensus`; v4404 found it
in `claimEvidence`, where a `SABOTAGE:` clause names files on purpose that should not
resolve.

The honest fix is a **positional** test -- a path counts only in an `import` / `require` /
`fetch` / `new URL(` position -- and that test moves counts across all 138 satellites, so
it is a round of its own rather than a line. `world/orreryEjecta.mjs` also holds a frozen
baseline (box3d 21, three-webgpu 7) that the tree has grown past (28 and 11), which is
v4399's ratchet lesson: **freeze by name, not by count.** Both readings must be re-derived
together or the gate just moves from one wrong number to another.

**Done at v4412.** `tools/ship/importPosition.mjs` asks the question positionally, and the answer is that the
old rule was wrong **in both directions**: of its 138 entries **12 are records**, and it never saw **17 files**
that reach a body through `path.join(..., "vendor", name, ...)`. The corrected population is **143**. The
baseline is now a frozen list of *names* with the counts derived from it -- and that ratchet named this round's
own new gate joining box3d's fleet within the hour, which is the scanner counting the scanner for the third
recorded time. Two of the three bodies the orrery drew as pure paperwork turn out to be reached by real gates.

**And v4329's deleted guard would not have caught it.** The offending mention *is* quoted. The question is not
whether the path sits in a string; it is whether the string **is** the path.

## 6. A third of the tree is run by no ship-time step, and the exclusion is a ONE-WAY DOOR -- v4407

**502 of 1,439 gates are over the quick sweep's 3,000 ms budget.** The quick sweep (v4303)
is honest about being quick, and the full two-phase sweep covers the rest -- but the full
sweep runs when somebody decides to run it, and `orreryFleet-selfcheck` spent eight rounds
red inside that gap before v4406 looked.

**The worse half is the mechanism.** `tools/ship/sweep-timings.json` stamps ONE `captured`
date on all 1,440 entries, and the run rewrites only the ones it ran -- so 502 readings
carry a date they did not earn. And the budget decision is made *from* those readings, so a
gate that got faster is never re-measured and therefore never re-included. **Once over
budget, never re-timed, therefore over budget forever.**

Measured at v4406: of the over-budget population, **130 hit the 20 s cap** (a killed
process's exit code is not a verdict -- v4392's rule, sitting in a data file 130 entries
deep), 13 finished and exited nonzero, and **4 of those are named by no register list at
all**. Run by hand, all four are GREEN -- and three of them finish in 1.3 s, 1.9 s and
2.2 s, comfortably **under** the budget that excludes them.

## 7. The register's reader surface went red on a STALE AUDIT, not a probe bug -- DONE at v4412

`tools/ship/gateReport-selfcheck.mjs` section 7 (v4402) failed with 32 rows on screen
against 27 in the report.

**The v4408 diagnosis was wrong, and saying so is the point of writing it down.** It read
27 + 5 as the size of the report's first two tables and concluded the probe was counting
across a container that had gained one -- a page/probe mismatch. It was not. The register
AUDIT was thirteen rounds stale, past `registerDrift-selfcheck`'s twelve-round cap, and the
page was rendering a different vintage of the register than the report held. Re-freezing it
with `tools/ship/freezeRegisterAudit.mjs` -- which is what that tool exists for -- cleared
both gates: 27 against 27, and nine divergent entries all showing the audit's line.

A plausible arithmetic coincidence (27 + 5 = 32) is not a diagnosis. Nothing had run the
tool that owns the record.

## 8. An author-centred orrery -- MEASURED and SURFACED at v4415, provenance recorded at v4416

The orrery draws this tree at the centre with its dependencies around it. Keith asked for
the inversion: **the author as the sun**, a GitHub universe centred on a person rather than
a repository.

**The opening measurement is already taken and it is the whole problem:** `orrery.json`'s
15 bodies carry `[name, arrived, sha, bytes]` plus `files`, and **no owner, url or repo
field on any of them.** The orrery records *what this tree took* and nothing about *who
from*. An author-centred view needs exactly the field the bake has never collected, so the
first round is a provenance bake, not a renderer.


**Done, in the only order that works: the bake before the renderer.** `world/orreryAuthor.mjs` reads the
copyright line out of each body's licence, in **six kinds**, because "we know who wrote this" must not cover
the cases where we plainly do not:

| kind | n | what it means |
|---|---|---|
| person | 9 | a copyright line naming an individual |
| collective | 4 | `three.js authors`, `Krbn contributors`, `IBM Corp` -- a real attribution, and not a person |
| disclaimed | 1 | htmx ships 0BSD, whose text says THE AUTHOR and names nobody |
| prose | 1 | keyhunt's ATTRIBUTION.txt credits a project and says NO CODE WAS COPIED |
| none | 0 | no licence file at all |
| unread | 0 | a licence is present and could not be parsed |

**12 authors covering 13 bodies; 2 carried as unattributed** -- drawn on the page with the reason each cannot
be named, never dropped and never given a placeholder.

**PAPERED IS NOT ATTRIBUTED.** `world/orrery.mjs` has answered "may these bytes ship?" since v4185. It has
never answered whose they are, and htmx is the proof that the two questions are different.

**The "only 3 of 15" figure was mostly a reading error, corrected at v4416.** The scan carried five separate
too-narrow patterns -- the record must be `.md`, the URL must be `http`, the file must be *called*
`PROVENANCE`, the host must be `github.com`, and my own fix for the third capped path depth and lost
`vendor/wasm`. The true figure was **5**, and after six records written from evidence in the tree it is **11
of 15**. Four are frozen by name as genuinely unrecorded: `fonts`, `grass`, `krbn`, and `keyhunt` (whose
record deliberately carries no URL, because none exists anywhere in the tree).

**Provenance is attested, not derived, and that is measured.** The commonest GitHub URL inside `vendor/three`
is `KhronosGroup/glTF` at **59 hits against `mrdoob/three.js` at 9** -- the glTF loader cites the
specification it implements. A scraper picking the most frequent URL files three.js under KhronosGroup, wrong
by six to one, on the largest body in the tree.

**Still not the GitHub universe.** Four bodies have no owner/repo, three because the tree genuinely does not
know. That is a fact about the tree, not a gap in the scan, and closing it needs something outside these
bytes.

## 9. A composed principled BSDF, graded by the furnace -- v4432

From reading `knightcrawler25/GLSL-PathTracer` (MIT, C++/OpenGL, GLSL fragment-shader path
tracer; Disney BSDF, MIS with stochastic alpha testing, two-level BVH, GLTF/GLB, analytic
lights, IBL, tile rendering, OpenImageDenoise, homogeneous volumes).

**A different thread from items 1-8** -- this is rendering, not self-explanation -- but it is
put here because this is the plan being worked, and it is here rather than in
`docs/PHYSICS-SHADER-CANDIDATES.md` because the *grading* is the point, which is that file's
subject in a different domain.

`physics/render/` already holds the **pieces**: `microfacet.mjs` (GGX `D`, Smith `Lambda`,
`G1`, `G2`, `ndfIntegral`, `furnaceIntegral`, `directionalAlbedo`, `sampleHalfVector`),
`fresnel.mjs`, `energyCompensation.mjs` (the multi-scatter table), `roughDiffuse.mjs`
(Oren-Nayar with its own directional albedo). What it has **no** composed principled BSDF --
`grep -i disney` over the tree returns one comment about a sphere radius.

**Why it is worth a round rather than a copy:** a principled BSDF is a *composition of lobes*,
and the honest question is whether the composition still conserves energy or whether the lobes
double-count at the seams. This tree can ask that -- it already has the white-furnace machinery
and a directional albedo per lobe. Most implementations of this model are never run against
one. The falsifier is the boundary: at `metallic=0, roughness=1` the composed thing must agree
with `roughDiffuse`; at `metallic=1, roughness->0` with mirror Fresnel; and no parameter
setting may return more energy than it receives.

**Compose, do not re-implement** -- `pathTracer.mjs`'s own rule: "deliberately assembled FROM
those modules rather than beside them", because a second declaration of a graded thing means
the keys grade a different renderer than the one that ships.

## 10. Two-level the BVH the tree already has -- CORRECTED at v4435, still OPEN

**This item was written wrong at v4432 and the correction is the more useful half.** It said the renderer has
**no BVH at all**, citing `grep -li bvh` over `physics/`, `render/` and `world/`, which "finds mesh CSG and a
spatial-agreement gate". Graded at v4435 by `tools/ship/absenceScope.mjs`: the tree holds **twelve** files of
real BVH code and the claim named **two**. It failed three separate ways, and only one of them is the one
anybody expects:

1. **Out of scope.** `mesh/meshBVH.mjs` (v4221) is a **binned-SAH ray-triangle BVH** taken from
   gkjohnson/three-mesh-bvh, with stackless-ish traversal, near-child-first ordering, best-t pruning, and a
   green gate. It lives in top-level `mesh/`, and the three directories searched were `physics/`, `render/`
   and `world/`. The grep was correct. **The scope was the claim, and nothing in the claim said how wide it
   was.**
2. **In scope, and summarised away.** `physics/sph/bvhNeighbours.mjs` (v3805) is a Morton BVH. It *was* in the
   searched directories; the prose summary of the grep's output dropped it.
3. **A denial counted as a presence.** `physics/render/rtPipeline.mjs` matched because its comment says
   *"Linear over the geometries. NO BVH"*. A file that matched **because it asserts the absence** is evidence
   *for* the claim. So are `main.js` and `brain/brain.js`, which carry item 10's own text. This is item 5's
   defect -- a record *about* a thing counted as the thing -- in the one place nobody thought to look.

**The narrow claim survives: the tracer has no BVH, and `rtPipeline.mjs` says so itself.** What did not survive
is the sentence supporting it, and it was hiding the two facts that change what this item should DO.

**So the item shrinks, and its hard part is already solved.** It is not "build a BVH" -- the tree ships one,
with SAH, graded. It is: **make `mesh/meshBVH.mjs` two-level (a TLAS over instance transforms with a shared
BLAS) and point `physics/render/rtPipeline.mjs`'s linear-over-geometries loop at it.**

And the value key, which v4432 called the hard part and claimed the tree had no way to measure: **the tree has
measured exactly this once already, and got a negative answer.** `physics/sph/neighbourBakeoff-selfcheck.mjs`
put the Morton BVH against `spatialGrid.js` on identical particle sets, **asserted identical neighbour lists
before believing any timing**, counted the rebuild, and reported machine-independent check counts rather than
milliseconds. Verdict: *"spatialGrid wins on per-step SPH (~cells vs ~130 nodes/query, N vs 2N-1+sort
rebuild)."* That is the instrument this item needs and the shape its answer should take -- including the
possibility that the answer is again **no**.

**Still open, and still after item 9,** because the scene big enough to make the measurement mean something
does not exist in the tree yet. That part of v4432 was right.

## 11. The second estimator -- DONE at v4437, and the item as written was wrong

**This item was wrong, and it is the third absence claim of mine in three rounds to be wrong.** It said the
tracer had never rendered an image and asked for a WGSL raygen pass. Measured:

* `physics/render/pathTracerWgsl.mjs` (v4290) generates WGSL compute kernels and grades them **against a real
  WebGPU device** -- the LCG, the camera, and the primary ray, with 2304 coverage pixels agreeing.
* `physics/render/pathTracerGpu.mjs` (v4415) ported the **transport**, and agrees with the CPU **bit for bit**
  on 576 furnace pixels, after finding three real bugs doing it.

So the premise was false. What made it *feel* true is that the honest-scope notes of v4432 and v4436 both say
the sampler is unchecked -- and I read "the sampler is unchecked" as "there is no GPU path", when the tree had
a GPU path and it could not have helped.

**And v4415 had already written down why.** Its gate carries a row reading *"the furnace CERTIFIES a broken
cosine sampler, bit-exactly"*, with a note saying the pass is the point and is not good news. **GPU-versus-CPU
is not two independent paths when both run the same sampler.** A shared sampler bug agrees perfectly and is
perfectly wrong. What was missing was never a device: it was an estimator that shares no code with the one it
checks.

**What that second estimator found, immediately:**

1. **`principled.sample()` returned NaN on every specular draw, from v4432 to v4437.** It read `h.cosTheta`
   from a function that returns a three-vector with **y** up, fell through to `Math.cos(h.theta)`, and
   `h.theta` was undefined too. The ternary guarding two guessed shapes was the tell. Five rounds of
   "ungraded" were carrying "broken".
2. **The pdf was the chosen lobe's, not the mixture's** -- worth exactly 2x on a dielectric, and **invisible
   on a metal**, where `pSpec` is 1 and the mixture *is* the one lobe. The obvious material on which to test
   a specular sampler is the one that hides the bug.
3. **The tree's own quadrature is wrong by half at its default grid**, for a tight lobe at an oblique angle:
   `directionalAlbedo` defaults to N=96, M=48 and reads **0.334246** where the converged value is
   **0.991341**. The Monte Carlo had it right from fifty thousand samples. `GRID_FAILS_AT_V4437` records
   where not to believe the instrument, and the rule is a *product* -- a tight lobe alone is fine, an oblique
   angle alone is fine.

**v4432's headline survives, checked rather than assumed:** 1.0796 holds from N=96 to N=2048 because roughness
1 is a broad lobe. The claim was not taken where the instrument fails.

**What is still open, and is what item 11 should have said:** the GPU port has its own sampler, and this round
did not touch it. `pathTracerGpu.mjs` should get the same second-estimator treatment -- which is now a
different and much smaller item than "render an image".

## 12. Affine texture warping and vertex wobble -- OPEN, and only half of it is gradeable

From `DaveFace/UnrealRetroShaders` (MIT). **Nothing is portable at the file level**: it is UE4.27 Blueprint
materials in binary `.uasset`, and the author states UE5 is unsupported because the rendering systems it relies
on changed. The techniques are portable and are not the author's to license anyway -- they are 1994 console
constraints.

Measured at v4436 with `tools/ship/absenceScope.mjs`: **Bayer dithering is already here** (`fx/dither.js`, with
a gate). YUV colour space and posterise are **0 files**. Affine texture warping is **0 in the tree's own code**
-- the nineteen `affine` hits are transforms (MPM grid solve, secp256k1 curve points, drift estimation), the
only affine-*texture* code is in `vendor/`, and `render/perspectiveWarp.mjs` is a homography, which is the
deliberate opposite.

**The split that matters is which half has a right answer.** This tree grades things that can be wrong, and
"does it look like a PS1" cannot be. But two of the three can:

* **Affine warping is exactly "interpolate UV without dividing by w"** -- checkable against the
  perspective-correct result, with a closed-form error that is zero at the vertices and maximal at the
  triangle's centre, growing with the depth ratio across it.
* **Vertex wobble is quantisation to a fixed-point lattice** -- checkable as snap-to-grid at a stated
  precision, where a wrong implementation looks right on screen.

YUV quantisation is the aesthetic-only third and ships as a knob rather than a claim, if at all.

## What is deliberately NOT being taken

**The manim skill itself.** `npx skills add adithya-s-k/manim_skill` is a cheap
self-contained experiment and it buys this tree nothing directly: Python, LaTeX and
FFmpeg is a whole new toolchain for a project that renders in a browser and already has a
recorder. What transfers is the rule, not the library.

**Valkyrien Skies 2 as code.** LGPL-3.0, Java and Kotlin, coupled to Minecraft and to a
JVM. A design to read. v4388 read it and ported the shipyard as arithmetic.

**Manim as evidence, though, is worth a paragraph in `TSL-ROADMAP.md`.** v4383 concluded
this tree should not build an IR, and that TSL is "a three-stage shape someone else
maintains". Manim is a third instance of exactly that shape: `Scene` to a Mobject graph to
two renderers, Cairo and OpenGL. LLVM was the first, TSL the second.
