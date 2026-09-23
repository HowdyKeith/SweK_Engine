// tools/ship/declaredCost.mjs -- EVERY GATE THAT COSTS ANYTHING WRITES ITS COST AT THE TOP OF ITSELF, AND
// NOTHING IN THE SHIP HAS EVER READ ONE.
//
// v4666. 271 gates in this tree open with a line of this shape, and many carry the round that measured it:
//
//     // Run: node tools/roundhouse/khConvergence-selfcheck.mjs   (~616s)
//     // Run: node tools/roundhouse/assumptionMap-selfcheck.mjs   (~238s - MEASURED v3941, was ~40s)
//
// tools/ship/sweep-timings.json, budgetExile and sweepCoverage all derive cost by RUNNING the gate, so a gate
// that has never finished has no number at all -- and 26 of them have none, at any cap anybody has tried.
// Their own headers say what they cost. Found while profiling the sixteen roundhouse gates that produce no
// verdict at 180 s: the profile said they are simulations rather than slow instruments, and khConvergence's
// header said 616 seconds on line three, where it had been sitting unread.
//
// *** THE TWO WAYS A DECLARATION AND A RECORD CAN DISAGREE ARE DIFFERENT FACTS AND A CENSUS THAT REPORTED ONE
// NUMBER FOR BOTH WOULD BE USELESS. *** The record itself says which case applies -- `finished` and `kinds`
// have been in that file since v4579 -- so this needs no heuristic:
//
//   the reading is CAPPED (finished:false)   the recorded ms is a LOWER BOUND, not a measurement. A larger
//                                            declared cost is the header SUPPLYING what the record cannot,
//                                            and is the only number that gate has. khConvergence: declared
//                                            616,000 against a recorded 90,028 that is a kill.
//   the reading FINISHED                     both are measurements and a wide ratio is PROSE THAT HAS ROTTED.
//                                            releaseLedger: declared 40 ms, recorded 1,118, 28x.
//   capped AND declared <= recorded          a CONTRADICTION: the header claims the gate finishes inside a
//                                            cap it demonstrably died at. Rare and worth a name.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The header line, and it is deliberately anchored at the start of a COMMENT LINE rather than found anywhere.
 *
 * *** THE UNIT IS PART OF THE MATCH, NOT A SUFFIX GUESSED AFTERWARDS. *** "~0.2s" and "~200ms" are both in the
 * tree and differ by a thousand; a regex that captured the number and assumed seconds would read the second as
 * eighty hours. "m" is accepted because a handful write minutes.
 */
export const DECLARED_RE = /^\/\/\s*Run:\s*node\s+(\S+)[^(\n]*\(\s*~\s*([0-9.]+)\s*(ms|s|m)\b/mi;

/** Only the first 4 KB is read: the line is by convention the third, and scanning a 40 KB gate for it is a
 *  cost this file exists to be careful about. */
const HEAD_BYTES = 4000;

export function declaredOf(src) {
    const m = DECLARED_RE.exec(src.slice(0, HEAD_BYTES));
    if (!m) return null;
    const n = Number(m[2]);
    if (!Number.isFinite(n) || n < 0) return null;
    const ms = m[3] === "ms" ? n : m[3] === "m" ? n * 60000 : n * 1000;
    return { ms, number: n, unit: m[3], names: m[1] };
}

export function walkGates(root = ENG) {
    const out = [];
    (function w(d) {
        let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of es) {
            if (e.name === "node_modules" || e.name.startsWith(".") || e.name === "vendor") continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) w(p);
            else if (/-selfcheck\.mjs$/.test(e.name)) out.push(p);
        }
    })(root);
    return out.sort();
}

/**
 * Join the declarations to the recorded timings and split the disagreements by the record's OWN account of
 * itself. `exclude` takes a predicate on the relative path, which the gate uses to keep itself out of a
 * population it is counting -- this file's own gate carries a Run: line like every other.
 */
export function census(root = ENG, timings = null, { exclude = null } = {}) {
    const T = timings || JSON.parse(fs.readFileSync(path.join(root, "tools", "ship", "sweep-timings.json"), "utf8"));
    const rel = (f) => path.relative(root, f).split(path.sep).join("/");
    const gates = walkGates(root).map(rel).filter((g) => !exclude || !exclude(g));
    const declared = new Map(), missing = [];
    for (const g of gates) {
        let src = ""; try { src = fs.readFileSync(path.join(root, g), "utf8"); } catch { continue; }
        const d = declaredOf(src);
        if (d) declared.set(g, d); else missing.push(g);
    }
    const ms = (g) => T.timings && typeof T.timings[g] === "number" ? T.timings[g] : null;
    const finished = (g) => !(T.finished && T.finished[g] === false);
    const agree = [], rotted = [], suppliesFloor = [], contradicts = [], noRecord = [];
    for (const [g, d] of declared) {
        const t = ms(g);
        if (t === null) { noRecord.push({ gate: g, declaredMs: d.ms }); continue; }
        const row = { gate: g, declaredMs: d.ms, recordedMs: t, ratio: t > 0 ? d.ms / t : Infinity };
        if (!finished(g)) {
            // A capped reading is a FLOOR. The header is the only measurement of this gate that exists.
            if (d.ms > t) suppliesFloor.push(row); else contradicts.push(row);
        } else if (d.ms > 0 && (t / d.ms > 2 || d.ms / t > 2)) rotted.push(row);
        else agree.push(row);
    }
    const bySize = (a, b) => b.ratio - a.ratio;
    return {
        gates: gates.length, declaring: declared.size, missing: missing.length,
        agree: agree.length,
        rotted: Object.freeze(rotted.sort((a, b) => Math.max(b.ratio, 1 / b.ratio) - Math.max(a.ratio, 1 / a.ratio))),
        suppliesFloor: Object.freeze(suppliesFloor.sort(bySize)),
        contradicts: Object.freeze(contradicts.sort(bySize)),
        noRecord: Object.freeze(noRecord),
    };
}

/**
 * *** THE ONLY CHEAP NUMBER A NEVER-FINISHED GATE HAS. *** budgetExile and sweepCoverage both ask "how long
 * does this take" and both answer by running it; for a gate that has never finished at any cap, the honest
 * answer today is null and the useful one is its own header. Returned WITH its source, because a declared
 * cost is prose and a recorded one is a reading, and a caller that cannot tell them apart would be doing what
 * this round found: treating a cap kill as a measurement.
 */
export function costOf(gateRel, root = ENG, timings = null) {
    const T = timings || JSON.parse(fs.readFileSync(path.join(root, "tools", "ship", "sweep-timings.json"), "utf8"));
    const t = T.timings && typeof T.timings[gateRel] === "number" ? T.timings[gateRel] : null;
    const done = !(T.finished && T.finished[gateRel] === false);
    if (t !== null && done) return { ms: t, from: "recorded", floor: false };
    let d = null;
    try { d = declaredOf(fs.readFileSync(path.join(root, gateRel), "utf8")); } catch {}
    if (d && (t === null || d.ms > t)) return { ms: d.ms, from: "declared", floor: false };
    if (t !== null) return { ms: t, from: "cap", floor: true };
    return { ms: null, from: "none", floor: false };
}
