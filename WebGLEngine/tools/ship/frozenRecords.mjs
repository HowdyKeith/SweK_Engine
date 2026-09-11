// tools/ship/frozenRecords.mjs -- v4487
//
// *** THIS TREE FREEZES NUMBERS INTO VERSION-STAMPED RECORDS SO A ROUND'S CLAIMS STAY CHECKABLE. NOBODY HAD
// EVER ASKED WHICH OF THOSE NUMBERS ANYTHING ACTUALLY CHECKS. ***
//
// v4482 built a pre-flight over FIVE hand-maintained records -- the five this session had been bitten by --
// and said so in its own header: "`known` is a LIST rather than a DISCOVERY". A merge at v4486 then produced
// a sixth and a seventh (rootLayout's justified-root list, zeroControl's coercion census), both found by the
// verify rather than by the pre-flight. So the list was short, and the way to stop it being short is to stop
// listing.
//
// ---- *** THE MEASUREMENT: CORRUPT A FIELD AND SEE WHETHER ANYTHING NOTICES *** ---------------------------------
//
// A record is load-bearing exactly when changing it turns something red. That is not a regex question and no
// static rule can answer it, so it was RUN: every numeric field of every version-stamped frozen record was
// bumped by 7, in place, and every gate that names that record was executed. 135 fields, restored after each.
//
//     74 records, 36 of them carrying numeric fields, 135 fields probed
//     83 NOTICED          52 UNNOTICED -- 38.5%
//     14 records no gate names at all      9 records where nothing notices any field
//
// *** v4536 -- AND THAT ENUMERATION WAS TAKEN WITH A BROKEN RULER, SO THE SWEEP WAS RUN AGAIN. *** The census
// read a record's body as `src.slice(i, i + 6000)`, capped at twelve fields. Replayed at the sweep's own
// commit with a balanced extraction, the v4487 tree held 138 fields where that record says 135. The re-run,
// over today's tree, with a BASELINE taken first because a +7 bump cannot redden a gate that is already red:
//
//     91 records, 38 carrying numeric fields, 152 fields
//     83 NOTICED   61 UNNOTICED   0 UNMEASURABLE   8 NO GUARDIAN AT ALL
//     20 records no gate names at all     10 records where nothing notices any field
//
// The first pass read 72 / 55 / 17 / 8. Seventeen fields had only RED guardian gates, so nothing could be
// learned from bumping them; both blockers were repaired while this round ran -- one of them BY it -- and the
// seventeen were re-probed rather than left filed under a condition that had stopped being true.
//
// See PROBE_AT_V4536. The v4487 record below is kept exactly as taken -- what was wrong with it is a fact
// about the enumerator, not about the run, and a discarded reading is evidence about the method.
//
// *** AND THE FIRST SWEEP MEASURED THE WRONG THING, WHICH IS WHY THE GUARDIAN SET IS DERIVED AND NOT ASSUMED.
// *** It probed each record against its SIBLING gate -- the file next to it with -selfcheck on the end -- and
// that is a guess. TWENTY-NINE OF THE SEVENTY-FOUR ARE NOT NAMED BY THEIR SIBLING: 15 are named by some other
// gate and 14 by nothing at all. 31 of the 83 catches come from a gate somewhere else in the tree. THE
// HEADLINE BARELY MOVED, 37.0% to 38.5%, AND THE ATTRIBUTION MOVED ENORMOUSLY, which is the reason a number
// is not a finding: the first run was nearly right for the wrong reason, on a guess about who guards what.
// (An earlier draft of this paragraph said "nineteen", counting under a third rule again. One rule is stated
// and used: does any -selfcheck file NAME the record.)
//
// ---- *** AND THIS FILE IS ITSELF A FROZEN RECORD, SO IT MOVED THE COUNT IT MEASURES *** -------------------------
//
// PROBE_AT_V4487 below is version-stamped, frozen and exported, so the live census reads 75 where the sweep
// measured 74. v3453's observer effect, in a file built to count the things it is an instance of. The census
// takes an `exclude` and the gate drives both readings, because "the number changed when I wrote it down" is
// only a curiosity if somebody checks that it changed by exactly one.
//
// ---- *** WHAT "UNNOTICED" DOES AND DOES NOT MEAN *** ------------------------------------------------------------
//
// A +7 bump is a corruption a gate MIGHT reasonably survive, so the 52 are three different things and the
// round does not pretend otherwise. Hand-read, four at random:
//
//   SHAPE_AT_V4480.gates      A REAL GAP. The gate compares definesOk, importsOk, condFirst and suspects and
//                             not gates -- a number re-taken by hand every round with nothing checking it.
//   TAINT_AT_V4479.builds     A REAL GAP, and mine: the record is imported and its fields never compared.
//   MARGIN_AT_V4481.cap       AN INPUT, not an output: the gate passes it to spread() rather than checking it.
//   COVERAGE_AT_V4456.duplicates  DECORATION BESIDE A LIVE CHECK: the gate asserts the LIVE duplicates are
//                             zero, so the property is guarded and the record's copy of it is not.
//
// So 52 is an UPPER BOUND on the debt and a LOWER BOUND on nothing. It is reported as the population it is.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as TR from "./treeRead.mjs";
import { stripComments } from "../../vba/runtimeGap.mjs";
import { resolveSpec } from "./importClosure.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKIP = /node_modules|[\\/]vendor[\\/]|[\\/]dist[\\/]/;

