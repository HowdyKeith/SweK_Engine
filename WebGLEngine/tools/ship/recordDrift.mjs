// tools/ship/recordDrift.mjs -- v4482
//
// *** FOUR ROUNDS RUNNING, ADDING A MODULE INVALIDATED HAND-MAINTAINED RECORDS IN OTHER FILES, AND EVERY ONE
// WAS DISCOVERED BY A FIVE-MINUTE SHIP VERIFY. *** Measured off the commits:
//
//     v4478   instruments.mjs   runtimeGap.mjs   sweep-timings.json
//     v4479                     runtimeGap.mjs   sweep-timings.json
//     v4480   instruments.mjs   runtimeGap.mjs   sweep-timings.json   assertionShape.mjs
//     v4481   instruments.mjs   runtimeGap.mjs   sweep-timings.json   assertionShape.mjs
//
// *** THE SET IS NOT FIXED -- IT IS TWO TO FOUR, AND WHICH ONES DEPENDS ON WHAT THE ROUND ADDED. *** A module
// exporting reportLines owes the registry an entry; one that is a gate owes the sweep a timing and a closing;
// one that is a .mjs anywhere owes runtimeGap's twelve-row census; one that defines `ok` moves
// assertionShape's count. So a round cannot memorise the list, and v4481 proved that even knowing the pattern
// is not enough: it assumed the file total would rise by two, as it had three rounds running, and the total
// did not move at all -- budgetMargin's two files sit outside the population that census walks.
//
// Each of these records is derivable in milliseconds. The verify takes five minutes. That gap is the whole
// subject: this file asks the same questions the gates ask, before the verify rather than after it.
//
//     assertionShape census      195 ms
//     closingCoverage             19 ms
//     registryOrphans scan        24 ms
//     gate enumeration            12 ms
//
// ---- *** IT REPORTS AND IT DOES NOT WRITE, WHICH IS NOT A CONVENIENCE DECISION *** ----------------------------
//
// v3698's refusal, which claimCheck-selfcheck states as a mechanism rather than a promise: A LOOP THAT BOTH
// WRITES THE RECORD AND GRADES IT CAN MARK ITS OWN WORK PASSED. Every number below is a claim somebody made
// about the tree, and a tool that silently re-took them would turn a stale claim into a fresh one without
// anybody deciding it was still true. So this names what drifted and what it would have to say; a person or a
// round changes it.
//
// ---- *** THE FOURTH RECORD CANNOT BE CHECKED FROM HERE, AND THE REASON IS A GOOD ONE *** -----------------------
//
// vba/runtimeGap.mjs has ZERO imports. It is pure -- functions over data handed in -- and its file walker
// lives as a private `sources()` inside its gate, which is why the only way to learn whether its census has
// gone stale is to run that gate. The obvious repair, moving the walker into the module, was tried and
// REVERTED: it would have put fs and path into a module whose import-free-ness is a property worth more than
// this file's convenience. The walker therefore lives HERE, exported, and runtimeGap-selfcheck imports it --
// one definition, no second walker re-deriving the pattern, and the pure module stays pure.
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ---------------------------------------------------------------------
//
// That it knows every hand-maintained record in the tree. It knows the five it was built from, all of them
// found by being bitten. A record nobody has tripped over yet is not in here, and `known` is a list rather
// than a discovery.
//
// That a clean report means the verify will pass. It checks derived-record staleness and nothing else -- a
// round can be clean here and red on the actual subject of its gate, which is the ordinary case.
//
// That re-deriving a record is the same as checking it. The gates ask more: registryOrphans checks both
// directions and the bench-eligibility of every entry, closingCoverage attributes duplicates by name. This
// asks the ONE question a new module makes urgent -- has what I just added moved this number.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as TR from "./treeRead.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Every .mjs and .js in the tree, with its text. Lifted VERBATIM from runtimeGap-selfcheck's private
 * `sources()` and exported here so that gate can import it instead of defining it -- see the header on why it
 * could not move into runtimeGap.mjs itself.
 */
// *** v4548 -- THE WALK MOVED TO tools/ship/treeRead.mjs, AND THE REASON IS A MEASUREMENT. *** This gate read
// every file in the tree SIX times and walked every directory EIGHTEEN times -- 23,429 readFileSync and
// 12,397 readdirSync over 4,025 files -- because checks() calls four censuses that each re-derive the same
// read, and the gate calls checks() six times over. 2,463 ms of that was 606 ms of actual work, and the
// 3,026 ms it measured at put it OVER the 3,000 ms ship-time budget, so the tree's own drift detector was
// the thing the ritual could not afford to run. treeRead memoises one read per process. The name and shape
// here are unchanged, so nothing that imports sources() had to know.
export const SOURCE_SKIP = TR.SKIP_AGREE.recordDrift;
export function sources(dir = ENG) { return TR.treeFiles(dir); }

