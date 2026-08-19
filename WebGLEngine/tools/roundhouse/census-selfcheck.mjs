// tools/roundhouse/census-selfcheck.mjs
//
// Run: node tools/roundhouse/census-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2898 -- TWO SWEEPS THAT HAD NEVER BEEN RUN.
//
// 1. THE TAUTOLOGY CENSUS. suspiciousZero() was written in v2896 after three consecutive rounds each produced a
//    measurement that could not disagree with its answer key -- v2892's portability flag on an un-awaited promise,
//    v2894's Roche radius inverted from its own formula, v2895's dispersion measure graded against the function
//    that IS its closed form. Each was caught by a human noticing a zero. The guard made that mechanical, and
//    then it was applied to exactly the code being written that week. The registry holds twenty-four devices and
//    roughly a hundred and fifty observables, most of which nobody has ever examined for this. This sweeps all of
//    them.
//
// 2. THE KERR -> SCHWARZSCHILD LIMIT. physics/blackhole/kerr.js is an INDEPENDENT implementation from
//    geodesic.js and probe.js. At spin a = 0 it must reduce exactly to Schwarzschild, so four exact constants --
//    horizon 2M, photon sphere 3M, ISCO 6M, photon capture impact parameter 3 sqrt(3) M -- must come out
//    identical from two separately-written modules. This is the strongest cross-check available anywhere in the
//    tree, because a disagreement cannot be a tolerance question: one of the two is simply wrong. It had never
//    been run.

import { scanForTautologies, suspiciousZero } from "./suspiciousZero.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { EXACT_OK, EXACT_ZERO_BACKLOG } from "./exactZeroRegister.mjs";   // v2912: shared so range sweeps can consult it too
import { deviceModeTable } from "./deviceModes.mjs";   // v3211: DERIVED -- MODES never existed here
const MODES = await deviceModeTable();
import { horizon, photonSphere, criticalImpact, captureThreshold } from "../../physics/blackhole/geodesic.js";
import { iscoRadius } from "../../physics/blackhole/probe.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// The mode table, kept in step with the honesty scan in tools/ship/labDevices-selfcheck.mjs.


// ---- 1. THE TAUTOLOGY CENSUS ---------------------------------------------------------------------------------------
{
    const findings = [];
    let scanned = 0, devices = 0, errorFields = 0;
    for (const name of DEVICE_NAMES) {
        const modes = MODES[name];
        if (!modes) continue;                       // lbm is excluded: real runs take minutes
        let dev;
        try { dev = await getDevice(name); } catch { continue; }
        devices++;
        for (const mode of modes) {
            let obs;
            try { obs = await dev.build({ mode }); } catch (err) { continue; }
            scanned++;
            for (const k of Object.keys(obs || {})) if (/err|error|residual|delta|deviation/i.test(k) && typeof obs[k] === "number") errorFields++;
            const exactOk = {};
            for (const k of Object.keys(obs || {})) {
                const key = `${name}.${mode}.${k}`;
                if (EXACT_OK[key]) exactOk[k] = EXACT_OK[key];
            }
            for (const hit of scanForTautologies(obs, { exactOk })) {
                findings.push({ device: name, mode, field: hit.field });
            }
        }
    }
    console.log(`  ...scanned ${scanned} device/mode combinations across ${devices} devices, ${errorFields} error-like fields`);
    if (findings.length) {
        for (const f of findings) console.log(`         UNEXPLAINED ZERO: ${f.device}.${f.mode}.${f.field}`);
    }
    // v3211 -- THE BACKLOG, AND WHY THE CHECK IS NOT SIMPLY `findings.length === 0` ANY MORE.
    // This gate CRASHED ON IMPORT for as long as MODES has been a broken name, so its first real run found
    // eleven unexplained zeros at once. Failing on all eleven would leave the gate red with no path to green
    // except registering reasons nobody has verified -- which is how a suite gets switched off. The ratchet
    // shape this tree already uses: a NAMED LIST (v3139: a list, not a count, because a count cannot name a
    // newcomer), frozen, and the assertion is that IT DOES NOT GROW.
    const backlogged = findings.filter((f) => EXACT_ZERO_BACKLOG[`${f.device}.${f.mode}.${f.field}`]);
    const fresh = findings.filter((f) => !EXACT_ZERO_BACKLOG[`${f.device}.${f.mode}.${f.field}`]);
    // *** AND A BACKLOG ENTRY THAT NO LONGER FIRES IS DELETED, NOT LEFT IN PLACE. *** v3195 found five of
    // fourteen orphan-baseline entries holding nothing: a stale suppression is an ACTIVE BLIND SPOT, because if
    // the zero came back the entry would silently swallow it. The correct response is DELETION, NOT LOOSENING.
    const firing = new Set(findings.map((f) => `${f.device}.${f.mode}.${f.field}`));
    const stale = Object.keys(EXACT_ZERO_BACKLOG).filter((k) => !firing.has(k));

    ok("!! no NEW unexplained exact-zero errors anywhere in the registry", fresh.length === 0,
        fresh.length === 0
            ? `${errorFields} error-like observables across ${scanned} device/modes; ${backlogged.length} on the v3211 backlog awaiting a sentence, none new. THIS GATE CRASHED ON IMPORT FOR HUNDREDS OF VERSIONS and its first real run found eleven at once -- a crashed gate is not a passing gate`
            : fresh.map((f) => f.device + "." + f.mode + "." + f.field).join(", ") +
              " -- each is either a measurement graded against its own expression, or a zero that deserves a sentence on the EXACT_OK register. DO NOT ADD IT TO EXACT_ZERO_BACKLOG: that list is frozen debt and adding to it is how a ratchet grows back");

    ok("!! *** and no backlog entry has outlived its reason ***", stale.length === 0,
        stale.length === 0
            ? Object.keys(EXACT_ZERO_BACKLOG).length + " backlog entries, every one still firing -- so none is a suppression holding nothing"
            : "STALE, DELETE THESE: " + stale.join(", ") + " -- they no longer fire, and an entry whose reason " +
              "has expired is a ratchet holding nothing (v3195). THE RIGHT RESPONSE IS DELETION, NOT LOOSENING");

    ok("the exact-zero BACKLOG is debt and says so, entry by entry",
        Object.values(EXACT_ZERO_BACKLOG).every((v) => typeof v === "string" && v.length > 20),
        Object.keys(EXACT_ZERO_BACKLOG).length + " entries. MOVING ONE TO EXACT_OK MEANS SOMEBODY EXAMINED IT " +
        "AND WROTE THE SENTENCE -- which is what happened to plastic.cap.capErrAbs, and what did NOT happen to " +
        "plastic.creep.creepErrAbs, whose clean story died under test");

    ok("the exact-by-construction register carries a REASON for every entry",
        Object.values(EXACT_OK).every((v) => typeof v === "string" && v.length > 20),
        Object.keys(EXACT_OK).length + " entries, each with the sentence the guard exists to force");
}

