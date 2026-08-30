// WebGLEngine/physics/sph/portableMath-selfcheck.mjs — v2546
//
// Run: node physics/sph/portableMath-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// IEEE 754 PINS +, -, *, / AND sqrt. IT PINS NOTHING ELSE.
//
// Those five are correctly rounded by the standard: same inputs, same bits, on any conforming hardware, forever.
// pow, sin, cos, tan, cbrt, exp, log and hypot are NOT in that list, and ECMAScript does not add them -- the spec
// calls Math.pow "implementation-approximated". V8 on arm64 may differ from V8 on x86_64 in the last ulp and
// break no rule doing it.
//
// This engine asserts "same ticks -> bit-identical body" (fleshSph-selfcheck) and has only ever verified it ON
// ONE MACHINE. An arm64 Mac joins the fleet tomorrow and every other box is x86_64. So the assertion is about to
// be tested for real, and it was resting on Math.pow.
//
// MEASURED, ON THIS x86_64 BOX: Math.pow(h, 9) and h*h*h*h*h*h*h*h*h DISAGREE. Worst relative difference 6.09e-16
// -- about 3 ulps -- at h = 0.1, 0.35, 0.3762, 0.4739 (they agree only at 1 and 2.5, where the exponent lands on
// exact binary values). If two spellings of h^9 disagree on ONE machine, the one that is not IEEE-pinned is the
// one to drop.
//
// AND THIS IS 2+2+2=8 vs 2x2x2=9 AGAIN. Math.pow may well be MORE accurate -- it can be correctly rounded in a
// single step where nine multiplications round nine times. But it is implementation-approximated and
// multiplication is exact. The choice is: a slightly more accurate number two machines may disagree about, or a
// slightly less accurate number they CANNOT disagree about. The second one is the one you can check.
//
// This is a PHYSICS CHANGE, not a cleanup, and calling it a cleanup would be a lie: the numbers moved by ~3 ulps.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { poly6, spikyGrad, viscLaplacian } from "./kernels.js";
import { pressureOf, taitB, ipow, IPOW_MAX } from "./sph.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// Everything IEEE 754 does NOT pin. Math.PI is a constant and is fine. Math.min/max/abs/floor/round/sign are
// exact selections, not approximations, and are fine.
const UNPINNED = /Math\.(pow|sin|cos|tan|asin|acos|atan2|atan|sinh|cosh|tanh|exp|expm1|log|log2|log10|log1p|cbrt|hypot|fround)\s*\(/g;

/** The files whose output this engine claims is reproducible. If a module is on this list, it may use only
 *  arithmetic the standard pins. */
const DETERMINISTIC = [
    "physics/sph/kernels.js",
    "physics/sph/spatialGrid.js",
    "physics/soft/boneField.js",
    "physics/soft/fleshDynamics.js",
    "simulation/tomo/nullspace.js",
];

/**
 * v4162 -- FILES THAT MAY USE UNPINNED MATH, BUT ONLY WHERE THE CALL SITE SAYS WHY.
 *
 * *** physics/sph/sph.js WAS NEVER ON THE LIST ABOVE, AND IT HOLDS THE EQUATION OF STATE. *** This file
 * converted the kernels at v2546 and predicted the consequence: "an arm64 Mac joins this fleet tomorrow."
 * Keith's x86_64 rig was the second machine, and at v4161 it produced a DIFFERENT KNOB RANKING from this box on
 * the same commit -- ideal-EOS numbers identical to the printed digit, tait numbers diverging from the third
 * decimal, because only the tait branch ran through Math.pow. The doctrine, the fix and this gate all existed.
 * The list omitted the one file where the divergence could reach a physics result.
 *
 * It cannot simply join DETERMINISTIC, because two of its call sites are genuinely unpinnable, and a list that
 * demanded the impossible would get the file removed from it again. SO THE RULE IS A MARKER RATHER THAN A
 * COUNT: every unpinned call must carry `UNPINNED-OK:` and a reason, ON ITS OWN LINE, where the next person to
 * read that line will see it. A new unpinned call fails until somebody writes down why -- which is the moment
 * to notice it, and it is a moment a frozen baseline number does not provide.
 */
const MARKED = ["physics/sph/sph.js"];

/** What MARKED files are expected to still carry. Not a ratchet to raise: each is argued at its call site, and
 *  a fourth entry appearing means the argument was made somewhere this gate has not read. */
const MARKED_EXPECT = { "physics/sph/sph.js": { pow: 1, cos: 1, sin: 1 } };

/** Blank out comments WITHOUT collapsing lines, so a hit's line number still indexes the raw source. The
 *  stripper used above deletes them, which is fine for counting and useless for asking what a line says. */
function maskComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
              .replace(/(^|[^:])\/\/[^\n]*/gm, (m, pre) => pre + " ".repeat(m.length - pre.length));
}