/** What each record owes, and what makes a module owe it. Named, so a report says WHY not just WHAT. */
export const OWES = Object.freeze({
    registry: "a module exporting reportLines owes physics/instruments.mjs an entry",
    closing: "a new gate owes gateSweep.mjs a closing that names it",
    timing: "a new gate owes tools/ship/sweep-timings.json a runtime, a capture stamp and a kind (v4579: loaded, alone or capped -- a ms without one is two quantities)",
    assertion: "a gate defining its own ok() moves tools/ship/assertionShape.mjs's census",
    runtimeGap: "any new .mjs moves vba/runtimeGap.mjs's twelve-row capability census",
    index: "a new gate owes knowledge-index.json a rebuild, and every check reading it owes nothing until it has one",
    redCensus: "a gate that goes green owes tools/ship/redCensus.mjs the removal of its registered-red entry",
});

/**
 * The checks, each returning {name, stale, recorded, actual, owes}. Injectable so the gate can hand this a
 * deliberately stale record and watch it be found -- a drift detector that cannot be given drift is a
 * detector nobody has run.
 */
const CENSUS_MEMO = new Map();

export async function checks({ load = null, timings = null } = {}) {
    const mod = load || ((p) => import(p));
    const out = [];

    const A = await mod("./assertionShape.mjs");
    const ac = A.census();
    out.push({
        name: "assertionShape census", owes: OWES.assertion,
        recorded: A.SHAPE_AT_V4480.definesOk, actual: ac.definesOk,
        stale: A.SHAPE_AT_V4480.definesOk !== ac.definesOk || A.SHAPE_AT_V4480.gates !== ac.gates,
        detail: `gates ${A.SHAPE_AT_V4480.gates} vs ${ac.gates}, copies ${A.SHAPE_AT_V4480.definesOk} vs ${ac.definesOk}`,
    });

    const C = await mod("./closingCoverage.mjs");
    const cc = C.coverage();
    out.push({
        name: "sweep closings", owes: OWES.closing,
        recorded: 0, actual: cc.summedUncovered,
        stale: cc.summedUncovered > 0 || cc.duplicates.length > 0,
        detail: `${cc.summedUncovered} gate(s) no closing names, ${cc.duplicates.length} duplicate claim(s)`,
    });

    // ---- *** v4483 -- THE KNOWLEDGE INDEX IS ITSELF A DERIVED RECORD, AND THE REGISTRY CHECK READS IT. ***
    //
    // registryOrphans.scan() walks knowledge-index.json's gate list. That file is rebuilt by a ship step, so
    // on the round that ADDS a gate it does not yet contain it -- and the registry check reported "no module
    // with reportLines lacks an entry" about a module that had no entry. *** A CHECK THAT CANNOT FAIL FOR
    // THE ONE POPULATION IT EXISTS TO WATCH, *** in the file written to catch exactly that, found by using
    // it on the next round. The fix is not to re-derive the orphan rule here -- two definitions of one rule
    // is the defect this module avoided by exporting `sources` -- but to check the INPUT and say so, so the
    // registry answer is never read as clean when it was computed from yesterday's tree.
    const onDisk = A.gateFiles(ENG).length;
    const K = JSON.parse(fs.readFileSync(path.join(ENG, "knowledge-index.json"), "utf8"));
    const indexStale = K.gates.length !== onDisk;
    out.push({
        name: "knowledge index", owes: OWES.index,
        recorded: K.gates.length, actual: onDisk,
        stale: indexStale,
        detail: indexStale ? `index lists ${K.gates.length} gates, disk holds ${onDisk}`
                           : `${onDisk} gates, index agrees`,
    });

    const R = await mod("./registryOrphans.mjs");
    const rs = R.scan();
    out.push({
        name: "instrument registry", owes: OWES.registry,
        recorded: 0, actual: rs.narrow.length,
        // *** UNANSWERABLE, NOT CLEAN. *** With a stale index this check has not seen the new gate at all,
        // so a zero from it is an absence of evidence. v4402: an absence read as a skip is an absence read
        // as a pass. It reports stale until its own input is current.
        stale: rs.narrow.length > 0 || indexStale,
        detail: rs.narrow.length ? rs.narrow.map((n) => n.module).join(", ")
              : indexStale ? "UNANSWERABLE until knowledge-index.json is rebuilt -- this check reads it, and "
                           + "it does not yet list every gate on disk"
              : "no module with reportLines lacks an entry",
    });

    // *** INJECTABLE, BECAUSE THE FIRST DRAFT'S CONTROL FOR THIS CHECK WAS VACUOUS. *** It asserted a fact
    // about its own fixture object and never called the code, so deleting the stamp requirement below cost
    // NOTHING -- the fourth check-that-cannot-fail this session. A timings record the caller supplies is what
    // makes "a reading without its own capture stamp is not evidence" a thing the gate can actually drive.
    const rec = timings || JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-timings.json"), "utf8"));
    // *** v4579 -- AND A KIND, BECAUSE A MILLISECOND WITHOUT ONE IS TWO DIFFERENT QUANTITIES. *** v4578
    // measured that the ms column holds a LOADED parallel reading under the budget and an ALONE serial one at
    // or over it, 1.93x apart, with nothing marking which -- and this arc filled seventeen entries with the
    // wrong one across four rounds, including the round that found the problem and the gate that reported it.
    // quickSweep writes `kinds` now. This check is what stops the class coming back: a new gate owes the file
    // a kind exactly as it owes it a runtime and a stamp, and a reading whose quantity is unknown is not a
    // reading anybody can compare.
    const missing = A.gateFiles(ENG)
        .map((p) => path.relative(ENG, p).replace(/\\/g, "/"))
        .filter((g) => !(g in (rec.timings || {})) || !((rec.at || {})[g]) || !((rec.kinds || {})[g]));
    out.push({
        name: "sweep timings", owes: OWES.timing,
        recorded: 0, actual: missing.length,
        stale: missing.length > 0,
        detail: missing.length ? missing.join(", ") : "every gate has a timing, its own capture stamp and a kind",
    });

    // ---- *** v4551 -- THE SIXTH CHECK, AND THE OBLIGATION IT READS HAD BEEN DECLARED HERE SINCE v4482 WITH
    // NOTHING BEHIND IT. *** OWES.runtimeGap said "any new .mjs moves vba/runtimeGap.mjs's twelve-row
    // capability census" and no check read that clause -- the one OWES entry of six that named a duty and
    // then went unenforced. The exclusion note under reportLines gave the reason: the walker "cannot leave
    // its gate without putting fs into a module that has zero imports on purpose". *** THAT REASON DOES NOT
    // HOLD AND HAS NOT SINCE v4482. *** It conflates two things: runtimeGap.mjs must not import fs, which is
    // true and is preserved here (census() is handed a file list and reads nothing), with THIS file being
    // unable to call it, which is false -- recordDrift.mjs imports fs on line 56 and exports `sources`, the
    // very walker, for other gates to use. Nothing was in the way. The cost of being wrong about that: the
    // FSR arc added fourteen .mjs files over five rounds and this census drifted on four of its twelve rows
    // unnoticed, because the only thing that read it was tools/ship/runtimeGap-selfcheck.mjs, one of the slow
    // gates, which no round in that arc ran. MEASURED at 554 ms on this box (sources 28, census 526) against
    // the five above at 291 ms combined -- it roughly triples this pre-flight, and it is worth it against a
    // 300,000 ms verify.
    // *** MEMOISED, AND ON THE FUNCTION RATHER THAN ON NOTHING, WHICH IS THE WHOLE CARE IN IT. *** This check
    // costs 554 ms and the gate that grades this file calls checks() ELEVEN times -- once live and ten with
    // fixtures -- so adding it took recordDrift-selfcheck from 1,799 ms to 6,813 ms, straight past the sweep's
    // 3,000 ms budget. *** THAT WOULD HAVE BEEN THE SAME DEFECT ONE LEVEL UP: *** tools/ship/frozenRecords.mjs
    // already records that the tree's stale-record detectors sit OUTSIDE the budget and so get skipped, which
    // is why four records drifted through the FSR arc unnoticed. A sixth check that pushed its own gate out of
    // the sweep would have been a control nobody runs, bought by writing a control.
    // The census is a pure function of the tree and the tree does not change inside one process, so the ten
    // fixture calls can share one result. The key is the census FUNCTION, not a bare flag: every fixture here
    // spreads the real module and overrides only the recorded numbers, but a future fixture that injects a
    // fake census would otherwise be handed the real answer and pass while measuring nothing.
    const G = await mod("../../vba/runtimeGap.mjs");
    let gc = CENSUS_MEMO.get(G.census);
    if (!gc) { gc = G.census(sources()); CENSUS_MEMO.set(G.census, gc); }
    const M = G.MEASURED_AT_V4462;
    // *** THE LABEL->FIELD MAP IS IMPORTED, NOT WRITTEN HERE, AND THAT IS A MEASURED CORRECTION. *** The
    // first draft of this check spelled the twelve labels out in this file and the check's own arrival moved
    // two of the rows it checks -- performance.now 220 -> 221, requestAnimationFrame 116 -> 117 -- because
    // the census greps file text and this file is in the walked set. runtimeGap.mjs already contains every
    // one of those strings in its PATTERNS table, so the map costs nothing there and perturbs nothing.
    const ROWS = G.CENSUS_FIELDS;
    // *** ALL THIRTEEN ROWS, NOT THE FILE COUNT. *** A files-only check would have caught this round's drift
    // and would miss the shape that census exists to show -- v4550 recorded a two-file round that moved four
    // rows and v4548 a four-file round that moved two, and a check reading one number cannot tell those apart.
    const gDrift = [];
    if (M.files !== gc.files) gDrift.push(`files ${M.files} -> ${gc.files}`);
    for (const [label, field] of Object.entries(ROWS)) {
        if (M[field] !== gc.counts[label]) gDrift.push(`${label} ${M[field]} -> ${gc.counts[label]}`);
    }
    out.push({
        name: "runtimeGap census", owes: OWES.runtimeGap,
        recorded: M.files, actual: gc.files,
        stale: gDrift.length > 0,
        detail: gDrift.length ? gDrift.join(", ") : `all thirteen rows agree, ${gc.files} files`,
    });

    return out;
}

