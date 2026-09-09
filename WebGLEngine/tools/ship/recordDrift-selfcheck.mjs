// tools/ship/recordDrift-selfcheck.mjs -- v4482 -- the gate for tools/ship/recordDrift.mjs.
//
// Run: node tools/ship/recordDrift-selfcheck.mjs
//
// *** THIS FILE'S SUBJECT REPORTS "NOTHING STALE" ON A HEALTHY TREE, WHICH IS THE ONE ANSWER A DRIFT DETECTOR
// CANNOT BE TRUSTED FOR WITHOUT CONTROLS. *** Section 2 hands each check a record that HAS drifted and watches
// it be named. This session has caught six detectors that could only ever say no -- v4435's path check,
// v4436's and v4447's unreached branches, v4443's and v4445's checks grading their own copy, v4456's
// filesystem clause, v4478's rows-that-worked count -- and the pattern is always the same: the zero was never
// driven.
//
// ---- *** SIX SABOTAGES, AND TWO OF THEM WENT ZERO-RED FIRST *** ------------------------------------------------
//
//  A. `drift` reports every record fresh                  -> 0 RED, THEN 1 RED AFTER THE REPAIR
//  B. The assertion census never compares its population  -> 3 RED
//  C. Drop `owes`, so a report says WHAT and not WHY      -> 1 RED
//  D. A reading with no capture stamp counts as evidence  -> 0 RED, THEN 1 RED AFTER THE REPAIR
//  E. Ignore the injected loader                          -> 5 RED
//  F. `drift` reports every record stale                  -> 1 RED, THEN 2 RED AFTER THE REPAIR
//
// *** A WENT ZERO BECAUSE EVERY CONTROL CALLED checks() AND NOTHING CALLED drift(). *** The partition is the
// function callers actually use, and it was the one thing nothing graded -- so reporting all-fresh or all-stale
// changed nothing any assertion looked at. Section 2b drives it now.
//
// *** D WENT ZERO BECAUSE THE CONTROL ASSERTED A FACT ABOUT ITS OWN FIXTURE AND NEVER CALLED THE CODE. *** It
// built an object with a stamp removed and then checked that the stamp was removed -- true by construction,
// and deleting the stamp requirement from the module cost nothing. That is the FOURTH check-that-cannot-fail
// this session, after v4478's and v4479's two. The timings record is injectable now, so the fixture goes
// THROUGH `checks` and comes back with the gate named.
//
// ---- *** WHAT THIS GATE DOES NOT CLAIM *** ------------------------------------------------------------------
//
// That a clean report predicts a passing verify -- it checks derived records, not the subject of any gate.
// That the six records are all of them; they are the ones this session was bitten by -- and v4551 is the
// proof that the set was NOT complete, since it added a sixth after the FSR arc drifted four records over
// five rounds and this pre-flight, run on any of them, would have named only two. The seventh (redCensus's
// registered reds) is named in reportLines as a gap with its reason, not quietly left out. And that this file
// should re-take anything: it reads and reports, per v3698's refusal that a loop writing and grading the same
// record can mark its own work passed.

import { checks, drift, reportLines, sources, SOURCE_SKIP, OWES, ENG, DRIFT_AT_V4482 as REC } from "./recordDrift.mjs";
import fs from "node:fs";
import path from "node:path";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);

console.log("recordDrift-selfcheck -- the records a new module invalidates\n");

// ---- 1. THE LIVE TREE ------------------------------------------------------------------------------------------
console.log("1. what the tree says right now");

const live = await drift();
say(reportLines ? (await reportLines()).join("\n  ----  ") : "");
ok("every check returns a name, a verdict and what the record OWES",
    live.all.every((c) => c.name && typeof c.stale === "boolean" && typeof c.owes === "string" && c.owes.length > 20),
    "sabotage C: 'something drifted' is not a finding anybody can act on");
ok("the checks cover every re-derivable record the register counts", live.all.length === REC.checked,
    `${live.all.length} checks, record says ${REC.checked} checked and ${REC.notChecked} not`);

// ---- 2. *** EACH CHECK, DRIVEN AGAINST A RECORD THAT HAS ACTUALLY DRIFTED *** -------------------------------------
console.log("\n2. handed a stale record, each check names it");

