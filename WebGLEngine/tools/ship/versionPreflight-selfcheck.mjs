// WebGLEngine/tools/ship/versionPreflight-selfcheck.mjs — v4360
//
// The preflight exists because rule 3 -- never reuse a version number -- was enforced by memory and was broken
// FIVE TIMES IN ONE SESSION. So the checks that matter are not "does it return an object": they are the five
// real collisions, replayed, plus the two ways a guard like this fails in practice.
//
// *** THE FIFTH IS THE ONE THIS FILE CAUGHT ITSELF, WITHIN AN HOUR OF BEING WRITTEN. *** The round was being
// verified as v4338 when main shipped its own v4338; verify called the preflight and it refused by name. The
// round took the headroom jump to v4350 rather than the next seat, which is v3900's own habit. A guard whose
// first live act is to refuse the thing it was written for needs no argument about whether it earns its run.
//
//   IT REFUSES WHAT ACTUALLY HAPPENED.   v4327/v4331/v4336 against a main that had moved, and the same number
//                                        against itself. All four are driven below against a stubbed main.
//   IT DOES NOT REFUSE ORDINARY WORK.    A guard that fires on the next legitimate number teaches people to
//                                        skip it, and then the rule is unenforced again with extra steps.
//
// *** AND THE FIRST VERSION OF THE MODULE STOOD ASIDE ON EVERY RUN. *** `git show origin/main:...main.js` threw
// ENOBUFS -- main.js carries the whole round note on one line and is over 2 MB against execFileSync's 1 MB
// default -- and the catch reported it as "origin/main is not readable here (no such ref...)". THE GUARD
// ANSWERED "nothing to compare" FOREVER, IN WORDS THAT SOUNDED LIKE A REASON. It was caught by running it
// against a tree whose main was plainly readable and reading the answer rather than the exit code. Section 5
// pins the distinction so a buffer failure can never again be reported as a missing ref.
//
// SABOTAGES DRIVEN AGAINST tools/ship/versionPreflight.mjs, each restored after:
//   1. compare with < instead of <=          -> RED: the same-number case, which is the fleet-jamming one
//   2. treat an unreadable main as version 0 -> RED: a guess where a report belongs
//   3. drop the maxBuffer                    -> RED: section 5, the fault that shipped in the first draft
// Three sabotages, three caught.
// v4846 -- SECTION 5d (a --depth 1 --branch clone with no origin/main, driven against real git), each restored md5-identical:
//   4. originMainRef classifies by the old message regex instead of the probe's exit status
//                                            -> 4 RED: the mainVersion, mainOrdinals and refFreshness "NOT IN THIS CLONE"
//                                               rows and the preflight-note row -- all four "git could not be asked: Command failed"
//   5. mainVersion's pre-fix body put back (no probe; the show's own message against the old regex)
//                                            -> 4 RED: the mainVersion absent row, the preflight note, the no-repository row, and
//                                               the PRESENT-ref-read-fails row, which it now misreads AS absence ("does not exist")
//   6. gitRunner ignores stderr again        -> 3 RED: present-ref-read-fails, UNREACHABLE remote, no-repository -- each lost
//                                               git's sentence and said "Command failed" instead
//   7. refFreshness's pre-fix single catch   -> 2 RED: the missing-LOCAL-ref row and the UNREACHABLE-remote row, both back to
//                                               "could not compare against the remote (offline, or no origin)"
//   8. FETCH_MAIN without its :refs/remotes/origin/main destination
//                                            -> 3 RED: the three after-the-fetch rows -- a single-branch clone fetches a bare
//                                               "main" into FETCH_HEAD only, so the named cure must carry the refspec
// Five more, five caught.
//   9. the BEHIND note's cure put back to `git fetch origin main`
//                                            -> 1 RED: the stale-ref row -- the same FETCH_HEAD-only fetch as 8, in the one note
//                                               the first pass of v4846 left naming it
//  10. verify.mjs's row back to printing only refusals, and its stale NOTE back to `git fetch origin main`
//                                            -> 1 RED each (run separately): the wiring row in section 6
//
// v4864 -- SECTIONS 7-10 (every branch copy asked whether it is the remote's; the un-bumped tree's blind spot; the ledger's
// closings; the CLI's option), each sabotage restored by copy:
//  11. branchFreshness ignores branches it never fetched -> 2 RED: the stale/unfetched naming row and the stale-view refusal
//  12. branchFreshness never sees a moved branch       -> 2 RED: the same two
//  13. preflight's stale-view refusal removed           -> 1 RED: the refusal row
//  14. `!sameBuild` put back on the high-water check    -> 1 RED: section 8's v4864-from-main's-tree row -- the blind spot itself
//  15. closingCensus counts MERGED branches as rivals    -> 3 RED: the rival row, the no-rival control, the ships control
//  16. closingsOf takes the first `at` in the WHOLE text -> 4 RED: the parse row (it read the decoy comment), the rival row,
//                                                          the main row, the refusal row
//  17. closingCensus's next is the top, not one past it -> 3 RED: the next row, the no-rival control, the refusal row
//  18. preflight's closing refusal removed               -> 1 RED: the refusal row
//  19. FETCH_ALL without its :refs/remotes/origin/* destination -> 1 RED: section 7's fixture row -- git refuses the
//      refspec ("invalid refspec") when the cure is run exactly as written, so the fixture cannot reach its after-fetch rows
// Nine more, nine caught.
//
// Run: node tools/ship/versionPreflight-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { preflight, versionNumber, engineVersionOf, mainVersion, ordinalsOf, mainOrdinals, refOrdinals, highWater, ENG,
         refFreshness, gitRunner, FETCH_MAIN, ABSENT_REASON,
         branchFreshness, FETCH_ALL, closingsOf, closingCensus, LEDGER, nextFree } from "./versionPreflight.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m + (d ? "   " + d : "")); } };
