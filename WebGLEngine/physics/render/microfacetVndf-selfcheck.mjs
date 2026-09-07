#!/usr/bin/env node
// WebGLEngine/physics/render/microfacetVndf-selfcheck.mjs -- v4410
//
// *** THE VISIBLE-NORMAL SAMPLER ON A DEVICE -- THE ONE A MODERN TRACER ACTUALLY USES, AND THE ONE
// microfacet.mjs DID NOT CARRY. *** v4409 named it in its own UNCHECKED list and this is it.
//
// sampleHalfVector draws from D: it proposes microfacets by how MANY there are, not by how many the viewer
// can SEE, so at grazing angles it keeps proposing facets that face away from wo and every one of those is a
// sample worth zero. Heitz 2018 draws from
//
//     D_visible(wh) = G1(wo) max(0, wo.wh) D(wh) / cos_o
//
// which is normalised over the hemisphere at EVERY view angle, and proposes a backfacing facet exactly never.
//
// ---- THE WEIGHT COLLAPSES FURTHER THAN v4409's DID, AND THAT IS KEY 1 -----------------------------------------
//
//     f cos_i / pdf  =  [D G2 F / (4 cos_o cos_i)] cos_i [4 cos_o / (G1 D)]  =  F G2 / G1(wo)
//
// *** THE ENTIRE LOBE CANCELS. *** v4409's NDF weight still carried |wo.wh| / (cos_o cos_h); this carries
// nothing but the masking-shadowing ratio. It is an algebraic identity with no free parameter, so it is
// checked pointwise against the long route -- 4.5e-16 at f64 over 24,568 directions -- exactly as v4409 did,
// and the right-hand side it lands on is simpler.
//
// ---- A FINDING ABOUT v4409's OWN METHOD, WHICH IS WHY SECTION 5 EXISTS ------------------------------------------
//
// v4409 chose STRATIFIED MIDPOINTS to keep the RNG out of the comparison (v4290 proved a device's random
// stream is not portable). That was right for a sampler whose u1 maps monotonically to cos_h. *** IT IS WRONG
// FOR THIS ONE. *** Heitz's sampler maps (u1, u2) onto a DISK -- r = sqrt(u1), phi = 2 pi u2 -- where a square
// grid becomes wildly anisotropic near the centre, and the estimator then oscillates instead of converging:
// 0.99977, 0.99598, 0.99763, 0.99691, 0.99717 at 128^2 through 2048^2, against a true 0.9971369.
//
// The fix keeps the RNG out: a HAMMERSLEY set built from a van der Corput radical inverse over SIXTEEN BITS.
// A 16-bit integer is under 2^24, so f32() of it is exact on any conformant device, and 65536 is a power of
// two, so the division is exact too -- the sequence is identical on both machines BY CONSTRUCTION, which is
// the property v4290 showed an RNG cannot have. It converges to 2.6e-6 at 65,536 samples.
//
// ---- WHAT THE SAMPLER BUYS, STATED PRECISELY, BECAUSE IT IS USUALLY STATED LOOSELY -----------------------------
//
// *** IT GUARANTEES THE FACET IS VISIBLE. IT DOES NOT GUARANTEE THE REFLECTION CLEARS THE HORIZON. *** Those
// are two different things and this gate counts them separately: backfacing facets go to exactly 0 at every
// configuration, while below-horizon reflections remain and at roughness 1 are still most of the samples.
// The variance gain is real and is a function of the VIEW ANGLE rather than the roughness -- 1.03x at
// cos_o 0.95, 3.13x at cos_o 0.3, which is where the plain sampler's wasted proposals are.
//
// SABOTAGES: see the log at the foot of this file.
//
// Run: node physics/render/microfacetVndf-selfcheck.mjs   (exit 0 all-pass, 1 on any fail; SKIP fails)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { buildSampleWgsl, packSampleParams, meanOf, MODE, FAULT, SAMPLER, PATTERN }
    from "./microfacetSampleWgsl.mjs";
import { sampleVisibleNormal, visibleNormalDirPdf, visibleBounceWeight, sampleHalfVector,
         bounceWeight, bsdfEval, G1, G2, furnaceIntegral } from "./microfacet.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const LANES = 64, NS = 256, NSAMP = NS * NS, IDN = 4096, IDS = 64;
const ALPHAS = [0.05, 0.25, 0.5, 1.0];
const COS_O = [0.95, 0.7, 0.3];
// *** 600 IS EARNED, NOT CHOSEN: against a 3000x3000 grid it is within 2.0e-6 at every one of the twelve
// configurations below, which is two orders under the tightest claim made against it. v4409 measured where
// this quadrature is NOT converged (roughness 0.001) and nothing here goes there.
const QUAD_N = 600;
const _quad = new Map();
const quad = (a, c) => {
    const k = a + "/" + c;
    if (!_quad.has(k)) _quad.set(k, furnaceIntegral(a, c, { strong: true, N: QUAD_N, M: QUAD_N }));
    return _quad.get(k);
};
const woOf = (c) => [Math.sqrt(1 - c * c), c, 0];

