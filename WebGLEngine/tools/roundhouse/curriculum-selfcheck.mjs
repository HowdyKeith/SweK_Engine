// WebGLEngine/tools/roundhouse/curriculum-selfcheck.mjs -- v3698
//
// Run: node tools/roundhouse/curriculum-selfcheck.mjs   (~0.3s)
//
// *** THE THING BEING CHECKED IS NOT WHETHER THE ADVICE IS GOOD. *** It is whether a file that generates work
// can also mark that work done, because THAT is the failure a curriculum invites and it is the reason this one
// was nearly not built. The checks below are, in order: it cannot write; it proposes nothing it cannot name a
// grader for; it does not report "nothing left" when a census merely failed to load; and its proposals are
// DERIVED -- change the register and the advice changes.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { propose, reportLines, KINDS, graderExists, ENG } from "./curriculum.mjs";
import { codeOnly } from "../ship/sourceScan.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (l) => console.log("  ----  " + l);
const SELF = path.join(ENG, "tools", "roundhouse", "curriculum.mjs");

console.log("curriculum-selfcheck -- can the thing that proposes work also pass it?\n");

// ---- 1. IT CANNOT WRITE. THIS IS THE SAFETY PROPERTY AND IT IS ASSERTED BY MECHANISM. -------------------------
{
    const src = codeOnly(fs.readFileSync(SELF, "utf8"));
    const writes = /writeFileSync|appendFileSync|createWriteStream|rmSync|unlinkSync|mkdirSync/.test(src);
    ok("!! *** the curriculum has NO WRITE PATH AT ALL ***", !writes,
        "checked through codeOnly, so the PROSE above describing what it must not do cannot satisfy the check " +
        "(this file's own subject is a loop that marks its own work done, and counting a comment as code would " +
        "be that failure arriving in the guard). A proposer that can touch a baseline, a coverage register or a " +
        "freeze file can CLOSE ITS OWN TASKS, and no amount of good ranking makes that safe.");

    const env = /process\.env\.SWEK_FREEZE/.test(src);
    ok("...and it reaches for no freeze switch", !env,
        "SWEK_FREEZE_* re-baselines a register. A curriculum holding that lever could retire the very frontier " +
        "it is supposed to be reporting");
}

// ---- 2. EVERY PROPOSAL NAMES A GRADER THAT EXISTS ---------------------------------------------------------------
{
    const r = await propose();
    ok("!! every proposal carries a grader, and every grader is ON DISK",
        r.proposals.length > 0 && r.proposals.every((p) => p.grader && fs.existsSync(path.join(ENG, p.grader))),
        r.proposals.length + " proposals across " + new Set(r.proposals.map((p) => p.kind)).size + " kinds. " +
        "A TASK WHOSE CHECKER DOES NOT EXIST IS NOT A TASK, IT IS A WISH -- and the whole point of proposing " +
        "from a census is that something other than the proposer decides when it is finished.");

    ok("...and every subject came out of a register rather than out of this file",
        r.proposals.every((p) => typeof p.subject === "string" && p.subject.length > 0 &&
                                 !codeOnly(fs.readFileSync(SELF, "utf8")).includes('"' + p.subject + '"')),
        "no proposed subject appears as a string literal in curriculum.mjs. If it did, the curriculum would be " +
        "reading back a list somebody typed there -- a to-do note wearing a measurement's clothes");
    say("kinds known: " + KINDS.map((k) => k.kind).join(", ") +
        "   graders present: " + KINDS.filter(graderExists).length + " of " + KINDS.length);
}

// ---- 3. *** AN UNREADABLE CENSUS IS NOT AN EMPTY FRONTIER. *** --------------------------------------------------
{
    // The three states are separate on purpose. A curriculum that answered "nothing to do" when a census simply
    // failed to load would be the most expensive possible lie: it looks like completion.
    const r = await propose();
    ok("!! *** the report separates PROPOSED from UNGRADABLE from UNMEASURED ***",
        Array.isArray(r.proposals) && Array.isArray(r.ungradable) && Array.isArray(r.unmeasured),
        "proposals " + r.proposals.length + ", ungradable " + r.ungradable.length + ", unmeasured " +
        r.unmeasured.length + ". 'I could not measure' and 'there is nothing left' ARE DIFFERENT FINDINGS, and " +
        "a bare list cannot tell them apart -- UNKNOWN IS NOT ABSENT, in the file most tempted to collapse it.");

    const L = await reportLines();
    ok("...and an empty proposal list says so out loud instead of reading as 'done'",
        L.some((x) => /A PROPOSAL IS NOT A CLAIM OF VALUE/.test(x)) &&
        /nothing proposable|PLANT|GRADE|DOOR/.test(L.join("\n")),
        "the report ends by saying what it is NOT claiming, on every run, because a ranked list is read as a " +
        "recommendation whatever the header says");
}

