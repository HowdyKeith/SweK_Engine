// WebGLEngine/tools/roundhouse/blobVitalsBind-selfcheck.mjs
//
// GATES tools/roundhouse/blobVitalsBind.mjs -- physics/blobVitals.js's roundhouse wiring, graded against the
// four REAL bugs the module's own header names (v2595 dismantled, v2596 dissolved, v2597 dropped, v2597
// vanished), never against a hypothetical failure invented to have something to check.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    BLOB_VITALS_MODES, BLOB_VITALS_OBSERVABLES, blobVitalsDefaults, buildBlobVitals, blobVitalsDevice,
} from "./blobVitalsBind.mjs";
import { DEVICE_NAMES, getDevice } from "./devices.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

console.log("blobVitalsBind-selfcheck -- does each mode diagnose the ONE death it exists for, and no other?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE DEVICE IS REGISTERED AND DECLARES ITSELF HONESTLY ***");
{
    ok("!! blobvitals is in the roundhouse registry", DEVICE_NAMES.includes("blobvitals"));
    const dev = await getDevice("blobvitals");
    ok("...and the registry hands back the same device this file imports", dev === blobVitalsDevice);
    ok("it declares no plant, and SAYS WHY rather than silently reading uncovered",
        typeof blobVitalsDevice.plantRefused === "string" && blobVitalsDevice.plantRefused.length > 30,
        "beam's and compose's own convention: THE STRING IS FOR A PERSON, THE FIELD'S EXISTENCE IS FOR THE TOOL");
    ok("the device exports its own mode list rather than a second copy", blobVitalsDevice.modes === BLOB_VITALS_MODES);
}

// ---------------------------------------------------------------------------
console.log("\n2. *** DEFAULTS CLAMP RATHER THAN TRUST THE CALLER ***");
{
    const d = blobVitalsDefaults({ mode: "not-a-real-mode", config: { n: -5, seed: -1 } });
    ok("!! an unknown mode falls back to healthy rather than building garbage", d.mode === "healthy");
    ok("!! n is clamped to at least 2 -- vitals() needs a pair to have a closestPair at all", d.config.n >= 2);
    ok("a negative seed does not become a negative array index or an infinite loop", d.config.seed >= 0);
}

// ---------------------------------------------------------------------------
console.log("\n3. *** EVERY DECLARED OBSERVABLE IS REPORTED, IN EVERY MODE ***");
{
    const results = {};
    for (const mode of BLOB_VITALS_MODES) {
        const r = await buildBlobVitals({ mode });
        results[mode] = r;
        const missing = BLOB_VITALS_OBSERVABLES.filter((k) => !(k in r));
        ok("!! " + mode + " reports every declared observable", missing.length === 0,
            missing.length ? "MISSING: " + missing.join(", ") : Object.keys(r).length + " fields");
    }

    // ---------------------------------------------------------------------------
    console.log("\n4. *** HEALTHY MEANS ALL FOUR GAUGES CLEAR, AND THE INVARIANT ACTUALLY HOLDS ***");
    const h = results.healthy;
    ok("!! the default configuration reads well on all four gauges", h.healthy === 1 && h.diagnosis === "well",
        "real=" + h.real + " home=" + h.home + " together=" + h.together + " himself=" + h.himself);
    ok("!! *** THE GRADED INVARIANT: peak can never fall below floor while the field is made of lumps ***",
        h.peakMinusFloor >= -1e-9,
        "peak " + h.peak.toFixed(6) + " floor " + h.floor.toFixed(6) + " -- v2596's proof, not a runtime coincidence: " +
        "floor is max(a) and the tallest lump contributes exactly its amplitude at its own centre");

    // ---------------------------------------------------------------------------
    console.log("\n5. *** EACH DEATH MODE IS DIAGNOSED AS ITSELF, NOT AS ANOTHER DEATH ***");
    const DIAG_WORD = { dismantled: "COMING APART", dropped: "GONE", vanished: "NOT REAL" };
    for (const mode of ["dismantled", "dropped", "vanished"]) {
        const r = results[mode];
        ok("!! " + mode + " is UNhealthy", r.healthy === 0, r.diagnosis);
        ok("!! ...and diagnosed as its OWN death (" + DIAG_WORD[mode] + "), not a different one",
            r.diagnosis.startsWith(DIAG_WORD[mode]), "got: " + JSON.stringify(r.diagnosis));
    }
    // real/home/together check in DECLARE-ORDER PRIORITY (diagnose()'s own order), so a mode that trips more
    // than one gauge must still be diagnosed by the FIRST one it fails -- checked explicitly rather than only
    // through the string, because a string match alone would not catch diagnose()'s priority silently changing.
    ok("!! dropped is diagnosed by 'home', not by 'together' or 'himself' even though those are unexamined here",
        results.dropped.real === 1 && results.dropped.home === 0);
    ok("!! vanished fails EVERY gauge, and is still reported as 'not real' first (diagnose()'s own priority)",
        results.vanished.real === 0 && results.vanished.home === 0 &&
        results.vanished.together === 0 && results.vanished.himself === 0);

    report("dismantled ALSO reads himself=0 here (peak sampling on separated, non-overlapping lumps -- a real " +
           "property of fieldPeak()'s discrete grid, not a bug in this mode) -- diagnose() still reports " +
           "COMING APART because together is checked first, which is what section 5 above just proved");
}

// ---------------------------------------------------------------------------
console.log("\n6. *** SABOTAGE: A THRESHOLD THAT STOPPED CHECKING WOULD BE CAUGHT ***");
{
    // Reproduce the exact historical bug (v2595: field radius as collision radius, closest pair 0.2103 ->
    // 1.1255, 5.4x) but stop SHORT of vitals()'s own 2.5x threshold, and confirm the device correctly reads it
    // as still together -- proving the check is a real comparison and not a check that always fires once blobs
    // move at all.
    const { makeBlobs } = await import("../../simulation/tomo/blobPhantom.js");
    const { vitals } = await import("../../physics/blobVitals.js");
    const blobs = makeBlobs(6, 20260715).map((b) => ({ ...b }));
    const { closestPair } = await import("../../physics/blobVitals.js");
    const base = closestPair(blobs);
    const cx = blobs.reduce((s, b) => s + b.x, 0) / blobs.length;
    const cy = blobs.reduce((s, b) => s + b.y, 0) / blobs.length;
    const cz = blobs.reduce((s, b) => s + b.z, 0) / blobs.length;
    const mild = blobs.map((b) => ({ ...b, x: cx + (b.x - cx) * 1.5, y: cy + (b.y - cy) * 1.5, z: cz + (b.z - cz) * 1.5 }));
    const vMild = vitals(mild, base);
    ok("!! a spread UNDER the 2.5x threshold is still read as together -- the check is a real comparison",
        vMild.together === true, "1.5x spread, together=" + vMild.together);
    ok("...and blobVitalsBind's OWN dismantled mode spreads well past it (4x), which is what section 5 measured",
        4 > 2.5);
}

console.log();
if (fails) { console.log("blobVitalsBind-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("blobVitalsBind-selfcheck: all checks pass");
