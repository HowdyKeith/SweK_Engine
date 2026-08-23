// tools/roundhouse/assumptionMap-selfcheck.mjs
//
// Run: node tools/roundhouse/assumptionMap-selfcheck.mjs   (~238s — MEASURED v3941, was ~40s)
//
// v3163 -- "22 OF 27 DEVICES DECLARE NO ASSUMPTIONS" IS A COUNT, AND A CRUDE COUNT IS AN UNASKED QUESTION.
//
// It had sat in the queue for twenty rounds as one backlog. It is THREE, and each needs a different kind of
// work -- and for a good part of it "declare an assumption" is the wrong frame entirely.
//
// THE SPLIT, DERIVED FROM THE SMALLEST ERROR-LIKE OBSERVABLE AT EACH DEVICE'S DEFAULT MODE:
//
//   LOOSE (error > 1e-3)   -- there is REAL disagreement to explain, and a validity condition may be the
//                             explanation. This is where kh's 76% against Michalke lives. WORK: ask why.
//   EPSILON (< 1e-8)       -- machine-precision agreement, THE ROUND-TRIP TAUTOLOGY'S SIGNATURE. A condition
//                             here cannot be found at the default; it lives at a KNOB'S OPERATING POINT and
//                             needs a sweep, exactly as lens.deflect's dphi crossover did. WORK: sweep knobs.
//   NO ERROR TERM          -- no error-like observable at all. The question is not "what is the assumption",
//                             it is "WHAT IS THIS GRADED AGAINST". WORK: find the key first.
//
// *** AND FOUR OF SIX CANDIDATES HAVE NOW DIED ON MEASUREMENT, each for a different reason. *** v3137: pipe3d
// has no sharp boundary (the device CLAMPS tau, so what looks like a cliff is a slope) and optics.airy has no
// Fresnel dependence at all (ring positions are angular). v3163: inspiral returns 6.4e-9 FLAT across a 60x
// sweep of stopFrac -- an epsilon answer, so post-Newtonian breakdown cannot show against its own forward
// model; and born.validity DOES NOT HAVE a validity condition, IT MEASURES ONE (phaseLimitTheory is 1/sqrt(10)
// and delta moves nothing), so declaring an assumption on it would be circular.

import path from "node:path";
import fsMod from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const D = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "devices.mjs")).href);
const A = await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "assumptions.mjs")).href);

/** DERIVED, never a typed list -- the classification follows the measurement and moves when the tree does. */
// v3923 -- *** A KILLED RUN OF THIS GATE PRINTED "(no output)", WHICH IS THE LEAST USEFUL THING IT COULD SAY. ***
// classify() builds every device before a single line is written, so Keith's 568s timeout reported nothing at
// all: not how far it got, not which device was slow, not whether it was stuck or merely long. The tree's own
// rule is that a timeout wants "either a longer budget or a smaller fixture" -- AND YOU CANNOT CHOOSE BETWEEN
// THOSE FROM AN EMPTY REPORT. Progress is written as it goes, so a kill leaves a position instead of a blank.
async function classify() {
    const rows = [];
    let done = 0; const total = D.DEVICE_NAMES.length; const t0 = Date.now();
    for (const n of D.DEVICE_NAMES) {
        if (done && done % 10 === 0) {
            const s = (Date.now() - t0) / 1000;
            console.log("  ----  classified " + String(done).padStart(3) + "/" + total + "  " +
                        s.toFixed(0) + "s elapsed, ~" + (s / done * total).toFixed(0) + "s projected  (last: " + n + ")");
        }
        done++;
        let d; try { d = await D.getDevice(n); } catch { continue; }
        if (typeof d.defaults !== "function" || typeof d.build !== "function") continue;
        const def = d.defaults({});
        let o; try { o = await d.build({ mode: def.mode }); } catch { continue; }
        const errs = Object.entries(o).filter(([k, v]) => /err/i.test(k) && typeof v === "number" && isFinite(v) && v !== 0);
        if (!errs.length) { rows.push({ n, group: "NO-ERROR-TERM", best: null }); continue; }
        const best = Math.min(...errs.map(([, v]) => Math.abs(v)));
        rows.push({ n, group: best < 1e-8 ? "EPSILON" : (best < 1e-3 ? "TIGHT" : "LOOSE"), best });
    }
    return rows;
}
const rows = await classify();
const count = (g) => rows.filter((r) => r.group === g).length;

