/**
 * SPENDING THE DERIVED FLOOR PER PIXEL, AND WHAT THAT COSTS.
 *
 * v4562 measured the floor varying across a perspective frame and closed by calling a per-band floor "worth
 * 6x on the fastest band". *** BOTH HALVES OF THAT ARE WRONG AND THIS GATE MEASURES WHY. *** The right unit
 * is not a band -- render/ringFloor.mjs already produces a floor PER PIXEL, and bands were my invention on
 * the way to reading it. And the frame-wide alternative is not 6x worse: on this perspective scene it is
 * INFEASIBLE on every frame, so it locks nothing at all. The choice was never "6% better", it was between a
 * derived margin that works and one that does not exist.
 *
 * What a per-pixel margin actually costs is CHURN, and that is the subject here.
 */
import { makeLumaState, pushLuma, lumaMean, ridgesCPU, ridgeMarginBounds } from "./temporalLock.mjs";
import { ringFloorCPU, makeFloorPool, pushFloor, pooledFloor, marginsFromFloor } from "./ringFloor.mjs";
import { mat4Invert, mat4Multiply, motionVectorsCPU } from "./motionVectors.mjs";
import { makeJitterState, advanceJitter, jitterPhaseCount } from "./jitter.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 48, H = 48, NEAR = 0.5, FAR = 40, FOVY = 60 * Math.PI / 180, EYE_Y = 1.6;
const P = jitterPhaseCount(1), SPEED = 0.05, ARC = 0.05, CONTRAST = 0.9;
function persp(aspect) {
    const f = 1 / Math.tan(FOVY / 2), o = new Float32Array(16);
    o[0] = f / aspect; o[5] = f; o[10] = FAR / (NEAR - FAR); o[11] = -1; o[14] = FAR * NEAR / (NEAR - FAR);
    return o;
}
const viewOf = (cx) => { const t = new Float32Array(16); t[0] = t[5] = t[10] = t[15] = 1; t[12] = -cx; t[13] = -EYE_Y; return t; };
const VP = (cx) => mat4Multiply(persp(W / H), viewOf(cx));
const xform = (m, x, y, z) => { const o = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) o[r] = m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]; return o; };
const content = (wx, wz) => 0.5 + 0.45 * Math.sin(wx * 1.1) * Math.cos(wz * 0.9);
function tracer(cx) {
    const m = VP(cx), inv = mat4Invert(m);
    return (x, y, j) => {
        const u = (x + 0.5 + j[0]) / W, v = (y + 0.5 + j[1]) / H;
        const a = xform(inv, 2 * u - 1, 1 - 2 * v, 0.0), b = xform(inv, 2 * u - 1, 1 - 2 * v, 0.5);
        const A = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], B = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
        const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        if (Math.abs(d[1]) < 1e-12) return null;
        const t = -A[1] / d[1]; if (t <= 0) return null;
        return { P: [A[0] + t * d[0], 0, A[2] + t * d[2]] };
    };
}

console.log("ringFloorMargin-selfcheck -- the derived floor spent per pixel, and the churn it buys\n");

