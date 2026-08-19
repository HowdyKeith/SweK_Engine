## v3904 -- THE OPEN EXPORTED FUNCTIONS IN mesh AND render, AND 23 OF THE 32 WERE NOT OPEN AT ALL

Keith asked for the open exported functions, specifically the physics/mesh cluster (21, mostly triReconstruct
and quadraticRecon) and physics/render (11). *** MEASURING THEM ONE AT A TIME BEFORE FIXING ANY OF THEM CHANGED
WHAT THE ROUND WAS: 23 OF THE 32 ARE ALREADY EXERCISED, BY A GATE THAT IMPORTS THE SYMBOL FROM THAT MODULE AND
CALLS IT -- JUST NOT THE GATE SITTING BESIDE THE FILE. *** Nine were reached by nothing anywhere in the tree,
and those nine are the round.

### THE INSTRUMENT WAS ASKING "DOES ITS OWN GATE NAME IT", AND THIS FOLDER NAMES GATES AFTER QUESTIONS

`definitionGates` counts a definition as covered when the file `<module>-selfcheck.mjs` mentions it. physics/mesh
has NINETEEN gates against twelve modules, and eight of them -- boundaryRank, rowWeight, nodeGradient,
gradientJoin, tetRank, weightScaling, quadraticWall, featurePreserve -- are SUBJECTS rather than modules. The
sibling rule cannot see any of them:

    triReconstruct.mjs's seven   ->  boundaryRank, nodeGradient, gradientJoin, tetRank
    quadraticRecon.mjs's five    ->  rowWeight, quadraticWall, weightScaling
    marchingCubes.js's five      ->  featurePreserve, manifoldCensus, ambientOcclusion, sdfMarch, aoWiring
    furnace's toWorld, occlusion's occluded, bounces' pair, microfacet's misWeight  ->  five more gates

That is 72% of this cluster reading as debt while being driven every ship. *** THE PIN AT 37 IS NOT MOVED AND
SECTION 1 OF definitionGates IS NOT TOUCHED -- a baseline lifted to meet the tree is a gate edited to agree with
whatever shipped. *** What is added is the SPLIT the single count cannot make, and a floor that ratchets only the
class that means what the headline sounds like it means: exercised by NO gate at all.

**And the classifier had to be built to refuse a word match.** `sideOf` appears in `bz/tools/bz-teleport-selfcheck.mjs`
-- a different sideOf, in a different subject, with nothing imported from physics/mesh. A scan counting the word
would have called discontinuity.mjs covered by a file about BZFlag. Reach here means the gate IMPORTS the symbol
from that exact resolved path (named or through a namespace) AND uses it with imports and comments stripped.
Sabotage drives all three answers: a non-sibling gate that does reach it, an unrelated gate that only mentions
it, and a name nothing imports.

### THE NINE THAT WERE GENUINELY DARK, AND WHAT EACH ONE COST TO CLOSE

| module | definitions | the key that now holds them |
| --- | --- | --- |
| `physics/mesh/discontinuity.mjs` | `sideOf`, `distanceToInterface` | one partition, one unit |
| `physics/mesh/strokeMorph.mjs` | `toPathD`, `morphPaths` | rounding, and the wrapper pinned to the page's four steps |
| `physics/render/furnace.mjs` | `cosinePdf` | the cancellation, in ulps, and a zero-variance estimator |
| `physics/render/microfacet.mjs` | `sampleHalfVector`, `sampleDirPdf`, `bounceWeight`, `bsdfEval` | the whole sampling half |

Every one is a property with a plant beside it, and **all nine plants were driven against the new gates and all
nine go red**: `x <= xi` in sideOf, the missing `/h` in distanceToInterface, a `places` that is ignored, a
morphPaths that skips the pairing, a cosinePdf over 2pi, a swapped u1 in the sampler, a dropped reflection
Jacobian, a dropped `|wo.wh|`, and a dropped G2.

### FOUR FINDINGS, AND THE FIRST TWO ARE DEFECTS THE OLD GATES REPORTED AS PASSES

**(1) A CLAIM THAT LIVED IN A DETAIL STRING FOR 260 VERSIONS.** discontinuity-selfcheck's section 2 has been
printing "the REACH doubles too, 0.33 to 0.67 cells, INDEPENDENT OF n" since v3644. Dropping the `/ m.h` from
`distanceToInterface` -- so the reach is measured in length rather than cells -- makes it read 0.28/0.14 at
n = 24/48, halving with every refinement, **and every check in the file still passes** while that sentence goes
on being printed unchanged. The claim was prose, and prose is a fixed string. It is a check now: reach is
0.333333 and 0.666667 at both mesh sizes to twelve figures, and the length-measured version is shown halving.

**(2) THIS FILE'S WRITER PRODUCES SVG THIS FILE'S READER REFUSES.** Found by writing the obvious round-trip check
for `toPathD` and having it throw: it emits the minimal separator (`M12 3L14 5`), which is legal SVG and is what
the browser parses on every frame, while `parseStroke` splits on whitespace and reads `M12` as an unknown op.
*** NEITHER FUNCTION IS WRONG AND THE PAGE IS UNAFFECTED *** -- but `parse(toPathD(x))` is not a round trip, and
a later round assuming it is would be building on a sentence nobody had run. RECORDED, NOT FIXED: which side
moves (widen the parser, or space the writer at a cost in attribute size) changes the DOM payload and is Keith's
call, not a defect to be quietly patched inside a gating round.

