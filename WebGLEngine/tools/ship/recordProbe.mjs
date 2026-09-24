// WebGLEngine/tools/ship/recordProbe.mjs -- v4675
//
// Run: node tools/ship/recordProbe.mjs [--json] [--only <NAME>] [--non-numeric] [--limit N]
//
// *** WHETHER A FROZEN RECORD IS GUARDED CAN ONLY BE ANSWERED BY CORRUPTING IT AND SEEING WHO SHOUTS, AND
// THE TREE HAS ANSWERED IT TWICE WITH A HARNESS THAT WAS NEVER COMMITTED. ***
//
// tools/ship/frozenRecords.mjs carries PROBE_AT_V4487 and PROBE_AT_V4536: "bump one integer field by 7 in
// place, run every gate that NAMES the record, restore and verify". That is the right method and it is the
// only method that can work -- no static rule can tell a load-bearing number from a decorative one. But the
// code that did it went in nobody's commit, so the experiment is a MEMORY rather than a MECHANISM: the tree
// cannot re-ask the question, which is why PROBE_AT_V4536's headline sat unchanged for 138 rounds.
//
// ---- TWO THINGS WERE WRONG WITH THE ANSWER, AND BOTH ARE MEASURED -----------------------------------------
//
// *** 1. THE VOCABULARY IS INTEGER-ONLY, AND 78 OF 148 RECORDS HOLD NO INTEGER. *** Measured at v4675 off
// frozenRecords.census(): 70 records carry a numeric field and 78 do not. For those 78 nothing has ever
// established that any guardian notices anything, because there was nothing the probe knew how to corrupt.
// They are not obscure: every one of the 17 records that have BOTH an affordable and an unaffordable naming
// guardian is in there, and so is tools/ship/orphanSets.mjs's RECORDED -- 519 module names, three ratchets,
// the baseline whose drift cost ten days at v4673.
//
// *** 2. THE PAIRS WERE DISCARDED. *** PROBE_AT_V4536 stored `noticed: 83, unnoticed: 61, guardianGates: 31`
// -- totals. So 61 field-and-guardian relationships are known not to detect anything and nobody can name one.
// That is v4673's defect exactly (a count where a set was needed) sitting in the instrument one level up, and
// re-running without fixing it would have wasted the run.
//
// ---- WHAT A PERTURBATION HAS TO BE ------------------------------------------------------------------------
//
// The +7 bump works because it makes the record SAY SOMETHING FALSE while staying syntactically valid: a
// guardian that compares the record to the tree must then disagree. The analogue for a list of names is to
// change one to something the tree cannot contain. Both are applied here, chosen from what the record holds
// rather than declared.
//
// *** AND "UNNOTICED" IS ONLY CLAIMED AFTER BOTH. *** A guardian that ignores a changed VALUE may still catch
// a changed LENGTH, so a list record whose value-change nobody notices is probed again with an element
// REMOVED. Calling a guardian blind on one mutation it happens not to look at would overstate the finding in
// the direction that makes this round look important, which is the direction to be most careful about.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as FR from "./frozenRecords.mjs";
import { stripComments } from "../../vba/runtimeGap.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** A value no tree can legitimately contain, so a guardian that compares against reality must disagree. */
export const SENTINEL = "__recordProbe_v4675_not_a_real_value__";

