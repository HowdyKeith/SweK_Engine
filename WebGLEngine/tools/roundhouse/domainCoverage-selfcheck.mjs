// tools/roundhouse/domainCoverage-selfcheck.mjs
//
// v3545 -- THE DOMAIN-INTEGRITY TRIO WATCHES ITSELF. errorSign (>= 0), observableRange ([lo, hi]) and
// observableFinite (a real number) each reach a different set of observables; the guarantee that NOTHING slips
// through all three rests on finite being UNIVERSAL over numerics -- the floor beneath the two narrow checks. This
// meta-gate proves that floor holds, comprehensively over the frozen baseline and live over a sample, and then
// narrows finite on purpose to show that the moment it stops being universal a plain measurement goes uncovered,
// so the invariant is load-bearing rather than decorative.

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { census, classify, reachesFinite, reachesSign, reachesRange } from "./domainCoverage.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. COMPREHENSIVE CENSUS over the frozen baseline ---------------------------------------------------------
const base = JSON.parse(fs.readFileSync(path.join(HERE, "lab-results-baseline.json"), "utf8"));
let c = { numeric: 0, finite: 0, sign: 0, range: 0, uncovered: [], finiteGap: [], nonNumeric: 0 };
for (const [n, r] of Object.entries(base.devices || {})) c = census(r.outputs, n + "/" + (r.mode || "-") + ".", c);
for (const [k, r] of Object.entries(base.pairs || {})) c = census(r.outputs, k + ".", c);

ok("!! *** every numeric observable in the baseline is reached by at least one domain check ***",
    c.uncovered.length === 0,
    c.uncovered.length ? "UNCOVERED: " + c.uncovered.slice(0, 6).join(", ") :
    c.numeric + " numeric observables, all reached -- " + c.finite + " by finite, " + c.sign + " by sign, " +
    c.range + " by range; nothing ungated by all three");

ok("!! FINITE is the universal floor: it reaches every numeric observable",
    c.finite === c.numeric,
    "finite reaches " + c.finite + " of " + c.numeric + " -- sign and range are narrow by design, so this " +
    "equality is what guarantees no observable slips through; if finite ever grew a filter this would go red");

ok("!! finite is UNDER sign and range: anything a narrow check reaches, finite reaches too",
    c.finiteGap.length === 0,
    c.finiteGap.length ? "FLOOR HOLE: " + c.finiteGap.slice(0, 6).join(", ") :
    "no observable is reached by sign or range but missed by finite -- the floor is genuinely beneath them, not a " +
    "parallel track with its own gaps");

// ---- 2. LIVE, correct AND planted -----------------------------------------------------------------------------
const D = await import(pathToFileURL(path.join(HERE, "devices.mjs")).href);
const SPOT = ["astroparticle", "xpbd", "csg", "bonefield", "nuclear", "em", "percolation", "kepler", "quantum", "kerr"]
             .filter(n => D.DEVICE_NAMES.includes(n));
let lc = { numeric: 0, finite: 0, sign: 0, range: 0, uncovered: [], finiteGap: [], nonNumeric: 0 };
for (const n of SPOT) {
    let dev; try { dev = await D.getDevice(n); } catch { continue; }
    const modes = (Array.isArray(dev.modes) && dev.modes.length) ? dev.modes : [null];
    for (const m of modes) for (const cfg of [{}, { planted: true }]) {
        let o; try { o = dev.build(m ? { mode: m, config: cfg } : { config: cfg }); } catch { continue; }
        lc = census(o, `${n}/${m || "-"} (${cfg.planted ? "planted" : "ok"}).`, lc);
    }
}
ok("!! the live cross-section, correct and planted, is fully covered with finite as the floor",
    lc.uncovered.length === 0 && lc.finite === lc.numeric && lc.finiteGap.length === 0,
    lc.numeric + " live numeric observations, all finite-covered (" + lc.sign + " also sign, " + lc.range +
    " also range); no plant pushes an observable outside every check");

// ---- 3. THE INVARIANT IS LOAD-BEARING: narrow finite and a plain measurement goes uncovered -------------------
// A plausible future regression: give finite a name filter, the way errorSign has one. Model it as "finite only
// reaches err-named numerics" and re-run the census logic on a bag with a plain measurement beside an error.
const narrowedFinite = (k, v) => typeof v === "number" && /err/i.test(k);
function censusWith(reachFinite, outputs, prefix = "") {
    let n = { uncovered: [], finiteGap: [] };
    for (const [k, v] of Object.entries(outputs)) {
        if (typeof v !== "number") continue;
        const finite = reachFinite(k, v), sign = reachesSign(k, v), range = reachesRange(k, v, prefix);
        if (!finite && !sign && !range) n.uncovered.push(prefix + k);
        if ((sign || range) && !finite) n.finiteGap.push(prefix + k);
    }
    return n;
}
const bag = { closureErr: 0, temperature: 5000 };   // an error (sign-covered) and a plain measurement (finite-only)
const healthy = censusWith(reachesFinite, bag);
const regressed = censusWith(narrowedFinite, bag);

ok("!! with the real (universal) finite, both observables are covered",
    healthy.uncovered.length === 0,
    "closureErr is reached by sign and finite; temperature is a plain number reached only by finite -- and that is enough");

ok("!! *** narrow finite by name and the plain measurement falls to ZERO coverage -- caught ***",
    regressed.uncovered.length === 1 && regressed.uncovered[0].endsWith("temperature"),
    "the moment finite filters on a name, `temperature` is reached by no check at all: sign and range are narrow, " +
    "and finite -- the only thing that was covering it -- has dropped it. This is the regression the gate forbids");

ok("!! classify agrees with the three gate predicates it is built from",
    (() => { const z = classify("coneErr", -0.3, "xpbd/grains."); return z.finite && z.sign && !z.range && z.depth === 2; })() &&
    (() => { const z = classify("cosThetaMax", 1.3, "em/cherenkov."); return z.finite && !z.sign && z.range && z.depth === 2; })() &&
    (() => { const z = classify("temperature", 5000); return z.finite && !z.sign && !z.range && z.depth === 1; })(),
    "an error is depth-2 (finite+sign), a bounded cosine is depth-2 (finite+range), a plain number is depth-1 " +
    "(finite only) -- the census reads the real isErrorObservable and rangeFor, so it cannot drift from them");

console.log();
if (fails) { console.log("domainCoverage-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("domainCoverage-selfcheck: all checks pass");
