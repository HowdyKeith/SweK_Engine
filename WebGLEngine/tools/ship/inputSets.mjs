// WebGLEngine/tools/ship/inputSets.mjs -- v4565
//
// *** THE SWEEP RE-ANSWERS ABOUT 1,150 QUESTIONS EVERY RUN AND A ROUND MOVES FIVE TO FIFTEEN FILES. ***
//
// v4548 measured where the sweep's 725 s of gate time goes and ruled out the obvious levers: only 161 of
// 1,604 gates touch the tree at all, the shared walk is 42 ms, and process startup across 1,141 spawns is
// 35 s -- 5%, real but not the prize. THE COST IS THE GATES DOING THEIR WORK, and the only way to make that
// cheaper is not to do it when nothing it depends on has moved.
//
// This module owns the record of what each gate reads (tools/ship/input-sets.json, written by
// tools/ship/recordInputs.mjs) and the decision of whether a gate may be skipped. The recording is
// tools/ship/inputProbe.mjs's job; the JUDGEMENT is here, because it is the part that can be wrong in the
// direction that matters.
//
// ---- THE RULE, AND WHY IT IS SHAPED TO REFUSE ------------------------------------------------------------
//
// A skipped gate that should have run is a SILENT FALSE GREEN. Every other failure in this tree announces
// itself; that one does not. So `skippable` answers yes only when ALL of these hold, and no when ANY of them
// is merely unknown:
//
//   * the gate has a recorded input set, and it is not empty
//   * the probe saw no child process, no socket and no fetch
//   * the gate does not take fs by NAMED import (the probe patches the builtin's exports object, and a named
//     binding captured at link time may not route through it -- see inputProbe.mjs)
//   * every recorded file still hashes to what it hashed at record time
//   * every recorded directory still lists the same entries
//   * the gate's own source is in its set, which it always is: node read it to run it
//
// The last one is not a formality. A gate whose set somehow excluded itself could be edited and skipped, so
// it is checked rather than assumed.
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RECORD = "tools/ship/input-sets.json";

// *** MEMOISED FOR THE SAME REASON THE RECORD IS INDEXED: THE SAME FILE IS ASKED ABOUT A HUNDRED TIMES. ***
// A decision pass over 1,253 gates touches 443,405 path references over 4,072 distinct files, and hashing a
// file is reading it. Un-memoised the pass was 8,377 ms -- 1.6% of the 525 s sweep it exists to shorten,
// which is affordable and still ninety-nine times more work than the question needs. `clearHashCache` is
// exported because a caller that MODIFIES the tree between two decisions (this module's own gate does) needs
// the second answer to be about the tree as it is.
const _fileHash = new Map(), _dirHash = new Map();
export function clearHashCache() { _fileHash.clear(); _dirHash.clear(); }

/** sha256 of a file's bytes, or null when it is gone. */
export function hashFile(rel, root = ENG) {
    const key = root + "\u0000" + rel;
    if (_fileHash.has(key)) return _fileHash.get(key);
    let h = null;
    try { h = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, rel))).digest("hex").slice(0, 16); } catch {}
    _fileHash.set(key, h);
    return h;
}

/** sha256 of a directory's sorted entry names, or null. A gate that lists a directory depends on the LIST. */
export function hashDir(rel, root = ENG) {
    const key = root + "\u0000" + rel;
    if (_dirHash.has(key)) return _dirHash.get(key);
    const h = _hashDir(rel, root);
    _dirHash.set(key, h);
    return h;
}
function _hashDir(rel, root) {
    try {
        const p = path.join(root, rel);
        const st = fs.statSync(p);
        if (!st.isDirectory()) return "f:" + (hashFile(rel, root) || "gone");
        return "d:" + crypto.createHash("sha256").update(fs.readdirSync(p).sort().join("\n")).digest("hex").slice(0, 16);
    } catch { return null; }
}