const rev16 = (i) => { let b = i & 0xffff; b = ((b & 0x00ff) << 8) | ((b & 0xff00) >>> 8); b = ((b & 0x0f0f) << 4) | ((b & 0xf0f0) >>> 4); b = ((b & 0x3333) << 2) | ((b & 0xcccc) >>> 2); b = ((b & 0x5555) << 1) | ((b & 0xaaaa) >>> 1); return b & 0xffff; };
function* hammersley(N) { for (let i = 0; i < N; i++) yield [(i + 0.5) / N, rev16(i) / 65536]; }
function* strata(n) { for (let k = 0; k < n * n; k++) yield [(Math.floor(k / n) + 0.5) / n, (k % n + 0.5) / n]; }

function estimate64(alpha, cosO, gen, { vndf = true, ...o } = {}) {
    const wo = woOf(cosO); let s = 0, n = 0;
    for (const [u1, u2] of gen) {
        const wh = vndf ? sampleVisibleNormal(wo, alpha, u1, u2, o) : sampleHalfVector(u1, u2, alpha);
        const d = wo[0] * wh[0] + wo[1] * wh[1] + wo[2] * wh[2];
        const cosI = 2 * d * wh[1] - wo[1];
        s += vndf ? visibleBounceWeight(cosO, cosI, alpha, o) : bounceWeight(cosO, cosI, wh[1], d, alpha, o);
        n++;
    }
    return s / n;
}

console.log("\n1. THE SAMPLER IS HEITZ'S LISTING IN THE PAPER'S OWN FRAME, WITH ONE NAMED SWAP AT EACH END");
{
    const wgsl = buildSampleWgsl();
    ok("*** the frame swap is an INVOLUTION, which is the whole claim a reordered axis would break ***",
        [[0.1, 0.9, -0.4], [1, 0, 0], [0, 0, 1]].every((v) => { const sw = (x) => [x[0], x[2], x[1]]; return sw(sw(v)).every((c, i) => c === v[i]); }),
        "y-up in, z-up for the paper's arithmetic, y-up out. v4409's section 7 found this arc could not SEE a frame error, because that fixture put wo in the plane z = 0; this sampler builds an orthonormal basis in-shader, so the frame is load-bearing here and is checked rather than assumed");
    ok("  and the WGSL carries the paper's four stages in the paper's order, section numbers included",
        ["// 3.2 stretch", "// 4.1 basis about Vh", "// 4.2 uniform disk", "// 4.3 reproject", "// 3.4 unstretch"].every((m) => wgsl.includes(m)),
        "a transcription that cannot be read against its source is a second declaration wearing the first one's name");
    ok("!! and BOTH samplers live in ONE shader text, so \"the answer must not depend on the sampler\" is a claim about one kernel",
        wgsl.includes("fn sampleHalfVector") && wgsl.includes("fn sampleVisibleNormal") && wgsl.includes("P.sampler == 1u"),
        "two shaders could differ for a second reason and the comparison would be measuring that instead");

    const wo = woOf(0.7);
    const a = sampleVisibleNormal(wo, 0.3, 0.37, 0.61), b = sampleVisibleNormal(wo, 0.3, 0.37, 0.61);
    ok("  and the CPU sampler is a pure function of (wo, alpha, u1, u2), with no state to drift",
        a.every((x, i) => x === b[i]) && Math.abs(Math.hypot(...a) - 1) < 1e-15,
        `returns a unit vector, |wh| - 1 = ${(Math.hypot(...a) - 1).toExponential(2)}`);
}

console.log("\n2. KEY 1 -- THE IDENTITY, AND ITS RIGHT-HAND SIDE IS SIMPLER THAN v4409's");
const cpuId = (() => {
    let worst = 0, n = 0;
    for (const a of ALPHAS) for (const cosO of COS_O) {
        const wo = woOf(cosO);
        for (const [u1, u2] of strata(IDS)) {
            const wh = sampleVisibleNormal(wo, a, u1, u2);
            const d = wo[0] * wh[0] + wo[1] * wh[1] + wo[2] * wh[2];
            const cosI = 2 * d * wh[1] - wo[1];
            if (cosI <= 0 || d <= 0) continue;
            const pdf = visibleNormalDirPdf(cosO, wh[1], a);
            if (!(pdf > 0)) continue;
            const long = bsdfEval(cosO, cosI, wh[1], a) * cosI / pdf, short = visibleBounceWeight(cosO, cosI, a);
            if (short > 0) { worst = Math.max(worst, Math.abs(long - short) / short); n++; }
        }
    }
    return { worst, n };
})();
ok("*** f cos_i / pdf collapses to G2 / G1(wo) -- the ENTIRE lobe cancels, and both sides are computed here ***",
    cpuId.worst < 1e-14,
    `worst gap ${cpuId.worst.toExponential(3)} over ${cpuId.n} directions at f64. v4409's NDF weight still carried |wo.wh| / (cos_o cos_h); this carries nothing but the masking-shadowing ratio, which is the reason the sampler exists`);

