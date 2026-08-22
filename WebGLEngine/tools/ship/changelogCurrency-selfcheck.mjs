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
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROJECT = path.resolve(ENG, "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const ship = fs.readFileSync(path.join(ENG, "tools", "ship", "ship.mjs"), "utf8");

// The rule the stage uses, restated here so the SABOTAGE below can exercise it directly.
const names = (text, v) => new RegExp("^(## |- )" + v + "\\b", "m").test(text);

// ---- 1. THE STAGE EXISTS AND IS A HARD FAIL -------------------------------------------------------------------
{
    ok("!! ship.mjs has a changelog-currency stage", /stage\("the changelog names this version"/.test(ship),
       "without it, non-empty is the only bar and a forty-version-old file clears it");
    ok("it checks BOTH records", /BACKLOG\.md", "TODO\.md"/.test(ship) || /\["BACKLOG\.md", "TODO\.md"\]/.test(ship));
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
    const bl = fs.readFileSync(path.join(PROJECT, "BACKLOG.md"), "utf8");
    const td = fs.readFileSync(path.join(PROJECT, "TODO.md"), "utf8");
    ok("!! this tree's own marker is named in BOTH records", names(bl, v) && names(td, v),
       "marker " + v + " -- if this is red, the ritual is about to ship a version nothing describes, which is exactly what happened forty times");
}

console.log("\nchangelogCurrency-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
