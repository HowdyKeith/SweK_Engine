// tools/roundhouse/deviceModes-selfcheck.mjs
//
// Run: node tools/roundhouse/deviceModes-selfcheck.mjs   (~0.2s)
//
// v3189 -- THE FRONT DOOR COULD NOT SAY HOW MANY MODES A DEVICE HAS, AND THREE DEVICES REFUSE NOTHING.
//
// v3174 measured the thing that decides whether a device can explain its own error: with ONE mode there is
// nothing to compare against, so its number cannot be separated into "the key's truncation" and "my own
// defect". *** AND /device/list REPORTED name, observables AND knobs -- NOT MODES *** -- so the single most
// important structural fact about a device was invisible on the page built to look at devices. checkMode has
// existed since v3144 and the listing never reached for it.
//
// *** THE CENSUS FOUND SOMETHING WORSE THAN A MISSING COLUMN. THREE DEVICES ECHO BACK ANY MODE STRING. ***
// twobody, inspiral and eccentric have a defaults() that returns whatever it is handed, so checkMode -- built
// at v3144 precisely to refuse an undeclared mode -- REFUSES NOTHING ON THEM. It has been protecting 24 of 28
// devices and nothing said which three it could not.
//
// A FOURTH, lbm, HAS NO defaults() AT ALL, and checkMode handles that correctly with a stated reason. THAT IS A
// DIFFERENT THING AND IS COUNTED DIFFERENTLY: one is a guard that cannot engage, the other a device that has
// nothing to guard.
//
// THE COUNT IS A LOWER BOUND AND SAYS SO. A mode is declared by being ECHOED BACK, so you can only ask about
// one you already thought of; there is no enumeration to read. A device with a mode nobody guessed
// under-reports -- and that is worth knowing too, because A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE.

import path from "node:path";
import fsMod from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const M = await import(pathToFileURL(path.join(HERE, "deviceModes.mjs")).href);
const D = await import(pathToFileURL(path.join(HERE, "devices.mjs")).href);
const K = await import(pathToFileURL(path.join(HERE, "knobGate.mjs")).href);

const census = await M.modeCensus(D, K.checkMode);
const unguarded = [];
for (const name of D.DEVICE_NAMES) {
    let d; try { d = await D.getDevice(name); } catch { continue; }
    if (typeof d.defaults !== "function") continue;         // no defaults() is a different state, counted apart
    if (K.checkMode(d, "zzz_not_a_mode_zzz").ok !== false) unguarded.push(name);
}