/** The numeric-field rule, borrowed from frozenRecords rather than restated. */
const ONE_FIELD = /\n(\s+)([A-Za-z_][A-Za-z0-9_]*):\s*(\d+)\s*,/;
/** A quoted string element -- what a list-valued record is made of. */
const ONE_STRING = /(["'])((?:[^"'\\\n]|\\.){3,})\1/;

/**
 * *** WHERE THE RECORD IS DECLARED, NOT WHERE ITS NAME IS MENTIONED. ***
 *
 * The first draft used src.indexOf("export const " + name) and that is a substring match: it cannot tell a
 * declaration from prose. MEASURED -- it located ADMITTED_V4673 inside a COMMENT in orphanSets.mjs that reads
 * "RECORD_EXPORT matches `export const ADMITTED_V4673`", then scanned forward to the next Object.freeze( and
 * captured a 25 KB body belonging to a DIFFERENT record. Every measurement taken through that offset was
 * about the wrong thing. frozenRecords.RECORD_RE is the tree's one spelling of what a record declaration
 * looks like, so it is what locates one here.
 */
export function declarationOf(src, name) {
    const re = new RegExp(FR.RECORD_RE.source, "g");
    let m;
    while ((m = re.exec(src))) if (m[1] === name && isCodeOffset(src, m.index) && isCode(src, m)) return m.index;
    return -1;
}

/**
 * *** AND RECORD_RE IS A TEXT SCAN TOO, WHICH THE FIRST FIX FORGOT. ***
 *
 * Swapping indexOf for RECORD_RE stopped a bare NAME in prose being mistaken for a declaration, and left the
 * case where a comment quotes the WHOLE declaration. This gate's own section 1 fixture does exactly that and
 * located the comment at offset 26 instead of the real declaration below it. The live tree happens not to
 * contain such a comment today -- which is luck, not a property -- and the census that feeds this probe would
 * be wrong about it in the same way.
 */
/**
 * Is this offset real code, or is it inside a string or a comment?
 *
 * *** THE EXCLUSION THIS REPLACES WAS THE WRONG RULE, AND ITS OWN EVIDENCE SAID SO. *** v4675 first answered
 * the phantom problem by dropping every record declared inside a gate, on the reasoning that a gate's frozen
 * values are fixtures. Measured over the 9 records that rule excluded: ALL NINE ARE REAL and all nine are
 * NOTICED by their own gate -- CORPUS_AT_V4583, KIT_AT_V4623, SPOT_CHECK_V4575, SURVIVORS_V4577 and the rest
 * are measurements that happen to live beside the gate that checks them. The rule cost nine records of
 * coverage to solve a problem that was never about where a record lives.
 *
 * The problem is that RECORD_RE is a text scan, so it matches inside a STRING LITERAL -- which is exactly what
 * this round's own gate fixtures were. A declaration quoted in a string is no more a declaration than one
 * quoted in a comment.
 *
 * *** THIS IS A SECOND LEXER AND THAT IS A HAZARD, SO IT IS NAMED RATHER THAN HIDDEN. ***
 * frozenRecords.recordBody already walks source with these rules, and every rule this one omitted it
 * disagreed on: comments (took 9 records from readable to unreadable), regex literals, and `${...}`
 * interpolation (swallowed a declaration 1,359 bytes past the start of a shader template). Three divergences
 * in one round is what a duplicated rule costs. recordBody cannot answer "is THIS OFFSET code" -- it extracts
 * a balanced body from a known start -- so the duplication is not removable today; instead
 * tools/ship/recordProbe-selfcheck.mjs asserts the two AGREE on every record in the live census, so the next
 * divergence is a red row rather than a silent phantom.
 */
export function isCodeOffset(src, idx) {
    let i = 0, prev = "";
    while (i < idx) {
        const c = src[i];
        if (c === '"' || c === "'" || c === "`") {
            const q = c; i++;
            while (i < src.length) {
                if (i >= idx) return false;                        // the offset itself is inside the string
                if (src[i] === "\\") { i += 2; continue; }
                // *** ${ ... } CAN NEST ANYTHING, AND LEAVING IT OUT SWALLOWED A DECLARATION. *** The WGSL
                // shader templates in physics/render/pathTracerGpu.mjs interpolate expressions that contain
                // quotes and further backticks; without this branch one template read as a 2,536-byte string
                // that ran straight past MEASURED_AT_V4415 at offset 19,801 and made it a phantom.
                if (q === "`" && src[i] === "$" && src[i + 1] === "{") {
                    let d = 1; i += 2;
                    while (i < src.length && d > 0) { if (src[i] === "{") d++; else if (src[i] === "}") d--; i++; }
                    continue;
                }
                if (src[i] === q) { i++; break; }
                i++;
            }
            prev = q; continue;
        }
        if (c === "/" && src[i + 1] === "/") {
            const n = src.indexOf("\n", i); const end = n < 0 ? src.length : n;
            if (idx < end) return false; i = end; continue;
        }
        if (c === "/" && src[i + 1] === "*") {
            const n = src.indexOf("*/", i); const end = n < 0 ? src.length : n + 2;
            if (idx < end) return false; i = end; continue;
        }
        // *** A REGEX LITERAL IS NOT A STRING, AND LEAVING IT OUT COST A REAL RECORD. *** recordBody has this
        // branch and the first cut of this scanner did not, so a pattern like /['"]/ opened a string that never
        // closed and every offset after it read as quoted. MEASURED: it turned MEASURED_AT_V4415 in
        // physics/render/pathTracerGpu.mjs -- declared in plain code at line 353 -- into a phantom. Same
        // prev-character rule as recordBody, so the two agree about what a division is.
        if (c === "/" && /[=(,:[!&|?{;]/.test(prev)) {
            i++;
            while (i < src.length) {
                if (src[i] === "\\") { i += 2; continue; }
                if (src[i] === "[") { while (i < src.length && src[i] !== "]") { if (src[i] === "\\") i++; i++; } }
                if (src[i] === "/") { i++; break; }
                i++;
            }
            if (i > idx) return false;
            continue;
        }
        if (!/\s/.test(c)) prev = c;
        i++;
    }
    return true;
}

export function isCode(src, m) {
    // *** AND THE CHEAP TEST FOR "IS THIS IN A COMMENT" WAS WRONG TOO, WHICH THE SHAPE CENSUS CAUGHT. ***
    // The first version asked whether a `//` preceded the match on its line and whether the last `/*` came
    // after the last `*/`. That reads a `/*` inside a STRING or a REGEX as an open comment, so one such
    // character earlier in a file marks every declaration after it as commented: it took NINE live records
    // from readable to unreadable in one step. The exact question is whether the match SURVIVES the tree's own
    // comment stripper, asked of the prefix that ends with it -- one spelling, stripComments, the same one the
    // record census runs.
    const upto = stripComments(src.slice(0, m.index + m[0].length));
    return upto.trimEnd().endsWith(m[0].trimEnd());
}

/**
 * *** A MUTATION MUST CHANGE WHAT THE RECORD ASSERTS, NOT WHAT IT SAYS ABOUT ITSELF. ***
 *
 * The first draft picked the first quoted string in the body, and on several records that was PROSE inside a
 * comment -- it "corrupted" `"a red that has been repaired and left on"` and `"s WHY_V4424 note"` and then
 * counted every guardian that ignored the change as BLIND. A guardian that does not care about a comment is
 * not blind, it is correct, and reporting otherwise inflates the finding in the direction that flatters the
 * round. A candidate is accepted only if it survives comment-stripping, which is the same stripComments the
 * record census itself runs.
 */
function codeOnly(body, re) {
    const bare = stripComments(body);
    const g = new RegExp(re.source, "g");
    let m;
    while ((m = g.exec(body))) if (bare.includes(m[0])) return m;
    return null;
}

/**
 * Make the record say something false, without breaking the file.
 *
 * Returns { body, kind, what } or null when this record holds nothing this knows how to corrupt -- which is
 * itself a finding and is counted rather than skipped silently.
 */
export function perturb(body, kind = "auto") {
    if (kind === "auto" || kind === "bump") {
        const m = codeOnly(body, ONE_FIELD);
        if (m) return { body: body.replace(m[0], m[0].replace(/:\s*\d+\s*,/, ": " + (Number(m[3]) + 7) + ",")),
                        kind: "bump", what: `${m[2]} ${m[3]} -> ${Number(m[3]) + 7}` };
        if (kind === "bump") return null;
    }
    if (kind === "auto" || kind === "retitle") {
        const m = codeOnly(body, ONE_STRING);
        if (m) return { body: body.replace(m[0], m[1] + SENTINEL + m[1]),
                        kind: "retitle", what: `"${m[2].slice(0, 40)}" -> SENTINEL` };
        if (kind === "retitle") return null;
    }
    if (kind === "drop") {
        // Remove one element AND its separator, so the literal stays valid and the LENGTH changes.
        const m = codeOnly(body, /(["'])((?:[^"'\\\n]|\\.){3,})\1\s*,\s*/);
        if (m) return { body: body.replace(m[0], ""), kind: "drop", what: `dropped "${m[2].slice(0, 40)}"` };
        return null;
    }
    return null;
}

/**
 * *** WHAT KIND OF THING THE RECORD IS, BECAUSE "NOTHING COULD CORRUPT IT" WAS THREE ANSWERS IN ONE. ***
 *
 * The first cut reported 20 records as unperturbable and 18 of them were one family, which is a pattern
 * rather than a coincidence. Reading them settled it, and it is the tree rather than the probe:
 *
 *   EMPTY    `Object.freeze([])` -- RED_AT_V4408_GATES and its siblings. There is nothing in it to make
 *            false. An empty record cannot drift, so an unnoticed corruption is not a finding about it.
 *   DERIVED  `Object.freeze(RED_AT_V4424_GATES.map(...))` -- computed from ANOTHER record at run time. It
 *            holds no frozen value, so the corruption that tests it is a corruption of its SOURCE, which is
 *            already a record in this census with its own guardians. It is not unguarded; it INHERITS.
 *   OPAQUE   a literal this probe has no mutation for. That one IS a gap in the vocabulary.
 *
 * Folding the three together is the two-things-one-label fault, and it was in this round's own bucket.
 */
export function shapeOf(body) {
    const bare = stripComments(body).replace(/\s+/g, " ");
    if (/Object\.freeze\(\s*(\[\s*\]|\{\s*\})\s*\)/.test(bare)) return "empty";
    // A call or an identifier where a literal should be: the value is computed, not written down.
    if (/Object\.freeze\(\s*[A-Za-z_$][\w$]*\s*[.(]/.test(bare)) return "derived";
    return "literal";
}

/** Every kind this record can take, derived from what it holds. */
export function kindsFor(body) {
    return ["bump", "retitle", "drop"].filter((k) => perturb(body, k) !== null);
}

/**
 * The population a bare run probes: every census record whose declaration this can actually FIND.
 *
 * *** THE GATE EXCLUSION IS RETIRED, AND THE MEASUREMENT IS WHY. *** It read
 * `.filter((r) => !/-selfcheck\.mjs$/.test(r.file))` and cost nine real records their coverage; every one of
 * them turned out to be NOTICED by its own gate. A record is skipped here only when its declaration cannot be
 * located as CODE -- which is the phantom case, and is reported by name rather than silently dropped.
 */
export function defaultRecords({ root = ENG } = {}) {
    return FR.census().records.filter((r) => {
        try { return declarationOf(fs.readFileSync(path.join(root, r.file), "utf8"), r.name) >= 0; }
        catch { return false; }
    });
}

const runGate = (gate, root, capMs) => {
    const r = spawnSync(process.execPath, [path.join(root, gate)], { cwd: root, encoding: "utf8", timeout: capMs });
    const killed = !!r.signal || (r.error && /ETIMEDOUT/.test(String(r.error.code)));
    return { code: killed ? null : (r.status ?? 1), killed };
};

/**
 * Probe a set of records and return PAIRS -- which guardian noticed which record's corruption.
 *
 * A guardian that is ALREADY RED cannot answer: its verdict cannot change, so the pair is `unmeasurable`
 * rather than unnoticed. That is v4536's rule and the reason its first pass had seventeen it could not read.
 */
/**
 * *** A PROBE THAT MUTATES TRACKED SOURCE MUST SURVIVE BEING KILLED, AND THIS ONE DID NOT. ***
 *
 * MEASURED THE HARD WAY at v4675: a census run was SIGTERMed mid-pass and left
 * `Object.freeze({ module: "__recordProbe_v4675_not_a_real_value__", gates: 1 })` sitting in
 * tools/ship/orphanSets.mjs. The restore audit at the foot of probe() had never run, because the process
 * never got there -- and a CI timeout, a container reclaim or a Ctrl-C does exactly what that kill did. The
 * happy path was audited and every other path was not.
 *
 * So the restore is armed as a HANDLER the moment the first file is touched, and disarmed when the pass ends
 * cleanly. It is idempotent, synchronous (an async restore in an exit handler does not finish) and it runs on
 * SIGINT, SIGTERM, an uncaught throw and a plain exit alike.
 */
function armRestore(touched) {
    let done = false;
    const restore = () => {
        if (done) return; done = true;
        for (const [f, orig] of touched) {
            try { if (fs.readFileSync(f, "utf8") !== orig) fs.writeFileSync(f, orig); } catch { /* best effort */ }
        }
    };
    const onSignal = (sig) => { restore(); process.removeListener(sig, onSignal); process.kill(process.pid, sig); };
    process.on("exit", restore);
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
    process.on("uncaughtException", (e) => { restore(); throw e; });
    return () => { process.removeListener("exit", restore); };
}

export function probe({ records = null, root = ENG, capMs = 180000, onProgress = null, kinds = null } = {}) {
    // *** A GATE'S OWN FROZEN VALUES ARE FIXTURES, AND THE CENSUS CANNOT TELL. ***
    //
    // MEASURED, on this round's own gate: recordProbe-selfcheck.mjs contains example records in its section
    // fixtures -- nine of them, each an `export const <NAME>_V4675 = Object.freeze(...)` -- and RECORD_RE is a
    // text scan over raw source, so it reads them as real. NOTE THE SPELLING OF THAT SENTENCE: writing the
    // pattern out literally here would make THIS COMMENT a record too, which is exactly what happened on the
    // first draft and what the phantom in section 3 of the gate is about.
    // so the census filed every one as a real record and a census run MUTATED THE GATE THAT GRADES THE PROBE.
    // A gate's frozen value is an example of a record, never a record: nothing in the tree depends on it, and
    // corrupting one asks no question worth an answer. Same law as v3223's "a register of orphans is not a
    // consumer of them", one shape over. Callers that pass `records` explicitly keep whatever they asked for.
    const all = records || defaultRecords();
    // *** THE BASELINE IS TAKEN BEFORE ANYTHING IS CORRUPTED, AND THE FIRST DRAFT TOOK IT LAZILY INSIDE THE
    // MUTATION LOOP. *** That is an ordering bug with an inverted result: a gate first encountered while some
    // OTHER record sat corrupted was measured against the corrupted tree, so a guardian that NOTICED got its
    // red cached as "already red at baseline" and every record it guards was then filed UNMEASURABLE. It
    // reported 48 of 81 gates red at baseline; spot-checking three of them -- playerGround, cameraFall,
    // colourReach -- found all three ALL GREEN when run by hand. A probe whose control is taken after the
    // treatment measures the treatment.
    const baseline = new Map();                      // gate -> { code, killed }, run ONCE, on the pristine tree
    const wanted = [...new Set(all.flatMap((r) => r.guardians || []))];
    for (const g of wanted) {
        baseline.set(g, runGate(g, root, capMs));
        if (onProgress) onProgress(0, all.length, "baseline " + g);
    }
    const base = (g) => baseline.get(g) || { code: 1, killed: false };
    const rows = [];
    const touched = new Map();                       // file -> original bytes, for the restore audit
    const disarm = armRestore(touched);
    let done = 0;
    for (const rec of all) {
        const file = path.join(root, rec.file);
        const src = fs.readFileSync(file, "utf8");
        if (!touched.has(file)) touched.set(file, src);
        const idx = declarationOf(src, rec.name);
        const { body, balanced } = idx < 0 ? { body: null, balanced: false } : FR.recordBody(src, idx);
        const guardians = rec.guardians || [];
        const row = { record: rec.name, file: rec.file, guardians, balanced,
                      shape: body ? shapeOf(body) : "unreadable",
                      kinds: body ? kindsFor(body) : [], tried: [], pairs: [], unperturbable: false };
        if (!body || !balanced || !row.kinds.length || !guardians.length) {
            row.unperturbable = !body || !balanced || !row.kinds.length;
            rows.push(row); done++; if (onProgress) onProgress(done, all.length, rec.name); continue;
        }
        // Try the kinds in order and stop as soon as SOMETHING notices -- "unnoticed" then means every
        // corruption this record can take went unseen by every guardian that could answer.
        for (const kind of (kinds || row.kinds)) {
            const p = perturb(body, kind);
            if (!p) continue;
            fs.writeFileSync(file, src.slice(0, idx) + p.body + src.slice(idx + body.length));
            const seen = guardians.map((g) => {
                const b = base(g);
                if (b.killed || b.code !== 0) return { gate: g, verdict: "unmeasurable", why: b.killed ? "killed at cap" : "red at baseline" };
                const a = runGate(g, root, capMs);
                return { gate: g, verdict: a.killed ? "unmeasurable" : (a.code !== 0 ? "noticed" : "blind") };
            });
            fs.writeFileSync(file, src);
            if (fs.readFileSync(file, "utf8") !== src) throw new Error("recordProbe: RESTORE FAILED for " + rec.file);
            row.tried.push({ kind, what: p.what, pairs: seen });
            row.pairs = seen;
            if (seen.some((x) => x.verdict === "noticed")) break;
            // *** AND STOP WHEN NOBODY COULD HAVE ANSWERED. *** If every guardian is already red or killed,
            // no further corruption can change a verdict -- trying the other mutations would be two more runs
            // of an expensive gate to re-learn the same nothing. The smoke test on PROBE_AT_V4536 did exactly
            // that before this line existed: both its guardians are red at baseline and it still ran all three.
            if (seen.every((x) => x.verdict === "unmeasurable")) break;
        }
        rows.push(row); done++; if (onProgress) onProgress(done, all.length, rec.name);
    }
    // *** THE RESTORE IS AUDITED, NOT ASSUMED. *** This writes to tracked source; a crash between the two
    // writes would leave a corrupted record that looks exactly like somebody's work in progress.
    const dirty = [...touched.entries()].filter(([f, orig]) => fs.readFileSync(f, "utf8") !== orig).map(([f]) => path.relative(root, f));
    if (dirty.length) throw new Error("recordProbe: FILES LEFT MODIFIED: " + dirty.join(", "));
    disarm();
    return { rows, filesTouched: touched.size, baselineGates: baseline.size,
             baselineRed: [...baseline.entries()].filter(([, v]) => v.killed || v.code !== 0).map(([g]) => g) };
}

/** The finding, as a value: records nothing can corrupt, and records nothing notices. */
/**
 * The finding, as a value.
 *
 * *** THE BUCKETS PARTITION, AND THE FIRST DRAFT'S DID NOT. *** It put four records in BOTH `unperturbable`
 * and `unguarded` and left three in none at all -- 149 names over 148 records, and a union of 145. A census
 * whose classes overlap double-counts its own evidence and one whose classes miss cannot say what it missed,
 * which is the shape this tree repairs most often. Every record lands in exactly one class, most-blocking
 * first, and `partition` proves it on every run rather than promising it here.
 */
export function summarise(res) {
    const rows = res.rows;
    const cls = (r) => {
        if (r.shape === "empty") return "empty";              // nothing in it to make false
        if (r.shape === "derived") return "derived";           // inherits its guardian through its source
        if (!r.guardians.length) return "unguarded";          // nothing could answer, whatever we did
        if (r.unperturbable || !r.pairs.length) return "opaque";   // a real gap in the vocabulary
        if (r.pairs.some((p) => p.verdict === "noticed")) return "noticed";
        if (r.pairs.every((p) => p.verdict === "unmeasurable")) return "unmeasurable";
        return "blind";                                       // at least one guardian COULD answer and did not
    };
    const by = { empty: [], derived: [], unguarded: [], opaque: [], noticed: [], unmeasurable: [], blind: [] };
    for (const r of rows) by[cls(r)].push(r.record);
    const total = Object.values(by).reduce((a, v) => a + v.length, 0);
    const seen = new Set(Object.values(by).flat());
    return {
        records: rows.length,
        ...by, noticedCount: by.noticed.length,
        // A partition is a CLAIM, so it is checked: every record once, and only once.
        partition: { total, distinct: seen.size, complete: total === rows.length && seen.size === rows.length },
        byKind: rows.reduce((a, r) => { for (const t of r.tried) a[t.kind] = (a[t.kind] || 0) + 1; return a; }, {}),
    };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const argv = process.argv.slice(2);
    const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
    const limit = argv.includes("--limit") ? Number(argv[argv.indexOf("--limit") + 1]) : null;
    let recs = defaultRecords();
    if (only) recs = recs.filter((r) => r.name === only);
    if (argv.includes("--non-numeric")) recs = recs.filter((r) => !(r.fields || []).length);
    if (limit) recs = recs.slice(0, limit);
    const res = probe({ records: recs, onProgress: (d, t, n) => process.stderr.write(`[recordProbe] ${d}/${t} ${n}\n`) });
    const s = summarise(res);
    if (argv.includes("--json")) console.log(JSON.stringify({ ...res, summary: s }, null, 1));
    else {
        console.log(`[recordProbe] ${s.records} record(s); ${s.noticedCount} have a guardian that NOTICED, ` +
                    `${s.blind.length} nothing noticed, ${s.unmeasurable.length} unmeasurable, ` +
                    `${s.opaque.length} opaque, ${s.empty.length} empty, ${s.derived.length} derived, ` +
                    `${s.unguarded.length} with no guardian. ` +
                    `PARTITION ${s.partition.complete ? "holds" : "BROKEN: " + s.partition.total + " over " + s.records}.`);
        console.log(`[recordProbe] mutations used: ${JSON.stringify(s.byKind)}; baseline ran ${res.baselineGates} ` +
                    `distinct gate(s), ${res.baselineRed.length} of them already red.`);
        for (const n of s.blind) console.log("   NOTHING NOTICED  " + n);
        for (const n of s.opaque) console.log("   OPAQUE           " + n);
    }
}
