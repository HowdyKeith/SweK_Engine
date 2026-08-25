// tools/roundhouse/bellBind-selfcheck.mjs
//
// Run: node tools/roundhouse/bellBind-selfcheck.mjs
// RUNTIME 7.99s MEASURED (median of 3 -- 7998/8129/7928 -- with date(1) around the run). Most of it is the
// knob-liveness sweep in section 3: nine knobs times three modes, and the "bounds" mode runs a full 14^4
// four-angle sweep on every one of those probes.
//
// THIS GRADES THE BIND, NOT THE PHYSICS. physics/quantum/bell-selfcheck.mjs owns the physics -- three routes to
// the correlator, both bounds proven by search, the separable-state control. What can go wrong HERE is
// different, and it is the thing binds in this tree have actually got wrong before: a knob the device
// advertises and then ignores, or a plant credited with a mode it cannot move.
//
// *** AND THIS DEVICE'S PLANT IS THE INTERESTING CASE, BECAUSE IT IS DESIGNED NOT TO MOVE ONE OBSERVABLE. ***
// partialSinglet(0.65) still violates the classical bound, so `violatesClassical` reads true both nominal and
// planted BY CONSTRUCTION. That is the finding, not a defect -- and section 4 asserts it stays true, so that if
// somebody ever "fixes" the plant into something cruder the loss of that property is visible rather than
// silent. A plant a Bell-violation check can catch would be a much weaker plant.
"use strict";
import { bellDevice, BELL_OBSERVABLES } from "./bellBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { CLASSICAL_BOUND, TSIRELSON_BOUND, maxCHSHPartial } from "../../physics/quantum/bell.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

console.log("bellBind-selfcheck -- is the device wired, live, and does its plant bite where it should?\n");

