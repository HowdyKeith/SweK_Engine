// ai-bridge/tools/kpop-handoff-selfcheck.mjs
//
// v3527 -- DRIVES EVERY BRANCH OF THE RESTART RULE, INCLUDING ALL FOUR WAYS IT SAYS NO.
//
// The listener has never been restarted by an auto-update, and the reason is structural rather than a bug:
// launcherName() starts THE ENGINE ONLY, and the two places that do start the listener are a double-click and
// a button. This grades the rule that decides whether the successor should start it, and the interesting half
// is the refusals -- "no" has FOUR different causes and a bare false would make "the user stopped it deliberately"
// indistinguishable from "the flag is three days old".
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const K = createRequire(import.meta.url)(path.join(HERE, "..", "kpopHandoff.js"));

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n) => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("kpop-handoff-selfcheck -- restart it only if the machine already had it\n");

// ---------------------------------------------------------------------------
console.log("1. THE ONE CASE THAT RESTARTS");
{
    const r = K.shouldRestart({ wasAlive: true, isAliveNow: false, flagAgeMs: 12000 });
    ok("!! was running, is not now, handoff was recent -> RESTART", r.restart === true, r.reason);
    report("WHY THAT IS THE WHOLE RULE",
        "AN UPDATE RESTORES STATE, IT DOES NOT CHOOSE IT. Every other branch below is a refusal, and each one " +
        "exists because the alternative would have the update decide what the machine should be doing.");
}

// ---------------------------------------------------------------------------
console.log("\n2. FOUR WAYS TO SAY NO, AND EACH CARRIES ITS OWN REASON");
{
    const cases = [
        ["no record at all", { wasAlive: null, isAliveNow: false, flagAgeMs: -1 }, /did not follow an auto-update/],
        ["it was NOT running before", { wasAlive: false, isAliveNow: false, flagAgeMs: 1000 }, /does not choose it/],
        ["it is already alive", { wasAlive: true, isAliveNow: true, flagAgeMs: 1000 }, /single-instance/],
        ["the record is stale", { wasAlive: true, isAliveNow: false, flagAgeMs: 3 * 24 * 3600 * 1000 }, /survives reboots/],
    ];
    for (const [label, args, why] of cases) {
        const r = K.shouldRestart(args);
        ok("refuses: " + label, r.restart === false && why.test(r.reason), r.reason);
    }
    const reasons = new Set(cases.map(([, a]) => K.shouldRestart(a).reason));
    ok("!! *** ALL FOUR REFUSALS ARE DISTINGUISHABLE ***", reasons.size === 4,
        "a bare `false` would make 'the user stopped it deliberately' read the same as 'the flag is three days " +
        "old', and those want opposite responses from whoever is reading the log");
}

// ---------------------------------------------------------------------------
console.log("\n3. THE STALENESS BOUND IS THE v3250 DEFECT, IN THE SAME DIRECTORY");
{
    const just = K.shouldRestart({ wasAlive: true, isAliveNow: false, flagAgeMs: K.MAX_AGE_MS - 1 });
    const over = K.shouldRestart({ wasAlive: true, isAliveNow: false, flagAgeMs: K.MAX_AGE_MS + 1 });
    ok("!! the boundary is measured from BOTH sides", just.restart === true && over.restart === false,
        (K.MAX_AGE_MS - 1) + "ms restarts, " + (K.MAX_AGE_MS + 1) + "ms refuses");
    ok("a negative age refuses rather than passing", K.shouldRestart({ wasAlive: true, isAliveNow: false, flagAgeMs: -5 }).restart === false,
        "*** A NEGATIVE AGE IS A CLOCK PROBLEM AND NOT AN AGE. v3457 hit this exact sign error: a comparison " +
        "testing only `age > limit` reads clock skew as very recent and acts on it, and LAN clock skew is " +
        "ordinary here. ***");
    report("WHY A BOUND AT ALL",
        "%TEMP% SURVIVES REBOOTS. v3250 found a superseded flag left by an unfinished handoff making EVERY " +
        "later launch claim the new build was already running -- on every version, because the flag is in " +
        "%TEMP% and not in the folder. THE AGE IS WHAT MATTERS AND mtime ALREADY CARRIES IT.");
}

// ---------------------------------------------------------------------------
console.log("\n4. THE RECORD ROUND-TRIPS, AND IT IS ONE-SHOT");
{
    K.clearHandoffRecord();
    const none = K.readHandoffRecord();
    ok("with no record, wasAlive reads null and NOT false", none.wasAlive === null,
        "*** null MEANS 'THIS BOOT DID NOT FOLLOW AN UPDATE' AND false MEANS 'THE LISTENER WAS OFF'. Collapsing " +
        "them would be the two-things-one-label defect, and the rule branches differently on each. ***");

    K.recordBeforeHandoff(true);
    const yes = K.readHandoffRecord();
    ok("a true record round-trips with an age", yes.wasAlive === true && yes.flagAgeMs >= 0, "age " + yes.flagAgeMs + "ms");
    K.recordBeforeHandoff(false);
    ok("and a false record round-trips as false", K.readHandoffRecord().wasAlive === false,
        "the OFF case is RECORDED rather than left absent -- an absent flag and a recorded 'it was off' are " +
        "different facts and only one of them says the update path ran");

    ok("!! clearing it makes the next boot see nothing", K.clearHandoffRecord() && K.readHandoffRecord().wasAlive === null,
        "ONE-SHOT: a record that survived would restart the listener again on the next ordinary boot, which is " +
        "the stale-flag defect arriving through the front door instead of through the clock");
}