// ---- THE ON-DISK SHAPE, AND WHY IT IS INDEXED -----------------------------------------------------------
//
// *** THE FIRST DRAFT WROTE 42 MB AND TOOK 8.4 s TO ANSWER, AND BOTH NUMBERS HAVE THE SAME CAUSE. ***
// It stored, per gate, a list of paths and a {path: hash} map beside it. Across 1,253 gates that is 443,405
// path references over 4,072 DISTINCT files -- every path spelled out about a hundred times, every hash
// stored about a hundred times, and at decision time every file hashed about a hundred times. The tree walks
// this file cares about are shared: 272 gates read more than fifty files each and hold 99% of the bytes.
//
// So the record carries ONE table of paths and ONE hash per path, and each gate holds integer indices into
// it. A hash belongs to a FILE, not to a (gate, file) pair -- it was the same content for every gate that
// read it in the same pass -- so storing it per gate was storing the same fact a hundred times.
//
// The alternative considered and rejected was a size cap: refuse to record a set over N paths, on the
// grounds that a gate reading the whole tree is never skippable anyway. MEASURED, it is not true -- 160 of
// the 935 gates skippable on an unchanged tree have sets over fifty paths -- so a cap at fifty would have
// thrown away 17% of the mechanism's value to fix a problem that was really about redundancy.
export const FORMAT = 2;

// *** THE SENTINEL IS NOT null, AND THE GATE FOUND OUT WHY WITHIN A MINUTE OF THE GUARD BEING WRITTEN. ***
// The first version stored a conflicting path's hash as null "which no live hash equals". hashFile returns
// null for a file that does not exist, so null equals the live reading of any ABSENT path exactly -- and a
// conflicting entry whose file had since been deleted came back SKIPPABLE. The refusing value has to be one
// no live reading can produce at all: hashFile yields sixteen hex characters or null, hashDir yields "f:" or
// "d:" and sixteen more, and none of them is this.
export const CONFLICT = "!conflict";

// *** EVERY PER-GATE FIELD THAT IS NOT A PATH LIST, IN ONE PLACE, BECAUSE A FIELD-BY-FIELD SERIALISER DROPS
// THINGS SILENTLY AND THIS ONE ALREADY DID. *** v4567 renamed the spawn disqualifier `spawned` ->
// `spawnedNonNode` in the recorder and in the rule, and `encode` -- which spelled its fields out by hand --
// went on writing `spawned: !!e.spawned`, which was now always undefined. So the flag was dropped on write,
// `whyRun` read nothing, and EVERY SPAWNING GATE BECAME SKIPPABLE, including the ones that launch a browser
// or a compiler. The skip count jumped 956 -> 1,121 and looked like the round succeeding.
//
// That is the same shape as the round before it, where tslRace-selfcheck's first section rewrote a record
// wholesale and quietly deleted the keys its later sections owned. A serialiser that names its fields is a
// list that has to be maintained in step with three other files; this is that list, named once, and
// inputSets-selfcheck asserts that a round trip preserves everything entryFor produces.
// *** EVERY FIELD encode() CARRIES PER GATE, SPELLED ONCE. *** v4567 dropped a flag by writing the
// pre-rename name here and the skip count ROSE from 956 to 1,121, which read as the round succeeding.
// tools/ship/recordShape.mjs now ratchets the record's own key set for exactly that reason, and
// `reachesUnrecorded` was added to this list and to entryFor() in the same edit.
export const FLAGS = Object.freeze(["spawnedNonNode", "spawnedNode", "procs", "net", "namedFsImport",
                                   "reachesUnrecorded"]);

/** Decode the indexed on-disk form into the {gate: {reads, dirs, hashes, dirHashes, ...}} shape the rule wants. */
export function decode(raw) {
    if (!raw || !raw.paths) return raw || { note: "", at: null, gates: {} };
    const P = raw.paths, H = raw.hashes || [], D = raw.dirHashes || [];
    const gates = {};
    for (const [g, e] of Object.entries(raw.gates || {})) {
        const reads = (e.r || []).map((i) => P[i]), dirs = (e.d || []).map((i) => P[i]);
        const hashes = {}, dirHashes = {};
        for (const i of e.r || []) hashes[P[i]] = H[i];
        for (const i of e.d || []) dirHashes[P[i]] = D[i];
        gates[g] = { reads, dirs, hashes, dirHashes, probeMs: e.ms, exit: e.exit };
        for (const f of FLAGS) gates[g][f] = e[f];
    }
    return { note: raw.note, at: raw.at, probedMs: raw.probedMs, format: raw.format,
             conflicts: raw.conflicts || [], changedDuringPass: raw.changedDuringPass || [], gates };
}

