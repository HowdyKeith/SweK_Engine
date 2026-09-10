// WebGLEngine/tools/ship/recordShape.mjs -- v4572
//
// Run: node tools/ship/recordShape.mjs [--write]
//
// *** A WRITER THAT SPELLS ITS FIELDS BY HAND DROPS ONE, AND THE RECORD GETS SMALLER WITHOUT LOOKING WRONG. ***
// Three times in one session:
//
//   1. tools/ship/tslRace-selfcheck.mjs writes tsl-emitted-race.json in five sections, section 1 WHOLESALE and
//      the rest merging into what it left. A contended run died after section 1 and the `atlas` key was gone.
//      tools/ship/wgslCorpus.mjs guards its spriteAtlas case behind `EMITTED_RACE.atlas &&`, so the corpus got
//      one case smaller -- and crossBackend asserts `results.length === corpus().length`, the corpus measured
//      against itself, which holds at ANY size. Found by reading a git status line.
//   2. tools/ship/inputSets.mjs's encode() listed its fields by hand and went on writing `spawned` after the
//      recorder and the rule renamed it `spawnedNonNode`. The flag was dropped on write, whyRun read nothing,
//      and EVERY SPAWNING GATE BECAME SKIPPABLE -- browser gates included. The skip count went 956 to 1,121.
//   3. tools/ship/quickSweep.mjs computed `finished` in its write loop and left it out of the object it
//      actually writes, erasing 140 rows on the first sweep after KILLED_PASS_V4568.
//
// EACH ONE LOOKED LIKE A SMALLER SET OR A BETTER NUMBER, which is the direction that ships.
//
// ---- *** THE CHECK THE BACKLOG ASKED FOR IS NOT REACHABLE, AND THAT WAS MEASURED BEFORE IT WAS ABANDONED ***
//
// The filed round was "compare what each record file's WRITER emits against what its READERS consume", both
// halves read statically: the writer's object literal, the reader's property accesses. MEASURED on this tree:
// 584 writeFileSync call sites, 85 of them handing JSON.stringify an object literal, and 15 whose target path
// a static reader can resolve at all. The rest arrive through a constant, a parameter default, a path.join of
// both, or a helper -- tools/ship/quickSweep.mjs, the writer of case 3 ABOVE, is one of the misses, because
// its path comes from DEFAULTS.timingsFile through a destructured argument.
//
// A check covering 15 of 584 sites while carrying the word "writers" in its name is a proxy reported as a
// fact, which is the defect class this file exists for. So it is not built, and the number is recorded here
// rather than the intention being quietly narrowed.
//
// ---- WHAT IS BUILT: THE RECORD'S OWN SHAPE, RATCHETED ---------------------------------------------------
//
// A record may GAIN a field freely. LOSING one is the failure, whatever caused it -- a hand-spelled writer, a
// rename, a partial write, a second writer overwriting wholesale. All three cases above are a lost field:
// `atlas` from the top level, `finished` from the top level, `spawnedNonNode` from every gate entry. The
// shape is read from the RECORD rather than from the code that writes it, so it needs no path resolution and
// cannot be fooled by a writer nothing managed to parse.
//
// TWO LEVELS, because case 2 lives one level down. `top` is the record's own keys. `entry` is the UNION of the
// keys of every object value under a container -- union rather than intersection because a field leaving the
// UNION means NO entry carries it any more, which is unambiguous, where an intersection moves whenever one odd
// row appears. encode() dropping `spawnedNonNode` from all 1,255 gate entries takes it out of the union; one
// gate written without it does not.
//
// THE POPULATION IS DERIVED, NOT LISTED: tools/ship/input-sets.json records every path every gate reads, so
// the records under check are the ones gates ACTUALLY read, found by asking that record rather than by a walk
// with an extension filter that would sweep in fixtures, vendor manifests and node_modules leftovers.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SHAPE_FILE = "tools/ship/record-shapes.json";

/** Records a gate reads, derived from the input-sets probe rather than from a walk. */
export function recordsGatesRead(root = ENG) {
    let IS = null;
    try { IS = JSON.parse(fs.readFileSync(path.join(root, "tools/ship/input-sets.json"), "utf8")); } catch { return []; }
    const paths = IS.paths || [];
    const out = new Set();
    for (const e of Object.values(IS.gates || {}))
        for (const i of (e.r || [])) { const p = paths[i]; if (p && /\.json$/.test(p)) out.add(p); }
    return [...out].sort();
}

/**
 * The two levels of a record's shape.
 *
 * `entry` walks one level into any object or array value whose members are objects, and unions their keys. It
 * does NOT recurse further: a deep union over a 3.5 MB record is a different instrument with a different cost,
 * and every failure this file is built from lives at the top or one step under it.
 */