// ---------------------------------------------------------------------------
console.log("\n5. THE LIVENESS SIGNAL IS THE SENTINEL THE ENGINE ALREADY USES");
{
    const src = fs.readFileSync(path.join(HERE, "..", "server.js"), "utf8");
    ok("server.js still decides liveness from the sentinel file", /Listener_Alive\.txt/.test(src) && /_kpopAlive/.test(src),
        "<tmp>/KPopListener/Listener_Alive.txt, freshened by the listener, alive if touched within 45s");
    // *** MY FIRST VERSION OF THIS CHECK MATCHED THE SOURCE FOR "Listener_Alive" AND FAILED ON ITS OWN HEADER,
    // WHICH EXPLAINS WHY THE SENTINEL IS NOT USED HERE. PROSE-AS-CODE, in the check asserting there is no
    // second copy -- and the tree's standing correction is not "use noComments", IT IS TO STOP MATCHING SOURCE
    // FOR A BEHAVIOUR I CAN DRIVE. So it is driven: flip ONLY isAliveNow and watch the answer flip, with no
    // filesystem in the call at all. A module that consulted a sentinel of its own could not do that. ***
    const args = { wasAlive: true, flagAgeMs: 1000 };
    const whenDead = K.shouldRestart({ ...args, isAliveNow: false });
    const whenAlive = K.shouldRestart({ ...args, isAliveNow: true });
    ok("!! liveness is an ARGUMENT, proven by driving it rather than by reading the source",
        whenDead.restart === true && whenAlive.restart === false,
        "*** the same call with only isAliveNow flipped returns the opposite decision, and NOTHING WAS ON DISK. " +
        "A second liveness test here would be a second declaration of what 'running' means -- the shape this " +
        "tree names more than any other -- and the two would drift the first time somebody moved the 45s window. ***");
    report("A PID WOULD HAVE BEEN THE WRONG SIGNAL",
        "a PID says A PROCESS EXISTS; the sentinel says THE LISTENER IS DOING ITS JOB. After a handoff those " +
        "are different questions, and only the second one is worth restarting on.");
}

// ---------------------------------------------------------------------------
console.log("\n6. BOTH ENDS ARE WIRED -- A DECISION NOBODY CALLS IS THE MODULE-WITH-NO-CALLER THIS PROJECT REFUSES");
{
    const sys = fs.readFileSync(path.join(HERE, "..", "sysadminBridge.js"), "utf8");
    const srv = fs.readFileSync(path.join(HERE, "..", "server.js"), "utf8");
    ok("!! the OLD server records the fact before it steps aside", /recordBeforeHandoff\(/.test(sys),
        "beside swek_superseded.flag, which is the last moment the answer is knowable");
    ok("!! the SUCCESSOR reads it, decides, and CONSUMES it",
        /readHandoffRecord\(/.test(srv) && /shouldRestart\(/.test(srv) && /clearHandoffRecord\(/.test(srv),
        "one-shot: a record that survived would restart the listener on the next ordinary boot");
    ok("!! and the restart goes through /kpop/launch rather than a second spawn",
        /\/kpop\/launch/.test(srv) && !/KPopListener\.ps1/.test(
            srv.slice(srv.indexOf("restarting after update") - 2000, srv.indexOf("restarting after update") + 2000)),
        "*** THAT ROUTE ALREADY OWNS single-instance handling, the engine select and the not-found refusal. A " +
        "second spawn here would be A SECOND DECLARATION OF HOW TO START THE LISTENER -- the shape this tree " +
        "names more than any other, and the one this round exists to avoid repeating. ***");
    ok("liveness is REGISTERED once, not threaded through updateCheck's two callers",
        /setKpopProbe\(/.test(sys) && /setKpopProbe\(/.test(srv),
        "updateCheck is called from the /sys/update/apply route AND the auto-check timer; passing the fact " +
        "through both would be two places to forget it");
}

// ---------------------------------------------------------------------------
report("WHAT THIS DOES NOT PROVE, STATED RATHER THAN IMPLIED",
    "*** THE SANDBOX HAS NO WINDOWS, NO POWERSHELL AND NO LISTENER. What is graded is THE RULE and the record " +
    "it reads; whether KPopListener.ps1 actually starts, and whether the .bat honours swek_silent.flag, are " +
    "facts about Keith's box. THE FIRST DOUBLE-CLICK IS HIS. ***");

console.log(`\nkpop-handoff-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