// A collision is TWO BUILDS wearing one number, so the stub supplies two DIFFERENT sources. Leaving them to
// fall through to the real files would compare this tree with itself, find them identical, and turn every
// historical collision below into a pass -- the check would then be measuring the working tree rather than the
// rule. (That is exactly what happened when the byte comparison was added: five of these went green at once.)
// *** v4667 -- AND THE ORDINALS MUST BE INJECTED FOR THE REASON THE PARAGRAPH ABOVE ALREADY GIVES. *** The
// ordinal check added this round reads origin/main's CHANGELOG, and these fixtures did not override it -- so
// three of them were graded against the live repo the moment it existed, and "the headroom jump this round
// actually took is permitted" went red because the real main had spent v4660. A fixture that reaches the
// tree it is replaying history against is not a fixture; it is the working tree wearing one. Every helper
// here now supplies a changelog whose newest heading is the main it is replaying.
const chlogSpending = (main) => `# changelog\n\n## ${main} -- the other line's newest round\n\nbody\n`;
// *** v4667 -- AND THE SAME LEAK HAPPENED AGAIN ONE READER LATER. *** v4665 added the ordinal reader and
// three fixtures went red because they did not override it. v4667 added the REF-SWEEP reader and four more
// went red for the identical reason -- a fixture that overrides every input the checker had YESTERDAY is
// still reading the live tree through the one added today. Sealed here instead of patched per-row: SEALED
// is the default every fixture spreads, so a reader added tomorrow lands on a stub rather than on origin.
const SEALED = {
    skipFreshness: true,
    refsOverride: [],                                        // no refs at all -> high-water is null
    readOverride: () => { throw new Error("sealed: a fixture must not read the repo"); },
    selfRef: null,
};
const against = (main) => (v) => preflight(v, {
    ...SEALED,
    mainVersionOverride: main,
    mainOrdinalsOverride: ordinalsOf(chlogSpending(main)),
    mainSourceOverride: `const ENGINE_VERSION = "${main}";   // the other line's build\n`,
    localSourceOverride: `const ENGINE_VERSION = "${v}";   // this branch's build\n`,
});

// 1) THE FOUR COLLISIONS THIS SESSION ACTUALLY HAD, replayed against the main that existed at the time.
{
    // v4327-v4329 were shipped twice: this branch and the orrery line both numbered from their own tree.
    const vsMain4330 = against("v4330");
    for (const v of ["v4327", "v4328", "v4329"]) {
        const r = vsMain4330(v);
        ok(r.ok === false && /EARLIER number/.test(r.refusal), `${v} against a main at v4330 is REFUSED`, r.refusal ? "" : "no refusal");
    }
    // then v4331 and v4332, while the first renumber was being verified
    const vsMain4332 = against("v4332");
    ok(vsMain4332("v4331").ok === false, "v4331 against a main at v4332 is REFUSED");
    ok(vsMain4332("v4332").ok === false, "v4332 against a main at v4332 is REFUSED");
    // and v4336, the fourth
    ok(against("v4337")("v4336").ok === false, "v4336 against a main at v4337 is REFUSED");
    // *** AND THE FIFTH, WHICH THIS FILE CAUGHT LIVE: main shipped v4338 while this round was verifying as
    // v4338. Replayed here from the real numbers rather than described in the header alone.
    const fifth = against("v4338")("v4338");
    ok(fifth.ok === false && /THE SAME NUMBER/.test(fifth.refusal),
       "*** the FIFTH collision, the one this guard refused in the wild, is refused here too ***");
    ok(/Supersede FORWARD: v4339/.test(fifth.refusal), "...naming v4339 as the next free seat, which is what it said at the time");
    ok(against("v4338")("v4350").ok === true, "...and the headroom jump this round actually took is permitted");

    // *** THE SAME NUMBER IS NAMED AS THE FLEET PROBLEM, not merely as "not greater". ***
    const same = against("v4337")("v4337");
    ok(same.ok === false && /THE SAME NUMBER/.test(same.refusal) && /different bytes/.test(same.refusal),
       "*** shipping main's OWN number is refused as two builds with one number ***");
    ok(/Supersede FORWARD: v4338/.test(same.refusal), "...and the refusal names the next number that would work",
       (same.refusal.match(/Supersede FORWARD: v\d+/) || [""])[0]);
}

// 1b) *** SAME NUMBER, SAME BYTES, IS NOT A COLLISION -- the false-fault this guard shipped with. ***
//     v4350 went to main and the next verify in the same tree was refused, because main carried v4350 for the
//     reason that THIS BUILD had just put it there. Rule 3 is about two builds with one number and DIFFERENT
//     bytes. Both directions are pinned here: identical passes, and one changed byte still refuses.
{
    const src = "const ENGINE_VERSION = \"v4350\";   // v4350 -- a round\n";
    const shipped = preflight("v4350", { ...SEALED, mainVersionOverride: "v4350", mainSourceOverride: src,
                                         mainOrdinalsOverride: ordinalsOf(chlogSpending("v4350")),
                                         localSourceOverride: src, skipFreshness: true });
    ok(shipped.ok === true && shipped.refusal === null,
       "*** shipping v4350 when main's v4350 IS this build, byte for byte, is permitted ***");
    ok(/byte for byte/.test(shipped.note || ""), "...and it says why rather than passing silently",
       (shipped.note || "").slice(0, 60));

    const drifted = preflight("v4350", { ...SEALED, mainVersionOverride: "v4350", mainSourceOverride: src + "// and one more line\n",
                                         mainOrdinalsOverride: ordinalsOf(chlogSpending("v4350")),
                                         localSourceOverride: src, skipFreshness: true });
    ok(drifted.ok === false && /THE SAME NUMBER/.test(drifted.refusal),
       "*** but ONE CHANGED BYTE under the same number is still refused -- the rule is bytes, not numbers ***");

    // and an unreadable pair falls back to refusing, because "cannot compare" is not "they match"
    const unknown = preflight("v4350", { ...SEALED, mainVersionOverride: "v4350", mainSourceOverride: null,
                                         mainOrdinalsOverride: ordinalsOf(chlogSpending("v4350")),
                                         localSourceOverride: null, skipFreshness: true });
    ok(unknown.ok === false, "if neither build can be read, the same number is refused rather than assumed equal");
}

// 2) THE FALSE-FAULT HALF. The next number, and any number beyond it, must pass -- including a big jump, which
//    this project does deliberately ("version numbers were jumped there for headroom" -- v3900).
{
    const vs = against("v4337");
    ok(vs("v4338").ok === true, "the NEXT number passes");
    ok(vs("v4400").ok === true, "*** and a deliberate jump for headroom passes -- this guards reuse, not tidiness ***");
    ok(vs("v9999").ok === true, "any number beyond main's passes");
}

// 3) AN UNREADABLE MAIN REPORTS AND STANDS ASIDE. A tree with no remote is a normal place to work, and a guard
//    that refuses to ship there would be the problem rather than the fix.
{
    const r = preflight("v4338", { mainVersionOverride: null, skipFreshness: true });
    ok(r.ok === true && r.refusal === null, "an unreadable main does not refuse the ship");
    ok(typeof r.note === "string" && /could not be read/.test(r.note),
       "...but it SAYS SO rather than passing silently", r.note ? r.note.slice(0, 60) : "(no note)");
    ok(r.mainVersion === null, "...and reports main's version as unknown rather than as a number");
}

