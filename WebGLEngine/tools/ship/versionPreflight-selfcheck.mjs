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
//
// Run: node tools/ship/versionPreflight-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preflight, versionNumber, engineVersionOf, mainVersion, ordinalsOf, mainOrdinals, ENG } from "./versionPreflight.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m + (d ? "   " + d : "")); } };
// A collision is TWO BUILDS wearing one number, so the stub supplies two DIFFERENT sources. Leaving them to
// fall through to the real files would compare this tree with itself, find them identical, and turn every
// historical collision below into a pass -- the check would then be measuring the working tree rather than the
// rule. (That is exactly what happened when the byte comparison was added: five of these went green at once.)
// *** v4665 -- AND THE ORDINALS MUST BE INJECTED FOR THE REASON THE PARAGRAPH ABOVE ALREADY GIVES. *** The
// ordinal check added this round reads origin/main's CHANGELOG, and these fixtures did not override it -- so
// three of them were graded against the live repo the moment it existed, and "the headroom jump this round
// actually took is permitted" went red because the real main had spent v4660. A fixture that reaches the
// tree it is replaying history against is not a fixture; it is the working tree wearing one. Every helper
// here now supplies a changelog whose newest heading is the main it is replaying.
const chlogSpending = (main) => `# changelog\n\n## ${main} -- the other line's newest round\n\nbody\n`;
const against = (main) => (v) => preflight(v, {
    mainVersionOverride: main, skipFreshness: true,
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
    const shipped = preflight("v4350", { mainVersionOverride: "v4350", mainSourceOverride: src,
                                         mainOrdinalsOverride: ordinalsOf(chlogSpending("v4350")),
                                         localSourceOverride: src, skipFreshness: true });
    ok(shipped.ok === true && shipped.refusal === null,
       "*** shipping v4350 when main's v4350 IS this build, byte for byte, is permitted ***");
    ok(/byte for byte/.test(shipped.note || ""), "...and it says why rather than passing silently",
       (shipped.note || "").slice(0, 60));

    const drifted = preflight("v4350", { mainVersionOverride: "v4350", mainSourceOverride: src + "// and one more line\n",
                                         mainOrdinalsOverride: ordinalsOf(chlogSpending("v4350")),
                                         localSourceOverride: src, skipFreshness: true });
    ok(drifted.ok === false && /THE SAME NUMBER/.test(drifted.refusal),
       "*** but ONE CHANGED BYTE under the same number is still refused -- the rule is bytes, not numbers ***");

    // and an unreadable pair falls back to refusing, because "cannot compare" is not "they match"
    const unknown = preflight("v4350", { mainVersionOverride: "v4350", mainSourceOverride: null,
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
        ok(/not readable here|no ENGINE_VERSION/.test(r.reason), "and the reason given is one that is true of this tree", r.reason);
    }
}

// 5b) *** v4665 -- THE SECOND NUMBER A ROUND WEARS, replayed on the collision this guard actually missed. ***
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
        mainVersionOverride: "v4649", skipFreshness: true, mainOrdinalsOverride: ords,
        mainSourceOverride: `const ENGINE_VERSION = "v4649";   // the other line's build\n`,
        localSourceOverride: `const ENGINE_VERSION = "${v}";   // this branch's build\n`,
    });

    ok(ords.ordinals[0] === 4660 && ords.ordinals.includes(4654),
       "the fixture is the real thing: main's changelog spends v4660 while its marker reads v4649",
       JSON.stringify(ords.ordinals));

    // *** THE CONTROL THAT MATTERS: the marker check ALONE passes this, and it is wrong. ***
    const markerOnly = preflight("v4654", {
        mainVersionOverride: "v4649", skipFreshness: true, mainOrdinalsOverride: { ordinals: null, titles: null },
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
    ok(/Supersede FORWARD: v4661/.test(asShipped("v4651").refusal || ""),
       "...naming v4661, which is the number this branch actually renumbered to");

    // and the far side: the renumber itself passes, which is what makes this a rule rather than a wall
    ok(asShipped("v4661").ok === true && asShipped("v4665").ok === true,
       "*** and v4661/v4665 -- past everything main has spent -- are permitted ***");

    // SABOTAGE: a prose mention of a version is not a heading, and must not be read as one.
    const proseOnly = ordinalsOf("# changelog\n\n## v4400 -- a round\n\nbody naming v4999 and ## v4998 mid-line\n");
    ok(proseOnly.ordinals.length === 1 && proseOnly.ordinals[0] === 4400,
       "!! SABOTAGE: a version NAMED IN PROSE is not a number the changelog has spent",
       "these notes quote version numbers constantly -- this file's own prose names v4350, v4649 and v4654 -- " +
       "so a loose scan would read every citation as a claim on a seat and refuse every round. Only ^## spends one");

    // and an unreadable changelog stands aside rather than refusing, the same way an unreadable main does
    const noChlog = preflight("v4654", {
        mainVersionOverride: "v4649", skipFreshness: true,
        mainOrdinalsOverride: { ordinals: null, titles: null, reason: "not readable" },
        mainSourceOverride: `const ENGINE_VERSION = "v4649";\n`, localSourceOverride: `const ENGINE_VERSION = "v4654";\n`,
    });
    ok(noChlog.ok === true,
       "an unreadable changelog stands aside rather than refusing -- a tree with no main is a normal one to work in",
       "the failure this exists for is a changelog that IS readable and HAS spent the number");
}

// 6) IT IS WIRED INTO THE RITUAL, as a call rather than a mention.
{
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const v = fs.readFileSync(path.join(HERE, "verify.mjs"), "utf8");
    ok(/versionPreflight\.mjs"/.test(v) && /preflight\s*\(/.test(v),
       "*** verify.mjs CALLS the preflight -- otherwise the rule is written down twice and enforced zero times ***");
}

if (fail) { console.error(`\nversionPreflight-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`versionPreflight-selfcheck: all ${pass} pass`);