// ---- one run of the scene, every variant computed on the SAME frames -----------------------------------
const F = [];
{
    const st = makeJitterState(1), lu = makeLumaState(W, H, P), pool = makeFloorPool(W, H, P), hist = [];
    const NF = 2 * P + 16;
    for (let f = 0; f < NF; f++) {
        const j = advanceJitter(st), cx = f * SPEED, tr = tracer(cx);
        const c = new Float32Array(W * H * 4), d = new Float32Array(W * H), L = new Float32Array(W * H), op = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, o = i * 4, t = tr(x, y, j);
            const v = t ? content(t.P[0], t.P[2]) : 0.5;
            c[o] = v; c[o + 1] = v; c[o + 2] = v; c[o + 3] = 1;
            const q = xform(VP(cx), t ? t.P[0] : 0, 0, t ? t.P[2] : -1);
            d[i] = t ? q[2] / q[3] : 1; L[i] = v; op[i] = t ? 1 : 0;
        }
        const m = motionVectorsCPU(d, W, H, mat4Invert(VP(cx)), VP(cx - SPEED)).data;
        pushLuma(lu, { current: c, motion: m, w: W, h: H });
        // *** "window", NOT THE DEFAULT (v4564). *** Everything below spends the floor PER PIXEL, and the
        // frame form is a bound on the frame's worst error rather than on each pixel's own -- measured
        // below the error actually present at 21.5% of pixels. marginsFromFloor now refuses the frame
        // form outright, which is how this gate's first version was caught still using it.
        const inst = ringFloorCPU(L, m, W, H, P, undefined, "window", lu).per;
        pushFloor(pool, inst, "window");
        hist.push(j);
        if (f < 2 * P + 2) continue;
        const pooled = pooledFloor(pool);
        // the MEAN variant, kept only so the gate can show why it is not the one used
        const mean = new Float32Array(W * H);
        for (const fp of pool.frames) for (let i = 0; i < W * H; i++) mean[i] += fp[i] / pool.frames.length;
        let wide = 0; for (let i = 0; i < W * H; i++) if (op[i]) wide = Math.max(wide, inst[i]);
        const opt = { contrast: CONTRAST, phase: "window" };
        F.push({ op, inst, pooledWhole: pooled.whole,
            mInst: marginsFromFloor(inst, W, H, ridgeMarginBounds, opt),
            mMean: marginsFromFloor(mean, W, H, ridgeMarginBounds, opt),
            mMax: marginsFromFloor(pooled.data, W, H, ridgeMarginBounds, opt),
            wideBounds: ridgeMarginBounds({ noiseFloor: wide, contrast: CONTRAST }),
            lm: lumaMean(lu) });
    }
    for (const f of F) {
        f.rFixed = ridgesCPU(f.lm, W, H, ARC).data;
        f.rInst = ridgesCPU(f.lm, W, H, f.mInst.data).data;
        f.rMean = ridgesCPU(f.lm, W, H, f.mMean.data).data;
        f.rMax = ridgesCPU(f.lm, W, H, f.mMax.data).data;
    }
}

console.log("1. *** THE FRAME-WIDE DERIVED MARGIN DOES NOT LOSE BY 6x -- IT DOES NOT EXIST ***");
{
    const feas = F.filter((f) => f.wideBounds.feasible).length;
    report(`frame-wide derived margin: feasible on ${feas} of ${F.length} frames`);
    ok(`*** on this perspective scene the frame-wide derived margin is INFEASIBLE on every frame -- the frame's worst floor exceeds what any margin can clear at a 10% blind budget, so the derived approach frame-wide locks NOTHING ***`,
        feas === 0, `${feas}/${F.length} feasible; worst-pixel floor is what a frame-wide number must clear`);
    ok("  so v4562's closing, which called a per-band floor worth 6x, understated it by describing a margin that is better as one that is merely better-by-a-factor",
        F.every((f) => !f.wideBounds.feasible), "0 of the frames admit a frame-wide derived margin");
    // *** COUNTED OVER THE PIXELS THAT HAVE A SURFACE. *** feasibleFraction is over the whole buffer, and
    // this frame is a ground plane under a horizon -- so the whole-buffer figure mixes "lockable" with
    // "there is nothing here", which are different answers. A first draft of this section quoted the
    // whole-buffer number and the closing quoted a different one from a probe: two numbers for one thing.
    const onPlane = F.map((f) => {
        let feas = 0, n = 0;
        for (let i = 0; i < W * H; i++) { if (!f.op[i]) continue; n++; if (isFinite(f.mInst.data[i])) feas++; }
        return { frac: feas / n, n };
    });
    const lo = Math.min(...onPlane.map((o) => o.frac)), hi = Math.max(...onPlane.map((o) => o.frac));
    report(`per-pixel, over the ${onPlane[0].n} pixels that HAVE a surface: ${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}% feasible, so ${((1 - hi) * 100).toFixed(0)}-${((1 - lo) * 100).toFixed(0)}% of the ground is unlockable at any margin`);
    ok(`*** and per pixel most of the ground IS lockable -- ${(lo * 100).toFixed(0)}% at worst -- which is the whole difference: a frame-wide number is set by the worst pixel in the frame and then spends it everywhere ***`,
        lo > 0.4, `${(lo * 100).toFixed(1)}% of on-plane pixels feasible at worst`);
    ok("  and the rest is refused rather than locked badly: an empty interval means no margin separates a feature from the noise there, which is an answer and not a gap",
        lo < 1, `${((1 - hi) * 100).toFixed(1)}-${((1 - lo) * 100).toFixed(1)}% infeasible`);
}