// 4) A VERSION IT CANNOT PARSE IS REFUSED, not guessed at.
{
    for (const bad of ["4338", "v", "vNNNN", "", null, "v43a8"]) {
        const r = preflight(bad, { mainVersionOverride: "v4337", skipFreshness: true });
        ok(r.ok === false && /not a vNNNN version/.test(r.refusal), `"${bad}" is refused as unparseable`);
    }
    ok(versionNumber("v4338") === 4338 && versionNumber("4338") === null, "versionNumber parses vNNNN and only vNNNN");
}

// 5) *** THE FAULT THAT SHIPPED IN THE FIRST DRAFT: A BIG main.js MUST STILL BE READABLE. ***
//    Not asserted as "maxBuffer is set" -- that is the arrangement. Asserted as the behaviour: the real
//    origin/main is read, and whatever comes back is a version or a reason that is TRUE of this tree.
{
    const r = mainVersion();
    const localBig = fs.statSync(path.join(ENG, "main.js")).size;
    ok(localBig > 1024 * 1024, "this tree's main.js really is over the 1 MB default buffer -- the input reaches the branch",
       `${(localBig / 1048576).toFixed(1)} MB`);
    if (r.version) {
        ok(/^v\d+$/.test(r.version), "*** origin/main's version is READ, not defeated by its size ***", r.version);
    } else {
        // No origin/main here is legitimate; a BUFFER failure reported as a missing ref is not.
        ok(!/ENOBUFS|maxBuffer/i.test(r.reason), "*** a buffer failure is never reported as a missing ref ***", r.reason);
        // v4846 -- the absent wording is "not in this clone" now, decided by exit status (section 5d). The old
        // "not readable here" could never be produced in a branch clone, which is how this row went red on the rig.
        ok(/not in this clone|git could not be asked|no ENGINE_VERSION/.test(r.reason), "and the reason given is one that is true of this tree", r.reason);
    }
}

// 5b) *** v4667 -- THE SECOND NUMBER A ROUND WEARS, replayed on the collision this guard actually missed. ***
//     Everything above compares ENGINE_VERSION. On 2026-09-23 this branch ran the ritual to ship v4654 and
//     this file printed "OK: shipping v4654, origin/main carries v4649" -- while origin/main's CHANGELOG had
//     already given v4654 to a different round ("the species' clocks are integrals now"), along with v4650
//     and v4653. Main's marker had not moved since v4649 because that line ships rounds without bumping it,
//     so the two lines were never comparable by the number a BUILD wears. The guard was watching a number
//     that had stopped moving, which is the same defect as a count standing in for a property.
{
    // The real changelog head from origin/main at that merge, trimmed to the headings that decide it.
    const MAIN_AT_MERGE = [
        "# SweK_Engine -- changelog", "",
        "## v4660 -- the other four ignition figures, which really were four shapes", "",
        "## v4654 -- the species' clocks are integrals now: this port is correct where murmur is not", "",
        "## v4653 -- the RESPONDING lean: the wander acquires a heading, and stops scattering", "",
        "## v4650 -- the orb's clock was an integral that reached no shader", "",
        "## v4649 -- Three instruments were lying", "",
    ].join("\n");
    const ords = ordinalsOf(MAIN_AT_MERGE);
    const asShipped = (v) => preflight(v, {
        ...SEALED, mainVersionOverride: "v4649", mainOrdinalsOverride: ords,
        mainSourceOverride: `const ENGINE_VERSION = "v4649";   // the other line's build\n`,
        localSourceOverride: `const ENGINE_VERSION = "${v}";   // this branch's build\n`,
    });

    ok(ords.ordinals[0] === 4660 && ords.ordinals.includes(4654),
       "the fixture is the real thing: main's changelog spends v4660 while its marker reads v4649",
       JSON.stringify(ords.ordinals));

    // *** THE CONTROL THAT MATTERS: the marker check ALONE passes this, and it is wrong. ***
    const markerOnly = preflight("v4654", {
        ...SEALED, mainVersionOverride: "v4649", mainOrdinalsOverride: { ordinals: null, titles: null },
        mainSourceOverride: `const ENGINE_VERSION = "v4649";   // the other line's build\n`,
        localSourceOverride: `const ENGINE_VERSION = "v4654";   // this branch's build\n`,
    });
    ok(markerOnly.ok === true,
       "*** with the ordinals unread, v4654 against a main marked v4649 PASSES -- which is exactly what shipped ***",
       "this row is the bug, preserved. If it ever goes red the marker path has changed and the row below is no longer the fix");

    const r = asShipped("v4654");
    ok(r.ok === false && /already gave to a DIFFERENT round/.test(r.refusal || ""),
       "*** ...and with the ordinals read, the same call is REFUSED ***", (r.refusal || "").slice(0, 90));
    ok(/the species' clocks are integrals/.test(r.refusal || ""),
       "...and the refusal NAMES the round main already gave the number to, not merely that it is taken",
       "a refusal that says 'taken' sends the writer to git log; one that says WHAT took it does not");
    ok(/main's MARKER reads v4649/.test(r.refusal || "") && /11 ahead/.test(r.refusal || ""),
       "...and it says WHY the marker check could not see this: main's rounds run 11 ahead of its own marker");

    for (const v of ["v4650", "v4653"]) {
        ok(asShipped(v).ok === false, `the other genuine collision ${v} is refused too`);
    }

    // *** A GAP IS REFUSED AS WELL, AND THAT IS A DELIBERATE CHOICE RATHER THAN AN OVERSHOOT. *** v4651 and
    // v4652 were free on main -- nothing was wearing them. Shipping into them would leave this branch's
    // rounds interleaved below main's highest, and a peer comparing two round numbers could not tell which
    // came first. Monotonic ordering is the property; an empty seat below the top does not provide it.
    ok(asShipped("v4651").ok === false && /non-monotonic/.test(asShipped("v4651").refusal || ""),
       "*** an UNTAKEN number below main's highest is refused too, and the refusal says it is about ordering ***");
    // *** AND THIS ROW IS WHERE v4667'S BLANKET RENUMBER WENT WRONG, CAUGHT BY THE GATE. *** It asserted
    // "Supersede FORWARD: v4661" -- a number the FIXTURE COMPUTES from its own main at v4660 -- and the
    // rename that moved this branch's round labels v4661 -> v4663 rewrote it too, because a mechanical pass
    // over 95 files cannot tell a round's label from a number a test expects back. The gate went red on the
    // one place it mattered, which is the argument for the rename being mechanical AND the suite being run
    // after it rather than either alone.
    ok(/Supersede FORWARD: v4661/.test(asShipped("v4651").refusal || ""),
       "...naming v4661, which is the next free seat ON MAIN -- the only thing this fixture can see",
       "the branch went to v4663 instead, and NOT because of anything in this fixture: two pushed branches " +
       "had already spent v4661 and v4662, which main's changelog does not show. Section 5c is that half");

    // and the far side: the renumber itself passes, which is what makes this a rule rather than a wall
    ok(asShipped("v4663").ok === true && asShipped("v4667").ok === true,
       "*** and v4663/v4667 -- past everything main has spent -- are permitted ***");

    // SABOTAGE: a prose mention of a version is not a heading, and must not be read as one.
    const proseOnly = ordinalsOf("# changelog\n\n## v4400 -- a round\n\nbody naming v4999 and ## v4998 mid-line\n");
    ok(proseOnly.ordinals.length === 1 && proseOnly.ordinals[0] === 4400,
       "!! SABOTAGE: a version NAMED IN PROSE is not a number the changelog has spent",
       "these notes quote version numbers constantly -- this file's own prose names v4350, v4649 and v4654 -- " +
       "so a loose scan would read every citation as a claim on a seat and refuse every round. Only ^## spends one");

    // and an unreadable changelog stands aside rather than refusing, the same way an unreadable main does
    const noChlog = preflight("v4654", {
        ...SEALED, mainVersionOverride: "v4649",
        mainOrdinalsOverride: { ordinals: null, titles: null, reason: "not readable" },
        mainSourceOverride: `const ENGINE_VERSION = "v4649";\n`, localSourceOverride: `const ENGINE_VERSION = "v4654";\n`,
    });
    ok(noChlog.ok === true,
       "an unreadable changelog stands aside rather than refusing -- a tree with no main is a normal one to work in",
       "the failure this exists for is a changelog that IS readable and HAS spent the number");
}

