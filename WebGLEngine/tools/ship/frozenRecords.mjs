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
            const i = src.indexOf(`export const ${name} = Object.freeze(`);
            const body = src.slice(i, i + 6000);
            const fields = [...body.matchAll(/\n\s+([A-Za-z_][A-Za-z0-9_]*):\s*\d+\s*,/g)]
                .slice(0, 12).map((x) => x[1]);
            const sib = rel(f).replace(/\.mjs$/, "-selfcheck.mjs");
            const guardians = gateSrc.filter(([, s]) => s.includes(name)).map(([g]) => g);
            rows.push(Object.freeze({
                name, file: rel(f), fields: Object.freeze(fields),
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
        siblingWrong: rows.filter((r) => r.guardians.length && !r.siblingNamesIt).length,
    });
}

/**
 * *** THE SWEEP, FROZEN, BECAUSE IT COSTS AN HOUR AND A GATE MAY NOT. *** Each row is a field that was really
 * bumped and a gate that was really run. corroborationCensus freezes a 4.79-hour sweep for the same reason;
 * what a gate can afford is the cheap half -- the enumeration above -- plus a ratchet on this number.
 */
export const PROBE_AT_V4487 = Object.freeze({
    at: "v4487",
    method: "bump one integer field by 7 in place, run every gate that NAMES the record, restore; a field is " +
            "NOTICED if any of them exits 1",
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
