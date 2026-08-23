// WebGLEngine/tools/ship/roundhousePanel-selfcheck.mjs -- v3020
//
// Run: node tools/ship/roundhousePanel-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the Roundhouse minipanel on server.html.
//
// Keith asked where the button was. THERE WASN'T ONE. Seventeen gtab minipanels on the front door -- brain,
// brew, bzflag, celltrack, cloud, crossdesk, endlesssky, ev, fluidgpu, github, nearshare, render, renderqa,
// rocketleague, rules, rustdesk, verify -- AND NOT THE THING THE ENGINE IS ACTUALLY FOR.
//
// Everything built across v3016-v3019 -- fleet versions, peer activity, the trajectory, the run inspector link --
// landed on report.html, a SEPARATE PAGE you have to know to go to. That is the same defect this session has now
// found in pages, modules, lints, gates, findings, bridges, run transcripts and the Tasker chain: the work was
// done and the way in was not. Asking "is there a button" is the right question, and the answer being no is the
// finding.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const ui = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
// The two section-3 checks below are DRIVEN through the same modules the panel imports, so they need them.
const A = await import("../roundhouse/activity.mjs");
const SP = await import("../roundhouse/stepProgress.mjs");
// *** noComments, NOT codeOnly, AND NOT THE RAW FILE. *** The raw file went RED on the sentence explaining
// the rule -- prose-as-code, which this tree keeps catching. codeOnly would have been WORSE THAN WRONG here:
// it strips string CONTENTS, so a real hardcoded `=== "worsened-overall"` would be scrubbed to `=== ""` and
// the check would pass on exactly the duplicate it exists to find. The literal has to be findable in a string
// and unfindable in a comment, and only noComments does both.
const activitySrc = noComments(fs.readFileSync(path.join(HERE, "..", "roundhouse", "activity.mjs"), "utf8"));
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. IT IS A BUTTON, IN THE SAME PLACE AS EVERY OTHER ONE ----------------------------------------------
{
    ok("!! there is a Roundhouse gtab", /data-tab="roundhouse"/.test(ui),
       "seventeen minipanels and the engine's own subject was not one of them");
    ok("...and a panel it opens", /data-panel="roundhouse"/.test(ui));
    ok("...with a state chip like its neighbours", /id="rhStat"/.test(ui),
       "the chip is what makes a collapsed tab worth having -- a gauge you must open to read is not a gauge");
    ok("it opens lazily, like the others", /data-tab="roundhouse"\]'\)/.test(ui) || /querySelector\('\[data-tab="roundhouse"\]'\)/.test(ui),
       "fetching on page load would cost every visitor a lighthouse round trip for a panel most never open");
}

// ---- 2. IT READS THE SAME MEANING THE PEER PUBLISHES ------------------------------------------------------------
{
    ok("!! the panel imports the shared activity module", /import\("\/tools\/roundhouse\/activity\.mjs"\)/.test(ui),
       "a second reading of what 'running' means, living in a panel, is the duplicated-table class this tree has paid for six times");
    ok("...and reads THIS box from /fingerprint", /"\/fingerprint"/.test(ui));
    ok("...and the fleet from /lighthouse", /"\/lighthouse"/.test(ui));
}

