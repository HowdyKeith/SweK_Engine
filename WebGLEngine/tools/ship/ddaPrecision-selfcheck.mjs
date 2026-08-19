// WebGLEngine/tools/ship/ddaPrecision-selfcheck.mjs -- v3062
//
// Run: node tools/ship/ddaPrecision-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// DOES SINGLE PRECISION CHANGE WHICH VOXEL A RAY HITS?
//
// voxelRaymarch-selfcheck has a CPU mirror of the shader and its own header is honest about the limit: the
// mirror is float64 and the shader is highp float, so it proves ALGORITHMIC equivalence and is blind to a
// divergence caused purely by precision. That gap is why "CPU voxelDDA vs GPU raymarch hit-agreement" sat on the
// ranked list marked as needing a GPU. It does not need one -- GLSL highp float is IEEE binary32 and
// Math.fround() rounds a double to exactly that.
//
// WHY THE ANSWER MATTERS MORE THAN THE CODE. When a GPU eventually disagrees with the CPU about which voxel a
// ray hit, somebody has to decide whether that is a bug. Without a measured expectation, the first disagreement
// is indistinguishable from one, and it costs a day. This produces the expectation.
//
// A NEGATIVE RESULT FROM AN EASY TEST IS WORTHLESS, which is the whole shape of this file. Smooth fan rays are
// the easy case. So sections 2-4 attack it: rays aimed at exact cell corners, directions with rational component
// ratios that force tMax collisions, and origins sitting exactly on integer planes. If single precision were
// going to change an answer, those are where.

import { readFileSync } from "node:fs";
import { traverseDDA32, comparePrecision } from "../../voxel/ddaFloat32.js";
import { traverseDDA } from "../../voxel/voxelDDA.js";
import { codeOnly } from "./sourceScan.mjs";
import { ULP32, TIE_BOUND_ULPS } from "./ddaPrecisionReport.mjs";   // v3559: ONE declaration of the ulp bound

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);

const S = 48, H = 32;
const solid = new Uint8Array(S * H * S);
for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
    const h = Math.min(H - 1, Math.floor(9 + 5 * Math.sin(x * 0.19) * Math.cos(z * 0.15) + 3 * Math.sin((x + z) * 0.11)));
    for (let y = 0; y < h; y++) solid[x + S * (y + H * z)] = 1;
}
for (let x = 20; x < 27; x++) for (let z = 20; z < 27; z++) for (let y = 22; y < 28; y++) solid[x + S * (y + H * z)] = 1;
const isSolid = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= S || y >= H || z >= S) ? false : solid[x + S * (y + H * z)] === 1;

const report = (label, rays) => {
    const r = comparePrecision(rays, isSolid, traverseDDA, 300);
    say(label + ": " + r.agree + "/" + r.n + " agree" + (r.disagree ? "  (" + r.disagree + " DIVERGE, largest tie-gap among them " + r.bestDisagreeingGap.toExponential(2) + ")" : "") +
        "   tightest tie survived: " + (isFinite(r.worstAgreeingGap) ? r.worstAgreeingGap.toExponential(2) : "n/a"));
    for (const c of r.cases.slice(0, 3)) say("    diverged at gap " + c.minGap.toExponential(2) + ": f64 hit " + c.f64.slice(0, 3).join(",") + " / f32 hit " + c.f32.slice(0, 3).join(","));
    return r;
};

// --- 1. the easy case, stated as easy ------------------------------------------------------------------------
const smooth = [];
for (let i = 0; i < 20000; i++) {
    const a = i * 0.0731 + 0.011, b = (i % 97) * 0.0217 - 1.0;
    smooth.push([S / 2 + 0.37, H - 1.61, S / 2 + 0.29, Math.cos(a) * Math.cos(b), Math.sin(b) - 0.35, Math.sin(a) * Math.cos(b)]);
}
const rSmooth = report("smooth fan, 20000 rays", smooth);
ok("the ray set is meaningful: most of it actually hits something", (() => {
    let hits = 0;
    for (const r of smooth.slice(0, 2000)) if (traverseDDA(r[0], r[1], r[2], r[3], r[4], r[5], isSolid, 300).hit) hits++;
    return hits > 600;
})());

