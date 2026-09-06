#!/usr/bin/env node
// WebGLEngine/tools/ship/traderGraph-selfcheck.mjs -- v4289
//
// GRADES world/traderGraph.mjs: contributors as traders, built from git history.
//
// ---- *** v4481 -- THE REFUSALS WERE QUOTED EXACTLY AND ATTRIBUTED TO THE WRONG PARTY *** -------------------
//
// This file used to say "built from git history BECAUSE THE API IS SHUT", and re-probed three refusals every
// run so a stale claim could not survive. *** THE REFUSALS ARE THE RUNNER'S. *** Every `blocked` message the
// module records says so in its own words -- "this session", "Use add_repo", "sessions are bound to their
// configured repositories" -- and one carries a docs.anthropic.com documentation_url. The evidence was
// captured verbatim and correctly, and nobody asked whose voice it was.
//
// Measured, unauthenticated curl from inside the sandbox:
//
//     users/but0n                                403   "sessions are bound to their configured repositories"
//     repos/but0n/vixel                          403   "not enabled for this session. Use add_repo"
//     repos/howdykeith/swek_engine/contributors  200   real GitHub data, real ETag -- it IS the bound repo
//     rate_limit                                 200   limit 15000, which is an AUTHENTICATED limit
//
// The first two are PUBLIC GitHub paths; what answered was the proxy in front of them. *** AND THE OLD ROWS
// COULD ONLY EVER CONFIRM THEMSELVES: re-probing from inside the sandbox that is doing the refusing
// reproduces the artefact every run -- a control that can only run where the defect is invisible. *** It went
// red at v4480 only because ONE path flipped to 200, and that flip is the tell: the repository was bound to
// the session. Read as "the API opened", it would have rebuilt the graph on an axis that exists inside one
// sandbox and nowhere else.
//
// NOT CLAIMED: that GitHub would answer 200 for the first two. Nothing here reaches GitHub unproxied, so the
// 403s are not evidence about GitHub in either direction -- the premise is UNSUPPORTED, not disproved. The
// MODULE'S CHOICE IS UNAFFECTED: git history is deterministic, needs no credentials, costs no rate limit, and
// answers a sharper question than the API does. Only the stated reason was wrong.
//
// v4481 SABOTAGES, RESULTS BY NAME:
//   DA. refusalSource calls the runner's refusal GitHub's        -> 3 RED
//   DB. an axis is attributed to GitHub instead of the runner    -> 2 RED
//   DC. refusalSource guesses GitHub for an empty body           -> *** 0 RED, THEN 2 RED ***
//   DD. the docs.anthropic.com marker stops being a tell         -> *** 0 RED, THEN 2 RED ***
//   DE. the attributor ignores the body and reads only the status-> 4 RED
//   DF. an unmarked GitHub body is attributed to the runner      -> 2 RED
//
// DC AND DD WENT 0 RED AND BOTH WERE FINDINGS. The empty-body branch is unreachable because no probe here
// returns one; the docs.anthropic.com marker is ALREADY IMPLIED by the phrase test against today's messages
// -- v4451's "an earlier test already implies it", the third instance this session. A marker redundant TODAY
// stops being redundant the moment the proxy rewords its message, which is exactly when this file gets read
// again, so it stays and a fixture exercises it. Two more plants (DE, DF as first written) broke the
// ASSERTION rather than the subject and were replaced: sabotaging a check is not sabotaging what it guards.
//
// *** THE THREE REFUSALS ARE RE-PROBED HERE, NOT QUOTED. *** A module that says "the API is unavailable"
// is making a claim about the world, and the world can change -- an org admin connects GitHub, somebody
// runs add_repo, the session is reconfigured. So the gate asks GitHub again every run and compares what
// comes back against what the module recorded. If an axis OPENS, this goes red, and that red means "go and
// use the thing you said you could not use" rather than "something broke".
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as T from "../../world/traderGraph.mjs";
import { SWEEP as LICENCE } from "../../world/licenceSweep.mjs";
import { stack } from "./refusalStack.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const report = (m) => console.log("  ----  " + m);
const SRC = fs.readFileSync(path.join(ENG, "world/traderGraph.mjs"), "utf8");

console.log("traderGraph-selfcheck -- who travels between these repositories, and what GitHub would not say\n");