// 5c) *** v4667 -- AND ASKING MAIN ALONE WAS STILL THE WRONG QUESTION, WITHIN THE HOUR. ***
//     5b's check shipped reading origin/main's changelog. It then passed v4661 for this branch while
//     origin/claude/v4661-complete-singles already carried a round of that number: the murmuration line
//     STAGES EACH ROUND ON ITS OWN BRANCH before main sees it, so main's highest is a LOWER BOUND on what
//     has been spent, not the high-water mark. Two wrong numbers in one round -- a marker that had stopped
//     moving, then a trunk that was only part of the answer -- and both were true statements about
//     something other than the question.
{
    const REFS = {
        "refs/remotes/origin/main": "## v4660 -- the other four ignition figures\n",
        "refs/remotes/origin/claude/v4661-complete-singles": "## v4661 -- the last nine complete sites, and there is no tenth rule\n## v4660 -- x\n",
        "refs/remotes/origin/claude/v4662-last-teleports": "## v4662 -- the last three places a signal multiplies elapsed time\n## v4661 -- y\n",
        "refs/remotes/origin/claude/code-review-nr3a0i": "## v4667 -- this branch's own newest round\n",
        "refs/remotes/origin/claude/no-changelog-here": null,
    };
    const opts = (v, extra = {}) => ({
        ...SEALED, mainVersionOverride: "v4649",
        mainOrdinalsOverride: ordinalsOf(REFS["refs/remotes/origin/main"]),
        refsOverride: Object.keys(REFS),
        readOverride: (r) => { const t = REFS[r]; if (t == null) throw new Error("no such path"); return t; },
        selfRef: "refs/remotes/origin/claude/code-review-nr3a0i",
        mainSourceOverride: `const ENGINE_VERSION = "v4649";\n`,
        localSourceOverride: `const ENGINE_VERSION = "${v}";\n`,
        ...extra,
    });

    const hw = highWater(opts("v4663"));
    ok(hw.top === 4662 && /v4662-last-teleports/.test(hw.where),
       "*** the high-water is 4662 on a BRANCH, while main is at 4660 -- the trunk is a lower bound ***",
       `${hw.top} on ${hw.where}`);
    ok(hw.unreadable.length === 1 && /no-changelog-here/.test(hw.unreadable[0]),
       "...and a ref whose changelog cannot be read is KEPT BY NAME, not silently dropped",
       "'I could not look' and 'nothing there' are different answers, and folding one into the other is how " +
       "a guard goes quiet exactly when it stops working");

    // the two that were actually passed and should not have been
    for (const v of ["v4661", "v4662"]) {
        const r = preflight(v, opts(v));
        ok(r.ok === false && /already spent on/.test(r.refusal || ""),
           `*** ${v} is REFUSED because a pushed branch holds it, though main does not ***`, (r.refusal || "").slice(0, 80));
        ok(/origin\/main is only at v4660/.test(r.refusal || ""),
           `...and ${v}'s refusal says WHY asking the trunk alone said it was fine`);
    }
    ok(/the last nine complete sites/.test(preflight("v4661", opts("v4661")).refusal || ""),
       "...and it names the round that ref gave the number to");

    // *** A BRANCH DOES NOT COLLIDE WITH ITSELF. *** The first version of highWater took no selfRef and
    // passed only because this branch's PUSHED state was a round behind its working tree; pushing the round
    // would have made the next run refuse it, naming this very branch. That is the v4350 false fault again.
    ok(preflight("v4667", opts("v4667")).ok === true,
       "*** shipping v4667 is permitted although THIS BRANCH's own ref already carries v4667 ***",
       "a guard that goes red the moment you do the thing it just approved teaches people to skip it");
    ok(preflight("v4667", opts("v4667", { selfRef: null })).ok === false,
       "!! SABOTAGE: with selfRef removed, the branch collides with ITSELF and v4667 is refused",
       "this is what the check did before the exclusion was made explicit -- it passed by accident, because " +
       "the push had not happened yet");

    // *** v4854 -- A BRANCH MERGED INTO THIS BUILD DOES NOT COLLIDE WITH IT. *** The other session's v4854 was merged here to
    // ship, and the check refused v4854 for a "different round" that was the very round being shipped.
    // SABOTAGED v4854: highWater without the merged skip -> 1 RED, the first row below, by name; restored, md5 verified.
    const both = ["refs/remotes/origin/claude/v4662-last-teleports", "refs/remotes/origin/claude/v4661-complete-singles"];
    ok(preflight("v4662", opts("v4662", { mergedRefs: both })).ok === true,
       "!! *** v4662 is permitted when the branch that spent it -- and every branch above it -- is already merged into this build ***",
       (preflight("v4662", opts("v4662", { mergedRefs: both })).refusal || "permitted").slice(0, 100));
    const one = preflight("v4661", opts("v4661", { mergedRefs: [both[0]] }));
    ok(one.ok === false && /the last nine complete sites/.test(one.refusal || "") && /v4661-complete-singles/.test(one.refusal || ""),
       "  ...and a branch NOT merged still holds its number: with only v4662's branch merged, v4661 is refused, naming the branch that spent it",
       (one.refusal || "").slice(0, 120));
    ok(highWater(opts("v4663", { mergedRefs: [] })).top === 4662 && highWater(opts("v4663")).merged.size === 0,
       "  ...and fixture refs are never asked of the real repository's ancestry: unless a fixture names them merged, none is -- the side that refuses");
    ok(preflight("v4663", opts("v4663")).ok === true && preflight("v4668", opts("v4668")).ok === true,
       "*** and v4663 -- the first seat above every ref -- is permitted, as is anything past it ***");

    // SABOTAGE: reading only main's changelog is exactly the bug, and it is pinned as a control.
    const trunkOnly = preflight("v4661", opts("v4661", { highWaterOverride: { top: null, where: null, titles: null, rows: [], unreadable: [] } }));
    ok(trunkOnly.ok === true,
       "!! *** SABOTAGE/CONTROL: with the ref sweep switched off, v4661 PASSES -- which is what shipped ***",
       "main's changelog tops out at v4660 and v4661 is above it, so the trunk-only reader had no complaint. " +
       "This row preserves the bug: if it ever goes red, the refusal above is no longer the thing catching it");

    ok(refOrdinals({ refsOverride: ["refs/remotes/origin/main"], readOverride: () => "no headings here at all\n" }).rows.length === 0,
       "a changelog with no headings yields no ordinals rather than a zero", "a zero would read as a spent seat");
}

