/**
 * THE KERNEL AND THE MIRROR HAD BECOME DIFFERENT FUNCTIONS, AND THE PARITY ROW COULD NOT TELL.
 *
 * RING_FLOOR_WGSL was written at v4562 and four rounds of corrections landed on the CPU mirror alone:
 *   v4564  the WINDOW phase -- 0.25 instead of this frame's f(1-f), because the ring spans P jitter phases
 *   v4565  the RING TERM on the step branch, because the geometry misses error the history carries
 *   v4566  the DISPLACEMENT GATE, because at zero displacement that term is the light and not the motion
 * (v4562's arithmetic floor DID reach the kernel, and v4568's quantiles are a reduction the kernel does not
 * do at all -- the caller reduces a per-pixel field it already has.)
 *
 * *** ringFloorPerspective's PARITY ROW WENT ON PASSING, AND HONESTLY: *** it drives the FRAME form on both
 * sides, and the kernel implemented the frame form correctly. What it could not tell anyone is that the
 * window form -- the one v4563 onward actually spends per pixel -- had NO device coverage whatsoever. A
 * parity row is only as wide as the configurations it runs.
 *
 * This gate brings the kernel up and pins it on a fixture where a lagging kernel would differ: an edge that
 * has swept past, where the step branch is load-bearing and the ring term is the whole answer.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { validateWgsl } from "./wgslSpec.mjs";
import { makeLumaState, pushLuma, lumaMean, lumaMeanPrev, lumaInstability } from "./temporalLock.mjs";
import { ringFloorCPU } from "./ringFloor.mjs";
import { RING_FLOOR_WGSL } from "./ringFloorWgsl.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { makeJitterState, advanceJitter, jitterPhaseCount } from "./jitter.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 32, H = 32, NEAR = 1, FAR = 10, HALF = 4, Z = 8, S = 2 * HALF / W, P = jitterPhaseCount(1), TAU = 0.25;
const vp = (cx) => { const o = new Float32Array(16);
    o[0] = 1 / HALF; o[5] = 1 / HALF; o[10] = 1 / (FAR - NEAR); o[14] = -NEAR / (FAR - NEAR); o[15] = 1;
    const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx; return mat4Multiply(o, t); };
// *** AN EDGE, BECAUSE IT IS THE CONTENT THAT SEPARATES THE TWO FORMS. *** v4565 measured the geometric step
// bound below the error at 70-86% of an edge's step-branch pixels: a kernel without the ring term returns
// nearly nothing where the mirror returns the history's answer. On a chequer the geometry dominates and the
// two forms agree, which is exactly the fixture that would let a lagging kernel pass.
const EDGE = (wx) => wx < 0.37 ? 0.06 : 0.92;
const CHEQUER = (wx, wy) => ((Math.floor(wx * 5.3) + Math.floor(wy * 5.3)) & 1) ? 0.92 : 0.06;
// *** AND A SMOOTH SINUSOID, WHICH IS ALMOST ENTIRELY THE RESOLVED BRANCH. *** Without it, applying the ring
// term on the resolved branch as well is invisible: an edge has barely any resolved pixels to show it on.
const SMOOTH = (wx, wy) => 0.5 + 0.45 * Math.sin(wx * 0.35) * Math.cos(wy * 0.28);

function sweep(fn, phase) {
    const speed = phase * S, st = makeJitterState(1), lu = makeLumaState(W, H, P);
    const NF = 2 * P + 8; let L2 = null, m2 = null;
    for (let f = 0; f < NF; f++) {
        const j = advanceJitter(st), cx = f * speed;
        const c = new Float32Array(W * H * 4), d = new Float32Array(W * H), L = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const k = y * W + x, o = k * 4;
            const v = fn((2 * ((x + 0.5) / W) - 1) * HALF + cx + j[0] * S, (1 - 2 * ((y + 0.5) / H)) * HALF + j[1] * S);
            c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1; d[k] = (Z - NEAR) / (FAR - NEAR); L[k] = v;
        }
        m2 = motionVectorsCPU(d, W, H, mat4Invert(vp(cx)), vp(cx - speed)).data;
        pushLuma(lu, { current: c, motion: m2, w: W, h: H }); L2 = L;
    }
    return { lu, luma: L2, motion: m2 };
}
const STILL = new Float32Array(W * H * 4);            // valid everywhere, displaced nowhere
for (let i = 0; i < W * H; i++) STILL[i * 4 + 2] = 1;

console.log("ringFloorDevice-selfcheck -- the kernel brought up to four rounds of corrections\n");
console.log("1. THE KERNEL COMPILES, AND CARRIES THE PIECES THE MIRROR DOES");
{
    const errs = validateWgsl(RING_FLOOR_WGSL);
    ok("RING_FLOOR_WGSL passes the tree's WGSL check", errs.length === 0, errs.join(" | ") || "no errors");
    // *** THE SOURCE IS INSPECTED FOR THE FOUR PIECES, because a kernel that silently lost one would still
    // compile and would still agree with the mirror on the frame form. This is a weak instrument and is
    // labelled one: the rows below measure behaviour. It exists because v4569 found the kernel four rounds
    // behind and nothing in the tree said so.
    const has = (re) => re.test(RING_FLOOR_WGSL);
    const pieces = [["window phase 0.25", /0\.25/], ["the ring buffer", /binding\(4\)[\s\S]*?ring/],
                    ["the ring mean and its lag", /ring_mean[\s\S]*?ring_prev/], ["the spread", /ring_spread/],
                    ["the displacement gate", /moved/], ["the arithmetic floor", /1\.1920928955078125e-7/]];
    report(`source carries: ${pieces.map(([n, re]) => `${n} ${has(re) ? "yes" : "NO"}`).join(", ")}`);
    ok("every piece the mirror gained since v4562 is present in the kernel's source",
        pieces.every(([, re]) => has(re)), pieces.filter(([, re]) => !has(re)).map(([n]) => n).join(", ") || "all six");
    ok("  and the kernel's comments carry no backticks, which would close the JS template literal it lives in -- the third time this session that trap has bitten",
        (RING_FLOOR_WGSL.match(/`/g) || []).length === 0, "the exported string contains none");
}

const skip = webgpuSkipReason();
if (skip) { console.log(`\n  SKIP  ${skip}`); report("*** NOT A PASS. *** This gate is about the device and it has not run one."); fails++; }
else {
    // one harness boot, four configurations: edge and chequer, frame form and window form
    const EG = sweep(EDGE, 0.5), CH = sweep(CHEQUER, 0.5), SM = sweep(SMOOTH, 0.5);
    const cases = [
        { n: "edge/window", lu: EG.lu, luma: EG.luma, motion: EG.motion, win: 1 },
        { n: "edge/frame", lu: EG.lu, luma: EG.luma, motion: EG.motion, win: 0 },
        { n: "chequer/window", lu: CH.lu, luma: CH.luma, motion: CH.motion, win: 1 },
        // *** THE STILL CASE PAIRS A MOVING RING WITH A STILL MOTION BUFFER, which is the only combination the
        // gate can be seen in. The first version used a ring built WITHOUT motion, so |newer - older| was
        // already zero and dropping the gate changed nothing -- a 0-RED sabotage that was a hole in the
        // fixture, not in the kernel. The history has to carry a change the gate then refuses to attribute.
        { n: "edge/window/still", lu: EG.lu, luma: EG.luma, motion: STILL, win: 1 },
        { n: "smooth/window", lu: SM.lu, luma: SM.luma, motion: SM.motion, win: 1 },
    ];
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, P, tau: TAU,
        cases: cases.map((c) => ({ luma: Array.from(c.luma), motion: Array.from(c.motion),
                                   ring: Array.from(c.lu.ring), win: c.win })) }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { RING_FLOOR_WGSL } = await import("/render/ringFloorWgsl.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const out = [];
        for (const c of a.cases) {
            const p = dev.compute({ wgsl: RING_FLOOR_WGSL });
            const dst = dev.buffer({ data: new Float32Array(a.W * a.H), usage: ["storage"] });
            const ub = new ArrayBuffer(32);
            new Uint32Array(ub, 0, 4).set([a.W, a.H, a.P, c.win]);
            new Float32Array(ub, 16, 4).set([a.tau, 0, 0, 0]);
            p.bind("luma", dev.buffer({ data: new Float32Array(c.luma), usage: ["storage"] }))
             .bind("motion", dev.buffer({ data: new Float32Array(c.motion), usage: ["storage"] }))
             .bind("ring", dev.buffer({ data: new Float32Array(c.ring), usage: ["storage"] }))
             .bind("dst", dst).bind("u", dev.buffer({ data: new Uint32Array(ub), usage: "uniform" }));
            dev.frame(({ pass }) => { pass.dispatch(p, [Math.ceil(a.W / 8), Math.ceil(a.H / 8)]); pass.clear([0,0,0,1]); }, { offscreen: true });
            out.push(Array.from(new Float32Array(await dev.read(dst))));
        }
        return { out, errs, backend: dev.backend };
    }` });
    console.log("\n2. *** THE WINDOW FORM ON THE DEVICE, ON THE CONTENT THAT SEPARATES IT FROM THE FRAME FORM ***");
    ok(`the harness ran the kernel in all ${cases.length} configurations`,
        r.ok && r.result && r.result.errs.length === 0 && r.result.out.length === cases.length,
        r.ok ? `${r.result && r.result.backend}${r.software ? " on a SOFTWARE adapter (" + r.adapter.architecture + "), per v4561 -- parity, not timing" : ""}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result) {
        const mirrorOf = (c) => c.win
            ? ringFloorCPU(c.luma, c.motion, W, H, P, TAU, "window", c.lu).per
            : ringFloorCPU(c.luma, c.motion, W, H, P, TAU, "frame").per;
        const cmp = (dev, cpu) => { let worst = 0, rel = 0, nz = 0;
            for (let i = 0; i < W * H; i++) {
                if (cpu[i] === 0) continue;
                nz++; const d = Math.abs(dev[i] - cpu[i]);
                worst = Math.max(worst, d); rel = Math.max(rel, d / cpu[i]);
            } return { worst, rel, nz }; };
        const R = {};
        for (let k = 0; k < cases.length; k++) {
            const c = cases[k], m = mirrorOf(c), g = cmp(r.result.out[k], m);
            R[c.n] = { g, mirror: m, dev: r.result.out[k] };
            report(`${c.n.padEnd(18)} worst abs ${g.worst.toExponential(2)}  worst rel ${g.rel.toExponential(2)}  over ${g.nz} non-zero pixels`);
        }
        // *** THE TOLERANCE IS ONE ULP OF WHAT IS BEING DIFFERENCED, AND IT IS DERIVED RATHER THAN PICKED. ***
        // The ring term is |newer mean - older mean|, and on the flat side of an edge those two means are the
        // SAME NUMBER: measured, the difference is exactly 0.00e+0 in the mirror's f64 across a whole run of
        // pixels, whose floor is therefore the arithmetic floor at 2.19e-7. The kernel works in f32, where
        // differencing two values of magnitude 0.92 leaves about one epsilon of residue. A RELATIVE tolerance
        // is meaningless on a quantity that cancels to zero -- it was 8.3e-4 here and said nothing -- so the
        // claim is absolute and its size comes from the representation: eps_f32 times the largest value
        // differenced. Measured worst is half of that.
        const ULP = 1.1920928955078125e-7, MAG = 0.92;
        const bound = 2 * ULP * MAG;
        report(`f32's own limit on this comparison: ${ULP.toExponential(2)} x ${MAG} of magnitude = ${bound.toExponential(2)} for a two-ulp allowance`);
        ok(`*** the kernel is the mirror in every configuration, including the window form the device has never run before this round: worst absolute ${Math.max(...Object.values(R).map((v) => v.g.worst)).toExponential(2)} against f32's own ${bound.toExponential(2)} ***`,
            Object.values(R).every((v) => v.g.nz > 300 && v.g.worst < bound),
            Object.entries(R).map(([n, v]) => `${n} ${v.g.worst.toExponential(1)}`).join(", "));
        ok("  and the relative figure is large precisely where the quantity cancels to nothing -- the flat side of the edge, where the two ring means are the same number in f64 and differ by one epsilon in f32, so what is left is the arithmetic floor and a relative comparison of it is a comparison of rounding",
            R["edge/window"].g.rel > 1e-5 && R["edge/window"].g.worst < bound,
            `edge/window relative ${R["edge/window"].g.rel.toExponential(2)} on an absolute of ${R["edge/window"].g.worst.toExponential(2)}`);
        // *** AND THE FIXTURE ACTUALLY SEPARATES THE TWO FORMS, or the row above proves nothing. ***
        const sep = (() => { let m = 0;
            const a = R["edge/window"].mirror, b = R["edge/frame"].mirror;
            for (let i = 0; i < W * H; i++) if (b[i] > 0) m = Math.max(m, a[i] / b[i]);
            return m; })();
        ok(`*** and the fixture separates them: on this edge the window form reads ${sep.toExponential(1)}x the frame form at its worst pixel, so a kernel still on v4562's frame-only path would have failed the row above rather than passed it ***`,
            sep > 100, `worst window/frame ratio ${sep.toExponential(2)}`);
        ok("  where a CHEQUER would not have: the geometry dominates there, which is why a parity row on that content could let a four-round-old kernel through",
            (() => { let m = 0; const a = R["chequer/window"].mirror;
                const b = ringFloorCPU(CH.luma, CH.motion, W, H, P, TAU, "frame").per;
                for (let i = 0; i < W * H; i++) if (b[i] > 0) m = Math.max(m, a[i] / b[i]);
                return m < sep / 10; })(),
            "the chequer's two forms are far closer than the edge's");
        console.log("\n3. THE DISPLACEMENT GATE, ON THE DEVICE");
        ok("*** the kernel applies v4566's gate: with a valid motion buffer that displaces nothing, the ring term does not fire and the device is the mirror ***",
            R["edge/window/still"].g.rel < 1e-4 && R["edge/window/still"].g.nz > 300,
            `still: worst rel ${R["edge/window/still"].g.rel.toExponential(2)} over ${R["edge/window/still"].g.nz} pixels`);
        ok("  and the gate is doing something rather than being vacuous: the SAME ring, carrying the same history, gives a different answer once the motion buffer displaces something",
            (() => { let m = 0;
                const a = R["edge/window"].dev, b = R["edge/window/still"].dev;
                for (let i = 0; i < W * H; i++) if (b[i] > 0) m = Math.max(m, Math.abs(a[i] - b[i]) / b[i]);
                return m > 1; })(),
            "moving and still differ on the device, not only in the mirror");
        console.log("\n4. AND THE RING TERM STAYS OFF THE RESOLVED BRANCH");
        {
            // A smooth sinusoid is almost entirely the resolved branch, where the Taylor bound holds and the
            // ring term has no business. Without this content, applying it everywhere was invisible.
            const sm = R["smooth/window"];
            let res = 0, tot = 0;
            const e = ringFloorCPU(SM.luma, SM.motion, W, H, P, TAU, "window", SM.lu);
            for (let i = 0; i < W * H; i++) { if (e.per[i] === 0) continue; tot++; if (!e.regime[i]) res++; }
            report(`the smooth fixture is ${(res / tot * 100).toFixed(0)}% resolved-branch pixels, against the edge's ${(() => {
                const ee = ringFloorCPU(EG.luma, EG.motion, W, H, P, TAU, "window", EG.lu);
                let r2 = 0, t2 = 0; for (let i = 0; i < W * H; i++) { if (ee.per[i] === 0) continue; t2++; if (!ee.regime[i]) r2++; }
                return (r2 / t2 * 100).toFixed(0); })()}%`);
            ok("*** the smooth fixture is mostly the resolved branch, which is what makes it able to show a ring term leaking onto it -- an edge has almost none and cannot ***",
                res / tot > 0.5, `${res} resolved of ${tot} non-zero pixels`);
            ok("  and on it the kernel is still the mirror, so the ring term is confined to the step branch on the device as it is in the mirror",
                sm.g.worst < bound && sm.g.nz > 300, `worst ${sm.g.worst.toExponential(2)} over ${sm.g.nz} pixels`);
        }
    }
}

// SABOTAGE. Eight rewrites of the kernel, run against four gates -- this one, ringFloorPerspective,
// ringFloorStat and ringFloor -- with v4557's crash rule applied.
//   SA  the kernel put back on v4562's frame-only path                           4 red
//   SB  the window phase ignored, this frame's f(1-f) where the mirror uses 0.25  2 red
//   SC  the displacement gate dropped from the kernel                            3 red
//   SD  the ring term applied on the RESOLVED branch too                         2 red
//   SE  the kernel's ring_prev reads the newer period                            3 red
//   SF  the kernel's spread divides by the ring depth rather than the period     3 red
//   SG  the max becomes a sum, so the two bounds add                             3 red
//   SH  the kernel's arithmetic floor dropped                                    5 red
//
// SA is the round: it restores exactly what the kernel was when this round started -- four rounds of
// corrections behind the mirror -- and it now scores four. Before this gate existed it scored nothing,
// because the only parity row in the tree drove the FRAME form, which the old kernel implemented correctly.
//
// *** SC AND SD BOTH WENT 0-RED ON THE FIRST SWEEP, AND BOTH WERE HOLES IN THIS GATE'S OWN FIXTURES. ***
//
// SC drops the displacement gate. The still case paired a still motion buffer with a ring built WITHOUT
// motion, so |newer - older| was already zero and there was nothing for the gate to refuse. The fixture now
// pairs a MOVING ring with a still motion buffer, which is the only combination where the gate is visible:
// the history carries a change and the gate declines to attribute it to a reprojection that did not happen.
//
// SD applies the ring term on the resolved branch as well. An edge is 0% resolved-branch pixels, a chequer
// nearly so -- neither can show a term leaking onto a branch they do not have. A smooth sinusoid is 96%
// resolved and shows it at once.
//
// Both are the same shape as the defect the round is about: a check whose fixtures cannot reach the thing
// it claims to hold.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the kernel's COST, which v4561 measured for the CPU estimator and which the " +
    "ring term's P-deep loops have made worse by an unmeasured amount; the quantiles, which the kernel does " +
    "not compute and which a caller would have to reduce from the per-pixel field itself; whether the ring " +
    "should be bound as a texture rather than a storage buffer, since the kernel now reads 2P slots per " +
    "pixel and nothing has measured that access pattern; and every other kernel in this arc, none of which " +
    "has been audited for the same kind of lag this round found.");
process.exit(fails ? 1 : 0);