console.log("1. *** NO EMAIL ADDRESS IS STORED, AND THAT IS CHECKED RATHER THAN PROMISED ***");
{
    // The first version of the module hashed the ADDRESS field and kept the NAME field verbatim, because
    // names are not addresses. One contributor's git name IS their address, and it shipped in a topAuthor
    // field -- the privacy paragraph was false at the moment it was written.
    // RFC 2606 reserves example.com/net/org so documentation can name an address without naming ANYONE --
    // they resolve nowhere and belong to no one. The module's comment about talbot@example.com is there
    // because that string is the false positive the automation rule had, and removing it to satisfy a
    // pattern would delete the explanation rather than the risk. Exempted here, and only here.
    const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    const RESERVED = /@example\.(com|net|org)$/i;
    const found = (SRC.match(EMAIL) || []).filter((e) => !RESERVED.test(e));
    ok("*** not one address-shaped string anywhere in the module ***", found.length === 0,
        found.length ? "FOUND: " + found.slice(0, 3).join(", ")
                     : "checked across the whole file, prose included; RFC 2606 reserved domains exempt");
    ok("  CONTROL: the pattern DOES find an address when one is present",
        (SRC.match(EMAIL) || []).length > 0,
        "the reserved-domain example proves the scan is live rather than matching nothing at all");
    ok("  and the redaction that made that true is still present",
        /redacted-name-/.test(SRC), "a display name that was an address, hashed like the address field");
    ok("  identities are truncated hashes, not addresses",
        T.TRADERS.every((t) => /^[0-9a-f]{12}$/.test(t.id)), `${T.TRADERS.length} identities, all 12 hex chars`);
    report("*** A RULE THAT PROTECTS ONE FIELD AND TRUSTS ANOTHER IS ONLY AS GOOD AS THE ASSUMPTION THAT " +
        "THE FIELDS MEAN WHAT THEY ARE CALLED. *** Hashing the address column was the design; a name column " +
        "holding an address defeated it, and only a check across the WHOLE FILE catches that.");
}

