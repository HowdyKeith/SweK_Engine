// WebGLEngine/tools/ship/treeRead.mjs -- v4548
//
// *** THE TREE'S TWO STALE-RECORD DETECTORS WERE OUTSIDE THE SHIP-TIME SWEEP, AND THE REASON WAS NOT THAT
// THEIR WORK IS EXPENSIVE. IT IS THAT THEY READ THE SAME 55 MB FOUR TO SIX TIMES OVER. ***
//
// Measured before this file existed, by wrapping fs.readFileSync and fs.readdirSync and counting, against a
// tree of 4,025 source files in about 670 directories:
//
//     tools/ship/recordDrift-selfcheck.mjs     23,429 readFileSync   12,397 readdirSync   2,463 ms
//     tools/ship/frozenRecords-selfcheck.mjs   16,769 readFileSync    1,348 readdirSync   3,183 ms
//     tools/ship/runtimeGap-selfcheck.mjs       4,032 readFileSync      674 readdirSync   1,778 ms
//     tools/ship/assertionShape-selfcheck.mjs   3,204 readFileSync    1,005 readdirSync     392 ms
//
// recordDrift reads every file in the tree SIX times and walks every directory EIGHTEEN times. And the work
// underneath is cheap: calling its checks() once, in isolation, is 606 ms of which 213 is the single walk.
// The gate costs four times its own subject because six independent censuses each re-derive the same read.
//
// *** WHAT THAT COST, CONCRETELY. *** The ship-time sweep runs gates under a 3,000 ms budget and skips the
// rest, so at 3,446 ms and 3,026 ms those two gates never ran at ship time -- and BUDGET_DRIFT_V4536 was
// added to the tree at commit 4817a29b without its census being re-taken, after which NINE ROUNDS SHIPPED
// ALL GREEN over a record that was wrong. It was found by hand at v4547. The tree's only two detectors for
// exactly that failure were the two the ritual could not afford to run.
//
// ---- WHY A CACHE AND NOT A BIGGER BUDGET -----------------------------------------------------------------
//
// Raising the budget hides the ratio instead of fixing it: the work would still be six reads for one read's
// worth of information, and the next census added to recordDrift would push it back out. The walk is O(tree)
// and the tree grows every round, so the only durable shape is ONE read per process.
//
// This module owns that read. It is memoised per root, the directory walk shared unconditionally and each
// file's text read once on first touch (see lazyEntry -- writing it eagerly made one consumer WORSE, and the
// probe caught it). It COUNTS ITSELF: `stats()` reports walks, cache hits and texts actually read, so the
// claim "one walk, not six" is a number a gate can assert rather than a stopwatch reading that drifts with
// the weather on the box.
//
// *** AND THE FIRST NUMBER THIS MODULE PRODUCED CORRECTED THE PREMISE ABOVE. *** The walk of 4,026 files is
// 42 ms. Eighteen of them is 750 ms -- real, and nowhere near the 2.5 to 3.5 seconds these gates cost. The
// repeated I/O was worth having back and it is NOT the headline; what the reads were feeding is.
//
// ---- THE THREE RULES THIS REPLACES, AND WHY REPLACING THEM WAS SAFE ----------------------------------------
//
// Three walkers existed, with three different skip rules:
//
//     frozenRecords.sources()      /node_modules|[\\/]vendor[\\/]|[\\/]dist[\\/]/    paths, .mjs/.js
//     recordDrift.sources()        /node_modules|\/vendor\/|\/dist\//                {path,text}, .mjs/.js
//     assertionShape.gateFiles()   a Set of names, plus every dot-directory          -selfcheck.mjs only
//
// and recordDrift.mjs's own header claims it exists so there is "one definition and no second walker
// re-deriving the pattern", which was true of runtimeGap and false of the tree. MEASURED BEFORE UNIFYING:
// the first two return the SAME 4,025 files, zero either way, and gateFiles' 1,602 are all inside them. So
// the two regexes agree today -- but they agree by coincidence of two authors, not by construction, and
// SKIP_AGREE below keeps both so the gate can go on asserting it rather than this note claiming it once.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The unified rule. Written with [\\/] so it means the same thing on a Windows path as on a posix one. */
export const SKIP = /node_modules|[\\/]vendor[\\/]|[\\/]dist[\\/]/;

/**
 * The two rules this module replaced, kept side by side so tools/ship/treeRead-selfcheck.mjs can walk with
 * each and assert they still select the same files. A unification is only safe while that holds, and "it
 * held on the day it was written" is not a check.
 */