export async function drift(opts = {}) {
    const all = await checks(opts);
    return { all, stale: all.filter((c) => c.stale) };
}

export async function reportLines() {
    const d = await drift();
    const L = ["derived records a new module invalidates -- asked before the verify, not after"];
    for (const c of d.all) L.push(`  ${c.stale ? "STALE" : "  ok "}  ${c.name.padEnd(22)} ${c.detail}`);
    L.push(d.stale.length
        ? `  ${d.stale.length} stale -- ${d.stale.map((c) => c.owes).join("; ")}`
        : "  nothing stale. NOT a prediction that the verify passes -- this checks records, not subjects.");
    // v4551 -- runtimeGap left this line and became the sixth check; what replaced it is a record whose
    // cheap signal is stale in the same direction as its subject, which is a worse thing to have than a gap.
    L.push("  NOT checked here: tools/ship/redCensus.mjs's registered reds -- whether a gate parked as red " +
           "is still red. The only cheap signal for it is sweep-timings.json's `codes` table, and that table " +
           "is written by the same sweep that would have to re-run the gate: MEASURED at v4551, tslSource " +
           "-selfcheck was recorded there as exit 1 while the gate had exited 0 since v4543, so a check " +
           "reading it would have confirmed the stale registration instead of finding it. Re-verifying a " +
           "registered red means RUNNING it, which is redCensus-selfcheck's two minutes and does not belong " +
           "in a pre-flight.");
    return L;
}