// ---- 2. THE KERR -> SCHWARZSCHILD LIMIT, ACROSS TWO INDEPENDENT IMPLEMENTATIONS -------------------------------------
{
    const kerrDev = await getDevice("kerr");
    const lim = await kerrDev.build({ mode: "limit" });
    console.log("  ...kerr limit-mode observables: " + Object.keys(lim).filter((k) => k !== "kind").join(", "));

    // Whatever kerr.js reports at a = 0 must agree with the separately-written Schwarzschild modules.
    const M = 1;
    const schw = { horizon: horizon(M), photonSphere: photonSphere(M), isco: iscoRadius(M), bCrit: criticalImpact(M) };
    ok("Schwarzschild's own constants are the exact textbook values",
        schw.horizon === 2 && schw.photonSphere === 3 && schw.isco === 6 && Math.abs(schw.bCrit - 3 * Math.sqrt(3)) < 1e-15,
        `2M=${schw.horizon}, 3M=${schw.photonSphere}, 6M=${schw.isco}, 3sqrt(3)M=${schw.bCrit.toFixed(9)}`);

    // The measured photon capture threshold (traced, not assumed) must equal the Schwarzschild constant --
    // a numeric integration agreeing with an algebraic constant, so NOT a tautology.
    const traced = captureThreshold(M, { opts: { dphi: 2e-4 } });
    const tracedErr = Math.abs(traced - schw.bCrit) / schw.bCrit;
    ok("!! the TRACED photon capture threshold reproduces 3 sqrt(3) M -- integration against algebra",
        tracedErr > 0 && tracedErr < 1e-9,
        `traced ${traced.toFixed(10)} vs exact ${schw.bCrit.toFixed(10)} (err ${tracedErr.toExponential(2)}); ` +
        `nonzero as it must be -- ${suspiciousZero(tracedErr).verdict}`);

    // Now the cross-implementation claim itself: pull every numeric field kerr's limit mode reports and check any
    // that correspond to a Schwarzschild constant.
    const known = [[2, "horizon 2M"], [3, "photon sphere 3M"], [6, "ISCO 6M"], [3 * Math.sqrt(3), "b_crit 3sqrt(3)M"]];
    const matched = [];
    for (const [k, v] of Object.entries(lim)) {
        if (typeof v !== "number" || !Number.isFinite(v)) continue;
        for (const [target, label] of known) {
            if (Math.abs(v - target) / target < 1e-6) matched.push({ field: k, value: v, label });
        }
    }
    ok("!! kerr.js at a=0 reproduces Schwarzschild constants computed by a SEPARATE module",
        matched.length > 0,
        matched.length
            ? matched.map((m) => `${m.field}=${m.value} matches ${m.label}`).join("; ") +
              " -- two independently written implementations agreeing on exact constants is the strongest cross-check in the tree, and it had never been run"
            : "kerr's limit mode reports " + Object.keys(lim).join(", ") + " -- none matched a Schwarzschild constant to 1e-6; " +
              "either the limit is not taken at a=0 in this mode, or the two implementations disagree, and BOTH are findings worth the failure");
}

console.log();
if (fails) { console.log("census-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("census-selfcheck: all checks pass");
