#!/usr/bin/env node
// WebGLEngine/tools/ship/frozenRecords-selfcheck.mjs -- v4487 -- the gate for tools/ship/frozenRecords.mjs.
//
// Run: node tools/ship/frozenRecords-selfcheck.mjs
//
// *** THE EXPENSIVE HALF OF THIS ROUND CANNOT LIVE IN A GATE. *** The corruption sweep bumps 135 fields and
// runs a gate for each, in place, restoring after every one. That is an hour and it writes to the tree, and a
// gate must do neither. So the sweep is FROZEN and this file grades the two things that are affordable: the
// enumeration, driven both ways on fixtures, and the record's own arithmetic.
//
// ---- *** SIX SABOTAGES *** ------------------------------------------------------------------------------------
//
//  A. The record pattern loses its version stamp        -> 2 RED
//  B. Guardians are the SIBLING gate rather than derived-> 2 RED
//  C. A gate that names a record is not counted         -> 3 RED
//  D. `exclude` is ignored, so the file counts itself   -> 2 RED
//  E. The record's own arithmetic stops adding up       -> 2 RED
//  F. The probe's stated limit is dropped               -> 1 RED
//
// ---- *** WHAT THIS GATE DOES NOT CLAIM *** --------------------------------------------------------------------
//
// That 52 fields are 52 defects. UNNOTICED is not UNGUARDED: a +7 bump is a corruption a gate may reasonably
// survive, and the record carries a demonstration of exactly that on this round's own repair. Nor that the
// sweep would reproduce today -- it is a reading taken at v4487, and the two repairs this round shipped have
// already moved it, which is why the frozen number is compared against nothing live.
"use strict";
import { census, reportLines, sources, RECORD_RE, recordBody, FIELD_RE,
         PROBE_AT_V4487 as OLD, PROBE_AT_V4536 as REC, ENG }
    from "./frozenRecords.mjs";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);

console.log("frozenRecords-selfcheck -- which of this tree's frozen numbers anything actually checks\n");

// A fixture tree: the enumerator is handed source text, never the disk.
const F = (name, body) => path.join(ENG, "__fx_" + name + ".mjs");
// *** THE FIXTURES ARE ASSEMBLED, NEVER SPELLED, AND THIS GATE IS WHERE THAT MATTERS MOST. *** Written as
// literals they ARE version-stamped frozen exports, so they land in the census they exist to test -- the
// first draft did exactly that and section 2 caught it, reporting three new records where one was expected.
// v4409's rule (a fixture is not a gate) arriving through a string, for the FIFTH time this session, in the
// file built to count the things it is an instance of.
const EC = "export " + "const ", FR = " = Object." + "freeze(";
const T = "THING" + "_AT_V4321", L = "LONELY" + "_AT_V4322";
const FIX = {
    "mod": `${EC}${T}${FR}{\n  alpha: 3,\n  beta: 11,\n});\n${EC}PLAIN${FR}{ gamma: 1 });\n`,
    "mod-selfcheck": `import { ${T} } from "./mod.mjs";\nok(${T}.alpha === 3);\n`,
    "lonely": `${EC}${L}${FR}{\n  delta: 5,\n});\n`,
    "far-selfcheck": `import { ${L} } from "../lonely.mjs";\n`,
};
const run = (names) => census({
    files: names.map((n) => F(n)),
    read: (f) => FIX[path.basename(f).replace(/^__fx_|\.mjs$/g, "")],
    exclude: null,
});

// ---- 1. THE ENUMERATION, ON TEXT WHOSE ANSWER IS KNOWN BEFORE THE CODE RUNS -------------------------------------
console.log("1. what counts as a record, and who counts as its guardian");

{
    const c = run(["mod", "mod-selfcheck"]);
    ok("!! a version-stamped frozen export is a record, and a plain frozen one is not",
        c.records.length === 1 && c.records[0].name === T,
        "sabotage A: without the version stamp the pattern matches 427 frozen ALL-CAPS exports instead of 74, " +
        "and the population stops being 'a number a round measured and wrote down'");
    ok("...and its integer fields are enumerated",
        c.records[0].fields.join(",") === "alpha,beta");
    ok("!! ...and the gate that NAMES it is its guardian",
        c.records[0].guardians.length === 1 && /mod-selfcheck/.test(c.records[0].guardians[0]),
        "sabotage C: a guardian set that misses a real reader turns a guarded field into a finding");
}
{
    // *** THE GUARDIAN IS DERIVED, NOT ASSUMED, AND THIS IS THE FIXTURE FOR WHY. *** The first sweep of this
    // round probed each record against its SIBLING gate. Twenty-nine of seventy-four are not named by their
    // sibling -- 15 named elsewhere, 14 by nothing -- and 31 of the 83 catches came from a gate somewhere
    // else entirely.
    const c = run(["lonely", "far-selfcheck"]);
    const r = c.records[0];
    ok("!! *** a record guarded from ANOTHER DIRECTORY is guarded, and its sibling names it not at all ***",
        r.guardians.length === 1 && /far-selfcheck/.test(r.guardians[0]) && r.siblingNamesIt === false,
        "sabotage B: the sibling rule reports this one unguarded, which is what the first sweep did to " +
        "RECHECK_V4314 -- read by slowCensus-selfcheck.mjs and probed against redCensus-selfcheck.mjs");
    ok("...and `siblingNamesIt` is reported per record, so the two questions stay apart",
        typeof r.siblingNamesIt === "boolean" && c.siblingWrong === 1);
}
{
    const c = run(["lonely"]);
    ok("!! a record NO gate names is reported as such rather than as guarded",
        c.unguarded.length === 1 && c.unguarded[0] === L,
        "14 of the tree's 74 are in this state -- a number written down, version-stamped, frozen, and read " +
        "by nothing at all");
}

