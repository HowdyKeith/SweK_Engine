// tools/roundhouse/strictConfig-selfcheck.mjs
//
// v3366 -- TURNING THE SESSION'S MOST EXPENSIVE MISTAKE INTO A GATE.
//
// SEVEN TIMES a config key was passed to something that did not have it, was silently ignored, and the run
// completed with plausible numbers that looked like a physics result. Every one produced a null wearing the
// costume of a finding:
//
//   swapRule for accept        tempering -- correct and planted runs returned IDENTICAL marginals
//   sigmaWRONG for sigmaLik    inference -- the overconfidence case never fired
//   stepFn for step            langevin  -- three planted errors all appeared "undetected"
//   workFn for workInc         langevin  -- same run, same silence
//   msdFn for wrapMSD          diffusion -- the wrapped-MSD bug appeared to be caught by nothing
//   n for count                rmt       -- rectangleLevels built an empty spectrum and everything "agreed"
//   mu for m1/m2               twobody   -- and this one nearly caused a CORRECT tool to be discarded, because
//                                           the bad measurement looked like a refutation of it
//
// That last is the reason this exists. A working perturbation filter was one step from being thrown away on the
// strength of a measurement that never ran.
//
// THE FIX COSTS NOTHING BECAUSE THE DEVICES ALREADY DECLARE THEIR KNOBS -- 44 of 54 return a config from
// defaults(), so an unknown key is decidable by comparison against what is already written down.

import { strictBuild, unknownKeys, checkableDevices, EXTRA_KEYS ,
         readButNotDeclared, mirrorAudit, ENABLING_FLAGS } from "./strictConfig.mjs";
import fs from "node:fs";
import { DEVICE_NAMES, getDevice } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const threw = async (fn) => { try { await fn(); return false; } catch { return true; } };

// ---- 1. THE ACTUAL MISTAKES ARE CAUGHT -------------------------------------------------------------------------
{
    const cases = [
        ["twobody", "orbit", { mu: 4 }, "mu for m1/m2 -- the one that nearly cost a correct tool"],
        ["probe", "capture", { stepFn: 1 }, "stepFn for step"],
        ["kerr", "spin", { spin: 0.5 }, "spin for a"],
        ["clocks", "rates", { radius: 10 }, "radius for r"],
    ];
    const results = [];
    for (const [d, m, cfg] of cases) results.push(await threw(() => strictBuild(d, m, cfg)));
    ok("!! every wrong-key pattern from this session is refused",
        results.every(Boolean),
        cases.map((c, i) => `${c[3]}: ${results[i] ? "caught" : "MISSED"}`).join("  |  ") +
        ". Each of these silently returned a plausible number before, and each null looked like a result");
}

// ---- 2. CORRECT CALLS STILL WORK, AND SO DO LEGITIMATE EXTRAS -----------------------------------------------------
{
    const good = await strictBuild("twobody", "orbit", { a: 10, m1: 3, m2: 1 });
    ok("!! a correct config builds normally",
        Number.isFinite(good.periodExact),
        `periodExact ${good.periodExact.toFixed(6)}. A guard that refused valid work would be worse than the ` +
        "problem it solves");

    const tour = await strictBuild("probe", "tour", { stations: [8, 14, 20] });
    ok("!! and keys a device legitimately accepts outside its defaults are allowed",
        tour.tourArrived === 3,
        `stations is not in probe's defaults -- it is a list, not a scalar knob -- and refusing it would break ` +
        `routes. ${Object.keys(EXTRA_KEYS).length} such keys are REGISTERED with a reason each, so widening what ` +
        "counts as valid is a visible decision rather than a quiet loosening");
}

// ---- 3. IT REPORTS BY DEFAULT AND THROWS ONLY ON REQUEST -----------------------------------------------------------
{
    const u = await unknownKeys("twobody", "orbit", { mu: 4, a: 10 });
    ok("!! unknownKeys REPORTS rather than throwing",
        u.keys.length === 1 && u.keys[0] === "mu" && u.declared.includes("m1"),
        `reports ["${u.keys.join(", ")}"] against declared [${u.declared.slice(0, 4).join(", ")}...]. Reporting is ` +
        "the default because a caller may have a good reason; strictBuild is the opt-in that turns it into an " +
        "error, and it is what a measurement script should use");
}