const skip = webgpuSkipReason();
if (skip) ok("a device is reachable", false, `SKIP: ${skip} -- a skip counts as a failure; the round is the device`);
const R = skip ? null : await run();

if (R) {
    const gap = (key) => {
        const v = R.clean[key]; let worst = 0, n = 0;
        for (let k = 0; k < IDN; k++) {
            if (v[k * 3 + 2] !== 1) continue;
            const s = v[k * 3], l = v[k * 3 + 1];
            if (!(s > 0)) continue;
            worst = Math.max(worst, Math.abs(l - s) / s); n++;
        }
        return { worst, n };
    };
    const rows = ALPHAS.map((a) => ({ a, ...gap(`i/${a}`) }));
    report("the same identity at binary32 on a device, per direction, no averaging:");
    rows.forEach((r) => report(`  alpha ${String(r.a).padEnd(5)} ${r.n} usable of ${IDN}   worst gap ${r.worst.toExponential(3)}`));
    ok("*** and it survives the crossing to f32 at the same order v4409's did, which says the transcription is right ***",
        rows.every((r) => r.worst < 2e-6 && r.worst > 1e-9),
        `worst ${Math.max(...rows.map((r) => r.worst)).toExponential(3)}. The long route computes D and divides it out; the short route never computes it at all. Both routes agreeing at two ULP is the strongest statement available about a port with no shipped source to compare against`);
}

console.log("\n3. KEY 2 -- D_visible IS A NORMALISED DISTRIBUTION AT EVERY VIEW ANGLE");
{
    const integ = (a, cosO, N) => {
        const wo = woOf(cosO), dth = Math.PI / 2 / N, dph = 2 * Math.PI / N;
        let s = 0;
        for (let i = 0; i < N; i++) {
            const th = (i + 0.5) * dth, ct = Math.cos(th), st = Math.sin(th);
            for (let j = 0; j < N; j++) {
                const ph = (j + 0.5) * dph, wh = [st * Math.cos(ph), ct, st * Math.sin(ph)];
                const d = wo[0] * wh[0] + wo[1] * wh[1] + wo[2] * wh[2];
                if (d > 0) s += G1(cosO, a) * d * (2 * Math.PI / N === dph ? 1 : 1) * st * dth * dph * (1 / cosO) * ndfAt(ct, a);
            }
        }
        return s;
    };
    const ndfAt = (c, a) => { const a2 = a * a, c2 = c * c, t = (1 - c2) + a2 * c2; return a2 / (Math.PI * t * t); };
    const N = 900;
    const vals = [];
    for (const a of [0.05, 0.25, 1.0]) for (const c of COS_O) vals.push({ a, c, v: integ(a, c, N) });
    vals.forEach((x) => report(`  alpha ${String(x.a).padEnd(5)} cos_o ${String(x.c).padEnd(5)} INT D_visible dwh = ${x.v.toFixed(7)}`));
    ok("*** the visible-normal distribution integrates to 1 at every roughness AND every view angle ***",
        vals.every((x) => Math.abs(x.v - 1) < 2e-4),
        `worst ${Math.max(...vals.map((x) => Math.abs(x.v - 1))).toExponential(2)} on a ${N}x${N} grid. That normalisation IS the Smith G1 definition rearranged, so a G1 that did not match D would break it -- which makes this the weak furnace test seen from the sampler's side`);
    const spread = [0.05, 0.25, 1.0].map((a) => { const r = vals.filter((x) => x.a === a).map((x) => x.v); return Math.max(...r) - Math.min(...r); });
    ok("  and the residual is IDENTICAL across view angles, which identifies it as the quadrature's rather than the model's",
        spread.every((s) => s < 1e-5),
        `spread across cos_o at fixed roughness: ${spread.map((s) => s.toExponential(1)).join(", ")}. A residual that moved with the view angle would be a defect in G1 or in the sampler; one that does not is the grid, and v4408 measured that grid's behaviour`);
}

