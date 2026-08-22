// WebGLEngine/tools/ship/fleetActivityView-selfcheck.mjs -- v3019
//
// Run: node tools/ship/fleetActivityView-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the activity column in report.html -- the last step of the plan.
//
// v3016 made the fleet's VERSIONS visible and v3018 made a peer report what it is DOING. Neither was worth much
// alone: a fleet you can see the version of but not the state of is half a fleet view, and a state nobody renders
// is v3008's Tasker chain all over again -- a surface built and left unlooked-at for three rounds.
//
// A RUNNING PEER LINKS TO ITS OWN TRANSCRIPT. The run inspector (v3015) already renders the step trajectory, so
// this is the shortest path there is from "that box is getting worse" to seeing which round it happened in.
//
// AND THE HONEST LIMIT, GATED RATHER THAN GLOSSED: the column can only show what the ROSTER carries. A peer on a
// build older than v3018 reports no activity block at all, and that renders as UNKNOWN -- correctly, because
// treating a missing field as idle would show a busy fleet as quiet.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fleetActivity, activityOf } from "../roundhouse/activity.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const page = fs.readFileSync(path.join(ENG, "report.html"), "utf8");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE COLUMN RENDERS THE STATE, NOT JUST THE VERSION -----------------------------------------------
{
    ok("the view computes fleet activity", /fleetActivity\(rows\)/.test(page));
    ok("!! ...from the SAME module the peer reports with", /tools\/roundhouse\/activity\.mjs/.test(page),
       "one owner for what a state MEANS -- a second interpretation in the page would drift from the one the peer publishes, which is the duplicated-table class this tree has paid for six times");
    ok("a running peer shows device and round", /round " \+ esc\(a\.round\)/.test(page));
    ok("!! ...and its TRAJECTORY, coloured when it is worsening", /worsened-overall/.test(page),
       "a peer four rounds in and getting worse is the fleet event worth seeing, and 'running' alone hides it");
}

// ---- 2. UNATTENDED IS NOT RENDERED AS RUNNING -------------------------------------------------------------------
{
    ok("!! unattended has its own colour", /a\.state === "unattended" \? "#e6c877"/.test(page),
       "a run nothing has updated is not a run in progress, and green would say it was");
    ok("...and the summary says what unattended MEANS", /UNATTENDED is a run nothing has updated, not a run in progress/.test(page),
       "the word alone invites the reading that it is merely slow");
    ok("unknown is distinguished from idle", /a\.state === "unknown"/.test(page),
       "a peer on an older build reports nothing, and showing that as idle would make a busy fleet look quiet");
}

// ---- 3. THE LINK TO THE TRANSCRIPT ------------------------------------------------------------------------------------
{
    ok("!! a running peer links to the run inspector", /run-inspector\.html\?id=/.test(page),
       "shortest path from 'that box is getting worse' to which round it happened in");
    ok("...and the id is URL-encoded", /encodeURIComponent\(a\.runId\)/.test(page));
    ok("the peer actually publishes a runId", activityOf({ id: "abc", device: "d", startedAt: Date.now() }).runId === "abc",
       "a link needs an id, and the block did not carry one until this round");
    ok("...and an idle peer has none to link", !("runId" in activityOf(null)),
       "no run, no link -- rather than a dead href to nothing");
}

// ---- 4. IT SHOWS ONLY WHAT THE ROSTER CARRIES, and says so -------------------------------------------------------------
{
    const f = fleetActivity([{ roundhouse: activityOf({ id: "x", device: "d", startedAt: Date.now() }) }, {}]);
    ok("!! a peer with no block counts as UNKNOWN, not idle", f.unknown === 1 && f.idle === 0,
       f.note + " -- an older build cannot report a field that did not exist when it shipped");
    ok("...and running is counted separately", f.running === 1);
    ok("the page degrades rather than throwing if the module will not load", /catch \{ act = null; \}/.test(page),
       "the version panel must still render even if activity cannot -- half a view beats none");
}

console.log(fails ? "\nfleetActivityView-selfcheck: " + fails + " FAILED" : "\nfleetActivityView-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