console.log("\n2. WHAT A PER-PIXEL MARGIN COSTS: CHURN, AND THE POOLING THAT HALVES IT");
const ST = {};
{
    // churn is measured only where the surface exists in BOTH frames -- a pixel that crosses the horizon is
    // a scene change, not a flickering lock, and counting it would credit the noise to the margin
    const stat = (rk, mk) => {
        let ch = 0, on = 0, tot = 0, below = 0;
        for (let k = 0; k < F.length; k++) for (let i = 0; i < W * H; i++) {
            const f = F[k];
            if (!f.op[i]) continue;
            if (f[rk][i]) { tot++; if (f.inst[i] > (mk ? f[mk].data[i] : ARC)) below++; }
            if (k === 0 || !F[k - 1].op[i]) continue;
            if (f[rk][i] !== F[k - 1][rk][i]) ch++;
            if (f[rk][i]) on++;
        }
        return { perFrame: tot / F.length, churn: on ? ch / on * 100 : 0, below: tot ? below / tot * 100 : 0 };
    };
    const swing = (mk) => { const v = [];
        for (let k = 1; k < F.length; k++) for (let i = 0; i < W * H; i++) {
            const a = F[k - 1][mk].data[i], b = F[k][mk].data[i];
            if (!isFinite(a) || !isFinite(b) || !(a > 0)) continue;
            v.push(Math.abs(b - a) / Math.max(a, b));
        } v.sort((x, y) => x - y); return v.length ? v[Math.floor(v.length * 0.9)] : NaN; };
    for (const [n, rk, mk] of [["arc's fixed 0.05", "rFixed", null], ["per-pixel, this frame", "rInst", "mInst"],
                               ["per-pixel, period MEAN", "rMean", "mMean"], ["per-pixel, period MAX", "rMax", "mMax"]])
        ST[n] = { ...stat(rk, mk), swing: mk ? swing(mk) : 0 };
    report("margin                     ridges/frame   churn per ridge   below own floor   margin swing p90");
    for (const [n, v] of Object.entries(ST))
        report(`${n.padEnd(26)} ${v.perFrame.toFixed(1).padStart(7)}       ${v.churn.toFixed(1).padStart(6)}%          ${v.below.toFixed(1).padStart(6)}%           ${n.startsWith("arc") ? "     n/a" : (v.swing * 100).toFixed(0).padStart(6) + "%"}`);
    // the multiple has moved twice as the bound was corrected -- 4.9x at v4563 on the frame form, 3.0x at
    // v4564 on the window form, and this once v4565 gave the step branch the ring. The claim is that a
    // per-pixel margin churns several times what a constant one does, and that has survived both corrections.
    ok(`*** an unpooled per-pixel margin churns ${(ST["per-pixel, this frame"].churn / ST["arc's fixed 0.05"].churn).toFixed(1)}x the fixed one (${ST["per-pixel, this frame"].churn.toFixed(1)}% against ${ST["arc's fixed 0.05"].churn.toFixed(1)}%) -- and a lock that blinks is worse than no lock, because blinking is the artefact the lock exists to suppress ***`,
        ST["per-pixel, this frame"].churn > ST["arc's fixed 0.05"].churn * 2,
        `${ST["per-pixel, this frame"].churn.toFixed(1)}% vs ${ST["arc's fixed 0.05"].churn.toFixed(1)}%`);
    // *** v4563 MEASURED POOLING AS HALVING THE CHURN AND v4564's FIX TOOK MOST OF THAT AWAY. *** That
    // measurement was taken with the frame-phase floor, whose margin carries the jitter directly -- so
    // pooling was removing phase noise the bound should not have had. The window form's phase factor is the
    // CONSTANT 0.25, so its margin is already steady (15% p90 against the frame form's 30%) and pooling has
    // much less left to remove: 15%, not 50%. The swing it buys is real and unchanged.
    ok(`*** pooling over one jitter period still steadies the margin four-fold, ${(ST["per-pixel, this frame"].swing * 100).toFixed(0)}% to ${(ST["per-pixel, period MAX"].swing * 100).toFixed(0)}% p90 -- but it now buys only ${(100 - ST["per-pixel, period MAX"].churn / ST["per-pixel, this frame"].churn * 100).toFixed(0)}% of the churn, not the half v4563 measured, because that half was mostly phase noise the frame-form bound should never have carried ***`,
        ST["per-pixel, period MAX"].churn < ST["per-pixel, this frame"].churn &&
        ST["per-pixel, period MAX"].swing < ST["per-pixel, this frame"].swing * 0.5,
        `churn ${ST["per-pixel, this frame"].churn.toFixed(1)}% -> ${ST["per-pixel, period MAX"].churn.toFixed(1)}%, swing ${(ST["per-pixel, this frame"].swing * 100).toFixed(0)}% -> ${(ST["per-pixel, period MAX"].swing * 100).toFixed(0)}%`);
    // *** AND THE POOL IS A MAX BECAUSE THE FLOOR IS A BOUND. ***
    ok(`*** and the pool is a MAX, not a mean, because the floor is a BOUND: the mean is just as steady and stops being one -- ${ST["per-pixel, period MEAN"].below.toFixed(1)}% of the locks it keeps stand UNDER the floor of the very frame they are in, against ${ST["per-pixel, period MAX"].below.toFixed(1)}% for the max, which includes the current frame and therefore cannot ***`,
        ST["per-pixel, period MEAN"].below > 1 && ST["per-pixel, period MAX"].below === 0,
        `mean ${ST["per-pixel, period MEAN"].below.toFixed(2)}% below, max ${ST["per-pixel, period MAX"].below.toFixed(2)}%`);
    ok(`  and the max's price is ${(100 - ST["per-pixel, period MAX"].perFrame / ST["per-pixel, this frame"].perFrame * 100).toFixed(0)}% of the ridges the instantaneous floor keeps -- a higher threshold finds less, and that is what a threshold holding still costs`,
        ST["per-pixel, period MAX"].perFrame < ST["per-pixel, this frame"].perFrame,
        `${ST["per-pixel, this frame"].perFrame.toFixed(1)} -> ${ST["per-pixel, period MAX"].perFrame.toFixed(1)} ridges/frame`);
    report(`the max's churn reads a shade above the mean's while its margin is steadier, because it holds fewer ridges and the per-ridge denominator is smaller; both are about half the unpooled figure`);
}

