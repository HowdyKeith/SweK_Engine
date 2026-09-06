// WebGLEngine/tools/ship/deviceReach-selfcheck.mjs -- v4488
//
// Run: node tools/ship/deviceReach-selfcheck.mjs
//
// Grades render/deviceReach.mjs: the census of comments that still say this box has no device, and the two
// FLOORS a value grade may not claim past.
//
// *** SECTION 3 IS THE ROUND'S POINT. *** v4487 left five of v4486's emitters as compile receipts. Grading
// two of them gave one clean answer and one that LOOKED like a defect: panini's GLSL disagrees with its JS
// by 8.9e-5, ninety times the transport floor. The bisection here shows every algebraic step at the floor and
// only the two transcendentals above it -- so the number is SwiftShader's cosine against V8's, and reporting
// it without that floor beside it would have started a hunt for a bug that is not there.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as D from "../../render/deviceReach.mjs";
import { renderGlslToPixels, webgpuSkipReason } from "./webgpuHarness.mjs";
import { PACK24_GLSL, unpack24Signed, PACK24_FLOOR_SIGNED } from "./glslFloatPack.mjs";
import { paniniProject, paniniGLSL } from "../../render/panini.js";
import { NOISE_COMMON, SNOISE3 } from "../../shaders/ashimaNoise.js";
import { snoise3, snoise3f32 } from "../../shaders/ashimaNoise.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const M = D.MEASURED_AT_V4488;

// *** ASSEMBLED, BECAUSE THIS GATE SEARCHES FOR SENTENCES AND WOULD OTHERWISE BE ONE. *** Six rounds running,
// a scan in this tree has found itself; the pattern below is built from fragments and section 5 asserts that
// neither this file nor the module it grades is in the population.
const NEG = "(can" + "not|can'" + "t|can n" + "ot|noth" + "ing|no |has no|is no)";
const VERB = "(r" + "un|exe" + "cute|comp" + "ile|dri" + "ve|tim" + "e)";
const NOUN = "(G" + "PU|We" + "bGPU|We" + "bGL|sha" + "der|WG" + "SL|GL" + "SL|dev" + "ice)";
const HERE = "(he" + "re|this sand" + "box|the sand" + "box|head" + "less|in n" + "ode|a n" + "ode process|this box)";
const CLAIM_RE = new RegExp(NEG + "[^.]{0,60}" + VERB + "[^.]{0,40}" + NOUN, "i");
const HERE_RE = new RegExp(HERE, "i");

/** Every comment line in the tree that asserts, of THIS environment, that a shader or device cannot run. */
function scan() {
    const skip = new Set(["node_modules", ".git", "vendor"]);
    const hits = new Map();
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (skip.has(e.name)) continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!/\.(js|mjs|html)$/.test(e.name)) continue;
            for (const line of fs.readFileSync(p, "utf8").split("\n")) {
                if (!/^\s*(\/\/|\*|\/\*)/.test(line)) continue;         // comments only
                if (!CLAIM_RE.test(line) || !HERE_RE.test(line)) continue;
                // gfx/device.js's runtime message is about a PIPELINE lacking WGSL, not about this box.
                if (/no WGSL/.test(line)) continue;
                const rel = path.relative(ENG, p);
                if (!hits.has(rel)) hits.set(rel, line.trim());
            }
        }
    };
    walk(ENG);
    return hits;
}
const HITS = scan();

