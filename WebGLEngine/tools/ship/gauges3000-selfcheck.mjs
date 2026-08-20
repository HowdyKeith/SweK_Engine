// WebGLEngine/tools/ship/gauges3000-selfcheck.mjs -- v3026
//
// Run: node tools/ship/gauges3000-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES gauges3000.html -- a page called "gauges" where half the needles were sine waves.
//
// Six gauges. THREE WERE REAL -- cores, memory, fps, each flagged `live: true` -- AND THREE WERE SYNTHETIC:
// SIGNAL was 62 + 30*sin(t), FLUX a sine times a cosine, SHIELD another sine. The author KNEW: the `live` flag
// exists in the data and has since the page was written.
//
// IT WAS NEVER RENDERED. So a viewer saw six identical dials and could not tell which three meant anything.
// That is this session's recurring shape one more time -- THE DISTINCTION EXISTED IN THE DATA AND WAS INVISIBLE
// IN THE VIEW -- and it is the same defect as a peer reporting engineVersion nobody displayed, a gate carrying a
// verdict nobody read, and a robot with lights that flashed on a timer.
//
// A DECORATIVE GAUGE ON A DEMO PAGE IS FINE. ONE THAT PASSES AS TELEMETRY IS NOT, and the difference is one word
// on a label.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const page = fs.readFileSync(path.join(ENG, "gauges3000.html"), "utf8");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE DISTINCTION IS RENDERED, NOT MERELY RECORDED --------------------------------------------------
{
    ok("!! decorative gauges are LABELLED as such", /fillText\("decorative"/.test(page),
       "the `live` flag existed in the data since the page was written and was never drawn -- three real readings and three sine waves looked identical");
    ok("...and the label is drawn under the gauge, not in a comment", /y \+ rad \* 1\.5 \+ 12/.test(page));
    ok("the remaining synthetic gauges are flagged", (page.match(/decorative: true/g) || []).length === 2,
       "FLUX and SHIELD stay -- a demo page is allowed decoration, it is not allowed to imply measurement");
}

// ---- 2. A REAL SIGNAL REPLACED A SINE WAVE -------------------------------------------------------------------
{
    ok("!! SIGNAL's sine wave is gone", !/label: "SIGNAL"/.test(page) && !/62 \+ 30 \* Math\.sin/.test(page),
       "a gauge on a page called 'gauges' that shows a sine wave is a screensaver with a legend");
    ok("...replaced by BRAIN, reading real activity", /label: "BRAIN"/.test(page) && /val: \(\) => brainPct/.test(page));
    ok("...and it is marked live", /label: "BRAIN"[^}]*live: true/.test(page),
       "the flag has to be true for the right reason, not just present");
}

// ---- 3. ONE OWNER FOR WHAT A STATE MEANS ------------------------------------------------------------------------------
{
    ok("!! it imports the SHARED activity module", /tools\/roundhouse\/activity\.mjs/.test(page) && /A\.readActivity/.test(page),
       "a second reading of 'running' living in a demo page is the duplicated-table class this tree has paid for seven times -- and a demo is where a copy goes unnoticed longest");
    ok("...and maps progress the same way the brain lights do", /a\.round \/ a\.maxRounds/.test(page),
       "round N of M, so the dial shows PROGRESS rather than mere activity");
    ok("!! a lost bridge reads 0 with state unknown, not idle", /brainState = "unknown"; brainPct = 0;/.test(page),
       "an unreachable engine and an idle engine are different facts, and a dial at zero must not be the only thing said about either");
    ok("unattended is given its own value rather than folded into running", /a\.state === "unattended" \? 50/.test(page),
       "a run nothing has updated is not a run in progress");
    ok("a running box with no round yet is not zero", /a\.state === "running" \? 5/.test(page),
       "it is still running, and a dial at zero would say otherwise");
}

// ---- 4. IT REMAINS A DEMO, and says so -------------------------------------------------------------------------------
{
    ok("the page is still declared fx", /demo:category" content="fx"/.test(page),
       "wiring one real signal does not make an LCARS FX page a dashboard, and relabelling it as one would be the overclaim");
    ok("the live gauges outnumber the decorative ones", (page.match(/live: true/g) || []).length > (page.match(/decorative: true/g) || []).length,
       "4 live to 2 decorative -- and both kinds are now legible at a glance");
}

console.log(fails ? "\ngauges3000-selfcheck: " + fails + " FAILED" : "\ngauges3000-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