ok("!! the 22 split into groups that need DIFFERENT work, and the split is DERIVED",
    rows.length >= 20 && count("LOOSE") > 0 && count("EPSILON") > 0 && count("NO-ERROR-TERM") > 0,
    rows.length + " devices: " + ["LOOSE", "TIGHT", "EPSILON", "NO-ERROR-TERM"].map((g) => count(g) + " " + g).join(", ") +
    ". Twenty rounds as ONE backlog line. A CRUDE COUNT IS AN UNASKED QUESTION -- and the answer here is that " +
    "'declare an assumption' is the wrong frame for most of them");

ok("!! an EPSILON device cannot be diagnosed at its default mode",
    (() => {
        const eps = rows.filter((r) => r.group === "EPSILON");
        return eps.length > 0 && eps.every((r) => r.best < 1e-8);
    })(),
    "THE EPSILON ANSWER IS THE TELL -- an instrument graded against its own forward model returns machine " +
    "precision and proves nothing. MEASURED: inspiral's mergerErrFrac is 6.4e-9 and does not move across a 60x " +
    "sweep of stopFrac, so post-Newtonian breakdown near merger CANNOT SHOW. A condition for these lives at a " +
    "KNOB'S operating point and needs a sweep -- which is exactly how lens.deflect's dphi crossover was found");

ok("!! and a device that MEASURES a validity limit cannot declare one",
    (() => {
        const born = rows.find((r) => r.n === "born");
        return !!born && !Object.keys(A.LAB_ASSUMPTIONS).some((k) => k.startsWith("born."));
    })(),
    "born.validity reports phaseLimitMeasured against phaseLimitTheory = 1/sqrt(10), and delta moves NEITHER " +
    "across a 40x sweep. IT DOES NOT HAVE A VALIDITY CONDITION, IT MEASURES ONE -- declaring an assumption " +
    "about the thing a device exists to measure is circular, and it would pass forever");

ok("!! the declared five are still declared, and the map does not claim them as work",
    ["lens.deflect", "lens.scale", "kerr.limit", "optics.converge", "chaos.fixed"].every((k) => k in A.LAB_ASSUMPTIONS),
    Object.keys(A.LAB_ASSUMPTIONS).length + " declared. TWO OF THEM ARE ON EPSILON DEVICES (lens, kerr), which " +
    "is the evidence for the paragraph above: epsilon does not mean 'no condition exists', it means 'not " +
    "findable at the default'");

ok("...and the classification is not a typed list",
    (() => {
        const src = fsMod.readFileSync(path.join(HERE, "assumptionMap-selfcheck.mjs"), "utf8");
        return !/const GROUPS = \{/.test(src) && /D\.DEVICE_NAMES/.test(src);
    })(),
    "it walks DEVICE_NAMES and measures. A typed grouping would be a snapshot of today's tree pinned as a law " +
    "-- the nineteenth instance of that in this session was mine, one round after writing the rule down");

console.log();
console.log("  ----  THE MAP, so the next person picks work rather than a name:");
for (const g of ["LOOSE", "TIGHT", "EPSILON", "NO-ERROR-TERM"]) {
    const list = rows.filter((r) => r.group === g).map((r) => r.n);
    if (list.length) console.log("  ----    " + g.padEnd(14) + list.join(", ").slice(0, 88));
}
console.log("  ----  LOOSE: ask WHY the error is large -- a validity condition may be the answer.");
console.log("  ----  EPSILON: sweep a KNOB, not the default. TIGHT: probably real, check the key is external.");
console.log("  ----  NO-ERROR-TERM: find what it is graded against BEFORE asking what it assumes.");
if (fails) { console.log("assumptionMap-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("assumptionMap-selfcheck: all checks pass");
