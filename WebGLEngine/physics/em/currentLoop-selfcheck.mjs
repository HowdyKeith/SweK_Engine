// WebGLEngine/physics/em/currentLoop-selfcheck.mjs -- v3626
//
// Run: node physics/em/currentLoop-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GRADES physics/em/currentLoop.mjs -- the exact off-axis field of a circular current loop, which is the
// consumer v3625 said had to be NAMED before math/elliptic.js earned a place in the lab. Five keys, and four
// of them come from outside the file:
//
//   1. ON AXIS the field is ELEMENTARY (mu0 I a^2 / 2(a^2+z^2)^(3/2)) and the centre is mu0 I / 2a. No elliptic
//      integral appears in either target.
//   2. BIOT-SAVART BY QUADRATURE -- the law itself, integrated round the loop. Shares no code with the elliptic
//      route: no K, no E, no Carlson.
//   3. div B = 0. AN IDENTITY OF NATURE WITH NO REFERENCE VALUE AT ALL, so nothing can be tuned to satisfy it.
//   4. AMPERE'S LAW: the circulation round a circuit threading the wire is mu0 I, set by the CURRENT ALONE.
//   5. THE FAR FIELD IS A DIPOLE, and the approach is reported as an ORDER rather than an error.
//
// *** AND SECTION 6 IS WHY THIS ROUND EXISTS. v3625's gate predicted that the m-versus-k convention error is
// invisible to every degenerate anchor, because m = k^2 has fixed points at 0 and 1. HERE IS THAT PREDICTION
// STANDING IN REAL PHYSICS: on the axis r = 0 gives m = 0 under EITHER convention, so the mutant reproduces
// the elementary on-axis law TO 0.0e+0, the centre value TO 0.0e+0, and the on-axis far-field dipole to the
// same digits as the true field. It is wrong ONLY OFF AXIS -- which is the entire reason anybody computes this
// -- and the one check that destroys it is div B, precisely because div B needs no reference value. A wrong
// field has nowhere to hide from an identity. ***

import { readFileSync } from "node:fs";
import { ellipK, ellipEc } from "../../math/elliptic.js";
import { MU0 as MU0_MAXWELL } from "./maxwell.mjs";
import {
    loopField, onAxisExact, centreExact, loopFieldBiotSavart,
    divergence, ampereCirculation, dipoleField, MU0,
} from "./currentLoop.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);
const rel = (got, want) => Math.abs(got - want) / Math.max(Math.abs(want), 1e-300);

// THE MUTANT, defined once and used in section 6. It differs from the shipped field in EXACTLY ONE TOKEN: it
// treats 4ar/A as the MODULUS k rather than the PARAMETER m, which is how half the literature writes it.
function conventionMutant({ a = 1, I = 1, r = 0, z = 0, mu0 = MU0 } = {}) {
    const A = (a + r) * (a + r) + z * z, B = (a - r) * (a - r) + z * z;
    if (!(B > 0)) return null;
    const q = 4 * a * r / A, m = q * q;                 // <-- the only difference from currentLoop.mjs
    const K = ellipK(m), E = ellipEc(m);
    if (K === null || E === null) return null;
    const pre = mu0 * I / (2 * Math.PI * Math.sqrt(A));
    return {
        Bz: pre * (K + E * (a * a - r * r - z * z) / B),
        Br: r === 0 ? 0 : pre * (z / r) * (-K + E * (a * a + r * r + z * z) / B),
        m,
    };
}

// --- 0. one constant, one owner --------------------------------------------------------------------------------
{
    say("0. mu0 IS IMPORTED FROM maxwell.mjs, NOT RE-DECLARED HERE.");
    ok("the loop field and the Maxwell module use the SAME object, not two equal literals", MU0 === MU0_MAXWELL);
    ok("...and currentLoop.mjs contains no numeric literal for it", (() => {
        const src = readFileSync(new URL("./currentLoop.mjs", import.meta.url), "utf8");
        return !/1\.256637/.test(src) && /import \{ MU0 \} from "\.\/maxwell\.mjs"/.test(src);
    })(), "TWO DECLARATIONS ABOUT ONE THING NOBODY EVER COMPARED is this tree's most repeated defect");
}