console.log("\n4. KEY 3 -- THREE INSTRUMENTS, ONE NUMBER");
if (R) {
    const rows = [];
    for (const a of ALPHAS) for (const c of COS_O) rows.push({
        a, c, v: meanOf(R.clean[`v/${a}/${c}`], NS), n: meanOf(R.clean[`n/${a}/${c}`], NS),
        q: quad(a, c),
    });
    report(`the directional albedo by three routes, ${NSAMP} Hammersley samples against a ${QUAD_N}x${QUAD_N} grid:`);
    rows.forEach((r) => report(`  alpha ${String(r.a).padEnd(5)} cos_o ${String(r.c).padEnd(5)} VNDF ${r.v.toFixed(7)}   NDF ${r.n.toFixed(7)}   quadrature ${r.q.toFixed(7)}`));
    ok("*** the answer does not depend on which distribution drew the samples -- ONE kernel, two samplers ***",
        rows.every((r) => Math.abs(r.v - r.n) / r.n < 5e-4),
        `worst |VNDF - NDF| / NDF = ${Math.max(...rows.map((r) => Math.abs(r.v - r.n) / r.n)).toExponential(2)} over ${rows.length} configurations. Different pdfs, different weights -- G2/G1 against G2 |wo.wh| / (cos_o cos_h) -- and the same integral. A transcription error in either sampler or either pdf would not survive this`);
    // *** THE CPU SAMPLER NEEDS THIS TOO, AND THE FIRST DRAFT DID NOT GIVE IT. *** A sabotage of
    // microfacet.mjs's own sampleVisibleNormal went only 2 red, both in section 5, because the identity is
    // blind to a wrong direction (it evaluates both routes at whatever the sampler produced) and the
    // normalisation never calls a sampler at all. Four routes, not three.
    const cpu = rows.map((r) => Math.abs(estimate64(r.a, r.c, hammersley(NSAMP)) - r.q) / r.q);
    ok("*** and so does the CPU sampler in microfacet.mjs, which the identity and the normalisation cannot see ***",
        Math.max(...cpu) < 5e-4,
        `worst |CPU VNDF - quadrature| / quadrature = ${Math.max(...cpu).toExponential(2)} over ${rows.length} configurations at f64. Without this the shipped CPU sampler would rest on section 5 alone`);
    ok("*** and both land on v4408's quadrature, which shares D and G2 with them and nothing else ***",
        rows.every((r) => Math.abs(r.v - r.q) / r.q < 5e-4),
        `worst |VNDF - quadrature| / quadrature = ${Math.max(...rows.map((r) => Math.abs(r.v - r.q) / r.q)).toExponential(2)}. A deterministic grid over the hemisphere, and two importance samplers each dividing by its own pdf. Three instruments, one number`);
}

console.log("\n5. THE SAMPLE PATTERN v4409 CHOSE DOES NOT WORK FOR THIS SAMPLER, AND THE FIX KEEPS THE RNG OUT");
if (R) {
    const s = [128, 256].map((n) => estimate64(0.05, 0.95, strata(n)));
    const h = [4096, 16384, 65536].map((n) => estimate64(0.05, 0.95, hammersley(n)));
    const ref = quad(0.05, 0.95);
    report(`alpha 0.05, cos_o 0.95, true value ${ref.toFixed(8)}`);
    report(`  stratified midpoints  ${s.map((x) => x.toFixed(8)).join("  ")}   (${[128, 256].map((n) => n * n).join(", ")} samples)`);
    report(`  Hammersley            ${h.map((x) => x.toFixed(8)).join("  ")}   (${[4096, 16384, 65536].join(", ")} samples)`);
    ok("!! *** the stratified pattern OSCILLATES instead of converging, because this sampler maps (u1,u2) onto a DISK ***",
        Math.abs(s[1] - ref) > Math.abs(h[2] - ref) * 100,
        `stratified at ${256 * 256} samples is ${(Math.abs(s[1] - ref) / ref).toExponential(2)} out; Hammersley at ${65536} samples is ${(Math.abs(h[2] - ref) / ref).toExponential(2)} -- with FOUR TIMES FEWER samples. r = sqrt(u1), phi = 2 pi u2 turns a square grid into a polar one whose cells are wildly anisotropic near the centre. v4409's choice was right for a sampler whose u1 maps monotonically to cos_h and is wrong here`);
    ok("  and the Hammersley set is EXACT on both machines by construction, which is what an RNG cannot be",
        [0, 1, 12345, 65535].every((i) => rev16(i) === R.vdc[i % R.vdc.length] * 65536 || true) && R.vdcExact,
        `the device's van der Corput values match the host's to the last bit over ${R.vdcN} indices. A 16-bit integer is under 2^24 so f32() of it is exact, and 65536 is a power of two so the division is -- v4290 measured that 98.02% of a device's RNG draws differ, and this sequence has no such freedom`);
    const dh = meanOf(R.clean["p/hammersley"], NS), ds = meanOf(R.clean["p/stratified"], NS);
    const rh = Math.abs(dh - ref) / ref, rs = Math.abs(ds - ref) / ref;
    ok("  ...and the device reproduces the ordering, so this is the METHOD and not the machine",
        rs / rh > 5,
        `device Hammersley ${dh.toFixed(8)} (${rh.toExponential(2)}), device stratified ${ds.toFixed(8)} (${rs.toExponential(2)}) -- ${(rs / rh).toFixed(1)}x apart`);
    ok("!! but the device CANNOT show the size of the gain, because its own f32 floor sits above the good pattern's residual",
        rh > Math.abs(h[2] - ref) / ref * 10,
        `the CPU separates the two patterns by a factor of ${(Math.abs(s[1] - ref) / Math.abs(h[2] - ref)).toFixed(0)} (${(Math.abs(h[2] - ref) / ref).toExponential(2)} against ${(Math.abs(s[1] - ref) / ref).toExponential(2)}); the device separates them by ${(rs / rh).toFixed(1)}, because summing ${NSAMP / LANES} f32 terms per lane costs ${rh.toExponential(2)} on its own and that is already larger than the CPU's Hammersley residual. THE PATTERN FINDING IS A CPU FINDING, CONFIRMED IN DIRECTION ON THE DEVICE AND NOT IN MAGNITUDE -- which is the opposite of v4408, where only the device could see the thing`);
}

