// WebGLEngine/tools/ship/releaseLedger-selfcheck.mjs -- v4449
//
// Run: node tools/ship/releaseLedger-selfcheck.mjs   (~40 ms, no network)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** THE FLEET DOWNLOADS releases/latest, AND FOR 261 SHIPPED VERSIONS IT HAS DOWNLOADED THREE OF THEM. ***
//
// Keith: "we want you publish a release per shipped version, so the fleet runs what is actually built."
// Measured from the API against docs/CHANGELOG.md before a line of this was written:
//
//     tree ENGINE_VERSION       v4448        newest published release  v4438   -- TEN VERSIONS BEHIND
//     shipped in the changelog  261          shipped AND released        3     -- 1.1%
//
// The download chain has been complete and gated since v3907. What was missing was the ASKING: the ship
// ritual had eight steps and not one of them said "publish". 1.1% is what "somebody will remember" looks
// like over 261 rounds.
//
// ---- WHAT THIS GATE ASSERTS, AND THE ONE THING IT DELIBERATELY ONLY REPORTS -------------------------------
//
// ASSERTED: *** YOU MAY NOT SHIP A NEW VERSION WHILE THE LAST ONE IS UNRELEASED. *** Checked the naive way --
// "ENGINE_VERSION must have a release" -- it would be RED THROUGHOUT EVERY CORRECT SHIP, because verify runs
// before the commit and the release is published after the tag is pushed. A gate that is red for the whole of
// every correct ship teaches people to ignore it, which is precisely how this tree acquired a red register
// nobody read for thirty-nine rounds. The ratchet form is false only when somebody actually skipped one.
//
// REPORTED, NOT ASSERTED: the ten-version lag itself. It is real, it is the reason this file exists, and it
// predates the rule -- so it is printed as a number on every run rather than made a red that blocks work
// nobody can unblock. Back-filling is not available either: the zip is not byte-reproducible (v4068 measured
// 26,775,683 / 27,424,068 / 27,766,762 bytes for one commit on three machines), so a release built today for
// v4301 would carry bytes v4301 never had.
//
// ---- SABOTAGE LOG (required before this gate counted as real) ---------------------------------------------
//   1. baseline throughVersion 4448 -> 4300
//      -> exit=1, 2 red. Section 2 named 117 owed versions. (I had PREDICTED 144 before running it and wrote
//         that number into this log; the gate said 117. The prediction was arithmetic done in my head over a
//         changelog with gaps in it, and it was wrong by 27. Corrected here rather than quietly fixed.)
//   2. deleted the v4438 row -- the newest release
//      -> *** exit=0, ZERO RED, AND THAT IS THE FINDING. *** The reported lag went from 10 to 148 and every
//         assertion still passed, because the lag is reported rather than asserted. A release the fleet is
//         already running could vanish -- upstream delete, bad merge -- and this gate would have shrugged.
//         Closed by the ratchet added to section 3: re-run after the fix, the same sabotage is exit=1 with
//         both ratchet lines red by name. A SABOTAGE THAT GOES 0 RED IS A FINDING, NOT A PASS.
//   3. reversed the ledger order (newest last)
//      -> exit=1, section 1 red: releases[0] is what the fleet downloads, so a mis-sorted ledger answers a
//         different question than the one it is asked.
//   5. (v4450) raised baseline.throughVersion to 4449 for a real reason, with raisedAt/raisedWhy
//      -> exit=1 on the OLD check, which pinned `=== 4448`. That is the check being wrong, not the ledger:
//         a gate holding its own copy of the number it guards goes red on every legitimate move, and the
//         edit that silences it looks exactly like the drift it exists to catch. Replaced with a receipt
//         rule -- a raise must name the round and carry a reason over 200 chars, and the raise is REPORTED
//         on every run so it cannot be quiet. Re-sabotaged: raisedWhy deleted -> exit=1 red by name;
//         raisedAt set to "later" -> exit=1 red by name; baseline set to the tree's own version -> exit=1
//         on the new second line, which is the edit that would make the ratchet vacuous forever.
//   4. inserted v4999, a release NEWER than the tree
//      -> exit=1, section 3 red: a tag ahead of the source is one pushed from a tree nobody committed, and
//         the fleet would be running code this repo does not contain.
// ---- v4453: THE STRUCTURE, BECAUSE THE RULE HAD BEEN SWITCHED OFF POLITELY ---------------------------------
// Keith: "fix the structure before v4453." v4449's ratchet was a hard zero -- the previous version must be
// released -- which is right when the ship and the publish happen on ONE machine and unsatisfiable when they
// do not. Rounds are built where there are no credentials to publish; the rig publishes afterwards, by hand.
// So the previous version was unreleased AT EVERY SHIP, BY CONSTRUCTION, the gate went red at v4450, v4451 and
// v4452, and each time the answer was to raise the baseline. THREE RAISES IN THREE ROUNDS IS A GATE
// COLLECTING SIGNATURES, NOT ENFORCING ANYTHING.
//
// Two changes, and neither loosens what the rule protects. (1) The question is asked about MAIN, which is what
// v4449's own words always said -- "a version that reaches MAIN and never reaches the releases page" -- while
// it read the WORKING TREE's changelog, so an unmerged branch counted as debt the fleet was owed. (2) The hard
// zero becomes a stated LAG BUDGET: main may run at most N versions ahead of the releases page. N=3 here,
// against a failure of 3 releases across 261 versions, which is 87 times the budget. The budget lives OUTSIDE
// baseline on purpose: the baseline forgives what has gone by, the budget bounds what comes next, and if one
// edit could do both the escape hatch would swallow the rule again one level up.
//
//   SABOTAGE LOG (v4453):
//     1. removed lagBudget entirely -> exit=1, 3 red. AN UNSTATED BUDGET IS NOT AN INFINITE ONE: that is
//        v4413's floor-with-no-ceiling wearing this file's clothes, so it fails rather than passes.
//     2. dropped the six newest releases and lowered the baseline to v4290 -> exit=1, "132 of 3 allowed".
//        The budget bites, and it bites at the scale the mechanism exists for.
//     3. moved maxVersionsBehind INSIDE baseline -> exit=1, 1 red by name: one edit doing both jobs is the
//        escape hatch eating the rule.
//     4. degrade to the working tree while REPORTING "origin/main" -> *** exit=0 TWICE BEFORE IT CLOSED. ***
//        The first check asked `owedSource === "origin/main" || owedDegraded`, which a lying label satisfies
//        -- a restatement of what the thing under test says about itself. The second compared COUNTS against
//        an independent read, and that was unfalsifiable too: at the moment it ran, the branch and main were
//        IDENTICAL, so no count could tell them apart. Closed by making the reader INJECTABLE, so the gate
//        hands in a main that differs; now exit=1 red by name.
//     5. lagBudget.why cut to one word -> exit=1, 1 red: a bound with no argument behind it is the next thing
//        somebody raises without one.
//     6. owed built from the working tree instead of main -> exit=0 first (same identical-state blindness),
//        then exit=1 red by name once a fixture ledger with a low floor made `owed` NON-EMPTY -- an empty
//        owed-set proves nothing about which list produced it.
//
// *** AND A NOTE ON HOW TWO OF THOSE ZEROS LOOKED LIKE ZEROS: *** the sabotage runs counted lines matching
// "^  FAIL", and a gate that CRASHES prints none of them. One "0 red" in this session was a syntax error in
// the sabotage itself, read as a gate that failed to notice. Sabotages are graded on the EXIT CODE here.
"use strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { ledgerState, readLedger, engineVersion, shippedVersions, num, LEDGER, ENG, ROOT } from "./releaseLedger.mjs";
import { rowsFrom } from "./refreshReleases.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m, d) => console.log("  ....  " + m + (d ? "   " + d : ""));

