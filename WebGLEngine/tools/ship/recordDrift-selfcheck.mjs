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
// ---- *** v4647 -- THREE RED HERE MEANT THE TREE HAD DRIFTED, AND IT WAS FILED AS THIS GATE BEING BROKEN ***
//
// A full verify found this gate 3 red on BOTH boxes, and the reds were opened as a backlog item reading "its
// own sabotage rows are what fail" -- because the FAIL text names sabotage F and a fixture, so it READ like a
// detector whose controls had stopped discriminating. That is the failure mode the header above is about, and
// it was the wrong diagnosis. THE GATE WAS EXACTLY RIGHT: three derived records really had gone stale, all
// three created by the rounds that were reading its output.
//
// *** SETTLED BY AN EXPERIMENT RATHER THAN BY READING, AND THE EXPERIMENT IS THE POINT. *** Each stale record
// was restored independently and this gate re-run:
//
//     assertionShape's census stale alone           -> 0 red   (not the cause at all)
//     vba/runtimeGap's census stale alone           -> 2 red
//     both stale together                           -> 2 red
//     all three, including the missing sweep closing -> 3 red, the state it was filed in
//
// So the third row was the closing ledger -- which the verify pre-flight had named in plain words ("sweep
// closings: 5 gate(s) no closing names") in the same output the reds were read from. Restoring the three
// records takes this gate green with nothing here touched.
//
// WHAT TO DO WHEN IT IS RED AGAIN: read the drift pre-flight's line first, and restore each named record one
// at a time. This gate's prose describes its FIXTURES, so a red always reads like a fixture failing; what it
// is reporting is the tree.
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
say(reportLines ? (await reportLines(live)).join("\n  ----  ") : "");
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
    const d = await checks({ load: async (p) => (p.includes("assertionShape") ? fake : import(p)), only: "assertionShape census" });
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
    const d = await checks({ load: async (p) => (p.includes("closingCoverage") ? fake : import(p)), only: "sweep closings" });
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
    const d = await checks({ load: async (p) => (p.includes("registryOrphans") ? fake : import(p)), only: "instrument registry" });
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
    // *** THIS WAS A BARE JSON.parse OF THE FILE quickSweep REWRITES AT RUN END, AND IT WENT RED INSIDE A
    // SWEEP. *** Exactly the torn read tools/ship/recordReach.mjs was repaired for at v4550 -- red twice
    // inside a full sweep, green on 68 runs under 16-way load afterwards, because the trigger was the
    // concurrent WRITE and never the load. The repair there was readTimings(), which returns `ok` rather
    // than assuming it; this gate had its own second reader and did not use it. THAT IS THE RULE THIS FILE'S
    // OWN SECTION 3 ASSERTS ABOUT `sources` -- one definition of the walk, because a second walker can
    // disagree with the first -- applied to itself. Shared reader now, and a torn read is RETRIED rather
    // than either crashing the gate or passing it on nothing: the window is milliseconds, so a file that is
    // still unreadable after three attempts is genuinely broken and the row below says so.
    const { readTimings } = await import("./recordReach.mjs");
    let t = readTimings(ENG), tries = 1;
    while (!t.ok && tries < 3) { await new Promise((r) => setTimeout(r, 40)); t = readTimings(ENG); tries++; }
    ok("!! the live sweep timings are readable, after at most three attempts",
        t.ok === true && t.at && Object.keys(t.at).length > 0,
        `read on attempt ${tries} of at most 3: ${t.entries} readings` +
        (t.error ? `. last error: ${t.error}` : "") + ". A single unguarded parse here is a gate that fails a " +
        "ship at random and never reproduces alone, which gateSweep.mjs's own header calls the worst thing a " +
        "ship-time check can be.");
    if (!t.ok) { console.log("\n" + "FAIL -- sweep timings unreadable after 3 attempts"); process.exit(1); }
    // *** THE TORN READ IS DRIVEN, NOT DESCRIBED -- AND DRIVEN THROUGH THE READER, NOT THE CENSUS. *** Two
    // cases must land differently: a file briefly unparseable because quickSweep is rewriting it must HEAL on
    // retry, and one that stays unparseable must be named rather than crashing the gate or passing it on an
    // empty map. The first version of this row proved that by calling checks({}) twice more, and checks() is
    // O(tree): this gate went 1,870 ms -> 2,376 ms against a 3,000 ms budget and ate the 800 ms margin
    // recordReach-selfcheck requires of both stale-record detectors. IT WENT RED AND IT WAS RIGHT TO. The
    // retry is its own exported function now, so the same two cases cost milliseconds instead of two censuses.
    {
        const TP = path.join(ENG, "tools", "ship", "sweep-timings.json");
        const good = fs.readFileSync(TP, "utf8");
        const RD = await import("./recordDrift.mjs");
        let healed = null, broken = null;
        try {
            fs.writeFileSync(TP, good.slice(0, 300));                                  // torn
            setTimeout(() => { try { fs.writeFileSync(TP, good); } catch {} }, 50);    // ...and healed
            healed = await RD.readTimingsWithRetry(ENG);
            fs.writeFileSync(TP, good.slice(0, 300));                                  // and never healed
            broken = await RD.readTimingsWithRetry(ENG);
        } finally { fs.writeFileSync(TP, good); }
        ok("!! *** A TORN READ HEALS ON RETRY, AND A BROKEN FILE IS NAMED RATHER THAN CRASHING ***",
            healed && healed.rec && healed.tries > 1 && broken && !broken.rec && broken.tries === 3 &&
            typeof broken.error === "string",
            `torn-then-restored: read on attempt ${healed && healed.tries} of 3. permanently truncated: ` +
            `${broken && broken.tries} attempts, then "${String(broken && broken.error).slice(0, 40)}". *** ` +
            `THIS GATE WENT NEW RED INSIDE A SWEEP AT v4556 AND PASSED EVERY TIME IT RAN ALONE *** -- ` +
            `recordDrift.mjs parsed sweep-timings.json bare, the same torn read recordReach.mjs was repaired ` +
            `for at v4550, in a module that had its own second reader and never used the shared one. The ` +
            `retry AWAITS a timer: the first draft spun on Date.now(), blocking this process's event loop, so ` +
            `a restore scheduled 50 ms out could never be dispatched and all three attempts failed. THE ` +
            `\`tries > 1\` IS THE POINT OF THE HEALED CASE -- succeeding on attempt one would prove nothing.`);
    }
    say(`the live timings hold ${Object.keys(t.timings).length} readings and ${Object.keys(t.at).length} stamps`);
    const noStamp = { ...t, at: Object.fromEntries(Object.entries(t.at).filter(([k]) => k !== rel)) };
    const dStamp = await checks({ timings: noStamp, only: "sweep timings" });
    const rowStamp = dStamp.find((c) => c.name === "sweep timings");
    ok("!! a reading WITH a time but WITHOUT its own capture stamp counts as missing evidence",
        rowStamp.stale === true && rowStamp.detail.includes(rel),
        "sabotage D: v4408 found one file-level `captured` covering 1,440 readings of which the run had taken " +
        "937 -- an entry carries its own stamp or it carries nothing");
    const noTime = { ...t, timings: Object.fromEntries(Object.entries(t.timings).filter(([k]) => k !== rel)) };
    ok("...and a missing reading is caught too, so the check is not only about stamps",
        (await checks({ timings: noTime, only: "sweep timings" })).find((c) => c.name === "sweep timings").stale === true);
    ok("...while the untouched record is clean, so neither is simply always true",
        (await checks({ timings: t, only: "sweep timings" })).find((c) => c.name === "sweep timings").stale === false);
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
    // *** v4645 -- `only` ON THE FOUR SABOTAGE CALLS: 5,097 ms -> 2,541 ms, AND IT WAS NOT A MICRO-OPTIMISATION. ***
    // This gate ran four checks() calls with no filter while reading ONE row out of each. The note below is
    // right that the derived census is memoised, but the row above it is right too -- "an injected census is
    // measured, not served from cache" -- so each of these three injected calls paid for the OTHER FIVE checks
    // as well, and those walk the tree. THE COST WAS THE REASON A RECORD WENT UNGUARDED: at 4,892 ms this gate
    // sat over the sweep's 3,000 ms budget, so DRIFT_AT_V4482 -- whose only guardian it is -- was classified
    // `over-budget` rather than `checked` by tools/ship/recordReach.mjs, and had been for rounds. A gate too
    // expensive to run is a guard on paper; halving it puts a record back under a live check.
    const dRow = await checks({ load: async (p) => (p.includes("runtimeGap") ? rowOnly : import(p)), only: "runtimeGap census" });
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
    const dFile = await checks({ load: async (p) => (p.includes("runtimeGap") ? fileOnly : import(p)), only: "runtimeGap census" });
    const rFile = dFile.find((c) => c.name === "runtimeGap census");
    ok("...and a drifted file count is found too, so the check is not only about the rows",
        rFile.stale === true && rFile.detail.includes("files "));
    ok("...while the untouched census is clean, so neither is simply always true",
        (await checks({ only: "runtimeGap census" })).find((c) => c.name === "runtimeGap census").stale === false,
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
    const dFake = await checks({ load: async (p) => (p.includes("runtimeGap") ? fakeCensus : import(p)), only: "runtimeGap census" });
    const rFake = dFake.find((c) => c.name === "runtimeGap census");
    ok("!! the memo is keyed on the census FUNCTION -- an injected census is measured, not served from cache",
        rFake.stale === true && rFake.detail.includes("-> 1"),
        "sabotage BN: keying the memo on a constant went 0-RED against every other row in this gate, which " +
        "is what made this row necessary. A cache the fixtures cannot get past turns them all into decoration");
}
{
    // ---- *** THE MEMO NOW HOLDS FOUR DERIVATIONS, AND ONE PROVEN KEY IS NOT FOUR. *** ----------------------
    //
    // The row above proved the key for runtimeGap's census, back when that was the only thing memoised. This
    // round put assertionShape's census, its gate-file walk and the knowledge-index rebuild behind the SAME
    // map -- the gate makes three full passes over the tree per run and the index rebuild alone was 310 ms of
    // each. Every one of those is a derivation a fixture is supposed to be able to replace, so every one of
    // them needs its own proof that the key is the function and not something coarser. One proof standing in
    // for four is a count standing in for a property.
    //
    // *** THE SABOTAGE WAS RUN PER SITE, BECAUSE THE OBVIOUS ONE IS NOT THE DISCRIMINATING ONE. *** Keying
    // the whole memo on a single constant does not go 0-red, it CRASHES: the first derivation's result is
    // served to the second, `gateFiles` comes back as a census object and checks() throws at line 219, so the
    // gate dies before any row runs. Loud, and therefore not the failure these rows are for. The realistic
    // coarse key is a per-site STRING -- "assertionShapeCensus", "knowledgeIndex" -- which is type-safe and
    // silently serves the fixture the real tree's answer. Measured with exactly that, one site at a time:
    // each produced exactly one red, its own, and nothing else in this gate moved.
    //
    // gateFiles is not given a row: it takes ENG and returns a file list, no check reads it directly, and the
    // two checks that use it are both covered here and above. Said rather than left as a gap.
    const aReal = await import("./assertionShape.mjs");
    const aFake = { ...aReal, census: () => ({ ...aReal.census(), definesOk: 1, gates: 1 }) };
    const dA = await checks({ load: async (p) => (p.includes("assertionShape") ? aFake : import(p)), only: "assertionShape census" });
    const rA = dA.find((c) => c.name === "assertionShape census");
    ok("!! an injected assertionShape census is MEASURED, not served from the memo the live pass filled",
        rA.stale === true && /vs 1,/.test(rA.detail) && /vs 1$/.test(rA.detail),
        `the live drift() at the top of this file has already memoised the real census under the real ` +
        `function; a coarser key would hand this fixture that answer and pass. Got: ${rA.detail}`);

    const kReal = await import("./buildKnowledgeIndex.mjs");
    const kFake = { ...kReal, buildIndex: () => ({ gates: [{ path: "physics/made-up.mjs", kind: "gate", id: "made-up", text: "not on disk" }], claims: [], findings: [] }) };
    const dK = await checks({ load: async (p) => (p.includes("buildKnowledgeIndex") ? kFake : import(p)), only: "knowledge index" });
    const rK = dK.find((c) => c.name === "knowledge index");
    ok("!! an injected index rebuild is MEASURED too, and the diff names what moved",
        rK.stale === true && rK.detail.includes("physics/made-up.mjs") && rK.detail.includes("buildKnowledgeIndex.mjs"),
        `this is the 310 ms one, so it is the one a cache would most want to skip. Got: ${rK.detail}`);
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

// ---- 5. THE PRE-FLIGHT HAS A RUNNER ------------------------------------------------------------------------
console.log("\n5. *** AND SOMETHING ACTUALLY RUNS IT, WHICH FOR FIVE ROUNDS NOTHING DID ***");
{
    // *** v4639. *** Everything above grades what recordDrift.mjs ANSWERS. Nothing graded whether the answer is
    // ever asked for, and it was not: the tree imported that module exactly twice -- from this gate, and from
    // runtimeGap-selfcheck.mjs for the tree walk it also exports and not for the drift check -- while THIS GATE
    // runs 4,997 ms against quickSweep's 3,000 ms budget, so the ship-time sweep skips it. A pre-flight whose
    // only caller is a gate nobody runs is a pre-flight that protects nothing.
    //
    // It was found the way it always is, by the round that needed it: adding one page gate moved five
    // hand-maintained records, recordDrift named the stale one exactly, and it was run by hand after the verify
    // had already gone red. tools/ship/recordReach-selfcheck.mjs has carried a red row saying this outright and
    // it sat unread among the reds nobody was working.
    //
    // Two runners now, and the rows below hold both, because either one alone is how this was lost.
    const RD_SRC = fs.readFileSync(path.join(ENG, "tools", "ship", "recordDrift.mjs"), "utf8");
    ok("*** recordDrift.mjs has a CLI, so the pre-flight can be run on its own rather than only through this gate ***",
        /import\.meta\.url === pathToFileURL\(process\.argv\[1\]/.test(RD_SRC) && /process\.exit\(stale\.length/.test(RD_SRC),
        "node tools/ship/recordDrift.mjs prints the report and exits 1 on stale, so a ritual step reads a status " +
        "rather than grepping a log");
    const V_SRC = fs.readFileSync(path.join(ENG, "tools", "ship", "verify.mjs"), "utf8");
    ok("  ...and verify.mjs runs the drift check itself, so a ship cannot skip it by this gate being slow",
        /recordDrift\.mjs/.test(V_SRC) && /drift\(\)/.test(V_SRC),
        "the check was 1,776 ms while this gate was 4,997 ms -- the expensive half was the GATE, so the step " +
        "calls the module in-process. That stays true now the gate is fast: the in-process call is what makes " +
        "the pre-flight independent of whether this gate is IN the sweep at all");
    // *** THE ROW BELOW USED TO ASSERT THE OPPOSITE, AND ITS COMMENT SAID SO. ***
    //
    // It read: "this gate is STILL over the ship-time budget, which is the fact the two rows above exist for",
    // and held the 4,997 ms so the reason for the CLI stayed findable -- with the note that if the gate ever
    // came back under budget the row would go red and the reason would be owed a re-reading. That is the
    // register-of-grievances shape: a witness row that goes red FOR THE REPAIR, so the only way to green is to
    // leave the gate slow. It went red this round, exactly as predicted, and this is the re-reading.
    //
    // Where it went, measured on this box, three runs each, not remembered. Baseline 5,097 ms:
    //   - 1,972 ms (to 3,125): `only` did not reach four of the six checks. An early
    //     `if (!wanted("sweep timings")) return out;` sat above the runtimeGap census, so a fixture that named
    //     that census got an EMPTY array back -- and four of this gate's own checks() calls passed no filter at
    //     all while reading one row each, paying for a whole census apiece.
    //   -   529 ms (to 2,596): drift() at the top of this file, then reportLines() on the next line running
    //     drift() AGAIN -- a second full six-check pass to print a report on the one just finished.
    //     reportLines now takes the result the caller already has.
    // The rest is module import plus the two full passes this gate genuinely needs, which is the floor.
    //
    // So the row now asserts the live fact, in the direction where repair is green: the gate is in the sweep.
    // If it ever goes back over, THAT is the red, and the CLI plus verify.mjs's in-process call are what keep
    // the pre-flight running in the meantime -- which is why those two rows are above this one and not below.
    const T = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-timings.json"), "utf8"));
    const mine = T.timings["tools/ship/recordDrift-selfcheck.mjs"];
    ok("  and this gate is back UNDER the ship-time budget, so the sweep actually runs it",
        typeof mine === "number" && mine < T.budgetMs,
        `${mine} ms against a ${T.budgetMs} ms budget, down from 4,997. This is the RECORDED timing, which is ` +
        "what quickSweep reads to decide membership -- not a live measurement, so a run that slows the gate " +
        "without re-timing it keeps this green until the next sweepRotation --write");
}

console.log(`\nrecordDrift-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