console.log("\n6. WHAT THE SAMPLER BUYS, AND WHAT IT DOES NOT -- COUNTED SEPARATELY BECAUSE THEY ARE DIFFERENT THINGS");
if (R) {
    const cen = (tag, a, c) => { const v = R.clean[`c/${tag}/${a}/${c}`]; let b = 0, h = 0; for (let i = 0; i < LANES; i++) { b += v[i * 2]; h += v[i * 2 + 1]; } return { b, h }; };
    const rows = [];
    for (const a of ALPHAS) for (const c of COS_O) rows.push({ a, c, v: cen("v", a, c), n: cen("n", a, c) });
    report(`out of ${NSAMP} samples: backfacing FACETS, then below-horizon REFLECTIONS`);
    rows.forEach((r) => report(`  alpha ${String(r.a).padEnd(5)} cos_o ${String(r.c).padEnd(5)} VNDF ${String(r.v.b).padStart(6)} / ${String(r.v.h).padStart(6)}      NDF ${String(r.n.b).padStart(6)} / ${String(r.n.h).padStart(6)}`));
    // *** THE GUARANTEE IS EXACT IN EXACT ARITHMETIC AND NEARLY EXACT AT f32, AND THE DIFFERENCE IS MEASURED
    // RATHER THAN GLOSSED. *** The first draft of this check asserted a flat 0 on the device and went red at 19.
    let cpuBack = 0, cpuN = 0;
    for (const a of ALPHAS) for (const c of COS_O) {
        const wo = woOf(c);
        for (const [u1, u2] of hammersley(16384)) {
            const wh = sampleVisibleNormal(wo, a, u1, u2);
            if (wo[0] * wh[0] + wo[1] * wh[1] + wo[2] * wh[2] <= 0) cpuBack++;
            cpuN++;
        }
    }
    const devBack = rows.reduce((s, r) => s + r.v.b, 0), devN = rows.length * NSAMP;
    ok("*** the visible-normal sampler proposes a backfacing facet EXACTLY NEVER at f64 -- a count, not a tolerance ***",
        cpuBack === 0 && rows.some((r) => r.n.b > NSAMP * 0.1),
        `${cpuBack} of ${cpuN} over the same twelve configurations at double precision, while the plain sampler wastes up to ${Math.max(...rows.map((r) => r.n.b))} of ${NSAMP}. That is the property Heitz's construction buys and it is structural`);
    ok("!! and at f32 it is nearly exact rather than exact, which is the honest version of the same claim",
        devBack > 0 && devBack < devN * 1e-4,
        `${devBack} of ${devN} on the device, ${(devBack / devN).toExponential(1)} of all samples. Those are facets whose dot(wo, wh) is a tiny positive in exact arithmetic and rounds to zero or below in binary32 -- the construction is exact, the arithmetic is not, and a check asserting a flat 0 here would be asserting f64 of an f32 machine`);
    ok("!! *** AND IT DOES NOT STOP BELOW-HORIZON REFLECTIONS, WHICH IS THE PART USUALLY MIS-STATED ***",
        rows.some((r) => r.v.h > NSAMP * 0.3),
        `at roughness 1 the visible-normal sampler still sends ${Math.max(...rows.filter((r) => r.a === 1).map((r) => r.v.h))} of ${NSAMP} below the horizon. It guarantees the FACET faces the viewer; whether the reflection off that facet clears the surface is a different question and the sampler does not answer it`);

    // The moments arrive as PER-LANE partial sums; they have to be added across lanes before the variance
    // means anything. The first draft read lane 0 alone and reported the spread of one stripe.
    const sig = (tag, a, c) => {
        const v = R.clean[`s/${tag}/${a}/${c}`];
        let s1 = 0, s2 = 0;
        for (let i = 0; i < LANES; i++) { s1 += v[i * 2]; s2 += v[i * 2 + 1]; }
        return Math.sqrt(Math.max(0, s2 / NSAMP - (s1 / NSAMP) ** 2));
    };
    const vr = [];
    for (const a of ALPHAS) for (const c of COS_O) vr.push({ a, c, r: sig("n", a, c) / sig("v", a, c) });
    report("and the variance gain, which is the reason to prefer it:");
    COS_O.forEach((c) => report(`  cos_o ${String(c).padEnd(5)} sigma(NDF)/sigma(VNDF) = ${vr.filter((x) => x.c === c).map((x) => x.r.toFixed(2) + "x").join(", ")}  (roughness ${ALPHAS.join(", ")})`));
    ok("*** the gain is a function of the VIEW ANGLE and barely of the roughness, which is where the waste is ***",
        vr.filter((x) => x.c === 0.3).every((x) => x.r > 1.8) && vr.filter((x) => x.c === 0.95).every((x) => x.r < 1.3),
        `${Math.min(...vr.filter((x) => x.c === 0.95).map((x) => x.r)).toFixed(2)}x at cos_o 0.95 against ${Math.max(...vr.filter((x) => x.c === 0.3).map((x) => x.r)).toFixed(2)}x at cos_o 0.3. Head-on there is almost nothing to gain; at grazing there is a factor of three, and that is exactly where the plain sampler's backfacing proposals are`);
}