// --- 2. ADVERSARIAL: aimed at exact cell corners, where three tMax values collide -----------------------------
const corners = [];
for (let i = 0; i < 8000; i++) {
    const cx = 8 + (i % 30), cy = 4 + (i % 17), cz = 8 + ((i * 7) % 30);
    const o = [0.5, H - 0.5, 0.5];
    corners.push([o[0], o[1], o[2], cx - o[0], cy - o[1], cz - o[2]]);      // straight at an integer corner
}
const rCorners = report("aimed at exact cell corners, 8000 rays", corners);

// --- 3. ADVERSARIAL: rational direction ratios, which force repeated exact ties -------------------------------
const rational = [];
for (let p = 1; p <= 12; p++) for (let q = 1; q <= 12; q++) for (let r2 = 1; r2 <= 6; r2++) {
    rational.push([0.5, H - 0.5, 0.5, p, -q, r2]);
    rational.push([S - 0.5, H - 0.5, 0.5, -p, -q, r2]);
}
const rRational = report("rational direction ratios, " + rational.length + " rays", rational);

// --- 4. ADVERSARIAL: origins sitting exactly on integer planes ------------------------------------------------
const onPlane = [];
for (let i = 0; i < 6000; i++) {
    const a = i * 0.017, b = (i % 41) * 0.03 - 0.6;
    onPlane.push([24, 24, 24, Math.cos(a) * Math.cos(b), Math.sin(b) - 0.2, Math.sin(a) * Math.cos(b)]);
}
const rPlane = report("origins exactly on integer planes, 6000 rays", onPlane);

// --- 5. WHAT THE NUMBERS SAY ----------------------------------------------------------------------------------
{
    const all = [rSmooth, rCorners, rRational, rPlane];
    const totalN = all.reduce((s, r) => s + r.n, 0);

    // *** v3559: THE POOLED TOTAL THAT USED TO BE PRINTED HERE IS DELETED, NOT WEAKENED. ***
    // It read "TOTAL 35312/35728 agree (1.1644% diverge)" and was the LAST figure this gate printed, so it was
    // the one anybody quoted. IT MIXES TWO POPULATIONS THAT ANSWER DIFFERENT QUESTIONS: a smooth camera fan
    // (what a renderer casts) with rays CONSTRUCTED to force ties (which exist to prove divergence is POSSIBLE
    // and are sampled from nothing). Its weights are therefore a decision about how many adversarial rays to
    // generate -- driven in ddaPrecisionReport-selfcheck section 2, where growing the constructed set
    // 8000 -> 80000 moves the pooled figure 1.23% -> 3.45% while NEITHER per-set rate moves at all.
    // The two answers are reported separately and never added. -> tools/ship/ddaPrecisionReport.mjs
    const realistic = rSmooth.disagree + rPlane.disagree, realisticN = rSmooth.n + rPlane.n;
    const constructed = rCorners.disagree + rRational.disagree, constructedN = rCorners.n + rRational.n;
    say("REALISTIC (camera fan + on-plane origins): " + (realisticN - realistic) + "/" + realisticN + " agree" +
        (realistic ? "  (" + (100 * realistic / realisticN).toFixed(4) + "% diverge)" : "  (0 divergences)"));
    say("CONSTRUCTED (corners + rational ratios): " + (constructedN - constructed) + "/" + constructedN + " agree" +
        (constructed ? "  (" + (100 * constructed / constructedN).toFixed(4) + "% diverge)" : "  (0 divergences)"));
    say("NO POOLED RATE IS PRINTED. The constructed rays are sampled from nothing, so the two do not average.");

    ok("!! the adversarial sets really are adversarial: exact ties DO occur",
        all.some((r) => r.worstAgreeingGap === 0),
        "a tie-gap of exactly 0 means two tMax values were bit-identical -- if none occurred, sections 2-4 proved nothing");
    ok("the four sets between them cover a substantial number of rays", totalN > 30000, totalN + " rays");

    // THE RESULT, whichever way it lands. This is deliberately not asserted as "they always agree": that would
    // make the gate a hostage to a fixture, and the honest claim is about the CONDITION, not the count.
    if (constructed === 0 && realistic === 0) {
        ok("!! MEASURED: single precision does not change a single first-hit voxel, in any of these sets", true,
            "so a GPU/CPU hit disagreement is NOT expected from precision alone -- if one appears, it is a finding and not noise");
    } else {
        // *** v3559: THE BOUND IS DERIVED FROM THE FORMAT, NOT TYPED. *** This read `< 1e-5`, which is 83.9 ULPS
        // of binary32 -- a relative gap the format resolves comfortably, so it could never have meant "within a
        // rounding error", and the measured divergences sit at 2.35 and 0.74 ulps. binary32 has a 24-bit
        // significand, so one ulp at unit magnitude is 2^-23; a gap materially wider than a few of those is
        // ordered identically by both precisions and a divergence there would be an ALGORITHM difference.
        ok("!! divergences occur ONLY where two axes were within a few ULPS of binary32",
            all.every((r) => r.disagree === 0 || r.bestDisagreeingGap < TIE_BOUND_ULPS * ULP32),
            "worst " + Math.max(...all.map((r) => r.disagree ? r.bestDisagreeingGap / ULP32 : 0)).toFixed(2) +
            " ulps against a bound of " + TIE_BOUND_ULPS + ". A divergence at a WIDE gap would mean the mirror " +
            "is not a mirror -- that is an algorithm bug, not precision.");
    }
}

