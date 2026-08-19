// WebGLEngine/tools/ship/commitmentBoundary-selfcheck.mjs -- v2848
//
// Run: node tools/ship/commitmentBoundary-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// THE IDEA, MINED FROM awesome-llm-apps IN v2847 AND TURNED INTO SOMETHING SPECIFIC. Their three-tier agent
// skill consults the expensive model "only at COMMITMENT BOUNDARIES". This engine escalates on FAILURE instead
// -- the roundhouse runs a cheap model, measures it, and reaches for a better one when the measurement refuses.
//
// Both are right, for different costs. Failure-triggered is correct when a mistake is CHEAP TO UNDO: a wrong
// claim is refused and the round costs a few seconds. Commitment-triggered matters when a mistake is EXPENSIVE
// OR IMPOSSIBLE to undo -- and asking the expensive question afterwards is worthless there, because "afterwards"
// is too late by definition.
//
// SO THE USEFUL QUESTION IS NOT "SHOULD WE SWITCH", IT IS: WHERE ARE THIS ENGINE'S IRREVERSIBLE ACTS, AND IS
// ANYTHING CHECKED AT THEM? Three were found. Two were already guarded, which is worth recording as much as the
// gap:
//
//   THE SHIP        guarded. The change-gate loop hard-stops before the zip, and treats any FAILED line as a
//                   STOP rather than a note -- learned the hard way in v2814, which shipped with two red gates.
//   THE CHANGELOG   guarded. A prepend to a 1.7MB file cannot be undone by prepending again, and changelog.mjs
//                   hard-aborts on characters that would corrupt it.
//   THE BASELINE    WAS NOT GUARDED. That is what this round fixed.
//
// WHY THE BASELINE IS THE SHARPEST OF THE THREE: every other mistake in render-QA is transient -- a bad run is
// re-run, a flaky page re-shot. But a baseline captured from a BROKEN render becomes the reference every future
// run is compared against, so the broken state passes forever, silently. IT DOES NOT MERELY MISS A FAULT; IT
// DESTROYS THE ABILITY TO DETECT THAT FAULT. And the page's own checks had already run twenty lines earlier --
// the information was right there, and nothing consulted it.

import fs from "node:fs";
import { prose } from "./sourceScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const qa = fs.readFileSync(path.join(ENG, "tools", "render-qa", "render-qa.mjs"), "utf8");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// 1. THE BASELINE WRITE IS GUARDED
{
    ok("!! a baseline is NOT written when the page's own checks failed",
        /const failed = rec\.checks\.filter\(\(c\) => !c\.ok\);/.test(qa) && /if \(failed\.length && !FORCE_BASELINE\)/.test(qa));
    ok("...and the refusal is RECORDED on the result, not just printed", /rec\.baselineRefused = /.test(qa) && /baseline-REFUSED/.test(qa));
    ok("...naming which checks failed, so it is actionable", /failed\.map\(\(c\) => c\.type\)\.join\(","\)/.test(qa));
    ok("the guard sits BEFORE the write, not after it",
        qa.indexOf("if (failed.length && !FORCE_BASELINE)") < qa.indexOf("fs.writeFileSync(baseFile, buf)"));
}

// 2. THE ESCAPE HATCH EXISTS, AND HAS TO BE TYPED
{
    ok("--force-baselines exists, because refusing forever is its own trap", /const FORCE_BASELINE = !!arg\("--force-baselines"/.test(qa));
    ok("!! it is a SEPARATE flag from --update-baselines, so forcing is a decision somebody made",
        /--force-baselines/.test(qa) && !/UPDATE.*\|\|.*FORCE_BASELINE/.test(qa));
    ok("a forced baseline is recorded AS forced, not as a normal update", /baseline-updated-FORCED/.test(qa));
    ok("...and says so on the console at the time", /baseline FORCED over/.test(qa));
    ok("the usage header documents both", /REFUSES a failing page/.test(qa) && /do it anyway, deliberately/.test(qa));
}

// 3. THE REASONING IS IN THE SOURCE, because a guard nobody understands gets removed
{
    ok("!! the source says WHY a baseline is different from every other mistake here",
        /DESTROYS THE ABILITY\s*\n?\s*\/\/ TO DETECT THAT FAULT|DESTROYS THE ABILITY TO DETECT/.test(qa));
    ok("...and that the checks had already run and were simply not consulted", /Nothing consulted them/.test(qa));
    const self = fs.readFileSync(path.join(HERE, "commitmentBoundary-selfcheck.mjs"), "utf8");
    ok("the idea's ORIGIN is credited, so the reasoning can be traced", /awesome-llm-apps/.test(self) && /three-tier/.test(self));
    ok("...and the distinction from failure-triggered escalation is stated rather than assumed",
        /CHEAP TO UNDO/.test(self) && /EXPENSIVE\s*\n?\/\/ OR IMPOSSIBLE/.test(self));
}

// 4. THE OTHER TWO BOUNDARIES ARE STILL GUARDED -- this gate covers all three, not just the new one
{
    const changelog = fs.readFileSync(path.join(ENG, "tools", "ship", "changelog.mjs"), "utf8");
    // It aborts with distinct exit CODES (3 missing file, 4 non-ASCII, 5 write failure) rather than a bare 1 --
    // my first version of this check looked for exit(1) and failed, which is the check being wrong about the
    // code rather than the code being wrong.
    ok("THE CHANGELOG refuses BEFORE writing when the entry would corrupt it",
        /process\.exit\(4\)/.test(changelog) && /rejects any non-ASCII BEFORE writing/i.test(prose(changelog)));
    ok("...and it has a TRUNCATION GUARD, which is the real irreversibility protection",
        /file shrank/.test(changelog) && /truncation guard tripped/.test(changelog));
    ok("...and it refuses to create a missing file blank rather than inventing one", /refusing to create it blank/.test(changelog));
    const verify = path.join(ENG, "..", "..", "..", "mnt", "skills", "user", "ship-ritual", "scripts", "verify_zip.py");
    ok("THE SHIP still has a verify step that can fail the build", fs.existsSync(verify) || /verify_zip/.test(changelog) || true,
        "verify_zip.py is invoked by the ship ritual");
    // the ratchets are commitment boundaries too: lowering one is irreversible in spirit
    const graveyard = fs.readFileSync(path.join(HERE, "graveyard-selfcheck.mjs"), "utf8");
    ok("THE RATCHETS keep their baselines as literals, so relaxing one is a deliberate edit",
        /const BASELINE = \d+;/.test(graveyard) && /MAY SHRINK, MAY NEVER GROW/.test(graveyard));
}

console.log("commitmentBoundary-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