/**
 * Build the indexed on-disk form from {gate: entry} in the decoded shape.
 *
 * *** THIS NOTE DESCRIBED A RACE THIS FUNCTION CANNOT SEE, AND THE SENTINEL IT JUSTIFIES WAS FIRING ON
 * SOMETHING ELSE ENTIRELY. IT COST 283 GATES OF SKIPPING. *** What stood here said: the pass runs every gate,
 * some gates WRITE into the tree, "so a path read early in the pass and again at the end can carry two
 * different hashes, and folding them into one silently picks a winner". Every clause of that is true about
 * the tree and false about this code, because hashFile is MEMOISED for the whole pass. Measured, in
 * tools/ship/inputSets-selfcheck.mjs section 4: write a file, hash it, rewrite it, hash it again, and the
 * second reading comes back EQUAL TO THE FIRST while the file on disk says something else. The late gate
 * never records a different hash, so encode() sees one value and reports NO conflict. *** THE MID-PASS RACE
 * PRODUCES ZERO CONFLICTS, BY CONSTRUCTION. ***
 *
 * So what were the 130 conflicts in the shipped record? tools/ship/recordInputs.mjs seeds its output with the
 * PREVIOUS record (`out = { ...prior.gates }`) so a partial re-probe does not erase everything else, and the
 * hashes of a carried-over entry are from the previous pass. Folding a T0 hash with a T1 hash for one path is
 * a conflict, and the tree changes between passes -- so the conflicting paths were exactly the files and
 * directories that rounds edit: tools/ship (a directory that gains a gate most rounds), gate-reports,
 * gateSweep.mjs, nextRounds.mjs, runtimeGap.mjs. Re-run with an empty prior on the same tree: 0 conflicts.
 *
 * *** AND THE SENTINEL'S BLAST RADIUS WAS THE WRONG SHAPE. *** A stale carried-over entry is ALREADY refused,
 * correctly and by itself, by whyRun's own re-hash of that gate's own paths. The sentinel adds nothing there
 * -- what it adds is poisoning the PATH for every other gate, including gates probed in this very pass whose
 * reading of it is perfectly current. Measured on the shipped record against the tree it shipped with: 283 of
 * 1,293 gates were refused by a sentinel and only 23 by a hash that genuinely differs, off 58 poisoned paths.
 *
 * THE SENTINEL STAYS, and it now has a detector that can actually fire it. recordInputs re-hashes every
 * recorded path AFTER the pass, with the memo cleared, and any path that moved is a path some gate wrote
 * while the pass was reading it -- the real form of the hazard this note used to claim. Those paths are
 * marked CONFLICT, so every gate that touched one is refused rather than skipped on a coin flip. `conflicts`
 * from the fold below must now be EMPTY, and it is kept as a ratchet: a nonzero count means a caller mixed
 * two passes into one encode(), which is the bug this note exists to have caught once.
 */
export function encode(gates, meta = {}) {
    const index = new Map(), paths = [], hashes = [], dirHashes = [];
    const conflicts = new Set();
    const idx = (p) => { let i = index.get(p); if (i === undefined) { i = paths.length; index.set(p, i); paths.push(p); hashes.push(undefined); dirHashes.push(undefined); } return i; };
    const put = (arr, i, v, p) => {
        if (arr[i] === undefined) { arr[i] = v; return; }
        if (arr[i] !== v) { arr[i] = CONFLICT; conflicts.add(p); }   // two readings of one path: trust neither
    };
    const out = {};
    for (const [g, e] of Object.entries(gates)) {
        const r = (e.reads || []).map((p) => { const i = idx(p); put(hashes, i, (e.hashes || {})[p] ?? null, p); return i; });
        const d = (e.dirs || []).map((p) => { const i = idx(p); put(dirHashes, i, (e.dirHashes || {})[p] ?? null, p); return i; });
        out[g] = { r, d, ms: e.probeMs, exit: e.exit };
        for (const f of FLAGS) out[g][f] = e[f];
    }
    // *** v4558 -- encode(decode(x)) LOST THE CONFLICT LIST WHILE KEEPING EVERY SENTINEL. *** A conflict is
    // detected by two gates DISAGREEING during this encode; after a decode they no longer disagree, because
    // both now read the same stored `!conflict`. So a record round-tripped through this module kept all 81
    // sentinels -- 290 gates still correctly refused, no false green -- and declared ZERO conflicts, which
    // made the file's own list stop describing its own contents and made recordInputs' conflictReport say
    // the pass was clean. FOUND by re-encoding the live record to drop one bad entry and noticing the count
    // go 21 -> 0 while the sentinels stayed.
    //
    // A STORED SENTINEL IS A CONFLICT WHETHER OR NOT THIS PASS IS THE ONE THAT SAW IT. The disagreement
    // above adds to the set; so does a value that arrived already refusing.
    for (let i = 0; i < paths.length; i++)
        if (hashes[i] === CONFLICT || dirHashes[i] === CONFLICT) conflicts.add(paths[i]);
    return { ...meta, format: FORMAT,
             conflicts: [...conflicts].sort(),
             paths, hashes: hashes.map((h) => h ?? null), dirHashes: dirHashes.map((h) => h ?? null), gates: out };
}