export const DRIFT_AT_V4482 = Object.freeze({
    // Rounds, and the records each had to re-take. Read off the commits, not remembered.
    rounds: Object.freeze([
        Object.freeze({ round: "v4478", records: 3 }),
        Object.freeze({ round: "v4479", records: 2 }),
        Object.freeze({ round: "v4480", records: 4 }),
        Object.freeze({ round: "v4481", records: 4 }),
    ]),
    // v4551: 5 -> 6. runtimeGap joined, and OWES gained a seventh clause (redCensus) that is the new
    // notChecked -- so the ratio did not improve by adding a check, it improved by adding a check AND
    // admitting a duty that was not written down. See the note under reportLines for why that one is a gap
    // rather than an omission: its only cheap input is a record stale in the same direction as its subject.
    checked: 6, notChecked: 1,
    // milliseconds, measured on this box
    // v4551 -- the sixth check's cost is IN this table, not left out of it. The gate asserts this sum is under
    // a second against a 300,000 ms verify, and a cost record that omits the most expensive check would make
    // that row pass on a total nobody pays. 291 -> 845 ms, so the margin under the second is now 155 ms and
    // real rather than comfortable: the NEXT check added here has to justify itself against that, or the
    // budget has to move on an argument instead of by drift.
    cost: Object.freeze({ assertionShape: 195, closingCoverage: 19, registryOrphans: 24, gateFiles: 12,
                          knowledgeIndex: 41, runtimeGapCensus: 554 }),
    verifyMs: 300000,
    // *** THE FIFTH CHECK WAS ADDED AT v4483 BECAUSE THE THIRD ONE COULD NOT FAIL. *** The registry check
    // reads knowledge-index.json, which is a derived record rebuilt by a ship step, so on the round that
    // adds a gate it answers from a tree that does not contain it -- and it reported clean about a module
    // with no entry. Found by RUNNING this file on the round after it shipped, which is the only way a
    // detector whose zero was never driven gets found.
    fifthAddedAt: "v4483",
});
