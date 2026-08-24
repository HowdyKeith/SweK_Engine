// tools/roundhouse/kineticsBind-selfcheck.mjs
//
// Run: node tools/roundhouse/kineticsBind-selfcheck.mjs
// RUNTIME 2.57s MEASURED (median of 3 -- 2572/2560/2574 -- with date(1) around the run). Almost all of it is the
// "period" mode's RK4 arm, which integrates 200 simulated seconds at dt = 1e-3 and is run repeatedly here
// (nominal, planted, and once per knob per mode in the liveness sweep). The 1.9s written here before measuring
// was a guess and is named rather than quietly overwritten.
//
// THIS GRADES THE BIND, NOT THE PHYSICS. physics/nuclear/kinetics-selfcheck.mjs owns the physics and checks the
// inhour/RK4 agreement, the scram floor and the prompt-critical regime change against their own keys. What can
// go wrong HERE is different and is the thing binds in this tree have actually got wrong before:
//
//   A KNOB THE DEVICE ADVERTISES AND THEN IGNORES. nuclearBind's own comment records exactly this -- A and Z
//   sitting in its defaults and moving nothing until the sensitivity matrix found them. This gate drives every
//   advertised knob in every mode and requires each to move a finite observable SOMEWHERE. *** IT ALREADY PAID
//   FOR ITSELF: `t` and `dt` were in the defaults table when this bind was written, and driven they moved
//   NOTHING in any mode -- at t=200, dt=1e-3 the two routes already agree to 2.5e-14, so doubling the window
//   changes the only observable they touch by about 1e-12, which is float noise rather than a response. They
//   are fixed constants in the bind now and are not offered as control the observables cannot reflect. ***
//
//   A PLANT THAT DOES NOT MOVE THE MODE IT IS CREDITED WITH. plantedCoverage counts a mode only if a finite
//   numeric observable actually changes, and a NaN is not a change. The scram mode is the one where this plant
//   is nearly harmless -- w*gen is ~2e-7 against delayed terms of ~6e-3 -- so it is checked by name rather than
//   assumed to follow from the other two.
"use strict";
import { kineticsDevice, KINETICS_OBSERVABLES } from "./kineticsBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { totalBeta, KEEPIN_U235 } from "../../physics/nuclear/kinetics.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const finite = (v) => typeof v === "number" && Number.isFinite(v);

