#!/usr/bin/env node
// WebGLEngine/tools/ship/capsuleCollideTsl-selfcheck.mjs -- v4632
//
// Gates physics/character/capsuleCollideTsl.mjs (task board #86): the four geometric primitives
// (closestPointOnTriangle, closestSegmentSegment, segmentTriangleClosest, faceNormalToward) as TSL nodes,
// graded per-primitive against the REAL, already-shipped capsuleCollide.mjs functions they port; and the
// batched depenetrateCapsulesNode kernel, graded against a CPU reference that resolves the SAME fixed
// candidate-triangle list (not a live BVH re-query -- capsuleCollideTsl.mjs's own header explains why a GPU
// thread cannot re-query mid-dispatch, and this gate's CPU side is held to the identical constraint so the
// comparison is honest about what it claims).
//
// *** TWO REAL BUGS THIS GATE'S FIRST FULL RUN FOUND, BOTH FIXED HERE AND IN capsuleCollideTsl.mjs. *** (1)
// computeShell()'s storage elements here were declared "vec4" instead of "vec4<f32>" -- every OTHER passing
// gate in this tree spells it out (grep element: "vec4<f32>" across tools/ship), and the bare form emits
// invalid WGSL (`array<vec4>`, missing the component type) that fails to compile silently: dev.compute()
// swallows the createShaderModule error, so the pipeline "succeeds" and every dispatch reads back zeros --
// caught only by cross-checking against a SECOND implementation on the same data, not by any single run
// looking healthy. (2) faceNormalTowardNode had no zero-length guard on its cross product where the CPU's
// own faceNormalToward divides by `Math.hypot(...) || 1` -- f32's lower precision rounds a near-degenerate
// random triangle's cross product to exactly zero far more often than f64 does, so normalize() returned NaN
// on 1 of 505 cases; fixed by porting the same `|| 1` guard via select(). Sabotage-verified twice: inverting
// depenetrateCapsulesNode's grounded-check comparison turned 5 checks red by name (the named scenes it broke);
// pointing the vertex-a select-cascade case at vertex b turned only closestPointOnTriangleNode's check red,
// at max=3.033e+0 against the CPU. Both restored, gate re-confirmed ALL GREEN after.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { computeShell, transplantCompute } from "../../render/tslSource.mjs";
import { closestPointOnTriangle, closestSegmentSegment, segmentTriangleClosest, faceNormalToward, depenetrateCapsuleFixedTris } from "../../physics/character/capsuleCollide.mjs";
import { CONTACT_SKIN } from "../../physics/character/capsuleCollideTsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

// A tiny seeded PRNG (mulberry32) -- deterministic across runs, unlike Math.random(), so a failure here is
// reproducible rather than a one-off from whichever floats the last run happened to draw.
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---- section 1/2 fixtures: p0, p1 (a segment), a, b, c (a triangle) -- reused across all four primitives so
// one dispatch grades every primitive against the same shared, varied geometry.
function primitiveCases() {
    const rnd = mulberry32(0xC0FFEE);
    const r3 = (s) => [(rnd() - 0.5) * s, (rnd() - 0.5) * s, (rnd() - 0.5) * s];
    const cases = [];
    // hand-picked edge cases: zero-length segment (a <= EPS in closestSegSeg), a point exactly over a vertex,
    // over an edge midpoint, and a degenerate (collinear) triangle -- named branches this run must actually reach.
    cases.push({ p0: [0, 1, 0], p1: [0, 1, 0], a: [-1, 0, -1], b: [1, 0, -1], c: [0, 0, 1] });          // zero-length segment
    cases.push({ p0: [-1, 1, -1], p1: [-1, -1, -1], a: [-1, 0, -1], b: [1, 0, -1], c: [0, 0, 1] });     // p0/p1 straddle vertex a
    cases.push({ p0: [0, 1, -1], p1: [0, -1, -1], a: [-1, 0, -1], b: [1, 0, -1], c: [0, 0, 1] });       // straddle edge a-b midpoint
    cases.push({ p0: [0.2, 0.5, 0.2], p1: [0.2, -0.5, 0.2], a: [-1, 0, -1], b: [1, 0, -1], c: [0, 0, 1] });  // over the face interior
    cases.push({ p0: [0, 1, 0], p1: [0, -1, 0], a: [-1, 0, 0], b: [1, 0, 0], c: [2, 0, 0] });           // degenerate (collinear) triangle
    for (let i = 0; i < 500; i++) cases.push({ p0: r3(4), p1: r3(4), a: r3(3), b: r3(3), c: r3(3) });
    return cases;
}

