#!/usr/bin/env node
// WebGLEngine/tools/ship/traderGraph-selfcheck.mjs -- v4289
//
// GRADES world/traderGraph.mjs: contributors as traders, built from git history because the API is shut.
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

console.log("\n2. *** THE THREE REFUSALS, RE-PROBED AGAINST GITHUB THIS RUN ***");
{
    const probe = (p) => {
        try {
            const out = execFileSync("curl", ["-s", "-m", "20", "-o", "/dev/null", "-w", "%{http_code}",
                                              "https://api.github.com/" + p], { encoding: "utf8" });
            return parseInt(out, 10);
        } catch { return -1; }
    };
    const blocked = T.AXES.filter((a) => !a.have);
    ok("the module records three DISTINCT refusals, not one", new Set(blocked.map((a) => a.blocked)).size === 3,
        blocked.map((a) => a.remedy.slice(0, 26)).join(" | "));
    const user = probe("users/but0n");
    const repo = probe("repos/but0n/vixel");
    const own = probe("repos/howdykeith/swek_engine/contributors");
    ok("*** the /users path class is STILL refused ***", user === 403,
        `HTTP ${user}` + (user === 200 ? " -- IT IS OPEN NOW, and the module's AXES are out of date" : ""));
    ok("*** an unattached repository is STILL refused ***", repo === 403, `HTTP ${repo}`);
    ok("*** our own repository's contributors are STILL refused ***", own === 403, `HTTP ${own}`);
    ok("CONTROL: the network is up, so the 403s are refusals and not a dead link",
        probe("rate_limit") === 200, "rate_limit answers 200 on the same connection");
    report("if any line above goes red with a 200, the graph can be built from richer data than git history " +
        "and this module should be revisited. A red here is an INVITATION, which is why it is a check and " +
        "not a sentence in a comment.");
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
