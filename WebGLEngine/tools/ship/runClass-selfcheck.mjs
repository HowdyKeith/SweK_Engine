// WebGLEngine/tools/ship/runClass-selfcheck.mjs -- v3029
//
// Run: node tools/ship/runClass-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/roundhouse/runClass.mjs -- Keith's policy, made mechanical.
//
// His call: a suite taken while the phone was serving its own live view is for DIAGNOSTICS and MONITORING, not
// for comparison. Right call -- an HTTP server sharing a phone with 15-25 minutes of lattice work changes the
// timings, and the device may throttle.
//
// THIS EXISTS SO IT IS NOT A CONVENTION. A convention is a rule that holds until the day somebody is in a hurry.
// The whole point of this project is that the refusal lives in the DATA rather than in the discipline of
// whoever is reading it -- the same move fleetBench makes returning INCOMPARABLE across engine versions, and
// macSession makes returning CONFOUNDED across mismatched environments.
import { classOf, partition, RUN_CLASS } from "../roundhouse/runClass.mjs";
import { prose } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const runner = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "androidRunner.mjs"), "utf8");
const doctor = fs.readFileSync(path.join(ENG, "ai-bridge", "doctorBridge.js"), "utf8");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE TRANSCRIPT CLASSIFIES ITSELF -------------------------------------------------------------------
{
    ok("!! the runner stamps a runClass", /runClass: servedMarker\(\) === true \? "diagnostic"/.test(runner),
       "the classification travels with the measurement, so a reader cannot lose it by opening the file somewhere else");
    ok("...and an unreadable marker is UNCLASSIFIED, not comparable", /=== null \? "unclassified"/.test(runner));
    ok("the reason is recorded beside it", /a rule that holds until the day someone is in a hurry/.test(prose(runner)),
       "a policy with no reason gets relaxed by the next person who finds it inconvenient");
}

// ---- 2. SILENCE IS NOT AGREEMENT ----------------------------------------------------------------------------------
{
    ok("!! a transcript with no fields at all is UNCLASSIFIED", classOf({}) === RUN_CLASS.UNCLASSIFIED,
       "an older transcript cannot promise anything about what else was running, and treating silence as 'nothing' is the assumption this file exists to refuse");
    ok("...and null is not false", classOf({ servedWhileRunning: null }) === RUN_CLASS.UNCLASSIFIED);
    ok("an explicit false IS comparable", classOf({ servedWhileRunning: false }) === RUN_CLASS.COMPARABLE,
       "a run that checked and found nothing serving is a different fact from one that never looked");
    ok("served is diagnostic", classOf({ servedWhileRunning: true }) === RUN_CLASS.DIAGNOSTIC);
    ok("an explicit runClass wins over inference", classOf({ runClass: "diagnostic", servedWhileRunning: false }) === RUN_CLASS.DIAGNOSTIC);
    ok("...but a junk runClass falls back rather than being trusted", classOf({ runClass: "excellent" }) === RUN_CLASS.UNCLASSIFIED,
       "an unrecognised value is not a licence -- it is a transcript this code does not understand");
}

// ---- 3. AN EXCLUDED RUN IS VISIBLE, NOT SILENTLY ABSENT -------------------------------------------------------------
{
    const p = partition([{ runClass: "comparable" }, { servedWhileRunning: true }, {}, { runClass: "diagnostic" }]);
    ok("!! comparable and excluded are BOTH returned", p.comparable.length === 1 && p.excluded.length === 3,
       "a shorter table with no explanation is how someone concludes a phone stopped reporting");
    ok("...and the two reasons for exclusion are counted separately", p.diagnostic === 2 && p.unclassified === 1,
       "'we were watching it' and 'we do not know' are different problems with different fixes");
    ok("the summary says which and why", /taken while the phone was serving \(real, but not comparable\)/.test(p.why),
       "REAL but not comparable -- not invalid. The measurement happened; it just cannot sit beside a quiet run");
    ok("an all-clean set says so positively", /every run is comparable/.test(partition([{ servedWhileRunning: false }]).why),
       "'no problem found' is a different message from 'nothing checked'");
    ok("empty input does not throw", partition(null).comparable.length === 0);
}

// ---- 4. A GAP FOUND WHILE CHECKING, recorded rather than quietly fixed ------------------------------------------------
//
// Once server.js runs on the phone, ten read-only routes become available there: /android/status, /devices,
// /doctor, /fingerprint, /health, /lighthouse, /metrics, /perf, /sync/status, /weight. Nine are platform-neutral.
// /doctor is NOT.
{
    ok("!! doctorBridge branches on platform", /process\.platform/.test(doctor),
       "four references, plus darwin and win32 special-cases");
    ok("!! ...and has NO Termux/Android branch", !/termux|android/i.test(doctor),
       "on Termux process.platform is 'linux', so the phone silently takes the desktop-Linux path -- the SAME SHAPE as v3004's pathNote excluding win32, which is a platform the code does not know it is on. Recorded rather than fixed: it needs a real device to check, and guessing is what that bug was made of.");
}

console.log(fails ? "\nrunClass-selfcheck: " + fails + " FAILED" : "\nrunClass-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