{
    // assertionShape: a record claiming a different number of gates than the tree holds
    const real = await import("./assertionShape.mjs");
    const fake = {
        ...real,
        SHAPE_AT_V4480: Object.freeze({ ...real.SHAPE_AT_V4480, definesOk: 1, gates: 1 }),
    };
    const d = await checks({ load: async (p) => (p.includes("assertionShape") ? fake : import(p)) });
    const row = d.find((c) => c.name === "assertionShape census");
    say(`fixture: a census record claiming 1 gate and 1 copy`);
    ok("!! a stale assertion census is found and both numbers are shown",
        row.stale === true && /1 vs \d{3,}/.test(row.detail),
        "sabotage A: reporting everything fresh makes the whole pre-flight a decoration");
    // Compared against the LIVE baseline rather than against zero. The first draft asserted "exactly one
    // stale" and went red -- because this round's own new gate had already made three records stale, which is
    // the very cost the file exists to surface. A control that assumes a clean tree is a control that only
    // works on a tree nobody is working on.
    const baseline = live.stale.filter((c) => c.name !== "assertionShape census").length;
    ok("...and the OTHER checks are unaffected by that fixture",
        d.filter((c) => c.stale).length === baseline + 1,
        `sabotage F: marking everything stale is as useless as marking nothing stale (baseline ${baseline})`);
}
{
    // closingCoverage: a gate no closing names
    const real = await import("./closingCoverage.mjs");
    const fake = { ...real, coverage: () => ({ summedUncovered: 2, duplicates: [{ gate: "x", by: ["a", "b"] }] }) };
    const d = await checks({ load: async (p) => (p.includes("closingCoverage") ? fake : import(p)) });
    const row = d.find((c) => c.name === "sweep closings");
    ok("!! an unswept gate and a duplicate claim are both found",
        row.stale === true && /2 gate\(s\)/.test(row.detail) && /1 duplicate/.test(row.detail));
    ok("...and the reason names the sweep closing, not just a number",
        row.owes === OWES.closing);
}
{
    // registryOrphans: a module with reportLines and no entry
    const real = await import("./registryOrphans.mjs");
    const fake = { ...real, scan: () => ({ narrow: [{ gate: "g", module: "physics/made-up.mjs" }] }) };
    const d = await checks({ load: async (p) => (p.includes("registryOrphans") ? fake : import(p)) });
    const row = d.find((c) => c.name === "instrument registry");
    ok("!! an unregistered instrument is found AND NAMED, not counted",
        row.stale === true && row.detail.includes("physics/made-up.mjs"),
        "a count would leave the reader to go and find which");
}
{
    // sweep timings: a gate with a reading but NO capture stamp of its own
    const real = await import("./assertionShape.mjs");
    const one = real.gateFiles(ENG)[0];
    const rel = path.relative(ENG, one).replace(/\\/g, "/");
    const t = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-timings.json"), "utf8"));
    say(`the live timings hold ${Object.keys(t.timings).length} readings and ${Object.keys(t.at).length} stamps`);
    const noStamp = { ...t, at: Object.fromEntries(Object.entries(t.at).filter(([k]) => k !== rel)) };
    const dStamp = await checks({ timings: noStamp });
    const rowStamp = dStamp.find((c) => c.name === "sweep timings");
    ok("!! a reading WITH a time but WITHOUT its own capture stamp counts as missing evidence",
        rowStamp.stale === true && rowStamp.detail.includes(rel),
        "sabotage D: v4408 found one file-level `captured` covering 1,440 readings of which the run had taken " +
        "937 -- an entry carries its own stamp or it carries nothing");
    const noTime = { ...t, timings: Object.fromEntries(Object.entries(t.timings).filter(([k]) => k !== rel)) };
    ok("...and a missing reading is caught too, so the check is not only about stamps",
        (await checks({ timings: noTime })).find((c) => c.name === "sweep timings").stale === true);
    ok("...while the untouched record is clean, so neither is simply always true",
        (await checks({ timings: t })).find((c) => c.name === "sweep timings").stale === false);
}

