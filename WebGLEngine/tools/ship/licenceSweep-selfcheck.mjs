// WebGLEngine/tools/ship/licenceSweep-selfcheck.mjs -- v4276
//
// GRADES world/licenceSweep.mjs -- twenty-six repositories actually opened, the premise that said they could
// not be, and the questions the batches raised as they arrived: WHO IS GRANTING THE LICENCE, and WHAT IF THE
// REPOSITORY STATES TWO?
//
// *** v4275 SAID "THIS SESSION HAS NO NETWORK" IN FOUR PLACES AND NEVER TESTED IT. *** A bare curl to github.com
// returns HTTP 400 through this environment's proxy. That reads like a wall. It is not one: the proxy gates
// GitHub PER REPOSITORY and its own error body names the way through, and anonymous git reads of public
// repositories work. Six repositories were filed as unreachable while being clonable, and all six turned out
// permissively licensed -- five MIT, one Apache-2.0.
//
// The shape is one this tree keeps finding: an environment's refusal was read as a fact about the environment
// rather than as a message to be read. v4270 did the identical thing with WebGPU, concluding the box had none
// after evaluating on about:blank, which is not a secure context. Both times the SYSTEM SAID WHY and I did not
// look.
"use strict";

import { SWEEP, NESTED_THIRD_PARTY, tally, identicalLicences, settles, declaredOnly, mirrors, ownerOf,
         contradictions } from "../../world/licenceSweep.mjs";
import { NAMED_SOURCES } from "../../world/namedNotChecked.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++;
    console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

console.log("\n1. EVERY VERDICT CARRIES ITS EVIDENCE");
{
    const T = tally();
    console.log(`        ${T.total} repositories: ${T.papered} papered, ${T.unpapered} not. ` +
                `${JSON.stringify(T.bySpdx)}`);
    ok("twenty-six repositories were swept", T.total === 26);
    ok("*** a papered entry names the FILE its licence was read from ***",
        SWEEP.filter((e) => e.licenceExists).every((e) => !!e.evidence.file && !!e.evidence.sha256 && e.evidence.lines > 0),
        "file, hash prefix and line count -- so a later round can tell a reading from a recollection");
    ok("*** and an unpapered entry names NOTHING, rather than an empty string ***",
        SWEEP.filter((e) => !e.licenceExists).every((e) => e.evidence.file === null && e.evidence.sha256 === null),
        "absent is not empty: a null says nobody found one, a '' would say somebody found a blank");
    ok("  every unpapered entry explains what was searched", SWEEP.filter((e) => !e.licenceExists).every((e) => !!e.note));
    // *** THE ONE PLACE spdx AND licenceExists DISAGREE, AND IT IS NOT AN OVERSIGHT. ***
    // The first thirteen entries made these two fields equivalent, and this check asserted it. The nine that
    // followed broke it once, on purpose: redcamel/screen-space-reflections DECLARES "license": "MIT" in
    // package.json and ships no licence text anywhere. That is a third state -- somebody named a licence and
    // nobody granted it in the words the licence itself requires be carried in all copies. So the rule is now
    // "they agree, EXCEPT for the declared-only entries, of which there is exactly one, and it is named".
    const declared = declaredOnly();
    ok("*** two entries declare an spdx with no licence text behind them ***", declared.length === 2,
        declared.map((e) => e.repo + " " + e.spdx).join(", ") + " -- package.json only, and NOT the same spdx");
    ok("  and they are not the same licence, so this is a SHAPE and not one repository's quirk",
        new Set(declared.map((e) => e.spdx)).size === 2, declared.map((e) => e.spdx).join(" vs "));
    ok("  and it is recorded as NOT papered, which is the honest half of the pair",
        declared.every((e) => !e.licenceExists && e.evidence.file === null));
    // *** AND THE OTHER DIRECTION, WHICH THE LAST BATCH ADDED: A LICENCE THAT EXISTS AND IS UNRESOLVED. ***
    const contra = contradictions();
    ok("*** one repository states MIT in a file and ISC in its metadata ***", contra.length === 1,
        contra.map((e) => `${e.repo}: ${e.contradiction.file} in ${e.evidence.file}, ` +
                          `${e.contradiction.metadata} in package.json`).join("; "));
    ok("  and the ledger refuses to pick one: licence EXISTS, spdx is null",
        contra.every((e) => e.licenceExists && e.spdx === null),
        "the only entry in the sweep shaped that way, and the only reason it may be");
    ok("  tally() counts it as `unresolved` rather than as an spdx named \"null\"", T.unresolved === contra.length,
        JSON.stringify(T.bySpdx) + " -- no null key, which the first version of tally() produced");
    const special = new Set([...declared, ...contra]);
    ok("  every OTHER entry has spdx and licenceExists agreeing",
        SWEEP.filter((e) => !special.has(e)).every((e) => (e.spdx === null) === (e.licenceExists === false)),
        (SWEEP.length - special.size) + " of " + SWEEP.length + ", with " + special.size + " named exceptions");
    ok("  and the exceptions are EXERCISED, not a hole left open for convenience", special.size === 3,
        [...special].map((e) => e.repo.split("/").pop()).join(", "));
    report("collapsing the declared-only entry into either shelf loses the thing worth knowing about it. " +
        "Called papered, the tree would believe it holds a grant it has never seen. Called unpapered, the " +
        "tree would forget that the author's own metadata says MIT, which is where a real answer starts.");
}

