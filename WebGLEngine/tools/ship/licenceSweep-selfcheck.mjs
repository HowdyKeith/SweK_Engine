// WebGLEngine/tools/ship/licenceSweep-selfcheck.mjs -- v4276
//
// GRADES world/licenceSweep.mjs -- thirty-five repositories actually opened, the premise that said they could
// not be, and the questions the batches raised as they arrived: WHO IS GRANTING THE LICENCE, WHAT IF THE
// REPOSITORY STATES TWO, and -- on the twenty-seventh -- WHAT IF IT IS NOT PERMISSIVE AFTER ALL?
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
         contradictions, nonPermissive, composite, spdxReach } from "../../world/licenceSweep.mjs";
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
    ok("thirty-five repositories were swept", T.total === 35);
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
    // Typed as "and two more share a different one" -- sizes[1] === 2 -- which went red the moment a third
    // group of three appeared. Third literal in this file to rot for the same reason. Derived: there is more
    // than one group, and every group is at least a pair, which is what identicalLicences() promises.
    ok("  and there is more than one such group", sizes.length > 1,
        sizes.length + " groups, sizes " + sizes.join("/"));
    ok("  every group really is two or more, which is the function's own contract", sizes.every((n) => n >= 2));
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
    // Typed as four, corrected to five, and stale again at ten. The COUNT is not the finding -- that mirrors
    // exist at all, and are a minority of the entries that carry a grantor, is. Reported, not asserted.
    ok("*** repositories carry a licence naming somebody who is NOT the account holder ***", mir.length >= 5,
        mir.length + " of " + SWEEP.filter((e) => e.grantor && e.grantor.named).length +
        " named grantors: " + mir.map((e) => e.repo.split("/").pop() + " <- " + e.grantor.named).join("; "));
    // *** AND "EVERY MIRROR IS PERMISSIVE ANYWAY" WAS TRUE FOR TWO ROUNDS AND IS NOW FALSE. ***
    // It was asserted as `every(e => e.spdx === "MIT")` and read as reassurance: the credit would have been
    // wrong, the grant was fine. but0n/rvo2.js is a mirror AND non-commercial, so the two questions come
    // apart -- which is the more dangerous combination, not the safer one.
    const restrictedMirrors = mir.filter((e) => e.permissive === false);
    ok("*** and a mirror is NOT thereby permissive -- one of them restricts commercial use ***",
        restrictedMirrors.length >= 1,
        restrictedMirrors.map((e) => e.repo + " -- " + e.spdx).join("; "));
    ok("  the rest are permissive, so the two questions really are independent",
        mir.filter((e) => e.permissive === true).length === mir.length - restrictedMirrors.length,
        (mir.length - restrictedMirrors.length) + " permissive, " + restrictedMirrors.length + " not");
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
    ok("  and a COLLECTIVE grantor is null, not false", collective.length >= 1 &&
        collective.every((e) => e.grantor.named && /authors|contributors/i.test(e.grantor.named)),
        collective.map((e) => `${e.repo.split("/").pop()} <- "${e.grantor.named}"`).join(", ") +
        " -- neither the account holder nor somebody else");
    report("*** THE COUNT WAS WRITTEN AS FIVE, RUN AS FOUR, AND IS FIVE AGAIN FOR A DIFFERENT REASON. *** " +
        "redcamel/screen-space-reflections is a mirror on every other sign and has no licence file, so there " +
        "is no name in it to read; but0n/three-raymarcher, which arrived later, does name one. mirrors() " +
        "reports what the evidence supports rather than what the pattern suggests. " +
        String(owners.size) + " distinct accounts across the sweep, and the question is asked of each " +
        "repository separately.");
}