// ---- 1. *** THE CENSUS, AND THE THREE ROWS THAT ARE THE CORRECTION RATHER THAN THE CLAIM *** ------------------
{
    const listed = new Set(D.CLAIMS.map((c) => c.file));
    const extra = [...HITS.keys()].filter((f) => !listed.has(f));
    const missing = D.CLAIMS.filter((c) => !HITS.has(c.file)).map((c) => c.file);
    say(`${HITS.size} files carry a comment asserting this environment has no device`);
    ok("*** the scan finds exactly the hand-read population, with nothing unlisted ***",
        extra.length === 0 && missing.length === 0 && HITS.size === M.scannedClaims,
        extra.length || missing.length ? "extra: " + extra.join(", ") + " missing: " + missing.join(", ")
                                       : `${HITS.size} files, all in CLAIMS`);
    const stale = D.CLAIMS.filter((c) => c.kind === D.CLAIM.STALE);
    const corr = D.CLAIMS.filter((c) => c.kind === D.CLAIM.CORRECTION);
    ok("*** FIFTEEN are live claims and THREE are the correction quoting them to refute it ***",
        stale.length === M.stale && corr.length === M.corrections && stale.length + corr.length === HITS.size,
        `${stale.length} stale, ${corr.length} corrections`);
    // A correction must actually refute; a row marked "correction" that only repeats the claim is a claim.
    ok("!! ...and every correction row really does refute, in the same file",
        corr.every((c) => /was wrong|is false|it was false|WAS WRONG/i.test(fs.readFileSync(path.join(ENG, c.file), "utf8"))),
        corr.map((c) => c.file.split("/").pop()).join(", "));
    ok("...and the three files this round corrected are marked, and only those three",
        D.CLAIMS.filter((c) => c.correctedAt === "v4488").length === M.correctedThisRound &&
        M.correctedThisRound + M.remaining === M.stale,
        `${M.correctedThisRound} corrected, ${M.remaining} still standing`);
}

// ---- 2. *** THE CLAIM IS FALSE, AND THE PROOF IS THAT SIX GATES DO THE THING IT FORBIDS *** -------------------
{
    const gates = M.gatesThatDoTheImpossibleThing;
    const found = gates.filter((g) => fs.existsSync(path.join(ENG, "tools", "ship", g + "-selfcheck.mjs")) ||
                                      fs.existsSync(path.join(ENG, "tools", "ship", g + ".mjs")));
    ok("*** the tree contains gates that compile and run shaders on this box, by name ***",
        found.length === gates.length, found.join(", "));
    // *** A LIST OF FILENAMES IS NOT EVIDENCE. *** The claim is falsified by RUNNING something, so this row
    // does, with the smallest shader that can fail: a constant, whose value the readback must reproduce.
    const skip = webgpuSkipReason();
    if (skip) { say("SKIPPED, no device: " + skip); }
    else {
        const r = await renderGlslToPixels({
            vertex: "#version 300 es\nvoid main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;\n" +
                    "  gl_Position = vec4(p, 0.0, 1.0); }",
            fragment: "#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main(){ c = vec4(0.25, 0.5, 0.75, 1.0); }",
            width: 4, height: 4 });
        ok("*** and a shader compiled and drew, here, now -- which is what the fifteen say cannot happen ***",
            r.ok === true && r.pixels[0] === 64 && r.pixels[1] === 128 && r.pixels[2] === 191,
            r.ok ? `rgb ${r.pixels[0]},${r.pixels[1]},${r.pixels[2]} from vec4(0.25, 0.5, 0.75) on ${r.renderer}`
                 : String(r.error || r.reason).slice(0, 140));
        ok("!! ...and that control can fail: a frame that never drew reads all zero, not 64,128,191",
            r.distinctColours === 1 && r.pixels[0] !== 0,
            "one colour is right for a constant shader; the VALUES are what separate it from a dead frame");
    }
}

// ---- 3. *** THE TRIG FLOOR: EVERY ALGEBRAIC STEP AT THE TRANSPORT FLOOR, AND ONLY THE TRANSCENDENTALS ABOVE IT
const skip = webgpuSkipReason();
const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  gl_Position = vec4(p, 0.0, 1.0); }`;
const N = 16, S = D.PANINI_BISECTION.packScale;
const drive = async (decls, expr) => {
    const g = await renderGlslToPixels({ vertex: VS, width: N, height: N, fragment: `#version 300 es