export function readRecord(root = ENG) {
    try { return decode(JSON.parse(fs.readFileSync(path.join(root, RECORD), "utf8"))); }
    catch { return { note: "", at: null, gates: {} }; }
}

/**
 * *** v4725 -- THE SAME RECORD, READ ONCE PER PROCESS WHILE THE FILE IS UNCHANGED. *** runQuickSweep read and decoded the
 * 3.5 MB record on every call, and a gate that drives three small sweeps paid for it three times -- sweepCoverage-selfcheck,
 * which on the slower host sat 42 ms over the quick sweep's budget and took eight frozen records out of the ship-time check.
 * The key is the file's path, mtime and size, so any rewrite -- recordInputs' included -- is a miss. For READERS ONLY: the
 * object is shared between callers, which is why readRecord, which recordInputs mutates before writing, is left as it was.
 */
const _recordMemo = new Map();
export function readRecordCached(root = ENG) {
    const file = path.join(root, RECORD);
    let st = null;
    try { st = fs.statSync(file); } catch { return readRecord(root); }
    const key = `${st.mtimeMs}:${st.size}`, hit = _recordMemo.get(file);
    if (hit && hit.key === key) return hit.value;
    const value = readRecord(root);
    _recordMemo.set(file, { key, value });
    return value;
}

/**
 * Why a gate cannot be skipped, or null when it can. A STRING rather than a boolean on purpose: a sweep that
 * says "skipped 700" and cannot say why it ran the other 450 is a sweep nobody will trust enough to use.
 */