// ---- 1b. *** THE EXTRACTOR ITSELF, ON A FIXTURE CARRYING EVERY WAY THE WINDOW WAS WRONG *** ---------------------
// The 6,000-character window this replaced was wrong in four directions at once on this tree, and a census
// cannot demonstrate that about itself -- it would be comparing a ruler with the ruler. So the four failures
// are BUILT, in one string, and the extractor is required to get each of them right. Each line here is a real
// record from the tree reduced to its shape: an empty record followed by a fat one, a record longer than the
// old window, a record with more fields than the old cap, and a record with unbalanced parens inside a
// string, a comment and a regex -- which is why this is a lexer and not a regex.
{
    // *** THE FIXTURE IS ASSEMBLED SO ITS OWN TEXT IS NOT A RECORD, AND THE FIRST DRAFT WAS NOT. ***
    // Written as plain literals, these six lines ARE `export const NAME_VNNNN = Object.freeze(` in this
    // file's source, so the live census read 98 records instead of 92 and reported TRICKY_V4005 unbalanced --
    // a fixture inflating the very census it tests, which is a defect this file's own v4487 note already
    // records ("the fixtures inflated the census they test, the fifth"). Splitting the keyword means the
    // pattern never appears contiguously on disk, and the row below CHECKS that rather than trusting it.
    const EXP = "export " + "const ";
    const FILLER = "    // " + "x".repeat(120) + "\n";
    const FIXTURE = [
        EXP + 'EMPTY_V4001 = Object.freeze([]);',
        '',
        EXP + 'FAT_V4002 = Object.freeze({',
        '    alpha: 1,',
        '    beta: 22,',
        '});',
        '',
        EXP + 'LONG_V4003 = Object.freeze({',
        '    early: 5,',
        FILLER.repeat(60),                                  // pushes `late` past the old 6,000-char window
        '    late: 9,',
        '});',
        '',
        EXP + 'MANY_V4004 = Object.freeze({',
        ...Array.from({ length: 14 }, (_, i) => `    f${i}: ${i + 1},`),   // more than the old 12-field cap
        '});',
        '',
        EXP + 'TRICKY_V4005 = Object.freeze({',
        '    note: "a close paren ) inside a string",',
        '    // a close paren ) inside a comment',
        '    re: /[)]\\)/,',
        '    tpl: `a ) in a template ${1 + (2)} and more`,',
        '    kept: 3,',
        '});',
        '',
        EXP + 'AFTER_V4006 = Object.freeze({',
        '    trailing: 4,',
        '});',
    ].join("\n");
    const fields = (name) => {
        RECORD_RE.lastIndex = 0;
        let m, at = -1;
        while ((m = RECORD_RE.exec(FIXTURE))) if (m[1] === name) { at = m.index; break; }
        if (at < 0) return null;
        const { body, balanced } = recordBody(FIXTURE, at);
        if (!balanced) return "UNBALANCED";
        FIELD_RE.lastIndex = 0;
        return [...body.matchAll(FIELD_RE)].map((x) => x[1]).join(",");
    };
    const got = { EMPTY: fields("EMPTY_V4001"), FAT: fields("FAT_V4002"), LONG: fields("LONG_V4003"),
                  MANY: fields("MANY_V4004"), TRICKY: fields("TRICKY_V4005"), AFTER: fields("AFTER_V4006") };
    const many = Array.from({ length: 14 }, (_, i) => "f" + i).join(",");
    ok("!! *** CONTROL: an EMPTY record gets none of the next record's fields ***",
        got.EMPTY === "" && got.FAT === "alpha,beta",
        `EMPTY_V4001 -> [${got.EMPTY}], FAT_V4002 -> [${got.FAT}]. On this tree the window credited SIX empty ` +
        "records with 7-10 fields each: ROTATION_BOUNDARY_V4533 is `Object.freeze([])`, fifty-six bytes, and " +
        "was filed as carrying NINE numbers belonging to the record underneath it");
    ok("!! *** CONTROL: a record longer than 6,000 characters keeps the fields past that line ***",
        got.LONG === "early,late",
        `LONG_V4003 -> [${got.LONG}]. MEASURED_AT_V4462 is 11.4 KB and the window saw ONE of its ten; ` +
        "KEY_DRIFT_V4460 is 8 KB and it saw one of four, which is the red this round was registered under");
    ok("!! *** CONTROL: a record with more than twelve fields keeps all of them ***",
        got.MANY === many,
        `MANY_V4004 -> ${got.MANY === many ? "all 14" : "[" + got.MANY + "]"}. The old \`.slice(0, 12)\` hid ` +
        "three of MEASURED_AT_V4429's fifteen and four of MEASURED_AT_V4432's sixteen, silently, with " +
        "nothing anywhere saying a cap had been reached");
    ok("!! *** CONTROL: a close paren in a string, a comment, a regex or a template does not end the record ***",
        got.TRICKY === "kept" && got.AFTER === "trailing",
        `TRICKY_V4005 -> [${got.TRICKY}], and the record after it -> [${got.AFTER}]. THIS IS WHY IT IS A ` +
        "LEXER AND NOT A REGEX: these records are mostly prose, and stopping at the first `)` inside it " +
        "would truncate the body and hand the remainder to whatever comes next. (AFTER_V4006 was written " +
        "on ONE line in the first draft of this fixture and read as zero fields -- correctly: FIELD_RE " +
        "counts `name: <digits>,` on its OWN line, so a single-line record has none. That was the fixture " +
        "being wrong about the field rule, not the lexer being wrong about the body.)");
    // *** AND THE FIRST VERSION OF THIS ROW TESTED A SPELLING RATHER THAN THE PROPERTY. *** It asserted the
    // string `"export " + "const EMPTY_V4001"` was absent from this file, so a sabotage that collapsed EXP
    // back to one literal passed it -- correctly, as it happens, because the split is at `EXP + '...'` and
    // not inside EXP. A row that can only fail on ONE WAY of writing the mistake is not a row about the
    // mistake. THE PROPERTY IS ASKED OF THE CENSUS ITSELF: run it over this gate's own file and it must
    // find none of the six.
    const selfCensus = census({ files: [fileURLToPath(import.meta.url)] });
    const leaked = selfCensus.records.map((r) => r.name).filter((n) => /_V400\d$/.test(n));
    ok("!! ...and this fixture is NOT itself in the census it tests",
        leaked.length === 0,
        leaked.length
          ? `LEAKED: ${leaked.join(", ")} -- the fixture is being counted as ${leaked.length} real record(s)`
          : "the first draft of these six lines WAS six records: the live census read 98 where it reads " +
            `${census().records.length}, and reported TRICKY_V4005 unbalanced, because a fixture written as ` +
            "a plain literal is indistinguishable on disk from the thing it imitates. v4487's own note " +
            "records the same defect one round earlier -- 'the fixtures inflated the census they test'");
    ok("  ...and the live census closes every record it finds",
        census().unbalanced.length === 0,
        "an extraction that cannot find its closing paren is REPORTED rather than silently truncated at " +
        "end-of-file, which is the failure mode a hand-rolled lexer actually has");
}

