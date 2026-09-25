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
import * as BT from "./boxTimings.mjs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as TR from "./treeRead.mjs";
import * as RR from "./recordReach.mjs";   // readTimings: the guarded, shared reader of sweep-timings.json

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
// *** v4646 -- THIS POINTED AT SKIP_AGREE.recordDrift, WHICH CANNOT SEE A WINDOWS PATH SEPARATOR. ***
// That entry is the ARCHIVE of the rule this module used before treeRead unified the three walkers, kept
// so treeRead-selfcheck can go on comparing them; it is not the rule anything should still walk with.
// runtimeGap-selfcheck.mjs imports this as its own SKIP, so on Windows both it and this module were
// filtering with a pattern that matched no vendor path at all -- 117 files into the census, measured on
// the rig at v4645. The live export is the unified, separator-agnostic rule; the archive stays archived.
export const SOURCE_SKIP = TR.SKIP;
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
    orrery: "a round that edits any file a vendored library imports owes orrery-fleet.json its new byte counts -- NOT CHECKED HERE, see the note on DRIFT_AT_V4482.notChecked",
    frozenRecords: "a round that adds a FROZEN RECORD owes tools/ship/frozenRecords.mjs and tools/ship/recordReach.mjs their re-taken counts -- both count records, and both go red on the next verify if the round that added one did not",
});

/**
 * The checks, each returning {name, stale, recorded, actual, owes}. Injectable so the gate can hand this a
 * deliberately stale record and watch it be found -- a drift detector that cannot be given drift is a
 * detector nobody has run.
 */
/**
 * Read sweep-timings.json, retrying a TORN read.
 *
 * *** EXPORTED SO THE GATE CAN DRIVE IT WITHOUT RE-RUNNING checks(). *** The first version of the row that
 * proves this behaviour called checks({}) twice more, and checks() is O(tree): recordDrift-selfcheck went from
 * 1,870 ms to 2,376 ms against a 3,000 ms budget, eating the 800 ms margin recordReach-selfcheck requires of
 * both stale-record detectors. That gate caught it, which is what it is for -- and the answer is to make the
 * thing testable rather than to lower the bar it failed.
 *
 * The wait is a REAL timer. The first draft spun on Date.now(), which blocks this process's own event loop, so
 * nothing it is awaiting can progress and it burns a core doing it -- caught by a test that broke the file,
 * scheduled a restore 50 ms out, and watched all three attempts fail anyway.
 */
export async function readTimingsWithRetry(root = ENG, attempts = 3, waitMs = 40) {
    let tries = 0, error = null;
    while (tries < attempts) {
        const t = RR.readTimings(root);
        tries++;
        if (t.ok) return { rec: t, tries, error: null };
        error = t.error || "no timings";
        if (tries < attempts) await new Promise((r) => setTimeout(r, waitMs));
    }
    return { rec: null, tries, error };
}

// *** ONE MEMO FOR EVERY O(TREE) DERIVATION IN THIS FILE, KEYED ON THE FUNCTION THAT DERIVES IT. ***
//
// It started as CENSUS_MEMO around runtimeGap's census alone. The other three derivations -- assertionShape's
// census, its gate-file walk, and the knowledge-index rebuild -- were re-taken on every checks() call, and
// recordDrift-selfcheck makes three full passes over the tree per run (the live one, the partition fixture,
// and the filtered fixtures), so the index rebuild alone was paid three times at 310 ms.
//
// *** THE KEY IS THE FUNCTION OBJECT, NOT ITS NAME, AND THAT IS WHAT MAKES THE FIXTURES STILL WORK. *** A
// fixture that hands checks() a different module hands it a different function, so it derives for real; a
// fixture that spreads the real module and overrides only the RECORDED numbers keeps the same function and
// reuses the real derivation, which is exactly what such a fixture is asking about. A memo keyed on a string
// would have silently answered the first kind with the second kind's number.
//
// Process-lifetime only: nothing here writes the tree between calls, and the CLI exits after one pass.
const DERIVED = new Map();
const once = (fn, make) => {
    if (DERIVED.has(fn)) return DERIVED.get(fn);
    const v = make();
    DERIVED.set(fn, v);
    return v;
};