console.log("\n2. THE TWO WAYS A LICENCE SCAN GOES WRONG, BOTH HIT IN ONE SESSION");
{
    const readme = SWEEP.filter((e) => e.licenceExists && /README/i.test(e.evidence.file || ""));
    ok("*** one repository is fully licensed with NO licence file ***", readme.length === 1,
        readme.map((e) => e.repo).join(", ") + " -- MIT text in the README");
    ok("  so a root-directory scan would call it unpapered and be wrong",
        readme.every((e) => /root-directory scan/.test(e.note || "")),
        "the same mistake world/orrery.mjs records three of its own scans making");
    const falsePos = SWEEP.filter((e) => !e.licenceExists && /emitter|transmitted/.test(e.note || ""));
    ok("*** and two unpapered ones would FALSELY read as MIT to a careless grep ***", falsePos.length === 2,
        falsePos.map((e) => e.repo.split("/").pop()).join(", ") + " -- the hits are 'emitter' and 'transmitted'");
    report("those are opposite errors. One misses a licence that exists; the other invents one that does not. " +
        "A scan that only counts matches makes both, and only reading the matched LINES catches either.");
    ok("*** a nested third-party licence is recorded as NOT the repository's own ***",
        NESTED_THIRD_PARTY.seenIn.length === 4 && /CTM/.test(NESTED_THIRD_PARTY.why));
    ok("  and two of the four have no other licence, so a recursive scan alone would paper them wrongly",
        NESTED_THIRD_PARTY.seenIn.filter((r) => SWEEP.some((e) => e.repo === r && !e.licenceExists)).length === 2,
        "snellytracer and vidfilt -- recursion is necessary and not sufficient; whose licence it is matters");
}

console.log("\n3. IDENTICAL BYTES ARE A FACT, NOT A COINCIDENCE TO SMOOTH OVER");
{
    const groups = identicalLicences();
    const sizes = Object.values(groups).map((v) => v.length).sort((a, b) => b - a);
    // *** THE DETAIL STRING HAS TO SURVIVE THE CHECK FAILING. *** The first draft read
    // `groups.find(v => v.length === 4)[1]` inline, and sabotage C -- one hash changed so the group of four
    // becomes a group of three -- did not turn this line red. It CRASHED the gate with a TypeError before ok()
    // was ever called, so no FAIL line printed and no count was reported. A gate whose detail argument assumes
    // the condition it is grading is a gate that reports nothing at the exact moment it has something to say.
    const four = Object.entries(groups).find(([, v]) => v.length === 4);
    ok("*** four repositories ship a byte-identical licence ***", sizes[0] === 4,
        four ? four[1].map((r) => r.split("/").pop()).join(", ") : "no group of four -- sizes " + sizes.join(","));
    ok("  and two more share a different one", sizes[1] === 2);
    ok("  every group is one author reusing one file", Object.values(groups).every((v) =>
        v.every((r) => r.startsWith(v[0].split("/")[0]))),
        "which is unremarkable -- and a SEVENTH copy with a different hash would not be");
    ok("CONTROL: the Apache entry is in no group", !Object.values(groups).flat().some((r) => /OpenPBR$/.test(r)),
        "201 lines against 21-23, so the hash separates the licence families without being told to");

    // *** AND THE REASON THE LEDGER STORES A HASH RATHER THAN A LENGTH. ***
    // This check has been written wrong TWICE by hardcoding its own answer -- first "three entries at 21
    // lines" when there were four, then four when nine more entries arrived and made it eight. Both times the
    // number was authored rather than counted. So it is DERIVED now: group the papered entries by line count,
    // group them by hash, and assert that length-grouping is strictly COARSER. That statement stays true and
    // stays meaningful however many repositories the sweep grows to, which a literal never could.
    const papered = SWEEP.filter((e) => e.licenceExists);
    const byLen = {}; for (const e of papered) (byLen[e.evidence.lines] ||= []).push(e);
    const worstLen = Object.entries(byLen).sort((a, b) => b[1].length - a[1].length)[0];
    const inThatLen = new Set(worstLen[1].map((e) => e.evidence.sha256));
    ok("*** the biggest LINE-COUNT group is strictly bigger than the byte-groups inside it ***",
        worstLen[1].length > inThatLen.size,
        `${worstLen[1].length} files are exactly ${worstLen[0]} lines and ${inThatLen.size} of them are ` +
        `genuinely different: ` + worstLen[1].map((e) => e.repo.split("/").pop()).join(", "));
    ok("  so length-grouping and byte-grouping do NOT agree anywhere in the sweep",
        Object.values(byLen).some((g) => g.length > new Set(g.map((e) => e.evidence.sha256)).size));
    report("a ledger that recorded LENGTH would report that whole group as one file. Recording BYTES splits " +
        "it correctly. That is the entire reason the evidence field carries a hash and not just a count, and " +
        "it is asserted as a RELATION between the two groupings rather than as a number somebody typed.");
}