console.log("\n5. *** TWENTY-SIX PERMISSIVE IN A ROW, AND THEN ONE THAT IS NOT. ***");
{
    // The sweep ran for two rounds without meeting a restricted licence. That is not a property of open
    // source; it is a run, and a run is what makes a shape-matching reader feel reliable right up to the
    // moment it is wrong. but0n/rvo2.js has every surface feature of a BSD notice -- copyright line,
    // "Permission to use, copy, modify, and distribute", an ALL-CAPS disclaimer two thirds the length of the
    // file -- and grants only educational, research and non-profit use, with commercial use available by
    // asking UNC Chapel Hill. A reader keyed on shape takes it. A reader that read the grant does not.
    const np = nonPermissive();
    ok("*** at least one entry is NOT permissive, so the field is not decoration ***", np.length >= 1,
        np.map((e) => `${e.repo} -- ${e.spdx}`).join("; "));
    ok("  and it is the one whose licence text restricts the PURPOSE, not the attribution",
        np.every((e) => /non-profit|educational|research/.test(e.note || "")),
        "'for educational, research, and non-profit purposes' -- and commercial use by arrangement");
    ok("  its spdx is a LicenseRef rather than a standard identifier, because no standard one fits",
        np.every((e) => /^LicenseRef-/.test(e.spdx)),
        np.map((e) => e.spdx).join(", ") + " -- inventing 'BSD-3-Clause' here would have been the whole error");
    ok("*** and it has THREE parties, which is one more than the grantor field alone can hold ***",
        np.some((e) => /three parties|THREE PARTIES/i.test(e.note || "")),
        "UNC holds the copyright, package.json names the porter, the account is a third -- and nobody " +
        "downstream can grant more than the first party did");

    // *** THE RULE THAT KEEPS SILENCE FROM READING AS A GRANT. ***
    ok("*** permissiveness is established exactly where a licence was READ, and null everywhere else ***",
        SWEEP.every((e) => (e.permissive !== null) === (e.licenceExists === true)),
        `${SWEEP.filter((e) => e.permissive !== null).length} established, ` +
        `${SWEEP.filter((e) => e.permissive === null).length} not -- including both declared-only entries`);
    report("a DECLARATION IS NOT A GRANT, so the two entries whose spdx comes from package.json alone have " +
        "permissive null rather than true. They name permissive licences; nobody has granted one in the " +
        "words the licence requires be carried in all copies, and the field says exactly that much and no " +
        "more. The contradiction entry goes the other way: WHICH licence is open, and both candidates are " +
        "permissive, so its permissive is true while its spdx stays null.");

    // A COMPOSITE LICENCE FILE: the project's own spdx is not the whole obligation.
    const comp = composite();
    ok("*** one licence file carries three licences, two of them somebody else's ***", comp.length === 1 &&
        comp[0].thirdParty.length === 2,
        comp.map((e) => `${e.repo}: ${e.spdx} + ` +
            e.thirdParty.map((t) => `${t.what} ${t.spdx}`).join(" + ")).join(""));
    // *** THIS CHECK FIRST CLAIMED THE COMPOSITE WIDENS THE SWEEP'S SPDX REACH, AND IT DOES NOT. ***
    // Written as spdxReach().length > (project spdx values).size and run: both are 4. Apache-2.0 was already
    // reached directly through AcademySoftwareFoundation/OpenPBR, so the quoted dat.gui notice adds no new
    // identifier to the SWEEP. What it adds is to that ENTRY, and that is the true and narrower statement:
    // reading only glTF-WebGL-PBR's own spdx understates what a consumer of glTF-WebGL-PBR inherits.
    ok("*** the composite entry's own spdx UNDERSTATES what a consumer of it inherits ***",
        comp.every((e) => e.thirdParty.some((t) => t.spdx !== e.spdx)),
        comp.map((e) => `${e.repo.split("/").pop()} is ${e.spdx} and carries ` +
            e.thirdParty.map((t) => t.spdx).join(" + ")).join(""));
    ok("  and the sweep-wide reach is not widened by it, which was asserted here first and is FALSE",
        spdxReach().length === new Set(SWEEP.filter((e) => e.spdx && e.licenceExists).map((e) => e.spdx)).size,
        "reach " + spdxReach().join(", ") + " -- Apache-2.0 was already reached directly, so the quotation " +
        "adds an obligation to one entry and no identifier to the ledger");
    report("its own spdx is MIT and a consumer inherits the Apache notice too. And the glMatrix copyright " +
        "quoted inside it names the same pair the sweep already met as a standalone mirror, so the ledger " +
        "now holds one library twice: once as a repository and once as a quotation.");
}