// --- 1. the elementary keys, which the elliptic form must reduce to ---------------------------------------------
{
    say("1. ON AXIS AND AT THE CENTRE THE ANSWER IS ELEMENTARY. Nothing elliptic appears in either target.");
    let worst = 0;
    for (const z of [0, 0.3, 1, 3, 10]) worst = Math.max(worst, rel(loopField({ r: 0, z }).Bz, onAxisExact({ z })));
    ok("Bz(0, z) reduces to mu0 I a^2 / 2(a^2+z^2)^(3/2)", worst < 1e-14,
        "worst rel " + worst.toExponential(3) + " over five heights -- exact to round-off, and the residue is the " +
        "elementary form's own Math.pow rather than anything elliptic (it is 0.0e+0 out to z = 3 and appears at z = 10)");
    ok("Bz at the centre is mu0 I / 2a", rel(loopField({ r: 0, z: 0 }).Bz, centreExact({})) === 0,
        "reads " + loopField({ r: 0, z: 0 }).Bz.toExponential(10) + " T for a 1 m loop at 1 A");
    ok("Br vanishes identically on the axis, by symmetry and not by luck", loopField({ r: 0, z: 0.7 }).Br === 0);
    say("   NOTE FOR THE NEXT READER: r = 0 forces m = 0, so NOT ONE LINE ABOVE CAN SEE A WRONG m/k CONVENTION.");
}

