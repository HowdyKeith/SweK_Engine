// tools/roundhouse/laneEmdenBind-selfcheck.mjs
//
// Run: node tools/roundhouse/laneEmdenBind-selfcheck.mjs
// RUNTIME 10.85s MEASURED (median of 3 -- 9504/10851/11430 -- with date(1) around the run). Most of it is the
// knob-liveness sweep in section 3: four knobs times three modes, each rebuilding a full ODE solve, plus the
// n=5 comparisons in section 5.
//
// THIS GRADES THE BIND, NOT THE PHYSICS. physics/stellar/laneEmden-selfcheck.mjs owns the physics -- three exact
// closed forms, the n=5 infinite-radius trap, two mass routes, the Chandrasekhar invariance. What can go wrong
// HERE is different: a knob the device advertises and then ignores, or a plant credited with a mode it cannot
// move.
//
// *** THE PLANT IS CORRECT PHYSICS FOR THE WRONG GEOMETRY, WHICH IS WHAT MAKES IT WORTH HAVING. *** Cylindrical
// rather than spherical is not a corrupted equation -- it is the Lane-Emden equation in d=2, and its solutions
// are real: n=0 gives xi1=2 exactly, n=1 gives the first zero of the Bessel function J0. It produces stars at
// every index anybody normally looks at. Section 5 pins what it costs: the n=5 polytrope, which has INFINITE
// RADIUS in spherical geometry, gains a finite surface. A plant that produced obvious garbage would be caught
// by anything; this one has to be caught by the specific keys.
"use strict";
import { laneEmdenDevice, LANE_EMDEN_OBSERVABLES } from "./laneEmdenBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { EXACT_XI1, solve } from "../../physics/stellar/laneEmden.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

console.log("laneEmdenBind-selfcheck -- is the device wired, live, and does its plant bite where it should?\n");