export const SKIP_AGREE = Object.freeze({
    frozenRecords: /node_modules|[\\/]vendor[\\/]|[\\/]dist[\\/]/,
    recordDrift: /node_modules|\/vendor\/|\/dist\//,
});

export const SOURCE_EXT = /\.(mjs|js)$/;

const _cache = new Map();          // root -> {files, walkMs, bytes}
let _walks = 0, _hits = 0, _reads = 0;

/** Counters, so "one walk, not six" is a measurement. Reset by clear(). */
export function stats() { return { walks: _walks, hits: _hits, reads: _reads, roots: _cache.size }; }

/** Drop the memo. Exists for the gate, which must be able to make a cold read on purpose. */
export function clear() { _cache.clear(); _byPath.clear(); _walks = 0; _hits = 0; _reads = 0; }

function walk(dir, out, skip) {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
        const p = path.join(dir, e.name);
        if (skip.test(p)) continue;
        if (e.isDirectory()) walk(p, out, skip);
        else if (SOURCE_EXT.test(e.name)) out.push(p);
    }
    return out;
}

/**
 * Every .mjs and .js in the tree, each with its text, read ONCE per process.
 *
 * The array and the objects in it are shared with every caller, which is the point -- and is also why
 * nothing here may mutate them. Consumers filter and read; none of the four censuses this serves writes.
 *
 * @param {string} root
 * @param {RegExp} [skip] a different rule, for the gate that compares rules. Passing one BYPASSES the memo,
 *                        because a cache keyed only by root would hand back the wrong population.
 */
// *** THE TEXT IS LAZY, AND THE FIRST DRAFT'S WAS NOT -- WHICH MADE ONE CONSUMER WORSE. *** Reading all
// 4,026 files eagerly is right for the two censuses that want the whole tree and WRONG for
// assertionShape-selfcheck, which wants the 1,602 gates and nothing else: eager reading took it from 3,204
// reads to 4,026 and from 392 ms to 569. Measured, not predicted -- it was written eager, and the probe that
// was supposed to confirm the win showed a loss on the third row. A per-file getter that reads once on first
// touch serves both: the whole-tree consumers pay 4,026 reads exactly once between them, and a consumer that
// touches a subset pays for the subset. The WALK is what everybody shares unconditionally, and it was the
// more lopsided cost anyway -- recordDrift walked 670 directories eighteen times over.
function lazyEntry(p) {
    let t = null;
    return { path: p, get text() { if (t === null) { t = fs.readFileSync(p, "utf8"); _reads++; } return t; } };
}

export function treeFiles(root = ENG, skip = null) {
    if (skip) return walk(root, [], skip).map(lazyEntry);
    const hit = _cache.get(root);
    if (hit) { _hits++; return hit.files; }
    const t0 = Date.now();
    const files = walk(root, [], SKIP).map(lazyEntry);
    _walks++;
    _cache.set(root, { files, walkMs: Date.now() - t0 });
    return files;
}

/** Just the paths, for the consumers that never wanted the text. Same array identity per root. */
export function treePaths(root = ENG) { return treeFiles(root).map((f) => f.path); }

/** The text of one file if the walk already has it, else read it. Keeps a one-off lookup off the disk. */
const _byPath = new Map();     // root -> Map(path -> entry), built once so textOf is not a linear scan
export function textOf(p, root = ENG) {
    let idx = _byPath.get(root);
    if (!idx || idx.size !== treeFiles(root).length) {
        idx = new Map(treeFiles(root).map((f) => [f.path, f]));
        _byPath.set(root, idx);
    }
    const hit = idx.get(p);
    return hit ? hit.text : fs.readFileSync(p, "utf8");
}

/** What the last walk of `root` cost, for a gate that wants to report it rather than guess. */
export function walkCost(root = ENG) {
    const c = _cache.get(root);
    return c ? { files: c.files.length, walkMs: c.walkMs } : null;
}

export function reportLines() {
    const c = walkCost() || (treeFiles(), walkCost());
    const s = stats();
    return [
        "[treeRead] one cached read of the source tree, shared by every census that walks it",
        `  ${c.files} files, walked in ${c.walkMs} ms; ${s.reads} text(s) read on demand`,
        `  ${s.walks} walk(s), ${s.hits} cache hit(s) this process`,
        "  before this file: recordDrift read the tree 6x and walked it 18x, at 2,463 ms for 606 ms of work",
    ];
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href)
    for (const l of reportLines()) console.log(l);
