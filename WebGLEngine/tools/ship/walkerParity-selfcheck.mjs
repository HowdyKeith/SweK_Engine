// WebGLEngine/tools/ship/walkerParity-selfcheck.mjs -- v4584
//
// Run: node tools/ship/walkerParity-selfcheck.mjs
// RUNTIME 1754 ms ALONE (median of 1784/1754/1609) and 1994 ms AT EIGHT-WIDE (median of five) -- inside the 3000 ms
// sweep budget. It was 3901 ms until the probe stopped asking the suite runner with `--budget 1`: that flag RUNS
// gates, and writeTimings only refuses for --affected, so this gate was rewriting gate-timings.json twice per
// invocation -- the unprotected-filter defect v4580 named one file over, committed by the round citing it. 116
// entries were written that way before it was caught; each is a real exit-0 run labelled `complete`, which v4580
// defined as one cold sample, so the record still says what they are. statedRuntime-selfcheck then found the single
// one badly out -- extrudePolygon at 229 ms against a 31 ms gate -- which is that join doing its job.
//
// SABOTAGE: 13 mutations, 13 red, no 0-RED, nothing crashed -- after passes that produced FIVE 0-REDs, every one a
// defect here, and two of them arrived by FIXING an earlier row:
//   - the suite-population probe could be replaced by a constant {selected: 0, total: 0} and the row passed, because
//     0 === 0. AN EQUALITY BETWEEN TWO NEUTERED READINGS is the shape of every vacuous check this tree has found.
//   - pinning `selected` to fix that was itself wrong: it is the --budget planner's output, cheapest-first against
//     records that move, and it read 27 then 26 on consecutive calls with no fixture involved. The WALK's count is
//     the property; the planner's is reported. v4581 learned the same thing about a median.
//   - and dropping that clause LOST COVERAGE IT HAD BEEN PROVIDING BY ACCIDENT: three sabotages that had been red
//     went 0-RED -- deleting the probe's write entirely, removing the twin gate's plant, and dropping rigRunner from
//     the driven table. Each now has a row of its own, including one that asserts THE FIXTURE ACTUALLY EXISTED while
//     the walkers were asked, which is the same absence the defect hid behind for three rounds.
//
// *** FOUR WALKERS DISCOVER GATES, AND THE RULE THAT A TRANSIENT FIXTURE IS NOT A GATE HAD REACHED TWO OF THEM. ***
//
// Four gates plant a `__`-prefixed *-selfcheck.mjs on disk for the seconds they run -- rigProgress's
// __rigprogress-fixture, gateActivity's __routeProbe, gateMutation's __mutation-decoy and __mutation-crash. v4409
// found what that costs and closed it at ONE walker, tools/ship/gateSweep.mjs's enumerateGates, with the diagnosis
// written out in full: a fixture discovered as a gate gets RUN, "and a fixture built to exit 1 (rigProgress's is)
// then reports as a NEW RED outside every register. It is a race, so it fails a ship at random and never reproduces
// alone, which is the worst shape a ship-time check can have."
//
// v4580 closed it at tools/ship/treeRead.mjs and wrote that the fix lands "at the walker so all four censuses get it
// at once". THAT SENTENCE WAS TRUE OF treeRead'S FOUR CONSUMERS AND I LET IT READ AS FOUR WALKERS. It was not. Two
// walkers were still returning fixtures at v4584:
//
//   ai-bridge/gateWalk.js      -- the shared discovery for rig.html and gates.html, which would OFFER a fixture as
//                                 a clickable gate
//   tools/ship/selfchecks.mjs  -- THE RUNNER THAT RUNS THE SUITE. Measured by planting one fixture: its walk went
//                                 from 1,634 files to 1,635 and its SELECTION from 23 gates to 24, so the fixture
//                                 was discovered AND scheduled. The probe's fixture exited 1 by design.
//
// *** AND THE GATE THAT COMPARES THE TWO TWINS COULD NOT SEE IT, BECAUSE THEY AGREED. ***
// gateWalk.js exists as a deliberate twin of the suite's walk, and gateWalk-selfcheck asserts they return the same
// set. Both were missing v4409's rule, so the comparison passed on a false answer -- the second-copy defect
// timingCoverage-selfcheck recorded at v3584, where "TWO CHECKS THAT LOOKED INDEPENDENT SHARED ONE BUG and agreed
// on a false number". It held a THIRD copy of the walk inline for the comparison, which was also missing the rule.
// Three copies, one omission, unanimous.
//
// WHAT THIS GATE IS FOR: asking every walker the same question by PLANTING A FILE, in one place, so the rule cannot
// arrive at a fourth walker and miss a fifth. Three rounds applied it at whichever walker the round was standing in
// front of; this is the row that stops that.
//
// FOUR WRONG GUESSES PRECEDED THE MEASUREMENT, AND THEY ARE THE REASON THIS FILE EXISTS. The rung named at the close
// of v4583 was that rigRunner "builds its gate list from a payload the rig sends, so what it actually runs is
// decided off this machine". It does not: it discovers from disk through this very shared walk (v4018). Nor is its
// /rig/run endpoint unvalidated -- it requires a `-selfcheck.mjs` suffix, an existing file and no `..`. Nor do those
// three predicates diverge from the offered menu: measured at 1,641 against 1,641, zero either way. The defect was
// one layer past all three guesses, and only a planted file found it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";
import * as TR from "./treeRead.mjs";
import { enumerateGates } from "./gateSweep.mjs";
import * as STALE from "./staleness.mjs";
import * as AS from "./assertionShape.mjs";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const gateWalk = require(path.join(ENG, "ai-bridge", "gateWalk.js"));
const rigRunner = require(path.join(ENG, "ai-bridge", "rigRunner.js"));
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

