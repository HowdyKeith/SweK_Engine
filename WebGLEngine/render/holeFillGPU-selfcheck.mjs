#!/usr/bin/env node
// WebGLEngine/render/holeFillGPU-selfcheck.mjs -- v4687
//
// THE LAST OF FSR3's THREE PASSES OFF THE CPU -- AND THE CHAIN IS STILL NOT JOINED, WHICH THIS FILE MEASURES.
//
// v4685 mirrored the reconciliation, v4686 the warp, and this the fill. All three now have kernels that agree
// with their CPU twins. *** THE END-TO-END DEVICE CHAIN DOES NOT EXIST, AND THE REASON IS ARITHMETIC. *** Joining
// them means one pipeline holding the warp's inputs AND the fill's: prev, cur, flow, depthBlock, key, owner,
// packed, packed2, frameOut, depthPrev, depthCur -- eleven storage bindings against this adapter's limit of ten,
// and eight on the default WebGPU limits every other adapter is allowed to report. So a caller still moves data
// between the three passes, each of which is verified. That is a real limit with a number, not a to-do.
//
// *** AND ONE GROWTH MODE IS DELIBERATELY NOT PORTED. *** v4678 measured ring dilation 3.6 dB WORSE on the holes
// than leaving them to a cross-fade. It stays on the CPU so that figure stays reproducible, and the runner
// refuses it by name rather than accepting the option and quietly doing something else.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { validateWgsl } from "./wgslSpec.mjs";
import { FILL_WGSL, FILL_STRIDE } from "./holeFillWgsl.mjs";
import { fillHolesCPU, SIDE_BLEND, SIDE_PREV, SIDE_CUR } from "./holeFill.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);

const W = 48, H = 48;
let sd = 29;
const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
/**
 * A field with a strip of holes down the middle: background on the left, an occluder on the right, which is the
 * disocclusion shape v4678's slab produces and the one the side rule exists for.
 */
function mkCase({ radius = 4, prefer = "farther", side = "derived", nearerIsLess = true,
                  stripW = 4, occVec = 6, bgVec = 0, unreachable = false } = {}) {
    const vec = new Float32Array(W * H * 2).fill(NaN);
    const hole = new Uint8Array(W * H);
    const zbuf = new Float32Array(W * H);
    const depthPrev = new Float32Array(W * H).fill(0.9);
    const depthCur = new Float32Array(W * H).fill(0.9);
    const x0 = 20, x1 = x0 + stripW;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        // *** THE OCCLUDER'S PREVIOUS-FRAME DEPTH COVERS THE STRIP, AND IT IS SET BEFORE THE `continue`. ***
        // A first draft set it after, so the strip itself -- the only place the side rule ever samples -- kept
        // the background's depth, both frames read clear, and the depth mode ABSTAINED on all 192 holes. A
        // sabotage inverting that mode's decision then scored 0 red, because the decision never ran.
        if (x >= x0 - 2 && x < x1) depthPrev[i] = 0.2;
        if (x >= x0 && x < x1) { hole[i] = 1; zbuf[i] = nearerIsLess ? Infinity : -Infinity; continue; }
        const occ = x >= x1;                        // the occluder is to the right of the strip
        vec[i * 2] = occ ? occVec : bgVec;
        vec[i * 2 + 1] = 0;
        zbuf[i] = occ ? 0.2 : 0.9;
        // in `prev` the occluder covered the strip: that is what makes the strip a disocclusion
    }
    if (unreachable) {                              // a wide strip no radius here can cross
        for (let y = 0; y < H; y++) for (let x = 4; x < 44; x++) {
            const i = y * W + x; hole[i] = 1; zbuf[i] = nearerIsLess ? Infinity : -Infinity;
            vec[i * 2] = NaN; vec[i * 2 + 1] = NaN;
        }
    }
    for (let i = 0; i < W * H; i++) if (rnd() < 0) zbuf[i] = zbuf[i];   // keep rnd consumed identically
    return { vec, hole, zbuf, w: W, h: H, radius, prefer, side, nearerIsLess, depthPrev, depthCur, t: 0.5 };
}