console.log("\n6. THE REGISTER OF THE UNCHECKED SHRANK, WHICH IS THE POINT OF HAVING ONE");
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
//   K  but0n/rvo2.js filed as BSD-3-Clause and permissive -- exactly what a reader keyed on the SHAPE of the
//      file produces, and the entry that most deserves to be got wrong once in a controlled way.
//      -> exit=1, 3 FAIL: the non-permissive count empties, the restricted-mirror check empties with it, and
//      the three-parties check dies too because its evidence lives in the note this sabotage displaced. Three
//      reds for one edit is the right answer here -- a non-commercial licence recorded as BSD is not one
//      mistake, it is a wrong answer to three separate questions the ledger is asked.
//
//   L  but0n/webgpu-cluster's permissive flipped from null to true -- a package.json declaration read as a
//      grant, which is the single most natural thing to do with a declared-only entry.
//      -> exit=1, 1 FAIL. The rule is written as an EQUIVALENCE (permissive is non-null exactly where a
//      licence was read), so it fails in this direction as well as the other, and the detail prints 29
//      established against 28 papered so the red says which way the ledger drifted.
//
//   M  the composite's `thirdParty` array deleted, leaving glTF-WebGL-PBR as a plain MIT entry.
//      -> exit=1, 1 FAIL. This is the quietest of the three sabotages and the closest to something a tidying
//      pass would actually do: the entry still looks complete, still has a real licence file and a real hash,
//      and has silently stopped saying that a consumer of it inherits Apache-2.0 as well.
//
// Eight counts in this file were WRONG before they were run, and all four are corrected in the code above.
// The 21-line check was authored as "three" (there were four), then survived into a round where nine more
// entries made it eight -- fixed by DERIVING the relation instead of typing a number. The owner-check comment
// NAMED two register entries, which namedNotChecked-selfcheck's allowance rule turned red on sight. The
// module header said five mirrors where the evidence supports four -- and a later batch made it five again
// for a different reason, which is why that number is derived from the entries and not typed anywhere. And
// tally() reduced over every papered entry, putting a key literally named "null" into the spdx histogram the
// moment a repository arrived whose licence exists and whose spdx is genuinely open. Not one of the five was
// caught by re-reading; every one was caught by running.
//
// v4277 added three more of the same species, all in checks that had been GREEN and CORRECT for two rounds
// and rotted when the sweep grew: "and two more share a different one" (a second group of three appeared),
// "five repositories are mirrors" (ten now), and "a collective grantor" (two now). Every one is derived in
// the code above rather than restated -- the pattern is unmistakable by now, which is that A COUNT TYPED INTO
// A GATE IS A CLAIM WITH AN EXPIRY DATE. And one was not stale but simply FALSE: the composite check asserted
// that the quoted third-party notices widen the sweep's spdx reach, and running it showed both sets are the
// same size, because Apache-2.0 was already reached directly through OpenPBR. The true statement is narrower
// and is what the gate says now -- the composite understates what a consumer of THAT ENTRY inherits, and adds
// no identifier to the ledger.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER THE LICENCES SAY WHAT SPDX SAYS THEY SAY. Each verdict is a hash and a " +
    "line count of a file whose first lines were read -- 'The MIT License', 'Apache License' -- and no entry " +
    "diffs the full text against a canonical SPDX body, so a modified MIT with an added clause would be " +
    "recorded as MIT. Also unchecked: whether the clones are current. They are --depth 1 of the default " +
    "branch at one moment; a repository relicensed tomorrow is not tracked, and the hash is what would show it.");
process.exit(fails ? 1 : 0);
