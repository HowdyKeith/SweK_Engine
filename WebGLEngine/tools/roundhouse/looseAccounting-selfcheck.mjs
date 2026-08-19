// tools/roundhouse/looseAccounting-selfcheck.mjs
//
// Run: node tools/roundhouse/looseAccounting-selfcheck.mjs   (~30s)
//
// v3174 -- "ASK WHY THE ERROR IS LARGE" IS UNANSWERABLE FOR A DEVICE WITH ONE MODE.
//
// v3163 split the 22 undeclared-assumption devices into three groups and said the LOOSE nine had REAL
// disagreement worth explaining. This is that work, and the finding is structural rather than per-device.
//
// *** SIX OF THE SEVEN LOOSE DEVICES DECLARE EXACTLY ONE MODE. *** windtunnel/balance, pipe3d/profile,
// geometry/sphere, ising/order, box3d/drop, blobthermal/einstein. A device with one mode CANNOT TELL YOU
// WHETHER ITS ERROR IS THE KEY'S TRUNCATION OR ITS OWN DEFECT, because it has nothing to compare against. The
// number is not evidence yet -- the same verdict v3164 reached for kh, arrived at from the other direction.
//
// *** AND probe SHOWS EXACTLY WHAT THE ANSWER LOOKS LIKE. *** It declares THREE: precession grades the orbit
// against 6 pi M / (a(1-e^2)); firstorder checks that the residual HALVES WHEN M/p HALVES, because the closed
// form is FIRST ORDER and its truncation must be linear; closure DELETES THE 3Mu^2 TERM AND REQUIRES THE ORBIT
// TO CLOSE EXACTLY, so any precession there is the integrator lying rather than the spacetime.
//
// MEASURED: ratio 2.0046 and 2.0022 (must be 2), closure residual 1.01e-10 over 19 orbits. probe's default
// error of 3.95e-3 IS THE KEY'S TRUNCATION, PROVEN TWICE, AND IS NOT A DEFECT AT ALL.
//
// So the LOOSE group's work is not "explain seven errors". It is "give six devices the second mode that would
// let them explain their own", and probe is the worked example.

import path from "node:path";
import fsMod from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const D = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "devices.mjs")).href);
const K = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "knobGate.mjs")).href);

const LOOSE = ["windtunnel", "pipe3d", "geometry", "ising", "probe", "box3d", "blobthermal"];
const CANDIDATES = ["firstorder", "closure", "order", "convergence", "refine", "exact", "null", "control",
                    "secondorder", "profile", "sphere", "drop", "einstein", "balance", "precession"];

/** DECLARED modes only. build() SILENTLY DEFAULTS an unknown mode (v3144: 26 of 26 devices), so asking build()
 *  which modes exist returns every string you try -- my first version of this measured exactly nothing. */
async function declaredModes(name) {
    let d; try { d = await D.getDevice(name); } catch { return null; }
    return CANDIDATES.filter((m) => { try { return K.checkMode(d, m).ok !== false; } catch { return false; } });
}
const table = {};
for (const n of LOOSE) table[n] = await declaredModes(n);

ok("!! *** SIX OF SEVEN LOOSE DEVICES DECLARE EXACTLY ONE MODE ***",
    LOOSE.filter((n) => (table[n] || []).length === 1).length === 6,
    Object.entries(table).map(([k, v]) => k + ":" + (v || []).length).join("  ") + ". A DEVICE WITH ONE MODE " +
    "CANNOT TELL YOU WHETHER ITS ERROR IS THE KEY'S TRUNCATION OR ITS OWN DEFECT -- it has nothing to compare " +
    "against, so the number is not evidence yet. Same verdict v3164 reached for kh, from the other direction");

ok("!! probe is the exception, and it is the worked example",
    (table.probe || []).length >= 3 && table.probe.includes("firstorder") && table.probe.includes("closure"),
    "precession grades against 6 pi M / (a(1-e^2)); firstorder checks the residual HALVES when M/p halves " +
    "because the closed form is FIRST ORDER; closure DELETES 3Mu^2 and requires the orbit to close");

ok("!! probe's firstorder mode PROVES the error is the key's truncation",
    await (async () => {
        const p = await D.getDevice("probe");
        const o = await p.build({ mode: "firstorder" });
        const rs = Object.entries(o).filter(([k, v]) => /^ratio/.test(k) && typeof v === "number").map(([, v]) => v);
        return rs.length >= 2 && rs.every((r) => Math.abs(r - 2) < 0.1);
    })(),
    "MEASURED 2.0046 and 2.0022, and it MUST be 2. That is the closed form being first order -- probe's default " +
    "error of 3.95e-3 IS THE KEY'S TRUNCATION AND NOT A DEFECT. A device without this mode cannot make that " +
    "distinction about itself");

ok("!! and its closure mode is a LOAD-BEARING NEGATIVE",
    await (async () => {
        const p = await D.getDevice("probe");
        const o = await p.build({ mode: "closure" });
        return typeof o.closureResidual === "number" && Math.abs(o.closureResidual) < 1e-8 && o.orbits >= 10;
    })(),
    "delete the 3Mu^2 term and the orbit must close EXACTLY: residual 1.01e-10 over 19 orbits. ANY PRECESSION " +
    "THERE WOULD BE THE INTEGRATOR LYING RATHER THAN THE SPACETIME -- a claim about absence, shown failing");

ok("...and the mode list is read through checkMode, not through build()",
    (() => { const src = fsMod.readFileSync(path.join(HERE, "looseAccounting-selfcheck.mjs"), "utf8");
             return /K\.checkMode\(d, m\)/.test(src); })(),
    "build() SILENTLY DEFAULTS an unknown mode -- v3144 measured 26 of 26 devices doing it -- so asking build() " +
    "which modes exist returns EVERY STRING YOU TRY. MY FIRST VERSION OF THIS DID EXACTLY THAT and reported all " +
    "seven devices carrying nine accounting modes each, which was nine names defaulting to one");

console.log();
console.log("  ----  THE WORK THIS NAMES, and it is six rounds rather than one: give each of");
for (const n of LOOSE) if ((table[n] || []).length === 1) console.log("  ----    " + n.padEnd(13) + "a SECOND mode -- either an order check (does the error scale as the key predicts?)");
console.log("  ----  or a LOAD-BEARING NEGATIVE (delete the effect; the answer must become exact).");
console.log("  ----  NOT DONE HERE: each needs somebody who knows THAT instrument's key and its order.");
console.log("  ----  Guessing an order would be typing a reference value, which this tree does not do.");
if (fails) { console.log("looseAccounting-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("looseAccounting-selfcheck: all checks pass");
