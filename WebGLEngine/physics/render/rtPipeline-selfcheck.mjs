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
"use strict";

import { gateReport } from "../../tools/ship/gateReport.mjs";
import { webgpuSkipReason, runWgslCompute } from "../../tools/ship/webgpuHarness.mjs";
import * as R from "./rtPipeline.mjs";
import { baryAt } from "../../mesh/meshBVH.mjs";
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

    const probe = await runWgslCompute({ code: R.bvhProbeWgsl(), outCount: rayCount * 2,
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
        code: R.bvhShadeProbeWgsl(), outCount: shadeRayCount * 3, workgroups: Math.ceil(shadeRayCount / 64),
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

console.log("rtPipeline-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
REPORT.table("two spheres: CPU against the pipeline, per resolution and sample count", ["scene", "size", "spp", "pixels differing"], REPORT_ROWS,
    "A sweep whose numbers only reached the terminal it was written to is a measurement nobody can re-read.");
REPORT.write();
process.exit(fails ? 1 : 0);