// --- 2. Biot-Savart, an independent route ------------------------------------------------------------------------
{
    say("2. THE LAW ITSELF, INTEGRATED ROUND THE LOOP. No K, no E, no Carlson anywhere in it.");
    let worst = 0, worstAt = "";
    for (const [r, z] of [[0.5, 0.3], [0.9, 0.1], [1.5, 0.5], [2, 2], [0.2, 0.02], [1.05, 0.02]]) {
        const f = loopField({ r, z }), b = loopFieldBiotSavart({ r, z });
        const e = Math.max(rel(f.Bz, b.Bz), rel(f.Br, b.Br));
        if (e > worst) { worst = e; worstAt = "r=" + r + " z=" + z + " (m=" + f.m.toFixed(6) + ")"; }
    }
    ok("the elliptic field and the quadrature agree off axis, including close to the wire", worst < 1e-13,
        "worst rel " + worst.toExponential(3) + " at " + worstAt);
    ok("...and the quadrature is genuinely independent: it never calls the elliptic module", (() => {
        const src = readFileSync(new URL("./currentLoop.mjs", import.meta.url), "utf8");
        const fn = src.slice(src.indexOf("export function loopFieldBiotSavart"), src.indexOf("KEY 4 -- div B"));
        return !/ellipK|ellipEc|loopField\(/.test(fn);
    })());
    say("   HONEST LIMIT: the quadrature loses accuracy as the field point approaches the wire, because |R|^-3");
    say("   sharpens. THAT IS A PROPERTY OF SIMPSON, NOT OF THE FIELD, and it is why the fixture stops at");
    say("   m = 0.9993 rather than being pushed until a tolerance has to be widened to keep it green.");
}

// --- 3. div B = 0, and the floor is the STENCIL ---------------------------------------------------------------------
{
    say("3. div B = 0 IN CYLINDRICAL COORDINATES. An identity with NO reference value -- nothing can be tuned to it.");
    let worst = 0;
    for (const [r, z] of [[0.5, 0.3], [1.5, 0.5], [0.3, 1.2], [2.5, 0.4]]) worst = Math.max(worst, divergence({ r, z }).relative);
    ok("the shipped field is divergence-free everywhere tested", worst < 1e-6, "worst normalised |div B| " + worst.toExponential(3));
    const errs = [4e-3, 2e-3, 1e-3, 5e-4].map((h) => divergence({ r: 0.5, z: 0.3, h }).relative);
    const orders = errs.slice(1).map((e, i) => Math.log2(errs[i] / e));
    say("     h sweep " + errs.map((e) => e.toExponential(3)).join("  ") + "   orders " + orders.map((o) => o.toFixed(3)).join(", "));
    ok("!! and the residue falls at ORDER 2 in h, so it is the CENTRAL DIFFERENCE and not the field",
        orders.every((o) => o > 1.9 && o < 2.1),
        "a bare number here would have said nothing -- 1e-8 is the stencil's own error at h = 1e-4, DERIVED not assumed");
}

// --- 4. Ampere's law -------------------------------------------------------------------------------------------------
{
    say("4. AMPERE. Circulate B round a circuit threading the wire; the answer is mu0 I and NOTHING about the field.");
    const vals = [0.02, 0.05, 0.1, 0.2].map((rho) => ampereCirculation({ rho }) / MU0);
    say("     circulation / mu0 I at rho = 0.02, 0.05, 0.1, 0.2: " + vals.map((v) => v.toFixed(9)).join("  "));
    ok("the magnitude is exactly the current, independent of the circuit radius over a 10x range",
        vals.every((v) => Math.abs(Math.abs(v) - 1) < 1e-7),
        "flat to " + Math.max(...vals.map((v) => Math.abs(Math.abs(v) - 1))).toExponential(2) + " across the sweep");
    ok("the SIGN is reported rather than removed", vals.every((v) => v < 0),
        "the circuit as parametrised runs opposite to the right-hand sense of the current; flipping a sign to " +
        "make a check read +1 would hide an orientation error rather than reveal one");
}

// --- 5. the far field is a dipole, at an order --------------------------------------------------------------------------
{
    say("5. FAR FIELD. A loop of radius a is a point dipole of moment I pi a^2, and the approach is an ORDER.");
    const errs = [5, 10, 20, 40].map((R) => {
        const r = R / Math.SQRT2, z = R / Math.SQRT2;
        return rel(loopField({ r, z }).Bz, dipoleField({ r, z }).Bz);
    });
    const orders = errs.slice(1).map((e, i) => Math.log2(errs[i] / e));
    say("     45 degrees off axis, R = 5, 10, 20, 40:  " + errs.map((e) => e.toExponential(3)).join("  "));
    ok("the departure from a dipole falls as (a/R)^2, DERIVED not typed", orders.every((o) => o > 1.9 && o < 2.1),
        "orders " + orders.map((o) => o.toFixed(3)).join(", ") + " -- the next multipole is the quadrupole term");
    say("   MEASURED OFF AXIS ON PURPOSE: on the axis the mutant in section 6 matches the dipole just as well,");
    say("   so an on-axis version of this check would have been a control that cannot fail.");
}

// --- 6. THE CONVENTION MUTANT, PASSING THREE KEYS AND FAILING THE IDENTITY ------------------------------------------
{
    say("6. THE MUTANT. One token different: it reads 4ar/A as the MODULUS k where the formula means the PARAMETER m.");
    let axisWorst = 0, trueWorst = 0;
    for (const z of [0, 0.3, 1, 3, 10]) {
        axisWorst = Math.max(axisWorst, rel(conventionMutant({ r: 0, z }).Bz, onAxisExact({ z })));
        trueWorst = Math.max(trueWorst, rel(loopField({ r: 0, z }).Bz, onAxisExact({ z })));
    }
    // THE CLAIM IS A COMPARISON, NOT A TYPED TOLERANCE: the mutant is not merely close on the axis, it is
    // INDISTINGUISHABLE from the correct field there, so no on-axis threshold could ever separate them.
    ok("!! it reproduces the ELEMENTARY ON-AXIS LAW as well as the TRUE field does", axisWorst === trueWorst,
        "mutant " + axisWorst.toExponential(3) + " against the true field's " + trueWorst.toExponential(3) +
        " -- byte-identical, because r = 0 forces m = 0 under BOTH conventions");
    ok("!! and the centre value exactly", rel(conventionMutant({ r: 0, z: 0 }).Bz, centreExact({})) === 0);
    ok("!! and the ON-AXIS far-field dipole just as well as the true field does", (() => {
        const t = rel(loopField({ r: 0, z: 40 }).Bz, dipoleField({ r: 0, z: 40 }).Bz);
        const w = rel(conventionMutant({ r: 0, z: 40 }).Bz, dipoleField({ r: 0, z: 40 }).Bz);
        say("     true " + t.toExponential(3) + "   mutant " + w.toExponential(3) + " -- INDISTINGUISHABLE");
        return Math.abs(Math.log10(w / t)) < 0.5;
    })(), "THREE KEYS PASSED. A gate built only from the elementary anchors would have shipped this.");

    let offWorst = 0;
    for (const [r, z] of [[0.5, 0.3], [1.5, 0.5], [0.3, 1.2]]) {
        const f = conventionMutant({ r, z }), b = loopFieldBiotSavart({ r, z });
        const e = Math.max(rel(f.Bz, b.Bz), rel(f.Br, b.Br));
        offWorst = Math.max(offWorst, e);
        say("     r=" + r + " z=" + z + "   Bz off by " + (100 * rel(f.Bz, b.Bz)).toFixed(2) + "%,  Br off by " + (100 * rel(f.Br, b.Br)).toFixed(2) + "%");
    }
    ok("...and OFF AXIS it is wrong by tens to hundreds of percent", offWorst > 1,
        "worst " + (100 * offWorst).toFixed(1) + "% -- against Biot-Savart, which is the route that shares no code with it");
    const mutDiv = [[0.5, 0.3], [1.5, 0.5], [0.3, 1.2]].map(([r, z]) => divergence({ r, z, field: conventionMutant }).relative);
    ok("!! and div B DESTROYS IT, which is the check that needs no reference value at all",
        mutDiv.every((d) => d > 1e-3) && Math.min(...mutDiv) > 1e5 * 1e-8,
        "mutant " + mutDiv.map((d) => d.toExponential(2)).join(", ") + " against the true field's ~1e-8 stencil floor");
    say("   THIS IS v3625'S PREDICTION LANDING IN REAL PHYSICS AND IT IS WORTH KEEPING: THE ANCHORS EVERYBODY");
    say("   REACHES FOR FIRST ARE EXACTLY THE ONES BLIND TO THIS ERROR, AND THE IDENTITY NOBODY THINKS TO CHECK");
    say("   IS THE ONE THAT CATCHES IT. If a k-taking variant is ever added deliberately, this section goes red");
    say("   and should be REWRITTEN TO GRADE BOTH CONVENTIONS -- not weakened, and not deleted.");
}

// --- 7. refusals and browser safety -----------------------------------------------------------------------------------
{
    say("7. REFUSALS.");
    ok("a field point ON THE WIRE is refused, where the true field diverges", loopField({ r: 1, z: 0 }) === null);
    ok("a negative cylindrical radius is refused rather than silently absolute-valued", loopField({ r: -1, z: 0.2 }) === null,
        "a caller passing a signed x wants |r| AND a sign flip on Br; doing that quietly would hide their confusion");
    const src = readFileSync(new URL("./currentLoop.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/node:/.test(src) && !/\bdocument\s*[.[]/.test(src) && !/\bwindow\s*[.[]/.test(src));
    ok("the m/k trap is documented in the module, not only in this gate", /THE PARAMETER IS m AND NOT THE MODULUS k/.test(src));
}

console.log("currentLoop-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