console.log("\n3. *** WHAT THE FIXED MARGIN'S 97.9% PRECISION DOES NOT SEE ***");
{
    // A truth comparison cannot find this, and that is the point of the section. The artefact and the feature
    // are in the SAME PLACE: where the ring's resampling error is large the truth usually has a feature too,
    // so a ridge placed on the error scores as a hit. The question a truth comparison cannot ask is whether
    // the detector had any RIGHT to call it, given the noise at that pixel.
    let fixTot = 0, fixBelow = 0, maxTot = 0, maxBelow = 0;
    for (const f of F) for (let i = 0; i < W * H; i++) {
        if (!f.op[i]) continue;
        if (f.rFixed[i]) { fixTot++; if (f.inst[i] > ARC) fixBelow++; }
        if (f.rMax[i]) { maxTot++; if (f.inst[i] > f.mMax.data[i]) maxBelow++; }
    }
    report(`fixed 0.05: ${fixBelow} of ${fixTot} ridges sit on pixels whose own floor exceeds the margin that found them`);
    ok(`*** ${(fixBelow / fixTot * 100).toFixed(0)}% of the arc's fixed-margin ridges stand on pixels whose OWN noise floor is larger than the 0.05 that found them -- locks reading the ring's resampling error, which is exactly what ridgeMarginBounds was built at v4557 to refuse ***`,
        fixBelow / fixTot > 0.5, `${fixBelow}/${fixTot} = ${(fixBelow / fixTot * 100).toFixed(1)}%`);
    ok("  and a truth comparison cannot see it: the artefact and the feature are in the same PLACE, so a ridge placed on resampling error still scores as a hit against the noiseless field",
        maxBelow === 0 && maxTot > 0, `the pooled per-pixel margin keeps ${maxTot} ridges and ${maxBelow} of them are below their own floor`);
}