// ---- 4. THE LIMIT IS STATED: TEN DEVICES CANNOT BE CHECKED ------------------------------------------------------------
{
    const c = await checkableDevices(DEVICE_NAMES);
    ok("!! devices that declare no config are reported as uncheckable, not as passing",
        c.undeclarable.length > 0 && c.checkable.length > 40,
        `${c.checkable.length} devices declare a config and can be checked; ${c.undeclarable.length} do not: ` +
        `${c.undeclarable.join(", ")}. A key typo aimed at one of those is still silent, and saying so is the ` +
        "difference between a guard with known coverage and one assumed to be total");

    const u = await unknownKeys(c.undeclarable[0], null, { nonsense: 1 });
    ok("...and asking about one of them says undeclarable rather than clean",
        u.undeclarable === true,
        `${c.undeclarable[0]} returns undeclarable:true. Returning an empty key list would read as "no problems ` +
        'found" when the truth is "nothing was checked"');
}


// ---- 5. THE MIRROR DEFECT: READ BUT NOT DECLARED -----------------------------------------------------------------
//
// unknownKeys catches a key a device would silently IGNORE. It cannot catch the opposite -- a key the device
// READS and never advertises -- and that direction bites harder, because this lab's own guard then blocks a
// working input.
//
//   blackhole/neutronstar read `cfg.nsMass || 1.4` with nsMass undeclared. strictBuild THREW on a parameter the
//   device supports, and the sensitivity scan never tried it, leaving seven derived observables sitting inert
//   and looking like hardcoded constants.
//
//   lens/deflectSweep read `(h.config && h.config.bSweep) || 60`. It moves impactParameter and all three
//   deflection error fractions, and strictBuild refused it. An inline `|| 60` is a default in the wrong place:
//   it makes a parameter real without making it visible.
//
// BOTH DIRECTIONS ARE ONE MISMATCH, surfaced by the sensitivity matrix from opposite ends:
//   DECLARED AND NOT READ  nuclear listed A and Z and hardcoded fissionQ(238, 92) -- a DEAD KNOB
//   READ AND NOT DECLARED  blackhole and lens -- INERT OBSERVABLES, and a rejected key
//
// *** AND ONE FLAGGED KEY IS CORRECT AS IT STANDS. *** kerr:dynamicIsco switches a numeric ISCO search on in
// place of the closed form; a default run must not take that path, so it belongs outside the defaults for the
// same reason `planted` does. Flags are REGISTERED with a reason each, so calling something a flag is a visible
// decision rather than a way to silence the audit.
{
    ok("!! a device that READS a key it does not declare is found",
        (() => {
            const extra = readButNotDeclared("const x = cfg.nsMass; const y = config.wibble;", ["G", "M"]);
            return extra.includes("nsMass") && extra.includes("wibble");
        })(),
        "the scan reads cfg.X and config.X out of the bind source and subtracts what defaults() lists");

    ok("!! lens now accepts bSweep, which it always read",
        (await strictBuild("lens", "deflectSweep", { bSweep: 120 })).impactParameter === 120,
        "it moves four observables and strictBuild refused it before. The guard was correct and the declaration " +
        "was missing");

    const audit = await mirrorAudit(DEVICE_NAMES, getDevice,
        (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } });
    ok("!! the lab-wide audit is down to registered flags only",
        audit.offenders.length === 0 && audit.scanned > 40,
        `${audit.scanned} binds scanned, ${audit.offenders.length} with undeclared reads. planted and ` +
        "dynamicIsco are registered as SWITCHES and excluded on that basis, which is a different claim from " +
        "being clean -- a flag is correctly undeclared, a setting is not");

    ok("...and the scan is a TEXT scan, which is stated rather than implied",
        readButNotDeclared("const { alpha } = cfg;", []).length === 0 && Object.keys(ENABLING_FLAGS).length >= 2,
        "a key read through a destructure or a computed property never appears as cfg.X and will be missed, so " +
        "the count is a lower bound rather than a total");
}

console.log();
if (fails) { console.log("strictConfig-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("strictConfig-selfcheck: all checks pass");