// ---- 1b. THE TWO REACHABILITY EDGES, AND THE CONTROL THAT KEEPS THE SECOND ONE HONEST --------------------------
// The guardian search asks which gates NAME a record. It is blind to two ways a record is really reached, and
// both were found by a record reading UNGUARDED that a corruption test proved was not:
//
//   v4576  A DERIVED CONSTANT.   tools/ship/redCensus.mjs writes `RED_AT_V4531 = ...RED_AT_V4531_GATES.map()`,
//                                so gates name the derived one and the array is invisible to the search.
//   v4577  A DEFAULT ARGUMENT.   tools/mutate/shadowedDefaults.mjs writes `agreement(rows, frozen =
//                                ERASED_AT_V4394)` and its gate calls `agreement(S.rows)`. Measured: changing
//                                one frozen value takes that gate from 0 FAIL lines and exit 0 to 3 and exit 1.
//
// *** THE v4576 EDGE SHIPPED WITH NO ROW AT ALL AND THIS IS WHERE THAT IS REPAIRED. *** It was measured on the
// live tree, which is not the same as being held: nothing would have noticed it breaking.
//
// The control matters more than either edge. `agreement` is declared in THREE modules in this tree, so the
// first cut of the default-argument edge -- which searched gate sources for `\bagreement\s*\(` -- credited
// ERASED_AT_V4394 to samplerCheck-selfcheck and videoFrames-selfcheck (each calling its OWN agreement) and to
// shipBridge-selfcheck, where the word is English inside a test label. THREE FALSE GUARDIANS OUT OF FOUR, in
// the column that decides whether a record is checked at all. The edge follows the import BINDING now, and the
// impostor below is what holds it to that.
{
    console.log("\n1b. the derived constant and the default argument, with an impostor to catch the loose match");
    const DER = "SEED" + "_AT_V4323", DFL = "GUARD" + "_AT_V4324";
    // The default-argument edge resolves import specifiers against the DISK, so these three exist for the
    // length of this block and are removed in the finally. Distinct names, and nothing else reads them.
    const disk = {
        "__fx2_dflt.mjs":
            `${EC}${DFL}${FR}{\n  cell: 6,\n});\n` +
            `export function agreeOn(rows, frozen = ${DFL}) { return rows.length + frozen.cell; }\n`,
        "__fx2_dflt-selfcheck.mjs":
            `import { agreeOn } from "./__fx2_dflt.mjs";\nagreeOn([1, 2]);\n`,
        // *** THE CONTROL: same function name, its OWN declaration, no import from the fixture. ***
        "__fx2_impostor-selfcheck.mjs":
            `function agreeOn(a) { return a; }\nagreeOn(1);\n`,
    };
    const written = [];
    try {
        for (const [n, body] of Object.entries(disk)) {
            const f = path.join(ENG, n);
            fs.writeFileSync(f, body); written.push(f);
        }
        const c = census({ files: written, exclude: null });
        const g = (n) => (c.records.find((r) => r.name === n) || { guardians: [] }).guardians;
        ok("!! *** a record reached as a DEFAULT ARGUMENT is guarded by the gate that calls the function ***",
           g(DFL).includes("__fx2_dflt-selfcheck.mjs"),
           `${DFL} -> [${g(DFL).join(", ") || "nothing"}]. The gate never types the record's name; it calls ` +
           "agreeOn with one argument, which is how tools/mutate/shadowedDefaults-selfcheck.mjs exercises the " +
           "record named in the note above on every run, while that record read as unguarded. *** THE NAME IS " +
           "NOT SPELLED HERE ON PURPOSE. *** The guardian search strips COMMENTS and deliberately not STRINGS, " +
           "so an evidence string naming a real record credits THIS gate with guarding it -- and this gate " +
           "tests a fixture. The first draft of this row spelled it and moved that record from over-budget to " +
           "CHECKED, on prose, in the round about prose being counted as code");
        ok("!! *** CONTROL: a gate calling its OWN function of the same name is NOT credited ***",
           !g(DFL).includes("__fx2_impostor-selfcheck.mjs"),
           `${DFL} -> [${g(DFL).join(", ") || "nothing"}]. This is the row that cost three of four guardians ` +
           "on the real tree: `agreement` is declared in three modules here, and a bare name search credited " +
           "two gates calling their own and one using the word in English. The edge follows the import " +
           "binding -- `{ fn }`, `{ fn as other }`, `* as NS` then `NS.fn` -- and nothing else");
    } finally { for (const f of written) { try { fs.unlinkSync(f); } catch {} } }

    // The v4576 edge needs no disk: it is visible in the defining module's own text, which is the standard it
    // was built to. So it runs on the injected-read fixtures, like everything else in section 1.
    const DFIX = {
        "der": `${EC}${DER}${FR}["a", "b"]);\n${EC}DERIVED_AT_V4325${FR}${DER}.map((x) => x + "!"));\n`,
        "der-selfcheck": `import { DERIVED_AT_V4325 } from "./der.mjs";\nok(DERIVED_AT_V4325.length === 2);\n`,
    };
    const dc = census({ files: ["der", "der-selfcheck"].map((n) => path.join(ENG, "__fx3_" + n + ".mjs")),
                        read: (f) => DFIX[path.basename(f).replace(/^__fx3_|\.mjs$/g, "")], exclude: null });
    const dg = (dc.records.find((r) => r.name === DER) || { guardians: [] }).guardians;
    ok("!! *** a record consumed only through a constant DERIVED FROM IT is guarded by that one's gates ***",
       dg.includes("__fx3_der-selfcheck.mjs"),
       `${DER} -> [${dg.join(", ") || "nothing"}]. The gate names DERIVED_AT_V4325 and never the array under ` +
       "it. ONE level and ONE file: a transitive closure over the tree would start crediting records with " +
       "gates that never touch their value, which is how a coverage number becomes a story");
    const other = (dc.records.find((r) => r.name === "DERIVED_AT_V4325") || { guardians: [] }).guardians;
    ok("  ...and the edge runs one way -- the derived record does not inherit the array's guardians",
       other.length === 1 && other[0] === "__fx3_der-selfcheck.mjs",
       `DERIVED_AT_V4325 -> [${other.join(", ")}]`);
}