**(3) A ZERO-VARIANCE ESTIMATOR, AND TWO WRONG-PDF FAULTS THE MEAN CANNOT TELL APART.** `cosinePdf` is what makes
the cosine-weighted integrand CONSTANT: `cos / cosinePdf(cos)` is pi to within one ulp (4.44e-16 against
ulp(pi) = 6.98e-16 over 100,000 values -- asserted at the precision it holds at, not as the exact identity I
first wrote). The consequence is measurable and is not "better sampling": across 24 seeds at 2000 samples the
spread is **3.08e-16 against the uniform sampler's 1.24e-2, thirteen orders of magnitude**, because every sample
contributes exactly pi. And that separates two faults a mean cannot:

    a pdf wrong by a CONSTANT (half of cosinePdf)   mean 2.000000   sd 6.17e-16   pure bias, still exact
    a pdf wrong in SHAPE (the module's wrongPdf)    mean 1.331637   sd 1.06e-2    bias AND the variance back

No amount of sampling finds the first, and a convergence check would report a perfectly converged renderer.

**(4) THE SAMPLING HALF OF THE BSDF WAS UNGRADED, AND ITS OWN PLANT HAD NEVER BEEN DRIVEN.** microfacet.mjs's
four sampling exports are reached only through pathTracer.mjs, so every claim about them was a claim about the
path tracer's keys. They now carry their own:

  - `sampleHalfVector` INVERTS the GGX cdf: the sample returns the u it was handed, worst 8.42e-14 across six
    roughnesses. A closed form is its own key -- no histogram, no sample count, no tolerance somebody chose.
  - `sampleDirPdf`'s mass: the reflection Jacobian MOVES the NDF's mass and cannot create it. It integrates to 1
    at a normal view at every roughness, and BELOW 1 at grazing -- 0.80 at alpha 1, cos_o 0.6 -- because
    half-vectors more than 90 degrees from wo are never sampled. The grazing half is quadrature-limited and is
    proven by REFINEMENT (5.82e-3 -> 2.90e-3 from N = 200 to 400) rather than by a tolerance chosen to pass.
  - `bounceWeight` IS `bsdfEval * cos_i / sampleDirPdf`: the module states that algebra in its header and
    nothing drove it. Worst relative disagreement 4.75e-16 over 652 configurations -- three exports graded by
    one equation. It is also BLIND to a wrong D by construction, since D is what cancels, and the gate says so.
  - `bsdfEval` reproduces `directionalAlbedo` TO THE LAST BIT, which pins the function a renderer calls to the
    function section 4 grades, and it is reciprocal to 4.11e-16.

Two sabotages land on this file's own doctrine -- told apart by the TREND, not by the size of any one reading:
dropping cos_h from the pdf is **x1.0092 at alpha 0.05 and exactly x2.0000 at alpha 1**; dropping G2 from the
evaluation is **0.06% at alpha 0.05 and 70% at alpha 1**. A tolerance chosen at a smooth roughness passes both.

### WHAT MOVED

    definitionGates       121 unmentioned -> 110      (the nine, plus toWorld and cosineSampleHemisphere,
                                                       which the furnace's cosine arc brought along)
    reached by NO gate     84 -> 76 tree-wide,        physics/mesh 4 -> 0, physics/render 5 -> 0
    physics/mesh          21 sibling-unmentioned -> 17, all 17 driven by the subject-named gates
    physics/render        11 sibling-unmentioned ->  6, all  6 driven elsewhere
    assertions            discontinuity 16, strokeMorph 19, furnace 15, microfacet 24

The next round is derived rather than typed: the gate prints what is still dark by cluster -- physics 13,
physics/xpbd 9, physics/sph 8, physics/thermal 8, physics/mechanics 6, physics/mpm 6, across 21 clusters.

### A LIMIT OF THE INSTRUMENT, FOUND WHILE USING IT

definitionGates reads `export const NAME = (` and `export function NAME`. An exported TABLE matches neither, so
`EXPECTED_COSINE` is invisible to it -- and pulling on cosinePdf found that the word `strategy` does not appear
in furnace-selfcheck either. *** THE FLAGGED EXPORT WAS THE VISIBLE TIP: THE WHOLE v3468 COSINE ARC WAS UNGRADED
AND THE INSTRUMENT COULD SEE ONE QUARTER OF IT. *** Reported, not fixed: widening the regex changes the
denominator every number in this file is quoted against, and that is its own round.

### HONEST NOTES

- **The modules are untouched.** All four are byte-identical to v3903; this round changed five gates and nothing
  else. The modules are carried in the patch so the gates can be run, not because they moved.
- **definitionGates stays RED.** Its section-1 ratchet is at 110 against a frozen pin of 37 and has been red
  since long before this round. The number improved by eleven; the pin did not move, and lifting it is the one
  move that cannot be undone.
- **`--affected` over all five changed files: 1 failed of 5, and it is that same pre-existing ratchet.** The
  four physics gates are green. deadImportScan's one failure ("the deleted barrel left a recovery archive
  behind") is red at v3903 too, verified against a pristine extraction.
- **Verified in a full-tree copy, not just in the slice**, because a gate that reads `../../ui/morphDigits.js`
  or `path-tracer.html` for its front-door check passes vacuously in a tree that does not have them.
- Runtime: microfacet 4.2s (was ~3.5s), discontinuity 0.25s, furnace 0.59s, strokeMorph 0.10s,
  definitionGates 5.2s (the new cross-gate scan reads 1100 gate files once).
