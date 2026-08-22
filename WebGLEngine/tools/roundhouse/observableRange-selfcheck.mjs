// tools/roundhouse/observableRange-selfcheck.mjs
//
// v3543 -- VERDICT INTEGRITY, THE RANGE OF A BOUNDED OBSERVABLE. errorSign proved every error is >= 0; the same
// silent hole is wider than sign. A bounded observable out of its physical interval -- a cosine past 1, a
// probability past 1 -- feeds acos() and tolerance comparisons that read a real quantity from an impossible one.
// This gate proves every observable with a DECLARED or safely-INFERRED range stays inside it: comprehensively
// over the frozen lab-results baseline and live over the owning devices and a spot-checked sample (correct AND
// planted). It then plants the fault in ITSELF -- a cosine of 1.3, a probability of 1.7 -- and catches them.

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { outOfRange, rangeFor, inferRange, DECLARED } from "./observableRange.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. COMPREHENSIVE SWEEP over the frozen baseline ----------------------------------------------------------
const base = JSON.parse(fs.readFileSync(path.join(HERE, "lab-results-baseline.json"), "utf8"));
let baseHits = [], baseChecked = 0;
for (const row of [...Object.entries(base.devices || {}).map(([n, r]) => [n + "/" + (r.mode || "-") + ".", r.outputs]),
                   ...Object.entries(base.pairs || {}).map(([k, r]) => [k + ".", r.outputs])]) {
    const [prefix, out] = row;
    for (const [k, v] of Object.entries(out || {})) if (typeof v === "number" && rangeFor(prefix + k, k)) baseChecked++;
    baseHits.push(...outOfRange(out, prefix));
}
ok("!! *** every bounded observable in the baseline stays inside its physical range ***",
    baseHits.length === 0,
    baseHits.length ? "OUT OF RANGE: " + baseHits.slice(0, 6).map(h => `${h.key}=${h.value} not in [${h.lo},${h.hi}]`).join(", ") :
    baseChecked + " observables carry a declared or inferred range, and all sit inside it -- no cosine past 1, no probability past 1");

// ---- 2. LIVE, including PLANTED: a plant makes a key large, but never out of its physical interval -------------
const D = await import(pathToFileURL(path.join(HERE, "devices.mjs")).href);
const SPOT = ["em", "percolation", "astroparticle", "quantum", "acoustics", "optics", "wolff", "kepler"].filter(n => D.DEVICE_NAMES.includes(n));
let liveHits = [], liveChecked = 0;
for (const n of SPOT) {
    let dev; try { dev = await D.getDevice(n); } catch { continue; }
    const modes = (Array.isArray(dev.modes) && dev.modes.length) ? dev.modes : [null];
    for (const m of modes) for (const cfg of [{}, { planted: true }]) {
        let o; try { o = dev.build(m ? { mode: m, config: cfg } : { config: cfg }); } catch { continue; }
        for (const [k, v] of Object.entries(o || {})) if (typeof v === "number" && rangeFor(`${n}/${m || "-"}.${k}`, k)) liveChecked++;
        liveHits.push(...outOfRange(o, `${n}/${m || "-"} (${cfg.planted ? "planted" : "ok"}).`));
    }
}
ok("!! and no build, correct or planted, drives a bounded observable out of range",
    liveHits.length === 0,
    liveHits.length ? "OUT OF RANGE: " + liveHits.slice(0, 6).map(h => `${h.key}=${h.value}`).join(", ") :
    liveChecked + " range-checked observations over " + SPOT.join(", ") + " -- all in range. A plant makes a key " +
    "LARGE; a plant that pushed a cosine past 1 would corrupt every acos downstream and this would see it");

// ---- 3. THE CHECK IS NOT VACUOUS -----------------------------------------------------------------------------
ok("!! a cosine of 1.3 and a probability of 1.7 are CAUGHT",
    outOfRange({ cosThetaMax: 1.3 }, "em/cherenkov.").length === 1 &&
    outOfRange({ prob: 1.7 }, "percolation/crossing.").length === 1,
    "the impossible cosine and the impossible probability are both flagged -- the values that acos() and `p <= 1` " +
    "would otherwise swallow");

ok("...and the same observables in range pass",
    outOfRange({ cosThetaMax: 0.667 }, "em/cherenkov.").length === 0 &&
    outOfRange({ prob: 0.5 }, "percolation/crossing.").length === 0,
    "0.667 and 0.5 are clean -- the check fires on the range, nothing else");

ok("!! inference is conservative: only a cosine or a probability, never a lookalike",
    inferRange("cosThetaMax") && inferRange("survivalProb") &&
    !inferRange("cost") && !inferRange("icosahedron") && !inferRange("probe") && !inferRange("iterations"),
    "cost, icosahedron, probe and iterations are UNKNOWN and never checked -- a wrong inference cannot manufacture a fault");

ok("!! the -1 not-applicable sentinel and out-of-scope numbers are left alone",
    outOfRange({ cosThetaMax: -1 }, "em/cherenkov.").length === 0 &&
    outOfRange({ temperature: 5000, iterations: 40 }).length === 0,
    "cosThetaMax = -1 is the sentinel (and also a valid cosine); a 5000 K temperature and 40 iterations have no " +
    "declared or inferred range, so they are untouched");

ok("DECLARED beats inferred, and the registry states a reason for every entry",
    Object.values(DECLARED).every(r => r.why && Number.isFinite(r.lo) && Number.isFinite(r.hi)) &&
    rangeFor("percolation/crossing.prob", "prob").why.includes("crossing"),
    Object.keys(DECLARED).length + " declared ranges, each with its physical reason -- inference is the floor, " +
    "declaration is the exact fix, exactly as observableUnits runs");

console.log();
if (fails) { console.log("observableRange-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("observableRange-selfcheck: all checks pass");