console.log("holeFillGPU-selfcheck -- the fill on the device, and the chain that is still not joined\n");

console.log("1. THE KERNEL, AND WHAT IT DECLINES TO BE");
{
    ok("the WGSL validates against the spec scanner", validateWgsl(FILL_WGSL).length === 0, validateWgsl(FILL_WGSL).join("; "));
    ok("*** the output carries an explicit HOLE FLAG rather than leaving a caller to infer one ***",
       FILL_STRIDE === 5 && /out\[o\+4u\] = f32\(holeIn\[p\]\)/.test(FILL_WGSL),
       "five floats: vecX vecY zbuf side hole. A first draft packed four and had the runner deduce which pixels " +
       "were still holes from a NaN vector and a blend side -- a state inferred from two values, which is the " +
       "defect render/dilate.mjs recorded as every outcome writing the same float.");
    ok("*** and the depth fetch is NEAREST, not bilinear, which is the opposite of the colour path's choice ***",
       /let xi = clampi\(i32\(round\(x\)\), 0, i32\(u\.w\) - 1\)/.test(FILL_WGSL),
       "a depth buffer at a silhouette holds two surfaces a long way apart in z and their average is a depth no " +
       "surface has. render/frameInterpWgsl.mjs filters COLOUR bilinearly for the opposite reason.");
    ok("...and only ONE growth rule is in the kernel, the one v4678 did not measure as a failure",
       !/ring/.test(FILL_WGSL) && /u\.radius/.test(FILL_WGSL),
       "ring dilation reads 3.6 dB WORSE on the holes than leaving them to a cross-fade, so it stays on fillHolesCPU " +
       "where that number is reproducible, and the runner refuses it by name.");
}