// 5d) *** v4846 -- A BRANCH CLONE HAS NO origin/main, AND THE CLASSIFIER READ A MESSAGE git'S WORDS WERE NOT IN. ***
//     The readers decided "no such ref" by matching /unknown revision|does not exist|ambiguous argument/
//     against a message whose stderr had been IGNORED, and git's real sentence for the case is "fatal:
//     invalid object name 'origin/main'." anyway. On the rig, in a --depth 1 --branch clone, that came back as
//     "reading origin/main's main.js FAILED: Command failed: git show ..." and section 5 went red. Driven here
//     against REAL git rather than a stub, because the fault was in what git says and where it says it: a tiny
//     repository whose main carries WebGLEngine/main.js and docs/CHANGELOG.md, cloned the rig's way so the
//     clone holds origin/feature and nothing else, and the readers called through their run hook in it.
//     Measured end to end as well, once, outside this gate: in a --no-local --depth 1 --branch clone of this
//     repository the pre-fix files gave 55 pass / 1 FAIL (section 5, the rig's exact "Command failed" line),
//     and the fixed files gave all 67 pass, the command line printing the fetch it names.
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vpf-branchclone-"));
    // GIT_* stripped (a gate run from a hook inherits GIT_DIR and friends, which would aim every command below
    // at the real repository), discovery fenced at the temp root so "no repository" means none, and the C
    // locale so git's sentences are the English ones the rows read.
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/.test(k))),
                  GIT_CEILING_DIRECTORIES: path.dirname(tmp), LC_ALL: "C", LANGUAGE: "" };
    const git = (cwd, ...a) => execFileSync("git", a, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const who = ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false"];
    const src = path.join(tmp, "src"), clone = path.join(tmp, "clone");
    try {
        fs.mkdirSync(path.join(src, "WebGLEngine"), { recursive: true });
        fs.mkdirSync(path.join(src, "docs"));
        fs.writeFileSync(path.join(src, "WebGLEngine", "main.js"), "export const ENGINE_VERSION = \"v4321\";   // the fixture main's build\n");
        fs.writeFileSync(path.join(src, "docs", "CHANGELOG.md"), "# changelog\n\n## v4321 -- the fixture main's newest round\n");
        git(src, "init", "-q");
        git(src, "symbolic-ref", "HEAD", "refs/heads/main");          // not -b main: that needs git 2.28
        git(src, "add", "-A");
        git(src, ...who, "commit", "-q", "--no-verify", "-m", "main");
        git(src, "branch", "feature");
        // --no-local, because a clone from a plain path IGNORES --depth; this is the transport the rig's clone used
        git(tmp, "clone", "-q", "--no-local", "--depth", "1", "--single-branch", "--branch", "feature", src, clone);
        const run = gitRunner(clone, { env });

        const refs = git(clone, "for-each-ref", "--format=%(refname)", "refs/remotes").split(/\s+/).filter(Boolean);
        ok(refs.includes("refs/remotes/origin/feature") && !refs.includes("refs/remotes/origin/main"),
           "the fixture is the rig's shape: a --depth 1 --branch clone holds origin/feature and NO origin/main", refs.join(", "));

        const v = mainVersion({ run });
        // v4850: the sentence is ONE constant, ABSENT_REASON, and mainVersion hands back exactly it (definitionGates found it unnamed)
        // SABOTAGED v4850: mainVersion's absent branch returning its own copy of the sentence -> this row RED; restored.
        ok(v.reason === ABSENT_REASON && ABSENT_REASON.endsWith(FETCH_MAIN), "...and that reason is ABSENT_REASON itself, ending in the one fetch command", ABSENT_REASON);
        ok(v.version === null && v.absent === true && /origin\/main is not in this clone/.test(v.reason || "") && (v.reason || "").includes(FETCH_MAIN),
           "!! *** mainVersion in a branch clone says origin/main is NOT IN THIS CLONE and names the fetch -- not \"FAILED: Command failed\" ***",
           v.reason);
        const o = mainOrdinals({ run });
        ok(o.ordinals === null && o.absent === true && /origin\/main is not in this clone/.test(o.reason || "") && (o.reason || "").includes(FETCH_MAIN),
           "!! *** ...and mainOrdinals says the same, with the same command ***", o.reason);
        const f = refFreshness({ run });
        ok(f.known === false && f.cause === "absent" && /not in this clone/.test(f.note) && f.note.includes(FETCH_MAIN) && !/offline|could not be reached/.test(f.note),
           "!! *** refFreshness reports the missing LOCAL ref as that, with the fetch -- not as an offline remote ***", f.note);
        const pf = preflight("v4322", { ...SEALED, run });
        ok(pf.ok === true && (pf.note || "").includes(FETCH_MAIN),
           "...and the preflight's own note -- what `node tools/ship/versionPreflight.mjs` prints -- carries the command", (pf.note || "").slice(0, 120));

        // THE COMMAND THE REASON NAMES IS THE CURE, run exactly as written: "git" split off, the rest handed to git.
        git(clone, ...FETCH_MAIN.split(/\s+/).slice(1));
        const v2 = mainVersion({ run }), o2 = mainOrdinals({ run }), f2 = refFreshness({ run });
        ok(v2.version === "v4321" && v2.reason === null,
           "!! *** ...and after running exactly that command, the same call READS v4321 ***", v2.reason || v2.version);
        ok(o2.ordinals && o2.ordinals[0] === 4321 && o2.reason === null, "...and mainOrdinals reads the changelog's v4321", o2.reason || "");
        ok(f2.known === true && f2.stale === false, "...and refFreshness compares it with the remote and finds it current", f2.note);

        // A PRESENT ref whose read fails is git's sentence, never "absent". origin/main is pointed at a commit
        // of the empty tree, so the PATH is what is missing -- and git's words for that include "does not
        // exist", which the old regex would have read as a missing REF had stderr ever reached it. (The clone's
        // working copy is removed first: with the file on disk git says "exists on disk, but not in" instead,
        // measured, and that sentence would not exercise the misreading this row is here for.)
        const emptyTree = execFileSync("git", ["mktree"], { cwd: clone, env, input: "", encoding: "utf8" }).trim();
        git(clone, "update-ref", "refs/remotes/origin/main", git(clone, ...who, "commit-tree", emptyTree, "-m", "empty").trim());
        fs.rmSync(path.join(clone, "WebGLEngine", "main.js"));
        const v3 = mainVersion({ run });
        ok(v3.version === null && v3.absent === false && /^reading origin\/main's main\.js FAILED: fatal: path 'WebGLEngine\/main\.js' does not exist/i.test(v3.reason || "") &&
           !(v3.reason || "").includes(FETCH_MAIN),
           "!! *** a PRESENT origin/main whose read fails reports git's own stderr line -- not \"Command failed\", and not absence ***", v3.reason);

        // and the other half of refFreshness's split: the local ref is there, the remote is not
        git(clone, "remote", "set-url", "origin", path.join(tmp, "no-such-remote"));
        const f3 = refFreshness({ run });
        ok(f3.known === false && f3.cause === "unreachable" && /could not be reached/.test(f3.note) && /no-such-remote/.test(f3.note) && !/not in this clone/.test(f3.note),
           "!! *** an UNREACHABLE remote is reported as that, in git's words naming it -- not as a missing local ref ***", f3.note);

        // and a directory that is no repository at all: git dies with 128, which is not the probe's quiet 1
        const nr = mainVersion({ run: gitRunner(tmp, { env }) });
        ok(nr.absent === false && /git could not be asked/.test(nr.reason || "") && /not a git repository/i.test(nr.reason || "") && !(nr.reason || "").includes(FETCH_MAIN),
           "...and a directory that is NO repository is reported as that, never as a ref to go and fetch", nr.reason);
    } catch (e) {
        ok(false, "the branch-clone fixture could be built and driven", String((e && e.stderr) || (e && e.message) || e).split("\n")[0]);
    } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    }
}