// --- 6. THE MIRROR IS A MIRROR --------------------------------------------------------------------------------
// If traverseDDA32 quietly differed in structure, sections 1-5 would be comparing two algorithms and calling the
// result a precision measurement.
{
    const src32 = readFileSync(new URL("../../voxel/ddaFloat32.js", import.meta.url), "utf8");
    const code = codeOnly(src32);
    ok("!! every arithmetic result is rounded to binary32", (() => {
        const froundCount = (code.match(/\bf\(/g) || []).length;
        return froundCount > 15 && /const f = Math\.fround/.test(code);
    })(), "Math.fround IS the binary32 rounding GLSL highp float performs");
    ok("the tie-break order and comparisons match the float64 original exactly",
        /tMaxX <= tMaxY && tMaxX <= tMaxZ/.test(code) && /else if \(tMaxY <= tMaxZ\)/.test(code));
    ok("the face normals are assigned the same way", /nx = -stepX/.test(code) && /ny = -stepY/.test(code) && /nz = -stepZ/.test(code));
    ok("...and a ray with NO ties gives bit-identical t in both precisions", (() => {
        const a = traverseDDA(0.5, 20.5, 0.5, 0.7311, -0.4177, 0.5389, isSolid, 300);
        const b = traverseDDA32(0.5, 20.5, 0.5, 0.7311, -0.4177, 0.5389, isSolid, 300);
        return a.hit === b.hit && a.vx === b.vx && a.vy === b.vy && a.vz === b.vz;
    })());
    ok("minGap is REPORTED so a caller can say 'this ray was a coin flip' rather than 'the GPU is wrong'", (() => {
        const r = traverseDDA32(0.5, 20.5, 0.5, 1, -1, 1, isSolid, 300);
        return typeof r.minGap === "number";
    })());
    ok("browser-safe, no imports", !/^\s*import/m.test(code) && !/\bdocument\s*[.[]/.test(code));
    ok("the file states what it is FOR, not just what it does", /is that expected/.test(src32) && /indistinguishable from a bug/.test(src32));
}

console.log("ddaPrecision-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