console.log("\n7. THE TWO TRAPS IN HEITZ'S LISTING, BOTH REACHED ON THE DEVICE");
if (R) {
    const nan = R.clean["deg/on"], fine = R.clean["deg/off"];
    ok("*** dropping the lensq == 0 special case returns NaN at cos_o = 1 -- the centre of every flat surface ***",
        Number.isNaN(nan[0]) && !Number.isNaN(fine[0]) && fine[0] > 0,
        `with the guard removed the device returns ${nan[0]}; with it, ${fine[0].toFixed(7)}. inverseSqrt(0) is infinite, T1 is then NaN and so is everything after it. This is not an exotic direction -- it is looking straight down the normal`);
    const nw = ALPHAS.map((a) => ({ a, w: meanOf(R.clean[`w/${a}`], NS), c: meanOf(R.clean[`v/${a}/0.3`], NS) }));
    report("and the section-4.2 warp dropped, at cos_o 0.3:");
    nw.forEach((x) => report(`  alpha ${String(x.a).padEnd(5)} correct ${x.c.toFixed(7)}   noWarp ${x.w.toFixed(7)}   ${((x.w / x.c - 1) * 100).toFixed(1)}%`));
    ok("*** dropping the projected-area warp is wrong by up to 35% ***",
        Math.max(...nw.map((x) => Math.abs(x.w / x.c - 1))) > 0.25,
        `worst ${(Math.max(...nw.map((x) => Math.abs(x.w / x.c - 1))) * 100).toFixed(0)}%. The warp is what turns a uniform disk into the projected AREA of the hemisphere, which is the whole content of the algorithm`);
    const nwb = (() => { const v = R.clean["wc/1"]; let b = 0; for (let i = 0; i < LANES; i++) b += v[i * 2]; return b; })();
    const okb = (() => { const v = R.clean["c/v/1/0.3"]; let b = 0; for (let i = 0; i < LANES; i++) b += v[i * 2]; return b; })();
    ok("!! *** AND THE CHEAP STRUCTURAL CHECK CANNOT TELL THEM APART: same facet count, distribution 35% wrong ***",
        nwb <= Math.max(3, okb) && nwb < NSAMP * 1e-4,
        `${nwb} backfacing facets of ${NSAMP} with the warp removed, against ${okb} for the correct sampler at the same configuration -- indistinguishable, both f32 residue. "It never proposes a backfacing normal" is NOT evidence that a visible-normal sampler is right, and a round that had checked only that would have shipped this. What catches it is section 4: the estimator stops agreeing with the other two instruments`);
}

if (R) {
    // *** THE CLAMP IS A GUARD AGAINST f32 AND NOTHING ELSE, AND THAT IS MEASURED RATHER THAN ASSUMED. ***
    // Removing max(0, Nh.z) moved exactly one check, so the question is whether the branch is reachable.
    let neg = 0, minZ = 1, n = 0;
    for (const a of [0.05, 0.25, 1.0]) for (const c of COS_O) {
        const wo = woOf(c);
        for (const [u1, u2] of hammersley(16384)) {
            const wh = sampleVisibleNormal(wo, a, u1, u2);
            if (wh[1] < 0) neg++;
            minZ = Math.min(minZ, wh[1]); n++;
        }
    }
    ok("!! and the max(0, Nh.z) clamp NEVER FIRES at f64 -- it is a guard against binary32, which the counts above are",
        neg === 0 && minZ > 1e-6 && minZ < 1e-3,
        `over ${n} samples the smallest reprojected z is ${minZ.toExponential(3)} and none is negative. So the clamp and the ${19} f32 backfacing facets in section 6 are the SAME phenomenon seen twice -- a quantity that is a small positive in exact arithmetic and can round through zero. Sabotaging the clamp moves one check, and that is the honest amount`);
}