// 5e) v4846 -- A STALE ref NAMES THE SAME CURE AS AN ABSENT ONE. In a --branch clone `git fetch origin main` moves FETCH_HEAD
//     only, so a note that said "BEHIND -- run: git fetch origin main" sent the reader to a command that leaves the ref behind.
{
    const run = (args) => args[0] === "rev-parse" ? "1111111111111111111111111111111111111111\n"
                        : args[0] === "ls-remote" ? "2222222222222222222222222222222222222222\trefs/heads/main\n" : "";
    const f = refFreshness({ run });
    ok(f.known === true && f.stale === true && /BEHIND/.test(f.note) && f.note.includes(FETCH_MAIN),
       "!! a BEHIND ref names the refspec fetch, the one that moves refs/remotes/origin/main in any clone", f.note);
}

// 6) IT IS WIRED INTO THE RITUAL, as a call rather than a mention.
{
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const v = fs.readFileSync(path.join(HERE, "verify.mjs"), "utf8");
    ok(/versionPreflight\.mjs"/.test(v) && /preflight\s*\(/.test(v),
       "*** verify.mjs CALLS the preflight -- otherwise the rule is written down twice and enforced zero times ***");
    // v4847 -- and SAYS what the preflight found: the rig's branch clone printed "main: unreadable" with the reason and the
    // cure held in pf.note, unprinted; and its stale-ref NOTE named the bare fetch that moves FETCH_HEAD only
    const row = v.slice(v.indexOf("preflight(version)"), v.indexOf("version preflight could not run"));
    ok(/behind the remote -- " \+ FETCH_MAIN/.test(row) && /pf\.note/.test(row) && !/git fetch origin main"/.test(row),
       "!! verify.mjs's preflight row prints the note when main is unreadable, and the refspec fetch when it is behind",
       /pf\.note/.test(row) ? (/FETCH_MAIN/.test(row) ? "" : "the stale NOTE names no FETCH_MAIN") : "pf.note is never printed");
}