console.log("\n2. *** WHOSE REFUSAL IS IT? RE-PROBED, AND THE BODY READ, NOT JUST THE STATUS ***");
// *** v4481 -- THIS SECTION SAID "STILL REFUSED BY GITHUB" ABOUT THREE REFUSALS THAT ARE THE RUNNER'S. ***
// The module records each `blocked` message verbatim and the messages say "this session", "Use add_repo" and
// "sessions are bound to their configured repositories"; one carries a docs.anthropic.com documentation_url.
// The evidence was captured correctly and nobody asked whose voice it was. A bare status code cannot say --
// so the probe reads the BODY now and attributes the refusal.
//
// AND THE OLD ROWS COULD ONLY EVER CONFIRM THEMSELVES: re-probing from inside the sandbox that is doing the
// refusing reproduces the artefact every run. They went red only when one path flipped to 200 -- which is
// not GitHub opening up, it is this repository being bound to this session.
{
    const probe = (p) => {
        try {
            const body = execFileSync("curl", ["-s", "-m", "20", "https://api.github.com/" + p], { encoding: "utf8" });
            const code = parseInt(execFileSync("curl", ["-s", "-m", "20", "-o", "/dev/null", "-w", "%{http_code}",
                                                        "https://api.github.com/" + p], { encoding: "utf8" }), 10);
            return { code, body, source: code === 200 ? null : T.refusalSource(body) };
        } catch { return { code: -1, body: "", source: null }; }
    };
    const blocked = T.AXES.filter((a) => !a.have);
    ok("the module records three DISTINCT refusals, not one", new Set(blocked.map((a) => a.blocked)).size === 3,
        blocked.map((a) => a.remedy.slice(0, 26)).join(" | "));

    // *** THE ATTRIBUTION IS A PROPERTY OF THE RECORDED TEXT, SO IT IS CHECKED WITHOUT THE NETWORK. *** Every
    // blocked axis quotes the runner; if one ever quotes GitHub instead, that is a different fact needing a
    // different remedy, and this row is where it surfaces.
    ok("!! *** EVERY REFUSAL THIS MODULE RECORDS IS THE RUNNER'S, BY ITS OWN WORDS ***",
       blocked.length > 0 && blocked.every((a) => a.blockedBy === T.RUNNER && T.refusalSource(a.blocked) === T.RUNNER),
       `${blocked.length} blocked axes, all attributed to ${T.RUNNER}. They say "this session", "Use ` +
       `add_repo", "sessions are bound to their configured repositories". THE HEADER USED TO SAY GITHUB.`);

    // *** THE ATTRIBUTOR'S BRANCHES ARE NOT ALL REACHABLE FROM THIS NETWORK, so they are driven by fixtures.
    // *** Sabotage found two that went 0 RED: the empty-body branch (no probe here returns one) and the
    // docs.anthropic.com marker (already implied by the phrase test against today's messages -- v4451's
    // "an earlier test already implies it", the third instance this session). A marker that is redundant
    // TODAY is not redundant when the proxy rewords its message, which is exactly when this file will be
    // read again, so it stays and it is exercised here rather than trusted.
    {
        const cases = [
            ["proxy, by phrase", '{"message":"GitHub access to this repository is not enabled for this session. Use add_repo"}', T.RUNNER],
            ["proxy, by binding phrase", '{"message":"This GitHub API path is not available: sessions are bound to their configured repositories"}', T.RUNNER],
            ["proxy, by URL ALONE", '{"message":"Reworded by a future proxy","documentation_url":"https://docs.anthropic.com/en/docs/claude-code/github-actions"}', T.RUNNER],
            ["GitHub, rate limited", '{"message":"API rate limit exceeded for 1.2.3.4"}', T.GITHUB],
            ["GitHub, unmarked JSON", '{"message":"Not Found"}', T.GITHUB],
            ["nothing to attribute", "", null],
        ];
        const wrong = cases.filter(([, body, want]) => T.refusalSource(body) !== want);
        ok("!! FIXTURE: every branch of the attributor, including the two the network cannot reach",
           wrong.length === 0,
           `${cases.length} bodies, ${cases.length - wrong.length} attributed correctly` +
           (wrong.length ? ": WRONG on " + wrong.map((c) => c[0]).join(", ") : "") +
           '. THE URL-ONLY CASE AND THE EMPTY BODY ARE UNREACHABLE FROM HERE -- and an empty body returns ' +
           "null rather than guessing, because a refusal with nothing in it is unattributed, not GitHub's.");
    }

    const user = probe("users/but0n");
    const repo = probe("repos/but0n/vixel");
    const own = probe("repos/howdykeith/swek_engine/contributors");
    const lim = probe("rate_limit");
    for (const [n, r] of [["users/but0n", user], ["repos/but0n/vixel", repo],
                          ["our contributors", own], ["rate_limit", lim]])
        report(`${n.padEnd(18)} HTTP ${r.code}${r.source ? "  refused by " + r.source : ""}`);

    // *** A RUNNER REFUSAL IS NO VERDICT ABOUT GITHUB. *** v3201's distinction, applied to a network probe:
    // the old rows read a 403 as "GitHub still refuses", which is a claim this runner is not positioned to
    // make. What CAN be asserted from here is that the refusal is the sandbox's, and it is.
    const runnerRefusals = [user, repo].filter((r) => r.source === T.RUNNER);
    ok("!! *** THE 403s COME FROM THE SANDBOX, NOT FROM GITHUB -- SO THEY SAY NOTHING ABOUT GITHUB ***",
       runnerRefusals.length === 2,
       `${runnerRefusals.length} of 2 public paths refused by the runner. users/but0n and repos/but0n/vixel ` +
       "are PUBLIC on GitHub; what answered was the proxy in front of it. NOT CLAIMED: that GitHub would " +
       "answer 200 -- nothing here can reach it unproxied, so the premise is UNSUPPORTED, not disproved.");

    // ---- *** v4483 -- THIS ROW ASSERTED A 200 AND THE 200 HAS ALREADY GONE. *** ---------------------------
    //
    // v4481 wrote `own.code === 200` here: the bound repository answers, therefore the refusals belong to
    // the session binding. The reasoning was right and THE ASSERTION POINTED THE WRONG WAY. That path is 403
    // again, with the message world/traderGraph.mjs had recorded for it word for word before the 200 was
    // ever seen -- "GitHub access is not enabled for this session. An org admin must connect" -- so the gate
    // went red when the world returned to what the module says the world is, on a tree where nothing about
    // the repository had changed, and a ship was blocked by an assertion about the box.
    //
    // *** IT ALSO INVERTED THIS FILE'S OWN STATED DESIGN, EIGHTY LINES ABOVE: "If an axis OPENS, this goes
    // red, and that red means 'go and use the thing you said you could not use'." *** An assertion that a
    // path ANSWERS goes red when the path CLOSES. The direction is restored here, and what is asserted is
    // the pair that is a finding in either case: the recorded axes are STILL SHUT, and every refusal can be
    // named. The codes themselves are REPORTED against the frozen readings, because a status code is a
    // reading of one box at one moment and this file has now been bitten once by freezing one.
    const s = stack([
        { path: "users/but0n", code: user.code, body: user.body },
        { path: "repos/but0n/vixel", code: repo.code, body: repo.body },
        { path: "repos/howdykeith/swek_engine/contributors", code: own.code, body: own.body },
    ]);
    for (const r of s.rows)
        report(`${r.path.padEnd(42)} ${r.code}  ${r.open ? "OPEN" : (r.gate || "*** UNNAMED REFUSAL ***")}`);

    ok("!! *** THE RECORDED AXES ARE STILL SHUT -- and one OPENING is the red worth having ***",
       s.open.length === 0,
       s.open.length ? "OPEN: " + s.open.join(", ") + " -- GO AND USE IT: the graph can be built from richer "
                     + "data than git history and world/traderGraph.mjs should be revisited"
                     : `${s.refused.length} refused, ${s.distinctGates} distinct gates. This is the direction `
                     + "the header states and the direction v4481 reversed by asserting a 200.");
    if (s.unreached.length)
        report(`*** ${s.unreached.length} PROBE(S) NEVER REACHED THE NETWORK: ${s.unreached.join(", ")} -- ` +
               "no curl on this box, or no route out. That is a fact about the runner and says nothing about " +
               "the refusals; install curl and re-run before reading anything below as a finding.");
    ok("!! ...and every refusal is NAMEABLE, so the stack's record is current",
       s.unnamed.length === 0 && s.byRunner === s.refused.length && s.byGithub === 0,
       s.unnamed.length ? "UNNAMED: " + s.unnamed.join(", ") + " -- the proxy reworded and tools/ship/"
                        + "refusalStack.mjs must be re-taken"
                        : `all ${s.refused.length} attributed to the runner, each to its own gate`);
    ok("!! ...and they are THREE DIFFERENT GATES held by three different people, not one shut door",
       s.distinctGates === 3,
       "path-class (nobody here), repo-not-attached (this session, add_repo), org-not-connected (an org " +
       "admin). Clearing one clears nothing about the other two, and 'the API is shut' hides all of that");

    ok("CONTROL: the network is up, so the refusals are refusals and not a dead link",
       lim.code === 200, "rate_limit answers 200 on the same connection -- and its limit is 15000, which is " +
       "an AUTHENTICATED limit, so this control has always been measuring a credentialed proxied connection");

    report("THE INVITATION, RESTATED AND NOW POINTING THE RIGHT WAY: a 200 on any row above is a red, and " +
        "that red means go and use the axis. It is worth acting on only from a runner with no binding of " +
        "its own -- run this unproxied on the rig and the answer it gives is about GitHub. What is NOT an " +
        "invitation is a 200 arriving because this session happens to be bound to the repository, which is " +
        "the reading that produced v4481's assertion and cost a round.");
}

