// WebGLEngine/physics/render/rtPipeline-selfcheck.mjs -- v4418
//
// Run: node physics/render/rtPipeline-selfcheck.mjs
//
// Grades physics/render/rtPipeline.mjs: WebRTX's pipeline SHAPE -- named stages dispatched through a shader
// binding table -- against v4417's monolith and against the CPU tracer that has been the answer key since
// v3473.
//
// *** SECTION 4 IS THE ONE THAT MATTERS AND IT REPORTS A LIMIT RATHER THAN A WIN. *** v4417's bit-exactness
// rests on convexity: a bounce off a lone sphere always escapes, so the sampler never reaches the pixel. ADD A
// SECOND GEOMETRY AND THAT ARGUMENT IS GONE -- a bounce can land on a neighbour, so which route a path takes
// depends on a direction that f32 and f64 disagree about. Measured: it survives two spheres and breaks at
// three. The gate asserts the SHAPE of the breakage, not its absence.
//
// *** SECTION 6 IS THE BVH ROUND'S, AND ITS ANSWER KEY IS A DIFFERENT FILE, NOT A DIFFERENT TOLERANCE. *** A triangle
// mesh has no CPU radiance reference here -- pathTracer.mjs's scene is spheres, full stop -- so this does not
// invent one. What it grades is the traversal itself against mesh/meshBVH.mjs's own already-tested
// raycastFirst(), and it found one real disagreement shape worth keeping rather than hiding: a ray landing
// exactly on an edge two triangles share can report either as the nearest hit, at the identical distance. That
// is verified by checking the two triangles actually share two vertices, not asserted away.
//
// *** SECTION 7 IS THE SHADING ROUND'S, AND ITS FIRST DRAFT FOUND A BUG IN ITS OWN TEST FIXTURE. *** vec3
// albedo was bit-exact against pathTracer.mjs's own rgb:true mode on the FIRST try -- that machinery already
// existed and only needed feeding. Vertex-colour interpolation did not: the hand-authored cube's 12 triangles
// all had INWARD-facing normals (a winding mistake, not a rtPipeline.mjs one -- Möller-Trumbore does not care
// about winding for hit/miss, so section 6's own intersection check never saw it). An inward normal sends a
// diffuse bounce back INTO a convex shape, where a path can exhaust its whole depth budget bouncing inside and
// return {0,0,0} -- which looked, at a glance, like broken colour math. Measured directly rather than guessed:
// the first-hit albedo alone was already correct and colourful; only the FULL bounced render was near-black.
// Fixed by rewinding the cube; kept here because a future reader hitting the same "why is my mesh black"
// symptom deserves the diagnosis, not just the fix.
//
// *** SECTION 8 IS RTX ROUND 4'S FIRST HALF -- MULTI-MATERIAL, THE SBT-OFFSET IDIOM WITHIN ONE BLAS. *** A
// triangle picks its own material via bvhMatIdx[bvhHitTri], indexing a separate bvhSbt record array rather than
// the single mesh-wide MESH_SBT_SLOT sections 6-7 used. Graded EXACTLY, by a dedicated probe
// (bvhMaterialProbeWgsl) rather than through a bounced render -- there is still no CPU radiance oracle for a
// mesh, and a deterministic per-triangle claim does not need one.
//
// *** AND BUILDING THAT PROBE FOUND A REAL BUG IN THE TWO PROBES BEFORE IT, TWO ROUNDS OLD. *** bvhProbeWgsl and
// bvhShadeProbeWgsl took no ray count; @workgroup_size(64) always launches 64 invocations, and every caller here
// supplied fewer. The excess threads read past `rays` and wrote past `outBuf`, and WebGPU's out-of-range STORE
// clamps into the buffer rather than faulting -- which piled every excess write onto the LAST real ray's own
// slot. It was invisible in THIS section's own 32-ray sweep because the corrupted answer (tri 6) happened to
// share two vertices with the true one (tri 11), so the "genuine shared-edge tie" tolerance below -- written
// for an honest case -- absorbed it without complaint. Confirmed by padding the same call to a full 64 threads
// with far-away miss rays: the corruption disappeared and ray 31 read the CPU's own answer, not the tolerated
// tie. Fixed at the source (physics/render/rtPipeline.mjs: all three probes now take a required `rayCount`,
// guarding `if (gid.x >= RAY_COUNT) { return; }`) rather than by padding every call site, which would only have
// hidden the same fragility behind a bigger buffer. The tie count below dropped from 2 to 1 the moment the fix
// landed -- the other one is real, and stays tolerated.
//
// *** SECTION 9 IS ROUND 4'S SECOND HALF -- THE STATISTICAL GATE THE ORIGINAL GAMEPLAN CALLED FOR AND SECTIONS
// 6-7 EXPLICITLY DEFERRED. *** A mesh is concave once it has a real cavity (an open-top box: a ray can bounce
// off one wall and land on another), so f32 and f64 can disagree about WHICH triangle a bounce lands on --
// section 4's own argument, one level down. There is still no CPU radiance oracle to be bit-exact against, so
// this round gives pathTracer.mjs one: intersect() now tests a `.bvh` scene entry through
// mesh/meshBVH.mjs's own raycastFirst(), shaded with the SAME triNormal() rtPipeline.mjs's WGSL rtTriNormal()
// computes -- trace() itself needed no changes at all, since every material read goes through hit.sphere, and a
// mesh entry simply supplies one.
//
// *** THE COMPARISON USES DIFFERENT SEEDS ON EACH SIDE, DELIBERATELY. *** physics/render/samplerCheck.mjs's own
// header names the trap: "GPU-versus-CPU is not two independent paths when both run the SAME sampler". CPU and
// GPU here run the IDENTICAL LCG (rtPipeline.mjs's LCG constants ARE furnace.mjs's, parsed rather than
// retyped) from the IDENTICAL per-pixel seed formula, so the SAME seed draws the SAME raw randoms on both
// sides -- a shared-formula bug in the intersection or shading math could agree with itself and hide. The CPU
// side draws seeds 1..N, the GPU side seeds 2001..2000+N: same scene, same camera, genuinely UNCORRELATED
// noise, so what agrees is the RADIANCE ESTIMATE and not a shared random tape.
//
// *** THE BOUND IS samplerCheck.mjs's OWN METHOD, EXTENDED FROM ONE NOISY ESTIMATOR TO TWO. *** Its own
// `agreement()`/`noiseOf()` compare a noisy Monte Carlo estimator against a DETERMINISTIC quadrature reference,
// so only the MC side's measured relSd enters the bound. Neither side here is deterministic -- pathTracer.mjs
// and rtPipeline.mjs are both Monte Carlo -- so this measures EACH side's own relSd across N independent seeds
// and combines them in quadrature (the standard first-order variance of a ratio of two independent, roughly-
// unbiased estimators: relVar(A/B) ~= relVar(A) + relVar(B) for a ratio near 1), and because the comparison is
// between the MEAN of N seeded runs on each side rather than one single run, the bound uses the STANDARD ERROR
// of that mean (relSd / sqrt(N)), not the per-run relSd itself -- averaging N independent seeds genuinely
// tightens the bound, and a formula that used the per-run relSd here would be a looser bound than the evidence
// supports.
//
// SABOTAGE LOG (this round) -- each applied to the real file, gate run, exit read, file restored byte for byte:
//   A  bvhMaterialProbeWgsl's lookup replaced with a hardcoded `bvhSbt[0]`
//        -> exit=1, section 8's own check: 12 of 12 triangles read the WRONG record -- not just the 6 whose
//           true material happened to differ from record 0, all 12, because removing the only read of
//           bvhMatIdx made it statically unused and WebGPU's layout:"auto" dropped its binding from the
//           derived layout, misaligning the bind group (the same "an unused binding silently vanishes from the
//           layout" fact section 7's own debugging history already found once, here from the opposite side).
//   B  pathTracer.mjs's mesh intersect() branch: the triNormal() result negated before use
//        -> exit=1, section 9: cpu mean collapses to EXACTLY 0.600000 (the albedo itself) with 0.00% relSd
//           across all 8 seeds -- a flipped normal sends every bounce through the (zero-thickness) wall to the
//           OUTSIDE, where it escapes to sky on its very next segment, every time, deterministically. |ratio-1|
//           0.6206 against a bound of 0.0124 -- fifty times over, not a borderline miss.
//   C  the open box's OWN winding: the back face's indices reverted to section 7's outward (hull) convention
//        -> exit=1, but NOT on section 9's statistical check -- section 8's winding-direction assertion catches
//           it by name (FAIL) while the statistical comparison PASSES (ratio 0.9987, comfortably inside bound).
//        *** THIS IS THE FINDING WORTH KEEPING, NOT JUST A THIRD RED. *** A winding bug lives in the MESH DATA,
//        which both renderers read identically -- CPU's triNormal() and the WGSL's rtTriNormal() are the same
//        cross(e1,e2) formula, so a wrong triangle winding is wrong on BOTH sides the SAME way, and the two
//        renderers still agree with each other on the resulting (wrong) scene. This is samplerCheck.mjs's own
//        "a shared bug agrees perfectly and is perfectly wrong" warning, one level up: not a shared SAMPLER this
//        time, a shared INPUT. It is exactly why the winding-direction assertion stays a SEPARATE, explicit
//        check rather than being folded into "the statistical gate covers geometry too" -- it structurally
//        cannot, and this sabotage is the proof rather than an assumption.
"use strict";

