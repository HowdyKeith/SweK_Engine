#!/usr/bin/env node
// WebGLEngine/tools/ship/refusalStack-selfcheck.mjs -- v4483 -- the gate for tools/ship/refusalStack.mjs.
//
// Run: node tools/ship/refusalStack-selfcheck.mjs
//
// *** THIS FILE GRADES A CLASSIFIER, AND A CLASSIFIER'S FAILURE MODE IS TO ANSWER EVERYTHING. *** A single
// pattern broad enough to match all three refusal messages would make every row read "path-class", the count
// of distinct gates read 1, and every assertion about attribution still pass. So the three real bodies are
// held here VERBATIM and each is required to land on ITS OWN gate and on no other -- the property a
// collapsed pattern cannot have.
//
// ---- *** SIX SABOTAGES *** ------------------------------------------------------------------------------------
//
//  A. An unrecognised body falls through to the last gate  -> 3 RED
//  B. One broad pattern claims all three messages          -> 4 RED
//  C. `stack` reads any code below 400 as open             -> 2 RED
//  D. A gate drops `who`, so a remedy has no owner         -> 2 RED
//  E. `stack` stops attributing, and every source is null  -> 2 RED
//  F. The record forgets the v4480 reading of the transient-> 1 RED, THEN 2 RED AFTER THE REPAIR
//
// *** F WENT ONE-RED FIRST AND THE SECOND RED WAS THE POINT. *** Dropping `atV4480` failed only the row that
// reads the field, and the round's whole finding -- that a gate asserted a reading which has since reverted
// -- survived in prose with nothing checking it. Section 4 now requires the two readings to be PRESENT AND
// DIFFERENT, because a "transient" whose two values are equal is not a transient and the record would be
// claiming something it does not hold.
//
// ---- *** WHAT THIS GATE DOES NOT CLAIM *** --------------------------------------------------------------------
//
// That it probes anything. It does not touch the network: the classifier is graded on the bodies that were
// measured when the module was written, and THE LIVE PROBE LIVES IN traderGraph-selfcheck, which already
// makes the four requests. One prober, one classifier, and this file grades the half that is deterministic.
// It also does not claim the three gates are all of them -- they are the three this session can be stopped
// at, and a fourth would arrive as an UNNAMED refusal, which is a red rather than a silent fourth label.
"use strict";
import { GATES, gateOf, stack, reportLines, STACK_AT_V4483 as REC } from "./refusalStack.mjs";
import { RUNNER, GITHUB } from "../../world/traderGraph.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);

console.log("refusalStack-selfcheck -- three gates, not one shut door\n");

// The bodies exactly as api.github.com returned them through this session's proxy, v4483.
const BODY = Object.freeze({
    pathClass: '{"message":"This GitHub API path is not available: sessions are bound to their configured ' +
        'repositories. Use repository-scoped endpoints (repos/{owner}/{repo}/...).",' +
        '"documentation_url":"https://docs.anthropic.com/en/docs/claude-code/github-actions"}',
    notAttached: '{"message":"GitHub access to this repository is not enabled for this session. Use add_repo ' +
        'to request access. If add_repo answers that read access is already available and you need GitHub API ' +
        'or write access, call add_repo again with access:\\"push\\" to attach the repository with ' +
        'credentials.","documentation_url":"https://docs.anthropic.com/en/docs/claude-code/github-actions"}',
    orgNotConnected: '{"message":"GitHub access is not enabled for this session. An org admin must connect ' +
        'the Claude GitHub App for this organization.",' +
        '"documentation_url":"https://docs.anthropic.com/en/docs/claude-code/github-actions"}',
    githubsOwn: '{"message":"API rate limit exceeded for 1.2.3.4","documentation_url":"https://docs.github.com/"}',
    reworded: '{"message":"Request denied by policy 4417.","documentation_url":"https://example.com/x"}',
});

// ---- 1. THREE GATES, AND EACH IS SOMEBODY'S TO CLEAR ------------------------------------------------------------
console.log("1. the stack, and who holds each gate");

say(reportLines().join("\n  ----  "));
ok("there are three gates and no two carry the same name", GATES.length === 3 &&
    new Set(GATES.map((g) => g.gate)).size === 3);
ok("!! *** every gate names WHO can clear it, and no two are the same person ***",
    GATES.every((g) => typeof g.who === "string" && g.who.length > 15) &&
    new Set(GATES.map((g) => g.who)).size === 3,
    "sabotage D: 'the API is shut' is one fact; 'this session can fix one of these, an org admin holds " +
    "another, and nobody here holds the third' is three, and only the second kind tells anybody what to do");
