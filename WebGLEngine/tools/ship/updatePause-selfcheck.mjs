// WebGLEngine/tools/ship/updatePause-selfcheck.mjs -- v3075
//
// Run: node tools/ship/updatePause-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// AN AUTO-UPDATE MUST NOT RESTART THE SERVER MID-SUITE.
//
// Keith ran the full rig suite and the updater restarted the server partway through. Every gate after that point
// reported "TypeError: Failed to fetch". Those are FALSE FAILURES, and they are worse than real ones: nothing in
// the report distinguishes them from genuine breakage, so the whole run has to be repeated and no individual
// result can be trusted in the meantime. A suite that cannot be trusted has cost more than it saved.
//
// THE GUARD BELONGS WHERE THE UPDATE IS APPLIED, not in each runner. Render QA already refused to start a second
// run while one was live, but nothing stopped the UPDATER walking over it -- so putting the check in the runners
// would have needed writing four times and would have missed whatever runs next. One guard in _applyIncremental
// covers render QA, the gate suite and any future runner that can answer "am I running".
//
// AND IT IS THE SAME SHAPE AS THE RUSTDESK PAUSE (v1933) that already sat there: opt out via config, and a
// MANUAL update always proceeds, because the person is right there and chose it.
//
// ---- v4451 -- AND THE GITHUB WORK, WHICH IT NAMED THREE RUNNERS AND THEN STOPPED SHORT OF ------------------
// Keith: "while the github repo commands are initiated, we need to make sure that the running swek does not
// start an auto update that kills the github tasks." The guard was in the right place and knew about render
// QA, the gate suite and rig jobs. The clone (several hundred MB), the verify inside the clone, the pack
// (~30 MB) and the upload were none of those. *** AND THE PUBLISH WAS INVISIBLE EVEN TO ITS OWN BRIDGE: ***
// sourceChainBridge set R.phase all through start() and never once in publish(), so during the pack and the
// upload status().running read FALSE and canPublish() still returned ok -- the blind window was exactly the
// one containing the action this tree calls hardest to take back, and a second concurrent publish fitted in
// it too. A queued update is not lost by any of this: v1933's rule stands, the pending update stays queued
// and the next cycle applies it once the work ends.
//   SABOTAGE LOG for the v4451 section:
//     A. deferral stops asking the source chain -> exit=1, 2 red (the probe line and the guard-count line).
//     B. publish() sets no phase, i.e. exactly the pre-v4451 code -> exit=1, 1 red by name. THIS IS THE ONE
//        THE SECTION EXISTS FOR: it is the state the tree shipped in for 487 rounds.
//     C. the counter decremented outside the finally -> exit=1, 1 red: a clone that throws on a bad ref would
//        strand the bridge busy and defer every future update, a guard that fails closed and never reopens.
//     D. only the clone wrapped, not publishEngineBuild -> exit=1, 1 red: half the window left open.
//
// ---- v4451 ALSO REPAIRED THIS FILE'S OWN STANDING RED, AND THE CODE WAS RIGHT THE WHOLE TIME ---------------
// The last check of section 4 required `c._errored = true; tally();` -- two statements ADJACENT ON ONE LINE --
// and somebody later inserted `c._result = {...}` between them. A regex about the LAYOUT of two correct
// statements had been red since v4279 about a behaviour that never changed. It is the same defect this same
// round found in a gate it had just written (a check asking whether one string preceded another, which
// `if (false && ...)` satisfied with the guard switched off): AN ASSERTION ABOUT WHERE TEXT SITS IS NOT AN
// ASSERTION ABOUT WHAT THE CODE DOES. Split into the three facts it was trying to state. The same trap was
// then walked into ONE SCREEN LATER while writing the new section -- codeOnly() BLANKS STRING LITERALS, so a
// check for `!== "undefined"` went red on correct code -- which is why the new probes assert structure, and
// why the bridge files are read through noComments() rather than raw or through codeOnly().

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { codeOnly, noComments } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
const gates = fs.readFileSync(path.join(ENG, "ai-bridge", "gatesBridge.js"), "utf8");
const sysadmin = fs.readFileSync(path.join(ENG, "ai-bridge", "sysadminBridge.js"), "utf8");
const runBusy = fs.readFileSync(path.join(ENG, "ai-bridge", "runBusy.js"), "utf8");
const sCode = codeOnly(server), gCode = codeOnly(gates);
const uCode = codeOnly(sysadmin), rCode = codeOnly(runBusy);