import { gateReport } from "../../tools/ship/gateReport.mjs";
import { webgpuSkipReason, runWgslCompute } from "../../tools/ship/webgpuHarness.mjs";
import * as R from "./rtPipeline.mjs";
import { baryAt, MeshBVH, trianglesFrom } from "../../mesh/meshBVH.mjs";
import { traceWgsl, traceUniforms } from "./pathTracerGpu.mjs";
import { render as renderCpuMesh } from "./pathTracer.mjs";
const REPORT = gateReport("physics/render/rtPipeline-selfcheck.mjs");
const REPORT_ROWS = [];

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

// ---- 1. THE STAGE LIST, WHICH IS THE WHOLE POINT OF THE ROUND ------------------------------------------------
// Four of Vulkan's five stages were already in v4417's loop, inlined and unnamed. This asserts they now have
// names AND that the fifth is still honestly absent.
{
    const src = R.pipelineWgsl({});
    const impl = R.STAGES.filter((s) => s.implemented);
    say(`Vulkan RT stages: ${impl.length} implemented of ${R.STAGES.length}`);
    for (const s of R.STAGES)
        say(`  ${s.implemented ? "PRESENT" : "ABSENT "}  ${s.id.padEnd(13)} ${s.fn || "--"}`);

    ok("every stage the list calls implemented is a NAMED function in the WGSL",
        impl.every((s) => new RegExp("fn\\s+" + s.fn + "\\s*\\(").test(src)),
        "the seams are the deliverable: a stage that is only a comment is still inlined");
    ok("!! and any-hit is ABSENT and SAYS SO rather than being dropped from the list",
        R.STAGES.some((s) => s.id === "anyHit" && !s.implemented) &&
        !/fn\s+rtAnyHit\s*\(/.test(src),
        "a stage list that quietly omitted the row it cannot fill would report a complete pipeline. When " +
        "somebody writes an any-hit shader, flip `implemented` -- do not delete this check");
    ok("the binding table is read as DATA, not branched on at the call site",
        /U\[SBT_BASE \+ /.test(src) && /switch \(shaderIndex\)/.test(src),
        "WGSL has no function pointers and neither does WebRTX -- both compile the dispatch to a switch. " +
        "What makes it a table is that the INDEX comes out of a buffer, so adding a geometry never edits " +
        "the traversal");
}

const skip = webgpuSkipReason();
if (skip) {
    console.log("  SKIP  no WebGPU device: " + skip);
    console.log("pathTracer sections 2-4 NOT MEASURED -- a short report is not a clean one");
    console.log("rtPipeline-selfcheck: " + (fails ? fails + " FAILED" : "all pass (CPU sections only)"));
    process.exit(fails ? 1 : 0);
}

const gpu = async (sbt, { view, spp = 16, eps = 1e-4, shader = {} }) => {
    const n = view.w * view.h;
    const r = await runWgslCompute({ code: R.pipelineWgsl(shader), outCount: n,
                                     uniforms: R.pipelineUniforms(sbt, { spp, view, eps }),
                                     workgroups: Math.ceil(n / 64) });
    if (!r.ok) throw new Error("GPU run failed: " + r.reason + " " + (r.errors || []).join(" | "));
    return r.values;
};
const cmp = (a, b) => {
    let bad = 0, mx = 0; const deltas = [];
    for (let i = 0; i < b.length; i++) {
        const d = Math.abs(a[i] - b[i]);
        if (a[i] !== b[i]) { bad++; deltas.push(d); }
        if (d > mx) mx = d;
    }
    return { bad, mx, n: b.length, deltas };
};
const V = (w) => ({ ...R.VIEW, w, h: w });
const rec = R.sbtRecord;

// ---- 2. THE SPLIT CHANGED NOTHING -- A REFACTOR ORACLE THAT IS BIT-EXACT ------------------------------------
{
    say("");
    const one = [rec({ centre: [0, 0, 0], radius: 1, albedo: 0.5 })];
    const view = V(24), spp = 16;
    const mono = (await runWgslCompute({ code: traceWgsl({}), outCount: 576,
                                         uniforms: traceUniforms({ spp, view, eps: 1e-4 }), workgroups: 9 })).values;
    const a = cmp(await gpu(one, { view, spp }), mono);
    const b = cmp(await gpu(one, { view, spp }), R.renderSbtCpu(one, { spp, view }));
    say(`pipeline vs v4417 monolith: ${a.bad} of ${a.n} differ`);
    say(`pipeline vs CPU f64:        ${b.bad} of ${b.n} differ`);
    ok("!! splitting the monolith into named stages changed NOTHING, bit for bit",
        a.bad === 0 && b.bad === 0,
        "a rearrangement that moved a number would be a rewrite wearing a refactor's clothes. This is the " +
        "check that says the seams are free");
}

// ---- 3. THE CAPABILITY: TWO GEOMETRIES, TWO MATERIALS, ONE DISPATCH -----------------------------------------
// v4417's shader has `albedo` as a single uniform scalar. There is nowhere to put a second one.
{
    say("");
    const two = [rec({ centre: [-1.2, 0, 0], radius: 0.6, albedo: 0.5 }),
                 rec({ centre: [1.2, 0, 0], radius: 0.6, albedo: 0.25 })];
    const touch = [rec({ centre: [-1, 0, 0], radius: 1, albedo: 0.5 }),
                   rec({ centre: [1, 0, 0], radius: 1, albedo: 0.25 })];
    ok("both preconditions still hold over a whole TABLE, not one albedo",
        R.tablePreconditions(two, 16).exact === true &&
        R.tablePreconditions([rec({ albedo: 0.3 })], 16).exact === false,
        "interreflection MULTIPLIES albedos, so one non-dyadic entry contaminates every path touching it");

    let worst = 0;
    for (const [name, sbt] of [["apart", two], ["TOUCHING", touch]])
        for (const [w, spp] of [[24, 16], [32, 64], [48, 16]]) {
            const view = V(w);
            const r = cmp(await gpu(sbt, { view, spp }), R.renderSbtCpu(sbt, { spp, view }));
            say(`  two spheres ${name.padEnd(9)} ${w}x${w} spp=${String(spp).padStart(2)} -> ${r.bad} of ${r.n} differ`);
            // v4423 -- emitted, not only printed: gateReport-selfcheck's rule since v4399.
            REPORT_ROWS.push([name, `${w}x${w}`, String(spp), `${r.bad} of ${r.n}`]);
            worst = Math.max(worst, r.bad);
        }
    ok("!! *** TWO geometries with TWO albedos are BIT-EXACT against the CPU ***",
        worst === 0,
        "this is what the monolith cannot express at all, graded by the SAME instrument as the one-sphere " +
        "case rather than by a new tolerance. Touching spheres are included so the interreflection is real");

    // The table must actually decide. Both plants are parameters, not edited copies.
    const view = V(24), spp = 16, ref = R.renderSbtCpu(two, { spp, view });
    const swap = cmp(await gpu(two, { view, spp, shader: { plantSwapRecords: true } }), ref);
    const ign = cmp(await gpu(two, { view, spp, shader: { plantIgnoreRecord: true } }), ref);
    say(`  PLANT swap records:  ${swap.bad} differ, max|d| ${swap.mx.toExponential(3)}`);
    say(`  PLANT ignore record: ${ign.bad} differ, max|d| ${ign.mx.toExponential(3)}`);
    ok("!! and reading the WRONG record changes the picture -- the table is load-bearing",
        swap.bad > 50 && ign.bad > 50,
        "without this, section 3 would pass on a shader that ignored the table and hardcoded one albedo");
}

// ---- 4. *** WHERE THE ORACLE STOPS, MEASURED RATHER THAN HOPED *** ------------------------------------------
// One geometry is bit-exact BY AN ARGUMENT: a sphere is convex, every bounce escapes, the sampler never
// reaches the pixel. TWO OR MORE IS BIT-EXACT ONLY AS AN OBSERVATION -- a bounce can land on a neighbour, so
// the route depends on a direction f32 and f64 disagree about. It survives two spheres and breaks at three.
{
    say("");
    const three = [rec({ centre: [-1.3, 0, 0], radius: 0.6, albedo: 0.5 }),
                   rec({ centre: [0, 0, 0], radius: 0.6, albedo: 0.25 }),
                   rec({ centre: [1.3, 0, 0], radius: 0.6, albedo: 0.75 })];
    const view = V(32), spp = 64;
    const cpu = R.renderSbtCpu(three, { spp, view });
    const r = cmp(await gpu(three, { view, spp }), cpu);
    say(`three spheres 32x32 spp=64: ${r.bad} of ${r.n} differ, max|d| ${r.mx.toExponential(3)}`);
    say(`CPU pixels not representable in f32: ${R.notExactInF32(cpu)} of ${r.n}  (the values stay dyadic)`);

    ok("the values are STILL exactly representable -- products of dyadic albedos are dyadic",
        R.notExactInF32(cpu) === 0,
        "so a disagreement here is a different PATH, never a rounding drift. That is what makes the next " +
        "check meaningful");
    ok("!! agreement is still better than 99.5%, so this is a boundary and not a broken port",
        r.bad / r.n < 0.005, `${r.bad} of ${r.n}`);
    ok("!! *** and every differing pixel differs by a WHOLE SAMPLE, not by float drift ***",
        r.deltas.every((d) => d * spp >= 1 / 4),
        "delta x spp for each: [" + r.deltas.map((d) => (d * spp).toFixed(4)).join(", ") + "]. A rounding " +
        "difference would be ~1e-7; a path that took a different route at a neighbour's silhouette is O(1). " +
        "THE CHECK IS THAT THE BREAKAGE HAS THE RIGHT SHAPE -- if this ever fails, the port drifted rather " +
        "than a sample flipping, and that IS a bug");
}

// ---- 5. THE MATERIAL THE REFERENCE RENDERER DOES NOT HAVE ---------------------------------------------------
// *** THE FIRST DRAFT OF THIS FILE SILENTLY FLATTENED A MIRROR INTO A LAMBERTIAN AND REPORTED 15 OF 576
// PIXELS "DIFFERING". *** A conversion that drops a field is a second declaration of the scene -- committed
// inside the round whose whole subject is that the material is DATA. It is a REFUSAL now, not a note.
{
    say("");
    const mirror = [rec({ centre: [-1.2, 0, 0], radius: 0.6, albedo: 0.5, hit: "mirror" }),
                    rec({ centre: [1.2, 0, 0], radius: 0.6, albedo: 0.25 })];
    ok("cpuComparable() says a mirror table has no CPU answer",
        R.cpuComparable(mirror) === false &&
        R.cpuComparable([rec({ albedo: 0.5 })]) === true);
    let threw = null;
    try { R.sceneFromSbt(mirror); } catch (e) { threw = e.message; }
    ok("!! and converting one REFUSES rather than flattening it",
        threw !== null && /no material for/.test(threw),
        "flattening reports a GPU mirror against a CPU diffuse as a port error -- a number with no meaning " +
        "that looks exactly like a small bug. DO NOT make this a warning");

    // The mirror still has to DISPATCH, which is checkable without an oracle for its correctness.
    //
    // *** AND THE FIRST DRAFT ASSERTED `diff > 20` ON A CONSTANT SKY AND MEASURED 15. *** The guessed
    // threshold was wrong and the REASON it was wrong is this round's own subject arriving a third time: IN A
    // UNIFORM ENVIRONMENT EVERY BOUNCE DIRECTION RETURNS THE SAME RADIANCE, so a mirror and a diffuse produce
    // the same pixel. The 15 that do differ are only the paths that happened to hit the OTHER sphere.
    //
    // THE FURNACE CANNOT SEE THE SAMPLER (v4417 section 4), CANNOT SEE A BROKEN SEEDING SCHEME (v3487), AND
    // CANNOT SEE THE MATERIAL (here). Those are not three facts. They are one fact -- a constant environment
    // makes the outgoing direction irrelevant -- found at three sites across three rounds. So the dispatch is
    // graded on the GRADIENT sky, where direction decides the answer, and both numbers are recorded because
    // the gap between them IS the evidence.
    const view = V(24), spp = 16;
    const lam = [rec({ centre: [-1.2, 0, 0], radius: 0.6, albedo: 0.5 }),
                 rec({ centre: [1.2, 0, 0], radius: 0.6, albedo: 0.25 })];
    const count = async (gradient) => {
        const a = await gpu(mirror, { view, spp, shader: { gradient } });
        const b = await gpu(lam, { view, spp, shader: { gradient } });
        let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d;
    };
    const flat = await count(false), grad = await count(true);
    say(`mirror record vs lambertian record -- CONSTANT sky: ${flat} of 576 differ`);
    say(`mirror record vs lambertian record -- GRADIENT sky: ${grad} of 576 differ`);
    ok("!! the table dispatches to a DIFFERENT closest-hit when the record says so",
        grad > 50,
        "graded on the gradient sky, where the bounce direction decides the answer. This grades DISPATCH and " +
        "NOT the mirror's correctness -- there is no reference renderer for that, and section 5 refuses to " +
        "invent one rather than reporting a number it cannot justify");
    ok("!! ...and a CONSTANT sky can barely tell the two materials apart, which is why it is not the judge",
        flat < grad / 3,
        `${flat} against ${grad}. A uniform environment returns the same radiance in every direction, so a ` +
        "mirror and a diffuse agree except where a path happens to strike the other sphere. THIS PASSING IS " +
        "THE POINT: it is the furnace's blindness measured a third time, after the sampler (v4417) and the " +
        "seeding scheme (v3487). Do not 'fix' it by moving this check to the gradient sky");
}

// ---- 6. THE BVH: AN INTERSECTION ORACLE, NOT A RENDERING ONE ---------------------------------------------------
// pathTracer.mjs's scene is spheres; it has no concept of a triangle at all, so there is no CPU RADIANCE
// reference to grade a shaded mesh against -- the same honest gap section 5 already refuses to paper over for
// a mirror record. What DOES have an answer key is the traversal itself: mesh/meshBVH.mjs's own raycastFirst()
// has been the tested CPU implementation since before this round existed. This asks whether the WGSL port
// finds the SAME triangle at the SAME distance, for the same rays over the same mesh.
{
    say("");
    // A unit cube, 12 triangles, 8 vertices -- enough for the binned-SAH build to split (maxLeaf=8 default
    // gives 2 leaves), and small enough that every triangle and every shared edge is known by hand.
    const positions = [
        [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
        [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ];
    // *** WOUND SO EVERY FACE'S NORMAL POINTS OUTWARD, AND THE FIRST DRAFT WAS NOT. *** rtIntersectTri's
    // Möller-Trumbore is winding-AGNOSTIC for hit/miss (only a near-zero determinant is rejected, on either
    // sign), so section 6's own intersection-vs-raycastFirst check above never noticed a hand-authored cube
    // wound the wrong way -- all twelve faces had inward normals, cross(e1,e2) pointing INTO the cube.
    // rtVertColor's normal-dependent shading found it immediately: an inward normal sends a diffuse bounce
    // back INTO a convex shape, where it can trap for the full depth budget and return radiance {0,0,0} --
    // measured directly, not inferred, by outputting the first-hit albedo alone (correct, colourful) against
    // the full bounced render (near-black). Fixed by swapping each triangle's last two indices.
    const indices = [
        [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 5, 4], [0, 1, 5],
        [3, 6, 2], [3, 7, 6], [0, 7, 3], [0, 4, 7], [1, 6, 5], [1, 2, 6],
    ];
    const bvh = R.bvhBuffersFromMesh(positions, indices);
    say(`cube BVH: ${bvh.nodeCount} nodes, ${bvh.triCount} triangles, depth ${bvh.bvh.depth}`);

    const rays = [];
    const pushRay = (o, d) => { const l = Math.hypot(d[0], d[1], d[2]); rays.push(o[0], o[1], o[2], d[0] / l, d[1] / l, d[2] / l); };
    pushRay([0, 0, -5], [0, 0, 1]); pushRay([0, 0, 5], [0, 0, -1]);
    pushRay([5, 0, 0], [-1, 0, 0]); pushRay([0, 5, 0], [0, -1, 0]);
    pushRay([-5, -5, -5], [1, 1, 1]);        // corner-ish diagonal
    pushRay([10, 10, 10], [1, 1, 1]);        // miss -- points away from the cube
    pushRay([2, 2, -5], [0, 0, 1]);          // miss -- offset outside the cube's xy extent
    pushRay([0.9, 0.9, -5], [0, 0, 1]);      // near a corner of a face, should still hit
    for (let i = 0; i < 24; i++) {
        const a1 = (i / 24) * Math.PI * 2, a2 = ((i * 7) % 24 / 24) * Math.PI;
        const ox = 5 * Math.sin(a2) * Math.cos(a1), oy = 5 * Math.sin(a2) * Math.sin(a1), oz = 5 * Math.cos(a2);
        pushRay([ox, oy, oz], [-ox + (i % 3 - 1) * 0.3, -oy + (i % 5 - 2) * 0.2, -oz]);
    }
    const rayCount = rays.length / 6;

    const probe = await runWgslCompute({ code: R.bvhProbeWgsl(rayCount), outCount: rayCount * 2,
                                         workgroups: Math.ceil(rayCount / 64),
                                         inputs: [...R.bvhInputs(bvh), { binding: 6, data: new Float32Array(rays) }] });
    if (!probe.ok) throw new Error("bvh probe GPU run failed: " + probe.reason + " " + (probe.errors || []).join(" | "));

    let mismatches = 0, tieMismatches = 0;
    for (let i = 0; i < rayCount; i++) {
        const [ox, oy, oz, dx, dy, dz] = rays.slice(i * 6, i * 6 + 6);
        const cpu = bvh.bvh.raycastFirst(ox, oy, oz, dx, dy, dz);
        const gpuT = probe.values[i * 2], gpuTri = Math.round(probe.values[i * 2 + 1]);
        const cpuT = cpu ? cpu.t : -1, cpuTri = cpu ? cpu.tri : -1;
        const hitAgree = (gpuT > 0) === (cpuT > 0);
        const tAgree = cpuT < 0 || Math.abs(gpuT - cpuT) < 1e-3;
        if (!hitAgree || !tAgree) { mismatches++; continue; }
        // A DIFFERENT triangle at the IDENTICAL distance is not a bug: it is a ray landing exactly on an edge
        // two triangles share, where both report the same t and either is a correct nearest hit. Verified by
        // hand below that this only ever happens between triangles that actually share two vertices.
        if (cpuT >= 0 && gpuTri !== cpuTri) {
            const shared = indices[gpuTri].filter((v) => indices[cpuTri].includes(v));
            if (shared.length === 2) tieMismatches++; else mismatches++;
        }
    }
    say(`${rayCount} rays against the cube: ${mismatches} true mismatches, ${tieMismatches} genuine shared-edge ties`);
    ok("!! the ported BVH traversal finds the SAME hit -- or a co-located tie -- as meshBVH.mjs's raycastFirst()",
        mismatches === 0,
        "a mismatch that is not a verified shared-edge tie would mean the port drifted from the CPU answer key " +
        "it was measured against, the same standard section 2's refactor oracle holds the sphere path to");

    // The traversal is checkable in isolation; the MERGE into a real render is not, because there is no CPU
    // radiance reference for a triangle at all (pathTracer.mjs's scene is spheres, full stop). What IS
    // checkable without inventing an oracle: a camera looking only at the mesh sees the mesh, not a blank sky.
    const view = { ...R.VIEW, w: 32, h: 32 };
    const meshRender = await runWgslCompute({
        code: R.pipelineWgsl({ bvh: true }), outCount: view.w * view.h, workgroups: Math.ceil(view.w * view.h / 64),
        uniforms: R.pipelineUniforms([], { view, spp: 16, eps: 1e-4,
                                           bvh: { nodeCount: bvh.nodeCount, triCount: bvh.triCount, hit: "lambertian", albedo: 0.6 } }),
        inputs: R.bvhInputs(bvh),
    });
    if (!meshRender.ok) throw new Error("mesh render GPU run failed: " + meshRender.reason);
    const nonSky = meshRender.values.filter((v) => Math.abs(v - 1.0) > 1e-4).length;
    say(`camera facing the bare cube, no spheres: ${nonSky} of ${meshRender.values.length} px are not sky`);
    REPORT_ROWS.push(["bvh cube", `${view.w}x${view.h}`, "16", `${nonSky} of ${meshRender.values.length} not sky`]);
    ok("!! a scene with ONLY a bvh mesh actually renders the mesh, not a uniform sky frame",
        nonSky > meshRender.values.length * 0.2,
        `${nonSky} of ${meshRender.values.length} -- a unit cube centred in a 32x32 frame should cover a real ` +
        "fraction of the image; a number near 0 would mean the geometry slot merge in rtTraverse never fires");

    // *** AND THE SPHERE-ONLY PATH TAKES THE EXACT SAME ROUTE IT ALWAYS DID. *** Every caller before this round
    // calls pipelineWgsl({}) with no bvh option, and section 2 already proved that byte-exact against the CPU.
    // This re-proves it is STILL true after the bvh block exists in the file, because the merge in rtTraverse
    // is guarded by a runtime uniform flag, not by which WGSL text got generated -- a real way for this round
    // to have broken the old behaviour even with `bvh` template-conditional.
    const one = [rec({ centre: [0, 0, 0], radius: 1, albedo: 0.5 })];
    const v2 = V(24);
    const stillExact = cmp(await gpu(one, { view: v2, spp: 16 }), R.renderSbtCpu(one, { spp: 16, view: v2 }));
    ok("!! and the sphere-only path is UNCHANGED by this round -- still bit-exact against the CPU",
        stillExact.bad === 0,
        "the bvh merge in rtTraverse reads U[MESH_META].x at runtime; this proves a scene that never sets it " +
        "renders exactly as it did before this round, not merely that the generated WGSL happens to still compile");
}

// ---- 7. SHADING: vec3 ALBEDO, AND VERTEX COLOUR AGAINST AN INDEPENDENT CPU METHOD ------------------------------
{
    say("");
    // *** vec3 ALBEDO -- BIT-EXACT AGAINST pathTracer.mjs's OWN rgb:true, NO NEW MACHINERY NEEDED. *** v3497's
    // header already argues the three channels walk ONE path (every random decision is channel-independent)
    // and differ only in what they multiply -- so dyadic RGB triples should stay exactly representable the
    // same way one dyadic scalar albedo already does, and the check below is that argument re-run in colour.
    const two = [rec({ centre: [-1.2, 0, 0], radius: 0.6, albedo: [0.5, 0.25, 0.75] }),
                 rec({ centre: [1.2, 0, 0], radius: 0.6, albedo: [0.25, 0.5, 0.125] })];
    const view = V(24), spp = 16;
    const rgbGpu = await runWgslCompute({
        code: R.pipelineWgsl({ rgb: true }), outCount: view.w * view.h * 3, workgroups: Math.ceil(view.w * view.h / 64),
        uniforms: R.pipelineUniforms(two, { spp, view, eps: 1e-4, rgb: true }),
    });
    if (!rgbGpu.ok) throw new Error("rgb sphere render GPU run failed: " + rgbGpu.reason);
    const rgbCpu = R.renderSbtCpu(two, { spp, view, rgb: true });
    let rgbBad = 0; for (let i = 0; i < rgbCpu.length; i++) if (rgbGpu.values[i] !== rgbCpu[i]) rgbBad++;
    say(`RGB two-sphere vs CPU f64 RGB: ${rgbBad} of ${rgbCpu.length} differ`);
    ok("!! vec3 albedo is bit-exact against pathTracer.mjs's own rgb:true reference, same as scalar always was",
        rgbBad === 0,
        "three dyadic channels multiplying independently stay exactly representable for the same reason one " +
        "dyadic scalar does -- v3497's own argument, checked rather than assumed to still hold for a mesh " +
        "scene's material as well as a sphere's");

    // *** VERTEX COLOUR -- CROSS-CHECKED AGAINST mesh/meshBVH.mjs's baryAt(), A DIFFERENT METHOD FOR THE SAME
    // NUMBER. *** rtVertColor interpolates using Möller-Trumbore's own u/v (a byproduct of the hit test);
    // baryAt derives barycentric weights a SECOND way, by projecting onto the edge basis. Agreement between
    // the two is evidence neither method has the same latent bug, not just that one WGSL line matches its own
    // JS transcription.
    const positions = [
        [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
        [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ];
    // The same rewound cube as section 6 -- outward normals, needed for a real hit to shade at all. Section
    // 6's own `indices` is block-scoped there, so it is restated here rather than reached across sections.
    const shadeIndices = [
        [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 5, 4], [0, 1, 5],
        [3, 6, 2], [3, 7, 6], [0, 7, 3], [0, 4, 7], [1, 6, 5], [1, 2, 6],
    ];
    const colors = positions.map((_, i) => [i / 7, 1 - i / 7, 0.5]);
    const coloredBvh = R.bvhBuffersFromMesh(positions, shadeIndices, { colors });

    const shadeRays = [];
    const pushShadeRay = (o, d) => { const l = Math.hypot(d[0], d[1], d[2]); shadeRays.push(o[0], o[1], o[2], d[0] / l, d[1] / l, d[2] / l); };
    for (let i = 0; i < 24; i++) {
        const a1 = (i / 24) * Math.PI * 2, a2 = ((i * 5) % 24 / 24) * Math.PI;
        const ox = 4 * Math.sin(a2) * Math.cos(a1), oy = 4 * Math.sin(a2) * Math.sin(a1), oz = 4 * Math.cos(a2);
        pushShadeRay([ox, oy, oz], [-ox, -oy, -oz]);
    }
    const shadeRayCount = shadeRays.length / 6;
    const shadeGpu = await runWgslCompute({
        code: R.bvhShadeProbeWgsl(shadeRayCount), outCount: shadeRayCount * 3, workgroups: Math.ceil(shadeRayCount / 64),
        inputs: [...R.bvhInputs(coloredBvh), { binding: 6, data: new Float32Array(shadeRays) }],
    });
    if (!shadeGpu.ok) throw new Error("shade probe GPU run failed: " + shadeGpu.reason + " " + (shadeGpu.errors || []).join(" | "));

    let shadeChecked = 0, shadeBad = 0, maxShadeDelta = 0;
    for (let i = 0; i < shadeRayCount; i++) {
        const [ox, oy, oz, dx, dy, dz] = shadeRays.slice(i * 6, i * 6 + 6);
        const cpuHit = coloredBvh.bvh.raycastFirst(ox, oy, oz, dx, dy, dz);
        const gR = shadeGpu.values[i * 3], gG = shadeGpu.values[i * 3 + 1], gB = shadeGpu.values[i * 3 + 2];
        if (!cpuHit) { continue; }   // a miss has nothing for baryAt to interpolate against
        shadeChecked++;
        const [wA, wB, wC] = baryAt(coloredBvh.bvh.tris, cpuHit.tri * 9, cpuHit.point[0], cpuHit.point[1], cpuHit.point[2]);
        const [iA, iB, iC] = shadeIndices[cpuHit.tri];
        const expect = [0, 1, 2].map((c) => wA * colors[iA][c] + wB * colors[iB][c] + wC * colors[iC][c]);
        const delta = Math.max(Math.abs(gR - expect[0]), Math.abs(gG - expect[1]), Math.abs(gB - expect[2]));
        maxShadeDelta = Math.max(maxShadeDelta, delta);
        if (delta > 1e-3) shadeBad++;
    }
    say(`${shadeChecked} of ${shadeRayCount} rays hit the mesh; vertex colour vs baryAt(): ${shadeBad} disagree, max|d|=${maxShadeDelta.toExponential(3)}`);
    REPORT_ROWS.push(["vertex colour", `${shadeChecked} hits`, "n/a", `${shadeBad} disagree, max ${maxShadeDelta.toExponential(2)}`]);
    ok("!! rtVertColor's interpolation matches meshBVH.mjs's baryAt() -- two different barycentric derivations, one answer",
        shadeChecked > 5 && shadeBad === 0,
        "Moller-Trumbore's u/v and baryAt's projection are different formulas for the same geometric quantity; " +
        "agreement to f32 tolerance is real evidence, not a comparison against its own source");

    // *** WHAT THE FIRST DRAFT'S BUG ACTUALLY LOOKED LIKE, KEPT AS A NAMED REGRESSION CHECK. *** An inward
    // normal does not fail to compile and does not fail the intersection oracle -- it renders a near-black
    // frame that looks exactly like a shading bug. This asserts the specific, cheap signature: the FIRST-HIT
    // albedo (no bouncing) must show real per-channel variance, which is what section 7's own investigation
    // used to tell "the colour math is fine" from "the mesh is trapping rays" in the first place.
    ok("!! this cube's outward normals are not a fluke -- every face's cross(e1,e2) actually points away from centre",
        shadeIndices.every(([a, b, c]) => {
            const A = positions[a], B = positions[b], C = positions[c];
            const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
            const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
            const centroid = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
            return n[0] * centroid[0] + n[1] * centroid[1] + n[2] * centroid[2] > 0;   // outward dot centroid-direction > 0
        }),
        "the exact regression this section's header describes: a mesh whose normals point inward renders " +
        "near-black instead of failing loudly, so this is checked by name rather than left to be noticed again");
}

// ---- 8. MULTI-MATERIAL: THE SBT OFFSET, PER TRIANGLE, WITHIN ONE BLAS -----------------------------------------
{
    say("");
    const positions = [
        [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
        [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ];
    // The same rewound (outward-normal) cube sections 6-7 use.
    const indices = [
        [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 5, 4], [0, 1, 5],
        [3, 6, 2], [3, 7, 6], [0, 7, 3], [0, 4, 7], [1, 6, 5], [1, 2, 6],
    ];
    // Alternating materials, one triangle apart -- so a wrong OFFSET (reading the previous or next triangle's
    // material) is caught by every adjacent pair, not just averaged away.
    const materialIndex = indices.map((_, i) => i % 2);
    const records = [{ hit: "lambertian", albedo: 0.9 }, { hit: "lambertian", albedo: 0.1 }];
    const bvh = R.bvhBuffersFromMesh(positions, indices, { materialIndex });
    const sbtBuf = R.meshSbtBuffer(records, { rgb: true });

    // One ray per triangle, straight at its own centroid from 5x out (exactly on the line through the origin,
    // so it lands on the centroid with no edge ambiguity) -- reused from bvhShadeProbeWgsl's own convention.
    const matRays = [];
    for (const [a, b, c] of indices) {
        const cx = (positions[a][0] + positions[b][0] + positions[c][0]) / 3;
        const cy = (positions[a][1] + positions[b][1] + positions[c][1]) / 3;
        const cz = (positions[a][2] + positions[b][2] + positions[c][2]) / 3;
        const ox = cx * 5, oy = cy * 5, oz = cz * 5;
        const dx = -ox, dy = -oy, dz = -oz, l = Math.hypot(dx, dy, dz);
        matRays.push(ox, oy, oz, dx / l, dy / l, dz / l);
    }
    const matRayCount = matRays.length / 6;
    const matProbe = await runWgslCompute({
        code: R.bvhMaterialProbeWgsl(matRayCount), outCount: matRayCount * 3, workgroups: Math.ceil(matRayCount / 64),
        inputs: [...R.bvhInputs(bvh), { binding: 6, data: new Float32Array(matRays) },
                 { binding: R.BVH_BINDINGS.meshSbt, data: sbtBuf }],
    });
    if (!matProbe.ok) throw new Error("material probe GPU run failed: " + matProbe.reason + " " + (matProbe.errors || []).join(" | "));

    let matBad = 0;
    for (let t = 0; t < indices.length; t++) {
        const expected = records[materialIndex[t]].albedo;
        const r = matProbe.values[t * 3], g = matProbe.values[t * 3 + 1], b = matProbe.values[t * 3 + 2];
        if (Math.abs(r - expected) > 1e-5 || Math.abs(g - expected) > 1e-5 || Math.abs(b - expected) > 1e-5) matBad++;
    }
    say(`${indices.length} triangles, alternating materials: ${matBad} read the wrong record`);
    REPORT_ROWS.push(["multi-material probe", `${indices.length} tris`, "n/a", `${matBad} wrong of ${indices.length}`]);
    ok("!! every triangle reads its OWN assigned material through bvhMatIdx[bvhHitTri] -> bvhSbt, not its neighbour's",
        matBad === 0,
        "materials alternate one triangle apart specifically so an off-by-one OFFSET -- reading the adjacent " +
        "triangle's record -- fails on every pair rather than being averaged into a plausible-looking mean");

    // *** THE SINGLE-MATERIAL PATH IS UNCHANGED. *** meshMaterials defaults to false, and pipelineUniforms still
    // writes MESH_SBT_SLOT exactly as it always has when it is omitted -- this re-proves sections 6-7's own
    // single-record scenes render identically, the same regression discipline section 6 already applies to the
    // sphere-only path.
    const singleBvh = R.bvhBuffersFromMesh(positions, indices);
    const singleView = { ...R.VIEW, w: 24, h: 24 };
    const singleUniforms = R.pipelineUniforms([], { spp: 16, view: singleView, eps: 1e-4,
        bvh: { nodeCount: singleBvh.nodeCount, triCount: singleBvh.triCount, hit: "lambertian", albedo: 0.6 } });
    const singleGpu = await runWgslCompute({
        code: R.pipelineWgsl({ bvh: true }), outCount: singleView.w * singleView.h, workgroups: Math.ceil(singleView.w * singleView.h / 64),
        uniforms: singleUniforms, inputs: R.bvhInputs(singleBvh),
    });
    if (!singleGpu.ok) throw new Error("single-material control GPU run failed: " + singleGpu.reason);
    const singleNonSky = singleGpu.values.filter((v) => Math.abs(v - 1.0) > 1e-4).length;
    ok("!! and the single-record mesh path (meshMaterials omitted) still renders the mesh, unchanged by this round",
        singleNonSky > singleGpu.values.length * 0.2,
        `${singleNonSky} of ${singleGpu.values.length} not sky -- the same shape section 6's own single-material check asserts`);
}

// ---- 9. THE STATISTICAL GATE -- A CONCAVE MESH, HELD TO A CPU MESH TRACER THAT DID NOT EXIST BEFORE THIS ROUND
{
    say("");
    // An open-top box: the cube's 8 vertices, the +y face omitted, each remaining face's winding flipped so
    // cross(e1,e2) points INTO the cavity (hand-verified: every face's normal dotted with -centroid is positive,
    // the same check section 7's own regression test runs, inverted for a cavity rather than a hull).
    const positions = [
        [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
        [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ];
    const indices = [
        [0, 1, 2], [0, 2, 3],       // back z=-1
        [4, 6, 5], [4, 7, 6],       // front z=+1
        [0, 4, 5], [0, 5, 1],       // bottom y=-1
        [0, 3, 7], [0, 7, 4],       // left x=-1
        [1, 5, 6], [1, 6, 2],       // right x=+1
    ];
    ok("!! every inner face's cross(e1,e2) points INTO the cavity, not away from it -- the inverse of section 7's own check",
        indices.every(([a, b, c]) => {
            const A = positions[a], B = positions[b], C = positions[c];
            const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
            const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
            const centroid = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
            return -(n[0] * centroid[0] + n[1] * centroid[1] + n[2] * centroid[2]) > 0;
        }),
        "the exact mirror of section 7's regression: a cavity whose normals face OUTWARD (the closed-hull " +
        "convention) would let a bounce escape on its first try, same as looking at a convex shape from outside " +
        "-- there would be no interreflection to compare");

    const cpuBvh = new MeshBVH(trianglesFrom(positions, indices));
    const gpuBvh = R.bvhBuffersFromMesh(positions, indices);
    const W = 12, H = 12, SPP = 64, ALBEDO = 0.6, N = 8;
    // Looking straight down through the opening from just outside it, at a narrow FOV: at eye height 1.5 and a
    // 30-degree FOV, the frustum's edge reaches the opening's own y=1 plane at |0.5*tan(15deg)| = 0.134, well
    // inside the opening's [-1,1] extent -- every primary ray enters the cavity, none can skim the outer hull
    // or reach the sky, which is what makes "no NEE, sky=1" measure interreflection ALONE with nothing else
    // mixed in (no silhouette antialiasing to mask out, unlike a convex shape viewed from outside).
    const view = { w: W, h: H, eye: [0, 1.5, 0], look: [0, -1, 0], up: [0, 0, -1], fovDeg: 30 };

    const cpuMeanAt = (seed) => {
        const img = renderCpuMesh([{ bvh: cpuBvh, albedo: ALBEDO }],
            { ...view, spp: SPP, seed, maxDepth: 8, sky: () => 1, nee: false });
        let sum = 0; for (const v of img) sum += v;
        return sum / img.length;
    };
    const gpuMeanAt = async (seed) => {
        const uniforms = R.pipelineUniforms([], { spp: SPP, seed, view, eps: R.EPS,
            bvh: { nodeCount: gpuBvh.nodeCount, triCount: gpuBvh.triCount, hit: "lambertian", albedo: ALBEDO } });
        const r = await runWgslCompute({ code: R.pipelineWgsl({ bvh: true }), outCount: W * H,
            workgroups: Math.ceil(W * H / 64), uniforms, inputs: R.bvhInputs(gpuBvh) });
        if (!r.ok) throw new Error("concave GPU render failed: " + r.reason);
        let sum = 0; for (const v of r.values) sum += v;
        return sum / r.values.length;
    };

    // *** PROOF THE MEAN IS ACTUALLY MEASURING INTERREFLECTION, NOT A SILHOUETTE OR A CAMERA MISTAKE. *** With
    // maxDepth=1 no bounce ever happens, so a non-trivial mean at maxDepth=8 can only come from radiance that
    // travelled through at least one bounce among the mesh's own triangles -- the one thing a convex shape
    // viewed from outside can never produce (section 4's whole reason bit-exactness held there).
    const noBounce = renderCpuMesh([{ bvh: cpuBvh, albedo: ALBEDO }], { ...view, spp: 16, seed: 1, maxDepth: 1, sky: () => 1, nee: false });
    const noBounceMean = noBounce.reduce((a, b) => a + b, 0) / noBounce.length;
    ok("!! every primary ray enters the cavity -- maxDepth=1 (no bounce) reads ~0, since there is no sky to see directly",
        noBounceMean < 1e-6, `maxDepth=1 mean ${noBounceMean.toExponential(3)}`);

    const cpuVals = [], gpuVals = [];
    for (let s = 1; s <= N; s++) cpuVals.push(cpuMeanAt(s));
    // *** DIFFERENT SEEDS ON PURPOSE -- see this file's header. *** Same LCG, same per-pixel seed formula, so
    // the SAME seed would draw the SAME raw randoms on both sides; offsetting the GPU's seed range is what
    // makes the two sides genuinely independent estimators rather than one sampler graded against its own echo.
    for (let s = 1; s <= N; s++) gpuVals.push(await gpuMeanAt(2000 + s));

    const meanOf = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    const sdOf = (v, m) => Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
    const cpuMean = meanOf(cpuVals), cpuRelSd = sdOf(cpuVals, cpuMean) / cpuMean;
    const gpuMean = meanOf(gpuVals), gpuRelSd = sdOf(gpuVals, gpuMean) / gpuMean;
    const ratio = gpuMean / cpuMean;
    // The bound is on the MEAN of N seeds, so it is the standard ERROR (relSd / sqrt(N)) that enters it, not
    // the per-run relSd -- this file's own header explains why a looser, per-run bound would be wrong here.
    const bound = 3 * Math.sqrt((cpuRelSd / Math.sqrt(N)) ** 2 + (gpuRelSd / Math.sqrt(N)) ** 2);

    say(`cpu (${N} seeds): mean ${cpuMean.toFixed(6)}, relSd ${(cpuRelSd * 100).toFixed(2)}%`);
    say(`gpu (${N} seeds, offset +2000): mean ${gpuMean.toFixed(6)}, relSd ${(gpuRelSd * 100).toFixed(2)}%`);
    say(`ratio ${ratio.toFixed(6)}, |ratio-1| ${Math.abs(ratio - 1).toFixed(6)}, 3-sigma bound ${bound.toFixed(6)}`);
    REPORT_ROWS.push(["concave open box", `${W}x${H}`, `${SPP} spp x ${N} seeds`,
        `cpu ${cpuMean.toFixed(5)} vs gpu ${gpuMean.toFixed(5)}, |ratio-1|=${Math.abs(ratio - 1).toExponential(2)}, bound=${bound.toExponential(2)}`]);
    ok("!! the GPU's concave mesh render agrees with a genuinely independent CPU mesh tracer, within 3 MEASURED standard errors",
        Math.abs(ratio - 1) < bound,
        "not bit-exact -- this scene is concave (section 4's own argument for why bit-exactness cannot survive " +
        "multi-geometry interreflection), so the claim is a STATISTICAL one, and the bound comes from each " +
        "side's own measured noise rather than a number somebody picked");
}

console.log("rtPipeline-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
REPORT.table("two spheres: CPU against the pipeline, per resolution and sample count", ["scene", "size", "spp", "pixels differing"], REPORT_ROWS,
    "A sweep whose numbers only reached the terminal it was written to is a measurement nobody can re-read.");
REPORT.write();
process.exit(fails ? 1 : 0);
