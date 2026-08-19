// tools/roundhouse/conservationReach.mjs
//
// v3525 -- WHAT A FIFTH CRITERION WOULD COST, DERIVED INSTEAD OF REMEMBERED.
//
// v3132 left a standing warning: a new criterion is a BATTERY CHANGE EVERY DEVICE MUST SURVIVE, and several
// would not on first contact. That sentence has ordered the round list for hundreds of versions and NOBODY HAD
// EVER PUT A NUMBER ON IT. "Several" is a memory, and this tree's own rule is that A NUMBER NOTHING DERIVES IS
// A MEMORY AND MEMORIES ARE WRONG BY 13.
//
// *** AND THE ANSWER IS NOT "SEVERAL WOULD FAIL". IT IS THAT **NOT ONE DEVICE CAN BE ASKED**. ***
//
// auditConservation (tools/roundhouse/conservation.mjs, landed v3448) takes a TIME SERIES and compares the
// worst excursion in the FIRST half of a run against the worst in the SECOND -- a symplectic integrator's
// error oscillates within an envelope, a dissipative one widens. It needs at least four samples. THE OTHER
// FOUR CRITERIA ALL WORK ON A SINGLE OBSERVABLE SWEPT OVER A KNOB; THIS ONE NEEDS A SERIES OUT OF ONE RUN, AND
// THE DEVICE INTERFACE HAS NO WAY TO RETURN ONE.
//
// Derived from the frozen baseline -- which can only be asked at all because v3520 taught it to keep arrays:
//   - 11 numeric series of length >= 4 exist, across 7 pairs, AND NOT ONE IS A CONSERVED QUANTITY. They are
//     sweeps and parameter lists: dispersionRatios, orderRatioSeq, predictedZ, raSweep, temps, tourPeriods.
//   - 78 conservation-SHAPED field names across 55 pairs and 30 devices -- energyDriftFrac, momentumErr,
//     massDrift, angularMomentumErr, closureErr, unitarityErr, normDrift -- AND EVERY ONE IS A SCALAR.
//
// *** SO CONSERVATION IS ALREADY BEING CHECKED IN THIRTY OF SEVENTY-FOUR DEVICES, AND EVERY ONE OF THEM
// COLLAPSES ITS OWN SERIES TO A SCALAR INSIDE THE BIND, BY HAND, BEFORE ANYTHING SHARED CAN SEE IT. ***
//
// THE LOAD-BEARING INSTANCE IS kepler/conserve, WHICH REPORTS energyErrFirstHalf, energyErrSecondHalf AND
// energyGrowthRatio = 1.0000000091. THAT IS auditConservation'S ALGORITHM EXACTLY -- first-half maximum against
// second-half maximum, ratio against a growth limit -- HAND-ROLLED IN A BIND, AND NO BIND IMPORTS THE SHARED
// MODULE. Two implementations of one algorithm with nothing comparing them, which is the shape this tree names
// more than any other, and this time the shared module (v3434) arrived AFTER the hand-rolled copy.
//
// THE CONSEQUENCE FOR THE ROUND ORDER, AND IT IS NOW A MEASUREMENT: adding conservation as criterion five is
// not a wiring job. It requires thirty devices to STOP COLLAPSING AND START EMITTING -- a change to what a
// device returns, across thirty binds, before the criterion could run once. THAT IS LARGER THAN v3132 FEARED,
// and it is why this report ships instead of the criterion.
//
// A REPORT, NOT A RULE: it PRINTS and EXITS ZERO. The candidate list is a CANDIDATE LIST and says so -- whether
// a quantity named "drift" is a conserved one is a PHYSICAL JUDGEMENT and it is Keith's. THE KEYWORD PROBE HAS
// MISLED THIS PROJECT THREE TIMES, so the name scan is reported apart from the two facts that are derived.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { codeOnly, noComments } from "../ship/sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.join(HERE, "lab-results-baseline.json");

// Conservation-shaped NAMES. This is a proposal, never a verdict -- see the header.
export const SHAPED = /(drift|conserv|momentum|residual|closure|energyErr|angMom|unitarity|norm)/i;
export const MIN_SAMPLES = 4;   // auditConservation's own floor, not a number chosen here

export function pairs() {
    try { return JSON.parse(fs.readFileSync(BASE, "utf8")).pairs || {}; } catch { return {}; }
}

/** Numeric series long enough for auditConservation. DERIVED -- the only exact half of this report. */
export function seriesReach(P = pairs()) {
    const out = [];
    for (const [key, row] of Object.entries(P)) {
        for (const [field, v] of Object.entries(row.outputs || {})) {
            if (Array.isArray(v) && v.length >= MIN_SAMPLES && v.every((x) => typeof x === "number" && isFinite(x))) {
                out.push({ key, field, samples: v.length });
            }
        }
    }
    return out;
}

/** Fields whose NAME suggests a conserved quantity. A CANDIDATE LIST. */
export function shapedCandidates(P = pairs()) {
    const out = [];
    for (const [key, row] of Object.entries(P)) {
        for (const field of Object.keys(row.outputs || {})) if (SHAPED.test(field)) out.push({ key, field });
    }
    return out;
}

/**
 * Binds that compute a first-half/second-half comparison themselves.
 *
 * *** v3526 -- THIS RAN OVER RAW SOURCE AT v3525 AND REPORTED **TWO**, AND ONE OF THEM WAS A COMMENT. ***
 * discoveryBind.mjs mentions `energyGrowthRatio` on line 6 while EXPLAINING that kepler's most interesting
 * observable is about the integrator rather than the orbit -- prose describing the very thing this function
 * hunts. THE REAL COUNT IS ONE. PROSE-AS-CODE, twenty-plus instances in this tree, committed inside the round
 * whose entire subject is second declarations, and my v3525 changelog says "I expected one instance and the
 * walk found two" -- CORRECTED HERE RATHER THAN LEFT STANDING. codeOnly() blanks comments AND string literals,
 * which is the idiom this tree already had for exactly this.
 */