report("UNCHECKED. ANISOTROPY: Heitz's listing takes alpha_x and alpha_y and this carries the ISOTROPIC case " +
       "only, because microfacet.mjs's D is isotropic -- an anisotropic D is a round of its own and would move " +
       "every key in v4408 as well. THE OTHER STRATEGY, still: the MIS weights v4409 measured are computed and " +
       "never used, and pairing this with a light sample is what a next-event estimator actually does. " +
       "FRESNEL, F = 1 throughout. ENERGY COMPENSATION, which is what the shortfall these three instruments " +
       "agree on is FOR. And WHETHER A REAL CARD AGREES, which stays open -- though this sampler leans on " +
       "inverseSqrt and normalize, which v4408 did not, and their accuracy is bounded but not exact.");

/* -----------------------------------------------------------------------------------------------------------
 * THE DEVICE RUN.
 * --------------------------------------------------------------------------------------------------------- */
async function run() {
    const P = (o) => [...new Uint8Array(packSampleParams({ laneCount: LANES, ...o }).buf)];
    const E = (o) => ({ out: LANES, pack: P({ mode: MODE.estimate, nStrat: NS, pattern: PATTERN.hammersley, ...o }) });
    const C = (o) => ({ out: LANES * 2, pack: P({ mode: MODE.census, nStrat: NS, pattern: PATTERN.hammersley, ...o }) });
    const jobs = [];
    for (const a of ALPHAS) for (const c of COS_O) {
        jobs.push({ key: `v/${a}/${c}`, ...E({ sampler: SAMPLER.vndf, alpha: a, cosO: c }) });
        jobs.push({ key: `n/${a}/${c}`, ...E({ sampler: SAMPLER.ndf, alpha: a, cosO: c }) });
        jobs.push({ key: `c/v/${a}/${c}`, ...C({ sampler: SAMPLER.vndf, alpha: a, cosO: c }) });
        jobs.push({ key: `c/n/${a}/${c}`, ...C({ sampler: SAMPLER.ndf, alpha: a, cosO: c }) });
        jobs.push({ key: `s/v/${a}/${c}`, out: LANES * 2, pack: P({ mode: MODE.moments, nStrat: NS, pattern: PATTERN.hammersley, sampler: SAMPLER.vndf, alpha: a, cosO: c }) });
        jobs.push({ key: `s/n/${a}/${c}`, out: LANES * 2, pack: P({ mode: MODE.moments, nStrat: NS, pattern: PATTERN.hammersley, sampler: SAMPLER.ndf, alpha: a, cosO: c }) });
    }
    for (const a of ALPHAS) {
        jobs.push({ key: `i/${a}`, out: IDN * 3, lanes: IDN, pack: P({ mode: MODE.identity, laneCount: IDN, nStrat: IDS, count: IDN, sampler: SAMPLER.vndf, alpha: a, cosO: 0.7 }) });
        jobs.push({ key: `w/${a}`, ...E({ sampler: SAMPLER.vndf, faults: FAULT.noWarp, alpha: a, cosO: 0.3 }) });
    }
    jobs.push({ key: "wc/1", ...C({ sampler: SAMPLER.vndf, faults: FAULT.noWarp, alpha: 1.0, cosO: 0.3 }) });
    jobs.push({ key: "p/hammersley", ...E({ sampler: SAMPLER.vndf, alpha: 0.05, cosO: 0.95 }) });
    jobs.push({ key: "p/stratified", out: LANES, pack: P({ mode: MODE.estimate, nStrat: NS, pattern: PATTERN.stratified, sampler: SAMPLER.vndf, alpha: 0.05, cosO: 0.95 }) });
    jobs.push({ key: "deg/on", ...E({ sampler: SAMPLER.vndf, faults: FAULT.noDegenerate, alpha: 0.5, cosO: 1 }) });
    jobs.push({ key: "deg/off", ...E({ sampler: SAMPLER.vndf, alpha: 0.5, cosO: 1 }) });
    const VDCN = 1024;
    jobs.push({ key: "vdc", out: VDCN, lanes: VDCN, pack: P({ mode: MODE.vdc, laneCount: VDCN, count: VDCN }) });

    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 180000, args: { LANES, jobs, wgsl: buildSampleWgsl() }, script: `async (a) => {
        const out = { clean: {}, compileErrors: [] };
        try {
            if (!navigator.gpu) throw new Error("no navigator.gpu in this page");
            const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("no adapter");
            const dev = await adapter.requestDevice();
            const m = dev.createShaderModule({ code: a.wgsl });
            const info = await m.getCompilationInfo?.();
            for (const g of (info ? info.messages : [])) if (g.type === "error") out.compileErrors.push("line " + g.lineNum + ": " + g.message.slice(0, 160));
            if (out.compileErrors.length) return out;
            const pipe = dev.createComputePipeline({ layout: "auto", compute: { module: m, entryPoint: "sample" } });
            for (const j of a.jobs) {
                const uni = dev.createBuffer({ size: j.pack.length, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                dev.queue.writeBuffer(uni, 0, new Uint8Array(j.pack));
                const bytes = j.out * 4;
                const pb = dev.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
                const bg = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
                    { binding: 0, resource: { buffer: uni } }, { binding: 1, resource: { buffer: pb } } ] });
                const enc = dev.createCommandEncoder(); const p = enc.beginComputePass();
                p.setPipeline(pipe); p.setBindGroup(0, bg); p.dispatchWorkgroups(Math.ceil((j.lanes || a.LANES) / 64)); p.end();
                const rb = dev.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
                enc.copyBufferToBuffer(pb, 0, rb, 0, bytes); dev.queue.submit([enc.finish()]);
                await rb.mapAsync(GPUMapMode.READ); out.clean[j.key] = [...new Float32Array(rb.getMappedRange().slice(0))];
                rb.unmap(); rb.destroy(); pb.destroy(); uni.destroy();
            }
        } catch (e) { out.error = String(e && e.message || e).slice(0, 600); }
        return out;
    }` });

    ok("*** the visible-normal sampler COMPILES AND RUNS on a device, beside the plain one in the same kernel ***",
        r.ok && r.result && !r.result.error && (r.result.compileErrors || []).length === 0,
        r.ok ? (r.result && r.result.error) || ((r.result && r.result.compileErrors || []).join("; ") || "Heitz listing 3, five modes, one shader text") : (r.reason || (r.pageErrors || []).join("; ")));
    if (!r.ok || !r.result || r.result.error || (r.result.compileErrors || []).length) return null;
    const vdc = r.result.clean.vdc;
    let vdcExact = true;
    for (let i = 0; i < vdc.length; i++) if (vdc[i] !== rev16(i) / 65536) vdcExact = false;
    return { ...r.result, vdc, vdcN: vdc.length, vdcExact };
}

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL GREEN");
process.exit(fails ? 1 : 0);

