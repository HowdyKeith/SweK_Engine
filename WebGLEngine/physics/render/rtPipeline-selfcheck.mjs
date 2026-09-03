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
"use strict";

import { gateReport } from "../../tools/ship/gateReport.mjs";
import { webgpuSkipReason, runWgslCompute } from "../../tools/ship/webgpuHarness.mjs";
import * as R from "./rtPipeline.mjs";
import { traceWgsl, traceUniforms } from "./pathTracerGpu.mjs";
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

console.log("rtPipeline-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
REPORT.table("two spheres: CPU against the pipeline, per resolution and sample count", ["scene", "size", "spp", "pixels differing"], REPORT_ROWS,
    "A sweep whose numbers only reached the terminal it was written to is a measurement nobody can re-read.");
REPORT.write();
process.exit(fails ? 1 : 0);