export function handRolled() {
    const hits = [];
    let files = [];
    try { files = fs.readdirSync(HERE).filter((f) => /Bind\.mjs$/.test(f)); } catch { return hits; }
    for (const f of files) {
        let raw = "";
        try { raw = fs.readFileSync(path.join(HERE, f), "utf8"); } catch { continue; }
        const src = codeOnly(raw), txt = noComments(raw);
        const firstHalf = /FirstHalf|firstHalf/.test(src);
        const growth = /GrowthRatio|growthRatio/.test(src);
        // *** THE IMPORT CHECK RUNS OVER noComments AND NOT codeOnly, AND MY FIRST VERSION GOT THIS WRONG IN
        // THE SAME EDIT THAT FIXED THE COMMENT BUG: codeOnly BLANKS STRING LITERALS, AND AN IMPORT PATH IS A
        // STRING -- so it reported keplerBind as not importing the module one line after keplerBind imported
        // it. codeOnly FOR AN IDIOM, noComments FOR TEXT THE CODE CONTAINS. The tree records this pair and I
        // hit both halves of it inside one round. ***
        const imports = /from\s+["'][^"']*conservation[^"']*["']/.test(txt);
        if (firstHalf || growth) hits.push({ file: f, firstHalf, growth, importsSharedModule: imports });
    }
    return hits;
}

/**
 * Series the SHARED module actually audits -- the fact the keyword scan cannot supply.
 *
 * v3525 asserted that NOT ONE SERIES CARRIES A CONSERVATION-SHAPED NAME and wrote an antidote saying the line
 * should go red when a device emits a conserved series. v3526 emitted one -- kepler's `energySeries` -- AND THE
 * ANTIDOTE DID NOT FIRE, because SHAPED matches `energyErr` and not `energySeries`. A NAME SCAN COULD NOT SEE
 * THE EVENT IT WAS WATCHING FOR. So the honest signal is not the name at all: it is which binds PASS a series
 * to auditConservation, which is derived from code with the comments stripped.
 */
export function auditedSeries() {
    const out = [];
    let files = [];
    try { files = fs.readdirSync(HERE).filter((f) => /Bind\.mjs$/.test(f)); } catch { return out; }
    for (const f of files) {
        let raw = "";
        try { raw = fs.readFileSync(path.join(HERE, f), "utf8"); } catch { continue; }
        const src = codeOnly(raw), txt = noComments(raw);
        if (/from\s+["'][^"']*conservation[^"']*["']/.test(txt) && /auditConservation\s*\(/.test(src)) {
            out.push({ file: f, device: f.replace(/Bind\.mjs$/, "") });
        }
    }
    return out;
}

export function reach() {
    const P = pairs();
    const series = seriesReach(P);
    const shaped = shapedCandidates(P);
    const devicesShaped = [...new Set(shaped.map((s) => s.key.split("/")[0]))].sort();
    const devicesAll = [...new Set(Object.keys(P).map((k) => k.split("/")[0]))].sort();
    return {
        pairs: Object.keys(P).length,
        devices: devicesAll.length,
        series,
        seriesPairs: [...new Set(series.map((s) => s.key))].sort(),
        shaped,
        devicesShaped,
        handRolled: handRolled(),
        audited: auditedSeries(),
    };
}

export function reportLines() {
    const r = reach();
    const L = [];
    L.push("[conservationReach] what a fifth criterion would cost, derived from the frozen baseline");
    L.push("  corpus: " + r.pairs + " device-mode pairs, " + r.devices + " devices");
    L.push("  DERIVED -- numeric series of >= " + MIN_SAMPLES + " samples (what auditConservation can take): " +
           r.series.length + " fields across " + r.seriesPairs.length + " pairs");
    for (const s of r.series) L.push("      " + s.key + "." + s.field + " [" + s.samples + "]");
    L.push("  *** AND NOT ONE IS A CONSERVED QUANTITY -- they are sweeps and parameter lists. ***");
    L.push("  CANDIDATES (name scan, NOT a verdict): " + r.shaped.length + " fields across " +
           r.devicesShaped.length + " devices");
    L.push("      " + r.devicesShaped.join(", "));
    L.push("  every one of those is a SCALAR: the series was collapsed inside the bind before anything shared saw it");
    L.push("  HAND-ROLLED first/second-half comparisons in binds: " + r.handRolled.length);
    for (const h of r.handRolled) {
        L.push("      " + h.file + (h.importsSharedModule ? "  (imports the shared module)" :
               "  *** DOES NOT IMPORT conservation.mjs -- a second declaration of one algorithm ***"));
    }
    L.push("  SERIES AUDITED BY THE SHARED MODULE: " + r.audited.length +
           (r.audited.length ? " (" + r.audited.map((a) => a.device).join(", ") + ") -- was ZERO at v3525" : " -- NONE"));
    L.push("  CONSEQUENCE: criterion five is not a wiring job. " + r.devicesShaped.length +
           " devices would have to STOP COLLAPSING AND START EMITTING first.");
    return L;
}

// A REPORTING TOOL MUST PRINT AND EXIT ZERO; the gate beside it is what exits nonzero.
if (import.meta.url === `file://${process.argv[1]}`) { for (const l of reportLines()) console.log(l); process.exit(0); }