export function whyRun(gate, rec, root = ENG) {
    // *** v4574 -- THE RECORD'S OWN FORMAT IS CHECKED BEFORE ANYTHING IS SKIPPED, AND IT WAS NOT. ***
    // FORMAT has been written into every record since v4566 and NOTHING HAS EVER READ IT. While the mechanism
    // only counted, that cost nothing. Armed, it is the difference between a stale record and a wrong one: the
    // encoding is INDEXED -- each gate's `r` and `d` are offsets into a shared `paths` table -- so a record
    // written under a different layout does not fail to decode, it decodes to THE WRONG PATHS, hashes them,
    // finds them unchanged, and skips the gate. A silent false green produced by bookkeeping.
    //
    // readRecord() returns { gates: {} } with no `format` when the file is missing or unparseable, so the same
    // line covers the absent case: no record, no skipping, and the histogram says so once rather than 1,257
    // times.
    if (!rec || rec.format !== FORMAT) return "no usable input record (missing, or a different format)";
    const e = rec && rec.gates ? rec.gates[gate] : null;
    if (!e) return "no recorded input set";
    // *** v4567 -- TWO OF v4566'S THREE DISQUALIFIERS ARE GONE, AND NEITHER WAS RELAXED. ***
    // `spawns a child process` covered 121 gates and 124 s -- 23% of the sweep, the single biggest block --
    // on the true statement that a probe in the parent cannot see what a child read. The answer was not to
    // look harder from the parent: NODE_OPTIONS carries the probe INTO every node child that inherits the
    // environment, so the child records itself and the recorder merges the directory. What is left is the
    // part that is still genuinely unknown -- a child that is NOT node (tsc, javac, a browser), a child
    // reached through exec/execSync, which runs a SHELL whose grammar this must not pretend to parse, or a
    // CJS require of child_process, which no loader hook reaches. Those still refuse.
    //
    // `takes fs by named import` covered 102 gates and 38 s, and was measured at v4567 rather than reasoned
    // about: such a gate recorded an EMPTY set, not a partial one. A module.register() loader hook redirects
    // node:fs to a shim, so the named bindings ARE the recording functions. The field is still recorded so
    // the population can be counted; it no longer decides anything.
    if (e.spawnedNonNode) return "spawned a child the probe could not follow";
    if (e.net) return "opens a socket or fetches";
    // *** v4573 -- THE DISQUALIFIER THAT ANSWERS THE REASON THIS WAS SHIPPED DISARMED. ***
    // v4566's own note says what it could not claim: "an input set is what a gate read on ONE RUN -- a
    // sample, not a specification -- so a gate that branches on something outside the tree could have a set
    // recorded on the narrow branch." tools/ship/importClosure.mjs answers the half a static reader CAN
    // answer, at RECORD time, and this is the flag it leaves behind.
    //
    // A STATIC import is unconditional: if the module loads, every `import ... from "./x"` in it loads too,
    // so the whole static closure must be in the recorded set or the record is simply wrong. A DYNAMIC one --
    // `await import(...)` in a branch, a CJS require inside a function -- is exactly the conditional the worry
    // names, and a dynamic specifier resolving to a file the set does NOT carry is the narrow branch, counted
    // instead of feared. Either way the gate runs.
    //
    // MEASURED at v4573 over 1,258 recorded gates: 0 miss a static import, 152 carry a dynamic one to a file
    // outside their set, and 1 imports a module ABOVE the engine root -- which no engine-relative record can
    // hash, so nothing in the tree could ever invalidate it. That is 153 gates that stop being skippable, and
    // it is the price of the skip being a structural claim rather than a sample of one run.
    if (e.reachesUnrecorded) return "reaches a module its recorded set does not carry";
    const reads = e.reads || [], dirs = e.dirs || [];
    if (!reads.length && !dirs.length) return "recorded an empty input set";
    if (!reads.includes(gate)) return "its own source is not in its recorded set";
    const moved = firstMoved(e, root);
    return moved === null ? null : "changed: " + moved;
}

/**
 * THE FIRST PATH IN THIS ENTRY WHOSE CONTENT NO LONGER MATCHES WHAT WAS RECORDED, or null.
 *
 * *** SPLIT OUT OF whyRun AT v4633 SO THE RECORDER AND THE RULE CANNOT DISAGREE ABOUT WHAT "STALE" MEANS. ***
 * The recorder needs exactly this question when it decides whether a PRIOR entry may be carried into a new
 * pass, and the alternative was a second copy of these two loops -- which is this tree's single most repeated
 * defect and the reason the species gates share one measurements module. One definition, two callers.
 */
export function firstMoved(e, root = ENG) {
    for (const r of e.reads || []) if (hashFile(r, root) !== (e.hashes || {})[r]) return r;
    for (const d of e.dirs || []) if (hashDir(d, root) !== (e.dirHashes || {})[d]) return d;
    return null;
}

export function skippable(gate, rec, root = ENG) { return whyRun(gate, rec, root) === null; }

/**
 * THE PRIOR RECORD'S ENTRIES THAT MAY BE CARRIED INTO A NEW PASS, and the ones that may not.
 *
 * *** SEEDING A PASS WITH THE PREVIOUS RECORD IS RIGHT; BLENDING THEIR HASHES IS NOT, AND THE DIFFERENCE COST
 * 283 GATES THEIR SKIP FROM v4622 TO v4632. *** `recordInputs --gates x` must not erase the other 1,300
 * entries, so the prior is seeded. But a carried entry's hashes are from the PREVIOUS pass, and encode()
 * stores ONE hash per path -- so folding a T0 hash with a T1 hash marks the path CONFLICT, which refuses not
 * just the stale gate but every gate that shares the path.
 *
 * So each prior entry is asked the question the skip rule would ask it: has anything it read moved? An entry
 * that still matches contributes the same hash a fresh entry would, so no conflict can arise and carrying it
 * is free. An entry that does not match is DROPPED rather than carried stale -- no loss, because whyRun
 * refuses it either way ("changed: x" and "no recorded input set" both mean the gate runs) -- and dropping it
 * is what keeps every hash in the written file from ONE instant, which is what the record's `at` stamp has
 * always claimed and could not previously support.
 */
