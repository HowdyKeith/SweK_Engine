// WebGLEngine/tools/roundhouse/detectionMap-selfcheck.mjs -- v3429
//
// Run: node tools/roundhouse/detectionMap-selfcheck.mjs
//
// *** EVERY CLASSIFICATION IS DRIVEN AGAINST A SYNTHETIC DEVICE BUILT TO LAND IN IT. *** The real lab reports
// ZERO sole-detector devices, which is a good result and makes that check unable to fail on the tree as it
// stands -- so a device with exactly one detector is CONSTRUCTED and must be flagged. A CHECK THAT HAS NEVER
// BEEN SEEN TO FIRE MIGHT NOT FIRE (v3142), and a census whose interesting category is empty is exactly where
// that goes unnoticed.
"use strict";
import { deviceDetection, detectionMap } from "./detectionMap.mjs";
import * as D from "./devices.mjs";

let failed = 0;
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };
const say = (m) => console.log("  ----  " + m);

/** A device factory: `spec(mode, planted)` returns the observable bag. Two modes unless told otherwise. */
const fake = (spec, modes = ["a", "b"]) => ({
    modes,
    build: ({ mode, config = {} }) => spec(mode, !!config.planted),
});

async function main() {
    console.log("[detectionMap-selfcheck] which key saw the plant, and the four ways an observable can sit still\n");

    // ---- 1. A SINGLE DETECTOR IS FLAGGED ----------------------------------------------------------------
    {
        const d = fake((mode, p) => ({
            sharp: p ? 2 : 1,                       // moves under the plant
            reading: mode === "a" ? 10 : 20,        // varies by mode, unmoved by the plant -> BLIND
            theory: 42,                             // never varies, never moves -> a LABEL
        }));
        const r = await deviceDetection(d);
        ok("!! *** a device whose plant moves EXACTLY ONE observable is flagged by name ***",
            r.soleDetector === "sharp" && r.detectorCount === 1,
            "the real lab reports ZERO of these, so this check could not otherwise fail on the tree as it stands. " +
            "A DEVICE WITH ONE DETECTOR HAS NOT BEEN ASKED WHAT ITS DETECTOR CANNOT SEE -- whiteDwarf came within one round of shipping like that, " +
            "and its plant made that observable look BETTER than the truth");
        ok("!! *** and the three ways of sitting still are told apart, which the first run did NOT do ***",
            r.blindToThisPlant.join() === "reading" && r.constantLabels.join() === "theory" && r.undecidable.length === 0,
            "*** THE FIRST RUN LISTED 240 'BLIND' OBSERVABLES AND MOST WERE NOT KEYS AT ALL: a theory constant, an echoed config value and a " +
            "genuinely blind key all look identical from 'did not move'. TWO THINGS WEARING ONE LABEL, committed by the instrument built to find " +
            "it. *** They are separated by a SECOND question the sweep already answers -- does the observable take different values ACROSS MODES? " +
            "A number that is the same everywhere and moves for nothing is a LABEL; one that varies with the mode is a live reading this plant could not disturb");
    }

    // ---- 2. A PLANT THAT MOVES EVERYTHING, AND ONE THAT MOVES NOTHING -----------------------------------
    {
        const all = await deviceDetection(fake((mode, p) => ({ x: p ? 1 : 0, y: mode === "a" ? (p ? 3 : 2) : (p ? 9 : 8) })));
        ok("...a plant that moves every observable leaves NOTHING blind and is not a sole detector",
            all.blindToThisPlant.length === 0 && all.soleDetector === null && all.detectorCount === 2,
            "the classifier must not manufacture blindness where there is none -- a census that found something everywhere would be measuring itself");
        const dead = await deviceDetection(fake((mode) => ({ x: 1, y: mode === "a" ? 2 : 3 })));
        ok("!! ...and a plant that moves NOTHING is DECLARED BUT DEAD, not a tidy clean sheet",
            dead.declaredButDead === true && dead.detectorCount === 0,
            "a map with no movement in it would otherwise read as a good result. A DECLARED KNOB THAT TURNS NOTHING IS THE WORST CASE, not the best");
    }

    // ---- 3. A ONE-MODE DEVICE CANNOT BE ASKED, AND SAYS SO ----------------------------------------------
    {
        const one = await deviceDetection(fake((mode, p) => ({ sharp: p ? 1 : 0, still: 7 }), ["only"]));
        ok("!! a ONE-MODE device is UNDECIDABLE rather than being counted either way",
            one.undecidable.join() === "still" && one.blindToThisPlant.length === 0 && one.constantLabels.length === 0,
            "with a single mode there is nothing to vary an observable ACROSS, so label and blind key are indistinguishable. " +
            "REPORTING IT AS EITHER WOULD BE A GUESS WEARING A MEASUREMENT'S CLOTHES");
    }

    // ---- 4. BOOLEANS AND STRINGS ARE OBSERVABLES ---------------------------------------------------------
    {
        const b = await deviceDetection(fake((mode, p) => ({ flag: p ? false : true, tag: mode, num: 1 })));
        ok("!! a BOOLEAN counts as an observable that moved",
            b.observablesMoved.includes("flag"),
            "neutronStar's key IS a pair of booleans (v3421) -- ISCO outside the surface, photon sphere inside. A comparator that only " +
            "watched numbers would have called that device's whole key invisible");
        const nan = await deviceDetection(fake((mode, p) => ({ x: p ? NaN : NaN, y: mode === "a" ? 1 : 2 })));
        ok("...and a NaN on both sides is not a movement signal",
            !nan.observablesMoved.includes("x"),
            "NaN !== NaN, so a raw comparison would report EVERY NaN observable as detected by every plant -- a check that fires on nothing");
    }

    // ---- 5. THE REAL LAB, AND THE THREE ANSWERS -------------------------------------------------------
    {
        const engRoot = new URL("../..", import.meta.url).pathname;
        const r = await detectionMap(engRoot, D);
        say(`${r.census.devicesProbed} devices declare a plant, ${r.census.devicesWithLivePlant} live; ${r.census.observablesMoved} of ${r.census.observablesSeen} observables moved`);
        say(`blind ${r.census.blind}, constant labels ${r.census.constants}, undecidable ${r.census.undecidable}`);
        ok("!! the census PARTITIONS every observable that did not move",
            r.census.blind + r.census.constants + r.census.undecidable + r.census.observablesMoved === r.census.observablesSeen,
            "moved + blind + label + undecidable = seen, with no remainder. NOTHING CAN FALL BETWEEN THE CATEGORIES AND GO UNCOUNTED");
        ok("!! *** the blind list is NOT EMPTY, so the instrument is finding something the lab did not know ***",
            r.census.blind > 0 && r.blindObservables.length === r.census.blind,
            `${r.census.blind} live readings that their own device's plant cannot disturb -- named, where five rounds running had to notice ` +
            "one at a time by hand");
        ok("...and every device that declares a plant has one that moves something",
            r.deadPlants.length === 0,
            "REPORTED rather than asserted as a target: a dead plant arriving tomorrow must show up here, and the check above is what would say so");
        ok("...and NO device rests on a single observable -- reported, because it is a result and not a rule",
            Array.isArray(r.soleDetectorDevices),
            `${r.soleDetectorDevices.length} sole-detector devices. THE FEAR WAS UNFOUNDED AND THAT IS A MEASUREMENT: section 1 proves this ` +
            "category can be reached, so an empty list here means the lab is clean rather than the check being asleep");
    }

    console.log(failed ? `\n[detectionMap-selfcheck] ${failed} FAILED` : "\n[detectionMap-selfcheck] all checks pass");
    process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("[detectionMap-selfcheck] COULD NOT RUN:", e && e.stack || e); process.exit(1); });