/**
 * *** `only` EXISTS BECAUSE A FIXTURE FOR ONE RECORD WAS RE-DERIVING FOUR. ***
 *
 * Every check here is O(tree), and the gate drives eight fixtures through this function -- three that
 * perturb the timings file and three that swap one module -- so a run cost ten full censuses to answer ten
 * questions about one of them each. Measured: 213 to 317 ms per call, ten calls, and the gate reached
 * 2,215 ms serial against a 3,000 ms budget with recordReach-selfcheck requiring 800 ms of margin. It is
 * also MORE PRECISE than it was: a fixture that breaks the timings file should not be able to pass or fail
 * on the assertion census, and until now it could.
 */
export async function checks({ load = null, timings = null, records = null, only = null } = {}) {
    const mod = load || ((p) => import(p));
    const out = [];
    const wanted = (n) => !only || (Array.isArray(only) ? only.includes(n) : only === n);

    // assertionShape is imported either way: two checks below need its gateFiles() walk, and the module
    // import is cheap -- census() is the 147 ms.
    const A = await mod("./assertionShape.mjs");
    if (wanted("assertionShape census")) {
        // *** shapes:false -- THIS CHECK READS `definesOk` AND `gates` AND NOTHING ELSE. *** The swap scan
        // census() runs by default costs 379 ms and contributes to neither field, and this gate is SWEPT, so
        // that was 379 ms off a 3,000 ms budget for an answer nobody here looks at. See census()'s own note.
        const ac = once(A.census, () => A.census({ shapes: false }));
        out.push({
            name: "assertionShape census", owes: OWES.assertion,
            recorded: A.SHAPE_AT_V4480.definesOk, actual: ac.definesOk,
            stale: A.SHAPE_AT_V4480.definesOk !== ac.definesOk || A.SHAPE_AT_V4480.gates !== ac.gates,
            detail: `gates ${A.SHAPE_AT_V4480.gates} vs ${ac.gates}, copies ${A.SHAPE_AT_V4480.definesOk} vs ${ac.definesOk}`,
        });
    }

    // *** v4664 -- THE PRE-FLIGHT DID NOT ASK ABOUT THE TWO CENSUSES THAT COUNT RECORDS, AND THAT COST TWO
    // ROUNDS IN A ROW. *** v4663 added WASM_AT_V4663 and v4664 added EXILED_PASS_V4664; this tool reported
    // "nothing stale" both times and both verifies then came back with frozenRecords-selfcheck and
    // recordReach-selfcheck red. The closing line of the record in frozenRecords.mjs has said it since
    // v4647f -- "a round that adds a record re-takes this, and that is the point" -- and the instrument that
    // exists to ask that question before the verify was not asking it. A pre-flight that is silent about the
    // most common kind of arrival is not a cheap pre-flight, it is a misleading one.
    //
    // ONE census, WITHOUT GUARDIANS, and the second half of that is what makes this check affordable at all.
    // frozenRecords.census() is 738 ms cold on this box, and the bulk of it is the GUARDIAN search -- the
    // comment strip over every gate source plus a name scan across all of them. This check asks only how many
    // records the tree holds. Measured: 738 -> 285 ms cold, same 149 records and same 399 fields. The same
    // move assertionShape.census({ shapes: false }) makes twenty lines above, for the same reason, on the same
    // gate's budget. Behind `once` on the census function, like every other heavy derivation here.
    if (wanted("record censuses")) {
        const F = await mod("./frozenRecords.mjs");
        const R = await mod("./recordReach.mjs");
        const fc = once(F.census, () => F.census({ guardians: false }));
        const live = fc.records.length;
        const frozen = F.PROBE_AT_V4536.currentIncludingModule.records;
        const reach = R.REACH_AT_V4548.total;
        out.push({
            name: "record censuses", owes: OWES.frozenRecords,
            recorded: frozen, actual: live,
            stale: live !== frozen || live !== reach,
            detail: `${live} records in the tree; frozenRecords records ${frozen}, recordReach records ${reach}`,
        });
    }

    if (wanted("sweep closings")) {
        const C = await mod("./closingCoverage.mjs");
        const cc = C.coverage();
        out.push({
            name: "sweep closings", owes: OWES.closing,
            recorded: 0, actual: cc.summedUncovered,
            stale: cc.summedUncovered > 0 || cc.duplicates.length > 0,
            detail: `${cc.summedUncovered} gate(s) no closing names, ${cc.duplicates.length} duplicate claim(s)`,
        });
    }

    // ---- *** v4483 -- THE KNOWLEDGE INDEX IS ITSELF A DERIVED RECORD, AND THE REGISTRY CHECK READS IT. ***
    //
    // registryOrphans.scan() walks knowledge-index.json's gate list. That file is rebuilt by a ship step, so
    // on the round that ADDS a gate it does not yet contain it -- and the registry check reported "no module
    // with reportLines lacks an entry" about a module that had no entry. *** A CHECK THAT CANNOT FAIL FOR
    // THE ONE POPULATION IT EXISTS TO WATCH, *** in the file written to catch exactly that, found by using
    // it on the next round. The fix is not to re-derive the orphan rule here -- two definitions of one rule
    // is the defect this module avoided by exporting `sources` -- but to check the INPUT and say so, so the
    // registry answer is never read as clean when it was computed from yesterday's tree.
    const gateFiles = (wanted("knowledge index") || wanted("instrument registry") || wanted("sweep timings"))
        ? once(A.gateFiles, () => A.gateFiles(ENG)) : [];
    const onDisk = gateFiles.length;
    const K = JSON.parse(fs.readFileSync(path.join(ENG, "knowledge-index.json"), "utf8"));
    // *** v4587 -- THIS CHECK COMPARED A COUNT AND REPORTED "index agrees". ***
    //
    // It was `K.gates.length !== onDisk`: a POPULATION check under a name that promises agreement. Adding or
    // removing a gate moves the count and it caught that -- which is the case it was written for, and why it
    // looked right. EDITING A GATE'S HEADER does not move the count, and the header text is the whole product:
    // this index exists to be "one searchable answer to does this already exist?", and what is searched is the
    // text. v4585 added a gate with a placeholder runtime line, measured the real number the same round, and
    // the index kept the placeholder through three rounds of this line saying "1643 gates, index agrees".
    //
    // instruments-selfcheck rebuilds and compares BYTES, and was red for all three. So the tree held the right
    // check and the cheap pre-view of it answered a different question -- and the pre-flight is the thing that
    // gets read, because it runs in a second and the gate runs in the suite. A preview that is weaker than what
    // it previews has to say so, or it is read as the same answer for less money.
    //
    // MEASURED before changing it: buildIndex() is 360-401 ms over three runs and the whole pre-flight was
    // 948 ms, so the honest comparison costs about 40 % more pre-flight and answers the question in the name.
    // diffIndex() is imported rather than re-derived -- one definition of "the index disagrees", which is the
    // rule this file already states for the orphan scan two checks down.
    // *** AND THE wanted() GUARD IS THIS LINE'S, KEPT OVER THE UNGUARDED CALL. *** The rebuild is 360-401 ms;
    // a fixture asking about the sweep timings must not pay for it. indexStale stays in function scope
    // because the instrument-registry check below reads it.
    let idxDiff = null;
    if (wanted("knowledge index") || wanted("instrument registry")) {
        const fresh = await mod("./buildKnowledgeIndex.mjs");
        idxDiff = fresh.diffIndex(K, once(fresh.buildIndex, () => fresh.buildIndex()));
    }
    const indexStale = idxDiff ? !idxDiff.same : false;
    if (wanted("knowledge index")) out.push({
        name: "knowledge index", owes: OWES.index,
        recorded: K.gates.length, actual: onDisk,
        stale: indexStale,
        detail: indexStale ? `${idxDiff.summary} -- run node tools/ship/buildKnowledgeIndex.mjs`
                           : `${onDisk} gates, rebuilt and byte-identical`,
    });

    if (wanted("instrument registry")) {
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
    }

    // *** INJECTABLE, BECAUSE THE FIRST DRAFT'S CONTROL FOR THIS CHECK WAS VACUOUS. *** It asserted a fact
    // about its own fixture object and never called the code, so deleting the stamp requirement below cost
    // NOTHING -- the fourth check-that-cannot-fail this session. A timings record the caller supplies is what
    // makes "a reading without its own capture stamp is not evidence" a thing the gate can actually drive.
    // *** AND THE READ ITSELF WAS A BARE JSON.parse OF THE FILE quickSweep REWRITES AT RUN END. *** This gate
    // went NEW RED inside a full sweep at v4555 and passed every time it was run alone -- the "fails a ship
    // at random and never reproduces" shape gateSweep.mjs's header calls the worst thing a ship-time check
    // can be. It is the SAME torn read tools/ship/recordReach.mjs was repaired for at v4550, and the repair
    // there was readTimings(), which returns `ok` instead of assuming it. This module had its own second
    // reader and did not use the shared one -- which is the rule recordDrift-selfcheck's own section 3
    // asserts about `sources`, that one walk means one definition, turned on this file.
    //
    // A torn read is a window of milliseconds, so it is RETRIED rather than either crashing or being passed
    // on nothing. A file still unparseable after three attempts is genuinely broken, and the check then
    // reports UNREADABLE -- stale, named, and not a silent green.
    // *** v4645 -- THIS EARLY RETURN MADE THE SIXTH CHECK UNREACHABLE BY NAME. *** It read
    // `if (!wanted("sweep timings")) return out;`, and the runtimeGap census sits BELOW it -- so
    // `only: "runtimeGap census"` returned an EMPTY array and that census only ever ran as a PASSENGER of
    // "sweep timings". A filter that silently answers nothing for one of the six is worse than no filter:
    // the row it should have served reads as absent rather than as unasked, which is the distinction this
    // whole pre-flight exists to keep. Found by trying to use it -- recordDrift-selfcheck asked for the
    // runtimeGap row by name and crashed on undefined, which is a louder failure than it deserved and the
    // only reason this was noticed. Both blocks carry their own guard now and `only` reaches all six.
    const doTimings = wanted("sweep timings"), doGap = wanted("runtimeGap census");
    if (!doTimings && !doGap) return out;
    if (doTimings) {
        const read = timings ? { rec: timings, tries: 0, error: null } : await readTimingsWithRetry(ENG);
        if (!read.rec) {
            out.push({
                name: "sweep timings", owes: OWES.timing, recorded: 0, actual: -1, stale: true,
                detail: `sweep-timings.json UNREADABLE after ${read.tries} attempts (${read.error}) -- a torn read ` +
                        `from a concurrent quickSweep heals on retry, so this means the file is broken rather ` +
                        `than busy`,
            });
            return out;
        }
        const rec = read.rec;

        // *** v4579 -- AND A KIND, BECAUSE A MILLISECOND WITHOUT ONE IS TWO DIFFERENT QUANTITIES. *** v4578
        // measured that the ms column holds a LOADED parallel reading under the budget and an ALONE serial one at
        // or over it, 1.93x apart, with nothing marking which -- and this arc filled seventeen entries with the
        // wrong one across four rounds, including the round that found the problem and the gate that reported it.
        // quickSweep writes `kinds` now. This check is what stops the class coming back: a new gate owes the file
        // a kind exactly as it owes it a runtime and a stamp, and a reading whose quantity is unknown is not a
        // reading anybody can compare.
        // *** v4679 -- THIS ASKED A COVERAGE QUESTION OF A COST-SCOPED RECORD, AND THAT MADE IT UNCLEARABLE. ***
        // It read ONLY sweep-timings.json. That file is host-claimed: v4647 made it refuse a foreign write,
        // rightly, because "two machines' runtimes in one set of fields is not a record, it is whichever ran
        // last". Its host is a LINUX 4-core container -- the rig can never claim it, and the container that
        // could is gone, so NO LIVE BOX CAN ADD AN ENTRY. Every round that added a gate left this row red with
        // no action available that would clear it, which is a ratchet with no mechanism rather than a check.
        //
        // The question this row is FOR is "has this gate ever been timed" -- coverage -- and any box's record
        // answers that. The question the FILE answers is "what does it cost on the box that owns this record"
        // -- cost -- and only one box's record answers that. tools/ship/boxTimings.mjs holds the distinction;
        // this reads its coverage side. THE BUDGET IS UNCHANGED and still reads the shared file alone: that is
        // task #87, it decides which gates the sweep runs, and it is not smuggled in here.
        // An INJECTED record is the only record: a fixture handing in a timings object means "this is the
        // state of the world", and reading the real files alongside it would let the tree answer for the
        // fixture. The first spelling of this line called BT.coverage(ENG) unconditionally and took two of
        // this check's own sabotage rows red -- the fixture could not reach the check at all.
        // An injected record STANDS IN FOR sweep-timings.json AND ONLY FOR IT. The parameter is named
        // `timings` and that is the file it names; the per-box records are separate files and a fixture about
        // the shared one does not speak for them. Replacing ALL records was tried first and took the
        // "untouched record is clean" control red -- correctly, because with the per-box records excluded the
        // real shared file genuinely does lack this round's four new gates.
        //
        // *** v4680 -- AND "ONLY FOR IT" MADE THE SABOTAGE ROWS DEPEND ON WHICH FILES THE BOX HAPPENED TO HOLD. ***
        // Those rows delete ONE gate's stamp from the injected shared record and expect the check to notice. With
        // the other records read live, any record that also covers that gate fills the hole: the untracked
        // sweep-timings.local.json a foreign box's own sweep writes does exactly that, so the gate went red on
        // this box the first time a local verify wrote one -- and the rig has had one all along. A fixture must
        // be able to state the WHOLE world, so `records` injects every record at once and wins over `timings`.
        const cov = records
            ? BT.coverageOf(records)
            : timings
            ? BT.coverageOf([{ file: BT.FILES.shared, kind: "shared", host: timings.host || null, rec: timings },
                             ...BT.records(ENG).filter((r) => r.kind !== "shared")])
            : BT.coverage(ENG);
        const missing = gateFiles
            .map((p) => path.relative(ENG, p).replace(/\\/g, "/"))
            .filter((g) => {
                const e = cov.entries.get(g);
                return !e || !e.at || !e.kind;
            });
        const foreignOnly = gateFiles.length - missing.length - cov.localCount;
        out.push({
            name: "sweep timings", owes: OWES.timing,
            recorded: 0, actual: missing.length,
            stale: missing.length > 0,
            detail: missing.length
                ? missing.join(", ")
                : `every gate has a timing, its own capture stamp and a kind, across ${cov.records.length} ` +
                  `record(s): ${cov.localCount} measured on THIS box (${cov.thisBox}) and the rest on another. ` +
                  "A foreign reading answers COVERAGE and not COST, and the budget deliberately still reads " +
                  "the shared file -- see task #87",
        });
    }

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
    if (doGap) {
        const G = await mod("../../vba/runtimeGap.mjs");
        const gc = once(G.census, () => G.census(sources()));
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
    }

    return out;
}