precision highp float;
out vec4 fragColor;
${decls}
${PACK24_GLSL}
void main(){ vec2 c = floor(gl_FragCoord.xy);
  vec3 d = vec3(c.x / 8.0 - 1.0, c.y / 8.0 - 1.0, -1.0);
  fragColor = pack24((${expr}) / ${(2 * S).toFixed(1)} + 0.5); }` });
    return g;
};
const worst = (g, ref) => {
    let m = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++)
        m = Math.max(m, Math.abs(unpack24Signed(g.pixels, (N - 1 - j) * N + i, S) - ref(i / 8 - 1, j / 8 - 1)));
    return m;
};
if (skip) { say("SKIPPED, no device: " + skip); }
else {
    console.log("\n3. WHY panini's 8.9e-5 IS NOT A PORT ERROR");
    const floor = PACK24_FLOOR_SIGNED * S;
    const STEPS = [
        ["atan",          "atan(d.x, -d.z)",                     (x) => Math.atan2(x, 1)],
        ["length",        "length(vec2(d.x, d.z))",              (x) => Math.hypot(x, -1)],
        ["y-over-length", "d.y / length(vec2(d.x, d.z))",        (x, y) => y / Math.hypot(x, -1)],
        ["sin-of-atan",   "sin(atan(d.x, -d.z))",                (x) => Math.sin(Math.atan2(x, 1))],
        ["cos-of-atan",   "cos(atan(d.x, -d.z))",                (x) => Math.cos(Math.atan2(x, 1))],
        ["the-S-factor",  "2.0 / (1.0 + cos(atan(d.x, -d.z)))",  (x) => 2 / (1 + Math.cos(Math.atan2(x, 1)))],
    ];
    const got = {};
    for (const [name, expr, ref] of STEPS) {
        const g = await drive("", expr);
        if (!g.ok) { ok(name + " runs", false, String(g.error).slice(0, 140)); continue; }
        got[name] = worst(g, ref);
    }
    for (const step of D.PANINI_BISECTION.steps) {
        const m = got[step.expr];
        ok(`  ${step.expr.padEnd(14)} ${step.atFloor ? "is at the transport floor" : "is ABOVE it"}`,
            step.atFloor ? m <= floor * 1.5 : m > floor * 5,
            `${m.toExponential(3)} against a floor of ${floor.toExponential(3)}` +
            ` (recorded ${step.err.toExponential(3)})`);
    }
    ok("!! ...and the recorded bisection figures are what this run measured, not numbers typed beside it",
        D.PANINI_BISECTION.steps.every((s) => got[s.expr] <= s.err * 1.5 && got[s.expr] >= s.err / 1.5),
        D.PANINI_BISECTION.steps.map((s) => s.expr + " " + got[s.expr].toExponential(2)).join(", "));
    ok("*** so the floor is the COSINE, and TRIG_FLOOR is what it costs ***",
        Math.abs(got["cos-of-atan"] - D.TRIG_FLOOR) <= D.TRIG_FLOOR * 0.5 &&
        D.TRIG_FLOOR > floor * 100,
        `${D.TRIG_FLOOR.toExponential(3)} is ${Math.round(D.TRIG_FLOOR / floor)}x the transport floor -- ` +
        "SwiftShader's cos against V8's Math.cos, not any shader written above them");

    // The grade itself, and it is reported AGAINST the floor rather than as a bare number.
    const gx = await drive(paniniGLSL(), "paniniProject(d, 1.0).x");
    const gy = await drive(paniniGLSL(), "paniniProject(d, 1.0).y");
    const mx = worst(gx, (x, y) => paniniProject(x, y, -1, 1)[0]);
    const my = worst(gy, (x, y) => paniniProject(x, y, -1, 1)[1]);
    ok("*** render/panini.js's GLSL agrees with its JS, to within what a cosine costs ***",
        mx <= D.TRIG_FLOOR && my <= D.TRIG_FLOOR &&
        Math.abs(mx - D.PANINI_ON_DEVICE.x) <= D.PANINI_ON_DEVICE.x * 0.5 &&
        Math.abs(my - D.PANINI_ON_DEVICE.y) <= D.PANINI_ON_DEVICE.y * 0.5,
        `x ${mx.toExponential(3)}, y ${my.toExponential(3)}, floor ${D.TRIG_FLOOR.toExponential(3)}`);
    ok("!! ...and it would still fail if the shader were wrong: a reference bent by 1e-3 clears the floor",
        Math.abs(paniniProject(0.5, 0.5, -1, 1)[1] * 1.001 - paniniProject(0.5, 0.5, -1, 1)[1]) > D.TRIG_FLOOR,
        "a tolerance nothing can breach is not a tolerance");
    // *** THE OBVIOUS EXPLANATION WAS TESTED AND REFUSED BEFORE THE TRIG WAS BLAMED. ***
    const f = Math.fround;
    const f32 = (x, y) => { const th = f(Math.atan2(f(x), 1)), dn = f(1 + f(Math.cos(th)));
        return f(f(2 / dn) * f(y / f(Math.sqrt(f(f(x * x) + 1))))); };
    const mf = worst(gy, f32);
    // *** THE RECORDED worstDenom WAS DECORATION UNTIL A SABOTAGE CHANGED IT AND NOTHING WENT RED. *** It is
    // the load-bearing half of the claim: "unchanged under f32" rules out precision, and "far from the
    // singularity" rules out the horizon. Both are derived here.
    let wd = null, wm = -1;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = i / 8 - 1, y = j / 8 - 1;
        const e = Math.abs(unpack24Signed(gy.pixels, (N - 1 - j) * N + i, S) - f32(x, y));
        if (e > wm) { wm = e; wd = 1 + Math.cos(Math.atan2(x, 1)); }
    }
    ok("!! ...and the worst point is nowhere near the horizon, which is the half that rules OUT conditioning",
        Math.abs(wd - D.PANINI_BISECTION.f32SimulatedReference.worstDenom) < 1e-3 && wd > 1.5,
        `denom ${wd.toFixed(4)} at the worst point; the projection is ill-conditioned as denom approaches 0`);
    ok("!! f32 conditioning is NOT the cause, and that was measured rather than assumed",
        Math.abs(mf - my) < my * 0.05 &&
        Math.abs(mf - D.PANINI_BISECTION.f32SimulatedReference.y) <= D.PANINI_BISECTION.f32SimulatedReference.y * 0.5,
        `driving the reference through Math.fround gives ${mf.toExponential(3)} against ${my.toExponential(3)} ` +
        `-- unchanged; and the worst point sits at denom ${D.PANINI_BISECTION.f32SimulatedReference.worstDenom}, ` +
        "nowhere near the horizon where the projection is actually ill-conditioned");
}

// ---- 4. *** THE CONTROL: A TRIG-FREE SHADER, WHERE THE ONLY BUDGET IS TRANSPORT *** ----------------------------
if (skip) { say("SKIPPED, no device: " + skip); }
else {
    console.log("\n4. shaders/ashimaNoise.js: NO SINE ANYWHERE, SO THE TRANSPORT FLOOR IS THE WHOLE BUDGET");
    const src = NOISE_COMMON.join("\n") + "\n" + SNOISE3.join("\n");
    ok("!! the control really is trig-free -- otherwise it is not a control for the row above",
        !/\b(sin|cos|tan|atan|asin|acos)\s*\(/.test(src) && D.ASHIMA_ON_DEVICE.trigFree === true,
        "simplex noise is floor, fract and polynomials");
    const g = await drive(src, "snoise(vec3(d.x, d.y, 0.375))");
    const A = D.ASHIMA_ON_DEVICE, floor = PACK24_FLOOR_SIGNED * S;
    ok("the noise ran and the frame is not a dead one", g.ok === true && g.distinctColours > 1,
        "distinct colours " + (g.ok ? g.distinctColours : "ERR"));
    const m32 = worst(g, (x, y) => snoise3f32(x, y, 0.375));
    const m64 = worst(g, (x, y) => snoise3(x, y, 0.375));
    ok("*** the GLSL agrees with snoise3f32 to the transport floor -- exact, to the instrument ***",
        m32 <= floor && Math.abs(m32 - A.vsF32) <= A.vsF32 * 0.5,
        `${m32.toExponential(3)} against ${floor.toExponential(3)}`);
    ok("*** and disagrees with snoise3 by FOUR WHOLE UNITS, on a function whose range should be about [-1,1] ***",
        m64 > 1 && Math.abs(m64 - A.vsF64) <= A.vsF64 * 0.5,
        `${m64.toExponential(3)} -- not a rounding difference; Ashima's permute overflows f32 in a way the ` +
        "algorithm depends on, so the lattice indices themselves differ");
    // The ranges, because "four units apart" invites the reading that one of them is huge and it is not obvious which.
    let lo64 = Infinity, hi64 = -Infinity, lo32 = Infinity, hi32 = -Infinity;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const a = snoise3(i / 8 - 1, j / 8 - 1, 0.375), b = snoise3f32(i / 8 - 1, j / 8 - 1, 0.375);
        lo64 = Math.min(lo64, a); hi64 = Math.max(hi64, a); lo32 = Math.min(lo32, b); hi32 = Math.max(hi32, b);
    }
    ok("!! ...and it is the f64 path that leaves the range a simplex noise is supposed to have",
        lo64 < -1 && hi64 > 1 && lo32 > -1 && hi32 < 1 &&
        Math.abs(lo64 - A.f64Range[0]) < 0.01 && Math.abs(hi32 - A.f32Range[1]) < 0.01,
        `snoise3 [${lo64.toFixed(4)}, ${hi64.toFixed(4)}] against snoise3f32 [${lo32.toFixed(4)}, ${hi32.toFixed(4)}]`);
    ok("*** so v4243's CPU-only decision to add snoise3f32 is confirmed on a driver, five hundred rounds later ***",
        m32 < m64 / 1e6 && /snoise3f32/.test(fs.readFileSync(path.join(ENG, "shaders", "ashimaNoise.mjs"), "utf8")),
        "the f32 path was chosen by simulating f32 in JavaScript; this is the first time a device was asked");
}

