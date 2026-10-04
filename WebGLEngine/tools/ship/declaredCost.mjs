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
import { boxId } from "./hostScale.mjs";

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
export function census(root = ENG, timings = null, { exclude = null, id = boxId() } = {}) {
    const T = timings || JSON.parse(fs.readFileSync(path.join(root, "tools", "ship", "sweep-timings.json"), "utf8"));
    const rel = (f) => path.relative(root, f).split(path.sep).join("/");
    const gates = walkGates(root).map(rel).filter((g) => !exclude || !exclude(g));
    const declared = new Map(), missing = [];
    for (const g of gates) {
        let src = ""; try { src = fs.readFileSync(path.join(root, g), "utf8"); } catch { continue; }
        const d = declaredOf(src);
        if (d) declared.set(g, d); else missing.push(g);
    }
    // v4801 -- THE ALONE COST WHERE THE RECORD HAS ONE: the median of the last three serial readings (serialRing), as
    // sweepCoverage's returnee row judges since v4782. `timings[g]` is the newest reading, and from an 8-way sweep that is
    // ~2.4x the alone cost: once this box's verify rewrote the record at every run (v4800), gates near the 2x line flipped
    // with whichever kind landed last -- 144 rotted on one pass, 136 on the next, against a frozen 138.
    // v4804 -- and THIS BOX'S OWN alone readings first, where it has two (boxTimings.recordLocal's per-box ring), as recordReach's
    // margin row reads them since v4800: the shared ring is three readings deep and a sweep refreshes a gate's entry only when it
    // reaches it, so a gate's cost that changed this round (statedRuntime, 6,462 ms while it re-ran a stale candidate twice,
    // 1,600 alone once the record was put right) sits on the old median for sweeps. Only the default record: a caller that hands
    // in its own timings gets those alone. SABOTAGE (v4804): the per-box ring ignored -> 1 red, statedRuntime on its 6,462.
    // v4810 -- *** AND A SAME-TYPE BOX'S, BEFORE THE SHARED RECORD. *** Sessions here resume on two machines of one type (4 cores,
    // 16 GB) whose CPU models differ, so boxId gives them two ids and two per-box records. A box with no alone readings of a gate fell
    // straight to the shared ring -- SWEEP readings, eight gates to four cores -- and a header went red on a machine change, not on a
    // cost change: v4806's statedRuntime and cloneSource, put right then by timing them again on the new box. The other box's ALONE
    // readings are the better witness: same cores, same memory. Pooled with this box's own when it has one reading and not two; median taken.
    // A box of another type, and sweep-timings.local.json, are not witnesses. `from` names the record on each row.
    const ringFile = (f) => { try { return JSON.parse(fs.readFileSync(path.join(root, "tools", "ship", f), "utf8")).serialRing || {}; } catch { return {}; } };
    const own = timings ? {} : ringFile(`sweep-timings.${id}.json`);
    const type = id.replace(/-[0-9a-f]{6}$/, ""), siblings = (() => { if (timings || type === id) return [];
        const kin = new RegExp(`^sweep-timings\\.${type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-[0-9a-f]{6}\\.json$`);
        let names = []; try { names = fs.readdirSync(path.join(root, "tools", "ship")); } catch { return []; }
        return names.filter((f) => kin.test(f) && f !== `sweep-timings.${id}.json`).sort().map(ringFile); })();
    const good = (a) => (a || []).filter((n) => typeof n === "number" && n > 0);
    const ring = (g) => { const mine = good(own[g]); if (mine.length >= 2) return { r: mine, from: "this box" };
        const kin = mine.concat(siblings.flatMap((s) => good(s[g]))); if (kin.length >= 2) return { r: kin, from: "same-type boxes" };
        return { r: good((T.serialRing || {})[g]), from: "the shared record" }; };
    const from = new Map();
    const ms = (g) => { const { r, from: f } = ring(g), s = r.slice().sort((x, y) => x - y);
        if (s.length >= 2) { from.set(g, f); return s[(s.length - 1) >> 1]; }
        from.set(g, "the shared record's newest"); return T.timings && typeof T.timings[g] === "number" ? T.timings[g] : null; };
    const finished = (g) => !(T.finished && T.finished[g] === false);
    const agree = [], rotted = [], suppliesFloor = [], contradicts = [], noRecord = [];
    for (const [g, d] of declared) {
        const t = ms(g);
        if (t === null) { noRecord.push({ gate: g, declaredMs: d.ms }); continue; }
        const row = { gate: g, declaredMs: d.ms, recordedMs: t, ratio: t > 0 ? d.ms / t : Infinity, from: from.get(g) };
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