console.log("releaseLedger-selfcheck -- does the fleet run what is actually built?\n");

const led = readLedger();
const S = ledgerState();
const LED = readLedger();

console.log("1. THE LEDGER IS A RECORD, NOT A BELIEF");
{
    ok("releases.json exists and parses", !!led && Array.isArray(led.releases), LEDGER);
    ok("every row is a vNNNN tag with a publish time",
        led.releases.length > 0 && led.releases.every((r) => /^v\d+$/.test(r.tag) && r.publishedAt),
        led.releases.length + " releases, newest " + led.releases[0].tag + " at " + led.releases[0].publishedAt);
    ok("the rows are newest-first, so releases[0] IS the one the fleet would download",
        led.releases.every((r, i, a) => i === 0 || num(a[i - 1].tag) > num(r.tag)),
        "releases/latest is what fetchEngineBuild pulls; a mis-sorted ledger would answer the wrong question");
    ok("!! it records WHERE it came from and WHEN, so a stale ledger is visible rather than assumed fresh",
        !!led.source && !!led.refreshedAt,
        led.source + "  refreshed " + led.refreshedAt);
}

console.log("\n2. *** THE LAG BUDGET: MAIN MAY RUN AHEAD OF THE RELEASES PAGE, BUT ONLY SO FAR ***");
{
    // *** v4453 -- THE HARD ZERO BECAME A BUDGET, AND THE REASON IS THAT THE ZERO WAS UNSATISFIABLE HERE. ***
    // v4449 wrote "you may not ship a new version while the last one is unreleased", which is exactly right
    // when the ship and the publish happen on ONE machine. They do not: rounds are built where there are no
    // credentials to publish and the rig publishes afterwards, by hand -- so the previous version is
    // unreleased AT EVERY SHIP, BY CONSTRUCTION. The gate went red at v4450, v4451 and v4452, and each time
    // the answer was to raise the baseline. THREE RAISES IN THREE ROUNDS IS A RULE THAT HAS BEEN SWITCHED OFF
    // POLITELY: a gate whose only reachable state is "write off the debt" is collecting signatures, not
    // enforcing anything. Keith, on the third: "fix the structure before v4453."
    //
    // What the rule protects is not zero lag; it is that THE FLEET DOES NOT FALL BEHIND. 3 releases across
    // 261 versions is the failure it was built for -- 87 times this budget.
    // *** THE BUDGET DOES NOT BIND ON A REPUBLISH, AND SAYING SO IS THE WHOLE OF WHY THIS IS NOT A SKIP. ***
    // v4453 put this assertion where verify runs it, and THE PUBLISH ROUTE RUNS VERIFY: `Clone -> verify`
    // grades a clone of main, `Publish the verified clone` refuses on a red verdict. So the moment the lag
    // exceeded the budget, the gate that exists to force a publish LOCKED THE PUBLISH THAT WOULD CLEAR IT --
    // found at 7 of 3 with the fleet fourteen versions back. The budget now binds only on a tree that would
    // ADD a version to main; a clone republishing what main already holds is the catch-up it wants.
    if (!S.budgetBinds) report("the budget is NOT asserted on this tree, and here is why",
        "ENGINE_VERSION " + S.tree + " is ALREADY ON MAIN, so this tree adds nothing and can only reduce the " +
        "lag -- it is a republish, not a ship. The count is still printed below and is still " + S.owed.length +
        " of " + S.budget + ". A CHECK THAT QUIETLY STOPS CHECKING IS THE DEFECT THIS FILE HAS CAUGHT THREE " +
        "TIMES, so it says which question it declined and what the answer would have been.");
    ok("!! *** main runs no more than the budget ahead of the releases page ***",
        S.withinBudget,
        !S.budgetStated
            ? "NO lagBudget IN releases.json. AN UNSTATED BUDGET IS NOT AN INFINITE ONE -- that is v4413's " +
              "floor-with-no-ceiling wearing this file's clothes, and it fails rather than passes"
            : S.owed.length
                ? S.owed.length + " of " + S.budget + " allowed: " + S.owed.slice(0, 12).map((v) => "v" + v).join(", ") +
                  (S.owed.length > 12 ? " (+" + (S.owed.length - 12) + " more)" : "") +
                  (!S.budgetBinds ? " -- NOT ASSERTED on this tree (a republish adds nothing to main); the " +
                        "number is printed so nobody reads silence as zero"
                     : S.withinBudget ? " -- within budget"
                     : ". PUBLISH BEFORE SHIPPING AGAIN -- the ship skill's step 7 is the how")
                : "nothing owed at all. Baseline v" + S.floor + ", tree " + S.tree + ", budget " + S.budget +
                  "; the rule binds from v" + (S.floor + 1) + " forward");
    ok("!! ...and it binds on the party that can make the gap WORSE, which is checked and not assumed",
        typeof S.addsToMain === "boolean" && S.budgetBinds === S.addsToMain,
        "addsToMain=" + S.addsToMain + " (tree " + S.tree + (S.addsToMain ? " is NOT on main -- shipping it " +
        "pushes main one further, so the budget binds)" : " is already on main -- publishing it only reduces " +
        "the lag, so the budget does not)") + ". DERIVED FROM MAIN'S OWN VERSION LIST, not a flag: a flag for " +
        "'this is a republish' is a flag somebody sets to get past the gate");

    // *** THE QUESTION IS ABOUT MAIN, WHICH IS WHAT THE RULE ALWAYS SAID AND NOT WHAT IT MEASURED. ***
    // v4449's own words: "a version that reaches MAIN and never reaches the releases page is a version nobody
    // outside this repo will ever run." It then read the WORKING TREE's changelog, which gains a round's entry
    // in the same commit as the version bump -- so a round sitting on an unmerged branch counted as debt the
    // fleet was owed, when nobody could download it and nobody was missing anything.
    // *** VERIFIED INDEPENDENTLY, BECAUSE THE FIRST DRAFT TRUSTED THE LABEL AND A SABOTAGE WALKED PAST IT. ***
    // It asked `S.owedSource === "origin/main" || S.owedDegraded` -- which is satisfied by a module that
    // silently reads the WORKING TREE and calls it origin/main. That is not a check, it is a restatement of
    // what the thing under test says about itself, and it went ZERO RED on exactly that sabotage. The gate
    // reads main for itself and compares counts; a lying label now disagrees with an independent read.
    let ownMain = null, ownWhy = "";
    try {
        const out = execFileSync("git", ["show", "origin/main:docs/CHANGELOG.md"],
            { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
        ownMain = [...out.matchAll(/^## v(\d+)/gm)].length;
    } catch (e) { ownWhy = String((e && e.message) || e).split("\n")[0].slice(0, 70); }
    ok("!! ...and the versions it counts really are main's, checked against an independent read",
        ownMain === null ? S.owedDegraded === true : (S.owedDegraded === false && S.mainCount === ownMain),
        ownMain === null
            ? "this gate cannot read origin/main either (" + ownWhy + "), so the module MUST report degraded " +
              "-- and it reports " + S.owedDegraded + ". A missing tool makes the check stricter, never quieter"
            : "module says " + S.mainCount + " from " + S.owedSource + "; this gate read " + ownMain +
              " straight from origin/main. THE COUNT IS COMPARED RATHER THAN THE LABEL BELIEVED: a module that " +
              "read the working tree and called it main would pass a check written the obvious way, and did");

    // *** AND THE PREFERENCE IS DRIVEN, NOT INFERRED. *** The check above compares counts, which can only
    // tell main from the working tree WHEN THEY DIFFER -- and on the state this round shipped in, they were
    // identical, so swapping the arithmetic to the working tree went ZERO RED twice. Here main is handed in
    // deliberately SHORTER than the tree, and the answer says which list the owed-set was built from.
    {
        // A FIXTURE LEDGER, so the floor is low enough for `owed` to be NON-EMPTY: at the real floor nothing
        // sits between it and the tree, and an empty owed-set proves nothing about which list built it.
        const tmpL = path.join(os.tmpdir(), "swek-ledger-" + process.pid + ".json");
        fs.writeFileSync(tmpL, JSON.stringify({
            baseline: { throughVersion: 4000, raisedAt: "vTEST", raisedWhy: "x".repeat(220), note: "y".repeat(140) },
            lagBudget: { maxVersionsBehind: 99, why: "z".repeat(220) },
            releases: [{ tag: "v4001" }],
        }));
        // A main holding TWO versions the tree also has, and NOT the hundreds of others the tree carries.
        const fakeMain = "## v4111 -- one\n\n## v4222 -- two\n";
        const viaMain = ledgerState({ file: tmpL, readMain: () => fakeMain });
        const viaTree = ledgerState({ readMain: () => { throw new Error("no main here"); } });
        const owedIsMains = viaMain.owed.length === 2 && viaMain.owed.includes(4111) && viaMain.owed.includes(4222);
        ok("!! *** the owed set is built from MAIN's versions, proven with a main that differs from the tree ***",
            owedIsMains && viaMain.mainCount === 2 && viaMain.owedSource === "origin/main" && !viaMain.owedDegraded,
            "handed a main holding only v4111 and v4222 against a floor of v4000, the module owed [" +
            viaMain.owed.join(",") + "] -- EXACTLY MAIN'S TWO, not the " + shippedVersions(ROOT).length +
            " this working tree carries. A COUNT COMPARISON ALONE COULD NOT SHOW THIS: main and the tree were " +
            "identical when this round shipped, so swapping the arithmetic to the tree went ZERO RED TWICE");
        // *** AND IT STILL BITES, WHICH AN EXEMPTION MAKES WORTH PROVING RATHER THAN ASSUMING. *** The
        // republish exemption is the fix for a deadlock; an exemption that quietly swallowed the whole rule
        // would look identical from the green side. Here the tree is NOT on main and the lag exceeds the
        // budget -- the exact case a ship must be refused in.
        const tmpB = path.join(os.tmpdir(), "swek-ledger-b-" + process.pid + ".json");
        fs.writeFileSync(tmpB, JSON.stringify({
            baseline: { throughVersion: 4000, raisedAt: "vTEST", raisedWhy: "x".repeat(220), note: "y".repeat(140) },
            lagBudget: { maxVersionsBehind: 2, why: "z".repeat(220) },   // small ON PURPOSE: 4 owed must exceed it
            releases: [{ tag: "v4001" }],
        }));
        const shipping = ledgerState({ file: tmpB, readMain: () => "## v4111 -- one\n\n## v4222 -- two\n\n## v4333 -- three\n\n## v4444 -- four\n" });
        ok("!! *** and a tree that WOULD add to main is still refused when the lag exceeds the budget ***",
            shipping.addsToMain === true && shipping.budgetBinds === true && shipping.withinBudget === false &&
            shipping.owed.length > shipping.budget,
            "tree " + shipping.tree + " is not among main's four, so addsToMain=true and the budget binds: " +
            shipping.owed.length + " owed against " + shipping.budget + " allowed -> REFUSED. AN EXEMPTION " +
            "THAT SWALLOWED THE RULE WOULD LOOK IDENTICAL FROM THE GREEN SIDE, so both directions are driven");
        // *** v4461 -- THE SUPERSEDED FLOOR, DRIVEN IN BOTH DIRECTIONS IN ONE FIXTURE. ***
        // `owed` now skips versions beneath the newest PUBLISHED release, because a box downloading
        // releases/latest already holds their code. That forgives, so it has to be shown NOT forgiving the
        // case the rule is for -- and the same main, with the same floor, answers both questions at once.
        const mainFour = () => "## v4111 -- one\n\n## v4222 -- two\n\n## v4333 -- three\n\n## v4444 -- four\n";
        const withFixture = (releases) => {
            const f = path.join(os.tmpdir(), "swek-ledger-s" + releases.length + "-" + process.pid + ".json");
            fs.writeFileSync(f, JSON.stringify({
                baseline: { throughVersion: 4000, raisedAt: "vTEST", raisedWhy: "x".repeat(220), note: "y".repeat(140) },
                lagBudget: { maxVersionsBehind: 2, why: "z".repeat(220) },
                releases: releases.map((t) => ({ tag: t })),
            }));
            const st = ledgerState({ file: f, readMain: mainFour });
            try { fs.unlinkSync(f); } catch {}
            return st;
        };
        // Nothing published above the floor: every one of main's four below the tree is still owed.
        const noneOut = withFixture(["v4001"]);
        // v4333 published: v4111 and v4222 are BENEATH it, so their code shipped inside it; v4444 is not.
        const someOut = withFixture(["v4001", "v4333"]);
        ok("!! *** a version BENEATH the newest published release is superseded, not owed ***",
            noneOut.owed.join(",") === "4444,4333,4222,4111" && someOut.owed.join(",") === "4444" &&
            someOut.supersededByPublish === 4333,
            "same main (v4111..v4444), same floor v4000. Publish nothing above the floor -> owed [" +
            noneOut.owed.join(",") + "]. Publish v4333 -> owed [" + someOut.owed.join(",") + "]: v4111 and " +
            "v4222 are inside the v4333 build a box can actually download, v4444 is not. *** THE FLOOR THAT " +
            "MOVED IS AN OBSERVED PUBLISH, NOT A NUMBER SOMEBODY TYPED. ***");
        ok("!! ...and it still REFUSES the ship, so the forgiveness did not swallow the rule",
            someOut.addsToMain === true && someOut.budgetBinds === true &&
            noneOut.withinBudget === false && someOut.owed.length <= someOut.budget,
            "with v4333 published the list is 1 of " + someOut.budget + " and the tree may ship; with nothing " +
            "published it is " + noneOut.owed.length + " of " + noneOut.budget + " and it may not. A FLOOR " +
            "THAT CAN ONLY BE RAISED BY PUBLISHING SOMETHING makes the do-nothing path no easier than before, " +
            "which is exactly what the three baseline raises could not say for themselves");
        ok("!! ...and the two floors are reported apart, because only one of them can be typed",
            S.floor === (LED && +LED.baseline.throughVersion) && S.supersededBy === Math.max(S.floor, S.latest),
            "declared write-off v" + S.floor + " against observed publish v" + (S.supersededByPublish || 0) +
            "; the effective floor is v" + S.supersededBy + ". Folding them into one number would let a " +
            "write-off be read as a publish, which is the difference between owing a debt and paying it");
        try { fs.unlinkSync(tmpL); fs.unlinkSync(tmpB); } catch {}
        ok("!! ...and when main cannot be read it DEGRADES LOUDLY to the stricter list",
            viaTree.owedDegraded === true && viaTree.owedSource === "working tree" &&
            viaTree.mainCount === shippedVersions(ROOT).length,
            "reader threw: degraded=" + viaTree.owedDegraded + ", source=" + viaTree.owedSource + ", counted " +
            viaTree.mainCount + ". The working tree's list is a SUPERSET of main's, so a missing tool makes " +
            "this OVER-report debt -- stricter, never quieter, and it says which it did");
    }

    ok("!! ...and the budget is NOT part of the baseline, so a write-off cannot widen it",
        !!(LED && LED.lagBudget && LED.baseline && LED.baseline.maxVersionsBehind === undefined),
        "the baseline forgives versions already gone by; the budget bounds the next ones. If ONE edit could " +
        "do both, the escape hatch that swallowed this rule three times would swallow it again one level up");

    ok("...and the budget carries the reason it is that number",
        !!(LED && LED.lagBudget && typeof LED.lagBudget.why === "string" && LED.lagBudget.why.length > 200),
        "a bound with no argument behind it is the next thing somebody raises without one");
    // *** v4450 -- THIS CHECK USED TO PIN THE LITERAL 4448, AND THAT WAS A SECOND COPY OF THE NUMBER. ***
    // The intent was right -- moving the baseline must be an ACT, not a drift -- but `=== 4448` means the
    // gate holds its own copy of a value that lives in releases.json, so a legitimate raise goes red until
    // somebody edits the gate too, and EDITING THE GATE'S LITERAL IS EXACTLY HOW SOMEBODY WOULD DRIFT IT
    // QUIETLY. It went red the first time the baseline moved for a real reason, which is the pinned-constant
    // family this tree has now found about a dozen times. The property is kept and the copy is dropped: a
    // raise must CARRY ITS OWN RECEIPT, and the receipt is printed on every run so it can never be quiet.
    const bl = led.baseline || {};
    const raised = !!bl.raisedAt;
    ok("!! *** the baseline cannot be raised silently: a raise carries the round that did it and why ***",
        typeof bl.throughVersion === "number" && bl.throughVersion > 0 &&
        (!raised || (/^v\d+$/.test(bl.raisedAt) && typeof bl.raisedWhy === "string" && bl.raisedWhy.length > 200)),
        "throughVersion " + bl.throughVersion + (raised ? ", raised at " + bl.raisedAt : ", never raised") +
        ". 258 of the 261 versions in the changelog shipped unreleased before the ritual asked for one. " +
        "RAISING THIS WRITES OFF MORE DEBT, and a written reason in the diff is what makes it an act. " +
        "THE NUMBER IS NOT PINNED HERE ANY MORE: a gate holding its own copy of the value it guards goes red " +
        "on every legitimate move, and the edit that silences it is indistinguishable from the drift.");
    if (raised) report("*** DEBT WAS WRITTEN OFF AT " + bl.raisedAt + ", THROUGH v" + bl.throughVersion + " ***",
        bl.raisedWhy.slice(0, 240) + (bl.raisedWhy.length > 240 ? "..." : ""));
    ok("...and the baseline never covers the version being shipped",
        bl.throughVersion < S.treeN,
        "baseline v" + bl.throughVersion + " against tree " + S.tree + ". A baseline at or above ENGINE_VERSION " +
        "writes off the round in progress, which would make the ratchet vacuous for every future ship in one edit");
    ok("...and it carries the reason it is frozen rather than a bare number",
        !!(led.baseline && typeof led.baseline.note === "string" && led.baseline.note.length > 120),
        "a baseline without a rule written on it becomes a dumping ground -- pageReach-baseline.json's lesson, " +
        "applied to releases");
}

console.log("\n3. WHAT THE FLEET WOULD ACTUALLY RUN RIGHT NOW");
{
    ok("the tree states a version at all", /^v\d+$/.test(S.tree), "ENGINE_VERSION = " + S.tree);
    ok("the ledger's newest release is not AHEAD of the tree",
        S.latest <= S.treeN,
        "latest " + S.latestTag + " vs tree " + S.tree + " -- a release newer than the source is a tag pushed " +
        "from a tree nobody committed, and the fleet would be running code this repo does not contain");
    report(S.fleetRunsWhatIsBuilt
            ? "*** THE FLEET RUNS WHAT IS BUILT: releases/latest == " + S.tree + " ***"
            : "*** THE FLEET IS " + S.behind + " VERSIONS BEHIND: it downloads " + S.latestTag +
              " while the tree builds " + S.tree + " ***",
        "REPORTED, NOT ASSERTED -- see the header. This number is the whole point of the file and it should " +
        "read 0 on the round after any correct ship.");
    // *** ADDED AFTER SABOTAGE 2, WHICH FOUND NOTHING AND WAS THEREFORE THE MOST USEFUL OF THE FOUR. ***
    // Deleting the newest row from the ledger moved the reported lag from 10 to 148 and turned NOTHING red:
    // every assertion above still held, because the lag is REPORTED. A release the fleet is already running
    // must not be able to disappear silently -- from an upstream delete, or from a ledger truncated by a bad
    // merge -- so the two numbers that would move are ratcheted. refreshReleases raises them when it writes.
    const R = led.ratchet || {};
    ok("!! *** a release the fleet was already running cannot vanish: the count may only RISE ***",
        S.releaseCount >= (R.minReleases || 0),
        S.releaseCount + " in the ledger against a floor of " + (R.minReleases || 0) +
        (S.releaseCount < (R.minReleases || 0) ? " -- A PUBLISHED RELEASE IS MISSING" : ""));
    ok("...and so may the newest tag, so the fleet is never told to run something older than it already has",
        S.latest >= (R.minLatest || 0),
        "newest " + S.latestTag + " against a floor of v" + (R.minLatest || 0));
    ok("...and the ratchet says what it is for rather than being two bare numbers",
        typeof R.note === "string" && R.note.length > 120);
    report("coverage so far", S.releaseCount + " releases published; " + S.shippedCount +
        " versions in the changelog; the ledger's oldest is v" + num(led.releases[led.releases.length - 1].tag));
}

console.log("\n4. THE REFRESH DECIDES WHAT COUNTS AS PUBLISHED, AND IT IS DRIVEN WITH A REAL PAYLOAD");
{
    // Shapes taken from the live API response for this repo, plus the three cases that must be refused.
    const fixture = [
        { draft: false, prerelease: false, tag_name: "v4438", published_at: "2026-09-04T00:51:23Z" },
        { draft: true, prerelease: false, tag_name: "v9999", published_at: "2026-09-04T01:00:00Z" },
        { draft: false, prerelease: true, tag_name: "v4400", published_at: "2026-08-30T00:00:00Z" },
        { draft: false, prerelease: false, tag_name: "nightly", published_at: "2026-08-30T00:00:00Z" },
        { draft: false, prerelease: false, tag_name: "v4296", published_at: "2026-09-01T20:42:55Z" },
    ];
    const rows = rowsFrom(fixture);
    ok("a DRAFT is not a release -- the fleet cannot download one",
        !rows.some((r) => r.tag === "v9999"), "v9999 was a draft and is absent");
    ok("a tag that is not vNNNN is not a version", !rows.some((r) => r.tag === "nightly"));
    ok("!! a PRERELEASE is kept but MARKED, because releases/latest skips it",
        rows.some((r) => r.tag === "v4400" && r.prerelease === true),
        "an unmarked prerelease at the top of the ledger would read as 'the fleet is up to date' about a " +
        "build releases/latest will never hand out");
    ok("...and the result is sorted newest-first like the ledger it writes",
        rows.map((r) => r.tag).join(",") === "v4438,v4400,v4296");
}

console.log("\n5. WHAT THIS DOES NOT CHECK, STATED RATHER THAN IMPLIED");
{
    ok("the ledger records TAGS, and this gate never claims an asset exists", true,
        "a release with no zip attached would pass every line above. .github/workflows/release.yml is what " +
        "catches that: on the tag push it waits for the asset, refuses after five minutes, unzip -t's it, " +
        "runs verify_zip.py and sweeps it for credentials -- ON THE PUBLISHED ARCHIVE since v4070. THIS FILE " +
        "ASKS WHETHER A RELEASE EXISTS; THAT WORKFLOW ASKS WHETHER IT IS ANY GOOD.");
    ok("...and the fetch half of refreshReleases is UNVERIFIED in the sandbox this was written in", true,
        "the agent proxy answers the releases API with HTTP 401, so only rowsFrom() -- the half that decides " +
        "what goes in the ledger -- could be exercised here, with the payload in section 4. The fetch is " +
        "ordinary and unclever, and it is still untested code until it runs on a box with the network.");
    ok("...and nothing here proves the ASSET matches the tag", true,
        "the zip is not byte-reproducible across machines (v4068: 26,775,683 / 27,424,068 / 27,766,762 for " +
        "one commit), which is exactly why the rig publishes and CI only verifies. A ledger cannot close that " +
        "gap and does not pretend to.");
}

console.log();
if (fails) { console.log("releaseLedger-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("releaseLedger-selfcheck: all checks pass");

// =============================================================================================================
// SABOTAGE LOG -- v4461, the superseded floor. Applied to tools/ship/releaseLedger.mjs, graded on EXIT CODES,
// restored md5-identical (4c911fc9d4fcc74654fe6ed31654c8bf).
//
//   A  supersededBy reverted to `floor` -- the arithmetic as it stood, ignoring what was published.
//      -> exit 1. The forgiving direction is real: with v4333 in the fixture's ledger, v4111 and v4222 come
//      back onto the owed list and the assertion naming them as superseded fails.
//
//   B  supersededBy set to `treeN`, so every version below the tree is called superseded and owed is always
//      empty -- the over-forgiving version, which is what an escape hatch would look like.
//      -> exit 1. This is the sabotage that matters. A relaxation nobody can break is not a rule, and the
//      three baseline raises before this one had no check at all standing behind them.
//
//   *** BOTH DIRECTIONS GO RED FROM ONE FIXTURE, WHICH IS THE POINT OF BUILDING IT THAT WAY. *** The same
//   main (v4111..v4444) and the same floor (v4000) are asked twice, differing only in what the ledger says
//   was published. A fixture that could only demonstrate the forgiveness would be arguing for the change
//   using the change.