export function shapeOf(json) {
    const top = (json && typeof json === "object" && !Array.isArray(json)) ? Object.keys(json).sort() : [];
    const entry = new Set();
    const container = (v) => {
        const vals = Array.isArray(v) ? v : (v && typeof v === "object" ? Object.values(v) : []);
        for (const m of vals) if (m && typeof m === "object" && !Array.isArray(m)) for (const k of Object.keys(m)) entry.add(k);
    };
    if (Array.isArray(json)) container(json);
    else for (const v of Object.values(json || {})) container(v);
    return { top, entry: [...entry].sort() };
}

export function census(root = ENG) {
    const out = {};
    for (const rel of recordsGatesRead(root)) {
        let j = null;
        try { j = JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); } catch { continue; }
        const s = shapeOf(j);
        if (!s.top.length && !s.entry.length) continue;      // a bare array of scalars has no shape to hold
        out[rel] = s;
    }
    return out;
}

export function readShapes(root = ENG) {
    try { return JSON.parse(fs.readFileSync(path.join(root, SHAPE_FILE), "utf8")); } catch { return null; }
}

/** *** WRITING IS A SHIP STEP, NOT SOMETHING THE GATE DOES FOR YOU. *** A check that repairs its own
 *  expectation can never fail twice -- the rule tools/ship/populationCensus.mjs states, for the same reason,
 *  after this tree caught that shape four times. */
export function writeShapes(root = ENG) {
    const payload = { generatedFrom: "tools/ship/recordShape.mjs", at: new Date().toISOString(),
                      note: "Top-level and one-level-down key sets for every JSON record a gate reads. A record " +
                            "may GAIN a key; losing one is a dropped field and fails recordShape-selfcheck. A " +
                            "deliberate removal is recorded in DROPPED_ON_PURPOSE in tools/ship/recordShape.mjs, " +
                            "not by editing this file until it passes.",
                      shapes: census(root) };
    fs.writeFileSync(path.join(root, SHAPE_FILE), JSON.stringify(payload, null, 1) + "\n");
    return payload;
}

/**
 * *** A RATCHET WITH NO DOOR PUNISHES THE CHANGE IT EXISTS TO PROMPT, AND v4571 SPENT HALF A ROUND ON THAT. ***
 * Five rows went red in that round for forbidding a repair somebody had just made, and redCensus.mjs had
 * written the rule down at v4313: a deliberate removal is a TERM, not an exception. So a field may leave a
 * record, and the way it leaves is by being named here with what took it out.
 */
export const DROPPED_ON_PURPOSE = Object.freeze([
    // { record: "tools/ship/example.json", field: "top:oldName", round: "v4572", why: "..." },
]);

export function compare(root = ENG) {
    const rec = readShapes(root);
    if (!rec || !rec.shapes) return { ok: false, reason: "no recorded shapes -- run node tools/ship/recordShape.mjs --write" };
    const now = census(root);
    const excused = new Set(DROPPED_ON_PURPOSE.map((d) => d.record + " " + d.field));
    const lost = [], gained = [], vanished = [], appeared = [];
    for (const [rel, was] of Object.entries(rec.shapes)) {
        const is = now[rel];
        if (!is) { vanished.push(rel); continue; }
        for (const lvl of ["top", "entry"]) {
            for (const k of (was[lvl] || []))
                if (!(is[lvl] || []).includes(k) && !excused.has(rel + " " + lvl + ":" + k))
                    lost.push({ record: rel, field: lvl + ":" + k });
            for (const k of (is[lvl] || []))
                if (!(was[lvl] || []).includes(k)) gained.push({ record: rel, field: lvl + ":" + k });
        }
    }
    for (const rel of Object.keys(now)) if (!rec.shapes[rel]) appeared.push(rel);
    return { ok: lost.length === 0, lost, gained, vanished, appeared,
             records: Object.keys(rec.shapes).length, live: Object.keys(now).length, at: rec.at };
}

export function reportLines(c = compare()) {
    const L = [];
    if (c.reason) return ["[recordShape] " + c.reason];
    L.push(`[recordShape] ${c.live} records a gate reads, ${c.records} with a recorded shape.`);
    L.push(`[recordShape] ${c.lost.length} LOST field(s), ${c.gained.length} gained, ${c.appeared.length} new record(s), ${c.vanished.length} gone.`);
    if (c.lost.length) {
        L.push("[recordShape] *** A FIELD LEFT A RECORD. That is how a hand-spelled writer fails, and it looks");
        L.push("[recordShape] like a smaller set rather than like an error. ***");
        for (const l of c.lost) L.push("      LOST  " + l.record + "   " + l.field);
        L.push("[recordShape] If the removal was DELIBERATE, name it in DROPPED_ON_PURPOSE with what took it out.");
        L.push("[recordShape] Re-recording the shapes until this passes is how the next one goes unnoticed.");
    }
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    if (process.argv.includes("--write")) {
        const p = writeShapes();
        console.log("[recordShape] wrote " + SHAPE_FILE + ": " + Object.keys(p.shapes).length + " records");
    } else {
        const c = compare();
        for (const l of reportLines(c)) console.log(l);
        process.exit(c.ok ? 0 : 1);
    }
}