{
    // ---- *** v4551 -- THE SIXTH CHECK, DRIVEN ON A ROW THAT IS NOT THE FILE COUNT. *** ----------------------
    // The fixture corrupts ONE capability row and leaves `files` alone, because a check that reads only the
    // file count would pass this and is exactly the check that would have been easy to write. The row is
    // picked BY INDEX and its label comes from CENSUS_FIELDS -- no capability name is spelled in this file,
    // since the census greps file text and a gate that names a row changes the row. That is not a
    // hypothetical: writing those twelve labels into recordDrift.mjs moved two rows by one on the run that
    // first exercised this check.
    const real = await import("../../vba/runtimeGap.mjs");
    const label = Object.keys(real.PATTERNS)[3];
    const field = real.CENSUS_FIELDS[label];
    const rowOnly = {
        ...real,
        MEASURED_AT_V4462: Object.freeze({ ...real.MEASURED_AT_V4462, [field]: real.MEASURED_AT_V4462[field] + 1000 }),
    };
    const dRow = await checks({ load: async (p) => (p.includes("runtimeGap") ? rowOnly : import(p)) });
    const rRow = dRow.find((c) => c.name === "runtimeGap census");
    say(`fixture: the '${label}' row overstated by 1000, files left correct`);
    ok("!! a capability row that drifted is found, and the ROW is named -- not just 'the census moved'",
        rRow.stale === true && rRow.detail.includes(label) && !rRow.detail.includes("files "),
        "sabotage: a files-only check passes this fixture, and a files-only check is what v4550 and v4548 " +
        "both show is not enough -- a two-file round moved four rows and a four-file round moved two");
    const fileOnly = {
        ...real,
        MEASURED_AT_V4462: Object.freeze({ ...real.MEASURED_AT_V4462, files: real.MEASURED_AT_V4462.files + 7 }),
    };
    const dFile = await checks({ load: async (p) => (p.includes("runtimeGap") ? fileOnly : import(p)) });
    const rFile = dFile.find((c) => c.name === "runtimeGap census");
    ok("...and a drifted file count is found too, so the check is not only about the rows",
        rFile.stale === true && rFile.detail.includes("files "));
    ok("...while the untouched census is clean, so neither is simply always true",
        (await checks()).find((c) => c.name === "runtimeGap census").stale === false,
        "this is the record the FSR arc drifted for five rounds with nothing reading it");

    // ---- *** THE MEMO'S KEY, WHICH WENT 0-RED AND IS THE REASON THIS ROW EXISTS. *** -----------------------
    // The check caches the derived census so that eleven checks() calls pay for it once. recordDrift.mjs says
    // in as many words that the key is the census FUNCTION and not a bare flag, "because a future fixture that
    // injects a fake census would otherwise be handed the real answer and pass while measuring nothing" --
    // and then NOTHING IN THIS GATE COULD TELL THE DIFFERENCE: swapping the key for the constant "one" left
    // all five sabotages' worth of rows green. A comment asserting a property is not the property.
    // The fixture injects a census that returns counts nothing on disk could produce. Order matters and is
    // stated rather than assumed: the live drift() at the top of this file has already cached the real
    // function's result, which is what a constant key would wrongly return here.
    const fakeCensus = { ...real, census: () => ({ files: 1, counts: Object.fromEntries(
        Object.keys(real.PATTERNS).map((k) => [k, 0])) }) };
    const dFake = await checks({ load: async (p) => (p.includes("runtimeGap") ? fakeCensus : import(p)) });
    const rFake = dFake.find((c) => c.name === "runtimeGap census");
    ok("!! the memo is keyed on the census FUNCTION -- an injected census is measured, not served from cache",
        rFake.stale === true && rFake.detail.includes("-> 1"),
        "sabotage BN: keying the memo on a constant went 0-RED against every other row in this gate, which " +
        "is what made this row necessary. A cache the fixtures cannot get past turns them all into decoration");
}

// ---- 2b. THE TOP-LEVEL PARTITION, WHICH NOTHING GRADED IN THE FIRST DRAFT ---------------------------------------
console.log("\n2b. drift() splits what checks() returns, and that split is graded");

{
    // *** SABOTAGE A WENT ZERO-RED BECAUSE EVERY CONTROL ABOVE CALLS checks() AND NOTHING CALLED drift(). ***
    // Reporting every record fresh -- or every record stale -- changed nothing any assertion looked at. The
    // partition is the function callers actually use, so it is driven here against a known-stale fixture.
    const real = await import("./assertionShape.mjs");
    const fake = { ...real, SHAPE_AT_V4480: Object.freeze({ ...real.SHAPE_AT_V4480, definesOk: 1, gates: 1 }) };
    const loader = async (p) => (p.includes("assertionShape") ? fake : import(p));
    const d = await drift({ load: loader });
    // *** AND THIS CONTROL MADE THE SAME MISTAKE SECTION 2 ALREADY RECORDS, IN THE SAME FILE. *** Its first
    // draft asserted `d.stale.length === 1` -- a clean tree with exactly this fixture's one stale record --
    // and went red the moment a round with its own new gate ran it, which is every round that will ever use
    // this file. Section 2 had already been bitten and had already written the rule down: compare against
    // the LIVE baseline, not against zero. Writing a lesson at the top of a file does not apply it eighty
    // lines down.
    const base = live.stale.filter((c) => c.name !== "assertionShape census").length;
    const wasAlready = live.stale.some((c) => c.name === "assertionShape census");
    ok("!! drift() reports the stale record in `stale` and ALL of them in `all`",
        d.stale.some((c) => c.name === "assertionShape census") &&
        d.stale.length === base + 1 && d.all.length === REC.checked,
        `sabotage A: 'everything fresh' empties this; sabotage F: 'everything stale' fills it. Baseline ` +
        `${base} stale beside it${wasAlready ? " (and it is stale on the live tree too, so the fixture only " +
        "keeps it stale)" : ""}`);
    ok("...and every member of `stale` is also in `all`, with the same verdict",
        d.stale.every((c) => d.all.some((a) => a.name === c.name && a.stale === true)));
    ok("on the live tree the partition holds too",
        live.stale.length === live.all.filter((c) => c.stale).length);
}

