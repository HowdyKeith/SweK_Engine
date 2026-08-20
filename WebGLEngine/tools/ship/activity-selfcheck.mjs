// WebGLEngine/tools/ship/activity-selfcheck.mjs -- v3018
//
// Run: node tools/ship/activity-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/roundhouse/activity.mjs -- what a peer is DOING, which the roster never carried.
//
// A peer reports host, arch, platform, node, master, subsystems, engineVersion and observables. Every one is a
// property of the BOX, and none of them changes while a roundhouse run is in flight -- so a fleet of eight looks
// identical whether they are all idle or all mid-experiment.
//
// THE RULE THAT MAKES "RUNNING" WORTH REPORTING: A PEER SAYING "RUNNING" IS A CLAIM WITH A TIMESTAMP, NOT A
// STATE. A box that crashed mid-run says running forever -- there is nobody left to say otherwise. Same failure
// as a stale Tasker artefact (v3008) and a stale cross-arch baseline (v2998), same fix: the AGE travels, and
// past a threshold the reader is told the claim is UNATTENDED rather than shown a green light nobody is behind.
//
// AND THE HAZARD THIS ROUND WAS WARNED ABOUT: the field is HAND-COPIED into two places -- the self row and the
// peer row in collect(). v2927's note records that adding observables to one and not the other left the physics
// table permanently dark on a fleet that plainly had the data. Both rows are asserted here.
import { activityOf, readActivity, fleetActivity, describe, ACTIVITY, UNATTENDED_MS } from "../roundhouse/activity.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const bridge = fs.readFileSync(path.join(ENG, "ai-bridge", "fingerprintBridge.js"), "utf8");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const now = Date.now();
const iso = (ms) => new Date(now - ms).toISOString();
const run = activityOf({ device: "lbm", round: 3, maxRounds: 6, startedAt: now - 60000, progress: { trajectory: "worsened-overall" } }, now);

// ---- 1. THE BLOCK CARRIES WHAT A READER NEEDS -----------------------------------------------------------
{
    ok("an idle box reports idle", activityOf(null, now).state === ACTIVITY.IDLE);
    ok("a live run reports device and progress", run.state === ACTIVITY.RUNNING && run.device === "lbm" && run.round === 3 && run.maxRounds === 6);
    ok("!! ...and the step TRAJECTORY", run.trajectory === "worsened-overall",
       "a peer four rounds in and getting WORSE is a different fleet event from one converging, and 'running' alone cannot tell them apart");
    ok("...and a timestamp", !!Date.parse(run.at));
}

// ---- 2. RUNNING IS A CLAIM, AND THE READER DECIDES ------------------------------------------------------------
{
    ok("a fresh claim reads as running", readActivity(run, now).state === ACTIVITY.RUNNING);
    ok("!! a claim nothing has updated reads as UNATTENDED", readActivity({ ...run, at: iso(20 * 60000) }, now).state === ACTIVITY.UNATTENDED,
       "against a " + (UNATTENDED_MS / 60000) + " minute window -- a box that crashed mid-run says running forever");
    ok("...and says why, naming the crash case", /nobody left to say otherwise/.test(readActivity({ ...run, at: iso(20 * 60000) }, now).why || ""));
    ok("!! a running claim with NO timestamp is UNATTENDED, not running", readActivity({ state: "running" }, now).state === ACTIVITY.UNATTENDED,
       "no way to tell a live run from one that stopped reporting, and defaulting to 'running' would be the confident wrong answer");
    ok("!! THE READER decides, not the peer", /THE READER decides/.test(fs.readFileSync(path.join(ENG, "tools", "roundhouse", "activity.mjs"), "utf8")),
       "the failure being guarded against is the peer no longer being there, so it cannot be the one to report it");
}

