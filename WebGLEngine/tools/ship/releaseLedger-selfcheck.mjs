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
"use strict";
import fs from "node:fs";
import path from "node:path";
import { ledgerState, readLedger, engineVersion, shippedVersions, num, LEDGER, ENG, ROOT } from "./releaseLedger.mjs";
import { rowsFrom } from "./refreshReleases.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m, d) => console.log("  ....  " + m + (d ? "   " + d : ""));

console.log("releaseLedger-selfcheck -- does the fleet run what is actually built?\n");

const led = readLedger();
const S = ledgerState();

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

console.log("\n2. *** THE RATCHET: YOU MAY NOT SHIP A NEW VERSION WHILE THE LAST ONE IS UNRELEASED ***");
{
    ok("!! *** every version shipped after the baseline, before the current one, has a release ***",
        S.owed.length === 0,
        S.owed.length
            ? "OWED " + S.owed.length + ": " + S.owed.slice(0, 12).map((v) => "v" + v).join(", ") +
              (S.owed.length > 12 ? " (+" + (S.owed.length - 12) + " more)" +
              ". PUBLISH THE PREVIOUS VERSION BEFORE SHIPPING THIS ONE -- the ship skill's step 7 is the how" : "")
            : "nothing owed. Baseline is v" + S.floor + "; the tree is " + S.tree + "; " +
              "the rule binds from v" + (S.floor + 1) + " forward and it is satisfied");
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
