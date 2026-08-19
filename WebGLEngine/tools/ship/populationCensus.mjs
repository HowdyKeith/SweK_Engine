// WebGLEngine/tools/ship/populationCensus.mjs — v3553
// ---------------------------------------------------------------------------------------------------------------
// THE POPULATION, RECORDED RATHER THAN TYPED — because the typed version went red twice and nobody noticed either
// time.
//
// gateReach-selfcheck has carried a hand-typed pin on the number of physics modules, so that the population could
// not change silently. It works. What it cannot do is get itself updated:
//
//     v3406 -- arrived RED at 338 against a pin of 328. Ten modules, unexplained, red for an unknown number of
//              versions before anybody ran the gate and read the output.
//     v3551 -- arrived RED at 383 against a pin of 351. THIRTY-TWO modules.
//
// v3410 improved the MESSAGE so it names the command and asks for a reason. v3528 single-sourced the number so it
// could not report a stale expectation. *** NEITHER TOUCHED THE DYNAMIC. *** Both changes made an ignored signal
// better worded, and it stayed ignored, because the mechanism still required a human to notice between rounds.
//
// SO THE FIX IS TO STOP ASKING A HUMAN TO REMEMBER A NUMBER. The census is WRITTEN AT SHIP TIME, the way
// knowledge-index.json already is, and the gate compares the tree against the record instead of against
// somebody's memory. The number then moves with the tree by construction.
//
// *** AND THE POINT IS NOT THAT IT STOPS FAILING -- IT IS THAT IT FAILS FOR A BETTER REASON. *** A pin that goes
// red on every addition trains you to raise it; a census that records every addition can distinguish:
//
//     EXPECTED     -- the count moved and the per-area breakdown moved with it, consistently.
//     UNEXPLAINED  -- the total moved and no area accounts for it, or an area lost modules nobody mentioned.
//                     THIS is what should stop a ship, and the old pin could not tell it from routine growth.
//
// A LOSS IS TREATED HARDER THAN A GAIN, deliberately. Adding physics is normal; physics QUIETLY DISAPPEARING is
// how a deletion ships unnoticed, and the old pin fired identically for both.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { physicsModules, PHYSICS_ROOTS } from "./gateReach.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CENSUS_FILE = "tools/ship/population-census.json";

/**
 * Area = the DIRECTORY a module sits in. The first attempt took the first two path segments, which turns every
 * file sitting directly in physics/ into its own "area" -- it reported 236 areas for 383 modules, a breakdown
 * with no grouping power at all. The directory is what this tree groups by everywhere else.
 */
export const areaOf = (p) => {
    const parts = p.split("/");
    return parts.length <= 2 ? parts[0] : parts.slice(0, parts.length - 1).join("/");
};

/** Take a census of the tree as it stands. */
export function census(roots = PHYSICS_ROOTS) {
    const mods = physicsModules(roots).slice().sort();
    const areas = {};
    for (const m of mods) areas[areaOf(m)] = (areas[areaOf(m)] || 0) + 1;
    return { roots: roots.join(","), total: mods.length, areas, modules: mods };
}

export function readCensus() {
    try { return JSON.parse(fs.readFileSync(path.join(ENG, CENSUS_FILE), "utf8")); } catch { return null; }
}

/** Write the census. This is a SHIP STEP, not something a gate does for you -- see the note on self-healing. */
export function writeCensus(roots = PHYSICS_ROOTS) {
    const c = census(roots);
    const payload = { generatedFrom: "tools/ship/populationCensus.mjs", roots: c.roots,
                      total: c.total, areas: c.areas, modules: c.modules };
    fs.writeFileSync(path.join(ENG, CENSUS_FILE), JSON.stringify(payload, null, 1) + "\n");
    return payload;
}

/**
 * Compare the tree against the record. The verdict distinguishes routine growth from the thing worth stopping a
 * ship over.
 *
 * *** THE GATE DOES NOT REWRITE THE CENSUS. *** A check that repairs its own expectation can never fail twice,
 * which is the "control that cannot fail" this lab has caught four times. Writing is a ship step; comparing is
 * the gate; and the two are deliberately different programs.
 */
export function compare(roots = PHYSICS_ROOTS) {
    const now = census(roots);
    const rec = readCensus();
    if (!rec) {
        return { verdict: "NO-RECORD", now, added: [], removed: [], areaDelta: {},
                 why: "no census on disk. NOT a pass and NOT a failure of the tree -- the record has never been " +
                      "taken. Run `node tools/ship/populationCensus.mjs --write` once, and every later run compares against it." };
    }
    const before = new Set(rec.modules || []);
    const after = new Set(now.modules);
    const added = now.modules.filter((m) => !before.has(m));
    const removed = (rec.modules || []).filter((m) => !after.has(m));
    const areaDelta = {};
    for (const a of new Set([...Object.keys(rec.areas || {}), ...Object.keys(now.areas)])) {
        const d = (now.areas[a] || 0) - ((rec.areas || {})[a] || 0);
        if (d !== 0) areaDelta[a] = d;
    }
    // every change must be attributable to a named module; the totals must reconcile exactly
    const reconciles = (rec.total + added.length - removed.length) === now.total;
    const verdict = removed.length ? "REMOVALS"
        : !reconciles ? "UNEXPLAINED"
        : added.length ? "GREW" : "UNCHANGED";
    return {
        verdict, now, record: rec, added, removed, areaDelta, reconciles,
        why: verdict === "REMOVALS"
                ? `${removed.length} module(s) NO LONGER PRESENT: ${removed.slice(0, 6).join(", ")}${removed.length > 6 ? " …" : ""}. A loss is treated harder than a gain: adding physics is routine, physics quietly disappearing is how a deletion ships unnoticed.`
             : verdict === "UNEXPLAINED"
                ? `the totals do not reconcile: ${rec.total} recorded, ${added.length} added, ${removed.length} removed, ${now.total} found. Something changed that the module list cannot account for.`
             : verdict === "GREW"
                ? `${added.length} module(s) added, every one named, totals reconcile exactly: ${Object.entries(areaDelta).map(([a, d]) => a + " " + (d > 0 ? "+" : "") + d).join(", ")}`
                : "identical to the record, module for module",
    };
}

export function lines(c = compare()) {
    const out = [`population census: ${c.verdict} — ${c.why}`];
    if (c.record) out.push(`  recorded ${c.record.total}, tree has ${c.now.total}`);
    if (c.added && c.added.length) out.push(`  added:   ${c.added.slice(0, 8).join(", ")}${c.added.length > 8 ? ` … (${c.added.length})` : ""}`);
    if (c.removed && c.removed.length) out.push(`  REMOVED: ${c.removed.join(", ")}`);
    return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    if (process.argv.includes("--write")) {
        const p = writeCensus();
        console.log(`[census] recorded ${p.total} modules across ${Object.keys(p.areas).length} areas -> ${CENSUS_FILE}`);
    }
    for (const l of lines()) console.log(l);
}
