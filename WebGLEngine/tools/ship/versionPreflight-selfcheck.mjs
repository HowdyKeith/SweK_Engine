// WebGLEngine/tools/ship/versionPreflight-selfcheck.mjs — v4350
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
import { preflight, versionNumber, engineVersionOf, mainVersion, ENG } from "./versionPreflight.mjs";

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m + (d ? "   " + d : "")); } };
const against = (main) => (v) => preflight(v, { mainVersionOverride: main, skipFreshness: true });

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

// 6) IT IS WIRED INTO THE RITUAL, as a call rather than a mention.
{
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const v = fs.readFileSync(path.join(HERE, "verify.mjs"), "utf8");
    ok(/versionPreflight\.mjs"/.test(v) && /preflight\s*\(/.test(v),
       "*** verify.mjs CALLS the preflight -- otherwise the rule is written down twice and enforced zero times ***");
}

if (fail) { console.error(`\nversionPreflight-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`versionPreflight-selfcheck: all ${pass} pass`);