// 7) v4864 -- EVERY BRANCH'S COPY IS ASKED WHETHER IT IS THE REMOTE'S, against real git. A remote with three branches is
//    cloned; then one branch moves on the remote and a fourth appears there. The clone's view is now what the session that
//    spent v4838 a second time was holding: a copy that predates a push, and a branch it never saw.
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vpf-branches-"));
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/.test(k))),
                  GIT_CEILING_DIRECTORIES: path.dirname(tmp), LC_ALL: "C", LANGUAGE: "" };
    const git = (cwd, ...a) => execFileSync("git", a, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const who = ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false"];
    const src = path.join(tmp, "src"), bare = path.join(tmp, "remote.git"), clone = path.join(tmp, "clone");
    try {
        fs.mkdirSync(path.join(src, "WebGLEngine"), { recursive: true }); fs.mkdirSync(path.join(src, "docs"));
        const put = (v, title) => {
            fs.writeFileSync(path.join(src, "WebGLEngine", "main.js"), `const ENGINE_VERSION = "${v}";   // fixture\n`);
            fs.writeFileSync(path.join(src, "docs", "CHANGELOG.md"), `# changelog\n\n## ${v} -- ${title}\n`);
            git(src, "add", "-A"); git(src, ...who, "commit", "-q", "--no-verify", "-m", v);
        };
        git(src, "init", "-q"); git(src, "symbolic-ref", "HEAD", "refs/heads/main");
        put("v4321", "main's round");
        git(src, "branch", "line-a"); git(src, "branch", "line-b");
        git(tmp, "clone", "-q", "--bare", src, bare);
        git(tmp, "clone", "-q", bare, clone);
        const run = gitRunner(clone, { env });
        const f0 = branchFreshness({ run });
        ok(f0.known === true && f0.stale.length === 0 && f0.unfetched.length === 0 && f0.remoteCount === 3,
           "CONTROL: a fresh clone's copies are the remote's -- current, nothing refused for its view", f0.note);
        // the remote moves: line-a gains a round, line-c appears; the clone fetches nothing
        git(src, "checkout", "-q", "line-a"); put("v4322", "line-a's round, pushed after the clone fetched");
        git(src, "checkout", "-q", "-b", "line-c"); put("v4323", "line-c's round, on a branch the clone never saw");
        git(src, "push", "-q", bare, "line-a", "line-c");
        const f1 = branchFreshness({ run });
        ok(f1.known && f1.stale.join() === "line-a" && f1.unfetched.join() === "line-c" && f1.note.includes(FETCH_ALL),
           "!! *** a branch that MOVED on the remote is named stale, one the clone NEVER FETCHED is named unfetched, and the cure is named ***",
           f1.note);
        const local = (v) => `const ENGINE_VERSION = "${v}";   // this branch's build\n`;
        const ask = (v, extra = {}) => preflight(v, { run, branchFreshnessOverride: f1, mainVersionOverride: "v4321",
            mainSourceOverride: local("v4321"), localSourceOverride: local(v), mainOrdinalsOverride: ordinalsOf("## v4321 -- main's round\n"),
            closingsOverride: null, ...extra });
        const r1 = ask("v4322");
        ok(r1.ok === false && r1.staleView === true && /line-a/.test(r1.refusal || "") && /line-c/.test(r1.refusal || "") && (r1.refusal || "").includes(FETCH_ALL),
           "!! *** the preflight REFUSES v4322 from the stale view -- the number line-a's push spent, invisible to this clone -- and names the fetch ***",
           (r1.refusal || "").slice(0, 200));
        // the cure, run exactly as written: "git" split off and the shell's quotes taken away, as a shell would
        git(clone, ...FETCH_ALL.split(/\s+/).slice(1).map((a) => a.replace(/^"(.*)"$/, "$1")));
        const f2 = branchFreshness({ run });
        ok(f2.known && !f2.stale.length && !f2.unfetched.length, "...and after exactly that command, every copy is the remote's", f2.note);
        const r2 = ask("v4322", { branchFreshnessOverride: f2 });
        ok(r2.ok === false && !r2.staleView && /v4323|v4322/.test(r2.refusal || "") && /line-/.test(r2.refusal || ""),
           "!! *** ...and the SAME question is now refused for the real reason: the fetched branches spent v4322 and v4323 ***",
           (r2.refusal || "").slice(0, 200));
        ok(ask("v4324", { branchFreshnessOverride: f2 }).ok === true, "CONTROL: past everything every branch spent, v4324 is free");
        // an unreachable remote stands aside, reported -- the guard must not become the reason nobody can ship offline
        git(clone, "remote", "set-url", "origin", path.join(tmp, "no-such-remote"));
        const f3 = branchFreshness({ run });
        ok(f3.known === false && f3.cause === "unreachable" && /no-such-remote/.test(f3.note) && ask("v4324", { branchFreshnessOverride: f3 }).ok === true,
           "...an UNREACHABLE remote is reported in git's words and refuses nothing", f3.note);
    } catch (e) {
        ok(false, "the branch-freshness fixture could be built and driven", String((e && e.stderr) || (e && e.message) || e).split("\n")[0]);
    } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    }
}

// 8) v4864 -- THE EXEMPTION THAT HID EVERY CANDIDATE NUMBER. A tree identical to main's build is exempt for main's OWN number
//    (v4350's follow-up commit). It was exempt for EVERY number: asked about v4864 from main's v4863 tree, the preflight said
//    OK while a branch carried v4864 -- and an un-bumped tree is exactly where a round asks before picking its number.
{
    const same = `const ENGINE_VERSION = "v4863";   // main's build, and this tree's\n`;
    const REFS = { "refs/remotes/origin/main": "## v4863 -- main's round\n",
                   "refs/remotes/origin/other-line": "## v4864 -- the other line's round, pushed, not on main\n## v4863 -- main's round\n" };
    const opts = { ...SEALED, mainVersionOverride: "v4863", mainSourceOverride: same, localSourceOverride: same,
                   mainOrdinalsOverride: ordinalsOf(REFS["refs/remotes/origin/main"]),
                   refsOverride: Object.keys(REFS), readOverride: (r) => REFS[r], selfRef: null, mergedRefs: [] };
    const r = preflight("v4864", opts);
    ok(r.ok === false && /other-line/.test(r.refusal || "") && /the other line's round/.test(r.refusal || ""),
       "!! *** asked about v4864 from a tree identical to main, the preflight REFUSES it and names the branch that spent it ***",
       r.refusal || "answered OK -- the un-bumped tree's blind spot");
    ok(preflight("v4863", opts).ok === true, "CONTROL: main's own number from main's own build is still the follow-up commit v4350 allowed");
    ok(preflight("v4865", opts).ok === true, "CONTROL: and past the branch, v4865 is free from the same tree");
}

