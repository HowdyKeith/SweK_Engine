// tools/roundhouse/kerrLadderBind.mjs
//
// v3730 -- roundhouse device: KERR CIRCULAR ORBITS (physics/blackhole/kerrLadder.mjs).
//
// *** THE MIRROR THIS ROUND HAD TO AVOID IS UNUSUALLY OBVIOUS: THE MODULE WAS HANDED ITS FORMULAS. ***
// kerrLadder implements Bardeen, Press and Teukolsky (1972) for the equatorial circular E and L, and its
// header PRINTS THEM. Grading E(r) or L(r) against BPT is grading a transcription -- worth something, and it
// is already done: the shipped gate checks the a = 0 reduction against probe.js's circularL and finds it
// BIT-IDENTICAL. THAT IS NOT A GRADE, THAT IS A DIFF.
//
// SO ASK WHAT EMERGES FROM THE EXPRESSIONS THAT NOBODY TYPED INTO THEM. Two radii do, and neither appears
// anywhere in kerrLadder.mjs:
//
//   1. THE PHOTON ORBIT is where L and E DIVERGE -- the radius at which r^2 - 3Mr +- 2a sqrt(Mr) reaches zero.
//      The file knows the discriminant only as a guard ("inside the photon orbit: no circular orbit at all")
//      and never computes where it vanishes. The closed form is r = 2M(1 + cos((2/3) acos(-+a/M))), a
//      TRIGONOMETRIC expression sharing no operation with the algebraic one it must agree with.
//   2. THE ISCO is where E(r) BOTTOMS OUT. The file contains no minimisation, no derivative and no ISCO
//      formula -- it IMPORTS isco() from kerr.js to refuse stations, so it uses the number without ever
//      deriving it. Minimising the SHIPPED E and asking where the minimum sits is a question the module was
//      never told the answer to.
//
// AND THE ANCHORS ARE EXACT AND EXTERNAL -- THEY APPEAR IN NEITHER FILE, so the strongest checks here do not
// depend on kerr.js being right about anything:
//     a = 0:            r_isco = 6M exactly, E_isco = sqrt(8/9), binding 5.7191%
//     a -> M prograde:  E -> 1/sqrt(3), binding 42.2650%          (a LIMIT -- see the third mode)
//     a -> M retro:     r -> 9M, E -> 5/(3 sqrt 3)
//     photon orbit:     3M at a = 0; -> M prograde and 4M retrograde as a -> M
//
// MEASURED (M = 1):
//   PHOTON: the shipped L's NaN edge against the closed form, bisected 200 times --
//     a = 0 / 0.5 / 0.9 / 0.998 / 0.99999, BOTH senses: worst error 1.24e-14, five of ten EXACTLY ZERO.
//   ISCO: argmin of the shipped E against kerr.js's closed form -- worst 1.93e-7 over the same spins, and
//     THAT NUMBER IS THE METHOD'S FLOOR AND NOT THE PHYSICS: sqrt(machine epsilon) is 1.49e-8, and locating
//     the ARGUMENT of a smooth minimum cannot beat it (v3724's rule -- two numbers are only comparable if the
//     thing limiting them is the same). THE VALUE AT THE MINIMUM IS QUADRATIC THERE AND SO IS NOT LIMITED THE
//     SAME WAY: E_isco at a = 0 matches sqrt(8/9) to 1.11e-16, ONE ULP. The radius gets a 1e-6 bar, the
//     energy gets 1e-12, and the difference between those two bars is the point.
//
// *** THE FINDING THAT COST THE ROUND ITS FIRST TWO MEASUREMENTS, AND IT IS v3708's LESSON IN A NEW PLACE:
// "WHERE L STOPS BEING FINITE" IS A BAND, NOT A HALF-LINE. *** At a = 0.998 the discriminant is NEGATIVE
// between r = 1.0 and the photon orbit at 1.0739 -- and POSITIVE AGAIN below about r = 0.55, INSIDE the
// horizon at 1.0632, where it returns a perfectly finite L = -0.582. A bisection started from an arbitrary
// small radius therefore converges on the WRONG EDGE and reports the photon orbit at 0.5. Worse, the ISCO
// search bracketed as isco*0.5 lands in that same band near extremal and returns E = -99953.8 -- A NUMBER
// THAT LOOKS EXACTLY LIKE A BROKEN SOLVER AND IS ENTIRELY THE BRACKET'S FAULT.
// BOTH BRACKETS ARE DERIVED FROM THE GEOMETRY NOW AND NEITHER IS SCALED FROM THE ANSWER: the photon search
// starts at the OUTER HORIZON, and the ISCO search starts at THE PHOTON ORBIT THE SHIPPED L ITSELF REPORTS,
// because below the photon orbit there are no circular orbits at all. A SEARCH WHOSE BOUNDS COME FROM THE
// ANSWER IT EXPECTS CAN ONLY FIND ANSWERS NEAR THE ONE ASSUMED.
//
// *** THE EXTREMAL LIMIT IS ASSERTED AS A LIMIT AND NOT AS AN EQUALITY, WHICH IS THE HONEST FORM. *** a = 1
// is singular and unreachable; binding energy at a = 0.99999 reads 0.403324 against the famous 0.422650, and
// quoting that as agreement would be wrong by 4.6%. What IS assertable is the APPROACH: binding rises
// 0.057191 -> 0.155753 -> 0.264030 -> 0.339794 -> 0.403324 across a = 0 / 0.9 / 0.99 / 0.999 / 0.99999,
// MONOTONE, never crossing the limit, and closing the remaining gap each step. A LIMIT CHECKED BY EVALUATING
// AT THE LIMIT IS A CHECK THAT CANNOT RUN.
//
// NOT PLANTED: the curriculum asked for a GRADE. NOT CLAIMED: that kerrLadder is correct -- ladderCost,
// senseAsymmetry and stationAvailable are UNGRADED here, and the transfer-orbit cost the header explicitly
// scopes out remains out. gradedCoverage moving by one module means THIS MODULE NOW HAS A KEY.