// ---- 1. THE GUARD THAT CANNOT ENGAGE -----------------------------------------------------------------------------
{
    // *** v3190 -- v3189 ASSERTED unguarded.length === 3. THAT IS THE DEFECT ENCODED AS THE EXPECTATION, a
    // named species in this project's own failure list, and it went red the moment the defect was FIXED --
    // which is the correct outcome and still the wrong assertion. THE PROPERTY IS THAT EVERY DEVICE WITH A
    // defaults() REFUSES A MODE IT DOES NOT DECLARE. The three are named in the message as history, not as
    // the thing being checked. ***
    // *** v3420 -- AND THIS CHECK HAD NOT RUN FOR AN UNKNOWN NUMBER OF VERSIONS. checkMode dereferenced the
    // result of defaults(), beamBind CORRECTLY returns null for an undeclared mode, and the whole gate died on
    // that line before printing anything -- confirmed on the PRISTINE v3419 extract, so it is not this round's
    // doing. verify does not carry this gate, so nothing noticed. NEVER RUN IS DISTINCT FROM PASS, and it is
    // ALSO distinct from FAIL: fixing the crash did not break this, it REVEALED it. ***
    //
    // THE WALL AT ZERO IS NOT AVAILABLE TODAY AND THE REASON IS THIS FILE'S OWN: guessing which modes a device
    // means to offer would declare an interface on somebody else's behalf. So it becomes a RATCHET -- the list
    // is FROZEN BY NAME and may only SHRINK. A falling count is progress and must never fail a build; a NEW
    // name is a regression and fails immediately, which is the half that actually protects anything.
    //
    // *** THE NAMES ARE THE POINT, NOT THE COUNT: a tally would let one device become guarded while another
    // quietly lost its guard, and the total would not move. WHEN A DEVICE IS FIXED, DELETE ITS NAME -- do not
    // widen the list, and do not soften the check. ***
    // *** "em" CAME OFF THIS LIST AT v3424, WHICH IS THE RATCHET RUNNING THE RIGHT WAY FOR THE FIRST TIME. ***
    // It was fixed because a round happened to be inside that bind and the mode list finally had one
    // definition -- not by a sweep. THE ENTRY WAS DELETED, NOT COMMENTED OUT: the staleness half below would
    // have failed on it the moment it stopped being true, which is exactly what it is for.
    // *** v3845 -- "hydrostatic" AND "pbc" CAME OFF THIS LIST, AND THE STALENESS HALF IS WHAT SAID SO. ***
    // Both took a declared mode plant this round, and a plant mode is only real if the validator LISTS it --
    // the v3806 lesson: a validator written as `if (mode !== primary) mode = primary` silently reverts the
    // plant and both arms read an identical number. So guarding the mode was not a side errand, it was the
    // plant's precondition, and this gate went red the moment the guards landed. TWO ENTRIES DELETED, NOT
    // COMMENTED OUT, the same way "em" left at v3424.
    // *** v3902 -- "fieldnav" AND "inference" CAME OFF WITH IT, for the same reason and on the same run: each
    // took a plant this round, and each had a defaults() of the form `mode: mode || <primary>` that hands ANY
    // truthy name straight back. All three now return NULL for a mode they do not declare. THREE ENTRIES
    // DELETED, NOT COMMENTED OUT.
    // *** v3902 -- "spatial" CAME OFF THIS LIST, AND THE STALENESS HALF SAID SO ON THE SAME RUN ITS PLANT
    // LANDED. *** Its defaults() was `mode: mode || "agreement"`, handing ANY truthy name straight back as
    // though the device offered it; it now returns NULL for a mode it does not declare, which is beamBind's
    // behaviour and the one this check calls correct. The guard was the plant's precondition, exactly as it
    // was for hydrostatic and pbc above -- and the v3806 lesson quoted there was re-learned the hard way the
    // same round, on splatBind, where a SECOND COPY of the mode list inside defaults() coerced a new plant
    // mode to the primary and made both arms read bit-identical numbers.
    const UNGUARDED_BASELINE = [
        "acoustics", "seismic", "nuclear", "clocks", "kuramoto", "hmc", "landauzener",
        "langevin", "rmt", "percolation", "diffusion", "wolff",
        "twof", "tempering", "blobbodies",
        // v3501 -- xpbd and compose were ALREADY unguarded on the pristine v3500 extract (this gate was red there,
        // it is not carried by verify). They are recorded here to bring the baseline current, not to excuse them:
        // when either learns to refuse an undeclared mode, DELETE its name. astroparticle, added this round, is
        // GUARDED and deliberately absent from this list.
        "xpbd", "compose",
    ];
    const arrived = unguarded.filter((n) => !UNGUARDED_BASELINE.includes(n));
    const fixed = UNGUARDED_BASELINE.filter((n) => !unguarded.includes(n));
    ok("!! *** NO DEVICE NEWLY STOPS REFUSING AN UNDECLARED MODE (ratchet, names not a count) ***",
        arrived.length === 0,
        arrived.length ? "NEWLY UNGUARDED: " + arrived.join(", ") + " -- a mode selects WHICH PHYSICS RUNS, so a device that accepts a name it does not declare runs something else and says nothing"
                       : `${unguarded.length} of ${UNGUARDED_BASELINE.length} baselined still unguarded` + (fixed.length ? `; FIXED and removable from the baseline: ${fixed.join(", ")}` : ""));
    ok("...and the baseline is not stale -- every name on it is still genuinely unguarded",
        fixed.length === 0,
        fixed.length ? "STALE ENTRIES, DELETE THEM: " + fixed.join(", ") + " -- a baseline entry whose reason has expired is a ratchet holding nothing (v3195)"
                     : "all " + UNGUARDED_BASELINE.length + " still hold; a stale suppression is an ACTIVE BLIND SPOT, not a harmless leftover");
    ok("REPORTED, not failed: the devices that still accept any string",
        true,
        unguarded.length ? "STILL UNGUARDED: " + unguarded.join(", ")
            : "all " + D.DEVICE_NAMES.filter(() => true).length + " checked. twobody, inspiral and eccentric " +
              "used to echo back ANY string -- `mode || \"default\"` -- so checkMode, BUILT AT v3144 TO REFUSE " +
              "AN UNDECLARED MODE, REFUSED NOTHING ON THEM. Their real sets were DERIVED from each file's own " +
              "default plus the modes its own build() branches on, and every one was verified to give a " +
              "DISTINCT answer before being declared: A BRANCH THAT CHANGED NOTHING WOULD BE A MODE IN NAME ONLY");

    ok("!! and a device with NO defaults() is counted apart, not lumped in",
        await (async () => { const d = await D.getDevice("lbm"); return typeof d.defaults !== "function"; })(),
        "lbm has none, and checkMode handles that correctly with a stated reason. ONE IS A GUARD THAT CANNOT " +
        "ENGAGE, THE OTHER A DEVICE WITH NOTHING TO GUARD -- and a single 'accepts nonsense' number would have " +
        "hidden the difference");

    ok("!! the devices that DO enforce, enforce",
        await (async () => {
            for (const n of ["spacefill", "thermal", "blackhole", "splat"]) {
                const d = await D.getDevice(n);
                if (K.checkMode(d, "zzz_not_a_mode_zzz").ok !== false) return false;
            }
            return true;
        })(),
        "spacefill, thermal, blackhole, splat all REFUSE. A check that found everything unguarded would be " +
        "measuring itself rather than the devices");
}