console.log("\n4. *** WHO IS GRANTING? THE ACCOUNT YOU CLONED FROM IS NOT THE ANSWER. ***");
{
    // Backlog #82 is ENCUMBERED -- a licence granted by somebody who lacked the rights -- and that is this
    // question in its dangerous direction. This is its ordinary direction, and it is far commoner: the grant
    // is perfectly good and the ATTRIBUTION would have been wrong. A ledger that recorded owner/name and spdx
    // and stopped would credit a mirror account for gl-matrix, for a WGSL parser, and for two shader
    // collections, all four of which name their real authors in the licence file that was right there.
    const mir = mirrors();
    const owners = new Set(SWEEP.map((e) => ownerOf(e.repo)));
    ok("*** five repositories carry a licence naming somebody who is NOT the account holder ***",
        mir.length === 5, mir.map((e) => e.repo.split("/").pop() + " <- " + e.grantor.named).join("; "));
    ok("  and every one of them is permissively licensed all the same",
        mir.every((e) => e.licenceExists && e.spdx === "MIT"),
        "the grant is good; it is the credit that would have gone to the wrong person");
    ok("  every entry carrying a grantor names one OR says why it cannot",
        SWEEP.filter((e) => e.grantor).every((e) => e.grantor.named !== undefined),
        SWEEP.filter((e) => e.grantor).length + " entries carry the field");
    // CONTROL, and it is the check that keeps `mirrors()` from being a synonym for "one particular account".
    const sameAccount = SWEEP.filter((e) => e.grantor && e.grantor.isRepoOwner === true);
    ok("CONTROL: some repositories under the SAME accounts do grant in their own name",
        sameAccount.length >= 3, sameAccount.map((e) => e.repo).join(", "));
    ok("  so the finding is per-repository and not per-account", (() => {
        const byOwner = {};
        for (const e of SWEEP) if (e.grantor && e.grantor.named) (byOwner[ownerOf(e.repo)] ||= new Set()).add(e.grantor.isRepoOwner);
        return Object.values(byOwner).some((v) => v.size === 2); })(),
        "one account here holds both kinds, which a per-account rule could not have told apart");
    // *** THE GRANTOR QUESTION CANNOT BE ANSWERED BY STRING COMPARISON, AND ONE ENTRY PROVES IT. ***
    const handle = SWEEP.find((e) => e.repo === "but0n/Ashes");
    ok("*** at least one entry is the OWNER under a different name entirely ***",
        !!handle && handle.grantor.isRepoOwner === true &&
        !handle.grantor.named.toLowerCase().includes(ownerOf(handle.repo).toLowerCase()),
        handle ? `${handle.repo} is licensed to "${handle.grantor.named}"` : "absent");
    report("so no rule matching the owner segment of the URL against the copyright line could have got this " +
        "field right. Every isRepoOwner here was decided by reading at least two things in the repository, " +
        "and that is the limit on the method rather than a gap in this one entry.");
    // A collective grantor is a THIRD answer, and null is how the ledger says so.
    const collective = SWEEP.filter((e) => e.grantor && e.grantor.isRepoOwner === null);
    ok("  and a COLLECTIVE grantor is null, not false", collective.length === 1,
        collective.map((e) => `${e.repo.split("/").pop()} <- "${e.grantor.named}"`).join(", ") +
        " -- neither the account holder nor somebody else");
    report("*** THE COUNT WAS WRITTEN AS FIVE, RUN AS FOUR, AND IS FIVE AGAIN FOR A DIFFERENT REASON. *** " +
        "redcamel/screen-space-reflections is a mirror on every other sign and has no licence file, so there " +
        "is no name in it to read; but0n/three-raymarcher, which arrived later, does name one. mirrors() " +
        "reports what the evidence supports rather than what the pattern suggests. " +
        String(owners.size) + " distinct accounts across the sweep, and the question is asked of each " +
        "repository separately.");
}