// ---- section 3 fixtures: (capsule, fixed candidate triangle list) scenes for the full batched kernel.
const MAX_TRIS = 8;
function capsuleScenes() {
    const rnd = mulberry32(0x5EED);
    const scenes = [];
    const quad = (p0, p1, p2, p3) => [[p0, p1, p2], [p0, p2, p3]];

    // 1. resting on a flat floor, slightly embedded -- must ground.
    scenes.push({ name: "flat floor, embedded", feet: [0, -0.05, 0], radius: 0.4, height: 1.8,
        tris: quad([-5, 0, -5], [5, 0, -5], [5, 0, 5], [-5, 0, 5]) });
    // 2. resting exactly at the surface (dist === radius) -- the CONTACT_SKIN case, must still ground, zero push.
    scenes.push({ name: "resting exactly at radius", feet: [0, 0.4, 0], radius: 0.4, height: 1.8,
        tris: quad([-5, 0, -5], [5, 0, -5], [5, 0, 5], [-5, 0, 5]) });
    // 3. embedded in a vertical wall (x=0 plane) -- must push out along +x/-x, never grounded (normal.y = 0).
    scenes.push({ name: "wall, embedded", feet: [-0.1, 1, 0], radius: 0.4, height: 1.8,
        tris: quad([0, 0, -5], [0, 0, 5], [0, 5, 5], [0, 5, -5]) });
    // 4. an L-corner, embedded in both walls at once.
    scenes.push({ name: "corner, embedded in both walls", feet: [-0.1, 1, -0.1], radius: 0.4, height: 1.8,
        tris: [...quad([0, 0, -5], [0, 0, 5], [0, 5, 5], [0, 5, -5]), ...quad([-5, 0, 0], [5, 0, 0], [5, 5, 0], [-5, 5, 0])] });
    // 5. a walkable ramp (normal.y well above GROUND_SUPPORT_NORMAL_Y) -- must ground.
    scenes.push({ name: "walkable ramp", feet: [0, 0.1, 0], radius: 0.4, height: 1.8,
        tris: quad([-5, -1, -5], [5, -1, -5], [5, 1, 5], [-5, 1, 5]) });
    // 6. a too-steep ramp (normal.y below the limit) -- pushed out, but never grounded.
    scenes.push({ name: "too-steep ramp", feet: [0, 0.1, 0], radius: 0.4, height: 1.8,
        tris: quad([-5, -4, -5], [5, -4, -5], [5, 4, 5], [-5, 4, 5]) });
    // 7. nothing in range -- position must be unchanged, grounded false, contacts 0.
    scenes.push({ name: "nothing in range", feet: [50, 50, 50], radius: 0.4, height: 1.8, tris: [] });
    // 8. more candidates than MAX_TRIS slots (some real triangles are simply not offered to the kernel this
    //    dispatch -- named, not hidden: the CPU reference is held to the SAME truncated list, so this proves
    //    the kernel resolves whatever it is given, not that MAX_TRIS never truncates a real scene).
    {
        const many = [];
        for (let i = 0; i < MAX_TRIS + 4; i++) many.push([[-5 + i * 0.01, 0, -5], [5, 0, -5], [5, 0, 5]]);
        scenes.push({ name: "more candidates than MAX_TRIS (truncated identically on both sides)", feet: [0, -0.05, 0], radius: 0.4, height: 1.8, tris: many.slice(0, MAX_TRIS) });
    }
    for (let i = 0; i < 300; i++) {
        const n = 1 + Math.floor(rnd() * (MAX_TRIS - 1));
        const tris = [];
        for (let t = 0; t < n; t++) {
            const cx = (rnd() - 0.5) * 2, cy = (rnd() - 0.5) * 2, cz = (rnd() - 0.5) * 2;
            const jitter = () => [cx + (rnd() - 0.5) * 1.5, cy + (rnd() - 0.5) * 1.5, cz + (rnd() - 0.5) * 1.5];
            tris.push([jitter(), jitter(), jitter()]);
        }
        scenes.push({ name: `random #${i}`, feet: [(rnd() - 0.5) * 2, (rnd() - 0.5) * 2, (rnd() - 0.5) * 2], radius: 0.3 + rnd() * 0.3, height: 1.4 + rnd() * 0.8, tris });
    }
    return scenes;
}

