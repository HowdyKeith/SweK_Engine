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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const ui = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
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
    ok("a worsening trajectory is coloured", /worsened-overall/.test(ui),
       "the one fleet event worth interrupting someone for");
    ok("...and a running box links to its transcript", /run-inspector\.html\?id=/.test(ui));
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