const skip = await webgpuSkipReason();
if (skip) { ok("a WebGPU adapter is available", false, skip); }
else {

const CASES = {
    derived: mkCase({ side: "derived" }),
    depth: mkCase({ side: "depth" }),
    blend: mkCase({ side: "blend" }),
    prevSide: mkCase({ side: "prev" }),
    curSide: mkCase({ side: "cur" }),
    nearer: mkCase({ prefer: "nearer" }),
    radius2: mkCase({ radius: 2, stripW: 7 }),
    reversed: mkCase({ nearerIsLess: false }),
    unreachable: mkCase({ unreachable: true, radius: 3 }),
    // *** AN OCCLUDER THAT WRAPS THE HOLE, BECAUSE A FLAT ONE ON ONE SIDE CANNOT REACH THE TIE-BREAK. ***
    // v4678 needed a nine-pixel grid for exactly this on the CPU: when every occluder pixel lies on one side of
    // the strip, they all give the direction to the hole the same sign and dropping the spatial tie-break
    // changes nothing. Here one occluder pixel sits adjacent to the hole and another at the far corner that the
    // scan reaches first, and they read the same vector as LEAVING and as ARRIVING.
    wrapped: (() => {
        const n = 9 * 9;
        const vec = new Float32Array(n * 2), hole = new Uint8Array(n), zbuf = new Float32Array(n).fill(0.9);
        for (let i = 0; i < n; i++) vec[i * 2] = 1;
        hole[4 * 9 + 4] = 1; zbuf[4 * 9 + 4] = Infinity;
        vec[(4 * 9 + 4) * 2] = NaN; vec[(4 * 9 + 4) * 2 + 1] = NaN;
        for (const [x, y] of [[0, 0], [5, 4]]) zbuf[y * 9 + x] = 0.2;
        return { vec, hole, zbuf, w: 9, h: 9, radius: 4, prefer: "farther", side: "derived",
                 nearerIsLess: true, depthPrev: new Float32Array(n).fill(0.9),
                 depthCur: new Float32Array(n).fill(0.9), t: 0.5 };
    })(),
};
const cpu = {};
for (const [k, c] of Object.entries(CASES)) cpu[k] = fillHolesCPU(c);
const payload = {};
// each case carries its OWN w and h: the wrapped-occluder fixture is nine by nine, not forty-eight by
// forty-eight, and a payload builder that assumed one size refused it outright
for (const [k, c] of Object.entries(CASES)) payload[k] = { vec: Array.from(c.vec), hole: Array.from(c.hole),
    zbuf: Array.from(c.zbuf), w: c.w, h: c.h, radius: c.radius, prefer: c.prefer, side: c.side,
    nearerIsLess: c.nearerIsLess, depthPrev: Array.from(c.depthPrev), depthCur: Array.from(c.depthCur), t: c.t };

const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 900000, args: { payload }, script: `async (a) => {
    const { requestDevice } = await import("/gfx/device.js");
    const { HoleFillGPU } = await import("/render/holeFillGPU.mjs");
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
    const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
    const errs = [];
    if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
    const g = new HoleFillGPU(dev);
    const out = {};
    for (const [k, p] of Object.entries(a.payload)) {
        const res = await g.fill({ ...p, vec: Float32Array.from(p.vec), hole: Uint8Array.from(p.hole),
            zbuf: Float32Array.from(p.zbuf), depthPrev: Float32Array.from(p.depthPrev),
            depthCur: Float32Array.from(p.depthCur) });
        out[k] = { vec: Array.from(res.vec), hole: Array.from(res.hole), zbuf: Array.from(res.zbuf),
                   side: Array.from(res.side), filled: res.filled, abstained: res.abstained };
    }
    const bad = [];
    for (const [label, patch] of [["ring", { growth: "ring" }], ["growth", { growth: "flood" }],
                                  ["radius", { radius: 2.5 }], ["prefer", { prefer: "middle" }],
                                  ["side", { side: "both" }], ["depthbufs", { side: "depth", depthPrev: null }]]) {
        const p = a.payload.derived;
        try { await g.fill({ ...p, vec: Float32Array.from(p.vec), hole: Uint8Array.from(p.hole),
                zbuf: Float32Array.from(p.zbuf), depthPrev: Float32Array.from(p.depthPrev),
                depthCur: Float32Array.from(p.depthCur), ...patch }); bad.push([label, null]); }
        catch (e) { bad.push([label, String(e.message)]); }
    }
    let wrongBackend = null;
    try { const c2 = document.createElement("canvas");
          new HoleFillGPU(await requestDevice(c2, { backend: "webgl2", offscreen: true })); }
    catch (e) { wrongBackend = String(e.message).slice(0, 160); }
    // and the storage-binding limit this adapter reports, which is why the chain is not joined
    const ad = await navigator.gpu.requestAdapter();
    return { out, bad, backend: dev.backend, errs, wrongBackend,
             maxStorage: ad.limits.maxStorageBuffersPerShaderStage };
}` });