/** A record is a version-stamped, frozen, exported constant -- this tree's idiom for "measured at vNNNN". */
export const RECORD_RE = /export const ([A-Z][A-Z0-9_]*V\d{3,4}[A-Z0-9_]*) = Object\.freeze\(/g;

// v4548 -- the walk moved to tools/ship/treeRead.mjs; see its header. This gate was reading the tree FOUR
// times over (16,769 readFileSync for 4,025 files) and measured 3,446 ms against a 3,000 ms ship-time
// budget, which is how a stale census survived nine ALL GREEN rounds. The default `read` below now comes
// out of the same memo rather than off the disk, so census() costs one walk however many times it is called.
export function sources(dir = ENG) { return TR.treePaths(dir); }

const rel = (p) => path.relative(ENG, p).split(path.sep).join("/");

/**
 * *** v4536 -- A RECORD'S BODY IS THE RECORD, NOT THE NEXT 6,000 CHARACTERS OF THE FILE. ***
 *
 * Until now this module read `src.slice(i, i + 6000)` and took the first twelve `name: <digits>,` lines in it.
 * A fixed window is not a body, and it was wrong in BOTH directions at once. Measured over this tree, the
 * window and this function disagree about which fields belong to which record on FOURTEEN records:
 *
 *   LEAKED IN   ROTATION_BOUNDARY_V4533 is `Object.freeze([])`, 56 bytes, and the window credited it with NINE
 *               fields belonging to the record below it. Five more empty records were credited with 7-10 each.
 *   TRUNCATED   MEASURED_AT_V4462 is 11.4 KB and the window saw 1 of its 10 fields; KEY_DRIFT_V4460 is 8 KB
 *               and it saw 1 of 4.
 *   CAPPED      MEASURED_AT_V4429 has 15 numeric fields and MEASURED_AT_V4432 has 16; `.slice(0, 12)` hid
 *               three and four of them, silently, with nothing saying a cap had been reached.
 *   DOUBLED     RECHECK_V4314 was credited with `checked` and `regressedAmongChecked` twice, from the record
 *               after it; COMMIT_BELT_V4329 with `krbn` twice.
 *
 * Net: 44 records with fields and 188 fields under the window, 38 and 152 here. THE INSTRUMENT OVER-COUNTED BY
 * 36 FIELDS AND SIX RECORDS AND HAD THE COMPOSITION WRONG IN BOTH DIRECTIONS SIMULTANEOUSLY, which is why the
 * +7 probe was re-run rather than the old headline carried forward -- see PROBE_AT_V4536.
 *
 * It is a small lexer rather than a regex because the thing it must not do is stop at a `)` inside a string, a
 * comment or a regex literal -- and these records are full of prose. `balanced` is returned rather than
 * assumed, so a body this cannot close is a finding rather than a silent truncation at end-of-file.
 */
export function recordBody(src, start) {
    const open = src.indexOf("(", src.indexOf("Object.freeze", start));
    let i = open + 1, depth = 1, prev = "";
    while (i < src.length && depth > 0) {
        const c = src[i];
        if (c === '"' || c === "'" || c === "`") {                      // a string; template literals included
            const q = c; i++;
            while (i < src.length) {
                if (src[i] === "\\") { i += 2; continue; }
                if (q === "`" && src[i] === "$" && src[i + 1] === "{") { // ${ ... } can nest anything
                    let d = 1; i += 2;
                    while (i < src.length && d > 0) { if (src[i] === "{") d++; else if (src[i] === "}") d--; i++; }
                    continue;
                }
                if (src[i] === q) { i++; break; }
                i++;
            }
            prev = q; continue;
        }
        if (c === "/" && src[i + 1] === "/") { const n = src.indexOf("\n", i); i = n < 0 ? src.length : n; continue; }
        if (c === "/" && src[i + 1] === "*") { const n = src.indexOf("*/", i); i = n < 0 ? src.length : n + 2; continue; }
        if (c === "/" && /[=(,:[!&|?{;]/.test(prev)) {                  // a regex literal, not a division
            i++;
            while (i < src.length) {
                if (src[i] === "\\") { i += 2; continue; }
                if (src[i] === "[") { while (i < src.length && src[i] !== "]") { if (src[i] === "\\") i++; i++; } }
                if (src[i] === "/") { i++; break; }
                i++;
            }
            continue;
        }
        if (c === "(") depth++;
        else if (c === ")") depth--;
        if (!/\s/.test(c)) prev = c;
        i++;
    }
    return { body: src.slice(start, i), end: i, balanced: depth === 0 };
}

/** A numeric field of a record: `name: <digits>,` on its own line. One rule, used everywhere. */
export const FIELD_RE = /\n\s+([A-Za-z_][A-Za-z0-9_]*):\s*\d+\s*,/g;

/**
 * Every record, with the gates that NAME it. The guardian set is derived rather than assumed: the sibling
 * gate is a guess, and it is wrong for nineteen of them.
 */
// *** v4548 -- WHAT MADE THIS GATE COST 3.4 SECONDS WAS NOT THE READING, IT WAS THE GUARDIAN SEARCH. ***
// `guardians` asks, for every record, which gates NAME it -- and did so by testing each of ~95 names against
// each of 1,602 gate sources: about 152,000 substring searches over tens of megabytes. The gate calls
// census() SIX times, so it paid for that product six times over, ~500 ms each. Nothing was wrong with the
// answer; the shape was quadratic and recomputed.
//
// Both halves are memoised below, and the memo key is the EXCLUDE PATTERN rather than nothing: `exclude`
// changes which files are in the population AND which gates can be guardians, so a cache that ignored it
// would answer a different question than the one asked. A caller passing its own `files` or `read` -- which
// is how the gate injects fixtures -- bypasses the memo entirely and gets the old path.
const _scanCache = new Map();      // String(exclude) -> frozen census
const _recCache = new Map();       // path -> the record rows in it, guardians not yet attached

function recordsIn(f, read) {
    const hit = _recCache.get(f);
    if (hit) return hit;
    const src = read(f);
    const out = [];
    RECORD_RE.lastIndex = 0;
    let m;
    while ((m = RECORD_RE.exec(src))) {
        // v4536: m.index, not a fresh indexOf from the top of the file -- the match already knows where it
        // is, and searching again for a name that appears earlier in prose would find the prose.
        const { body, balanced } = recordBody(src, m.index);
        FIELD_RE.lastIndex = 0;
        out.push({ name: m[1], fields: [...body.matchAll(FIELD_RE)].map((x) => x[1]), bytes: body.length, balanced });
    }
    _recCache.set(f, out);
    return out;
}

/** Drop both memos. The gate needs a cold scan to prove the warm one is not simply answering from a stale copy. */
export function clearScanCache() { _scanCache.clear(); _recCache.clear(); _importCache.clear(); }

/**
 * *** WHICH LOCAL NAMES A GATE COULD CALL `fn` BY, IF IT IMPORTS IT FROM `target` -- AND [] IF IT DOES NOT. ***
 *
 * A bare `\bfn\s*\(` search is not enough and was measured not to be: `agreement` is declared in THREE
 * modules in this tree, and the first cut of the default-argument edge credited ERASED_AT_V4394 to
 * physics/render/samplerCheck-selfcheck.mjs and tools/ship/videoFrames-selfcheck.mjs -- each of which calls
 * its OWN `agreement` -- and to tools/ship/shipBridge-selfcheck.mjs, where the word is English inside a test
 * label. Three false guardians out of four, which is the same over-permissive matcher this round already threw
 * an identifier probe away for.
 *
 * So the binding is followed instead of the spelling: the gate must import from the defining file, and the
 * name it calls must be the one that import gave it -- `{ fn }`, `{ fn as other }`, or `* as NS` then `NS.fn`.
 */
// One resolved import table per gate, built on first need. *** THIS IS NOT A TIDY-UP, IT IS 800 ms. ***
// The first cut called resolveSpec for every (gate, function, record) triple, and resolveSpec probes the disk
// with up to four existsSync per specifier -- about 195,000 of them across 1,621 gates, on the gate whose
// crossing of the 3,000 ms budget at v4536 is the reason this whole file has a header. Measured: 1,470 ->
// 2,275 ms with the table, 1,470 -> 1,545 ms with it.
const _importCache = new Map();     // gate rel -> Map(target rel -> [clause text])
function importTable(gateRel, gateSrc) {
    let t = _importCache.get(gateRel);
    if (t) return t;
    t = new Map();
    for (const m of gateSrc.matchAll(/import\s+([^;]*?)\s+from\s+["']([^"']+)["']/g)) {
        const to = resolveSpec(gateRel, m[2], ENG);
        if (!to || to === " outside") continue;
        if (!t.has(to)) t.set(to, []);
        t.get(to).push(m[1]);
    }
    _importCache.set(gateRel, t);
    return t;
}

export function importedAs(gateRel, gateSrc, target, fn) {
    const out = [];
    for (const clause of importTable(gateRel, gateSrc).get(target) || []) {
        const ns = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
        if (ns) out.push(ns[1] + "." + fn);
        const braces = clause.match(/\{([\s\S]*)\}/);
        if (!braces) continue;
        for (const part of braces[1].split(",")) {
            const b = part.trim().match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
            if (b && b[1] === fn) out.push(b[2] || b[1]);
        }
    }
    return out;
}

/**
 * *** WHICH FILES NAME THESE RECORDS IN CODE -- WITH EVERY RECORD DECLARATION BLANKED FIRST. ***
 *
 * census() answers "which GATES name it", which is the guardian question. This answers the one underneath it:
 * does ANYTHING read it at all? A record that no code names is DOCUMENTARY -- it is prose in object form, and
 * asking which gate guards it is asking the wrong question. Eleven of this tree's 104 records are in that
 * position and were being reported as a coverage hole somebody forgot to close.
 *
 * Two exclusions, and both are the difference between a real answer and a flattering one:
 *   COMMENTS, for v4548's reason -- a gate that MENTIONS a record in its header was being credited with it.
 *   EVERY RECORD'S OWN DECLARATION AND BODY, which is new here and is what makes the count mean anything. A
 *   declaration is not a read, and neither is a mention inside ANOTHER record's body: recordReach.mjs's
 *   REACH_AT_V4548 lists "MEASURED_V4527" in `demotedByCommentStrip`, which is a string of data ABOUT the
 *   record, not code that reads it. Without the blanking, every one of the eleven scored a hit on its own
 *   declaration line and the whole population read as "named somewhere".
 *
 * *** IT IS ASKED ONLY OF THE NAMES HANDED IN, AND THAT IS A COST DECISION SAID OUT LOUD. *** Over all 104
 * records this is a 104 x 1,600 search, the same quadratic shape v4548 spent 500 ms per call on. The caller
 * asks it about the unguarded eleven, so it is 11 x 1,600. It is therefore NOT a general census and must not
 * be read as one.
 */
export function readSites(names, { root = ENG } = {}) {
    const want = [...names];
    const out = new Map(want.map((n) => [n, []]));
    if (!want.length) return out;
    for (const f of sources(root)) {
        if (!/\.(mjs|js|cjs)$/.test(f)) continue;
        let src = TR.textOf(f);
        if (!want.some((n) => src.includes(n))) continue;         // cheap reject before the expensive work
        src = stripComments(src);
        RECORD_RE.lastIndex = 0;
        let m;
        const spans = [];
        while ((m = RECORD_RE.exec(src))) {
            const { body } = recordBody(src, m.index);
            spans.push([m.index, m.index + (body ? src.slice(m.index).indexOf(body) + body.length : m[0].length)]);
        }
        for (const [a, b] of spans) src = src.slice(0, a) + " ".repeat(b - a) + src.slice(b);
        for (const n of want) {
            const re = new RegExp("\\b" + n + "\\b");
            if (re.test(src)) out.get(n).push(rel(f));
        }
    }
    return out;
}

export function census({ files = null, read = null, exclude = null } = {}) {
    const memoable = files === null && read === null;
    const key = String(exclude);
    if (memoable && _scanCache.has(key)) return _scanCache.get(key);
    const rd = read || ((f) => TR.textOf(f));
    const list = (files || sources()).filter((f) => !exclude || !exclude.test(rel(f)));
    const gates = list.filter((f) => /-selfcheck\.mjs$/.test(f));
    // *** v4548 -- COMMENTS OUT BEFORE THE GUARDIAN SEARCH, AND IT CHANGED ELEVEN ROWS. *** `guardians` asks
    // which gates NAME a record, and it asked with a raw substring test -- so a gate that MENTIONS a record
    // in its header, narrating why it exists, was credited with guarding it. Found the moment this round's
    // own tools/ship/recordReach-selfcheck.mjs told the story of BUDGET_DRIFT_V4536 in prose and the census
    // promoted that record from unguarded to guarded WITHOUT ANYTHING CHECKING IT. Measured across the tree:
    // 11 records lose a guardian once comments are stripped, and TWO of them lose their only one --
    // MEASURED_V4527 and BUDGET_DRIFT_V4536, which is the record whose staleness started this whole round.
    // Same defect vba/runtimeGap.mjs's own header records at v4462 ("eleven of the thirty-two threaded files
    // were prose ABOUT threads"), in the column that decides whether a record is protected at all.
    // Record DETECTION is left on the raw text and that is deliberate: a declaration only appears in code,
    // and stripping first was measured to find the same 94 records, so it would be cost without effect.
    const gateSrc = gates.map((g) => [rel(g), stripComments(rd(g))]);
    const mjs = list.filter((f) => /\.mjs$/.test(f));
    // ONE pass over the gates per census instead of one per record: collect every name first, then ask each
    // gate source which of them it contains. Same answer, and the 152,000 searches happen once rather than
    // once per record's turn through the loop.
    const named = new Map();       // name -> [gate rel]
    const all = [];
    for (const f of mjs) for (const r of (memoable ? recordsIn(f, rd) : recordsIn.call(null, f, rd)))
        { all.push({ r, f }); if (!named.has(r.name)) named.set(r.name, []); }
    for (const [g, src] of gateSrc) for (const [name, list_] of named) if (src.includes(name)) list_.push(g);
    // *** v4576 -- ONE LEVEL OF DERIVATION, BECAUSE A RECORD READ ONLY THROUGH ANOTHER ONE READ AS UNGUARDED. ***
    // The search above asks which gates NAME a record. Seven records failed it for a reason that is not a gap
    // in the tree: redCensus.mjs defines `RED_AT_V4531 = Object.freeze(RED_AT_V4531_GATES.map(...))`, so the
    // ARRAY is consumed only through the derived constant, and gates name the derived one. Corrupting the array
    // -- filing a green gate as a known red -- does redden registerDrift-selfcheck, measured, so it is guarded;
    // the search simply could not see through the derivation.
    //
    // SO A RECORD IS ALSO GUARDED BY WHATEVER GUARDS A RECORD DEFINED FROM IT IN THE SAME FILE. One level and
    // one file: a transitive closure over the whole tree would start crediting a record with guardians that
    // never touch its value, which is how a coverage number becomes a story. The edge has to be visible in the
    // defining module's own text, which is the same standard the NAME search uses.
    for (const f of mjs) {
        const src = stripComments(rd(f));
        const here = all.filter((x) => x.f === f).map((x) => x.r.name);
        if (here.length < 2) continue;
        for (const r of here) {
            const at = src.indexOf("export const " + r + " = Object.freeze(");
            if (at < 0) continue;
            const { body } = recordBody(src, at);
            if (!body) continue;
            for (const other of here) {
                if (other === r || !body.includes(other)) continue;
                // r is DEFINED FROM other, so r's guardians also stand over other
                const from = named.get(r) || [], to = named.get(other);
                if (!to) continue;
                for (const g of from) if (!to.includes(g)) to.push(g);
            }
        }
    }
    // *** v4577 -- AND A SECOND EDGE, FOR A RECORD THAT REACHES ITS GATE AS A DEFAULT ARGUMENT. ***
    // tools/mutate/shadowedDefaults.mjs declares `agreement(rows, frozen = ERASED_AT_V4394)`, and its gate
    // calls `agreement(S.rows)` with one argument. The record is exercised on every run and the gate never
    // types its name, so the NAME search called it unguarded. MEASURED, not argued: changing one frozen value
    // in that record takes the gate from 0 FAIL lines and exit 0 to THREE and exit 1.
    //
    // So a record used as the DEFAULT VALUE of an exported function's parameter is guarded by whatever gates
    // CALL that function. Narrow on purpose -- the general rule, "a record named anywhere in its module's code
    // is reached by whatever reaches the module", would credit every record in redCensus.mjs with every gate
    // that imports it, which is how a coverage number stops meaning anything.
    const DEFAULT_ARG = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g;
    for (const f of mjs) {
        const src = stripComments(rd(f));
        const here = new Set(all.filter((x) => x.f === f).map((x) => x.r.name));
        if (!here.size) continue;
        const target = rel(f);
        for (const m of src.matchAll(DEFAULT_ARG)) {
            const fn = m[1];
            for (const rec of here) {
                // `,` OR END OF STRING: the capture above stops before the closing paren, so a record that is
                // the LAST parameter has nothing after it. Requiring `[,)]` here matched only records with a
                // parameter following them, which is why the first cut of this edge fired twice and missed the
                // one case it was written for.
                if (!new RegExp("=\\s*" + rec + "\\s*(?:,|$)").test(m[2].trim())) continue;
                const to = named.get(rec);
                if (!to) continue;
                // any gate that CALLS THIS MODULE'S function exercises the record through the default
                for (const [g, gsrc] of gateSrc) {
                    const names = importedAs(g, gsrc, target, fn);
                    if (!names.length) continue;
                    if (!names.some((n) => new RegExp("\\b" + n.replace(".", "\\.") + "\\s*\\(").test(gsrc))) continue;
                    if (!to.includes(g)) to.push(g);
                }
            }
        }
    }
    const rows = all.map(({ r, f }) => {
        const guardians = named.get(r.name);
        const sib = rel(f).replace(/\.mjs$/, "-selfcheck.mjs");
        return Object.freeze({
            name: r.name, file: rel(f), fields: Object.freeze(r.fields.slice()), bytes: r.bytes, balanced: r.balanced,
            guardians: Object.freeze(guardians.slice()),
            siblingNamesIt: guardians.includes(sib),
        });
    });
    const out = Object.freeze({
        records: Object.freeze(rows),
        withFields: rows.filter((r) => r.fields.length).length,
        fields: rows.reduce((a, r) => a + r.fields.length, 0),
        unguarded: Object.freeze(rows.filter((r) => !r.guardians.length).map((r) => r.name)),
        unbalanced: Object.freeze(rows.filter((r) => !r.balanced).map((r) => r.name)),
        siblingWrong: rows.filter((r) => r.guardians.length && !r.siblingNamesIt).length,
    });
    if (memoable) _scanCache.set(key, out);
    return out;
}

/**
 * *** THE SWEEP, FROZEN, BECAUSE IT COSTS AN HOUR AND A GATE MAY NOT. *** Each row is a field that was really
 * bumped and a gate that was really run. corroborationCensus freezes a 4.79-hour sweep for the same reason;
 * what a gate can afford is the cheap half -- the enumeration above -- plus a ratchet on this number.
 */
/**
 * *** v4536 -- THE SWEEP RE-RUN, BECAUSE THE INSTRUMENT THAT ENUMERATED IT WAS WRONG. ***
 *
 * PROBE_AT_V4487 below is kept exactly as it was taken. It is not corrected in place, because it is an honest
 * record of a real sweep and what is wrong with it is a fact about the ENUMERATOR, not about the run. Read the
 * two together: this one supersedes it, and the pair is the evidence about the method.
 *
 * WHAT WAS WRONG. The census read a record's body as `src.slice(i, i + 6000)` and took the first twelve
 * `name: <digits>,` lines in it -- see recordBody above for the fourteen records the window and a balanced
 * extraction disagree about today. REPLAYED AGAINST THE SWEEP'S OWN COMMIT, 75f0c033, excluding this module
 * exactly as the gate does: the population was 74 records, 35 carrying fields, 138 FIELDS. The record says
 * 74 / 36 / 135. *** SO THREE FIELDS IN THE v4487 TREE WERE NEVER PROBED, AND ONE RECORD WAS CREDITED WITH
 * FIELDS IT DOES NOT HAVE. *** The 83/52 headline describes 135 fields that are not quite the 138 there were.
 *
 * AND THE SPLIT WAS TWO CLASSES WHERE THERE ARE FOUR. A +7 bump cannot redden a gate that is ALREADY RED, and
 * the v4487 sweep took no baseline, so every field whose only guardians were red scored as UNNOTICED. This run
 * takes the baseline first: 3 of the 31 guardian gates were red before a single field was touched
 * (frozenRecords-selfcheck, redCensus-selfcheck, runtimeGap-selfcheck). 'Never observed' and 'observed green'
 * are the two things v4408 proved are different, and one bucket for both is how the second becomes the first.
 *
 *     152 fields          83 NOTICED     61 UNNOTICED     0 UNMEASURABLE     8 NO GUARDIAN AT ALL
 *
 * 83 + 61 + 0 + 8 = 152, and the gate checks that addition. The unnoticed rate is 61 of the 144 that could be
 * measured -- 42.4% -- against the old headline's 52 of 135, 38.5%. *** AND 83 NOTICED IS THE NUMBER v4487
 * PRINTED, *** over a population nine fields larger and differently composed, reached by a different route:
 * the headline sat still while everything under it moved, which is the fourth time this file has caught that
 * happening to itself. The first pass read 72 / 55 / 17 / 8 -- see unmeasurableFirstPass.
 */
export const PROBE_AT_V4536 = Object.freeze({
    at: "v4536",
    probedAt: "207b74d0",          // the tree the +7 run was taken over, before this record was added to it
    commit: "75f0c033",            // v4487's commit -- what "was this record in the sweep?" is asked against
    method: "bump one integer field by 7 in place, run every gate that NAMES the record, restore and verify by " +
            "md5; a gate that was ALREADY RED at baseline cannot answer, and its fields are UNMEASURABLE " +
            "rather than unnoticed",
    // The population as probed, INCLUDING this module. `excluding` is what the gate compares, because this
    // module's own record count moves whenever a round like this one writes another.
    records: 91, withFields: 38, fields: 152,
    // *** v4548 -- THE THREE NUMBERS ABOVE ARE HISTORY AND THE `excluding` BLOCK BELOW IS RE-TAKEN EVERY
    // ROUND, AND THE GATE WAS COMPARING THEM TO EACH OTHER. *** Its subset row asserted
    // `excluding.records <= records`, which held only while the tree had not grown past this module's own
    // two records; at v4548 excluding reached 92 against a frozen 91 and the row went red on ARITHMETIC
    // rather than on anything being wrong. A frozen historical reading and a live one are not comparable and
    // the invariant was never about that. `currentIncludingModule` is the live counterpart of `excluding` --
    // both re-taken, both from the same census -- so the subset check compares like with like and the v4536
    // probe's own numbers stay exactly as they were taken.
    // v4562 -- RE-TAKEN with `excluding` below: 96/43/176 -> 97/44/180. The two move together by
    // construction, and the gate asserts the difference is exactly this module's own two records, so
    // updating one and not the other reddens a row that is about the exclude pattern rather than the count.
    // v4565/v4566 -- RE-TAKEN with `excluding` below: 97/44/180 -> 101/45/186, the same four records and the
    // same six fields, plus this module's own two records and their twenty fields.
    // v4568 -- RE-TAKEN with `excluding`: 101/45/186 -> 104/46/189, the same three records and three fields
    // plus this module's own two and their twenty.
    // v4577 -- RE-TAKEN with `excluding` below: 104/46/189 -> 105/47/192, the one record and its three fields.
    // v4578 -- RE-TAKEN with `excluding` below: 105/47/192 -> 106/47/192, the one record and none of its
    // values being a bare integer.
    // v4536 -- RE-TAKEN with `excluding`: 104/46/189 -> 105/47/199, the one new record PARTITION_AT_V4536 and
    // its ten fields, plus this module's own two and their twenty. The two readings move together by
    // construction and the row below asserts the gap is exactly this module's own pair.
    // v4537 -- RE-TAKEN with `excluding`: 105/47/199 -> 106/48/206, the one new record and its seven
    // fields, plus this module's own two and their twenty.
    // v4537 -- RE-TAKEN with `excluding`: 106/47/192 -> 108/49/209, the same two records and their
    // seventeen fields, plus this module's own two and their twenty.
    // v4538 -- RE-TAKEN with `excluding`: 108/49/209 -> 109/50/212, the one new record and its three
    // counted fields, plus this module's own two and their twenty.
    // v4538 -- RE-TAKEN with `excluding`: 109/50/212 -> 110/51/218.
    currentIncludingModule: Object.freeze({ records: 110, withFields: 51, fields: 218 }),
    // *** RE-TAKEN AT v4547, AND THIS ROUND IS NOT THE ROUND THAT MOVED IT. *** 90/37/146 -> 91/38/147, one
    // record: BUDGET_DRIFT_V4536, added by commit 4817a29b -- the SWEEP BUDGET round, ten rounds back -- which
    // did not re-take this reading. Nine committed rounds then shipped ALL GREEN over a stale census.
    // *** THE REASON IT SURVIVED NINE ROUNDS IS THE SUBJECT OF THE ROUND THAT BROKE IT. *** This gate takes
    // 3,446 ms and the ship-time sweep budget is 3,000, so frozenRecords-selfcheck NEVER RUNS AT SHIP TIME --
    // and neither does recordDrift-selfcheck, at 3,026 ms, 26 ms over. The tree's two stale-record detectors
    // are both outside the budget, so the one check that would have caught a record added without a re-take
    // was excluded by 446 ms, by the very round whose subject was that budget. Backlog item #14 counts 487
    // gates in that position; this is the first one measured to have actually cost something.
    // v4548 -- RE-TAKEN: 91/38/147 -> 92/39/150. One record, REACH_AT_V4548 in tools/ship/recordReach.mjs,
    // added by the round that asked how many records this ritual actually checks. The answer was 43 of 94.
    // v4550 -- RE-TAKEN: fields 150 -> 151. One field, REACH_AT_V4548.unmeasured, added when a random red in
    // recordReach-selfcheck turned out to be a torn read of the timings file and "never timed" had to be
    // split from "too slow". Records and withFields did not move: a field added to an existing record.
    // v4552 -- RE-TAKEN: 92/39/151 -> 93/40/153. One record, MEASURED_AT_V4552 in nav/detourScale.mjs,
    // holding what the engine's own terrain says about detours. It arrives GUARDED, which is the shape a
    // record should have and often does not: 20 of the 95 in this tree are named by no gate at all.
    // v4554 -- RE-TAKEN: 93/40/153 -> 94/41/156. One record, MEASURED_AT_V4553 in world/surfaceProbe.mjs,
    // holding what the terrain model and the voxels say about each other. It arrives GUARDED and under
    // budget, so recordReach's unchecked ceiling of 43 did not move.
    // v4562 -- RE-TAKEN: 94/41/156 -> 95/42/160. One record, SWEEP_CONTENTION_V4562 in
    // tools/ship/sweepCoverage.mjs, holding what an 8-worker sweep on a 4-core box does to the numbers it
    // files. It arrived guarded by a gate that is 9.1 s SERIALLY and therefore outside the ship-time sweep,
    // recordReach's ratchet went red for exactly that, and the rows were moved beside the record.
    // v4565/v4566 -- RE-TAKEN: 95/42/160 -> 99/43/166. FOUR records, from the round that ran the first bulk
    // pass at the over-budget pool (backlog #14) and triaged the eight new reds it surfaced: OVER_BUDGET_PASS_V4565
    // in tools/ship/sweepCoverage.mjs (the pass itself, and the only one of the four carrying fields -- the +6),
    // INSCOPE_ARRIVALS_SINCE_V4435 in tools/ship/absenceScope.mjs and NO_GATE_V4565 / UNGATED_ANYWHERE_V4565 in
    // tools/ship/reportDoors.mjs, all three arrivals-by-name rolls the reds needed. wgslCorpus.GENERATED_CASES
    // landed the same round and is NOT in this count: RECORD_RE matches `Object.freeze({`, and that one is a
    // frozen ARRAY. Stated rather than left as a discrepancy for the next re-take to trip over.
    // v4568 -- RE-TAKEN: 99/43/166 -> 102/44/169. THREE records from the round that opened the killed
    // bucket: KILLED_PASS_V4568 in tools/ship/sweepCoverage.mjs (the pass, and the only one with fields --
    // the +3), and RED_AT_V4568 plus WHY_V4568 in tools/ship/redCensus.mjs, which register the five reds it
    // found. RED_AT_V4568_GATES is a frozen ARRAY and so is not counted, the same distinction v4566 recorded
    // for wgslCorpus.GENERATED_CASES.
    // v4577 -- RE-TAKEN: 102/44/169 -> 103/45/172. ONE record, UNGUARDED_SPLIT_V4577 in
    // tools/ship/recordReach.mjs, from the round that asked what "unguarded" actually meant and found the
    // twelve were three different facts. It carries TWO countable fields, not the three it looks like:
    // `looseMatchGuardians: 4, looseMatchFalse: 3,` share a line and FIELD_RE counts `name: <digits>,` on its
    // OWN line, so the second one is not a field; `afterExcludingThisRecord` contributes the third. Stated
    // rather than left as a discrepancy, the same way
    // v4566 and v4568 stated the frozen ARRAYS that RECORD_RE does not match.
    // v4578 -- RE-TAKEN: 103/45/172 -> 104/45/172. ONE record, SHADER_SINHASH_V4578 in render/exactHash.mjs,
    // from the round that re-counted the shader-side sin-hash population. withFields and fields do NOT move:
    // every field it carries is a string or a frozen array of paths, and FIELD_RE counts `name: <digits>,`.
    // A record with no numeric field is still a record, and stating that is cheaper than the next re-take
    // wondering why one number moved and two did not.
    // v4536 -- RE-TAKEN: 102/44/169 -> 103/45/179. ONE record, PARTITION_AT_V4536 in nav/partitionScore.mjs,
    // carrying the ten numbers behind that round's refusal of backlog item "navmesh-recast" piece (1). It is
    // the largest single-record field jump this census has recorded, which is a property of the round rather
    // than of the rule: the round's whole content is measurements that replace claims, so the record is where
    // they live. *** AND THE ORDINAL IS A KNOWN COLLISION, RECORDED RATHER THAN RENUMBERED: *** PROBE_AT_V4536
    // above carries the same stamp from the other line's counter, which runs ahead of the one main.js keeps.
    // v4537 -- RE-TAKEN: 103/45/179 -> 104/46/186. One record, BACKLOG_AT_V4537 in
    // tools/ship/backlogAbsence.mjs, carrying the seven numbers behind that round's grading of the backlog's
    // own absence claims.
    // v4537 -- RE-TAKEN AT THE MERGE: 104/45/172 -> 106/47/189, the two records this branch added --
    // PARTITION_AT_V4536 in nav/partitionScore.mjs and BACKLOG_AT_V4537 in tools/ship/backlogAbsence.mjs.
    // v4538 -- RE-TAKEN: 106/47/189 -> 107/48/192. One record, COST_AT_V4538 in nav/pathCost.mjs. It
    // carries ten fields and only THREE are counted: FIELD_RE matches `name: <digits>,` and seven of its
    // values are decimals with a trailing comment or a signed number, so they do not match. Stated rather
    // than left for the next re-take to wonder at, the way v4566 and v4578 stated their own misses.
    // v4538 -- RE-TAKEN AT THE MERGE: 107/48/192 -> 108/49/198. Both lines again.
    excluding: Object.freeze({ records: 108, withFields: 49, fields: 198 }),
    // *** FOUR CLASSES, AND THEY MUST ADD UP. ***
    noticed: 83,
    unnoticed: 61,
    unmeasurable: 0,               // see unmeasurableFirstPass: both blockers were repaired mid-round
    noGuardianAtAll: 8,            // no -selfcheck file names the record, so there was nothing to run
    // *** THE FIRST PASS HAD SEVENTEEN IT COULD NOT MEASURE, AND THE ROUND REMOVED ITS OWN OBSTACLE. ***
    // Three records were guarded only by gates that were RED before a single field was touched, so a +7 bump
    // could not redden them: 72 / 55 / 17 / 8 on the first pass. Both blockers then went green -- this round
    // repaired frozenRecords-selfcheck, which is the red it was registered under at v4535, and a parallel
    // round on main repaired runtimeGap-selfcheck while this one was running. The seventeen were RE-PROBED
    // rather than left classified by a condition that had stopped being true: 11 noticed, 6 unnoticed, none
    // unmeasurable. LEAVING THEM WOULD HAVE BEEN THIS ROUND'S OWN SUBJECT COMMITTED ONE MORE TIME -- a bound
    // recorded as a measurement, and this time with the bound already lifted.
    unmeasurableFirstPass: Object.freeze({
        fields: 17, records: Object.freeze(["MEASURED_V4527", "PROBE_AT_V4487", "MEASURED_AT_V4462"]),
        blockedBy: Object.freeze(["tools/ship/frozenRecords-selfcheck.mjs", "tools/ship/runtimeGap-selfcheck.mjs"]),
        reProbed: Object.freeze({ noticed: 11, unnoticed: 6, unmeasurable: 0 }),
        firstPass: Object.freeze({ noticed: 72, unnoticed: 55, unmeasurable: 17, noGuardianAtAll: 8 }),
    }),
    unmeasurableRecords: Object.freeze([]),
    baselineRedGates: Object.freeze(["tools/ship/frozenRecords-selfcheck.mjs",
                                     "tools/ship/redCensus-selfcheck.mjs",
                                     "tools/ship/runtimeGap-selfcheck.mjs"]),
    guardianGates: 31,
    noGateNamesIt: 20,
    nothingNoticesAnyField: 10,
    fullyGuarded: 8,
    caughtByANonSiblingGate: 27,
    // What the replay says the v4487 record should have read, at its own commit, under a correct extraction.
    v4487Recount: Object.freeze({ records: 74, withFields: 35, fields: 138,
        recordSays: "74 / 36 / 135", neverProbed: 3 }),
    // The enumerator's failure modes, each with the record that shows it. Measured, not listed from memory.
    windowFailures: Object.freeze({
        recordsDisagreeing: 14,
        emptyRecordsCreditedWithFields: 6,     // ROTATION_BOUNDARY_V4533 is `Object.freeze([])` and got NINE
        overTheTwelveFieldCap: 2,              // MEASURED_AT_V4429 has 15, MEASURED_AT_V4432 has 16
        worstTruncation: "MEASURED_AT_V4462, 11.4 KB, 1 field seen of 10",
        worstLeak: "ROTATION_BOUNDARY_V4533, 56 bytes, 9 fields credited that belong to the record below it",
    }),
    limits: "unchanged from v4487 and worth repeating: a +7 bump is a corruption a gate may reasonably " +
            "survive, so UNNOTICED is not UNGUARDED -- see probeCatchesOneDirection below, which is still " +
            "true. What v4536 adds is that UNMEASURABLE is not UNNOTICED either, and that is a fact about " +
            "the harness rather than about the tree.",
    // *** AND THE HARNESS DAMAGED THE TREE ONCE, WHICH IS RECORDED BECAUSE IT IS THE SAME CLASS OF FAULT. ***
    harnessFault: "the first version of this probe restored the file in a `finally`, which SIGKILL does not " +
                  "run. Killing it left `regressedAmongChecked: 0` sitting in redCensus.mjs as a 7. The run " +
                  "above writes the original bytes to a SENTINEL FILE before each mutation and removes it only " +
                  "after an md5-verified restore, and recovers from any sentinel it finds at startup.",
});

export const PROBE_AT_V4487 = Object.freeze({
    at: "v4487",
    // The COMMIT the sweep was taken at, so "was this record in it?" is a question git can answer
    // rather than one inferred from a name. v4534 corrected this count by hand and wrote down that the
    // next record named for a version it merely DESCRIBES would land in the past silently again; it did,
    // the next round, and the gate reads the tree at this commit now instead of reading the names.
    commit: "75f0c033",
    method: "bump one integer field by 7 in place, run every gate that NAMES the record, restore; a field is " +
            "NOTICED if any of them exits 1",
    // *** v4534 CORRECTED THIS BY HAND FROM 74 TO 76, AND v4535 GAVE THE HAND BACK ITS 74. ***
    // v4534's reasoning was right and is kept here because it is what led to the repair: the row that reads
    // this count took a record's ARRIVAL from the version in its NAME, and REACH_ARRIVALS_SINCE_V4407 and
    // REACH_LOST_SINCE_V4407 arrived days after v4487 stamped V4407, because that is the version they are
    // ABOUT. *** A STAMP IN A NAME IS A CLAIM ABOUT THE SUBJECT, NOT ABOUT THE ARRIVAL. *** It corrected the
    // count and wrote down what was owed: "the next record named for a version it merely DESCRIBES will land
    // in the past silently again", and that dating an arrival "needs git, which this pure module does not
    // touch".
    //
    // THE NEXT ONE WAS THE NEXT ROUND, WITHIN THE HOUR, and the debt is paid where it can be: the MODULE
    // stays pure and the GATE asks git, in one call, which record declarations exist in the sweep's own
    // commit. The count returns to the 74 the sweep actually took, the two are excluded by measurement
    // rather than by being written down, and a third that would have landed in the past is caught by the
    // same rule without anybody adding to a list.
    records: 74, withFields: 36, fields: 135,
    noticed: 83, unnoticed: 52,
    noGateNamesIt: 14,
    nothingNoticesAnyField: 9,
    fullyGuarded: 13,
    caughtByANonSiblingGate: 31,
    // The first sweep, kept because a discarded reading is evidence about the method.
    firstSweepUsedSiblingsOnly: Object.freeze({ unnoticedPct: 37.0, wrong: "guardian set assumed, not derived" }),
    limits: "a +7 bump is a corruption a gate may reasonably survive, so UNNOTICED is not the same as " +
            "UNGUARDED. Four of the 52 were read by hand: two are real gaps, one is an INPUT the gate passes " +
            "on rather than checks, one is decoration beside a live check of the same property. 52 is the " +
            "population, not the debt.",
    // *** AND THE LIMIT WAS THEN DEMONSTRATED RATHER THAN ASSERTED, ON THIS ROUND'S OWN REPAIR. ***
    // TAINT_AT_V4479.builds was 0/2 guarded, so a consistency check was added -- buildsWhereNothingMoved <=
    // builds, examples <= builds, examples distinct. The probe STILL reads it unnoticed, correctly: +7 on
    // `builds` keeps every one of those inequalities true. The guard catches a DOWNWARD corruption and the
    // probe applies an UPWARD one, so a real guard against a different corruption reads here as no guard at
    // all. That field is left in the unnoticed count rather than argued out of it.
    probeCatchesOneDirection: Object.freeze({
        shown: "TAINT_AT_V4479.builds", guardAdded: "buildsWhereNothingMoved <= builds",
        stillUnnoticed: true,
        why: "the guard is an inequality the +7 preserves; a guard is not a re-derivation and a probe is not a proof",
    }),
});

export function reportLines(c = null) {
    const s = c || census();
    const L = ["frozen records -- which of this tree's frozen numbers anything actually checks"];
    L.push(`  ${s.records.length} version-stamped frozen records, ${s.withFields} carrying numeric fields, ` +
           `${s.fields} fields`);
    L.push(`  ${s.unguarded.length} that NO gate names at all: ${s.unguarded.slice(0, 6).join(", ")}` +
           (s.unguarded.length > 6 ? ", ..." : ""));
    L.push(`  ${s.siblingWrong} named by SOME gate but not their sibling, and ${s.unguarded.length} by none ` +
           "-- the guardian set is derived, because assuming the sibling was wrong for 29 of 74");
    L.push(`  measured at ${PROBE_AT_V4487.at}: ${PROBE_AT_V4487.unnoticed} of ${PROBE_AT_V4487.fields} ` +
           `fields could be bumped by 7 with nothing going red, and ${PROBE_AT_V4487.caughtByANonSiblingGate} ` +
           "of the catches came from a gate that is not the record's sibling");
    L.push("  THE 52 IS A POPULATION AND NOT A DEBT: some are inputs, some sit beside a live check of the " +
           "same property, and some are real gaps. Four were read by hand and split three ways.");
    return L;
}