// The four walkers, each asked the only question that distinguishes them: does it return a file that is on disk
// right now? A SKIP RULE CAN ONLY BE TESTED WHILE THERE IS SOMETHING TO SKIP.
const WALKERS = [
    { name: "ai-bridge/gateWalk.js", why: "rig.html and gates.html", sees: (re) => gateWalk.allGates().some((g) => re.test(g)) },
    { name: "tools/ship/treeRead.mjs", why: "four censuses", sees: (re) =>
        TR.treeFiles(ENG, /node_modules|[/\\]dist[/\\]|[/\\]vendor[/\\]/).some((f) => re.test(f.path)) },
    { name: "tools/ship/gateSweep.mjs", why: "the ship-time sweep", sees: (re) => enumerateGates(ENG).some((g) => re.test(g)) },
    { name: "tools/ship/staleness.mjs", why: "the knowledge index and the affected filter", sees: (re) => STALE.gateFiles().some((g) => re.test(g)) },
    { name: "tools/ship/assertionShape.mjs", why: "the assertion census", sees: (re) => AS.gateFiles().some((g) => re.test(g)) },
    { name: "ai-bridge/rigRunner.js", why: "the /rig/list menu", sees: (re) => rigRunner.discover().some((c) => re.test(c.rel)) },
];

const NAME = "__walkerparity-fixture-selfcheck.mjs";
const FIXTURE = path.join(ENG, "tools", "ship", NAME);
const RE = /__walkerparity-fixture/;

/** The suite's own population, read out of the runner rather than re-implemented: a third copy is the defect. */
function suitePopulation() {
    // --count-only, added at v4584 FOR THIS: the first version asked with `--budget 1`, and writeTimings only
    // refuses for --affected -- so this gate REWROTE gate-timings.json twice on every run, and the verify sweep
    // went red on two other gates pinned to the values it moved. A gate that mutates the record it reports on is
    // the unprotected-filter defect v4580 named one file over, committed by the round that cited it. The flag
    // prints the walk's population and exits before anything is spawned.
    const r = spawnSync(process.execPath, [path.join(HERE, "selfchecks.mjs"), "--count-only"],
                        { cwd: ENG, encoding: "utf8", timeout: 120000 });
    const m = String(r.stdout || "").match(/population (\d+) runnable of (\d+) discovered/);
    return m ? { selected: Number(m[1]), total: Number(m[2]) } : null;
}