// ---- 3. THE SHARED WALKER --------------------------------------------------------------------------------------
console.log("\n3. one walker, and the module that could not host it");

ok("!! `sources` walks the tree and runtimeGap-selfcheck imports THIS one",
    sources().length > 3000 &&
    /from "\.\/recordDrift\.mjs"/.test(fs.readFileSync(path.join(ENG, "tools", "ship", "runtimeGap-selfcheck.mjs"), "utf8")),
    "there is one definition of the walk, which is the rule a second walker would break");
ok("the skip pattern is shared too, so the two callers cannot disagree about what a source is",
    SOURCE_SKIP.test("/x/node_modules/y.mjs") && SOURCE_SKIP.test("/x/vendor/y.mjs") && !SOURCE_SKIP.test("/x/physics/y.mjs"));
ok("!! and it did NOT move into runtimeGap.mjs, which has zero imports on purpose",
    (fs.readFileSync(path.join(ENG, "vba", "runtimeGap.mjs"), "utf8").match(/^import\s/gm) || []).length === 0,
    "a pure module's purity is worth more than this file's convenience -- tried, reverted, recorded");

// ---- 4. THE RECORD ---------------------------------------------------------------------------------------------
console.log("\n4. the frozen record");

ok("the rounds and their record counts are what the commits show",
    REC.rounds.length === 4 && REC.rounds.map((r) => r.records).join(",") === "3,2,4,4",
    "two to four, varying by what the round added -- which is why the list cannot be memorised");
ok("!! re-deriving every checked record costs less than a second, against a five-minute verify",
    Object.values(REC.cost).reduce((a, b) => a + b, 0) < 1000 && REC.verifyMs >= 300000,
    `${Object.values(REC.cost).reduce((a, b) => a + b, 0)} ms vs ${REC.verifyMs} ms`);
ok("the record admits the one it does not check", REC.notChecked === 1);
ok("the record is frozen", Object.isFrozen(REC) && REC.rounds.every(Object.isFrozen));

// SABOTAGE LOG -- v4551, the sixth check. Applied to tools/ship/recordDrift.mjs and vba/runtimeGap.mjs, gate
// run, red count read, all three files restored and md5-verified. Baseline 0 red.
//   BI the per-row loop deleted, only `files` compared        -> 1 red. The fixture that catches it drifts ONE
//      capability row and leaves the file count correct, which is the whole reason it is built that way: a
//      files-only check is the easy thing to write and v4548 and v4550 both recorded rounds where the file
//      count and the row count moved by different amounts.
//   BJ the check hard-coded to `stale: false`                 -> 3 red.
//   BK the detail reduced to "a row moved", no label          -> 1 red. "Something drifted" is not a finding
//      anybody can act on, and this gate has held that line since v4482 for the other five checks.
//   BL the whole check removed from the pre-flight            -> 1 red, on the count row against the register.
//      That row is why the register carries `checked` and `notChecked` as numbers rather than as prose.
//   BM CENSUS_FIELDS mismapped, "typed arrays" pointed at the promises field -> 1 red. The nastiest of the
//      five, because it drifts nothing and breaks nothing: the check still runs, still compares twelve rows,
//      and silently compares two of them against the wrong record.
//   BN the memo keyed on the constant "one" instead of on the census function -> 1 red, AFTER this round
//      added the row for it. *** IT WENT 0-RED FIRST AND THAT IS THE FINDING OF THIS SET. *** The memo was
//      added because the check took this gate from 1,799 ms to 6,813 ms, past the sweep's 3,000 ms budget --
//      and recordDrift.mjs states in as many words why the key is the FUNCTION: a fixture injecting a fake
//      census would otherwise be served the real answer and pass while measuring nothing. Every other row in
//      this gate stayed green under the constant key, including the five above, because all their fixtures
//      override the recorded NUMBERS and share the real census function. So the file argued for a property
//      that nothing tested, one round after this same session recorded two 0-REDs of exactly that shape in
//      temporalAccumulate. A cache the fixtures cannot get past turns all of them into decoration; the row
//      that catches it injects a census returning counts no tree could produce.
//   No 0-RED among the six, once BN's row exists. Cost of the memo, measured: 6,813 -> 2,647 ms.

console.log(`\nrecordDrift-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