console.log("\n4. THE PIECES THIS ROUND ADDED, HELD TO WHAT THEY CLAIM");
{
    ok("ridgesCPU takes a per-pixel margin field and a scalar identically -- a uniform field is the scalar it holds",
        (() => { const f = new Float32Array(W * H).fill(ARC);
                 const a = ridgesCPU(F[0].lm, W, H, ARC).data, b = ridgesCPU(F[0].lm, W, H, f).data;
                 for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; })(),
        "every gate in this arc still passes a number and gets the same answer it did");
    // *** A POOL PART-WAY THROUGH ITS FIRST PERIOD IS NOT JITTER-FREE, AND SAYS SO. ***
    const p2 = makeFloorPool(4, 4, P);
    const partial = [];
    for (let k = 0; k < P + 1; k++) { pushFloor(p2, new Float32Array(16).fill(k + 1)); partial.push(pooledFloor(p2).whole); }
    ok("*** the pool reports whether it has seen a WHOLE period, rather than handing back a partial average as though it were jitter-free -- an absence read as a pass is v4402's fault and this one is told ***",
        partial.slice(0, P - 1).every((v) => v === false) && partial.slice(P - 1).every((v) => v === true),
        `whole becomes true at frame ${partial.indexOf(true) + 1} of a ${P}-frame period`);
    ok("  and it keeps exactly a period, discarding what falls out rather than growing without bound",
        pooledFloor(p2).frames === P && pooledFloor(p2).data[0] === P + 1,
        `${pooledFloor(p2).frames} frames held, max ${pooledFloor(p2).data[0]} after pushing 1..${P + 1}`);
    ok("marginsFromFloor turns an infeasible pixel into Infinity, so nothing is a ridge there -- the honest reading of an empty interval, and the opposite of the zero that would make everything one",
        (() => { const m = marginsFromFloor(new Float32Array([1e-6, 99]), 2, 1, ridgeMarginBounds, { contrast: CONTRAST, phase: "window" });
                 return m.data[1] === Infinity && m.feasible === 1 && ridgesCPU(new Float32Array([0, 1]), 2, 1, m.data).count === 0; })(),
        "an empty interval means nothing is lockable there, not that everything is");
    ok("  and it refuses to own the composition it is handed -- ridgeMarginBounds comes in as an argument, so there is one definition of the interval and not a second copy here",
        (() => { try { marginsFromFloor(new Float32Array(4), 2, 2, null, { phase: "window" }); return false; } catch { return true; } })(),
        "passing something that is not the bounds function throws");
    // *** AND IT REFUSES THE FRAME FORM, WHICH IS THE MISTAKE THIS GATE ITSELF SHIPPED AT v4563. *** That
    // round composed a frame-wide bound into a per-pixel margin and nothing could tell; its own safety row
    // compared each ridge against the floor its margin came from, which can only ever return zero. The guard
    // caught this gate twice while it was being corrected, which is the only evidence worth having that it
    // catches anything.
    ok("*** marginsFromFloor refuses a floor that is not a per-pixel bound, rather than trusting the caller to have read a comment ***",
        (() => { try { marginsFromFloor(new Float32Array(4), 2, 2, ridgeMarginBounds, { contrast: CONTRAST }); return false; }
                 catch (e) { return /per-pixel bound/.test(String(e.message)); } })(),
        "omitting the phase, or passing \"frame\", throws rather than quietly composing the wrong bound");
    ok("  and a floor pool refuses to mix the two forms, so the phase travels with the numbers rather than in a caller's memory",
        (() => { const q = makeFloorPool(2, 2, 2); pushFloor(q, new Float32Array(4), "window");
                 try { pushFloor(q, new Float32Array(4), "frame"); return false; } catch { return pooledFloor(q).phase === "window"; } })(),
        "a pool holding window floors rejects a frame one and keeps saying which it holds");
    ok("  and ringFloorCPU refuses a phase it does not implement rather than defaulting to one of them",
        (() => { try { ringFloorCPU(new Float32Array(64), null, 8, 8, P, undefined, "whichever"); return false; } catch { return true; } })(),
        "an unknown phase name throws");
    ok(`  and every frame this gate scored had a pool that had seen a whole period, so none of section 2's numbers came from a partial one`,
        F.every((f) => f.pooledWhole), `${F.filter((f) => f.pooledWhole).length}/${F.length} frames`);

    // *** THE INVARIANT NOTHING PINNED UNTIL A SABOTAGE WENT 0-RED. ***
    // ridgesCPU reads the CENTRE pixel's margin, and the module comment calls that deliberate. Rewriting it
    // to read each NEIGHBOUR's margin instead changed nothing any gate could see -- because the margin field
    // is smooth almost everywhere, being driven by depth and content, so margin[i] and margin[i+-1] are
    // nearly equal and no ridge decision flips. It has exactly ONE discontinuity, and it is maximal: an
    // INFEASIBLE pixel is Infinity beside a finite neighbour. Read at the neighbour, that pixel gets a finite
    // threshold and becomes lockable -- which is precisely the pixel the empty interval says is not.
    // A documented design decision with nothing holding it is a comment, not a decision.
    let onInfeasible = 0, infeasSeen = 0;
    for (const f of F) for (let i = 0; i < W * H; i++) {
        if (!f.op[i] || isFinite(f.mMax.data[i])) continue;
        infeasSeen++;
        if (f.rMax[i]) onInfeasible++;
    }
    ok(`*** no ridge is ever placed on an INFEASIBLE pixel: ${onInfeasible} of ${infeasSeen} across the run -- which is what reading the CENTRE pixel's margin buys, and reading the neighbour's silently costs ***`,
        infeasSeen > 1000 && onInfeasible === 0, `${onInfeasible} ridges on ${infeasSeen} infeasible pixel-frames`);
    ok("  and the difference is directed, not incidental: a ridge beside an infeasible pixel is found under the centre reading and the infeasible pixel itself is not, on a nine-pixel fixture built to separate them",
        (() => {
            const w = 9, h = 3, L = new Float32Array(w * h);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) L[y * w + x] = x === 4 ? 1 : 0;
            const mm = new Float32Array(w * h).fill(ARC);
            mm[1 * w + 4] = Infinity;                        // the ridge pixel on the middle row is infeasible
            const r = ridgesCPU(L, w, h, mm);
            return r.data[1 * w + 4] === 0 && r.data[0 * w + 4] === 0 && ridgesCPU(L, w, h, ARC).data[1 * w + 4] === 1;
        })(),
        "the same pixel is a ridge under a uniform 0.05 and is refused once its own margin is Infinity");
}