import { kerrCircularE, kerrCircularL } from "../../physics/blackhole/kerrLadder.mjs";
import { isco, photonOrbits, outerHorizon } from "../../physics/blackhole/kerr.js";

import { pathToFileURL } from "node:url";
export const KERRLADDER_OBSERVABLES = [
    "photonMeasured", "photonClosedForm", "photonErr", "photonWorstErr", "photonRows",
    "iscoMeasured", "iscoReference", "iscoRadiusErr", "iscoWorstRadiusErr",
    "energyAtIsco", "energyAnchor", "energyErr", "bindingFraction",
    "bindings", "spins", "monotone", "approaches", "limitGap", "limitValue",
    "spin", "prograde", "sqrtEps", "kind",
];

const DEF = { M: 1, spin: 0, prograde: true, bisect: 200, golden: 400 };

export function kerrLadderDefaults(hyp) {
    const h = { mode: "photon", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    c.M = Math.min(10, Math.max(0.1, num(c.M, DEF.M)));
    c.spin = Math.min(0.99999 * c.M, Math.max(0, num(c.spin, DEF.spin)));   // a = M is SINGULAR, never reached
    c.prograde = c.prograde !== false;
    c.bisect = Math.min(400, Math.max(20, num(c.bisect, DEF.bisect) | 0));
    c.golden = Math.min(800, Math.max(40, num(c.golden, DEF.golden) | 0));
    h.config = c;
    if (!["photon", "isco", "extremal", "spinsense"].includes(h.mode)) h.mode = "photon";
    if (!h.claim || !h.claim.observable) {
        h.claim = h.mode === "photon" ? { observable: "photonWorstErr", max: 1e-12 }
            : h.mode === "isco" ? { observable: "iscoWorstRadiusErr", max: 1e-6 }
                : { observable: "limitGap", max: 0.05 };
    }
    return h;
}

/**
 * The radius at which the SHIPPED angular momentum stops being finite -- the photon orbit, which the module
 * never computes. EXPORTED so a gate drives the same search rather than a second spelling of it.
 * *** THE BRACKET STARTS AT THE OUTER HORIZON ON PURPOSE: the discriminant is positive again deeper in, so a
 * search from an arbitrary floor converges on a spurious inner edge. See the header. ***
 */
export function photonEdge(M, a, prograde, iters = 200) {
    let lo = outerHorizon(M, a), hi = (prograde ? 12 : 20) * M;
    if (!Number.isFinite(kerrCircularL(M, a, hi, prograde))) return NaN;
    for (let i = 0; i < iters; i++) {
        const m = (lo + hi) / 2;
        if (Number.isFinite(kerrCircularL(M, a, m, prograde))) hi = m; else lo = m;
    }
    return (lo + hi) / 2;
}

/**
 * Where the SHIPPED energy bottoms out. Golden section, floored at the photon orbit THE SHIPPED L REPORTS --
 * a bracket derived from the geometry rather than scaled from the expected answer.
 */
export function energyMinimum(M, a, prograde, iters = 400) {
    const floor = photonEdge(M, a, prograde);
    if (!Number.isFinite(floor)) return { r: NaN, E: NaN };
    let lo = floor * (1 + 1e-9), hi = (prograde ? 30 : 40) * M;
    const f = (r) => { const e = kerrCircularE(M, a, r, prograde); return Number.isFinite(e) ? e : Infinity; };
    const phi = (Math.sqrt(5) - 1) / 2;
    let c = hi - phi * (hi - lo), d = lo + phi * (hi - lo);
    for (let i = 0; i < iters; i++) {
        if (f(c) < f(d)) { hi = d; d = c; c = hi - phi * (hi - lo); }
        else { lo = c; c = d; d = lo + phi * (hi - lo); }
    }
    const r = (lo + hi) / 2;
    return { r, E: f(r) };
}

const SWEEP = [0, 0.5, 0.9, 0.998, 0.99999];
const BINDING_SPINS = [0, 0.9, 0.99, 0.999, 0.99999];

export async function buildKerrLadder(hyp, base = {}) {
    const h = kerrLadderDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    const c = h.config, M = c.M;

    if (h.mode === "photon") {
        const rows = [];
        for (const s of SWEEP) for (const pro of [true, false]) {
            const a = s * M;
            const measured = photonEdge(M, a, pro, c.bisect);
            const p = photonOrbits(M, a);
            const ref = pro ? p.prograde : p.retrograde;
            rows.push({ a, pro, measured, ref, err: Math.abs(measured - ref) });
        }
        if (rows.some((r) => !Number.isFinite(r.err))) return { error: "photon-edge-not-bracketed" };
        const one = rows.find((r) => r.a === c.spin * M && r.pro === c.prograde) || rows[0];
        return {
            kind: "photon",
            photonMeasured: one.measured, photonClosedForm: one.ref, photonErr: one.err,
            photonWorstErr: Math.max(...rows.map((r) => r.err)),
            photonRows: rows.length, spins: SWEEP.slice(), spin: c.spin, prograde: c.prograde,
        };
    }

    if (h.mode === "isco" || h.mode === "spinsense") {   // v3763 -- the plant runs the isco branch
        const rows = [];
        for (const s of SWEEP) for (const pro of [true, false]) {
            const a = s * M;
            // *** v3763 -- THE PLANT: `spinsense` HANDS energyMinimum THE OPPOSITE ORBIT SENSE WHILE THE CLOSED
            // FORM KEEPS THE ONE THAT WAS ASKED FOR. THIS IS THE MISTAKE THE API INVITES: energyMinimum(M, a,
            // pro, ...) and isco(M, a, pro) take the flag IN THE SAME POSITION and NOTHING ENFORCES THAT THE
            // TWO CALLS AGREE -- the prograde/retrograde sign is the classic Kerr slip, and it is a single
            // character in the standard formula r = 3 + Z2 -+ sqrt((3-Z1)(3+Z1+2Z2)).
            // IT IS A ONE-SIDED PLANT ON PURPOSE: the measurement moves and the reference does not, so the two
            // routes stop agreeing. A plant that flipped BOTH would cancel and prove nothing (v3733). ***
            const searchPro = h.mode === "spinsense" ? !pro : pro;
            const m = energyMinimum(M, a, searchPro, c.golden);
            rows.push({ a, pro, r: m.r, E: m.E, ref: isco(M, a, pro), err: Math.abs(m.r - isco(M, a, pro)) });
        }
        if (rows.some((r) => !Number.isFinite(r.err))) return { error: "energy-minimum-not-bracketed" };
        const flat = energyMinimum(M, 0, true, c.golden);              // a = 0: the anchor with no reference in it
        const anchor = Math.sqrt(8 / 9);
        const one = rows.find((r) => r.a === c.spin * M && r.pro === c.prograde) || rows[0];
        return {
            kind: "isco",
            iscoMeasured: one.r, iscoReference: one.ref, iscoRadiusErr: one.err,
            iscoWorstRadiusErr: Math.max(...rows.map((r) => r.err)),
            energyAtIsco: flat.E, energyAnchor: anchor, energyErr: Math.abs(flat.E - anchor),
            bindingFraction: 1 - flat.E,
            sqrtEps: Math.sqrt(Number.EPSILON),
            photonRows: rows.length, spins: SWEEP.slice(), spin: c.spin, prograde: c.prograde,
        };
    }

    // *** THE LIMIT, CHECKED BY APPROACHING IT -- a = M is singular and evaluating there is not a check. ***
    const bindings = BINDING_SPINS.map((s) => 1 - energyMinimum(M, s * M, true, c.golden).E);
    if (bindings.some((b) => !Number.isFinite(b))) return { error: "binding-not-finite" };
    const limit = 1 - 1 / Math.sqrt(3);
    let monotone = true, approaches = true;
    for (let i = 1; i < bindings.length; i++) {
        if (!(bindings[i] > bindings[i - 1])) monotone = false;
        if (!(limit - bindings[i] < limit - bindings[i - 1])) approaches = false;
    }
    return {
        kind: "extremal",
        bindings, spins: BINDING_SPINS.slice(), monotone, approaches,
        limitValue: limit, limitGap: limit - bindings[bindings.length - 1],
        bindingFraction: bindings[bindings.length - 1],
    };
}

export const kerrLadderDevice = {
    // v3763 -- "isco" stays FIRST so plantedCoverage compares the plant against the mode that owns
    // iscoRadiusErr; the plant is a variant of isco, so isco is its correct baseline.
    modes: ["isco", "photon", "extremal", "spinsense"],
    // *** v3763 -- plantFlips IS iscoWorstRadiusErr AND NOT iscoRadiusErr, AND THE CENSUS IS WHY. plantedCoverage
    // builds the plant WITH THE DEVICE DEFAULTS, and this device defaults to spin: 0 -- WHERE A NON-ROTATING
    // BLACK HOLE HAS NO PROGRADE AND NO RETROGRADE, SO THE PLANT PROVABLY CANNOT MOVE ANYTHING. Declared against
    // the single-point error it registered a 1.5x wobble in round-off (8.20e-8 -> 1.25e-7) and would have read
    // as a plant that barely fires. iscoWorstRadiusErr SWEEPS EVERY SPIN, so it witnesses the defect at EVERY
    // config: 2.0e-7 -> 7.97. THIS IS NOT PICKING A CONVENIENT OBSERVABLE -- it is picking the one that was
    // built to catch a defect that hides at a single point. ***
    plantMode: "spinsense", plantFlips: "iscoWorstRadiusErr", plantKind: "mode",
    name: "kerrladder-emergent-radii",
    observables: KERRLADDER_OBSERVABLES,
    build: buildKerrLadder,
    defaults: kerrLadderDefaults,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const p = await buildKerrLadder({ mode: "photon" });
    const i = await buildKerrLadder({ mode: "isco" });
    const e = await buildKerrLadder({ mode: "extremal" });
    console.log("[kerrladder] TWO RADII THE MODULE WAS NEVER TOLD, AND ONE LIMIT IT CANNOT BE ASKED AT\n");
    console.log("  PHOTON ORBIT -- where the shipped L diverges, against 2M(1 + cos((2/3) acos(-+a/M)))");
    console.log("    worst error over", p.photonRows, "spin/sense rows:", p.photonWorstErr.toExponential(3),
        "  (at a=0:", p.photonMeasured.toFixed(12), "vs", p.photonClosedForm.toFixed(12) + ")");
    console.log("\n  ISCO -- where the shipped E bottoms out");
    console.log("    worst RADIUS error:", i.iscoWorstRadiusErr.toExponential(3),
        " against sqrt(machine eps)", i.sqrtEps.toExponential(3), "-- THE METHOD'S FLOOR, NOT THE PHYSICS");
    console.log("    ENERGY at a=0:", i.energyAtIsco.toFixed(15), "vs sqrt(8/9)", i.energyAnchor.toFixed(15),
        "-- err", i.energyErr.toExponential(3), "(ONE ULP: the value at a minimum is quadratic there)");
    console.log("    binding energy", (i.bindingFraction * 100).toFixed(4) + "% -- the textbook 5.72%");
    console.log("\n  THE EXTREMAL LIMIT, APPROACHED RATHER THAN EVALUATED (a = M is singular)");
    console.log("    binding at a =", e.spins.join(", "), "->", e.bindings.map((b) => b.toFixed(6)).join(" -> "));
    console.log("    monotone", e.monotone, " closing", e.approaches, " remaining gap to 1-1/sqrt(3) =",
        e.limitGap.toFixed(6), "-- QUOTING 0.422650 AS AGREEMENT WOULD BE WRONG BY 4.6%");
}