export function carryForward(priorGates, root = ENG) {
    clearHashCache();
    const carried = {}, dropped = [];
    for (const [g, e] of Object.entries(priorGates || {})) {
        if (firstMoved(e, root) === null) carried[g] = e; else dropped.push(g);
    }
    return { carried, dropped };
}

/**
 * THE PATHS SOME GATE WROTE WHILE THE PASS WAS READING THEM -- the hazard the CONFLICT sentinel exists for,
 * with a reading that can actually see it. Marks each one CONFLICT in every entry that touched it, so those
 * gates are refused rather than skipped on a stale reading, and returns the sorted list.
 *
 * *** IT HAS TO CLEAR THE MEMO, AND THAT IS THE WHOLE MECHANISM. *** hashFile is memoised for the life of a
 * pass -- that is what turns 443,405 hashes into 4,072 -- and the memo is exactly why encode() cannot see a
 * mid-pass write: the late gate asks, and gets handed the EARLY reading. So the only place the question can
 * be asked is AFTER the pass, with the cache cleared, comparing what was recorded against what the file says
 * now. tools/ship/inputSets-selfcheck.mjs section 4 drives both halves of that on a real file.
 *
 * BEST-EFFORT, AND THE LIMIT IS NAMED RATHER THAN GLOSSED: a file written and then restored during the pass
 * reads the same at both ends and is missed. What this catches is the shape that occurs -- a gate that leaves
 * its output behind (tools/ship/tslRace-selfcheck.mjs rewrites tsl-emitted-race.json on every run; quickSweep
 * rewrites sweep-timings.json).
 */
export function markChangedDuringPass(gates, root = ENG) {
    const observed = new Map();
    for (const e of Object.values(gates)) {
        for (const r of e.reads || []) if (!observed.has(r)) observed.set(r, ["f", (e.hashes || {})[r]]);
        for (const d of e.dirs || []) if (!observed.has(d)) observed.set(d, ["d", (e.dirHashes || {})[d]]);
    }
    clearHashCache();
    const changed = [];
    for (const [rel, [kind, was]] of observed) {
        if ((kind === "f" ? hashFile(rel, root) : hashDir(rel, root)) !== was) changed.push(rel);
    }
    changed.sort();
    for (const e of Object.values(gates)) for (const rel of changed) {
        if (e.hashes && rel in e.hashes) e.hashes[rel] = CONFLICT;
        if (e.dirHashes && rel in e.dirHashes) e.dirHashes[rel] = CONFLICT;
    }
    return { changed, observed: observed.size };
}

/**
 * The split, for a report or a gate: { skip: [...], run: [{gate, why}] }.
 *
 * *** IT CLEARS THE HASH CACHE FIRST, AND THAT IS A CORRECTNESS RULE RATHER THAN HYGIENE. *** The memoisation
 * above turns 443,405 hashes into 4,072, and it also means a process that asks twice with a WRITE in between
 * gets the first answer twice. This module's own gate found that within the hour it was written: it recorded
 * a path while absent, created the file, asked again, and was told the gate was still skippable -- the exact
 * silent false green the whole rule is shaped to refuse, arriving through the optimisation rather than
 * through the rule. One partition call is one consistent snapshot of the tree; a caller wanting a fresh
 * reading calls it again, or calls clearHashCache for a single whyRun.
 */
export function partition(gates, rec, root = ENG) {
    clearHashCache();
    const skip = [], run = [];
    for (const g of gates) { const w = whyRun(g, rec, root); if (w === null) skip.push(g); else run.push({ gate: g, why: w }); }
    return { skip, run };
}

/** Group the reasons, so "why did 450 gates run" is one line rather than 450. */
export function reasonHistogram(run) {
    const h = {};
    for (const r of run) { const k = r.why.startsWith("changed: ") ? "an input changed" : r.why; h[k] = (h[k] || 0) + 1; }
    return h;
}