// ---- 4. THE ADVICE IS DERIVED: IT NAMES ONLY WHAT THE REGISTER CONTAINS -------------------------------------
{
    // Checked against gradedCoverage rather than orphanTriage: the latter WALKS THE WHOLE TREE AND TAKES OVER
    // 285 SECONDS, which is exactly why the `door` kind is opt-in and why this gate would otherwise time out.
    // A CHECK THAT CANNOT FINISH IS NOT A CHECK.
    const G = await import("./gradedCoverage.mjs");
    const c = G.gradedCoverage(ENG);
    const ungraded = new Set((c.ungraded || []).map((x) => (typeof x === "string" ? x : x.file || x.name)));
    const r = await propose({ perKind: 500 });
    const grades = r.proposals.filter((p) => p.kind === "grade").map((p) => p.subject);
    ok("!! *** every GRADE proposal is a member of the register, none invented ***",
        grades.length > 0 && grades.every((g) => ungraded.has(g)),
        grades.length + " grade proposals, all present in gradedCoverage's ungraded set (" + ungraded.size +
        " members). THIS IS THE DERIVATION CHECK: if the curriculum ever names a subject the register does not " +
        "contain, it has begun writing its own homework.");

    ok("...and the display cap hides none of the size",
        (await propose({ perKind: 3 })).proposals.filter((p) => p.kind === "grade").length === 3 && grades.length > 3,
        "3 shown of " + grades.length + " -- the cap is a DISPLAY choice, the full count is one argument away, " +
        "which is the opposite of a ratchet quietly reporting a smaller number");

    const withSlow = await propose({ perKind: 1, slow: false });
    ok("!! a SLOW census is SKIPPED BY NAME, never silently dropped",
        withSlow.skipped.length === 1 && /285s|SLOW/.test(withSlow.skipped[0].why || ""),
        JSON.stringify(withSlow.skipped.map((x) => x.kind)) + ". Its census walks the whole tree; the default " +
        "run is 0.31s without it (v3853 -- MEASURED; IT SAID 96 SECONDS HERE UNTIL THEN AND THAT NUMBER WAS A " +
        "DEFECT BEING QUOTED AS A COST: plantCandidates feature-tested `P.declaredPlants`, a name that has " +
        "never existed, and the else branch ran the FULL SWEEP every time) and TIMED OUT AT 290 WITH IT. " +
        "A CURRICULUM NOBODY RUNS PROPOSES NOTHING -- but a kind that vanished quietly would read as a " +
        "frontier with nothing on it.");
}

// ---- 5. THE RUN IS VISIBLE TO THE FLEET, AND THE PROPOSER STILL CANNOT PUBLISH IT ITSELF -------------------
{
    const { activityOf, ACTIVITY } = await import("./activity.mjs");
    const ticks = [];
    globalThis.__swekActiveRun = { id: "t", device: "curriculum", round: 0, maxRounds: null, startedAt: Date.now() };
    try {
        await propose({ perKind: 1, onPhase: (p) => {
            globalThis.__swekActiveRun.round = p.done; globalThis.__swekActiveRun.maxRounds = p.total;
            ticks.push(p.done + "/" + p.total);
        } });
    } finally { globalThis.__swekActiveRun = null; }

    ok("!! the run TICKS a phase count the fleet already knows how to read",
        ticks.length >= 2 && /^\d+\/\d+$/.test(ticks[0]) && ticks[ticks.length - 1].split("/")[0] === ticks[ticks.length - 1].split("/")[1],
        ticks.join(" ") + ". activity.mjs has carried round/maxRounds since v3018 and fingerprintBridge already " +
        "publishes activityOf(globalThis.__swekActiveRun) -- SO THIS NEEDED NO NEW CHANNEL, only a run that sets " +
        "the marker. Building a second activity feed would have been the defect this tree names most often.");

    ok("!! *** the phase count is the FINEST TRUE PROGRESS, and there is no seconds timer ***",
        ticks.every((t) => /^\d+\/\d+$/.test(t)),
        "each census is ONE OPAQUE CALL that returns when it returns, so '2 of 3' is all that is honestly " +
        "available. A SECONDS BAR WOULD BE A DRAWING: whatever THIS sandbox measured on one core, a countdown " +
        "hard-coded from it would be wrong on every other box -- a number that looks like a measurement " +
        "and is a memory of somebody else's machine. *** AND v3853 IS THE STRONGER VERSION OF THAT " +
        "ARGUMENT THAN THE ONE ORIGINALLY WRITTEN HERE: the 96s this line quoted was not a cost at all, " +
        "it was plantCandidates silently running the full sweep because its feature test named nothing. " +
        "A HARD-CODED DURATION WOULD HAVE OUTLIVED THE BUG IT WAS MEASURING and gone on drawing a bar " +
        "for work that now takes a third of a second. ***");

    ok("!! ...and the marker is CLEARED, so a finished run does not read as running",
        activityOf(globalThis.__swekActiveRun || null).state === ACTIVITY.IDLE,
        "the route clears it in a finally. Without that a thrown run reads RUNNING until activity.mjs ages it " +
        "out at fifteen minutes -- UNATTENDED doing its job, but still a lie for fifteen minutes.");

    const srv = codeOnly(fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8"));
    // *** THIS LINE EXISTS BECAUSE A PLANT DID NOT FIRE. *** The check above drives the marker itself, so it
    // proves the PATTERN clears -- and a route that forgot its `finally` would sail past it. Deleting the
    // route's clear is exactly the failure that leaves a whole fleet reading RUNNING on a box that finished
    // fifteen minutes ago, so the route's own source is asserted too.
    ok("!! ...and the ROUTE clears it in a `finally`, not merely on the happy path",
        /finally\s*\{[^}]*__swekActiveRun\s*=\s*null/.test(srv),
        "checked in the route's source, because the driven check above cannot see a clear that the route " +
        "never performs -- A PLANT THAT DOES NOT FIRE IS A FINDING, and this is the fifth time this session.");
    ok("!! the ROUTE owns the marker, not the curriculum",
        /__swekActiveRun/.test(srv) && !/__swekActiveRun/.test(codeOnly(fs.readFileSync(SELF, "utf8"))),
        "a proposer that publishes its own progress is a proposer with state somebody can reach, and the whole " +
        "safety property above is that it has none. IT CALLS BACK; THE CALLER DECIDES WHAT THAT MEANS.");
}

if (fails) { console.log("\ncurriculum-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("\ncurriculum-selfcheck: all checks pass");
