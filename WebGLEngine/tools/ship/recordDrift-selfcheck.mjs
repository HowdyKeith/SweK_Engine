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
// That the five records are all of them; they are the ones this session was bitten by. And that this file
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
ok("the checks cover the four re-derivable records", live.all.length === REC.checked);

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

console.log(`\nrecordDrift-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