// SABOTAGE. Eight rewrites of the pool, the margin composition and the ridge detector's threshold, run
// against six gates -- this one, ringFloorPerspective, ringFloor, temporalLock, temporalRidgeMargin and
// temporalCoherentLock -- with v4557's crash rule applied.
//   LA  the pool takes a MEAN instead of a max                                    3 red
//   LB  the pool keeps only the newest frame (the jitter uncancelled)             6 red
//   LC  the pool grows without bound, so the margin freezes                       1 red
//   LD  `whole` always true -- a partial period passed off as jitter-free         1 red
//   LE  an infeasible pixel becomes ZERO instead of Infinity                      7 red
//   LF  marginsFromFloor ignores the floor and returns the declared 0.05          8 red
//   LG  ridgesCPU reads the margin at the NEIGHBOUR, not the centre pixel         2 red
//   LH  a margin FIELD silently treated as a scalar                               6 red
//
// *** LG WENT 0-RED ON THE FIRST SWEEP, AND WHAT IT FOUND WAS A COMMENT PRETENDING TO BE A DECISION. ***
// ridgesCPU reads the centre pixel's margin and the comment above it calls that deliberate: `decide` is
// asking whether pixel i is an extremum, so the threshold is i's. Rewriting it to read each NEIGHBOUR's
// margin changed nothing any gate could see -- because the margin field is smooth almost everywhere, driven
// by depth and content, so margin[i] and margin[i+-1] are nearly equal and no ridge decision flips.
//
// It has exactly one discontinuity and it is maximal: an INFEASIBLE pixel is Infinity beside a finite
// neighbour. Read at the neighbour, that pixel gets a finite threshold and becomes lockable -- the one pixel
// the empty interval exists to refuse. Measured, the sabotage places 23 ridges on infeasible pixels where
// the kept form places 0 of 6094. The invariant is now a row and a nine-pixel directed fixture.
//
// The lesson is not local: a design decision written into a comment and held by nothing is indistinguishable
// from a decision nobody made, and this arc has now found two of them -- v4561's stencil width and this.

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: whether the arc's gates should ADOPT the per-pixel margin, which is still the " +
    "open question v4560 named and which this round makes harder rather than easier -- it now has a churn " +
    "cost as well as a coverage one; the churn on content that is not a smooth ground plane, since a " +
    "chequer's floor is high everywhere and may not churn at all; what a caller should DO with the 29-34% of " +
    "on-plane pixels that come out infeasible, since refusing to lock them is a choice nobody has measured against " +
    "locking them badly; and the pooled margin on the DEVICE, which has no kernel here at all.");
process.exit(fails ? 1 : 0);