export async function drift(opts = {}) {
    const all = await checks(opts);
    return { all, stale: all.filter((c) => c.stale) };
}

// *** `pre` EXISTS BECAUSE THE CALLER ALREADY PAID FOR THIS. *** recordDrift-selfcheck ran drift() and then
// reportLines() on the next line, and reportLines ran drift() a second time: two full six-check passes, 549 ms
// of them measured, to print a report about the run that had just finished. Callers with a result in hand pass
// it; callers without one still get the old behaviour.
export async function reportLines(pre = null) {
    const d = pre || await drift();
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
    // v4664: 6 -> 7. `record censuses` joined, and it is the check that SHOULD have been here for two
    // rounds: v4663 added WASM_AT_V4663 and v4664 added EXILED_PASS_V4664, this tool said "nothing stale"
    // both times, and both verifies then returned frozenRecords-selfcheck and recordReach-selfcheck red.
    // A pre-flight silent about the commonest kind of arrival is not cheap, it is misleading.
    // v4664: 6 -> 7. `record censuses` joined, and it is the check that SHOULD have been here for two
    // rounds: v4663 added WASM_AT_V4663 and v4664 added EXILED_PASS_V4664, this tool said "nothing stale"
    // both times, and both verifies then returned frozenRecords-selfcheck and recordReach-selfcheck red.
    // A pre-flight silent about the commonest kind of arrival is not cheap, it is misleading.
    //
    // *** v4665: notChecked 1 -> 2, AND THE SECOND ONE IS ADMITTED RATHER THAN ADDED. *** orrery-fleet.json
    // records the BYTE SIZE of every file in this tree that imports a vendored library, so v4663's edit of
    // 48 gates moved eleven of its entries by exactly 217 bytes each and v4664 moved main.js by 14,321 --
    // and this pre-flight was silent, exactly as it had been about the record censuses. MEASURED before
    // deciding: orreryBake.drift() costs 2,580 ms, because it runs `git log --diff-filter=A` once per
    // vendored body and that query walks the whole history per path. Against a pre-flight whose SEVEN
    // current checks total 1,130 ms, that is not a check, it is a second instrument. So it is written down
    // as a duty this tool does not discharge -- the same treatment the redCensus clause gets and for a
    // comparable reason -- and the three orrery gates remain its owners. What would make it affordable is a
    // cheaper first-add query, which is its own round.
    checked: 7, notChecked: 2,
    // milliseconds, measured on this box
    // v4551 -- the sixth check's cost is IN this table, not left out of it. The gate asserts this sum is under
    // a second against a 300,000 ms verify, and a cost record that omits the most expensive check would make
    // that row pass on a total nobody pays. 291 -> 845 ms, so the margin under the second is now 155 ms and
    // real rather than comfortable: the NEXT check added here has to justify itself against that, or the
    // budget has to move on an argument instead of by drift.
    // v4664 -- the seventh check's cost is IN this table, and the note above is what shaped it. That note
    // says the next check added "has to justify itself against [a 155 ms margin], or the budget has to move
    // on an argument instead of by drift". At the full census's 740 ms it did not fit, and BOTH things were
    // done rather than one: the check was made cheap, and the bound was changed on an argument.
    //   - CHEAP: it asks how many records the tree holds and nothing else, so it calls
    //     frozenRecords.census({ guardians: false }). The guardian search -- the comment strip over every
    //     gate source plus a name scan across all of them -- is the bulk of that function. 740 -> 285 ms
    //     cold, same 149 records, same 399 fields. Exactly the shape assertionShape.census({shapes:false})
    //     already had, one check up.
    //   - THE BOUND: a flat 1,000 ms says nothing about what it is for. What it is for is that the
    //     pre-flight stays cheap AGAINST THE VERIFY IT PROTECTS, so the gate asserts a RATIO now. The
    //     argument for spending anything at all: two CONSECUTIVE rounds shipped a red verify for precisely
    //     the question this check asks.
    cost: Object.freeze({ assertionShape: 195, closingCoverage: 19, registryOrphans: 24, gateFiles: 12,
                          knowledgeIndex: 41, runtimeGapCensus: 554, frozenRecordsCensus: 285 }),
    verifyMs: 300000,
    // *** THE FIFTH CHECK WAS ADDED AT v4483 BECAUSE THE THIRD ONE COULD NOT FAIL. *** The registry check
    // reads knowledge-index.json, which is a derived record rebuilt by a ship step, so on the round that
    // adds a gate it answers from a tree that does not contain it -- and it reported clean about a module
    // with no entry. Found by RUNNING this file on the round after it shipped, which is the only way a
    // detector whose zero was never driven gets found.
    fifthAddedAt: "v4483",
});