if (!r.ok) { ok("the device ran", false, `${r.reason || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 400)}`); }
else {
const G = r.result.out;
say(`adapter ${r.adapter ? (r.adapter.description || r.adapter.vendor) : "unknown"}${r.software ? " (SOFTWARE)" : ""}, backend ${r.result.backend}, maxStorageBuffersPerShaderStage ${r.result.maxStorage}`);
ok("*** the kernel ran with NO uncaptured errors ***", r.result.backend === "webgpu" && r.result.errs.length === 0,
   `errors ${JSON.stringify(r.result.errs)}`);
ok("...and a non-webgpu device is refused at construction",
   /needs a gfx\/device\.js device on the webgpu backend/.test(r.result.wrongBackend || ""), r.result.wrongBackend);

const cmp = (k) => {
    const c = cpu[k], d = G[k], N = CASES[k].w * CASES[k].h;
    let holeDiff = 0, sideDiff = 0, worstVec = 0, worstZ = 0, nanMis = 0;
    for (let i = 0; i < N; i++) {
        if (c.hole[i] !== d.hole[i]) holeDiff++;
        if (c.side[i] !== d.side[i]) sideDiff++;
        for (const [a, b] of [[c.vec[i * 2], d.vec[i * 2]], [c.vec[i * 2 + 1], d.vec[i * 2 + 1]]]) {
            if (Number.isNaN(a) !== Number.isNaN(b)) nanMis++;
            else if (!Number.isNaN(a)) worstVec = Math.max(worstVec, Math.abs(a - b));
        }
        if (Number.isFinite(c.zbuf[i]) && Number.isFinite(d.zbuf[i])) worstZ = Math.max(worstZ, Math.abs(c.zbuf[i] - d.zbuf[i]));
        else if (Number.isFinite(c.zbuf[i]) !== Number.isFinite(d.zbuf[i])) nanMis++;
    }
    return { holeDiff, sideDiff, worstVec, worstZ, nanMis, cpu: c, dev: d };
};

console.log("\n2. *** EVERY SIDE MODE, EVERY FLAG, AND THE SIDE CODES MATCH PIXEL FOR PIXEL ***");
{
    const keys = ["derived", "depth", "blend", "prevSide", "curSide", "nearer", "radius2", "reversed"];
    const rows = keys.map((k) => [k, cmp(k)]);
    for (const [k, x] of rows)
        say(`${k.padEnd(9)} filled CPU ${String(x.cpu.filled).padStart(4)} device ${String(x.dev.filled).padStart(4)};  ` +
            `abstained ${x.cpu.abstained}/${x.dev.abstained};  hole differs ${x.holeDiff}, side differs ${x.sideDiff}, worst |vec| ${x.worstVec.toExponential(1)}`);
    ok("*** the device agrees with the CPU on the SIDE CODE of every pixel, in every mode -- a side is one of three integers and has no tolerance ***",
       rows.every(([, x]) => x.sideDiff === 0 && x.holeDiff === 0),
       rows.map(([k, x]) => `${k}: ${x.sideDiff} side, ${x.holeDiff} hole`).join("; "));
    ok("...and on the vector and the depth it carried out",
       rows.every(([, x]) => x.worstVec < 1e-5 && x.worstZ < 1e-6 && x.nanMis === 0),
       `worst |vec| ${Math.max(...rows.map(([, x]) => x.worstVec)).toExponential(2)}, worst |zbuf| ` +
       `${Math.max(...rows.map(([, x]) => x.worstZ)).toExponential(2)}, ${rows.reduce((s, [, x]) => s + x.nanMis, 0)} NaN mismatches`);
    // *** WHICH CASES SHARE A SIDE MAP IS DERIVED AND NAMED, BECAUSE A THRESHOLD I GUESSED WAS WRONG. *** The
    // first draft asserted "at least five distinct maps" and there are four, so the grouping is computed and
    // printed instead -- and the coincidences turn out to be facts worth having rather than noise.
    const groups = new Map();
    for (const [k, x] of rows) { const sig = x.dev.side.join(","); if (!groups.has(sig)) groups.set(sig, []); groups.get(sig).push(k); }
    const grouping = [...groups.values()].map((g) => g.join("=")).join("  |  ");
    say(`distinct side maps: ${groups.size} -- ${grouping}`);
    ok("*** the modes are not one code path wearing five names, and the cases that DO share a map share it for a reason ***",
       groups.size >= 4 && [...groups.values()].some((g) => g.length === 1),
       `${groups.size} distinct maps across ${rows.length} cases: ${grouping}. ` +
       `The measured grouping, not a predicted one: DERIVED = DEPTH = CUR = NEARER, because on this fixture the occluder ` +
       `moves AWAY from the strip on every pixel, so the derived rule picks cur everywhere and agrees with asking for cur outright -- ` +
       `which is v4679's slab scene reproduced, where the derived rule was also cur on all 256 holes. And NEARER joins them because ` +
       `\`prefer\` chooses the VECTOR while the occluder deciding the SIDE is the nearest-depth neighbour either way: two independent ` +
       `rules, and this is where that shows. The DEPTH test joining them is the point of v4679: an independent rule built on the two ` +
       `frames' own depth buffers reaches the same verdict the dot product does, here. BLEND = REVERSED are both entirely SIDE_BLEND -- ` +
       `blend by request, and reversed by abstaining on every pixel, which the counters above separate (0 abstentions against 192).`);
    ok("...and the counters agree, including the abstentions v4679 established are the signature of a vector the search could not place",
       rows.every(([, x]) => x.cpu.filled === x.dev.filled && x.cpu.abstained === x.dev.abstained),
       rows.map(([k, x]) => `${k}: ${x.dev.filled}/${x.dev.abstained}`).join("; "));
}

console.log("\n3. A HOLE NO RADIUS CAN CROSS STAYS A HOLE, ON BOTH ENGINES");
{
    const x = cmp("unreachable");
    say(`a 40-pixel strip at radius 3: CPU filled ${x.cpu.filled}, device ${x.dev.filled}; hole mask differs ${x.holeDiff}`);
    ok("*** pixels the search cannot reach are left as holes rather than guessed, and the two engines leave the SAME ones ***",
       x.holeDiff === 0 && x.dev.hole.reduce((s, v) => s + v, 0) > 0,
       `${x.dev.hole.reduce((s, v) => s + v, 0)} pixels still holed on the device, ${x.cpu.hole.reduce((s, v) => s + v, 0)} on the CPU, ` +
       `mask identical. v4678 measured that the radius must grow with the displacement and that the pass does not work it out for the caller -- ` +
       `on either engine.`);
}

console.log("\n4. THE OCCLUDER THAT WRAPS THE HOLE, WHICH A ONE-SIDED FIXTURE CANNOT REACH");
{
    const c = cpu.wrapped, d = G.wrapped;
    say(`one hole at (4,4); occluder pixels at (0,0) -- which the scan reaches first -- and (5,4), adjacent. ` +
        `CPU side ${c.side[4 * 9 + 4]}, device ${d.side[4 * 9 + 4]}`);
    ok("*** the occluder's SPATIALLY NEAREST pixel decides the side on the device too, so the answer is the scene's and not the scan's ***",
       c.side[4 * 9 + 4] === d.side[4 * 9 + 4] && d.side[4 * 9 + 4] === SIDE_CUR && d.vec[(4 * 9 + 4) * 2] === c.vec[(4 * 9 + 4) * 2],
       `side ${d.side[4 * 9 + 4]} (cur ${SIDE_CUR}); vector ${d.vec[(4 * 9 + 4) * 2]} against the CPU's ${c.vec[(4 * 9 + 4) * 2]}. ` +
       `From (5,4) the hole lies at direction (-1, 0) and the occluder moves (+1, 0), so it is LEAVING; from (0,0) the same vector reads ` +
       `as ARRIVING. Dropping the tie-break scored 0 RED on the strip fixture, where every occluder pixel is on one side -- ` +
       `which is the same gap v4678 found on the CPU and closed the same way.`);
}

console.log("\n5. *** WHY THE THREE PASSES ARE NOT ONE PIPELINE, WITH THE ARITHMETIC ***");
{
    ok("*** joining the warp and the fill needs ELEVEN storage bindings and this adapter allows ten ***",
       r.result.maxStorage < 11,
       `this adapter reports maxStorageBuffersPerShaderStage ${r.result.maxStorage}; the WebGPU default every adapter may report is 8. ` +
       `A joined pipeline holds prev, cur, flow, depthBlock, key, owner, packed, packed2, frameOut, depthPrev and depthCur -- eleven. ` +
       `So a caller moves data between the three verified passes, and this is a limit with a number rather than a to-do.`);
    ok("...and the fill needs ONE dispatch where the warp needed three, which is a property of the algorithms",
       (FILL_WGSL.match(new RegExp(String.fromCharCode(64) + "compute", "g")) || []).length === 1,
       "the neighbourhood rule reads only the ORIGINAL mask and writes only its own slot, so no device can disagree " +
       "with a CPU about visit order. The splat is a scatter and needed two atomics to reproduce one tie rule.");
}

console.log("\n6. WHAT THE RUNNER REFUSES");
{
    const bad = Object.fromEntries(r.result.bad);
    ok("*** growth \"ring\" is refused BY NAME, with the measurement that says why ***",
       /has no kernel and is not going to get one/.test(bad.ring || "") && /3\.6 dB WORSE/.test(bad.ring || ""),
       bad.ring);
    for (const [label, pat] of [["growth", /growth must be "neighbourhood"/], ["radius", /radius must be a whole number/],
                                ["prefer", /prefer must be/], ["side", /side must be/],
                                ["depthbufs", /needs depthPrev and depthCur/]])
        ok(`a bad ${label} is refused`, bad[label] !== null && pat.test(bad[label] || ""), bad[label]);
}
}
}

