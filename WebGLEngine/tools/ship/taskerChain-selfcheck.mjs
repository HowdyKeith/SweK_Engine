// WebGLEngine/tools/ship/taskerChain-selfcheck.mjs -- v3008
//
// Run: node tools/ship/taskerChain-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the Tasker stage chain -- and the two rules that keep it from becoming a dashboard that lies.
//
// Keith runs Tasker on a Android TV Device already wired into this engine, and asked whether it could close the gaps
// between install, run, submit and update on the Android peer. It can, through Termux:Tasker -- the plugin that
// executes a script INSIDE Termux, which is the designed seam and the sibling of the Termux:Boot integration
// this tree has used since v2935.
//
// RULE ONE: THE INSTALL STEP IS HUMAN ON PURPOSE. Android requires a tap to install an APK, and Keith's
// instruction was explicit -- the user makes that decision when prompted. So it is declared human:true and
// carries NO command. A chain that pretended to close that gap would be describing a rooted device or quietly
// asking for device-owner rights nobody agreed to. Declaring it is not an admission of a missing feature; it is
// the feature.
//
// RULE TWO: A TASK THAT FIRED IS NOT A TASK THAT WORKED. Tasker reports success for a script that ran, found
// nothing and exited 0 -- on a device nobody is sitting at. So a stage is only DONE when an artefact says so,
// and a STALE artefact is not a pass: it is the previous run being mistaken for this one.
import { STAGES, verifyStage, chain, FRESH_MS } from "../roundhouse/taskerStages.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const at = (ms) => ({ phone: { present: true, at: new Date(Date.now() - ms).toISOString() } });

// ---- 1. THE HUMAN STEP IS DECLARED, NOT MISSING -----------------------------------------------------------
{
    const inst = STAGES.find((s) => s.id === "install");
    ok("the install stage exists and is HUMAN", !!inst && inst.human === true);
    ok("!! ...and carries NO command", inst.command === null,
       "a command here would be describing a rooted device -- the tap is the user's decision and that is the design");
    ok("...and says why the prompt is the point", /human tap|decide/i.test(inst.why || ""));
    ok("...and names F-Droid over the Play Store", /F-Droid/.test(inst.source || ""),
       "the Play build of Termux is deprecated and its package installs are broken -- the single most common first-run failure");
    ok("!! it does not claim an install can be confirmed", inst.evidence === null && /phantom success/i.test(inst.evidenceWhy || ""),
       "nothing here can see an APK install, and saying otherwise is the exact failure this surface refuses");
    ok("every other stage IS automatable", STAGES.filter((s) => !s.human).every((s) => !!s.command),
       STAGES.filter((s) => !s.human).length + " of " + STAGES.length + " carry a Termux:Tasker command");
}

// ---- 2. FIRED IS NOT WORKED --------------------------------------------------------------------------------------
{
    ok("!! a fresh artefact is DONE", verifyStage("run", at(60 * 1000)).verdict === "done");
    ok("!! a STALE artefact is NOT a pass", verifyStage("run", at(30 * 3600 * 1000)).verdict === "stale",
       "the previous run mistaken for this one -- the failure mode of every scheduled task that reports its own success");
    ok("...and the staleness window is stated as data", FRESH_MS > 0 && FRESH_MS <= 24 * 3600 * 1000, (FRESH_MS / 3600000) + "h");
    ok("a MISSING artefact is not-done, with the reason", (() => {
        const v = verifyStage("run", {});
        return v.verdict === "not-done" && /produced nothing/i.test(v.why || "");
    })(), "Tasker may have run and produced nothing, which is exactly what a fired task reports as success");
    ok("an undated artefact is distinguished from a fresh one",
       verifyStage("run", { phone: { present: true } }).verdict === "done-undated",
       "it exists and cannot be told from an old one -- a different fact from 'it just ran'");
    ok("an unknown stage is refused", verifyStage("nope", at(1000)).verdict === "unknown-stage");
}

// ---- 3. UNCONFIRMABLE IS SAID OUT LOUD, not silently treated as done -------------------------------------------------
{
    const f = verifyStage("fetch", at(1000));
    ok("!! a stage with no artefact reports UNCONFIRMABLE", f.verdict === "unconfirmable",
       "driveable but not verifiable from the hub -- stated rather than papered over");
    ok("...and never reports done", f.verdict !== "done");
    const c = chain(at(1000));
    ok("the chain counts confirmable separately from automatable", c.automatable > c.confirmable,
       c.automatable + " automatable, only " + c.confirmable + " confirmable -- collapsing those would overstate what the hub knows");
    ok("...and names the human steps rather than omitting them", c.humanSteps.includes("install"));
}

// ---- 4. wired in -------------------------------------------------------------------------------------------------------
{
    const bridge = fs.readFileSync(path.join(ENG, "ai-bridge", "androidPeerBridge.js"), "utf8");
    ok("/android/tasker is served", /"\/android\/tasker"/.test(bridge));
    ok("...and it reuses status() rather than re-reading the artefacts", /m\.chain\(status\(\)\)/.test(bridge),
       "one owner for what the hub can see -- a second reader would drift from the first, which this tree has now paid for six times");
}

console.log(fails ? "\ntaskerChain-selfcheck: " + fails + " FAILED" : "\ntaskerChain-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