console.log("\n3. THE SWEEP, AND THAT IT COVERS WHAT IT CLAIMS");
{
    // v4304: the licence sweep grew by eighteen (depth-1 clones, licence only) and the graph did not; those are
    // named in T.UNGRAPHED, and the invariant is that every swept repository is graphed OR named as owed.
    ok("*** every repository in the licence sweep was cloned and read, or is named as still owed ***",
        T.SWEEP.repos + T.UNGRAPHED.repos.length === LICENCE.length && T.SWEEP.cloneFailures === 0,
        `${T.SWEEP.repos} graphed + ${T.UNGRAPHED.repos.length} owed of ${LICENCE.length}, ${T.SWEEP.commits} commits, ${T.SWEEP.cloneFailures} failures`);
    ok("  and every owed repository IS in the licence sweep and is NOT in the graph -- owed, not forgotten and not double-counted",
        T.UNGRAPHED.repos.every((r) => LICENCE.some((e) => e.repo === r) && !T.REPOS.some((g) => g.repo === r)) && !!T.UNGRAPHED.why,
        `${T.UNGRAPHED.repos.length} owed since ${T.UNGRAPHED.at}: ${T.UNGRAPHED.why}`);
    ok("  and the per-repo rows match that count", T.REPOS.length === T.SWEEP.repos);
    const named = new Set(LICENCE.map((e) => e.repo));
    ok("  with no repository the licence sweep does not also hold",
        T.REPOS.every((r) => named.has(r.repo)),
        "the graph is scoped to repos this project already opened, not to strangers");
    ok("CONTROL: the commit total is large enough that this is history and not a shallow clone",
        T.SWEEP.commits > 10000, `${T.SWEEP.commits} commits -- --depth 1 would have given ${T.SWEEP.repos}`);
}