// ---- CLI ---------------------------------------------------------------------------------------------------
//
// *** v4639 -- THE PRE-FLIGHT HAD NO RUNNER, AND HAS NOT HAD ONE SINCE ITS GATE WENT OVER BUDGET. ***
//
// This module exists to answer, BEFORE the verify, which hand-maintained records a new module invalidates.
// It works: on the round that added tools/ship/fsrPage-selfcheck.mjs it named vba/runtimeGap.mjs's census
// stale and listed the seven rows that moved. Nothing ran it.
//
// MEASURED, which is what turned a suspicion into this block:
//
//   this module, import + drift() + reportLines()      1,776 ms
//   tools/ship/recordDrift-selfcheck.mjs, its gate     4,997 ms   against quickSweep's 3,000 ms budget
//
// So the gate is excluded from the ship-time sweep for being slow, and the gate was the ONLY caller -- the
// whole tree imports this file twice, once from that gate and once from runtimeGap-selfcheck.mjs, which takes
// `sources` and `SOURCE_SKIP` (the tree walk) and never touches the drift check. verify.mjs runs a DIFFERENT
// pre-flight, versionPreflight.mjs. tools/ship/recordReach-selfcheck.mjs has a red row saying this outright --
// "BOTH STALE-RECORD DETECTORS RUN AT SHIP TIME AGAIN" against a live 4,820 ms -- and it sat unread among the
// reds nobody was working.
//
// A guard that exists, works, is cheap, and is unreachable is the shape tools/ship/kernelReach.mjs counts on
// the other side of this tree. The expensive half is the GATE; the check itself is affordable, so it gets a
// runner of its own rather than waiting for its gate to come back under budget.
//
// Exit 1 on stale so a ritual step can read the status rather than grep the log.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const lines = await reportLines();
    for (const l of lines) console.log(l);
    const { stale } = await drift();
    // *** AND A LEFTOVER FIXTURE, WHICH IS THE OTHER WAY A RECORD GOES STALE WITHOUT ANYBODY EDITING IT. ***
    // Two gates plant a file named like a real gate and delete it in a `finally` that SIGKILL does not run.
    // Measured: one on disk takes enumerateGates from 1737 to 1738 and INCLUDES it, so the population moves,
    // four hand-maintained censuses move with it, and gatesBridge's fixture -- whose body is process.exit(3)
    // -- reads as a NEW RED for a file in no commit. The names cannot be spelled out of the enumerator (see
    // TRANSIENT_FIXTURES in tools/ship/gateSweep.mjs for why), so a leftover is NAMED instead.
    const { TRANSIENT_FIXTURES } = await import("./gateSweep.mjs");
    const left = TRANSIENT_FIXTURES.filter((f) => fs.existsSync(path.join(ENG, f)));
    for (const f of left) console.log(`  LEFTOVER  ${f} -- a transient fixture a killed gate did not clean up; delete it`);
    process.exit(stale.length || left.length ? 1 : 0);
}