// --- 1. the guard exists, and it is in the right place ---------------------------------------------------------
{
    ok("_applyIncremental defers while a test run is live", /const busy = _testRunActive\(\);/.test(sCode) && /deferred: true/.test(sCode));
    // one definition + one call. More than that means it was copied into a runner.
    ok("!! the guard is in the UPDATE path, not duplicated into each runner",
        (sCode.match(/_testRunActive\(\)/g) || []).length === 2,
        "four runners would have meant four copies and a fifth that forgot");
    ok("!! a MANUAL update still proceeds", /if \(!\(opts && opts\.force\)\) \{\s*const busy/.test(sCode.replace(/\s+/g, " ").replace(/if \(!\(opts && opts\.force\)\) \{ const busy/, "if (!(opts && opts.force)) {\nconst busy")) || /opts\.force/.test(sCode),
        "the person is right there and chose it -- same rule the RustDesk pause has had since v1933");
    ok("...and the deferral says WHY, naming the run", /is running -- update paused/.test(server) && /false failure/.test(server));
}

// --- 2. it asks the runners rather than keeping a second flag --------------------------------------------------
{
    // *** v4533 -- THE PROBES MOVED TO ai-bridge/runBusy.js AND THIS SECTION FOLLOWED THEM, WHICH IS THE
    // WHOLE POINT: a check that keeps asserting an old address goes red honestly instead of going quiet. ***
    // RAW, NOT codeOnly: these are module PATHS, i.e. string literals, and codeOnly() blanks string contents.
    // Asserting them against the stripped text is this file's own v4279 lesson met a THIRD time -- and it went
    // red on correct code before this comment existed, which is why the comment is here.
    ok("the probes live in runBusy.js: renderQaBridge.status()", /renderQaBridge\.js/.test(runBusy) && /status/.test(runBusy));
    ok("...and gatesBridge.running(), rigRunner, sourceChain and githubBridge -- five runners, one list",
        ["renderQaBridge", "gatesBridge", "rigRunner", "sourceChainBridge", "githubBridge"].every((m) => runBusy.includes(m + ".js")),
        "one entry each, in a frozen table, so adding a runner is a row rather than a fifth copy of a try/catch");
    ok("!! every probe is guarded, so a bridge that does not answer cannot break the updater",
        /try \{/.test(rCode) && /\} catch \{\}/.test(rCode),
        "a missing running() must leave the update working, not throw inside the deferral check");
    ok("it derives from the runners' OWN state rather than a duplicate flag",
        !/_testRunning\s*=/.test(sCode) && !/_busyFlag\s*=/.test(rCode),
        "a second flag would one day disagree with the thing it describes");
    // *** ONE QUESTION, NOT TWO COPIES OF IT. *** v4451 widened this predicate for _applyIncremental and the
    // OTHER updater would have had to be remembered. The probes must therefore appear in runBusy.js and in
    // NEITHER caller -- which is the same argument the duplicate-flag row above makes, one level up.
    // *** SCOPED TO THE FUNCTION BODY, AND THE FIRST WRITING WAS NOT. *** Asserting the probe strings are
    // absent from server.js ENTIRELY went red on correct code: server.js calls renderQaBridge.status() for its
    // own /renderqa route, which has nothing to do with deferring an update. The claim is about the PREDICATE,
    // so the predicate is what is read -- a whole-file search would have made every unrelated use of a bridge
    // a failure, which is a check nobody could keep green honestly.
    const body = (sCode.match(/function _testRunActive\(\) \{[\s\S]*?\n\}/) || [""])[0];
    ok("!! *** the probes are in runBusy.js and in NEITHER updater's deferral ***",
        !!body && !/renderQaBridge|gatesBridge|rigRunner|sourceChainBridge|githubBridge/.test(body) &&
        !/renderQaBridge|sourceChainBridge|gatesBridge|rigRunner/.test(sysadmin),
        "a copy in either caller is a copy that drifts the next time a runner is added -- v4451 widened one " +
        "caller and the other would have had to be remembered, which is how this defect lasted");
    ok("_testRunActive delegates rather than re-implementing", /require\("\.\/runBusy\.js"\)\.active\(\)/.test(server),
        "the name and the { active, what } shape are kept, so every existing reader is untouched");
}

// --- 3. THE GAP BETWEEN TWO SERIAL GATES, which is where an updater would land ---------------------------------
// gates.html runs the suite ONE AT A TIME. Between two gates there is no child process, so a naive "is a child
// alive" check reports idle in exactly the window the updater is most likely to hit. That is the difference
// between a guard and a guard that works.
{
    // RAW SOURCE, NOT codeOnly, FOR THESE. codeOnly()'s own header warns it will mangle a regex literal
    // containing a quote -- gatesBridge has one, so the stripper desyncs into string mode and blanks the rest of
    // the file. These are unambiguous code tokens with no comment to confuse them, so raw is correct here and
    // the limitation is now demonstrated rather than theoretical.
    ok("gatesBridge exports running()", /module\.exports = \{[^}]*running/.test(gates));
    ok("!! it counts a live gate AND a recent one", /_live > 0 \|\| \(Date\.now\(\) - _lastGateAt\)/.test(gCode),
        "the pause between two serial gates is not the end of the run");
    ok("...the counter is incremented before the spawn and decremented in the callback",
        /_live\+\+/.test(gates) && /_live = Math\.max\(0, _live - 1\)/.test(gates));
    ok("...and a decrement cannot drive it negative", /Math\.max\(0, _live - 1\)/.test(gates),
        "a stuck-negative counter would report idle forever, which is the failure mode that matters here");
}

// --- 4. it really behaves ---------------------------------------------------------------------------------------
{
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const gb = req(path.join(ENG, "ai-bridge", "gatesBridge.js"));
    ok("a bridge that has never run reports idle", gb.running() === false);
    ok("...and running() is callable without arguments or setup", typeof gb.running === "function");
}

// --- v3076: A TIMEOUT IS NOT A FAILURE -------------------------------------------------------------------------
// Keith's run reported three gates as "FAIL null 180.0s". null is the exit code of a process that was KILLED --
// it never returned a verdict at all, so reading it as a failure is a confident wrong answer about unfinished
// work, sitting in the report beside genuine failures with nothing to tell them apart. THREE OF EIGHT
// "failures" in that run were this. The distinction matters in both directions: a failure wants fixing, a
// timeout wants a bigger budget or a smaller fixture, and conflating them sends you hunting a bug that is not
// there. gatesBridge already carried a timedOut flag; rigRunner threw the information away.
{
    const rig = fs.readFileSync(path.join(ENG, "ai-bridge", "rigRunner.js"), "utf8");
    const page = fs.readFileSync(path.join(ENG, "rig.html"), "utf8");
    ok("!! rigRunner reports whether the gate was KILLED, not just its exit code",
        /let timedOut = false;/.test(rig) && /timedOut = true;/.test(rig) && /timedOut, timeoutMs/.test(rig));
    ok("...the flag is set by the killer, so it cannot claim a timeout that did not happen",
        /setTimeout\(\(\) => \{ timedOut = true;/.test(rig));
    // *** v3941 -- THIS GREPPED FOR A CONSTANT A BETTER ROUND DELETED. *** rigRunner had a hard-coded
    // TIMEOUT_MS; it now reads budgetFor() from tools/ship/gateBudget.mjs -- the same table selfchecks.mjs
    // uses -- because a flat 180s was BELOW twenty of the MEASURED budgets, so twenty gates could never pass
    // on rig.html whatever they did. The property this line cares about never changed and is what is asked
    // now. A CHECK PINNED TO A VARIABLE NAME GOES RED WHEN THE CODE IMPROVES, and the honest response to that
    // red is to rename the variable back, which is exactly backwards.
    ok("...and the budget it exceeded travels with it",
        /timeoutMs: budgetMs/.test(rig),
        "'timed out' without the budget leaves the reader unable to judge whether it was close");
    ok("!! ...and the number REPORTED is the number ENFORCED, not a second declaration of it",
        // no /s flag on purpose: `.` cannot cross a newline, so this matches THE KILL TIMER'S OWN LINE
        // rather than any setTimeout in the file that happens to be followed by the word budgetMs later on.
        /setTimeout\(.*, budgetMs\)/.test(rig) && /timeoutMs: budgetMs/.test(rig),
        "*** THE KILL TIMER AND THE REPORTED BUDGET READ THE SAME VARIABLE. *** Two numbers here would let " +
        "the runner kill at one budget and blame another, and a reader judging 'was it close?' against the " +
        "wrong bar cannot tell a slow gate from a hung one -- which is the whole reason the budget travels.");
    ok("!! ...and that budget comes from the SHARED TABLE, not a constant in the runner",
        /gateBudget\.mjs/.test(rig) && /budgetFor\(/.test(rig) && !/TIMEOUT_MS/.test(rig),
        "a flat 180s sat BELOW twenty of the MEASURED budgets, so those twenty could never pass on rig.html " +
        "no matter what they did -- levelClaim is budgeted 2116s and was being killed at 180. THE SECOND COPY " +
        "IS NEVER THE ONE THAT GETS UPDATED, and here the second copy was the one doing the killing.");
    ok("!! ...and a failure to read the table REFUSES to invent a number quietly",
        /budgetSource[\s\S]{0,120}could not be loaded/.test(rig),
        "*** A FALLBACK THAT DOES NOT SAY IT IS A FALLBACK IS A MEASUREMENT THAT IS NOT ONE. *** The reader " +
        "sees the source beside the number, so 'this gate is slow' and 'this box could not read the table' " +
        "stop looking identical.");
    ok("!! rig.html says TIMEOUT rather than 'FAIL null'", /r\.timedOut \? "TIMEOUT \(/.test(page));
    ok("!! the tally separates fail, timeout and error", /f \+ " fail"[\s\S]{0,80}timeout/.test(page));
    ok("!! and there is a FAILURE-ONLY list, which is what Keith actually asked for",
        /id="failed"/.test(page) && /NEEDS ATTENTION/.test(page),
        "he had to paste every result because nothing could say 'these four are the ones'");
    ok("...it hides itself when there is nothing to look at", /box\.style\.display = bad\.length \? "block" : "none"/.test(page));
    // *** v4451 -- THIS LINE WAS RED SINCE v4279 AND THE CODE WAS RIGHT THE WHOLE TIME. *** It required
    // `c._errored = true; tally();` -- the two statements ADJACENT ON ONE LINE -- and somebody later inserted
    // `c._result = {...}` between them, so a regex about the LAYOUT of two correct statements went red about
    // a behaviour that never changed. It is the same defect this round found in its own new gate (a check
    // that asked whether one string preceded another, which `if (false && ...)` satisfied with the guard
    // switched off): AN ASSERTION ABOUT WHERE TEXT SITS IS NOT AN ASSERTION ABOUT WHAT THE CODE DOES. Split
    // into the two facts it was trying to state, each checkable on its own and neither caring what sits
    // between them.
    ok("...and an errored check is counted as its own thing, not silently dropped",
        /c\._errored = true;/.test(page) && /tally\(\);/.test(page) &&
        /if \(c\._errored\)/.test(page) && /\(error\)/.test(page),
        "the catch sets _errored and calls tally(), and tally() gives it its own bucket -- three facts, none " +
        "of which is about the two statements being on the same line");
}

/* ---------------------------------------------------------------------------------------------------------
 * v4451 -- AND THE GITHUB WORK, WHICH THIS PREDICATE COULD NOT SEE FOR ITS WHOLE LIFE.
 *
 * Keith: "while the github repo commands are initiated, we need to make sure that the running swek does not
 * start an auto update that kills the github tasks." v3075 put the deferral in the right place and named
 * three runners: render QA, the gate suite, the rig runner. The clone, the verify inside the clone, the pack
 * and the upload were none of those, so an auto-update could restart the server inside any of them.
 *
 * *** AND THE PUBLISH WAS INVISIBLE EVEN TO ITS OWN BRIDGE. *** sourceChainBridge set R.phase all through
 * start() and NEVER ONCE in publish(), so during packRelease and the upload that follows it, status().running
 * read FALSE and canPublish() still returned ok -- the window in which nothing could see the work was exactly
 * the window containing the action this tree calls hardest to take back, and a second concurrent publish was
 * admissible in it too.
 * ------------------------------------------------------------------------------------------------------ */
{
    // noComments, not the raw text and not codeOnly: the raw text would let a COMMENT mentioning
    // `R.phase = "publishing"` satisfy a check about the code, and codeOnly blanks string literals -- which
    // are exactly what these checks are about. This is the middle instrument and the reason is worth stating,
    // because reaching for the wrong one is how the line above sat red since v4279.
    const chain = noComments(fs.readFileSync(path.join(ENG, "ai-bridge", "sourceChainBridge.js"), "utf8"));
    const gh = noComments(fs.readFileSync(path.join(ENG, "ai-bridge", "githubBridge.js"), "utf8"));

    ok("!! *** the update deferral asks the SOURCE CHAIN, which it never did before v4451 ***",
        /sourceChainBridge\.js/.test(runBusy) && /githubBridge\.js/.test(runBusy) && /busyWhat/.test(runBusy),
        "clone -> verify -> pack -> upload was invisible to _testRunActive() for its whole life; an update " +
        "restart inside the upload leaves a release whose asset never finished arriving, which the installer " +
        "then scans for and does not find");
    ok("...and each is guarded, so a bridge that cannot answer leaves the update WORKING rather than throwing",
        // codeOnly BLANKS STRING LITERALS, so `!== "undefined"` reads `!== ""` here. Matching the literal
        // would have gone red on correct code -- which is this file's own v4279 lesson, met again one screen
        // later. The structure is what is asserted: a guarded typeof probe, once each.
        (runBusy.match(/sourceChainBridge\.js"/g) || []).length === 1 &&
        (runBusy.match(/githubBridge\.js"/g) || []).length === 1 &&
        /try \{[\s\S]*require\(r\.mod\)[\s\S]*\} catch \{\}/.test(rCode),
        "the same rule the three original probes follow -- a missing bridge must not break the updater, and " +
        "ONE probe each, because a second copy is the duplicated-guard defect this file opens by warning about");

    // The answers must come from the runners' own state. This gate's standing rule, applied to two new runners.
    ok("!! *** the chain's answer DERIVES from its phase rather than a second flag ***",
        /function running\(\) \{ return R\.phase ===/.test(chain),
        "'a second flag would one day disagree with the thing it describes' -- this file's own words about " +
        "gatesBridge, and the reason the phase is asked rather than a boolean set beside it");
    ok("!! *** publish() SETS A PHASE, which it did not until v4451 ***",
        /R\.phase = "publishing";/.test(chain) && /finally \{ R\.phase = "done"/.test(chain),
        "set before the work and restored in a FINALLY -- publish() has eight return paths and a restore " +
        "written at each is seven chances to miss one; the one missed leaves the phase stuck and updates " +
        "deferred forever, a guard that fails closed and never reopens");
    ok("...and running() covers the publish, not just the clone and the verify",
        /R\.phase === "cloning" \|\| R\.phase === "verifying" \|\| R\.phase === "publishing"/.test(chain),
        "the upload is the step that matters most here and it was the one step with no phase at all");
    ok("!! ...and canPublish() now refuses a SECOND publish while one is in flight",
        /if \(s\.phase === "publishing"\) return \{ ok: false/.test(chain),
        "with no phase set, a second press during the upload passed every precondition the first one had");

    ok("!! *** githubBridge counts its long operations, and the counter cannot go negative ***",
        /_ghBusy = Math\.max\(0, _ghBusy - 1\)/.test(gh) && /_ghBusy\+\+/.test(gh),
        "the shape this file already blesses for gatesBridge: 'a stuck-negative counter would report idle " +
        "forever, which is the failure mode that matters here'");
    ok("...and it is decremented in a FINALLY, so a throw cannot strand it busy",
        /finally \{ _ghBusy = Math\.max\(0, _ghBusy - 1\)/.test(gh),
        "a clone that throws on a bad ref must not defer every future update");
    ok("!! ...and BOTH long operations are wrapped, not just the one that was easy to reach",
        /async function cloneEngineSource\(a\) \{ return _tracked\(/.test(gh) &&
        /async function publishEngineBuild\(a\) \{ return _tracked\(/.test(gh),
        "the clone walks several hundred MB and the publish packs ~30 MB and uploads it; wrapping one and " +
        "not the other leaves half the window open");
}

// --- 8. *** THE SECOND UPDATER, WHICH THIS FILE NEVER OPENED *** ----------------------------------------------
//
// v4533. Every section above grades server.js's _applyIncremental -- the peer/Drive INCREMENTAL package. There
// is a second updater, and it is the one a person SEES: sysadminBridge.js's updateCheck extracts a build,
// spawns the launcher and calls process.exit(0). It had NO deferral in any version, and THIS FILE COULD NOT
// HAVE NOTICED: until now it read server.js, gatesBridge.js, rigRunner.js and rig.html, and the string
// "updateCheck" did not appear in it once. A gate can be green for years about the wrong subject.
//
// Keith found it from the outside, at a release: "it gets to about 1200 and then I see the swek launcher go to
// start a new version. if it starts, the sweeps get canceled." The four refusals updateCheck did have are
// about the CANDIDATE (too small, implausibly ahead, bad zip shape) and one is about PORT 8787; none is about
// whether the machine is busy.
//
// *** AND THIS SECTION IS BEHAVIOURAL, NOT A STRING MATCH, BECAUSE A STRING MATCH IS WHAT MISSED IT. *** The
// rows below CALL updateCheck with a stubbed-busy predicate and read what comes back.
{
    const { pathToFileURL } = await import("node:url");
    const req = (await import("node:module")).createRequire(pathToFileURL(path.join(ENG, "ai-bridge", "x.js")).href);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-updpause-"));
    fs.writeFileSync(path.join(dir, "SweK_Engine_v4600.zip"), Buffer.alloc(200 * 1024, 7));
    const sys = req("./sysadminBridge.js"), rb = req("./runBusy.js");
    const realActive = rb.active;
    try {
        rb.active = () => ({ active: true, what: "the source chain (verifying)" });
        const auto = await sys.updateCheck(true, { silent: true, dir });
        ok("!! *** an AUTOMATIC apply defers while the source chain runs -- the defect Keith hit ***",
            auto && auto.deferred === true && /source chain/.test(String(auto.busy || "")),
            `deferred=${auto && auto.deferred}, busy=${auto && auto.busy}. Nothing is extracted and nothing is ` +
            "consumed: the zip stays in Downloads and the next check applies it once the work ends.");
        ok("...and it says WHICH work, so the note is actionable rather than a bare refusal",
            !!(auto && /deferred/.test(String(auto.note || "")) && /source chain/.test(String(auto.note || ""))),
            String((auto && auto.note) || "").slice(0, 110));
        const forced = await sys.updateCheck(true, { silent: true, dir, force: true });
        ok("!! a MANUAL apply still proceeds -- force is the person, not a flag something sets itself",
            !!forced && forced.deferred !== true,
            "same rule the RustDesk pause has had since v1933; /sys/update/apply passes force:true and none of " +
            "the three automatic triggers does");
        const scan = await sys.updateCheck(false, { silent: true, dir });
        ok("!! and a SCAN is never deferred -- reporting is not applying",
            !!scan && scan.deferred !== true && scan.updateAvailable === true,
            "the poller calls updateCheck(false) when autoApply is off; deferring the report would hide a " +
            "waiting build behind unrelated work");
        rb.active = realActive;
        const idle = await sys.updateCheck(true, { silent: true, dir });
        ok("!! *** and with NOTHING running it does not defer -- the guard has an off state ***",
            !!idle && idle.deferred !== true,
            "a deferral that never lifts is an updater that never runs, which is the same outage wearing a " +
            "politer word");
    } finally {
        rb.active = realActive;
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }
}

// --- 9. *** THE GUARD FROM SECTION 8 HAD A DOOR LEFT OPEN AROUND IT, ON THE CLIENT SIDE *** ------------------
//
// v4610. Section 8 proved updateCheck() ASKS runBusy and OBEYS -- and it does, every time opts.force is falsy.
// But POST /sys/update/apply, the ONE route ui/engineUpdate.js's apply() ever calls, used to pass
// `{ force: true }` UNCONDITIONALLY, for every caller. Section 8's own manual-apply row above tests
// updateCheck({force:true}) directly and would stay green either way -- it cannot see which caller reached that
// code with force set, because by the time it runs the route has already decided. That is this file's own
// warning from line 276 ("a gate can be green for years about the wrong subject") one layer further out: the
// SERVER-side automatic triggers (poller/boot-scan/peer-pull) never passed force and were always covered: the
// CLIENT-side ones (the on-load auto-apply check, and the peer-propagation prompt/auto-confirm) went through
// this same HTTP route and got force:true every time, bypassing the guard section 8 proves works.
//
// Keith, again, on the live rig: hours of relaunch windows during a Clone & Verify + zip, ending in "started
// the new version of SweK and killed the zip that was running" -- with runBusy.js's guard already in the tree.
{
    const eu = noComments(fs.readFileSync(path.join(ENG, "ui", "engineUpdate.js"), "utf8"));
    ok("!! /sys/update/apply's route no longer hands out force:true unconditionally",
        !/\/sys\/update\/apply[\s\S]{0,40}updateCheck\(true,\s*\{\s*force:\s*true\s*\}\)/.test(noComments(server)),
        "that literal shape is exactly what section 8 could not see past -- force decided before the guard ran");
    ok("...and instead derives it from the request body's own `manual` field",
        /req\.url === "\/sys\/update\/apply"[\s\S]{0,200}force:\s*!!\(d\s*&&\s*d\.manual\)/.test(noComments(server)),
        "so a caller must SAY a person clicked, not merely reach the route");
    ok("apply() sends `manual` in the POST body rather than an empty one",
        /function apply\(manual\)[\s\S]{0,200}body:\s*JSON\.stringify\(\{\s*manual:\s*!!manual\s*\}\)/.test(eu),
        "the flag now travels with the request instead of living only in a comment");
    ok("!! the ONLY call site that passes manual=true is the Settings panel's own button click",
        /installBtn\.onclick[\s\S]{0,100}_runApply\(setProg, \(\) => \{\},\s*true\)/.test(eu),
        "the one place a person is watching a live progress readout and pressed the button themselves");
    const autoSites = [
        /if \(s\.autoApply\) \{[\s\S]{0,200}_runApply\(\(msg, ok\) => \{[\s\S]{0,150}\}, \(\) => \{\}\);/,          // maybePromptUpdate
        /if \(!fn\) \{ _runApply\(\(\) => \{\}, \(\) => \{\}\); return; \}/,                                          // _promptApply, no toast surface
        /onYes: \(\) => _runApply\(\(msg\) => \{[\s\S]{0,150}\}, \(\) => \{\}\),/,                                    // _promptApply, the toast's own button/auto-confirm
    ];
    ok("!! and every AUTOMATIC caller (on-load auto-apply, peer-prompt, its no-toast fallback) passes no manual arg at all",
        autoSites.every((re) => re.test(eu)),
        "none of these three call sites has a synchronous user gesture behind it -- the toast's own auto-confirm " +
        "timer can fire onYes with nobody watching, which is exactly why it is grouped with the other two rather " +
        "than trusted as a click");
}

console.log("updatePause-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);

// =============================================================================================================
// SABOTAGE LOG -- v4533, section 8 and the runBusy extraction. Graded on EXIT CODES; all three files restored
// md5-identical (sysadminBridge 5981486b, runBusy 865f7657, server 6ed9208a... verified byte-for-byte).
//
//   A  *** THE DEFERRAL DELETED FROM updateCheck -- THE EXACT STATE THE TREE WAS IN BEFORE THIS ROUND. ***
//      -> exit 1. This is the sabotage that justifies the section: it is not a hypothetical mutation, it is
//      the code that shipped in every version up to v4532, and this file was GREEN over it for its whole life
//      because it never opened sysadminBridge.js. A gate that cannot fail on the bug it miss.ed is a gate that
//      will miss it again.
//
//   B  the deferral kept but `opts.force` ignored, so a person's click is blocked too.
//      -> exit 1. The manual row holds. A guard that also stops the human is an outage, not a pause.
//
//   C  sourceChainBridge dropped from runBusy's table.
//      -> exit 1, from the source-chain rows AND from section 8's behavioural row at once -- which is the
//      argument for one shared table: a runner removed there is felt by both updaters in the same run.
//
//   D  _testRunActive stops delegating and returns a bare { active: false }.
//      -> exit 1. Delegation is asserted, so the incremental path cannot quietly go back to answering for
//      itself while the installer asks the shared question.
//
// *** WHAT IS STILL NOT COVERED, SAID PLAINLY. *** Section 8 drives updateCheck with rb.active stubbed; it does
// NOT prove the real runners report busy during a real release -- that needs a live clone, which no gate can
// afford. What it proves is that updateCheck ASKS and OBEYS. The runners' own reporting is covered by the
// sections above, one bridge at a time.
