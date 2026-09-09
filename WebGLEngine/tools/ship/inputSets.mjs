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
export const FLAGS = Object.freeze(["spawnedNonNode", "spawnedNode", "procs", "net", "namedFsImport"]);

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
             conflicts: raw.conflicts || [], gates };
}

/**
 * Build the indexed on-disk form from {gate: entry} in the decoded shape.
 *
 * *** ONE HASH PER PATH IS AN ASSUMPTION AND THE PASS ITSELF CAN BREAK IT. *** The recording pass runs every
 * gate, and some gates WRITE into the tree -- tools/ship/tslRace-selfcheck.mjs rewrites
 * tools/ship/tsl-emitted-race.json on every run, quickSweep rewrites sweep-timings.json, and v4566 spent a
 * round on what happens when one of those writes goes wrong. So a path read early in the pass and again at
 * the end can carry two different hashes, and folding them into one silently picks a winner.
 *
 * A CONFLICTING PATH IS RECORDED AS ONE. Its hash is stored as CONFLICT -- a sentinel no live reading can
 * produce, for the reason beside that constant -- so every gate that touched it is refused with `changed:`
 * rather than skipped on a coin flip. That is the refusing
 * direction, and `conflicts` carries the count so the number is visible instead of inferred.
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
    return { ...meta, format: FORMAT,
             conflicts: [...conflicts].sort(),
             paths, hashes: hashes.map((h) => h ?? null), dirHashes: dirHashes.map((h) => h ?? null), gates: out };
}

export function readRecord(root = ENG) {
    try { return decode(JSON.parse(fs.readFileSync(path.join(root, RECORD), "utf8"))); }
    catch { return { note: "", at: null, gates: {} }; }
}

/**
 * Why a gate cannot be skipped, or null when it can. A STRING rather than a boolean on purpose: a sweep that
 * says "skipped 700" and cannot say why it ran the other 450 is a sweep nobody will trust enough to use.
 */
export function whyRun(gate, rec, root = ENG) {
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
    const reads = e.reads || [], dirs = e.dirs || [];
    if (!reads.length && !dirs.length) return "recorded an empty input set";
    if (!reads.includes(gate)) return "its own source is not in its recorded set";
    for (const r of reads) if (hashFile(r, root) !== (e.hashes || {})[r]) return "changed: " + r;
    for (const d of dirs) if (hashDir(d, root) !== (e.dirHashes || {})[d]) return "changed: " + d;
    return null;
}

export function skippable(gate, rec, root = ENG) { return whyRun(gate, rec, root) === null; }

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