console.log("kineticsBind-selfcheck -- is the device wired, live, and does its plant actually bite?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE DEVICE IS REGISTERED AND REACHABLE THROUGH THE REGISTRY, NOT JUST EXPORTED ***");
{
    ok("kinetics appears in DEVICE_NAMES", DEVICE_NAMES.includes("kinetics"), DEVICE_NAMES.length + " devices");
    const d = await getDevice("kinetics");
    ok("!! and the registry hands back THIS device, not merely something", d && d.name === "point-reactor-kinetics",
        d ? d.name : "getDevice returned nothing");
    ok("it declares three modes", d.modes.length === 3 && d.modes.join(",") === "period,scram,prompt", d.modes.join(","));
    ok("it declares a plant kind", d.plantKind === "knob");
    ok("every observable it advertises is a string in one list", KINETICS_OBSERVABLES.every((o) => typeof o === "string"));
    report("a bind that is exported but never registered runs in its own gate and nowhere else -- devices.mjs " +
           "is the only path the roundhouse and every census actually take");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** EVERY MODE RETURNS THE FULL OBSERVABLE SET, SO A MISSING KEY IS NEVER A SILENT null ***");
{
    for (const mode of kineticsDevice.modes) {
        const out = kineticsDevice.build({ mode, config: {} });
        const missing = KINETICS_OBSERVABLES.filter((o) => !(o in out));
        ok(`${mode}: every advertised observable is present as a key`, missing.length === 0,
            missing.length ? "MISSING: " + missing.join(", ") : KINETICS_OBSERVABLES.length + " keys");
        const extra = Object.keys(out).filter((k) => !KINETICS_OBSERVABLES.includes(k));
        ok(`${mode}: and it returns nothing it did not advertise`, extra.length === 0, extra.join(", "));
    }
    report("the blank template is what makes this hold -- a mode that simply omitted a key would read as null " +
           "downstream and be indistinguishable from a measurement that came out null");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** EVERY ADVERTISED KNOB MOVES SOMETHING -- THE DEFECT nuclearBind ALREADY PAID FOR ***");
{
    const DEF = kineticsDevice.defaults({});
    const knobs = Object.keys(DEF.config);
    ok("the device advertises knobs at all", knobs.length > 0, knobs.join(", "));
    const dead = [];
    for (const k of knobs) {
        const alive = [];
        for (const mode of kineticsDevice.modes) {
            const base = kineticsDevice.build({ mode, config: {} });
            const out = kineticsDevice.build({ mode, config: { [k]: DEF.config[k] * 1.5 } });
            const moved = KINETICS_OBSERVABLES.some((o) =>
                finite(base[o]) && finite(out[o]) && Math.abs(base[o] - out[o]) > 1e-9 * Math.max(1, Math.abs(base[o])));
            if (moved) alive.push(mode);
        }
        if (!alive.length) dead.push(k); else report(`${k} moves observables in: ${alive.join(", ")}`);
    }
    ok("!! no advertised knob is inert in EVERY mode", dead.length === 0,
        dead.length ? "DEAD: " + dead.join(", ") : knobs.length + " knobs, all live somewhere");
    report("cross-mode silence is CORRECT and is not counted against a knob: scramDollars has no business " +
           "moving the period mode. What is a defect is a knob that moves nothing anywhere, which is what " +
           "`t` and `dt` were doing when this gate was first run against this bind");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE PLANT MOVES A FINITE OBSERVABLE IN EVERY DECLARED MODE ***");
{
    // plantedCoverage counts a mode only if a FINITE NUMERIC observable changes. Checked here per mode by name,
    // because the scram mode is the one where this plant is nearly harmless and would be the one to rot.
    for (const mode of kineticsDevice.modes) {
        const nom = kineticsDevice.build({ mode, config: {} });
        const pl = kineticsDevice.build({ mode, config: { planted: true } });
        const moved = KINETICS_OBSERVABLES.filter((o) =>
            finite(nom[o]) && finite(pl[o]) && Math.abs(nom[o] - pl[o]) > 1e-12 * Math.max(1, Math.abs(nom[o])));
        ok(`${mode}: the plant moves at least one finite observable`, moved.length > 0, moved.join(", ") || "NOTHING MOVED");
        ok(`${mode}: and it is flagged as planted`, pl.planted === true && nom.planted === false);
    }
    report("a plant credited with a mode it cannot move is a control that cannot fail, and the census would " +
           "carry it as covered -- which is worse than being uncovered and knowing it");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** WHAT THE PLANT ACTUALLY DOES, CHECKED AS PHYSICS RATHER THAN AS MOVEMENT ***");
{
    // Movement alone is not evidence the plant is the RIGHT one. These are the two specific claims its header
    // makes, and if either stopped being true the header would be describing a plant that no longer exists.
    const nomP = kineticsDevice.build({ mode: "period", config: {} });
    const plP = kineticsDevice.build({ mode: "period", config: { planted: true } });
    ok("!! below prompt critical the plant is nearly INVISIBLE -- under 1% on the period",
        Math.abs(nomP.periodSeconds - plP.periodSeconds) / nomP.periodSeconds < 1e-2,
        "nominal " + nomP.periodSeconds.toFixed(4) + "s vs planted " + plP.periodSeconds.toFixed(4) + "s");
    ok("...and the two-route disagreement is what exposes it there, by 11 orders of magnitude",
        nomP.inhourVsRk4 < 1e-10 && plP.inhourVsRk4 > 1e-4,
        "nominal " + nomP.inhourVsRk4.toExponential(3) + " vs planted " + plP.inhourVsRk4.toExponential(3));

    const nomQ = kineticsDevice.build({ mode: "prompt", config: {} });
    const plQ = kineticsDevice.build({ mode: "prompt", config: { planted: true } });
    ok("!! *** ABOVE PROMPT CRITICAL THE PLANT INVERTS THE SIGN: A RUNAWAY REPORTED AS A SHUTDOWN ***",
        nomQ.dominantRate > 0 && plQ.dominantRate < 0,
        "nominal " + nomQ.dominantRate.toExponential(5) + " (doubling) vs planted " + plQ.dominantRate.toExponential(5) + " (decaying)");
    ok("...because the prompt branch is deleted outright -- the root count falls",
        plQ.rootCount < nomQ.rootCount, nomQ.rootCount + " -> " + plQ.rootCount);
    ok("...and the regime separation collapses to nothing",
        nomQ.regimeSeparation > 50 && Math.abs(plQ.regimeSeparation - 1) < 1e-6,
        "nominal " + nomQ.regimeSeparation.toFixed(1) + "x vs planted " + plQ.regimeSeparation.toFixed(6) + "x");
    report("that last one is the device's structural key going flat: with gen = 0 the period cannot depend on " +
           "gen in EITHER regime, so the ratio is exactly 1 everywhere and the two regimes stop being distinct");
}

// ---------------------------------------------------------------------------
console.log("\n6. *** THE NOMINAL DEVICE STILL AGREES WITH THE PHYSICS IT BINDS ***");
{
    // A bind can drift from its module by reading the wrong field or scaling a unit. These re-derive the two
    // headline numbers from the module's own constants rather than trusting the bind's arithmetic.
    const s = kineticsDevice.build({ mode: "scram", config: {} });
    const l1 = KEEPIN_U235.lambda[0];
    ok("!! the scram floor is respected and the approach is monotone", s.floorRespected === true && s.approachMonotone === true);
    ok("...and the reported scram rate sits just above -lambda_1, never below it",
        s.scramRate < 0 && s.scramRate > -l1, s.scramRate.toExponential(6) + " vs floor " + (-l1).toExponential(6));
    ok("...and asymptoteGap is the distance to that floor, not something else",
        Math.abs(s.asymptoteGap - Math.abs(s.scramRate - (-l1))) < 1e-15, s.asymptoteGap.toExponential(4));

    const q = kineticsDevice.build({ mode: "prompt", config: {} });
    const B = totalBeta();
    ok("!! beta recovered by the device matches the module's summed beta to better than 1%",
        Math.abs(q.betaRecovered - B) / B < 1e-2,
        "recovered " + q.betaRecovered.toExponential(6) + " vs summed " + B.toExponential(6));
    ok("...and betaRelErr is that same relative error, reported rather than recomputed differently",
        Math.abs(q.betaRelErr - Math.abs(q.betaRecovered - B) / B) < 1e-15, q.betaRelErr.toExponential(3));
}

// ---------------------------------------------------------------------------
console.log("\n7. *** SABOTAGE: THE LIVENESS AND PLANT CHECKS MUST BE ABLE TO FAIL ***");
{
    // Section 3 would be worthless if it passed a device that ignored its config, and section 4 worthless if it
    // passed a plant that changed nothing. Both are shown to refuse, using stand-in devices built here.
    const deaf = { modes: ["only"], build: () => ({ x: 1 }) };
    const knobMoved = (() => {
        const base = deaf.build(), out = deaf.build();
        return ["x"].some((o) => finite(base[o]) && finite(out[o]) && Math.abs(base[o] - out[o]) > 1e-9);
    })();
    ok("!! a device that ignores its config reads as DEAD, not as live", knobMoved === false);

    const inert = { build: (o) => ({ x: 1, planted: !!(o.config && o.config.planted) }) };
    const nom = inert.build({ config: {} }), pl = inert.build({ config: { planted: true } });
    const plantMoved = ["x"].some((o) => finite(nom[o]) && finite(pl[o]) && Math.abs(nom[o] - pl[o]) > 1e-12);
    ok("!! a plant that changes no number reads as NOT MOVING, not as covered", plantMoved === false);

    // and a NaN is not a movement -- the rule plantedCoverage states and the reason rootCount exists
    const nanish = { a: 1, b: NaN };
    ok("!! a value going NaN does not count as a finite observable moving",
        !(finite(nanish.a) && finite(nanish.b)));
    report("that last one is why every mode of this bind reports rootCount: it is the observable that stays " +
           "finite and still moves in the scram mode, where the plant is otherwise almost harmless");
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