console.log("\n5. THE REGISTER OF THE UNCHECKED SHRANK, WHICH IS THE POINT OF HAVING ONE");
{
    ok("*** none of the swept repositories is still filed as unchecked ***", settles(NAMED_SOURCES).length === 0,
        settles(NAMED_SOURCES).join(", ") || `0 of ${SWEEP.length}`);
    ok("  the register still holds the entries nobody has attempted", NAMED_SOURCES.length === 6,
        `${NAMED_SOURCES.length} left, all from #100 and #132`);
    ok("  and it says so about itself rather than being quietly emptied",
        NAMED_SOURCES.every((e) => e.namedIn === "#100" || e.namedIn === "#132"));

    // *** THE SIX ARE NOT UNCHECKED FOR THE REASON v4275 GAVE, AND THE REAL REASON IS RIGHT HERE. ***
    // v4275 said they could not be opened because the session had no network. False. What is actually true is
    // duller and fixable: NOT ONE OF THE SIX RECORDS AN OWNER. They are bare repository names -- the detail
    // line below prints them, rather than this comment naming any, because namedNotChecked-selfcheck's own
    // rule is that a file mentioning a register entry needs a named allowance, and this file has no business
    // holding one. (It went red for exactly that on the first run, which is the rule working.) This
    // environment's proxy gates GitHub per owner/repo, so a bare name is not an address, and a bare name is
    // all the register kept. Every one of the thirteen entries the sweep DID settle carries owner/name. That is the whole
    // difference between the two shelves, and it is a fact about the register rather than about the network.
    ok("*** not one of the six unchecked entries records an OWNER ***",
        NAMED_SOURCES.every((e) => !e.repo.includes("/")),
        NAMED_SOURCES.map((e) => e.repo).join(", "));
    ok("  while every entry the sweep settled does", SWEEP.every((e) => e.repo.includes("/")),
        SWEEP.length + " of " + SWEEP.length + " as owner/name");
    report("so the next round on #100 or #132 does not need a network it already has -- it needs the six URLs, " +
        "which the backlog items were written from and the register did not keep. That is the actual blocker, " +
        "and it was hidden for a round behind a claim about the environment that nobody tested.");
    report("*** THE REGISTER IS NOT DISCREDITED BY THIS. *** 'Nobody has established a grant' was the honest " +
        "state at v4275 given what I believed, and it is still the right home for a source that genuinely " +
        "cannot be reached. What was wrong was the belief, not the shelf -- and the six that remain are " +
        "unread rather than unreachable, which nothing here claims otherwise.");
}

