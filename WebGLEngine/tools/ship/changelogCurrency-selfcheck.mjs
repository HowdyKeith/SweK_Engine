// WebGLEngine/tools/ship/changelogCurrency-selfcheck.mjs -- v3081
//
// GUARDS THE GUARD. v3041..v3080 -- forty rounds of real, shipped, working code -- landed with BACKLOG.md and
// TODO.md both frozen at v3040. Nothing was broken and no gate was red; changelog.mjs was simply a MANUAL step
// beside the ritual rather than inside it, so it survived exactly as long as someone's habit did.
//
// ship.mjs now has a stage that hard-fails when the version being shipped has no entry. This file exists so
// that stage cannot quietly go away again, and -- more importantly -- so the MATCHING RULE is tested. A regex
// that accepted a passing mention of "v3081" inside some other round's prose would pass on a frozen file and
// reproduce the original hole with a green tick on top.
//
// *** v4003 -- AND THEN THIS GATE SWITCHED ITSELF OFF, WHICH IS THE FAILURE IT WAS BUILT TO PREVENT, HAPPENING
// TO THE PREVENTION. *** v3964 taught it to SKIP on a clone, with a message saying "The records exist on the rig
// and are checked there." That was an ASSUMPTION, and corpusText's live read on Keith's rig disproved it:
// BACKLOG.md and TODO.md are on NO machine and tracked in NO commit. The skip therefore fired EVERYWHERE, so the
// guard ran nowhere -- switched off by the .gitignore rule it cited as its reason for skipping. Measured
// consequence: the record's newest entry was `## Since v3970` while the tree was at v4002. THIRTY-ONE ROUNDS,
// against the forty this file was written about.
//
// The skip is GONE rather than narrowed, because the record it needs -- docs/CHANGELOG.md, 327 entries -- is
// TRACKED and therefore present in every clone. There is nothing left for it to be absent for. A GATE THAT
// SKIPS ON EVERY MACHINE IS SWITCHED OFF, and "skipping loudly" is not a defence when nobody reads the skip.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { readChangelog, namesVersion, newestVersion, CHANGELOG_REL } from "./changelogSource.mjs";
import { fileURLToPath } from "node:url";
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROJECT = path.resolve(ENG, "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const ship = fs.readFileSync(path.join(ENG, "tools", "ship", "ship.mjs"), "utf8");

// The rule the stage uses, restated here so the SABOTAGE below can exercise it directly.
// v4003 -- IMPORTED, NOT RESTATED. This line was a second copy of the ship stage's regex, which is the
// "two declarations about one thing that nobody ever compared" defect sitting inside the file whose whole
// subject is a rule going stale. The sabotage below now exercises the SHIPPING rule rather than a twin of it.
const names = namesVersion;

// ---- 1. THE STAGE EXISTS AND IS A HARD FAIL -------------------------------------------------------------------
{
    ok("!! ship.mjs has a changelog-currency stage", /stage\("the changelog names this version"/.test(ship),
       "without it, non-empty is the only bar and a forty-version-old file clears it");
    // v4003 -- it checked BOTH records, and both were gone. What it must do now is read the record's address
    // from the ONE place that declares it, rather than spelling it a fifth time.
    ok("!! it reads the changelog's address from changelogSource, not a spelling of its own",
       /readChangelog|CHANGELOG_REL/.test(ship) && !/"BACKLOG\.md"/.test(ship),
       "four tools with four spellings of BACKLOG.md is what let the record move without any of them noticing");
    ok("...and it uses the SHARED matching rule rather than a second copy of the regex",
       /namesVersion\(/.test(ship),
       "a private regex here and another there is the shape this file's own subject keeps producing");
    ok("!! it THROWS rather than warning", /throw new Error\(\s*\n?\s*"no entry for "/.test(ship),
       "a warning in a ritual whose whole purpose is doing this from memory every time is a warning nobody reads");
    ok("the error names the command that fixes it", /changelog\.mjs --backlog/.test(ship),
       "refuse with the fix -- the same rule every bridge in this tree follows");
    ok("it runs BEFORE the expensive gate", ship.indexOf('the changelog names this version') < ship.indexOf('verify.mjs (the actual gate)'),
       "failing after a multi-minute suite would teach people to skip the ritual, which is how the habit was lost the first time");
}

// ---- 2. THE MATCHING RULE, WHICH IS THE PART THAT COULD SILENTLY REPRODUCE THE BUG ------------------------------
{
    ok("a real BACKLOG heading matches", names("## v3081 -- something\n", "v3081"));
    ok("a real TODO line matches", names("- v3081: run the thing\n", "v3081"));
    ok("!! a PASSING MENTION mid-prose does NOT match",
       !names("## v3080 -- a round\n\nThis fixes what v3081 will need later.\n", "v3081"),
       "prose-as-code, the failure this tree has hit nine times: matching anywhere would let a frozen file satisfy the check forever");
    ok("!! a PREFIX version does not match a longer one", !names("## v30811 -- other\n", "v3081"),
       "the \\b is load-bearing -- v3081 must not be satisfied by v30811");
    ok("an unrelated version does not match", !names("## v3040 -- the last real entry\n", "v3081"));
    ok("a heading not at line start does not match", !names("prefix ## v3081 -- x\n", "v3081"));
}

// ---- 3. SABOTAGE: THE HISTORICAL CASE MUST FAIL -----------------------------------------------------------------
{
    // The exact condition that existed for forty rounds: a huge, non-empty, perfectly valid changelog whose
    // newest entry is v3040, while the ritual is asked to ship v3080.
    const frozen = "## v3040 -- a checkbox that lied\n\nlots of prose\n\n## v3039 -- capture before analysis\n";
    ok("!! SABOTAGE: a frozen-at-v3040 changelog FAILS a v3080 ship", !names(frozen, "v3080"),
       "this is the literal v3041..v3080 condition -- the check that now catches it could not have been passed by non-emptiness");
    ok("...and the same file PASSES for the version it does name", names(frozen, "v3040"),
       "so the guard is specific, not merely strict -- it would not have blocked any of the forty rounds that DID write an entry");
}

// ---- 4. THE LIVE TREE ------------------------------------------------------------------------------------------
{
    const v = (fs.readFileSync(path.join(ENG, "main.js"), "utf8").match(/ENGINE_VERSION\s*=\s*"(v\d+)"/) || [])[1];
    // v3964 taught this to SKIP when BACKLOG.md was absent, which was right about the CRASH it replaced (a
    // stack trace says the gate is broken; a red line says which claim broke) and wrong about the remedy. The
    // record is TRACKED now, so absence is a broken tree rather than a clone, and it is reported as one.
    const text = readChangelog(PROJECT);
    ok("!! *** THE RECORD IS PRESENT -- no skip, on any machine ***", text !== null,
       text === null ? CHANGELOG_REL + " is UNREADABLE at " + PROJECT + ". It is tracked, so this is a broken " +
       "tree rather than a clone missing a withheld file -- and the previous version of this gate would have " +
       "called that a clean skip."
       : CHANGELOG_REL + ", " + text.length.toLocaleString() + " bytes, newest entry v" + newestVersion(text));
    ok("!! *** this tree's own marker is named in the record ***", names(text || "", v),
       "marker " + v + ", newest entry v" + newestVersion(text || "") + " -- if this is red, the ritual is " +
       "about to ship a version nothing describes, which is exactly what happened forty times at v3041..v3080 " +
       "and thirty-one more times at v3971..v4002 while this gate was skipping");
    // AND THE GAP IS REPORTED RATHER THAN ASSERTED. This is a CURRENCY check: it asks whether the version being
    // shipped is described, not whether every version ever shipped is. v3971..v3991 are missing from the record
    // and were NOT backfilled at v4003 -- reconstructing somebody else's rounds is not a thing to do unasked.
    const newest = newestVersion(text || "");
    const cur = Number(String(v).slice(1));
    const named = new Set((String(text || "").match(/^## (?:Since )?v(\d+)/gm) || [])
        .map((h) => Number(h.replace(/^## (?:Since )?v/, ""))));
    const gaps = [];
    for (let n = 3971; n < cur; n++) if (!named.has(n)) gaps.push(n);
    console.log("  ----  REPORTED, not asserted: " + gaps.length + " version(s) between v3971 and " + v +
        " have no entry" + (gaps.length ? " (v" + gaps[0] + "..v" + gaps[gaps.length - 1] + ")" : "") +
        ". A CURRENCY check asks about the version being shipped; completeness is a different claim and " +
        "backfilling rounds one did not do would be inventing the record rather than keeping it.");
}

console.log("\nchangelogCurrency-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