// ---------------------------------------------------------------------------
console.log("1. *** REGISTERED AND REACHABLE THROUGH THE REGISTRY ***");
{
    ok("laneemden appears in DEVICE_NAMES", DEVICE_NAMES.includes("laneemden"), DEVICE_NAMES.length + " devices");
    const d = await getDevice("laneemden");
    ok("!! and the registry hands back THIS device", d && d.name === "lane-emden-polytrope", d ? d.name : "nothing");
    ok("it declares three modes", d.modes.join(",") === "profile,mass,scaling", d.modes.join(","));
    ok("it declares a plant kind", d.plantKind === "knob");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** EVERY MODE RETURNS THE FULL OBSERVABLE SET ***");
{
    for (const mode of laneEmdenDevice.modes) {
        const out = laneEmdenDevice.build({ mode, config: {} });
        const missing = LANE_EMDEN_OBSERVABLES.filter((o) => !(o in out));
        ok(`${mode}: every advertised observable is present as a key`, missing.length === 0,
            missing.length ? "MISSING: " + missing.join(", ") : LANE_EMDEN_OBSERVABLES.length + " keys");
        const extra = Object.keys(out).filter((k) => !LANE_EMDEN_OBSERVABLES.includes(k));
        ok(`${mode}: and it returns nothing it did not advertise`, extra.length === 0, extra.join(", "));
    }
}

// ---------------------------------------------------------------------------
console.log("\n3. *** EVERY ADVERTISED KNOB MOVES SOMETHING -- THE DEFECT THIS BIND ALREADY PAID FOR ***");
{
    const DEF = laneEmdenDevice.defaults({});
    const knobs = Object.keys(DEF.config);
    ok("the device advertises knobs at all", knobs.length > 0, knobs.join(", "));
    const dead = [];
    for (const k of knobs) {
        const alive = [];
        for (const mode of laneEmdenDevice.modes) {
            const base = laneEmdenDevice.build({ mode, config: {} });
            const v = DEF.config[k];
            const alt = k === "n" ? 1.5 : (k === "invarianceIndex" ? 2.5 : v * 1.4);
            const out = laneEmdenDevice.build({ mode, config: { [k]: alt } });
            const moved = LANE_EMDEN_OBSERVABLES.some((o) =>
                finite(base[o]) && finite(out[o]) && Math.abs(base[o] - out[o]) > 1e-9 * Math.max(1, Math.abs(base[o])));
            if (moved) alive.push(mode);
        }
        if (!alive.length) dead.push(k); else report(`${k} moves observables in: ${alive.join(", ")}`);
    }
    ok("!! no advertised knob is inert in EVERY mode", dead.length === 0,
        dead.length ? "DEAD: " + dead.join(", ") : knobs.length + " knobs, all live somewhere");
    report("*** THIS SECTION ALREADY FIRED ONCE: dxi, rhoLo and rhoHi were all dead when the bind was first " +
           "written. dxi genuinely cannot move anything (RK4 is fourth order, so 2e-5 vs 1e-4 shifts xi1 by " +
           "6e-11) and is no longer advertised. rhoLo/rhoHi were dead for a PHYSICS reason worth keeping: at " +
           "the invariance index the mass is fixed by construction, and the scaling exponent is a power law and " +
           "so scale-invariant -- neither can respond. The RADIUS can, and reporting it made them live");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE PLANT MOVES A FINITE OBSERVABLE IN EVERY DECLARED MODE ***");
{
    for (const mode of laneEmdenDevice.modes) {
        const nom = laneEmdenDevice.build({ mode, config: {} });
        const pl = laneEmdenDevice.build({ mode, config: { planted: true } });
        const moved = LANE_EMDEN_OBSERVABLES.filter((o) =>
            finite(nom[o]) && finite(pl[o]) && Math.abs(nom[o] - pl[o]) > 1e-12 * Math.max(1, Math.abs(nom[o])));
        ok(`${mode}: the plant moves at least one finite observable`, moved.length > 0, moved.join(", ") || "NOTHING MOVED");
        ok(`${mode}: and it is flagged as planted`, pl.planted === true && nom.planted === false);
        ok(`${mode}: xi1 moves -- the observable every mode carries for exactly this reason`,
            moved.includes("xi1"), `${nom.xi1.toFixed(6)} -> ${pl.xi1.toFixed(6)}`);
    }
}

// ---------------------------------------------------------------------------
console.log("\n5. *** WHAT THE PLANT COSTS, CHECKED AS PHYSICS RATHER THAN AS MOVEMENT ***");
{
    // Movement alone does not show the plant is the RIGHT one. These are the specific claims its header makes.
    const nomP = laneEmdenDevice.build({ mode: "profile", config: {} });
    const plP = laneEmdenDevice.build({ mode: "profile", config: { planted: true } });
    ok("!! nominal n=1 lands on the exact closed form xi1 = pi", nomP.surfaceVsExact < 1e-9,
        "rel error " + nomP.surfaceVsExact.toExponential(2));
    ok("!! ...and the planted geometry misses it by a visible margin", plP.surfaceVsExact > 0.1,
        `planted xi1 = ${plP.xi1.toFixed(6)} against pi = ${Math.PI.toFixed(6)}`);

    // *** THE PLANTED PHYSICS IS INTERNALLY CORRECT -- BESSEL, NOT GARBAGE ***
    // computed here by series + Newton, sharing no line with the solver
    const J0 = (x) => { let s = 0, t = 1; for (let k = 0; k < 60; k++) { if (k > 0) t *= -(x * x / 4) / (k * k); s += t; } return s; };
    const J1 = (x) => { let s = 0, t = x / 2; for (let k = 0; k < 60; k++) { if (k > 0) t *= -(x * x / 4) / (k * (k + 1)); s += t; } return s; };
    let z = 2.4; for (let i = 0; i < 80; i++) z = z + J0(z) / J1(z);
    ok("!! *** THE PLANT IS REAL PHYSICS: its n=1 surface IS the first zero of the Bessel function J0 ***",
        rel(plP.xi1, z) < 1e-9, `planted ${plP.xi1.toFixed(10)} vs J0's first zero ${z.toFixed(10)}`);
    report("a plant producing obvious nonsense would be caught by anything. This one produces a perfectly good " +
           "star -- which is why it has to be caught by the specific keys rather than by inspection");

    // THE SHARPEST DETECTOR: the two mass routes stop agreeing, because both are spherical identities
    const nomM = laneEmdenDevice.build({ mode: "mass", config: {} });
    const plM = laneEmdenDevice.build({ mode: "mass", config: { planted: true } });
    ok("!! the two mass routes agree to ~1e-11 nominally", nomM.massRouteSpread < 1e-8,
        nomM.massRouteSpread.toExponential(2));
    ok("!! ...and DISAGREE by tens of percent under the planted geometry",
        plM.massRouteSpread > 0.1, plM.massRouteSpread.toFixed(4));
    report("both mass routes are spherical identities, so a cylindrical profile makes them inconsistent with " +
           "each other -- a two-route check doing exactly the job it exists for");

    // *** AND THE FAMOUS RESULT THE PLANT DESTROYS ***
    const sph5 = solve(5, { maxXi: 200 }).xi1;
    const cyl5 = solve(5, { maxXi: 200, dim: 2 }).xi1;
    ok("!! *** n=5 HAS NO SURFACE SPHERICALLY BUT GAINS ONE UNDER THE PLANT ***",
        sph5 === null && cyl5 !== null, `spherical: none   cylindrical: ${cyl5 && cyl5.toFixed(6)}`);
    ok("...which the device reports as hasSurface flipping at n=5",
        laneEmdenDevice.build({ mode: "profile", config: { n: 5 } }).hasSurface === false &&
        laneEmdenDevice.build({ mode: "profile", config: { n: 5, planted: true } }).hasSurface === true,
        "nominal false -> planted true");
    report("that is the point of the plant: plausible stars everywhere anybody looks, and the one famous " +
           "limiting result quietly destroyed");
}

// ---------------------------------------------------------------------------
console.log("\n6. *** SABOTAGE: THE LIVENESS AND PLANT CHECKS MUST BE ABLE TO FAIL ***");
{
    // A stand-in device that IGNORES its config: the liveness probe must call it dead. Written as two calls
    // with DIFFERENT configs, because comparing one call's output to itself would be true of any device at all
    // and would prove nothing about the probe.
    const deaf = { build: () => ({ x: 1 }) };
    const dBase = deaf.build({ config: {} }), dAlt = deaf.build({ config: { anything: 99 } });
    ok("!! a device that ignores its config reads as DEAD, not live",
        !["x"].some((o) => finite(dBase[o]) && finite(dAlt[o]) && Math.abs(dBase[o] - dAlt[o]) > 1e-9),
        "two different configs, identical output");
    // ...and the same probe must report a device that DOES respond as live, or it is just always saying "dead"
    const live = { build: (o) => ({ x: (o.config && o.config.anything) || 1 }) };
    const lBase = live.build({ config: {} }), lAlt = live.build({ config: { anything: 99 } });
    ok("!! ...while a device that DOES respond reads as live -- the probe is not simply always negative",
        ["x"].some((o) => finite(lBase[o]) && finite(lAlt[o]) && Math.abs(lBase[o] - lAlt[o]) > 1e-9),
        "1 -> 99");
    const inert = { build: (o) => ({ x: 1, planted: !!(o.config && o.config.planted) }) };
    const n2 = inert.build({ config: {} }), p2 = inert.build({ config: { planted: true } });
    ok("!! a plant that changes no number reads as NOT MOVING, not as covered",
        !["x"].some((o) => finite(n2[o]) && finite(p2[o]) && Math.abs(n2[o] - p2[o]) > 1e-12));
    ok("!! a NaN is not a movement", !(finite(1) && finite(NaN)));
    report("that last one is why every mode carries xi1: it stays finite and still moves in all three");
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
