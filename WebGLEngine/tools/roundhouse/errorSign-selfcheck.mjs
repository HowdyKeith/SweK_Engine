// tools/roundhouse/errorSign-selfcheck.mjs
//
// v3534 -- VERDICT INTEGRITY, THE SIGN OF AN ERROR. The verdict `err < tol` passes silently for any NEGATIVE err,
// so an error metric that can go negative is a verdict the physics cannot enforce. This gate proves every graded
// error observable in the lab is a non-negative magnitude: comprehensively over the frozen lab-results baseline
// (every captured correct-mode output), and live over a handful of planted builds. It then plants the fault in
// ITSELF -- a device whose error goes negative -- and shows the check catches it, so the pass is not vacuous.

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { negativeErrors, scanBaseline, isErrorObservable, SIGNED_OK } from "./errorSign.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE COMPREHENSIVE SWEEP: the frozen baseline holds every captured correct-mode output ------------------
const base = JSON.parse(fs.readFileSync(path.join(HERE, "lab-results-baseline.json"), "utf8"));
const baseHits = scanBaseline(base);
let scanned = 0;
for (const row of [...Object.values(base.devices || {}), ...Object.values(base.pairs || {})])
    for (const [k, v] of Object.entries(row.outputs || {})) if (isErrorObservable(k) && typeof v === "number") scanned++;

ok("!! *** every error observable in the baseline is a non-negative magnitude ***",
    baseHits.length === 0,
    baseHits.length ? "NEGATIVE: " + baseHits.slice(0, 6).map(h => h.key + "=" + h.value).join(", ") :
    scanned + " error observables across " + (Object.keys(base.devices || {}).length) + " device rows and " +
    (Object.keys(base.pairs || {}).length) + " device-mode pairs, all >= 0. The verdict `err < tol` cannot be " +
    "tricked by a sign, because there are no signs to trick it");

// ---- 2. LIVE PLANTED SPOT-CHECK: a plant is meant to make an error LARGE, never to make it negative -----------
const D = await import(pathToFileURL(path.join(HERE, "devices.mjs")).href);
const SPOT = ["astroparticle", "xpbd", "csg", "bonefield", "nuclear", "kepler"].filter(n => D.DEVICE_NAMES.includes(n));
let plantedHits = [], plantedScanned = 0;
for (const n of SPOT) {
    let dev; try { dev = await D.getDevice(n); } catch { continue; }
    const modes = (Array.isArray(dev.modes) && dev.modes.length) ? dev.modes : [null];
    for (const m of modes) {
        let o; try { o = dev.build(m ? { mode: m, config: { planted: true } } : { config: { planted: true } }); } catch { continue; }
        for (const [k, v] of Object.entries(o || {})) if (isErrorObservable(k) && typeof v === "number") plantedScanned++;
        plantedHits.push(...negativeErrors(o, n + "/" + (m || "-") + " (planted)."));
    }
}
ok("!! and no PLANT drives an error negative on the spot-checked devices",
    plantedHits.length === 0,
    plantedHits.length ? "NEGATIVE UNDER PLANT: " + plantedHits.slice(0, 6).map(h => h.key + "=" + h.value).join(", ") :
    plantedScanned + " error observables over the planted builds of " + SPOT.join(", ") + " -- all >= 0. A plant " +
    "makes a key LARGE; one that made it negative would sail through every tolerance gate");

// ---- 3. THE CHECK IS NOT VACUOUS: plant the fault in a synthetic device and catch it --------------------------
const clean = { coneErr: 1.4e-17, radiusErr: 0, discrepancyFactor: 4.65, coneHolds: true, note: "ok" };
const faulty = { coneErr: 1.4e-17, radiusErr: -0.3, discrepancyFactor: 4.65, coneHolds: true, note: "ok" };
ok("!! a synthetic device whose error is NEGATIVE is caught",
    negativeErrors(faulty).length === 1 && negativeErrors(faulty)[0].key === "radiusErr",
    "radiusErr = -0.3 (a residual computed as a-b, not |a-b|) is flagged -- the sign slip that `err < tol` would " +
    "otherwise pass as GREEN");

ok("...and the same device with a POSITIVE error passes",
    negativeErrors(clean).length === 0,
    "the identical bag with radiusErr = 0 is clean -- the check fires on the sign, nothing else");

ok("!! the check ignores booleans, non-error names and non-finite values",
    negativeErrors({ coneHolds: false, discrepancyFactor: -4.65, velocity: -2, refractAngle: -0.3, nan: NaN, e: -Infinity }).length === 0,
    "a false boolean, a negative FACTOR (discrepancyFactor is a ratio, not an error), a negative signed velocity, a " +
    "refraction angle (its 'frac' is refract, not a fraction), a NaN and a -Infinity are all left alone -- only " +
    "finite negative magnitude-named NUMBERS are faults");

ok("!! the widened predicate covers the unambiguous magnitudes (drift, spread, excess) but stops there",
    negativeErrors({ sDrift: -1e-3 }).length === 1 && negativeErrors({ iterSpread: -0.5 }).length === 1 &&
    negativeErrors({ worstExcess: -2 }).length === 1 &&
    negativeErrors({ escapeFrac: -0.1 }).length === 0 &&
    negativeErrors({ shiftObserver: -1.4 }).length === 0 && negativeErrors({ refractAngle: -0.3 }).length === 0,
    "a drift, a spread and an excess are >= 0 by construction and are caught negative; a FRACTION is deliberately " +
    "NOT (a fractional change (a-b)/b is signed by nature, and 'frac' collides with refract) -- bounded fractions " +
    "belong in observableRange's declared [0,1] set; a Doppler shift and a refraction angle are measurements, not " +
    "magnitudes, and stay out too -- a signed one must not fault");

ok("!! the -1 not-applicable SENTINEL is not a fault, but any OTHER negative is",
    negativeErrors({ creepErrAbs: -1, capErrFrac: -1 }).length === 0 &&
    negativeErrors({ creepErrAbs: -1, capErrFrac: -0.999 }).length === 1,
    "a mode that does not compute a key returns -1, which is respected; a residual of -0.999 -- close to the " +
    "sentinel but not it -- is still caught, so the sentinel does not become a hiding place for sign slips");

ok("the signed-error exemption registry is present and, by design, empty",
    SIGNED_OK && typeof SIGNED_OK === "object" && Object.keys(SIGNED_OK).length === 0,
    "no err-named observable in the lab is legitimately signed; any future one carries its reason here, like the " +
    "exact-zero register does for the value 0");

console.log();
if (fails) { console.log("errorSign-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("errorSign-selfcheck: all checks pass");