// ---- THE SABOTAGE LOG ------------------------------------------------------------------------------------
//
// *** A CONTROL THAT CANNOT FAIL IS DECORATION, SO EVERY ROW ABOVE WAS BROKEN ON PURPOSE AND WATCHED. ***
// Eight mutations of the kernel, each reverted.
//
//   X1  prefer is inverted                                        -> 1 red (2)
//   X2  a neighbour that is itself a hole is accepted as a source   -> 4 red (2, 3)
//   X5  the derived rule's sign is flipped                         -> 1 red (2)
//   X6  the depth fetch floors instead of rounding                 -> 1 red (1)
//   X8  the depth test never abstains                              -> 2 red (2)
//   X4  the depth test's side decision is inverted                 -> 0 red, THEN 1, AFTER A FIXTURE FIX
//   X3  the occluder is picked without the spatial tie-break        -> 0 red, THEN 1, AFTER A CASE WAS ADDED
//   X7  a filled pixel is still reported as a hole                  -> 2 red (2, 3)
//
// *** X4's 0-RED WAS A BUG IN THE FIXTURE, AND THE FIXTURE LOOKED RIGHT. *** The strip's occluder depth was
// assigned AFTER the loop's `continue` for hole pixels, so the strip itself -- the only place the side rule ever
// samples -- kept the background's depth. Both frames read clear, the depth mode ABSTAINED on all 192 holes, and
// inverting a decision that never ran changed nothing. Moving one line above the `continue` makes the mode
// decide, and the measured side grouping changed with it: DEPTH left the all-blend group and joined DERIVED.
// A sabotage that cannot fire because the fixture never exercises the branch is not evidence about the branch.
//
// *** AND X3 IS v4678's OWN 0-RED, ARRIVING AGAIN ON THE DEVICE. *** The occluder in the strip fixture is a flat
// plane entirely on one side, so every one of its pixels gives the direction to the hole the same sign and the
// spatial tie-break cannot change the answer. v4678 closed this on the CPU with a nine-pixel grid; section 4 is
// that grid. The same gap, in the same rule, found the same way one round apart -- which is what a mirror gate
// inheriting a CPU gate's content inherits.

console.log(`\nholeFillGPU-selfcheck: ${fails ? `${fails} FAILED` : "ALL GREEN"}`);
console.log("unchecked here: THE CHAIN END TO END, which is render/frameInterpGPU-selfcheck.mjs section 8's " +
    "subject and not this file's -- this gate says the fill agrees with its CPU twin, and that one says the " +
    "three runners wired together agree with interpolateFrameCPU({ fill }). AND THE HOST IS STILL IN BETWEEN: " +
    "section 5 measures why -- eleven storage bindings against this adapter's ten -- so the field crosses back " +
    "twice per generated frame and NOTHING MEASURES WHAT THAT COSTS. RING DILATION is refused rather than " +
    "mirrored, so v4678's 3.6 dB figure stays a CPU measurement. NO TIMING CLAIM: SwiftShader, again. AND THE " +
    "CONTENT IS SYNTHETIC: a straight strip of holes with an occluder on one side is the shape v4678's slab " +
    "produced, and nothing here has a hole that curves, branches, or has occluders on two sides -- which is " +
    "where the occluder's spatial tie-break earns its keep and where v4678 needed a nine-pixel grid to reach it.");
process.exit(fails ? 1 : 0);