// depenetrateCapsuleFixedTris (the GPU kernel's CPU twin, held to the same fixed candidate list) now lives in
// physics/character/capsuleCollide.mjs, imported above -- moved there so tools/roundhouse/
// capsuleDepenetrateBind.mjs can share the SAME implementation instead of a third copy that could drift.

{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const prims = primitiveCases();
        const scenes = capsuleScenes();
        const script = `async (a) => {
            const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
            const M = await import("/physics/character/capsuleCollideTsl.mjs"); const S = await import("/render/tslSource.mjs"); const { requestDevice } = await import("/gfx/device.js");
            const out = {};
            const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
            const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: false, antialias: false }); await renderer.init();
            const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8; const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            out.deviceBackend = dev.backend;

            // ---- PRIMITIVES: one dispatch, four outputs, graded per-primitive against the CPU. ----
            // segIn packs (p0,p1) as 2 vec4 elements per case and triIn packs (a,b,c) as 3 -- 5 separate input
            // buffers plus 4 outputs is 9 storage buffers in one compute stage, and this box's own adapter
            // (measured, not assumed -- the first draft of this gate hit the real WebGPU validation error)
            // defaults to an 8-per-stage limit. Two packed input buffers plus 4 outputs is 6.
            try {
                const N = a.prims.length;
                const { Fn, instanceIndex, instancedArray, vec4 } = T;
                const segIn = instancedArray(N * 2, "vec4").label("segIn");
                const triIn = instancedArray(N * 3, "vec4").label("triIn");
                const outCPT = instancedArray(N, "vec4").label("outCPT"), outSegSeg = instancedArray(N, "float").label("outSegSeg");
                const outSegTri = instancedArray(N, "float").label("outSegTri"), outNormal = instancedArray(N, "vec4").label("outNormal");
                const node = Fn(() => {
                    const p0 = segIn.element(instanceIndex.mul(2)).xyz, p1 = segIn.element(instanceIndex.mul(2).add(1)).xyz;
                    const av = triIn.element(instanceIndex.mul(3)).xyz, bv = triIn.element(instanceIndex.mul(3).add(1)).xyz, cv2 = triIn.element(instanceIndex.mul(3).add(2)).xyz;
                    outCPT.element(instanceIndex).assign(vec4(M.closestPointOnTriangleNode(T, p0, av, bv, cv2), 0));
                    outSegSeg.element(instanceIndex).assign(M.closestSegSegDistSqNode(T, p0, p1, av, bv));
                    outSegTri.element(instanceIndex).assign(M.segmentTriangleDistSqNode(T, p0, p1, av, bv, cv2));
                    outNormal.element(instanceIndex).assign(vec4(M.faceNormalTowardNode(T, av, bv, cv2, p1), 0));
                })().compute(N);
                const packInterleaved = (fieldArrays) => {   // fieldArrays: [[v,v,...], [v,v,...], ...] -> interleaved Float32Array, 4 floats/vec4
                    const k = fieldArrays.length, f = new Float32Array(N * k * 4);
                    for (let i = 0; i < N; i++) for (let j = 0; j < k; j++) { const o = (i * k + j) * 4, v = fieldArrays[j][i]; f[o]=v[0]; f[o+1]=v[1]; f[o+2]=v[2]; f[o+3]=0; }
                    return f;
                };
                const segData = packInterleaved([a.prims.map(c => c.p0), a.prims.map(c => c.p1)]);
                const triData = packInterleaved([a.prims.map(c => c.a), a.prims.map(c => c.b), a.prims.map(c => c.c)]);
                segIn.value.array.set(segData); triIn.value.array.set(triData);
                await renderer.computeAsync(node);
                out.prims = { emitted: renderer._nodes.getForCompute(node).computeShader };
                const shell = S.computeShell({ name: "primitives", storage: [
                    { name: "outCPT", element: "vec4<f32>" }, { name: "outSegSeg", element: "f32" }, { name: "outSegTri", element: "f32" }, { name: "outNormal", element: "vec4<f32>" },
                    { name: "segIn", element: "vec4<f32>", access: "read" }, { name: "triIn", element: "vec4<f32>", access: "read" },
                ], workgroupSize: 64 });
                const gen = S.transplantCompute(out.prims.emitted, shell);
                out.prims.transplanted = gen.wgsl;
                const pipe = dev.compute({ wgsl: gen.wgsl });
                // Padded to a full workgroup multiple: three's own bounds guard on instanceIndex is stripped by
                // transplantCompute (the shell declares no count uniform for it to bind to), so every dispatched
                // invocation -- including the ones past N, up to the workgroup boundary -- runs the full body.
                // Buffers sized to exactly N leave those extra invocations reading/writing past the allocation.
                const dispatchN = Math.ceil(N / 64) * 64;
                const padBuf = (src, stride) => { const p = new Float32Array(dispatchN * stride); p.set(src.subarray(0, N * stride)); return p; };
                const bSeg = dev.buffer({ data: padBuf(segData, 2 * 4), usage: "storage" }), bTri = dev.buffer({ data: padBuf(triData, 3 * 4), usage: "storage" });
                const bCPT = dev.buffer({ size: dispatchN * 16, usage: "storage" }), bSegSeg = dev.buffer({ size: dispatchN * 4, usage: "storage" });
                const bSegTri = dev.buffer({ size: dispatchN * 4, usage: "storage" }), bNormal = dev.buffer({ size: dispatchN * 16, usage: "storage" });
                pipe.bind("segIn", bSeg).bind("triIn", bTri).bind("outCPT", bCPT).bind("outSegSeg", bSegSeg).bind("outSegTri", bSegTri).bind("outNormal", bNormal);
                dev.frame(({ pass }) => { pass.dispatch(pipe, dispatchN / 64); });
                out.prims.cpt = Array.from(new Float32Array(await dev.read(bCPT)));
                out.prims.segSeg = Array.from(new Float32Array(await dev.read(bSegSeg)));
                out.prims.segTri = Array.from(new Float32Array(await dev.read(bSegTri)));
                out.prims.normal = Array.from(new Float32Array(await dev.read(bNormal)));
                for (const bb of [bSeg, bTri, bCPT, bSegSeg, bSegTri, bNormal]) bb.destroy();
            } catch (e) { out.primsError = String(e && e.stack || e).slice(0, 900); }

            // ---- FULL KERNEL: batched depenetrateCapsulesNode against a[a].scenes. ----
            try {
                const count = a.scenes.length, maxTris = a.maxTris;
                const dispatchCount = Math.ceil(count / 64) * 64;   // see the primitives section's own comment: the dispatch always covers a full workgroup, so every buffer must too
                const g = M.depenetrateCapsulesNode(T, { count, maxTris });
                const capStateArr = new Float32Array(dispatchCount * 4), capHeightArr = new Float32Array(dispatchCount);
                const triAArr = new Float32Array(dispatchCount * maxTris * 4), triBArr = new Float32Array(dispatchCount * maxTris * 4), triCArr = new Float32Array(dispatchCount * maxTris * 4);
                a.scenes.forEach((s, i) => {
                    capStateArr[i*4]=s.feet[0]; capStateArr[i*4+1]=s.feet[1]; capStateArr[i*4+2]=s.feet[2]; capStateArr[i*4+3]=s.radius;
                    capHeightArr[i] = s.height;
                    for (let j = 0; j < maxTris; j++) {
                        const o = (i * maxTris + j) * 4;
                        if (j < s.tris.length) {
                            const [ta, tb, tc] = s.tris[j];
                            triAArr[o]=ta[0]; triAArr[o+1]=ta[1]; triAArr[o+2]=ta[2]; triAArr[o+3]=1;
                            triBArr[o]=tb[0]; triBArr[o+1]=tb[1]; triBArr[o+2]=tb[2]; triBArr[o+3]=0;
                            triCArr[o]=tc[0]; triCArr[o+1]=tc[1]; triCArr[o+2]=tc[2]; triCArr[o+3]=0;
                        } else { triAArr[o+3]=0; }
                    }
                });
                // g.capState etc. are three's OWN buffers, sized to count (not dispatchCount) -- only computeAsync
                // reads them, to get the emitted WGSL text; the real dispatch below uses the padded arrays directly.
                g.capState.value.array.set(capStateArr.subarray(0, count * 4)); g.capHeight.value.array.set(capHeightArr.subarray(0, count));
                g.triA.value.array.set(triAArr.subarray(0, count * maxTris * 4)); g.triB.value.array.set(triBArr.subarray(0, count * maxTris * 4)); g.triC.value.array.set(triCArr.subarray(0, count * maxTris * 4));
                await renderer.computeAsync(g.node);
                out.kernel = { emitted: renderer._nodes.getForCompute(g.node).computeShader };
                const shell = S.computeShell({ name: "depenetrateCapsules", storage: [
                    { name: "outPos", element: "vec4<f32>" }, { name: "outContacts", element: "f32" },
                    { name: "capState", element: "vec4<f32>", access: "read" }, { name: "capHeight", element: "f32", access: "read" },
                    { name: "triA", element: "vec4<f32>", access: "read" }, { name: "triB", element: "vec4<f32>", access: "read" }, { name: "triC", element: "vec4<f32>", access: "read" },
                ], workgroupSize: 64 });
                const gen = S.transplantCompute(out.kernel.emitted, shell);
                out.kernel.transplanted = gen.wgsl;
                const pipe = dev.compute({ wgsl: gen.wgsl });
                const bCapState = dev.buffer({ data: capStateArr, usage: "storage" }), bCapHeight = dev.buffer({ data: capHeightArr, usage: "storage" });
                const bTriA = dev.buffer({ data: triAArr, usage: "storage" }), bTriB = dev.buffer({ data: triBArr, usage: "storage" }), bTriC = dev.buffer({ data: triCArr, usage: "storage" });
                const bOutPos = dev.buffer({ size: dispatchCount * 16, usage: "storage" }), bOutContacts = dev.buffer({ size: dispatchCount * 4, usage: "storage" });
                pipe.bind("capState", bCapState).bind("capHeight", bCapHeight).bind("triA", bTriA).bind("triB", bTriB).bind("triC", bTriC).bind("outPos", bOutPos).bind("outContacts", bOutContacts);
                dev.frame(({ pass }) => { pass.dispatch(pipe, dispatchCount / 64); });
                out.kernel.pos = Array.from(new Float32Array(await dev.read(bOutPos)));
                out.kernel.contacts = Array.from(new Float32Array(await dev.read(bOutContacts)));
                for (const bb of [bCapState, bCapHeight, bTriA, bTriB, bTriC, bOutPos, bOutContacts]) bb.destroy();
            } catch (e) { out.kernelError = String(e && e.stack || e).slice(0, 900); }

            dev.destroy(); return out;
        }`;
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { prims: prims.map((c) => ({ p0: c.p0, p1: c.p1, a: c.a, b: c.b, c: c.c })), scenes: scenes.map((s) => ({ feet: s.feet, radius: s.radius, height: s.height, tris: s.tris })), maxTris: MAX_TRIS }, script, timeoutMs: 240000 });

        console.log("1. THE HARNESS RAN");
        ok("*** three's own renderer emitted both passes and the device ran both, on this (this box's) SwiftShader-backed WebGPU ***",
            r.ok && r.result && !r.result.primsError && !r.result.kernelError,
            r.ok ? [r.result?.primsError, r.result?.kernelError].filter(Boolean).join(" | ") : r.reason);

        if (r.ok && r.result && !r.result.primsError) {
            console.log("\n2. THE FOUR PRIMITIVES, GRADED PER-PRIMITIVE AGAINST THE REAL capsuleCollide.mjs FUNCTIONS THEY PORT");
            const P = r.result.prims;
            let cptMax = 0, segSegMax = 0, segTriMax = 0, normalMax = 0;
            for (let i = 0; i < prims.length; i++) {
                const { p0, p1, a: A, b: B, c: C } = prims[i];
                const cptExp = closestPointOnTriangle(p0, A, B, C);
                const gCpt = [P.cpt[i*4], P.cpt[i*4+1], P.cpt[i*4+2]];
                cptMax = Math.max(cptMax, Math.hypot(gCpt[0]-cptExp[0], gCpt[1]-cptExp[1], gCpt[2]-cptExp[2]));
                const segSegExp = closestSegmentSegment(p0, p1, A, B).distSq;
                segSegMax = Math.max(segSegMax, Math.abs(P.segSeg[i] - segSegExp));
                const segTriExp = segmentTriangleClosest(p0, p1, A, B, C).distSq;
                segTriMax = Math.max(segTriMax, Math.abs(P.segTri[i] - segTriExp));
                const nExp = faceNormalToward(A, B, C, p1[0], p1[1], p1[2]);
                const gN = [P.normal[i*4], P.normal[i*4+1], P.normal[i*4+2]];
                normalMax = Math.max(normalMax, Math.hypot(gN[0]-nExp[0], gN[1]-nExp[1], gN[2]-nExp[2]));
            }
            ok(`!! *** closestPointOnTriangleNode: max distance from the CPU's own closest point, over ${prims.length} cases ***`, cptMax < 1e-4, `max=${cptMax.toExponential(3)}`);
            ok(`!! *** closestSegSegDistSqNode: max |distSq diff| from the CPU's own, over ${prims.length} cases ***`, segSegMax < 1e-3, `max=${segSegMax.toExponential(3)}`);
            ok(`!! *** segmentTriangleDistSqNode: max |distSq diff| from the CPU's own, over ${prims.length} cases ***`, segTriMax < 1e-3, `max=${segTriMax.toExponential(3)}`);
            ok(`!! *** faceNormalTowardNode: max distance from the CPU's own normal, over ${prims.length} cases ***`, normalMax < 1e-4, `max=${normalMax.toExponential(3)}`);
        }

        if (r.ok && r.result && !r.result.kernelError) {
            console.log("\n3. THE BATCHED KERNEL, GRADED AGAINST A CPU REFERENCE HELD TO THE SAME FIXED CANDIDATE LIST");
            const K = r.result.kernel;
            let posMax = 0, groundedMismatches = 0, contactMismatches = 0;
            const badScenes = [];
            for (let i = 0; i < scenes.length; i++) {
                const s = scenes[i];
                const exp = depenetrateCapsuleFixedTris(s.feet, s.radius, s.height, s.tris.length > MAX_TRIS ? s.tris.slice(0, MAX_TRIS) : s.tris);
                const gPos = [K.pos[i*4], K.pos[i*4+1], K.pos[i*4+2]];
                const gGrounded = K.pos[i*4+3] > 0.5;
                const gContacts = Math.round(K.contacts[i]);
                const d = Math.hypot(gPos[0]-exp.pos[0], gPos[1]-exp.pos[1], gPos[2]-exp.pos[2]);
                posMax = Math.max(posMax, d);
                if (gGrounded !== exp.grounded) { groundedMismatches++; badScenes.push(s.name + " (grounded)"); }
                if (gContacts !== exp.contacts) { contactMismatches++; badScenes.push(s.name + " (contacts)"); }
            }
            ok(`!! *** resolved position: max distance from the CPU reference, over ${scenes.length} scenes (named + random) ***`, posMax < 1e-3, `max=${posMax.toExponential(3)}`);
            ok("!! *** grounded flag agrees with the CPU reference on every scene ***", groundedMismatches === 0, `${groundedMismatches} mismatches: ${badScenes.slice(0, 5).join(", ")}`);
            ok("  contacts count agrees with the CPU reference on every scene", contactMismatches === 0, `${contactMismatches} mismatches`);
            // spot-check the named scenarios individually, by name, so a regression names WHICH shape broke
            for (const wanted of ["flat floor, embedded", "resting exactly at radius", "wall, embedded", "corner, embedded in both walls", "walkable ramp", "too-steep ramp", "nothing in range"]) {
                const i = scenes.findIndex((s) => s.name === wanted);
                const exp = depenetrateCapsuleFixedTris(scenes[i].feet, scenes[i].radius, scenes[i].height, scenes[i].tris);
                const gGrounded = K.pos[i*4+3] > 0.5;
                ok(`  "${wanted}": grounded=${gGrounded} matches the CPU reference's ${exp.grounded}`, gGrounded === exp.grounded);
            }
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: GPU BVH traversal (this kernel resolves a fixed, pre-filtered candidate list -- see " +
    "capsuleCollideTsl.mjs's own header for why), probeGround / carryOnPlatform (unrelated primitives, not ported), " +
    "real hardware (this box's WebGPU is SwiftShader-backed software rendering), and per-capsule dynamic MAX_TRIS " +
    "(a fixed, JS-baked slot count, the same reason every TSL Loop bound in this tree is a JS number or a single " +
    "dispatch-wide value -- tools/ship/tslLoopBound-selfcheck.mjs's own unchecked line says a PER-ELEMENT dynamic " +
    "bound is unproven here, so this kernel does not attempt one).");
process.exit(fails ? 1 : 0);