// ---- 3. THE DISTINCTIONS SURVIVE THE SHRINK TO A GAUGE ------------------------------------------------------------------
//
// A minipanel is where nuance goes to die. These three are the ones that must not.
{
    ok("!! UNATTENDED is explained, not just coloured", /a run nothing has updated &mdash; not a run in progress/.test(ui),
       "shrunk to a chip, 'unattended' reads as 'slow' unless the panel says otherwise");
    ok("!! ...and UNKNOWN is not idle", /a peer on a build too old to report it, which is not the same as idle/.test(ui),
       "an older build cannot report a field that did not exist when it shipped, and calling that idle shows a busy fleet as quiet");
    // *** v3941 -- BOTH OF THESE GREPPED server.html FOR A STRING THE PANEL IS RIGHT NOT TO CONTAIN, and
    // one of them was RED FOR A FEATURE THAT WORKS. ***
    //
    // The transcript link is built by activity.describe() -- in the shared module, which is what section 2
    // above spends four lines demanding. Satisfying a grep for "run-inspector.html?id=" would have meant
    // BUILDING THE URL A SECOND TIME IN THE PANEL, so the gate was asking for the exact defect the gate
    // forbids twelve lines earlier. A TEXT MATCH IN THE CONSUMER IS NOT A PROXY FOR A FEATURE THAT LIVES IN
    // THE PROVIDER, and here it was pushing in the wrong direction as well as reading the wrong file.
    //
    // The colour was a REAL absence and is now built. It is checked the same way round: the panel is asked
    // whether it CALLS the predicate, and the predicate is DRIVEN to prove it discriminates. Note what these
    // still cannot say -- a source read cannot prove a colour reaches a pixel, only that the code path exists
    // and the decision behind it is right. The rendering half wants a browser, and this gate has never had one.
    ok("!! a worsening trajectory is coloured, and the DECISION comes from the shared module",
       /A\.worsening\(/.test(ui) && /#f28b8b/.test(ui),
       "the one fleet event worth interrupting someone for, and it was arriving as plain text inside " +
       "describe()'s sentence -- the same colour as a run that is converging");
    ok("!! ...and worsening() really discriminates -- driven, not read",
       A.worsening({ state: "running", trajectory: SP.TRAJECTORY.WORSENED }) === true &&
       A.worsening({ state: "running", trajectory: SP.TRAJECTORY.MONOTONE }) === false &&
       A.worsening({ state: "running" }) === false && A.worsening(null) === false,
       "*** AN UNGRADED RUN MUST ANSWER FALSE RATHER THAN TRUE: 'we could not tell' coloured like 'it is " +
       "going backwards' spends the alarm on nothing, and a predicate that only ever returns one value is " +
       "a dead check wearing a boolean.");
    ok("...and the word has ONE definition, in stepProgress, imported rather than restated",
       SP.TRAJECTORY.WORSENED === "worsened-overall" && !/worsened-overall/.test(activitySrc) &&
       /TRAJECTORY\.WORSENED/.test(activitySrc),
       "three other readers compare against the literal by hand and the panel was about to be a fourth -- " +
       "the duplicated-table class, arriving as a five-character string");
    ok("!! ...and a running box links to its transcript THROUGH describe(), not a URL built in the panel",
       /d\.link/.test(ui) && !/run-inspector\.html\?id=/.test(ui),
       "section 2 of this gate refuses a second reading living in the panel; a URL assembled here is one");
    ok("...and describe() really produces that link -- driven",
       A.describe({ state: "running", transcript: true, runId: "r 1", device: "lbm", round: 2, maxRounds: 6 })
         .link === "/run-inspector.html?id=r%201",
       "the id is ENCODED, which a hand-built href in the panel is exactly the sort of place to forget");
    ok("!! ...and a run that declares NO transcript is offered no link at all",
       A.describe({ state: "running", transcript: false, runId: "r1" }).link === null &&
       A.describe({ state: "idle" }).link === null,
       "*** A LINK TO EVIDENCE THAT DOES NOT EXIST IS WORSE THAN NO LINK -- IT LOOKS LIKE CORROBORATION. *** " +
       "The first run ever to reach this branch was a CURRICULUM run, which has no transcript.");
}

// ---- 4. IT IS A DOOR TO THE REST, not a replacement --------------------------------------------------------------------
{
    for (const [href, why] of [["/report.html", "the full fleet view"], ["/run-inspector.html", "the transcript"], ["/doctor", "ollama readiness"]]) {
        ok("links out to " + why, new RegExp('href="' + href.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&") + '"').test(ui));
    }
    ok("!! an unreachable source says so rather than rendering empty", /lighthouse unreachable/.test(ui) && /bridge unreachable/.test(ui),
       "an empty gauge and a dead endpoint look identical, and only one means the fleet is quiet");
}

console.log(fails ? "\nroundhousePanel-selfcheck: " + fails + " FAILED" : "\nroundhousePanel-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