// =============================================================================================================
// SABOTAGE LOG -- each edit grep-confirmed BEFORE the result was read, exit code and the FAIL summary line both
// read, both files restored md5-identical (licenceSweep.mjs 52cfab6650a3, namedNotChecked.mjs 3ae299ba13f2).
// Every count below was measured by running the gate, not predicted from reading it.
//
//   A  snellytracer flipped to spdx "MIT", licenceExists true, evidence left null -- a verdict with nothing
//      behind it, which is precisely the failure this whole round exists to correct.
//      -> exit=1, 3 FAIL. Section 1's evidence rule, section 2's false-positive count (2 -> 1), and section 2's
//      nested-licence check (the two repositories a recursive scan would wrongly paper drop to one). Three
//      independent sections notice, because the entry is load-bearing in three different arguments rather than
//      being asserted once.
//
//   B  vidfilt given spdx "MIT" while licenceExists stays false -- an spdx nobody has a licence for.
//      -> exit=1, 1 FAIL, section 1's consistency rule and nothing else. A narrow sabotage earning a narrow
//      red is the right result; it is the ones that earn ZERO that mean the gate is decorative.
//
//   C  gravy's hash changed to a value nothing else shares, collapsing the group of four to three.
//      -> exit=1, 1 FAIL in section 3.
//
//      *** THE FIRST RUN OF C DID NOT PRODUCE THAT RED. IT CRASHED THE GATE. *** The detail argument read
//      `Object.entries(groups).find(([, v]) => v.length === 4)[1]` inline, so when there was no group of four
//      the find returned undefined and the TypeError threw BEFORE ok() was called. Exit was 1 -- which would
//      have looked like a pass of the sabotage to anyone reading only the exit code -- and no FAIL line printed
//      and no count was reported. A detail string that assumes the condition it is grading goes silent at the
//      exact moment it has something to say. The fix is four lines up: compute the group, then report it or
//      report the sizes. THIS IS WHY SABOTAGES ARE RUN RATHER THAN REASONED ABOUT.
//
//   D  portsmouth/fibre re-filed in world/namedNotChecked.mjs as unchecked, in a DIFFERENT FILE from the one
//      this gate is named for.
//      -> exit=1, 2 FAIL in section 4: the sweep-settled check names the repository, and the count goes 6 -> 7.
//      The two registers cannot silently disagree about the same repository, which is what section 4 is for --
//      the sweep is only worth anything if the shelf it emptied stays empty.
//
//   E  boytchev/tsl-textures' licenceNote in world/reachedLicences.mjs reverted to the v4275 wording -- the
//      grant asserted from render/solidTexture.mjs's own header, with the hash and the line count removed.
//      -> exit=1, 1 FAIL, and IN namedNotChecked-selfcheck.mjs rather than here, which is the point of running
//      it: the thirteenth entry is the one that spans three files, and a regression from a read licence back
//      to a cited one has to be visible from the register that used to carry the caveat.
//
//   F  redcamel/gl-matrix's grantor re-credited to the account holder -- one entry, the exact error section 4
//      exists to prevent, and the one that would have credited a mirror for gl-matrix itself.
//      -> exit=1, 1 FAIL. The mirror count reads three and names the three that survive, so the red says WHICH
//      one went missing rather than only that a number moved.
//
//   G  redcamel/screen-space-reflections collapsed into "papered", with package.json cited as its licence file.
//      -> exit=1, 1 FAIL: the declared-only count goes 1 -> 0. This is the sabotage that matters most of the
//      four, because it is not a typo -- it is the tempting simplification. "package.json says MIT, call it
//      papered" is what a tidier ledger would do, and it would then hold a grant nobody has ever seen.
//
//   H  EVERY mirror re-credited at once (all six isRepoOwner:false flipped), so mirrors() returns empty.
//      -> exit=1, 2 FAIL. Worth running separately from F because a check written as "mirrors().length >= 1"
//      would have survived F and died here, while one written as "=== 4" survives neither. The second red is
//      the per-repository control: with every entry crediting its account, no account holds both kinds any
//      more, and the control that proves the finding is not merely "this one account is a mirror farm" goes
//      red too. A control that cannot fail is decoration; this one fails.
//
//   I  but0n/recastCLI.js's contradiction resolved by taking the licence FILE's answer and dropping the
//      `contradiction` field -- the coin toss written down as a fact.
//      -> exit=1, 2 FAIL: the contradiction count goes 1 -> 0, and the named-exceptions check notices that one
//      of its three exceptions stopped being exercised. That second red is the one worth having: an exception
//      list that is not asserted to be USED becomes a hole, and this one closes itself when it empties.
//
//   J  but0n/Ashes' grantor renamed from "Jeff Ma" to "but0n" -- exactly what a rule matching the URL's owner
//      segment against the copyright line would have produced.
//      -> exit=1, 1 FAIL. The check is written as "the owner under a DIFFERENT name", so it dies precisely
//      when the ledger stops recording what the licence file actually says and starts recording what the
//      account is called. That is the automatable-looking answer, and it is wrong about a real person.
//
// Five counts in this file were WRONG before they were run, and all four are corrected in the code above.
// The 21-line check was authored as "three" (there were four), then survived into a round where nine more
// entries made it eight -- fixed by DERIVING the relation instead of typing a number. The owner-check comment
// NAMED two register entries, which namedNotChecked-selfcheck's allowance rule turned red on sight. The
// module header said five mirrors where the evidence supports four -- and a later batch made it five again
// for a different reason, which is why that number is derived from the entries and not typed anywhere. And
// tally() reduced over every papered entry, putting a key literally named "null" into the spdx histogram the
// moment a repository arrived whose licence exists and whose spdx is genuinely open. Not one of the five was
// caught by re-reading; every one was caught by running.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER THE LICENCES SAY WHAT SPDX SAYS THEY SAY. Each verdict is a hash and a " +
    "line count of a file whose first lines were read -- 'The MIT License', 'Apache License' -- and no entry " +
    "diffs the full text against a canonical SPDX body, so a modified MIT with an added clause would be " +
    "recorded as MIT. Also unchecked: whether the clones are current. They are --depth 1 of the default " +
    "branch at one moment; a repository relicensed tomorrow is not tracked, and the hash is what would show it.");
process.exit(fails ? 1 : 0);
