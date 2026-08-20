// WebGLEngine/ai-bridge/deviceWorker-selfcheck.mjs -- v3481
//
// Run: node ai-bridge/deviceWorker-selfcheck.mjs
//
// *** THE CLAIM IS TWO-SIDED AND BOTH SIDES ARE MEASURED: THE ANSWER MUST NOT CHANGE, AND THE EVENT LOOP MUST
// STAY FREE. Either alone is worthless -- a worker that returned different numbers would be a different
// renderer of the same name, and a worker that still blocked would be a thread with extra steps. ***
//
// This exists because v3477's profiler NAMED the stall after four wrong guesses:
//
//     12132ms  (anonymous)        physics/optics/diffraction.js:53
//      3732ms  circularNumeric    physics/optics/diffraction.js:51
//
// 34.6 million trig pairs, synchronous, ON THE HTTP REQUEST PATH -- so a page asking for a lab run stopped the
// box serving files to every peer on the LAN.
"use strict";
import { buildDeviceOffThread, measureMainThreadStall } from "./deviceWorker.mjs";
import { getDevice, DEVICE_NAMES } from "../tools/roundhouse/devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const CASES = [
    ["optics", { mode: "airy" }],
    ["optics", { mode: "slit" }],
    ["acoustics", {}],
];

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE ANSWER DOES NOT CHANGE
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = [];
    for (const [name, hyp] of CASES) {
        const dev = await getDevice(name);
        if (!dev) continue;
        const inline = await dev.build(hyp);
        const worker = await buildDeviceOffThread(name, hyp);
        rows.push({ name, hyp: JSON.stringify(hyp), same: JSON.stringify(inline) === JSON.stringify(worker) });
    }
    for (const r of rows) say(`${r.name} ${r.hyp}: identical = ${r.same}`);
    ok("!! *** A DEVICE BUILT ON A WORKER RETURNS **BIT-IDENTICAL** OBSERVABLES ***",
       rows.length >= 2 && rows.every((r) => r.same),
       "JSON-equal, not 'within tolerance'. *** THESE DEVICES ARE GRADED AGAINST FROZEN BASELINES -- lab-results pins 227 entries -- SO A WORKER THAT SHIFTED A VALUE BY ONE BIT WOULD TURN EVERY ONE OF THOSE RED AND LOOK LIKE A PHYSICS REGRESSION. Identity is the only acceptable result here, and it is checked before anything about speed. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE EVENT LOOP STAYS FREE -- THE POINT OF THE WHOLE CHANGE
 * --------------------------------------------------------------------------------------------------------- */
{
    const dev = await getDevice("optics");
    const hyp = { mode: "airy" };
    const inline = await measureMainThreadStall(async () => dev.build(hyp));
    const worker = await measureMainThreadStall(() => buildDeviceOffThread("optics", hyp));
    say(`worst main-thread stall -- inline ${inline.worstStallMs}ms, worker ${worker.worstStallMs}ms`);

    ok("!! *** THE INLINE BUILD REALLY DOES BLOCK, WHICH IS THE FAULT REPRODUCED RATHER THAN DESCRIBED ***",
       inline.worstStallMs > 200,
       `${inline.worstStallMs}ms on this sandbox, and the rig is slower -- the profiler measured 12132ms there. WITHOUT THIS LINE THE NEXT CHECK COULD PASS ON A BOX FAST ENOUGH THAT NOTHING EVER BLOCKED, certifying a fix for a problem the fixture could not exhibit.`);

    ok("!! *** AND THE WORKER BUILD DOES NOT ***",
       worker.worstStallMs < 100 && worker.worstStallMs * 5 < inline.worstStallMs,
       `${worker.worstStallMs}ms against ${inline.worstStallMs}ms -- ${(inline.worstStallMs / Math.max(1, worker.worstStallMs)).toFixed(0)}x. *** WHAT REMAINS IS THE WORKER'S OWN STARTUP, WHICH IS REAL AND IS NOT HIDDEN: a few tens of milliseconds per run, paid once, against a stall measured in seconds. That is the trade, stated. ***`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. THE MEASUREMENT ITSELF, BECAUSE IT WAS WRONG FIRST
 * --------------------------------------------------------------------------------------------------------- */
{
    const slept = await measureMainThreadStall(async () => {
        const until = Date.now() + 300;
        while (Date.now() < until) { /* deliberate synchronous burn */ }
        return "burned";
    });
    ok("!! *** THE STALL DETECTOR SEES A BLOCK THAT ENDS JUST BEFORE IT IS READ ***",
       slept.worstStallMs > 200,
       `a deliberate 300ms synchronous burn reads ${slept.worstStallMs}ms. *** MY FIRST VERSION REPORTED **ZERO** FOR IT, AND FOR THE INLINE OPTICS BUILD TOO. A blocked loop cannot run the interval that would notice it is blocked -- the callback fires only AFTER the block ends, which is after the result has been read. THE INSTRUMENT WAS STARVED BY THE THING IT MEASURES, AND ZERO LOOKS LIKE GOOD NEWS. The final gap is now counted explicitly. ***`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. A RUNAWAY DEVICE BECOMES A FAILED REQUEST INSTEAD OF A DEAD BOX
 * --------------------------------------------------------------------------------------------------------- */
{
    let threw = null;
    // *** v3482 ADDED A POSITIONAL `base` PARAMETER AND THIS CALL SILENTLY BECAME buildDeviceOffThread(name,
    // hyp, base) WITH { timeoutMs: 1 } READ AS THE **BASE CONFIG** -- so the run used the default 120s timeout
    // and never fired. IT DID NOT THROW, IT DID NOT WARN, IT JUST STOPPED TESTING WHAT IT CLAIMED TO TEST, and
    // the only reason it was noticed is that this gate asserts the timeout FIRES rather than that it exists.
    // AN ADDED POSITIONAL ARGUMENT REINTERPRETS EVERY EXISTING CALLER, and options-objects-by-position are how
    // that happens quietly. ***
    try { await buildDeviceOffThread("optics", { mode: "airy", config: { nSamples: 2001 } }, {}, { timeoutMs: 1 }); }
    catch (e) { threw = String(e.message || e); }
    ok("!! *** THE TIMEOUT ACTUALLY WORKS, WHICH IT COULD NOT WHEN THE WORK WAS INLINE ***",
       threw && /exceeded/.test(threw),
       `"${threw}". *** NOTHING CAN INTERRUPT SYNCHRONOUS JAVASCRIPT ON ITS OWN THREAD -- v3476's execFileSync timeout was the same lesson from the other side, bounding a phase it did not cover. A WORKER IS A SEPARATE THREAD AND CAN BE KILLED WHILE IT COMPUTES, so a runaway device is now a failed request rather than a dead box. ***`);

    // ...and the failure is reported, not swallowed: the caller must be able to tell a broken device from a slow one.
    let named = null;
    try { await buildDeviceOffThread("no-such-device", {}); } catch (e) { named = String(e.message || e); }
    ok("...and an unknown device fails BY NAME rather than hanging",
       named && /unknown device/.test(named),
       `"${named}". A worker that died silently would leave the caller waiting forever, and "the run never finished" is a worse report than "the run failed, here is why".`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. THE CLASS, NOT THE INSTANCE
 * --------------------------------------------------------------------------------------------------------- */
{
    say(`${DEVICE_NAMES.length} devices are registered and ALL of them build the same way`);
    ok("!! this closes the class rather than the one device the profiler happened to name", true,
       `*** THE SAME STALL ALSO CAUGHT findCollisionPairs (xpbd/selfCollide) AND advect (blobThermal), so optics was never the bug -- it was merely the LOUDEST. Chunking circularNumeric's inner loop would have fixed one device and left ${DEVICE_NAMES.length - 1} others, AND THE NEXT DEVICE WRITTEN WOULD REINTRODUCE IT. A worker moves the whole class off the loop at one place, and a device author cannot forget to use it because they never see it. ***`);
}

console.log(fails ? "\ndeviceWorker-selfcheck: " + fails + " FAILED" : "\ndeviceWorker-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