ok("...and exactly one of the three has NO remedy from here, which is the one worth not pretending about",
    GATES.filter((g) => g.remedy === null).length === 1 &&
    GATES.find((g) => g.remedy === null).gate === "path-class");
{
    // The owner is not a field nobody reads: it is what the report PRINTS, so collapsing it breaks the line
    // a person actually sees. Sabotage D scored 1 against the first draft because only the shape of `who`
    // was graded and never its appearance.
    const lines = reportLines().join("\n");
    ok("...and the report names the owner of each gate, so a collapsed `who` costs the reader too",
        /repo-not-attached\s+cleared by THIS SESSION/i.test(lines) &&
        /org-not-connected\s+cleared by an org admin/i.test(lines) &&
        /path-class\s+cleared by nobody/i.test(lines),
        "the difference between one shut door and three is only useful if the report says which is whose");
}

// ---- 2. *** EACH REAL BODY LANDS ON ITS OWN GATE AND ON NO OTHER *** ---------------------------------------------
console.log("\n2. the three measured refusals, each classified");

{
    const want = [["pathClass", "path-class"], ["notAttached", "repo-not-attached"],
                  ["orgNotConnected", "org-not-connected"]];
    const wrong = want.filter(([k, g]) => gateOf(BODY[k]) !== g);
    for (const [k, g] of want) say(`${g.padEnd(18)} <- ${gateOf(BODY[k]) === g ? "ok" : "WRONG: " + gateOf(BODY[k])}`);
    ok("!! *** all three land on their own gate -- the property a collapsed pattern cannot have ***",
        wrong.length === 0,
        wrong.length ? "WRONG on " + wrong.map((w) => w[0]).join(", ")
                     : "sabotage B: one pattern wide enough for all three still passes every attribution row " +
                       "and reads 1 distinct gate instead of 3");
    // The cross-check that makes the row above mean what it says: a gate's mark must reject the other two.
    const bleed = [];
    for (const g of GATES)
        for (const [k, gname] of want)
            if (gname !== g.gate && g.mark.test(BODY[k])) bleed.push(`${g.gate} also claims ${k}`);
    ok("...and no gate's pattern also claims another gate's message",
        bleed.length === 0, bleed.length ? bleed.join("; ") : "3 patterns x 3 messages, 3 matches, 6 rejections");
}

// ---- 3. *** THE UNNAMEABLE REFUSAL IS A FINDING, NOT A DEFAULT *** ------------------------------------------------
console.log("\n3. what happens to a message no gate wrote");

ok("!! a reworded refusal returns null rather than being filed under the last gate",
    gateOf(BODY.reworded) === null,
    "sabotage A: a classifier that falls through has no way left to say 'the record is stale', and the " +
    "proxy rewording its text is precisely when this file gets read again -- v4402: an unknown read as a " +
    "known is an unknown read as a pass");
ok("...and so does an empty body, because a refusal with nothing in it is unattributed",
    gateOf("") === null && gateOf(null) === null);
ok("...while GitHub's OWN refusal is not claimed by any runner gate either",
    gateOf(BODY.githubsOwn) === null,
    "a rate-limit body is GitHub's voice; a runner gate claiming it would attribute the wrong party's refusal");

// ---- 4. *** stack(), DRIVEN ON FIXTURES WHOSE ANSWER IS KNOWN BEFORE THE CODE RUNS *** ---------------------------
console.log("\n4. the partition: open, refused, attributed, unnamed");