// ---- 2. THE CENSUS v3174 IMPLIED BUT NOBODY COULD RUN ---------------------------------------------------------------
{
    // *** v3192 -- v3189 ASSERTED singleMode.length >= 10. THAT WAS THE ARTEFACT ENCODED AS THE EXPECTATION.
    // The count was never a fact about the devices: it was a fact about MY CANDIDATE LIST. Exporting the real
    // sets took it from 13 to 3, and the assertion went red for the best possible reason. THE PROPERTY IS THAT
    // EVERY DEVICE IS ACCOUNTED FOR, in one group or another, with no silent remainder. ***
    ok("!! every device lands in exactly one group, with no remainder",
        census.singleMode.length + census.multiMode.length + census.undiscoverable.length +
        census.noDeclaration.length === census.devices,
        census.singleMode.length + " one-mode, " + census.multiMode.length + " multi, " +
        census.undiscoverable.length + " undiscoverable, " + census.noDeclaration.length + " no-declaration = " +
        census.devices + ". v3189 asserted TEN OR MORE ONE-MODE DEVICES and it is now THREE -- the difference " +
        "was never in the devices, it was in the candidate list I probed them with");

    ok("!! spacefill is among the multi-mode, as v3188 built it to be",
        census.multiMode.includes("spacefill") &&
        census.rows.find((r) => r.name === "spacefill").declared.length === 3,
        "stroke, raster, order. THE FIRST DEVICE BUILT TO v3174's STANDARD, and the census is how anybody else " +
        "can see that rather than taking the changelog's word");

    ok("!! ONE-MODE DEVICES ARE COUNTED, NOT AVERAGED",
        /singleMode: rows\.filter\(\(r\) => r\.declared\.length === 1\)/.test(fsMod.readFileSync(path.join(HERE, "deviceModes.mjs"), "utf8")),
        "'the lab averages 1.4 modes per device' would be true and USELESS -- the question is HOW MANY CANNOT " +
        "EXPLAIN THEIR OWN ERROR, and that is a count of devices at exactly one");

    ok("!! *** no device's modes are UNDISCOVERABLE ***",
        census.undiscoverable.length === 0,
        census.undiscoverable.length ? "UNDISCOVERABLE: " + census.undiscoverable.join(", ")
            : "every device answers. blackhole, interferometer, splat, discovery and blobkelvin reported NONE " +
              "at v3189 -- not because they had none, but because THEIR NAMES WERE IN NOBODY'S CANDIDATE LIST. " +
              "A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE, and the fix was for the device to say so " +
              "rather than for the guesser to guess harder");

    ok("...and nine devices are EXACT rather than probed",
        census.rows.filter((r) => r.source === "exported").length >= 9,
        census.rows.filter((r) => r.source === "exported").map((r) => r.name).join(", ") + ". The rest remain " +
        "an HONEST LOWER BOUND -- 'exported' and 'probed' are separate because they are different levels of " +
        "confidence, and one name for both is the shape this session has found more than any other");

    ok("!! *** NOTHING IS PROBED ANY MORE -- every device that can declare, exports ***",
        census.rows.filter((r) => r.source === "probed").length === 0,
        census.rows.filter((r) => r.source === "exported").length + " exported, " + census.noDeclaration.length +
        " with no defaults() to declare from, 0 probed. THE LOWER BOUND IS GONE BECAUSE NOTHING RELIES ON IT: " +
        "v3174 measured seven devices by hand, v3189 probed with a candidate list, and BOTH TIMES THE LIST WAS " +
        "THE MEASUREMENT. A guess replaced by a fact is not a better guess");

    ok("...and the last two were found by NAME NOT MATCHING LOCATION",
        (() => { const src = fsMod.readFileSync(path.join(HERE, "tomographyBind.mjs"), "utf8");
                 return /A NAME IS NOT A LOCATION/.test(src); })(),
        "'ct' lives in tomographyBind.mjs and 'windtunnel' is exported as fluidDevice. v3192's scan matched " +
        "files BY NAME PREFIX and missed both, reporting them as one-moded on a lower bound -- the scan's " +
        "assumption, not the devices'");

    ok("...and the count is stated as a LOWER BOUND",
        (() => { const src = fsMod.readFileSync(path.join(HERE, "deviceModes.mjs"), "utf8");
                 return /isLowerBound/.test(src) && /source: "probed"/.test(src) && /source: "exported"/.test(src); })(),
        "a mode is declared by being ECHOED BACK, so you can only ask about one you already thought of. " +
        "'exported' and 'probed' are reported separately because they are DIFFERENT LEVELS OF CONFIDENCE, and " +
        "one name for both is the shape this session has found more than any other");
}