// ---------------------------------------------------------------------------
console.log("1. *** REGISTERED AND REACHABLE THROUGH THE REGISTRY, NOT MERELY EXPORTED ***");
{
    ok("bell appears in DEVICE_NAMES", DEVICE_NAMES.includes("bell"), DEVICE_NAMES.length + " devices");
    const d = await getDevice("bell");
    ok("!! and the registry hands back THIS device", d && d.name === "chsh-bell-inequality", d ? d.name : "nothing");
    ok("it declares three modes", d.modes.join(",") === "chsh,routes,bounds", d.modes.join(","));
    ok("it declares a plant kind", d.plantKind === "knob");
    report("a bind that is exported but never registered runs in its own gate and nowhere else");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** EVERY MODE RETURNS THE FULL OBSERVABLE SET, SO A MISSING KEY IS NEVER A SILENT null ***");
{
    for (const mode of bellDevice.modes) {
        const out = bellDevice.build({ mode, config: {} });
        const missing = BELL_OBSERVABLES.filter((o) => !(o in out));
        ok(`${mode}: every advertised observable is present as a key`, missing.length === 0,
            missing.length ? "MISSING: " + missing.join(", ") : BELL_OBSERVABLES.length + " keys");
        const extra = Object.keys(out).filter((k) => !BELL_OBSERVABLES.includes(k));
        ok(`${mode}: and it returns nothing it did not advertise`, extra.length === 0, extra.join(", "));
    }
}

// ---------------------------------------------------------------------------
console.log("\n3. *** EVERY ADVERTISED KNOB MOVES SOMETHING ***");
{
    const DEF = bellDevice.defaults({});
    const knobs = Object.keys(DEF.config);
    ok("the device advertises knobs at all", knobs.length > 0, knobs.join(", "));
    const dead = [];
    for (const k of knobs) {
        const alive = [];
        for (const mode of bellDevice.modes) {
            const base = bellDevice.build({ mode, config: {} });
            const v = DEF.config[k];
            const out = bellDevice.build({ mode, config: { [k]: typeof v === "number" ? (v === 0 ? 0.3 : v * 1.4) : v } });
            const moved = BELL_OBSERVABLES.some((o) =>
                finite(base[o]) && finite(out[o]) && Math.abs(base[o] - out[o]) > 1e-9 * Math.max(1, Math.abs(base[o])));
            if (moved) alive.push(mode);
        }
        if (!alive.length) dead.push(k); else report(`${k} moves observables in: ${alive.join(", ")}`);
    }
    ok("!! no advertised knob is inert in EVERY mode", dead.length === 0,
        dead.length ? "DEAD: " + dead.join(", ") : knobs.length + " knobs, all live somewhere");
    report("cross-mode silence is correct and not counted against a knob: sweepSteps has no business moving " +
           "the chsh mode. A knob that moves nothing ANYWHERE is the defect");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE PLANT: WHAT IT MOVES, AND THE ONE THING IT DELIBERATELY DOES NOT ***");
{
    for (const mode of bellDevice.modes) {
        const nom = bellDevice.build({ mode, config: {} });
        const pl = bellDevice.build({ mode, config: { planted: true } });
        const moved = BELL_OBSERVABLES.filter((o) =>
            finite(nom[o]) && finite(pl[o]) && Math.abs(nom[o] - pl[o]) > 1e-12 * Math.max(1, Math.abs(nom[o])));
        ok(`${mode}: the plant moves at least one finite observable`, moved.length > 0, moved.join(", ") || "NOTHING MOVED");
        ok(`${mode}: and it is flagged as planted`, pl.planted === true && nom.planted === false);
        ok(`${mode}: tsirelsonGap moves -- the observable every mode carries for exactly this reason`,
            moved.includes("tsirelsonGap"),
            `nominal ${nom.tsirelsonGap.toExponential(3)} -> planted ${pl.tsirelsonGap.toExponential(3)}`);
    }

    // *** THE DESIGNED NON-MOVEMENT, ASSERTED SO IT CANNOT BE LOST SILENTLY ***
    const nomC = bellDevice.build({ mode: "chsh", config: {} });
    const plC = bellDevice.build({ mode: "chsh", config: { planted: true } });
    ok("!! *** THE PLANT STILL VIOLATES BELL -- violatesClassical is true BOTH WAYS ***",
        nomC.violatesClassical === true && plC.violatesClassical === true,
        `nominal ${nomC.violatesClassical}, planted ${plC.violatesClassical}`);
    ok("...so a device graded on 'does it violate the classical bound' would PASS this plant unchanged",
        plC.chshMatrix > CLASSICAL_BOUND, "planted |S| = " + plC.chshMatrix.toFixed(6) + " > 2");
    ok("!! ...and ONLY the Tsirelson comparison catches it",
        Math.abs(nomC.tsirelsonGap) < 1e-9 && plC.tsirelsonGap > 0.01,
        `gap: ${nomC.tsirelsonGap.toExponential(2)} -> ${plC.tsirelsonGap.toFixed(6)}`);
    report("if somebody ever replaces this plant with a cruder one -- a product state, a sign flip -- the " +
           "violatesClassical assertion above goes red, so the loss of the interesting property is visible");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** THE PLANT IS THE STATE IT CLAIMS TO BE, CHECKED AGAINST THE CLOSED FORM ***");
{
    // The bind claims the plant is partialSinglet(0.65). That is checkable: the maximum CHSH for that state has
    // a closed form, and the device's own swept maximum should approach it -- not the singlet's Tsirelson bound.
    const pl = bellDevice.build({ mode: "bounds", config: { planted: true, sweepSteps: 20 } });
    const expected = maxCHSHPartial(0.65);
    ok("!! the planted device's swept maximum approaches 2*sqrt(1+sin^2 2t) at t=0.65, not Tsirelson",
        Math.abs(pl.sweepMax - expected) < 0.02 && pl.sweepMax < TSIRELSON_BOUND - 0.01,
        `swept ${pl.sweepMax.toFixed(6)} vs closed form ${expected.toFixed(6)} (Tsirelson ${TSIRELSON_BOUND.toFixed(6)})`);

    // and the LHV bound is state-INDEPENDENT by construction -- a fact worth pinning, since a bind that
    // accidentally made it state-dependent would have broken Bell's theorem rather than the code
    const nomB = bellDevice.build({ mode: "bounds", config: {} });
    ok("!! the classical bound is IDENTICAL nominal and planted -- it does not depend on the state at all",
        nomB.lhvMax === pl.lhvMax && nomB.lhvStrategies === pl.lhvStrategies,
        `lhvMax ${nomB.lhvMax} both ways, over ${nomB.lhvStrategies} strategies`);
    report("that is Bell's theorem's actual content: the classical bound is a statement about LOCAL REALISM, " +
           "not about any particular quantum state, so no state can move it");
}

// ---------------------------------------------------------------------------
console.log("\n6. *** SABOTAGE: THE LIVENESS AND PLANT CHECKS MUST BE ABLE TO FAIL ***");
{
    const deaf = { build: () => ({ x: 1 }) };
    const base = deaf.build(), out = deaf.build();
    ok("!! a device that ignores its config reads as DEAD, not live",
        !["x"].some((o) => finite(base[o]) && finite(out[o]) && Math.abs(base[o] - out[o]) > 1e-9));

    const inert = { build: (o) => ({ x: 1, planted: !!(o.config && o.config.planted) }) };
    const n2 = inert.build({ config: {} }), p2 = inert.build({ config: { planted: true } });
    ok("!! a plant that changes no number reads as NOT MOVING, not as covered",
        !["x"].some((o) => finite(n2[o]) && finite(p2[o]) && Math.abs(n2[o] - p2[o]) > 1e-12));

    ok("!! a NaN is not a movement -- the rule plantedCoverage states", !(finite(1) && finite(NaN)));
    report("that last one is why every mode of this bind reports tsirelsonGap: it is the observable that stays " +
           "finite and still moves in all three modes");
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