// ---- 3. A MISSING FIELD IS AN OLD BUILD, NOT AN IDLE BOX ------------------------------------------------------------
{
    const u = readActivity(undefined, now);
    ok("!! no activity block at all reads as UNKNOWN", u.state === ACTIVITY.UNKNOWN);
    ok("...and says it means an older build", /OLDER BUILD, not an idle box/.test(u.why || ""),
       "treating a missing field as idle would show a busy fleet as quiet -- and a mixed-version fleet is exactly what v3016 made visible");
    const f = fleetActivity([{ roundhouse: run }, { roundhouse: { state: "idle", at: iso(1000) } },
                             { roundhouse: { ...run, at: iso(20 * 60000) } }, {}], now);
    ok("!! the fleet counts UNATTENDED SEPARATELY from running", f.running === 1 && f.unattended === 1 && f.idle === 1 && f.unknown === 1,
       f.note + " -- folding unattended into running is the whole mistake");
}

// ---- 4. BOTH HAND-COPIED ROWS CARRY IT -- the hazard this round was warned about -------------------------------------
{
    ok("!! the SELF row carries roundhouse", /subsystems: fp\.subsystems, roundhouse \}/.test(bridge),
       "the box's own entry in collect()");
    ok("!! ...and the PEER row does too", /observables: r\.data\.observables, roundhouse: r\.data\.roundhouse \}/.test(bridge),
       "v2927 records what happens when only one is updated: the table stays permanently dark on a fleet that plainly has the data");
    ok("the duplication is NAMED in the source", /HAND-COPIED INTO TWO PLACES/.test(bridge),
       "a hand-copied field list that does not say so is how the next field gets added to one of them");
    ok("...and a failure to build the block degrades to null, not to a throw", /catch \{ roundhouse = null; \}/.test(bridge),
       "a peer that can hash but not report activity is still a useful hash peer -- the same degradation rule observables carries");
}

// ---- v3700. THE WORDS, AND THE LINK THAT MUST NOT BE OFFERED -----------------------------------------------
// *** THIS PANEL BRANCH HAD NEVER RENDERED. *** fingerprintBridge has read __swekActiveRun since v3018 and
// server.html's gauge since v3020, and NOTHING IN THE TREE EVER SET IT until v3699's curriculum route -- a
// reader with no writer for six hundred versions, so "running" was code nobody had seen run. The first writer
// is a run whose unit is not a round and which has no transcript, which is how both defects surfaced at once.
{
    const now = Date.now();
    const cur = readActivity(activityOf({ id: "c1", device: "curriculum", round: 2, maxRounds: 3, startedAt: now, unit: "phase" }));
    const rh  = readActivity(activityOf({ id: "r1", device: "ising", round: 4, maxRounds: 8, startedAt: now, transcript: true }));

    ok("!! *** a curriculum PHASE is not called a round ***", describe(cur).text === "curriculum phase 2/3",
        JSON.stringify(describe(cur).text) + ". A roundhouse ROUND is an iteration of propose-verify-escalate; "
        + "a PHASE is one census returning. They shared the word the moment a second kind of run existed -- and "
        + "THE UNIT IS CARRIED, NOT MATCHED ON THE DEVICE NAME, because a name test is what this session got "
        + "wrong three times.");

    ok("!! *** a run with NO TRANSCRIPT is offered no transcript link ***", describe(cur).link === null,
        "the curriculum writes no transcript. A LINK TO EVIDENCE THAT DOES NOT EXIST IS WORSE THAN NO LINK -- "
        + "it looks like corroboration, and this panel would have offered one on every curriculum run.");

    ok("...while a run that HAS one still gets it",
        describe(rh).link === "/run-inspector.html?id=r1" && describe(rh).text === "ising round 4/8",
        JSON.stringify(describe(rh)) + " -- the fix must not take the link away from the case that earns it");

    ok("!! the transcript is OPT-IN, so a new run type that forgets it gets no dead link",
        describe(readActivity(activityOf({ id: "x", device: "d", round: 1, maxRounds: 2, startedAt: now }))).link === null,
        "defaulting it true would hand every future run type a link to a transcript it may never write");

    ok("...and UNKNOWN is not flattened into idle",
        describe(readActivity(activityOf(null))).text === "idle" && describe(null).text === "unknown",
        "UNKNOWN is a peer that reported NOTHING -- an older build, not an idle box");
}

console.log(fails ? "\nactivity-selfcheck: " + fails + " FAILED" : "\nactivity-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