console.log("\n4. *** TWELVE REPOSITORIES CONTAIN NO COMMIT BY THEIR OWNER ***");
{
    const f = T.forks(), h = T.home();
    ok("*** the owner never appears in twelve of the thirty-five ***", f.length === 12 && h.length === 23,
        `${f.length} forks, ${h.length} owner-authored`);
    ok("  and they cluster in two accounts rather than scattering",
        f.filter((r) => r.startsWith("redcamel/")).length === 6 && f.filter((r) => r.startsWith("but0n/")).length === 5,
        "6 of redcamel's, 5 of but0n's -- cargo parked in someone else's dock");
    ok("  ownerShare is a share and not a flag, so 'owns it' and 'wrote it' stay separable",
        T.REPOS.some((r) => r.ownerShare > 0 && r.ownerShare < 0.1),
        "but0n/THREE.js-PathTracing-Renderer counts as HOME on a handful of commits out of 1992");
    report("that last one is why the flag is a SHARE. The GitHub API has a boolean `fork` field; history " +
        "gives the same answer AND how much of it the owner actually wrote, which is the difference between " +
        "an armed ship and somebody standing next to one.");
}

console.log("\n5. *** THERE IS NO CORRECT IDENTITY KEY, AND THE MODULE USES TWO ***");
{
    const d = T.identityDisagreement();
    ok("*** the two keys disagree, and the module reports both rather than picking ***",
        d.byName !== d.byEmail, `${d.byName} crossings by display name, ${d.byEmail} by address hash`);
    ok("*** email-keying MERGES identities that name-keying splits ***", d.mergedByEmail >= 3,
        `${d.mergedByEmail} addresses carry more than one display name`);
    const butOn = T.SPLIT_NAMES.find((s) => s.names.includes("but0n"));
    ok("  including the owner of thirteen repositories here, under four names",
        !!butOn && butOn.names.length === 4,
        butOn ? butOn.names.join(", ") + `  -> one address, ${butOn.repos} repos` : "not found");
    ok("*** and email-keying is STILL WRONG, which is stated rather than hidden ***", d.stillSplit > 0,
        `${d.stillSplit} identities share a display name across different addresses -- Jamie Portsmouth is ` +
        `two traders here, at 11 repos and 5, because one human holds two addresses`);
    // *** TWO THINGS IN THE CROSSING LIST WERE NOT PEOPLE, AND ONLY ONE OF THEM WAS A BOT. ***
    ok("*** the hash of an EMPTY address is named and excluded ***",
        T.EMPTY_EMAIL_HASH === "e3b0c44298fc" && !T.traders().some((t) => t.id === T.EMPTY_EMAIL_HASH),
        "two repos carry commits with no author address; hashing that produced sha256(\"\") and the first " +
        "version reported it as a trader crossing both -- a coincidence of ABSENCE read as a connection");
    ok("  and it is excluded by name, not by having no display name",
        /EMPTY_EMAIL_HASH/.test(fs.readFileSync(path.join(ENG, "world/traderGraph.mjs"), "utf8")),
        "a filter on 'name is blank' would drop a real author who left their name unset");
    ok("*** automation is excluded WITH the reason it was classified ***",
        T.AUTOMATION.length >= 5 && T.AUTOMATION.every((a) => a.why && a.id),
        `${T.AUTOMATION.length} identities, each carrying what matched`);
    ok("  including the one the first predicate missed, whose name ends in App",
        T.BOTS.includes(T.TRADERS.find((t) => t.name === "ImgBotApp")?.id),
        "it tested for [bot], bot@ and names ending in bot; ImgBotApp is none of those and travelled 2 repos");
    // *** THE PREDICATE IS FED NAMES HERE, WHICH IS THE ONLY WAY TO CHECK IT IS NOT A BARE SUBSTRING TEST. ***
    // The first version of this check asserted the module's TEXT did not contain a certain pattern, and went
    // red on the comment EXPLAINING that it does not use it -- a file grading a marker it also discusses,
    // for the twelfth time in this session. The rule is now exported and exercised instead of read.
    const surnames = ["Abbott", "Botha", "Talbot", "Robotham"];
    ok("*** real surnames containing 'bot' are NOT classified as automation ***",
        surnames.every((n) => !T.isAutomation(n, n.toLowerCase() + "@example.com")), surnames.join(", "));
    ok("  while the conventions automation actually uses ARE",
        T.isAutomation("dependabot[bot]", "x@y.z") && T.isAutomation("ImgBotApp", "imgbot@example.com") &&
        T.isAutomation("x", "49699333+dependabot[bot]@users.noreply.github.com"),
        "the [bot] suffix, a bot address, and the named services that commit here");
    ok("  and the exported rule agrees with the recorded list", T.AUTOMATION.length === T.BOTS.length);
    ok("  so the crossing list and the PEOPLE list are different lengths, on purpose",
        T.traders().length === T.TRADERS.length - 2,
        `${T.TRADERS.length} crossings, ${T.traders().length} of them people`);
    report("*** GIT AUTHOR IDENTITY IS SELF-DECLARED AND NO KEY AVAILABLE TO US IS CORRECT. *** Picking one " +
        "would be choosing which error to have. Both are recorded, the disagreement is a function anyone " +
        "can call, and the named cases are in SPLIT_NAMES -- so a reader can see the seam rather than " +
        "trusting a number that has one.");
}