console.log("walkerParity-selfcheck -- every walker asked the same question, with a real file on disk\n");

// ---------------------------------------------------------------------------
console.log("1. *** NO WALKER RETURNS A TRANSIENT FIXTURE, ASKED WHILE ONE EXISTS ***");
{
    const bare = WALKERS.map((w) => ({ w, saw: w.sees(RE) }));
    ok("with nothing planted, no walker reports the fixture -- which is the state that hid this for three rounds",
        bare.every((x) => !x.saw),
        "a skip rule looks correct on a tree with nothing to skip, so this row is a CONTROL on the next one " +
        "rather than a finding: if it ever fails, the probe is matching something real.");

    let planted = [], suiteBefore = null, suiteAfter = null, existedDuring = false;
    try {
        suiteBefore = suitePopulation();
        fs.writeFileSync(FIXTURE, "// transient fixture planted by walkerParity-selfcheck; delete if you find it.\n");
        existedDuring = fs.existsSync(FIXTURE);
        planted = WALKERS.map((w) => ({ w, saw: w.sees(RE) }));
        suiteAfter = suitePopulation();
    } finally {
        try { fs.unlinkSync(FIXTURE); } catch { /* already gone */ }
    }

    for (const { w, saw } of planted) say(w.name.padEnd(28), (saw ? "SEES IT" : "excludes") + "   (" + w.why + ")");
    say("tools/ship/selfchecks.mjs   ", suiteBefore && suiteAfter
        ? `${suiteBefore.total} -> ${suiteAfter.total} discovered, ${suiteBefore.selected} -> ${suiteAfter.selected} runnable   (the ship suite)`
        : "(could not read its selection line)");

    // *** AND THE FILE WAS ACTUALLY THERE WHILE THEY WERE ASKED. *** A sabotage deleted the write and every row
    // below passed: with nothing planted, "no walker returns the fixture" is true and means nothing. THAT IS THE
    // SAME ABSENCE THE DEFECT HID BEHIND FOR THREE ROUNDS, reproduced inside the gate built to end it.
    ok("*** and with one on disk, still no walker returns it ***",
        existedDuring && planted.length === WALKERS.length && planted.every((x) => !x.saw),
        planted.filter((x) => x.saw).map((x) => x.name).join(", ") ||
        `all ${WALKERS.length} populations asked with the file present: gateWalk, treeRead, gateSweep, staleness, ` +
        "assertionShape and rigRunner's menu. Before v4584 gateWalk answered SEES IT and so did the suite runner.");

    // *** AND THE TWO NUMBERS MUST BE REAL, NOT MERELY EQUAL. *** A sabotage replaced this probe's parse with a
    // constant {selected: 0, total: 0} and the row passed: 0 === 0. AN EQUALITY BETWEEN TWO NEUTERED READINGS IS
    // THE SHAPE OF EVERY VACUOUS CHECK THIS TREE HAS FOUND -- a control fed by a probe nobody watched. The suite is
    // over a thousand gates and selects at least one, so both readings are held to that before they are compared.
    const real = (x) => !!x && x.total > 1000 && x.selected > 0;
    ok("*** and the SUITE RUNNER neither discovers nor schedules it, which is the one that would have run it ***",
        // AND ONLY THE POPULATION IS PINNED. `selected` is the --budget planner's output: it picks cheapest-first
        // against a wall-clock plan out of records that move between runs, and it read 27 then 26 on two
        // consecutive calls with no fixture involved. A LIVE RECOMPUTATION OF A PLANNER'S OUTPUT IS NOT A
        // PROPERTY -- v4581 learned that about a median -- so it is reported and the WALK's count is asserted.
        real(suiteBefore) && real(suiteAfter) && suiteAfter.total === suiteBefore.total,
        suiteBefore && suiteAfter
            ? `${suiteBefore.total} files both ways (selected ${suiteBefore.selected} then ${suiteAfter.selected}, ` +
              "which is the planner moving, not the walk). At v4584 the walk read 1,634 -> 1,635 AND the selection " +
              "23 -> 24: DISCOVERED AND SCHEDULED, and the fixture rigProgress plants exits 1."
            : "the selection line could not be parsed, so this row fails rather than passing on no evidence");

    ok("...and the fixture is gone afterwards, checked rather than assumed",
        !fs.existsSync(FIXTURE),
        "planted under a finally, removed in it, and the absence asserted -- a probe that leaves a gate behind " +
        "would grow the population it measures, which is gateActivity's own rule about its __routeProbe.");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** AND THE GUARD IS NOT ONE SPELLING, WHICH A ROW HERE ASSERTED BEFORE BEING MEASURED ***");
{
    // *** THE FIRST VERSION OF THIS SECTION GREPPED FOR `!f.startsWith("__")` IN EACH WALKER. ***
    //
    // tools/ship/staleness.mjs would have failed it while being CORRECT: its rule is a negative lookahead inside
    // the name pattern itself -- /^(?!__)[^\\/]*-selfcheck\\.mjs$/ -- and it has carried it all along, which is
    // why nothing ever noticed the other walkers were missing it. A ROW THAT GREPS FOR A SPELLING IS A STRING
    // PROXY FOR A PROPERTY, which is the defect this entire round is about, written into the row built to catch it.
    // Section 1 drives every population against a real file instead, and this section reports the spellings without
    // asserting any of them.
    const forms = [
        ["ai-bridge/gateWalk.js", "a clause: GATE_RE.test(f) && !f.startsWith(\"__\")"],
        ["tools/ship/selfchecks.mjs", "a clause, added v4584"],
        ["tools/ship/treeRead.mjs", "a clause, added v4580"],
        ["tools/ship/gateSweep.mjs", "a clause, added v4409"],
        ["tools/ship/staleness.mjs", "a LOOKAHEAD in the pattern: /^(?!__)[^/]*-selfcheck.mjs$/ -- always had it"],
    ];
    for (const [f, how] of forms) say(f.padEnd(28), how);

    // What IS asserted is that a sixth population cannot arrive unnoticed: every exported gate list is either
    // driven in section 1 or named here as delegating to one that is.
    const ENUMERATORS = /export (?:function|const) (allGates|enumerateGates|gateFiles|treePaths|discover)\b/g;
    const exporters = [];
    for (const f of TR.treePaths()) {
        const src = noComments(fs.readFileSync(f, "utf8"));
        const rel = path.relative(ENG, f).split(path.sep).join("/");
        for (const m of src.matchAll(ENUMERATORS)) exporters.push(rel + ":" + m[1]);
        if (/module\.exports[\s\S]{0,200}?\ballGates\b/.test(src)) exporters.push(rel + ":allGates");
    }
    const DRIVEN = ["ai-bridge/gateWalk.js:allGates", "tools/ship/gateSweep.mjs:enumerateGates",
                    "tools/ship/treeRead.mjs:treePaths", "tools/ship/staleness.mjs:gateFiles",
                    "tools/ship/assertionShape.mjs:gateFiles"];
    const DELEGATES = ["tools/ship/singleSource-selfcheck.mjs:gateFiles"];
    const unknown = exporters.filter((e) => !DRIVEN.includes(e) && !DELEGATES.includes(e));
    say("modules exporting a gate population", exporters.length + ": " + exporters.map((e) => e.split("/").pop()).join(", "));
    // AND THE TWO LISTS IN THIS FILE MUST AGREE: dropping rigRunner from section 1's table left this row happily
    // calling it driven. A list that names what another list is supposed to contain has to check that it does.
    const DRIVEN_NAMES = new Set(WALKERS.map((w) => w.name));
    const claimedNotDriven = DRIVEN.map((d) => d.split(":")[0]).filter((f) => !DRIVEN_NAMES.has(f));
    ok("...and every population this section calls driven is in section 1's table",
        claimedNotDriven.length === 0 && DRIVEN_NAMES.has("ai-bridge/rigRunner.js"),
        claimedNotDriven.length ? "CLAIMED BUT NOT DRIVEN: " + claimedNotDriven.join(", ")
                                : `${DRIVEN_NAMES.size} in the table, ${DRIVEN.length} claimed driven here`);
    ok("*** every exported gate population is driven in section 1, or named here as delegating to one ***",
        unknown.length === 0,
        unknown.length ? "UNKNOWN: " + unknown.join(", ") + " -- drive it in section 1 or say why its population is " +
                         "not a gate list"
                       : `${DRIVEN.length} driven, ${DELEGATES.length} delegating. A SIXTH FAILS THIS ROW ON ` +
                         "ARRIVAL, which is the whole point: v4409's rule reached its third and fourth walkers " +
                         "three rounds apart because nothing was counting walkers.");

    // The twin-comparison gate keeps its OWN planted-fixture drive, because its two walks can only be told apart
    // while a file exists -- removing that plant was a 0-RED here until this row existed.
    const twinGate = noComments(fs.readFileSync(path.join(HERE, "gateWalk-selfcheck.mjs"), "utf8"));
    ok("...and gateWalk-selfcheck still PLANTS a fixture to tell its two walks apart",
        /writeFileSync\(planted,/.test(twinGate) && /__gatewalkparity/.test(twinGate),
        "its set comparison agreed on a false answer for as long as both copies shared the omission, and a tree " +
        "with no fixture in it is exactly the state in which that looked correct.");
}

console.log("\n3. WHAT THE PREVIOUS ROUND'S PROPOSED RUNG ACTUALLY WAS, MEASURED AND WITHDRAWN");
{
    // Recorded here rather than dropped: three guesses about rigRunner, each wrong, and the numbers that refused
    // them. A rung proposed and not measured is a claim, and this arc's rule is that a claim gets a number.
    const rigSrc = noComments(fs.readFileSync(path.join(ENG, "ai-bridge", "rigRunner.js"), "utf8"));
    const offered = new Set(gateWalk.allGates());
    const rig = require(path.join(ENG, "ai-bridge", "rigRunner.js"));
    const discovered = rig.discover ? rig.discover().map((c) => c.rel) : [...offered];

    ok("*** rigRunner discovers from disk through the shared walk, not from anything the rig sends ***",
        /require\(["']\.\/gateWalk\.js["']\)/.test(rigSrc) && /gateWalk\.allGates\(\)/.test(rigSrc),
        "v4583's close proposed the opposite. v4018 had already made this the single shared walk, and the " +
        "comment saying so was right there -- THE GUESS WAS NOT CHECKED BEFORE IT WAS WRITTEN DOWN as the next " +
        "rung.");

    ok("...and /rig/run validates what it is handed: suffix, existence, and no parent escape",
        /rel\.endsWith\("-selfcheck\.mjs"\)/.test(rigSrc) && /fs\.existsSync\(file\)/.test(rigSrc) &&
        /rel\.includes\("\.\."\)/.test(rigSrc),
        "three predicates, so the second guess -- an unvalidated path from the request body -- was wrong too.");

    ok("*** and the validated set equals the offered set exactly, which was the third wrong guess ***",
        discovered.length === offered.size && discovered.every((r) => offered.has(r)),
        `${discovered.length} offered and ${offered.size} acceptable, zero divergence either way. The menu and ` +
        "the kitchen agree. THE DEFECT WAS ONE LAYER PAST ALL THREE GUESSES -- in what the shared walk itself " +
        "returns while a fixture is on disk -- and no amount of reading found it: a planted file did.");
}

console.log(fails ? `\nwalkerParity-selfcheck: ${fails} FAILED` : "\nwalkerParity-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