// ---- 1. the hot path uses nothing the standard leaves open --------------------------------------------------
{
    for (const rel of DETERMINISTIC) {
        const p = path.join(root, rel);
        if (!fs.existsSync(p)) { ok("the deterministic list points at a real file: " + rel, false, "MISSING -- a list that names files that do not exist checks nothing"); continue; }
        const src = fs.readFileSync(p, "utf8");
        // strip comments: a comment ABOUT Math.pow is not a call to it. Without this, this very file's header
        // would fail its own check -- and a check that cannot survive being explained is a bad check.
        const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
        const hits = [...code.matchAll(UNPINNED)].map((m) => m[0].replace(/\s*\($/, ""));
        ok(rel + " uses only arithmetic IEEE 754 pins", hits.length === 0,
           hits.length ? "UNPINNED: " + [...new Set(hits)].join(", ") + " -- arm64 and x86_64 may disagree here"
                       : "only + - * / sqrt and constants");
    }
}

// ---- 2. THE MEASUREMENT THAT STARTED THIS -------------------------------------------------------------------
// If the two spellings agreed, this whole file would be superstition. They do not.
{
    let worst = 0, at = 0;
    for (const h of [0.1, 0.35, 0.3762, 0.4739, 0.5, 1.7]) {
        const viaPow = 315 / (64 * Math.PI * Math.pow(h, 9));
        const h2 = h * h, h4 = h2 * h2, h8 = h4 * h4;
        const viaMul = 315 / (64 * Math.PI * (h8 * h));
        const rel = viaPow === viaMul ? 0 : Math.abs(viaPow - viaMul) / Math.abs(viaPow);
        if (rel > worst) { worst = rel; at = h; }
    }
    ok("Math.pow and exact multiplication REALLY DO DISAGREE (this file is not superstition)", worst > 0,
       worst > 0 ? "worst " + worst.toExponential(2) + " at h=" + at + " -- on ONE machine, with one instruction set"
                 : "they agreed everywhere tested, which would make the swap pointless");
}

// ---- 3. ...and the kernels still compute the kernel ----------------------------------------------------------
// A determinism fix that changes the physics is a physics change. It moved ~3 ulps; it must not have moved more.
{
    const h = 0.4;
    // W(0,h) = 315/(64 pi h^9) * h^6  -- the peak of the poly6 kernel, by hand, with Math.pow
    const expect = (315 / (64 * Math.PI * Math.pow(h, 9))) * Math.pow(h * h, 3);
    const got = poly6(0, h);
    const rel = Math.abs(got - expect) / expect;
    ok("poly6 still computes poly6 (within a few ulps of the pow spelling)", rel < 1e-12,
       "peak " + got.toExponential(8) + " vs " + expect.toExponential(8) + ", rel " + rel.toExponential(2));
    ok("...and the kernels are still zero outside h", poly6(h * h * 1.01, h) === 0 && spikyGrad(h * 1.01, h) === 0 && viscLaplacian(h * 1.01, h) === 0);
    ok("...and positive inside", poly6(0, h) > 0);
}

// ---- 4. the one that is NOT fixed, said out loud -------------------------------------------------------------
// fleshSph derives spacing with Math.cbrt -- ONE call, at setup, and it sets h and mass, so a 1-ulp difference
// there poisons every number downstream. It is not fixed because there is no exact cbrt, and pretending otherwise
// would be worse than naming it.
{
    const p = path.join(root, "physics/soft/fleshSph.js");
    const src = fs.readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const hits = [...src.matchAll(UNPINNED)].map((m) => m[0].replace(/\s*\($/, ""));
    ok("fleshSph's ONLY unpinned call is the known cbrt (nothing new crept in)",
       hits.length === 1 && hits[0] === "Math.cbrt",
       hits.length ? "unpinned: " + hits.join(", ") + " -- cbrt is KNOWN and sets h/mass at setup, so a 1-ulp arm64/x86_64 difference changes every number downstream. THE CROSS-ARCH TEST TOMORROW WILL SAY WHETHER IT MATTERS."
                   : "none -- the cbrt was removed, and this check needs updating");
}

// ---- 5. *** THE FILE THE LIST FORGOT, AND THE MACHINE THAT FOUND IT (v4162) *** -------------------------------
{
    for (const rel of MARKED) {
        const src = fs.readFileSync(path.join(root, rel), "utf8");
        const raw = src.split("\n"), masked = maskComments(src).split("\n");
        const found = {}; const unmarked = [];
        masked.forEach((line, i) => {
            let m; const re = new RegExp(UNPINNED.source, "g");
            while ((m = re.exec(line))) {
                found[m[1]] = (found[m[1]] || 0) + 1;
                // THE MARKER IS READ FROM THE RAW LINE, WHICH IS THE WHOLE REASON maskComments EXISTS: the
                // marker IS a comment, so a stripper that deletes comments deletes the evidence it needs.
                // A REASON OF AT LEAST 12 CHARACTERS, not 12 non-space ones: the first draft spelled this
                // \S{12,} and rejected "non-integer gamma has no pinned decomposition" because the eleventh
                // character is a space. A check that rejects a good reason for having a space in it teaches
                // people to write worse reasons.
                if (!/UNPINNED-OK:\s*\S[^\n]{11,}/.test(raw[i])) unmarked.push("line " + (i + 1) + ": Math." + m[1]);
            }
        });
        ok(rel + ": every unpinned call carries UNPINNED-OK and a reason", unmarked.length === 0,
           unmarked.length ? "UNARGUED: " + unmarked.join("; ") + " -- write down why, or pin it"
                           : Object.entries(found).map(([k, v]) => "Math." + k + " x" + v).join(", ") + ", all argued at the call site");
        const want = MARKED_EXPECT[rel] || {};
        const same = Object.keys(want).length === Object.keys(found).length &&
                     Object.entries(want).every(([k, v]) => found[k] === v);
        ok("..." + rel + " carries exactly the unpinned calls it is expected to", same,
           "expected " + JSON.stringify(want) + ", found " + JSON.stringify(found));
    }
    // ipow ITSELF MUST NOT REACH FOR ANYTHING UNPINNED, or the whole exercise is circular.
    const sphSrc = maskComments(fs.readFileSync(path.join(root, "physics/sph/sph.js"), "utf8"));
    const body = sphSrc.slice(sphSrc.indexOf("export function ipow"), sphSrc.indexOf("export const IPOW_MAX"));
    ok("ipow uses multiplication and nothing else", body.length > 0 && !new RegExp(UNPINNED.source).test(body),
       "a portable power built on an unportable primitive would be theatre");

    // *** DRIVEN, NOT READ: the SHIPPED gamma takes the pinned path. *** A source scan cannot tell which branch
    // runs, and the branch is the entire point.
    const o = { eos: "tait", restDensity: 144.34, gamma: 7, soundSpeed: 15, clampPressure: false };
    o._taitB = taitB(o.restDensity, o.soundSpeed, o.gamma);
    let anyDiff = false, worst = 0, pinnedEverywhere = true, offAt = null;
    for (const rho of [100, 130.5, 144.34, 150.25, 172.9, 201.7]) {
        const r = rho / o.restDensity;
        const viaPinned = o._taitB * (ipow(r, 7) - 1);
        const viaPow = o._taitB * (Math.pow(r, 7) - 1);
        if (pressureOf(rho, o) !== viaPinned) { pinnedEverywhere = false; offAt = offAt ?? rho; }
        if (viaPinned !== viaPow) { anyDiff = true; const d = Math.abs(viaPinned - viaPow) / Math.max(1e-300, Math.abs(viaPow)); if (d > worst) worst = d; }
    }
    ok("!! *** pressureOf TAKES THE PINNED PATH AT THE SHIPPED gamma 7 ***", pinnedEverywhere,
       pinnedEverywhere ? "every sample equals B*(ipow(r,7)-1) EXACTLY -- asserted by RUNNING it, because no source scan can say which branch ran"
                        : "diverged first at rho " + offAt + " -- pressureOf is not on the pinned path");
    ok("!! ...and that is not the same number Math.pow gives, which is why it mattered", anyDiff,
       "worst relative difference " + worst.toExponential(3) + " on the pressure itself. IF THESE AGREED THIS " +
       "WHOLE SECTION WOULD BE SUPERSTITION -- the same argument section 2 makes for h^9.");

    // AND IT MUST BE RIGHT, NOT MERELY REPRODUCIBLE. A deterministic wrong answer is worse than a
    // nondeterministic correct one, because nothing would ever flag it.
    let acc = 0;
    for (const x of [0.5, 0.87, 1.0, 1.0031, 1.4, 1.97]) for (const n of [2, 3, 5, 7, 9]) {
        const rel = Math.abs(ipow(x, n) - Math.pow(x, n)) / Math.pow(x, n);
        if (rel > acc) acc = rel;
    }
    ok("!! ipow is CORRECT as well as pinned", acc < 1e-14,
       "worst relative departure from Math.pow across x in [0.5,2] and n in {2,3,5,7,9}: " + acc.toExponential(3) +
       " -- a few ulp of extra rounding, which is the price and it is stated");
    ok("...and it agrees exactly where the exponent is trivial", ipow(3.7, 0) === 1 && ipow(3.7, 1) === 3.7 && ipow(2, 10) === 1024);

    // x^3.5 IS PINNABLE AND IT IS EASY TO MISS.
    let w35 = 0;
    for (const d of [0.05, 0.2, 0.37, 0.5, 0.81, 0.999]) {
        const rel = Math.abs((d * d * d * Math.sqrt(d)) - Math.pow(d, 3.5)) / Math.pow(d, 3.5);
        if (rel > w35) w35 = rel;
    }
    ok("!! the shadow kernel's x^3.5 is x^3 * sqrt(x), and sqrt IS pinned", w35 < 1e-14,
       "worst relative difference from the pow spelling " + w35.toExponential(3) +
       " -- a HALF power costs nothing in portability, which is the part that looks impossible and is not");

    // THE HOLE, NAMED AND HELD IN PLACE. Section 4 above does this for fleshSph's cbrt; this is the same shape.
    const oNI = { ...o, gamma: 8.4 };
    oNI._taitB = taitB(oNI.restDensity, oNI.soundSpeed, oNI.gamma);
    const r2 = 150.25 / oNI.restDensity;
    ok("!! a NON-INTEGER gamma still goes through Math.pow, and that is the documented hole",
       pressureOf(150.25, oNI) === oNI._taitB * (Math.pow(r2, 8.4) - 1),
       "gamma 8.4 is what the knob census asks for at eps 0.2. A REAL EXPONENT HAS NO DECOMPOSITION INTO THE " +
       "FIVE OPERATIONS IEEE 754 PINS, so the hole is narrowed to a swept measurement -- never a shipped " +
       "configuration -- and NAMED rather than papered over. IPOW_MAX is " + IPOW_MAX + ".");
    ok("...and an integer gamma other than 7 is pinned too, so the fix is not a special case for one value",
       pressureOf(150.25, { ...o, gamma: 5, _taitB: taitB(o.restDensity, o.soundSpeed, 5) }) ===
       taitB(o.restDensity, o.soundSpeed, 5) * (ipow(150.25 / o.restDensity, 5) - 1));
}

console.log(fails ? "\nportableMath-selfcheck: " + fails + " FAILED" : "\nportableMath-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