// ---- 5. *** THE SCAN MUST NOT FIND ITSELF, AND THE OPEN ROWS MUST STAY OPEN *** --------------------------------
{
    ok("*** neither this gate nor the module it grades is in the population it scans ***",
        !HITS.has("render/deviceReach.mjs") && !HITS.has("tools/ship/deviceReach-selfcheck.mjs"),
        "the pattern is assembled from fragments and no row stores a quote -- six rounds of that trap, disarmed");
    ok("!! ...and the rows this round did NOT run are still marked open, not quietly rewritten",
        D.OPEN.remaining === M.remaining && /ran the shader/.test(D.OPEN.why) &&
        D.CLAIMS.filter((c) => c.kind === D.CLAIM.STALE && !c.correctedAt).length === M.remaining,
        "rewriting a sentence about a shader nobody drove trades one unverified claim for another");
    ok("!! ...and the detector's known miss is named rather than left to look like completeness",
        D.OPEN.knownMisses.length >= 1 &&
        D.OPEN.knownMisses.every((f) => fs.existsSync(path.join(ENG, f)) && !HITS.has(f)),
        D.OPEN.knownMisses.join(", ") + " -- phrased about a gate rather than a box, so the pattern misses it");
    ok("...and the three corrected files no longer carry the claim",
        D.CLAIMS.filter((c) => c.correctedAt === "v4488")
                .every((c) => /USED TO END|WAS WRITTEN AT|used to end/.test(fs.readFileSync(path.join(ENG, c.file), "utf8"))),
        "each keeps the old sentence quoted, with the round that disproved it, rather than deleting the history");
}

console.log("\ndeviceReach-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