// =============================================================================================================
// SABOTAGE LOG -- grep-confirmed before the result was read, exit codes and FAIL summaries both read, restored
// md5-identical (ccdcbb52d97c9186). MEASURED.
//
//   A  the one redacted display name put back as the address it really is.
//      -> exit=1, 2 red: the whole-file scan finds it, and the check that the redaction still EXISTS fails
//      beside it. Both matter -- the first catches the address, the second catches somebody removing the
//      redaction and the explanation together.
//
//   B  the empty-address hash allowed back into traders().
//      -> exit=1, 2 red, and the people count goes from 8 to 9. *** THAT NINTH TRADER IS sha256(""). ***
//      Two repositories carry commits with no author address; hashing a missing field made a stable,
//      plausible identity and the graph reported it travelling between them. A coincidence of ABSENCE read
//      as a connection, and it looked exactly like a finding.
//
//   C  the bot-address pattern un-anchored, back to a bare "bot@".
//      -> exit=1, 1 red, on the surnames. "talbot@example.com" contains "bot@". *** THE GATE CAUGHT THIS
//      BEFORE IT SHIPPED, ON THE FIRST RUN OF THE CHECK THAT EXERCISES THE RULE *** -- the version that
//      merely read the module's TEXT for a forbidden pattern would have passed it, and had already gone red
//      on the comment explaining that the pattern is not used. A file grading a marker it also discusses,
//      for the twelfth time this session.
//
// None went 0 RED. B is the one worth keeping and it is not really a sabotage: it re-enables a bug that
// SHIPPED in the first version of this module and was found by the gate rather than by reading. A hashed
// empty field is the shape to remember -- every future identity key in this tree can invent the same person.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER THESE PEOPLE HAVE ANY CONNECTION TO SweK. The graph covers the 35 " +
    "repositories the licence sweep already opened; it says who moves between THEM, which is a map of this " +
    "project's own neighbourhood and not a survey of GitHub. Extending it to contributors' OTHER repositories " +
    "is the axis the /users refusal blocks, and it is also the axis worth leaving alone: a project's " +
    "relationship graph and a database of people are different artefacts, and only the first one is anybody's " +
    "business. Also unchecked: whether any name here is a real name. Nothing verifies that, and nothing should.");
process.exit(fails ? 1 : 0);