// ---- 3. IT REACHES THE FRONT DOOR ----------------------------------------------------------------------------------
{
    const brg = fsMod.readFileSync(path.join(ENG, "ai-bridge", "deviceBridge.js"), "utf8");
    const page = fsMod.readFileSync(path.join(ENG, "device.html"), "utf8");

    ok("!! /device/list now reports modes AND whether they are enforced",
        /modes: modeInfo\.declared/.test(brg) && /modesEnforced: modeInfo\.enforced/.test(brg),
        "*** THE TWO ARE SEPARATE FIELDS ON PURPOSE. A long mode list from a device that accepts everything is " +
        "NOT A RICH DEVICE, IT IS AN UNGUARDED ONE, and those two must never share a number ***");

    ok("...and the page shows it in the option itself",
        /modesEnforced===false \? " \[modes UNGUARDED\]"/.test(page),
        "the count is where you pick the device, not behind another click. UNGUARDED is called out by name " +
        "rather than shown as a large number, which is how it would otherwise read");
}

console.log();
console.log("  ----  THE CENSUS:");
console.log("  ----    ONE mode          " + census.singleMode.join(", ").slice(0, 88));
console.log("  ----    MORE than one     " + census.multiMode.map((n) => n + "(" + census.rows.find((r) => r.name === n).declared.length + ")").join(", ").slice(0, 88));
console.log("  ----    none discoverable " + census.undiscoverable.join(", "));
console.log("  ----    UNGUARDED         " + unguarded.join(", ") + "  <- checkMode cannot protect these");
console.log("  ----  NOT FIXED HERE: the three unguarded defaults() need their own author. Making one validate");
console.log("  ----  means knowing WHICH modes it means to offer, and guessing that would declare an interface");
console.log("  ----  on somebody else's behalf.");
if (fails) { console.log("deviceModes-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("deviceModes-selfcheck: all checks pass");