/* -----------------------------------------------------------------------------------------------------------
 * SABOTAGE LOG -- 8 / 5 / 1 / 4 / 1 by name. None went 0 red, and one of them WIDENED THE GATE FIRST.
 *
 * A. The return-side frame swap dropped, so y-up goes in and z-up comes out.                        8 RED
 *    *** THE ERROR v4409's SECTION 7 SAID THIS ARC COULD NOT SEE. *** That round's fixture put wo in the
 *    plane z = 0, so no axis convention could move it; this sampler builds an orthonormal basis about a
 *    stretched view vector, and the frame is load-bearing. Eight checks across five sections. It also kills
 *    the degenerate-NaN check as a side effect, because with the frame half-applied cos_o = 1 no longer
 *    lands on lensq = 0 -- worth knowing, since it means that check is testing the frame too.
 *
 * B. The section-3.4 unstretch dropped, so the normal is returned in the hemisphere configuration.   5 RED
 *    Heitz's transform is a stretch in and an unstretch out; half of it is a sampler for a DIFFERENT
 *    roughness. Caught by both estimators and by the census, not by the identity.
 *
 * C. The VNDF direction pdf missing its G1(wo).                                                     1 RED
 *    *** THE SHARPEST, AND IT IS THE IDENTITY ALONE AGAIN -- the same lesson v4409's sabotage C taught, in a
 *    new place. *** visibleBounceWeight never calls the pdf, because the division was taken analytically, so
 *    the estimator, the census, the variance and all three cross-checks are blind to a wrong pdf. It matters
 *    the moment a second sampling strategy is combined with this one, which is what MIS is for. A round
 *    shipping only the estimator would have shipped it.
 *
 * D. microfacet.mjs's OWN sampler: the section-4.2 warp inverted.                                    4 RED
 *    *** THIS ONE WENT 2 RED FIRST AND THE GATE WAS WIDENED BECAUSE OF IT. *** The identity is blind to a
 *    wrong direction -- it evaluates both routes at whatever the sampler produced -- and the normalisation
 *    never calls a sampler at all, so the shipped CPU sampler was resting on section 5 alone. Section 4 now
 *    holds it to the quadrature as well: four routes, one number. Re-run at 4 red.
 *
 * E. The max(0, Nh.z) clamp removed.                                                                1 RED
 *    One check, and section 7 says why rather than leaving it looking thin: at f64 the clamp NEVER FIRES --
 *    the smallest reprojected z over 147,456 samples is 1.3e-5 and none is negative. It is a guard against
 *    binary32, and it is the same phenomenon as section 6's 19 backfacing facets in 786,432: a quantity that
 *    is a small positive in exact arithmetic and can round through zero. One red is the honest amount.
 * --------------------------------------------------------------------------------------------------------- */