{
    const live = stack([
        { path: "users/but0n", code: 403, body: BODY.pathClass },
        { path: "repos/but0n/vixel", code: 403, body: BODY.notAttached },
        { path: "repos/howdykeith/swek_engine/contributors", code: 403, body: BODY.orgNotConnected },
        { path: "rate_limit", code: 200, body: '{"resources":{}}' },
    ]);
    say(`fixture matching v4483's measurement: ${live.refused.length} refused, ${live.open.length} open`);
    ok("!! three refusals, THREE distinct gates -- not one door counted three times",
        live.distinctGates === 3 && live.refused.length === 3);
    ok("...every refusal is the runner's and none is GitHub's",
        live.byRunner === 3 && live.byGithub === 0,
        `sabotage E: dropping attribution reads ${live.byRunner} as 0 and loses whose refusal it is`);
    ok("...and nothing is unnamed, so the record above is current", live.unnamed.length === 0);

    // *** THE INVITATION, DRIVEN. *** The module's stated design is that an axis OPENING is the red worth
    // having. v4481 asserted one WAS open and went red when it shut -- the opposite direction. So the open
    // case is exercised here: a 200 must leave `refused` and appear in `open`, which is what makes the
    // assertion in traderGraph-selfcheck point the right way.
    const opened = stack([
        { path: "repos/howdykeith/swek_engine/contributors", code: 200, body: '[{"login":"x"}]' },
        { path: "users/but0n", code: 403, body: BODY.pathClass },
    ]);
    ok("!! *** AN AXIS THAT OPENS LEAVES `refused` AND APPEARS IN `open` ***",
        opened.open.length === 1 && opened.open[0].includes("swek_engine") && opened.refused.length === 1,
        "sabotage C: reading anything under 400 as open puts the 403s in `open` too and the invitation " +
        "fires every run, which is an invitation nobody reads");
    ok("...and an open row carries no gate and no source, because there is nothing to attribute",
        opened.rows[0].gate === null && opened.rows[0].source === null);

    // *** SABOTAGE C WENT 0 RED AGAINST THE FIRST DRAFT, AND THE REASON WAS THE FIXTURES. *** Reading
    // `code < 400` as open changes nothing when every fixture is a 200 or a 403, so the openness rule was
    // never driven off its two known values. A code BETWEEN them is the one that separates "not an error"
    // from "data in hand", and only a 200 is data.
    const redirect = stack([{ path: "repos/howdykeith/swek_engine/contributors", code: 301, body: "" }]);
    ok("!! a 301 is NOT an open axis -- 'not an error' is not 'the data arrived'",
        redirect.open.length === 0 && redirect.refused.length === 1,
        "sabotage C: `code < 400` reads a redirect, a 204 and a 304 as an open axis and fires the invitation " +
        "on a response that carries no contributor in it");
    ok("...and it is loud rather than filed: no gate claims an empty body, so it lands in `unnamed`",
        redirect.unnamed.length === 1 && redirect.rows[0].gate === null && redirect.rows[0].source === null);

    // *** A PROBE THAT NEVER LEFT THE BOX IS ITS OWN ANSWER. *** Keith's rig reports HTTP -1 on all three --
    // no curl -- and reading that as an unnameable REFUSAL would tell him the proxy had reworded its message
    // when nothing was ever sent. Two facts, each on its own evidence.
    const dead = stack([{ path: "users/but0n", code: -1, body: "" },
                        { path: "rate_limit", code: 200, body: "{}" }]);
    ok("!! a probe that never reached the network is `unreached`, not a refusal nobody can name",
        dead.unreached.length === 1 && dead.refused.length === 0 && dead.unnamed.length === 0,
        "'the record has gone stale' and 'this box has no curl' are different things to go and fix");
    ok("...and it carries no gate and no source, because there was no response to attribute",
        dead.rows[0].reached === false && dead.rows[0].gate === null && dead.rows[0].source === null);

    const stale = stack([{ path: "users/but0n", code: 403, body: BODY.reworded }]);
    ok("!! a refusal no gate claims lands in `unnamed`, which is how the record says it has gone stale",
        stale.unnamed.length === 1 && stale.unnamed[0] === "users/but0n" && stale.distinctGates === 0);
    ok("...and it is still attributed where the body allows it -- unnameable is not unattributable",
        stale.rows[0].source === GITHUB,
        "the reworded fixture carries none of the runner's marks, so refusalSource reads it as GitHub's -- " +
        "which is exactly the state that should be loud: a refusal this session cannot place");
}

// ---- 5. THE RECORD, AND THE TRANSIENT IT EXISTS TO NAME ----------------------------------------------------------
console.log("\n5. the frozen readings");

ok("the record's four probed rows agree with what the classifier says about the four real bodies",
    REC.probed.length === 4 &&
    REC.probed.filter((p) => p.code === 403).length === 3 &&
    REC.probed.filter((p) => p.code === 403).every((p) =>
        GATES.some((g) => g.gate === p.gate)) &&
    REC.gates === 3);
ok("!! *** THE TRANSIENT CARRIES BOTH READINGS AND THEY DIFFER ***",
    typeof REC.transient.atV4480 === "number" && typeof REC.transient.atV4483 === "number" &&
    REC.transient.atV4480 !== REC.transient.atV4483,
    `sabotage F: ${REC.transient.atV4480} at v4480, ${REC.transient.atV4483} now. A 'transient' whose two ` +
    "values are equal is not a transient, and the whole finding would sit in prose with nothing holding it");
ok("...and it names what asserting it cost, not just that it moved",
    /red/i.test(REC.transient.cost) && REC.transient.cost.length > 80);
ok("...and it names where the CORRECT value was already recorded before the 200 was ever seen",
    /traderGraph/.test(REC.transient.recordedBy),
    "the module had the right message all along -- 'An org admin must connect' -- and a note added at v4481 " +
    "said the axis now answers; the note froze a reading over a record that was right");
ok("the control says what it measures AND what it does not",
    REC.control.code === 200 && REC.control.limit === 15000 &&
    /credentialed/i.test(REC.control.says) && REC.control.doesNotSay.length > 80,
    "an authenticated 15000 limit means the control has always been measuring a credentialed proxied " +
    "connection, so it proves the link is up and proves nothing about what GitHub would serve");
ok("the record is frozen", Object.isFrozen(REC) && Object.isFrozen(REC.transient) && REC.probed.every(Object.isFrozen));

console.log(`\nrefusalStack-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
