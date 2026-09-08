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

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKIP = /node_modules|[\\/]vendor[\\/]|[\\/]dist[\\/]/;

/** A record is a version-stamped, frozen, exported constant -- this tree's idiom for "measured at vNNNN". */
export const RECORD_RE = /export const ([A-Z][A-Z0-9_]*V\d{3,4}[A-Z0-9_]*) = Object\.freeze\(/g;

export function sources(dir = ENG, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (SKIP.test(p)) continue;
        if (e.isDirectory()) sources(p, out);
        else if (/\.(mjs|js)$/.test(e.name)) out.push(p);
    }
    return out;
}

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
export function census({ files = null, read = (f) => fs.readFileSync(f, "utf8"), exclude = null } = {}) {
    const list = (files || sources()).filter((f) => !exclude || !exclude.test(rel(f)));
    const gates = list.filter((f) => /-selfcheck\.mjs$/.test(f));
    const gateSrc = gates.map((g) => [rel(g), read(g)]);
    const rows = [];
    for (const f of list.filter((f) => /\.mjs$/.test(f))) {
        const src = read(f);
        RECORD_RE.lastIndex = 0;
        let m;
        while ((m = RECORD_RE.exec(src))) {
            const name = m[1];
            // v4536: m.index, not a fresh indexOf from the top of the file -- the match already knows where it
            // is, and searching again for a name that appears earlier in prose would find the prose.
            const { body, balanced } = recordBody(src, m.index);
            FIELD_RE.lastIndex = 0;
            const fields = [...body.matchAll(FIELD_RE)].map((x) => x[1]);
            const sib = rel(f).replace(/\.mjs$/, "-selfcheck.mjs");
            const guardians = gateSrc.filter(([, s]) => s.includes(name)).map(([g]) => g);
            rows.push(Object.freeze({
                name, file: rel(f), fields: Object.freeze(fields), bytes: body.length, balanced,
                guardians: Object.freeze(guardians),
                siblingNamesIt: guardians.includes(sib),
            }));
        }
    }
    return Object.freeze({
        records: Object.freeze(rows),
        withFields: rows.filter((r) => r.fields.length).length,
        fields: rows.reduce((a, r) => a + r.fields.length, 0),
        unguarded: Object.freeze(rows.filter((r) => !r.guardians.length).map((r) => r.name)),
        unbalanced: Object.freeze(rows.filter((r) => !r.balanced).map((r) => r.name)),
        siblingWrong: rows.filter((r) => r.guardians.length && !r.siblingNamesIt).length,
    });
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
    excluding: Object.freeze({ records: 90, withFields: 37, fields: 146 }),
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