// ---- 2. *** THE FILE IS ITSELF A RECORD, SO IT MOVED THE COUNT IT MEASURES *** -----------------------------------
console.log("\n2. the observer effect, checked to be exactly one");

{
    const all = census();
    const without = census({ exclude: /frozenRecords/ });
    // v4536: this module now carries TWO records -- the v4487 sweep and the v4536 re-run that supersedes it --
    // so the delta is DERIVED from what the module actually declares rather than typed as a number. The row
    // that mattered is unchanged: the count moves by exactly the records this file adds, and no more.
    const MINE = ["PROBE_AT_V4487", "PROBE_AT_V4536"];
    ok(`!! *** counting this module adds EXACTLY ${MINE.length} records, which are ${MINE.join(" and ")} ***`,
        all.records.length - without.records.length === MINE.length &&
        MINE.every((n) => all.records.some((r) => r.name === n)) &&
        MINE.every((n) => !without.records.some((r) => r.name === n)),
        `sabotage D: v3453's observer effect in a file built to count the things it is an instance of. ` +
        `'The number changed when I wrote it down' is a curiosity until somebody checks it changed by ` +
        `exactly what this file declares -- ${all.records.length} against ${without.records.length}`);
    // v4527 -- *** THE POPULATION THE SWEEP WAS TAKEN AGAINST IS DERIVED, NOT PINNED. *** This row compared the live
    // census to 74 / 135 and went red the round a new version-stamped record arrived (physics/raceKnob.mjs's
    // MEASURED_V4527), which is a count pinned to a moment -- the species this tree names most. A record whose stamp is
    // AFTER v4487 cannot have been in a sweep taken at v4487, so the reading the sweep was taken against is the census
    // WITHOUT those arrivals, and the arrivals are named beside it rather than counted into a number that cannot move.
    // *** v4535 -- AND THE STAMP IS NOT THE ARRIVAL, WHICH v4534 PAID FOR AND WROTE DOWN AS OWED. ***
    // PROBE_AT_V4487's own note: "A STAMP IN A NAME IS A CLAIM ABOUT THE SUBJECT, NOT ABOUT THE ARRIVAL, so
    // a record written now about a past version lands in the past and is counted as having been in a sweep
    // it could not have been in" -- corrected there by moving 74 to 76 and naming the two, with the debt
    // stated: "the next record named for a version it merely DESCRIBES will land in the past silently
    // again." THE NEXT ONE WAS THE NEXT ROUND. v4535 lifted KEY_DRIFT_V4460's growing ledger of key moves
    // into KEY_MOVES_V4460 -- stamped for its subject, correctly, by that same rule -- and the count went to
    // 77 within the hour.
    //
    // So the arrival is ASKED FOR rather than inferred from a name. The v4487 tree is a commit; the records
    // that were in the sweep are the ones whose declarations appear in it, and git can be asked in one call.
    // That dissolves BOTH hand-corrections: nothing is added to a list when a record lands in the past, and
    // a record that vanishes from the census is caught the same way. If git cannot answer -- a shallow clone,
    // no history -- the row says so and falls back to the stamp, because a check that cannot run is not a
    // check that passes and it must not pretend the fallback is the measurement.
    const stampOf = (name) => { const m = /V(\d{3,4})/.exec(name); return m ? +m[1] : 0; };
    const sweepV = +REC.at.replace(/^v/, "");
    let atSweepNames = null;
    try {
        const out = execFileSync("git", ["grep", "-h", "-E",
            "export const [A-Z][A-Z0-9_]*V[0-9]{3,4}[A-Z0-9_]* = Object\\.freeze\\(", REC.commit],
            { cwd: ENG, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
        const set = new Set();
        for (const m of out.matchAll(/export const ([A-Z][A-Z0-9_]*V\d{3,4}[A-Z0-9_]*) = Object\.freeze\(/g)) set.add(m[1]);
        if (set.size > 0) atSweepNames = set;
    } catch { atSweepNames = null; }
    const arrivals = atSweepNames
        ? without.records.filter((r) => !atSweepNames.has(r.name))
        : without.records.filter((r) => stampOf(r.name) > sweepV);
    const atSweep = { records: without.records.length - arrivals.length, fields: without.fields - arrivals.reduce((a, r) => a + r.fields.length, 0) };
    // *** v4536 -- THIS ROW WAS COMPARING TWO DIFFERENT POPULATIONS AND THE BROKEN WINDOW HID IT. ***
    // It took today's census, removed the records that arrived after the sweep, and asserted the remainder
    // equalled the sweep's frozen count -- for BOTH records and fields. The record half is sound: a record
    // either existed at that commit or it did not, and git is asked. THE FIELD HALF NEVER WAS. A record that
    // existed at v4487 and has GAINED a numeric field since moves that total without any record arriving, and
    // editing a record is the ordinary thing this tree does all day. It read 135 = 135 only because the window
    // was undercounting today by about as much as the tree had grown; replayed correctly the v4487 tree held
    // 138 and those same 74 records carry 142 today. FOUR FIELDS WERE ADDED TO PRE-EXISTING RECORDS, which is
    // not a finding -- and a row that calls it one is a row somebody will eventually switch off.
    //
    // So the ASSERTION is the identity that is stable under editing, and the drift is REPORTED beside it.
    const fieldDrift = atSweep.fields - REC.v4487Recount.fields;
    ok("!! the records that existed at the sweep's commit are still exactly the population it was taken over",
        atSweep.records === REC.v4487Recount.records,
        `${atSweep.records} of today's records existed at ${REC.commit}, against the ${REC.v4487Recount.records} ` +
        `the replay counts there. Those same records carry ${atSweep.fields} numeric fields today against ` +
        `${REC.v4487Recount.fields} then -- ${fieldDrift >= 0 ? "+" : ""}${fieldDrift} from ORDINARY EDITING of ` +
        "records that already existed, REPORTED rather than asserted, because a record gaining a field is not " +
        "a record arriving. " +
        (arrivals.length ? `Arrived since: ${arrivals.map((r) => r.name + " (" + r.fields.length + " fields)").join(", ")}` : "Nothing has arrived since."));
    // The whole-tree reading this round froze, checked as a pair so neither half can drift alone. It is
    // deliberately NOT a ratchet: a round that adds a record re-takes it, which is one line and is the price
    // of a number that means what it says.
    ok("!! ...and this round's own reading of the whole census is what the tree still holds",
        without.records.length === REC.excluding.records && without.fields === REC.excluding.fields &&
        without.withFields === REC.excluding.withFields,
        `${without.records.length} records, ${without.withFields} with fields, ${without.fields} fields ` +
        `excluding this module, against the ${REC.excluding.records} / ${REC.excluding.withFields} / ` +
        `${REC.excluding.fields} measured at ${REC.at}. A ROUND THAT ADDS A RECORD RE-TAKES THIS, and that is ` +
        "the point: the alternative is a number nobody re-derives.");
    ok("!! *** the arrivals are read out of the v4487 COMMIT, not out of the names ***",
        !!atSweepNames && atSweepNames.size > 0 &&
        // the derivation must actually disagree with the naive rule somewhere, or it is the naive rule
        // wearing a git call: the two records v4534 had to name by hand are exactly the disagreement.
        arrivals.some((r) => stampOf(r.name) <= sweepV) &&
        arrivals.every((r) => r.file.endsWith(".mjs")),
        atSweepNames
          ? `${atSweepNames.size} record declarations in ${REC.commit}; ${arrivals.length} of the census are ` +
            `not among them, and ${arrivals.filter((r) => stampOf(r.name) <= sweepV).length} of THOSE carry a ` +
            "stamp at or before the sweep -- records named for the version they DESCRIBE, which the naive " +
            "rule counts as having been present. That set is what v4534 had to name by hand."
          : "*** GIT COULD NOT ANSWER, so this fell back to reading the stamp out of the name -- THE " +
            "FALLBACK IS NOT THE MEASUREMENT and this row is red rather than quietly green on it.");
    say(reportLines(without).join("\n  ----  "));
}

// ---- 3. THE FROZEN SWEEP'S OWN ARITHMETIC ------------------------------------------------------------------------
console.log("\n3. the record the sweep left behind");

// *** v4536 -- FOUR CLASSES, AND THE FOURTH AND THIRD ARE THE POINT. *** v4487 split 135 fields into
// noticed and unnoticed and nothing else, so a field whose only guardian gate was ALREADY RED scored as
// unnoticed, and so did a field whose record no gate names at all. A bump cannot redden what is already red
// and there is nothing to run when nothing names the record; neither is evidence that nobody is watching.
// v4408's rule, which this file keeps re-learning: 'never observed' and 'observed green' are different, and
// one bucket for both is how the second becomes the first.
ok("!! *** all FOUR classes account for every field in the population ***",
    REC.noticed + REC.unnoticed + REC.unmeasurable + REC.noGuardianAtAll === REC.fields,
    `sabotage E: ${REC.noticed} noticed + ${REC.unnoticed} unnoticed + ${REC.unmeasurable} unmeasurable + ` +
    `${REC.noGuardianAtAll} with no guardian = ${REC.fields}. The unnoticed rate is ${REC.unnoticed} of the ` +
    `${REC.noticed + REC.unnoticed} that COULD be measured, ` +
    `${(100 * REC.unnoticed / (REC.noticed + REC.unnoticed)).toFixed(1)}%, against v4487's ${OLD.unnoticed} ` +
    `of ${OLD.fields} = ${(100 * OLD.unnoticed / OLD.fields).toFixed(1)}%. A headline beside a list that ` +
    "does not add up is v4296's mistake, and it is the cheapest of all of these to check");
// *** THE PROBE RAN IN TWO PASSES AND BOTH ARE KEPT, SO THE MOVE IS CHECKABLE RATHER THAN ASSERTED. ***
// The first pass could not measure seventeen fields: their only guardian gates were red before a bump, and
// a bump cannot redden what is already red. Both blockers went green while the round ran -- one of them
// BECAUSE of it -- and the seventeen were re-probed. Keeping only the final figures would leave "0
// unmeasurable" looking like a property of the tree when it is the outcome of a repair, so the first pass,
// the re-probe and the total are all recorded and required to reconcile.
{
    const U = REC.unmeasurableFirstPass || {};
    const F1 = U.firstPass || {}, RP = U.reProbed || {};
    ok("!! *** the first pass, the re-probe and the total reconcile -- and the seventeen did not vanish ***",
        F1.noticed + F1.unnoticed + F1.unmeasurable + F1.noGuardianAtAll === REC.fields &&
        RP.noticed + RP.unnoticed + RP.unmeasurable === F1.unmeasurable &&
        F1.noticed + RP.noticed === REC.noticed && F1.unnoticed + RP.unnoticed === REC.unnoticed &&
        REC.unmeasurable === 0 && Array.isArray(U.blockedBy) && U.blockedBy.length === 2,
        `first pass ${F1.noticed}/${F1.unnoticed}/${F1.unmeasurable}/${F1.noGuardianAtAll}; the ` +
        `${F1.unmeasurable} unmeasurable re-probed as ${RP.noticed} noticed and ${RP.unnoticed} unnoticed; ` +
        `total ${REC.noticed}/${REC.unnoticed}/${REC.unmeasurable}/${REC.noGuardianAtAll} of ${REC.fields}. ` +
        `Blocked by ${(U.blockedBy || []).map((g) => g.replace(/^tools\/ship\//, "")).join(" and ")} -- both ` +
        "green now, so the class is EMPTY BECAUSE THE OBSTACLE WAS REMOVED, not because it never existed");
}

// *** AND THE OLD RECORD IS HELD TO THE REPLAY THAT RETIRED IT. *** Not a re-derivation and it says so: the
// replay was run once, over 75f0c033's tree with the balanced extractor, and its result is recorded above.
// What is checked here is that the recount and the record it corrects are consistent with each other and
// with the count of fields the v4487 sweep therefore never probed.
ok("!! the v4487 record is superseded by a REPLAY at its own commit, and the arithmetic of that is checked",
    REC.v4487Recount.fields - OLD.fields === REC.v4487Recount.neverProbed &&
    REC.v4487Recount.records === OLD.records && REC.v4487Recount.withFields !== OLD.withFields &&
    REC.commit === OLD.commit,
    `replayed at ${REC.commit} with a balanced extraction the v4487 tree held ${REC.v4487Recount.records} ` +
    `records, ${REC.v4487Recount.withFields} with fields, ${REC.v4487Recount.fields} fields; the record ` +
    `says ${REC.v4487Recount.recordSays}. SO ${REC.v4487Recount.neverProbed} FIELDS IN THAT TREE WERE NEVER ` +
    "PROBED and one record was credited with fields it does not have. THIS IS A CONSISTENCY CHECK ON A " +
    "REPLAY RECORDED HERE, NOT A RE-RUN OF IT -- re-walking a 1,500-file tree at another commit is not " +
    "what a gate can afford, and a check pretending to be a re-derivation is the worse of the two failures");
ok("...and the counted subsets do not exceed the population they are drawn from",
    REC.nothingNoticesAnyField <= REC.withFields && REC.fullyGuarded <= REC.withFields &&
    REC.noGateNamesIt <= REC.records && REC.caughtByANonSiblingGate <= REC.noticed &&
    REC.unmeasurableRecords.length <= REC.withFields && REC.baselineRedGates.length <= REC.guardianGates &&
    // v4548: against the LIVE counterpart, not against the frozen v4536 reading -- see the note beside
    // currentIncludingModule. This row went red at v4548 because excluding (re-taken, 92) passed records
    // (frozen at v4536, 91), which is the tree growing rather than a subset escaping its population.
    REC.excluding.fields <= REC.currentIncludingModule.fields &&
    REC.excluding.records <= REC.currentIncludingModule.records &&
    REC.excluding.withFields <= REC.currentIncludingModule.withFields);
// ...and the live counterpart is genuinely live: it must be exactly this module's own records ahead of the
// excluding reading, which is the only difference between the two censuses that produced them.
{
    const F = REC;
    ok("!! the with-module and without-module readings differ by exactly this module's own records",
        F.currentIncludingModule.records - F.excluding.records === 2 &&
        F.currentIncludingModule.withFields - F.excluding.withFields === 2,
        `${F.currentIncludingModule.records} including against ${F.excluding.records} excluding -- ` +
        "PROBE_AT_V4536 and PROBE_AT_V4487, the two records this file holds. A pair of numbers that drifted " +
        "apart by anything else would mean the exclude pattern had stopped matching this module.");
}
ok("!! *** the method is stated, so a later sweep can be compared rather than merely disagreed with ***",
    /bump one integer field by 7/.test(String(REC.method)) && /every gate that NAMES/.test(String(REC.method)) &&
    /ALREADY RED/.test(String(REC.method)),
    "v4536 adds the baseline to the stated method, because a sweep that does not take one cannot tell " +
    "UNMEASURABLE from UNNOTICED and will report the difference as debt");
// *** v4536 -- AND THIS ROW ITSELF CRASHED THE GATE, WHICH IS THE FIFTH INSTANCE OF THE SHAPE IT WARNS
// ABOUT TWELVE LINES DOWN. *** Pointing REC at the v4536 record left `REC.firstSweepUsedSiblingsOnly`
// undefined and the row threw before `ok` was ever called -- no FAIL line, exit 1, and a count of FAIL lines
// reading a crash as a clean zero. A CRASH IS NOT A VERDICT. The two records are named separately now, and
// every field read off either one is guarded, so a missing field FAILS this row instead of taking the gate
// down. There are now THREE readings kept, not two, and the trend across them is the evidence:
//     first sweep, siblings assumed      37.0% unnoticed of 135, guardian set a GUESS
//     v4487, guardians derived           38.5% unnoticed of 135, enumerated by a 6,000-character window
//     v4536, window replaced, baselined  43.3% unnoticed of the 127 that COULD be measured
const FIRST = (OLD && OLD.firstSweepUsedSiblingsOnly) || {};
ok("!! ...and EVERY earlier sweep is kept, with what was wrong with each",
    FIRST.unnoticedPct === 37.0 && /assumed/.test(String(FIRST.wrong)) &&
    OLD.at === "v4487" && OLD.fields === 135 && REC.at === "v4536",
    `${FIRST.unnoticedPct || "?"}% (siblings assumed) -> ${(100 * OLD.unnoticed / OLD.fields).toFixed(1)}% ` +
    `(guardians derived, window enumerated) -> ${(100 * REC.unnoticed / (REC.noticed + REC.unnoticed)).toFixed(1)}% ` +
    "(window replaced, baseline taken). THE HEADLINE BARELY MOVES AND WHAT IS UNDER IT MOVES ENORMOUSLY, " +
    "every time. A discarded reading is evidence about the method, and these three say a defensible number " +
    "can rest on a guess, then on a broken ruler, and still look like progress");
// *** THE DETAIL IS COMPUTED DEFENSIVELY, AND THAT IS THE FOURTH TIME THIS SESSION. *** Reading the field
// eagerly here means a sabotage that DELETES it throws before `ok` is called, no FAIL line prints, and a
// count of FAIL lines reads the crash as a clean zero -- which is what sabotage F did on the first run.
// v4485's gate had it, v4486's runner grew a load-check for it, changedPaths was repaired for it, and it
// arrived again here. FOUR INSTANCES, ONE SHAPE: a detail string that assumes the thing the condition is
// about to say may be missing.
const LIMIT = (OLD && OLD.probeCatchesOneDirection) || {};
ok("!! *** and the limit is DEMONSTRATED on a real repair, not merely asserted ***",
    !!(OLD && OLD.probeCatchesOneDirection) && LIMIT.stillUnnoticed === true &&
    /TAINT_AT_V4479/.test(String(LIMIT.shown)),
    `sabotage F: ${LIMIT.why || "NO LIMIT RECORDED"}. The guard added to that record catches a DOWNWARD ` +
    "corruption; the probe applies an UPWARD one; so a real guard reads here as no guard, and the field " +
    "stays in the unnoticed count rather than being argued out of it");
ok("both records are frozen", Object.isFrozen(REC) && Object.isFrozen(OLD) && Object.isFrozen(LIMIT) &&
   Object.isFrozen(REC.excluding) && Object.isFrozen(REC.windowFailures) && Object.isFrozen(REC.v4487Recount));

// ---- 4. THE TWO REPAIRS THIS ROUND SHIPPED ------------------------------------------------------------------------
console.log("\n4. what was closed, checked against the files rather than claimed");

{
    const shape = fs.readFileSync(path.join(ENG, "tools/ship/assertionShape-selfcheck.mjs"), "utf8");
    ok("!! *** assertionShape compares ALL NINE rows of its census, where it compared four ***",
        /\["gates", REC\.gates/.test(shape) && /\["usesOk", REC\.usesOk/.test(shape) &&
        /\["nameFirst", REC\.nameFirst/.test(shape) && /\["unknownSignature"/.test(shape),
        "gates, usesOk, nameFirst, distinctDefinitions and unknownSignature were re-taken by hand every " +
        "round with nothing checking them -- and vba/runtimeGap.mjs found the IDENTICAL defect in itself at " +
        "v4462, eighteen rounds earlier. The lesson did not travel");
    const taint = fs.readFileSync(path.join(ENG, "tools/roundhouse/observableTaint-selfcheck.mjs"), "utf8");
    ok("...and observableTaint's build counts are at least consistent, which is SAID to be less than derived",
        /buildsWhereNothingMoved <= REC\.builds/.test(taint) && /NOT a re-derivation/.test(taint),
        "the sweep those numbers came from is 40 builds, so a gate cannot re-run it -- and a consistency " +
        "check that pretended to be a re-derivation would be the worse of the two failures");
}

console.log(`\nfrozenRecords-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