// 9) v4864 -- THE LEDGER'S CLOSINGS, which merge without a text conflict and collide silently (since529-since532 at v4842).
{
    const ledger = (entries) => "export const SS = Object.freeze({\n" + entries.map(([k, at]) =>
        `    // a comment naming since999 and at: "a decoy"\n    ${k}: Object.freeze({\n        at: "${at}", swept: 0,\n    }),\n`).join("") + "});\n";
    const parsed = closingsOf(ledger([["since12", "v4001"], ["since13", "v4002"]]) + "\nconst x = { since14: 3 };\n");
    ok(parsed.size === 2 && parsed.get("since12") === "v4001" && parsed.get("since13") === "v4002" && !parsed.has("since999") && !parsed.has("since14"),
       "closingsOf reads each closing's key and its own `at` -- not a comment's, not a neighbour's, not a non-closing key",
       JSON.stringify([...parsed]));
    // a stub git: each ref's ledger is a blob, and only `merged-line` is an ancestor of HEAD
    const T = {
        main: ledger([["since40", "v4100"], ["since41", "v4101"]]),
        mine: ledger([["since40", "v4100"], ["since41", "v4101"], ["since42", "v4105 -- this branch"]]),
        rival: ledger([["since40", "v4100"], ["since41", "v4101"], ["since42", "v4104 -- another branch's round"], ["since43", "v4106"]]),
        merged: ledger([["since40", "v4100"], ["since41", "v4101"], ["since42", "v4099 -- already in this build"]]),
        same: ledger([["since40", "v4100"], ["since41", "v4101"], ["since42", "v4105 -- this branch"]]),
    };
    const REF = { "refs/remotes/origin/main": "main", "refs/remotes/origin/rival": "rival", "refs/remotes/origin/merged-line": "merged",
                  "refs/remotes/origin/my-pushed-copy": "same" };
    const stub = (refs) => (args) => {
        if (args[0] === "rev-parse") { const ref = args[3].split(":")[0]; if (!REF[ref] || !args[3].endsWith(LEDGER)) throw Object.assign(new Error("no"), { status: 1 }); return "blob-" + REF[ref] + "\n"; }
        if (args[0] === "cat-file") return T[args[2].replace("blob-", "")];
        if (args[0] === "for-each-ref") return refs.join("\n") + "\n";
        if (args[0] === "merge-base") { if (args[2] === "refs/remotes/origin/merged-line") return ""; throw Object.assign(new Error("not an ancestor"), { status: 1 }); }
        throw new Error("unexpected git " + args.join(" "));
    };
    const all = Object.keys(REF);
    const c = closingCensus({ run: stub(all), mineText: T.mine, self: "refs/remotes/origin/my-pushed-copy" });
    ok(c.collisions.length === 1 && c.collisions[0].key === "since42" && /rival/.test(c.collisions[0].ref) && /another branch/.test(c.collisions[0].theirs),
       "!! *** since42, added here, is a COLLISION with the unmerged branch that declares it for another round -- and only with that one ***",
       JSON.stringify(c.collisions));
    ok(c.next === 44 && /rival/.test(c.where), "...and the next free closing is one past every branch's: since44, the rival's since43 counted", `${c.next} (${c.where})`);
    const noRival = closingCensus({ run: stub(all.filter((r) => !/rival/.test(r))), mineText: T.mine, self: "refs/remotes/origin/my-pushed-copy" });
    ok(noRival.collisions.length === 0 && noRival.next === 43,
       "CONTROL: without the rival -- a MERGED branch's since42 and this branch's own pushed copy collide with nothing", JSON.stringify(noRival.collisions));
    const onMain = closingCensus({ run: stub(["refs/remotes/origin/main"]), mineText: ledger([["since40", "v4100"], ["since41", "v4999 -- rewritten here"]]), self: null });
    ok(onMain.collisions.length === 1 && onMain.collisions[0].key === "since41" && /origin\/main/.test(onMain.collisions[0].ref),
       "...and a key main itself declares for a different round is a collision with main", JSON.stringify(onMain.collisions));
    const r = preflight("v4106", { ...SEALED, mainVersionOverride: "v4100", mainSourceOverride: "a\n", localSourceOverride: "b\n",
                                    mainOrdinalsOverride: ordinalsOf("## v4100 -- main\n"), closingsOverride: c });
    ok(r.ok === false && /since42/.test(r.refusal || "") && /rival/.test(r.refusal || "") && /since44/.test(r.refusal || ""),
       "!! *** the preflight REFUSES the round while its closing collides, naming the key, the branch, and since44 to take ***", (r.refusal || "").slice(0, 200));
    ok(preflight("v4106", { ...SEALED, mainVersionOverride: "v4100", mainSourceOverride: "a\n", localSourceOverride: "b\n",
                            mainOrdinalsOverride: ordinalsOf("## v4100 -- main\n"), closingsOverride: noRival }).ok === true,
       "CONTROL: the same round with no collision ships");
}

// 9b) v4864 -- `--next`: one past EVERYTHING spent -- this tree's marker and changelog, main's marker and changelog, every
//     branch's changelog -- and one past every ledger closing. Each source is made the highest in turn, so none can be dropped silently.
{
    const base = { localSourceOverride: `const ENGINE_VERSION = "v4100";\n`, localChangelogOverride: "## v4100 -- here\n",
                   mainVersionOverride: "v4100", mainOrdinalsOverride: ordinalsOf("## v4100 -- main\n"),
                   refsOverride: ["refs/remotes/origin/line"], readOverride: () => "## v4100 -- a branch\n",
                   closingsOverride: { next: 556, top: 555, where: "refs/remotes/origin/line", unreadable: [] } };
    const cases = [
        ["this tree's marker", { localSourceOverride: `const ENGINE_VERSION = "v4110";\n` }, "v4111"],
        ["this tree's changelog", { localChangelogOverride: "## v4111 -- here\n" }, "v4112"],
        ["main's marker", { mainVersionOverride: "v4112" }, "v4113"],
        ["main's changelog, ahead of its marker", { mainOrdinalsOverride: ordinalsOf("## v4113 -- main\n") }, "v4114"],
        ["a branch's changelog", { readOverride: () => "## v4114 -- a branch's round\n" }, "v4115"],
    ];
    const got = cases.map(([what, o, want]) => { const n = nextFree({ ...base, ...o }); return { what, want, got: n.version, closing: n.closing }; });
    ok(got.every((g) => g.got === g.want) && got.every((g) => g.closing === "since556"),
       "!! *** nextFree names one past whichever source is highest -- tree marker, tree changelog, main marker, main changelog, a branch -- and the next closing ***",
       got.map((g) => `${g.what}: ${g.got}${g.got === g.want ? "" : " (want " + g.want + ")"}`).join("; "));
    const n = nextFree({ ...base, readOverride: () => "## v4114 -- a branch's round\n" });
    ok(n.versionWhere === "refs/remotes/origin/line" && n.closingWhere === "refs/remotes/origin/line", "...and says WHERE the highest number was spent", `${n.versionWhere} / ${n.closingWhere}`);
}

// 10) v4864 -- the CLI's option is read by cliArgs, so a typo is refused by name rather than read as a version
{
    const r = (() => { try { execFileSync(process.execPath, [path.join(ENG, "tools", "ship", "versionPreflight.mjs"), "--nxt"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); return { status: 0, err: "" }; }
                       catch (e) { return { status: e.status, err: String(e.stderr || "") }; } })();
    ok(r.status === 2 && /unknown option --nxt/.test(r.err) && /--next/.test(r.err), "!! `--nxt` is refused with exit 2 and the nearest option named, before any git is asked", r.err.split("\n")[0]);
}

if (fail) { console.error(`\nversionPreflight-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`versionPreflight-selfcheck: all ${pass} pass`);
