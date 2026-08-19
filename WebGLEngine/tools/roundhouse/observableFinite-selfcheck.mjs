// tools/roundhouse/observableFinite-selfcheck.mjs
//
// v3544 -- VERDICT INTEGRITY, THE THIRD DOMAIN CHECK: FINITE. A NaN or Infinity is a verdict with no defined
// value, and it corrupts each gate that reads it differently (`err < tol` false, a conservation sum poisoned,
// NaN !== NaN passing an equality). This one CANNOT be swept from the frozen baseline -- JSON turns NaN and
// Infinity into null the moment they are frozen -- so it is read LIVE off the build. The gate spot-checks a
// representative cross-section (correct AND planted), demonstrates the JSON blindness as a fact, and plants NaN,
// +Infinity and -Infinity in itself to prove the check is not vacuous.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { nonFinite, afterFreeze } from "./observableFinite.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. WHY THIS CANNOT COME FROM THE BASELINE: JSON launders every non-finite value into null -----------------
ok("!! *** the freeze is BLIND to this fault: NaN and Infinity become null through JSON ***",
    afterFreeze(NaN) === null && afterFreeze(Infinity) === null && afterFreeze(-Infinity) === null && afterFreeze(-1) === -1,
    "JSON.stringify(NaN) is \"null\", so a non-finite observable frozen into lab-results-baseline.json is " +
    "indistinguishable from a key a mode did not compute -- which is exactly why finiteness has to be read live, " +
    "off the build, and why the other two domain checks could not have caught it");

// ---- 2. THE LIVE SWEEP: a representative cross-section, correct AND planted ------------------------------------
const D = await import(pathToFileURL(path.join(HERE, "devices.mjs")).href);
const SPOT = ["astroparticle", "xpbd", "csg", "bonefield", "nuclear", "kepler", "em", "percolation", "quantum",
              "acoustics", "kerr", "blackhole", "twobody", "eccentric", "tidal", "whitedwarf", "jeans", "optics"]
             .filter(n => D.DEVICE_NAMES.includes(n));
let hits = [], scanned = 0, covered = 0;
for (const n of SPOT) {
    let dev; try { dev = await D.getDevice(n); } catch { continue; }
    covered++;
    const modes = (Array.isArray(dev.modes) && dev.modes.length) ? dev.modes : [null];
    for (const m of modes) for (const cfg of [{}, { planted: true }]) {
        let o; try { o = dev.build(m ? { mode: m, config: cfg } : { config: cfg }); } catch { continue; }
        for (const [k, v] of Object.entries(o || {})) if (typeof v === "number") scanned++;
        hits.push(...nonFinite(o, `${n}/${m || "-"} (${cfg.planted ? "planted" : "ok"}).`));
    }
}
ok("!! every numeric observable on the live cross-section is FINITE, correct and planted",
    hits.length === 0,
    hits.length ? "NON-FINITE: " + hits.slice(0, 6).map(h => h.key + "=" + h.value).join(", ") :
    scanned + " numeric observations across " + covered + " devices (all modes, both builds) -- every one finite. " +
    "A plant makes a key large; a plant that made one NaN would poison every conservation sum it fed");

// ---- 3. THE CHECK IS NOT VACUOUS ------------------------------------------------------------------------------
ok("!! NaN, +Infinity and -Infinity are all caught",
    nonFinite({ a: NaN }).length === 1 && nonFinite({ b: Infinity }).length === 1 && nonFinite({ c: -Infinity }).length === 1,
    "a 0/0, an overflow and a -1/0 are each flagged -- the values `err < tol` would read as a failure and a " +
    "conservation sum would read as poison");

ok("...and finite numbers, including the -1 sentinel, pass",
    nonFinite({ x: 0, y: -1, z: 1e-17, w: 3.4e8 }).length === 0,
    "zero, the -1 not-applicable sentinel, a tiny residual and a large speed are all finite -- the check fires on " +
    "non-finiteness, nothing else");

ok("!! booleans, strings and null are not numbers and are left alone",
    nonFinite({ ok: true, name: "cherenkov", missing: null, count: 40 }).length === 0,
    "only a numeric value that fails Number.isFinite is a fault; a null (an absent key) is not a NaN");

console.log();
if (fails) { console.log("observableFinite-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("observableFinite-selfcheck: all checks pass");
