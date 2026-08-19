// WebGLEngine/tools/ship/rigJobPanel-selfcheck.mjs -- v3022
//
// Run: node tools/ship/rigJobPanel-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the Rig Jobs minipanel -- the second service found by Keith's question and the one that stung.
//
// Rig jobs carry more live state than almost anything else in this engine: which job is running, how long it has
// been, its exit code, whether the script even exists, and WHETHER IT EDITS SOURCE. None of it had a gauge. The
// roundhouse was in that shape one round ago and it took someone asking "is there a button" to find either.
//
// THREE DISTINCTIONS THE PANEL MUST NOT FLATTEN, and each is already a hard-won rule elsewhere in this tree:
//
//   EDITS SOURCE. The mutation job rewrites the tree while it runs. v2988's lifecycle machine records that
//   KILLED is the dangerous exit for exactly that reason -- a killed run can leave a mutation behind, which is
//   why a stranded marker exists at all. A gauge showing "running" without saying the tree is being edited is
//   hiding the one fact that changes what you should do about it.
//
//   A NON-ZERO EXIT IS NOT A KILL. A job that ran and said no is a result. A job that was interrupted is not.
//
//   RUNNING IS A CLAIM WITH A CLOCK. A job that died leaves running:true behind and there is nobody left to
//   correct it -- so elapsed time is computed HERE from startedAt, not trusted from the bridge. Same rule as the
//   peer activity block (v3018) and the Tasker artefacts (v3008).
import fs from "node:fs";
import { prose } from "./sourceScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const ui = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
const bridge = fs.readFileSync(path.join(ENG, "ai-bridge", "rigJobBridge.js"), "utf8");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THERE IS A BUTTON, AND A CHIP ---------------------------------------------------------------------
{
    ok("!! there is a Rig Jobs gtab", /data-tab="rigjob"/.test(ui));
    ok("...and a panel", /data-panel="rigjob"/.test(ui));
    ok("...and a state chip", /id="rjStat"/.test(ui),
       "a gauge you must open to read is not a gauge");
    ok("it reads the bridge's own status route", /"\/rigjob\/status"/.test(ui),
       "the same surface the bridge publishes, not a second reading of it");
}

// ---- 2. EDITS SOURCE IS SURFACED, because it changes what you should do ------------------------------------------
{
    ok("!! the panel shows EDITS SOURCE", /EDITS SOURCE/.test(ui),
       "a gauge showing 'running' without saying the tree is being rewritten hides the one fact that matters");
    ok("...and explains the killed-run consequence", /a mutation can be left behind/.test(prose(ui)),
       "v2988 declared KILLED distinct from FAILED for exactly this reason, and a panel that flattened them would undo it");
    ok("the bridge really carries the flag", /editsSource/.test(bridge),
       "checked against the source rather than assumed -- the panel can only show what is published");
}

// ---- 3. RUNNING IS A CLAIM WITH A CLOCK -------------------------------------------------------------------------------
{
    ok("!! elapsed is computed from startedAt in the page", /Date\.now\(\)\s*-\s*t\)\s*\/\s*60000/.test(ui),
       "a job that died leaves running:true behind and there is nobody left to correct it");
    ok("!! ...and a run past its estimate is flagged", /running well past its estimate/.test(ui),
       "the job declares its own expected minutes; exceeding them by 2x is the cheapest available stall signal");
    ok("...and says why the clock is the authority", /only the clock can say/.test(prose(ui)));
    ok("the estimate comes from the job, not a constant", /job\.minutes/.test(ui),
       "a fixed threshold would flag a long job and miss a stalled short one");
}

// ---- 4. AN EXIT CODE IS A RESULT, NOT A FAILURE STATE -----------------------------------------------------------------
{
    ok("!! a non-zero exit is distinguished from a kill", /RAN and said no, distinct from one that was killed/.test(ui),
       "a job that ran and refused is a measurement; a job that was interrupted is not");
    ok("exit 0 is not coloured as an error", /ex===0\?"#9fb8ab"/.test(ui.replace(/\s/g, "")) || /ex===0\s*\?\s*"#9fb8ab"/.test(ui));
    ok("no exit at all is distinguished from exit 0", /ex==null/.test(ui.replace(/\s/g, "")) || /ex == null/.test(ui),
       "never having run is not the same as having run cleanly");
}

// ---- 5. A MISSING SCRIPT IS REPORTED, not silently listed --------------------------------------------------------------
{
    ok("!! jobs whose script is absent are called out", /MISSING script/.test(ui),
       "a registered job pointing at a file that is gone will fail the moment someone presses it, and the list would otherwise look healthy");
    ok("...and the chip reflects it", /missing\.length\?"check"/.test(ui.replace(/\s/g, "")),
       "the collapsed state has to carry the problem or nobody opens the panel");
    ok("an unreachable bridge says so", /bridge unreachable/.test(ui));
}

console.log(fails ? "\nrigJobPanel-selfcheck: " + fails + " FAILED" : "\nrigJobPanel-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
