#!/usr/bin/env node
// WebGLEngine/tools/ship/dockFraming-selfcheck.mjs -- v4304
//
// GATES tools/ship/dockFraming.mjs, the noise-floor instrument for the robot dock (#86, the precondition #83
// stated for itself: "establish the noise floor by running one config 3-4 times BEFORE reading any delta").
//
// What is asserted: the instrument measures the real dock (278 x 88 on battleship3d.html, the same strip
// v4107 measured), every shot is a fraction with something drawn, the spread is REPORTED as sd/min/max, the
// frozen record reconciles with its own fractions, and a fresh measurement lands inside the record's range
// widened by three of its sd. The last line is the one that can go red for a real reason: a framing change
// that moves the dock's coverage further than the floor allows is a change, and this says so; one inside the
// floor is noise, and no delta smaller than this may be read as a result.
//
// Run: node tools/ship/dockFraming-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as DF from "./dockFraming.mjs";
import { spread } from "./pngCoverage.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (c, name, detail) => { console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);

// ---------------------------------------------------------------------------------------------------------
sec("1. THE RECORD RECONCILES WITH ITS OWN SHOTS");
// ---------------------------------------------------------------------------------------------------------
{
    const R = DF.NOISE_FLOOR_V4304, s = spread(R.fractions);
    ok(R.fractions.length === R.shots && R.shots >= 4, "four or more shots of one configuration", `${R.shots} shots, ${R.gapMs} ms apart`);
    ok(Math.abs(s.mean - R.mean) < 0.001 && Math.abs(s.sd - R.sd) < 0.001 && s.min === R.min && s.max === R.max,
       "*** mean, sd, min and max are the arithmetic of the recorded fractions, not typed beside them ***",
       `mean ${s.mean.toFixed(3)} sd ${s.sd.toFixed(3)} [${s.min}, ${s.max}]`);
    ok(R.width === 278 && R.height === 88, "and it is the 278 x 88 strip v4107 and #86 measured", `${R.width}x${R.height}`);
    ok(/depth wander/.test(R.note || ""), "the record says the floor was taken with the v4304 depth wander in place");
    ok(Object.isFrozen(R) && Object.isFrozen(R.fractions), "the record is frozen");
    const src = fs.readFileSync(path.join(ENG, "tools/ship/pngCoverage.mjs"), "utf8"), af = fs.readFileSync(path.join(ENG, "tools/ship/avatarFraming-selfcheck.mjs"), "utf8");
    ok(/export function decodePNG/.test(src) && /export function subjectFraction/.test(src) && /from "\.\/pngCoverage\.mjs"/.test(af) && !/^function decodePNG/m.test(af),
       "the decoder and the metric are shared with avatarFraming-selfcheck, which no longer carries its own copy");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. A FRESH MEASUREMENT: THE INSTRUMENT MEASURES, AND THE DOCK IS WHERE THE RECORD SAYS");
// ---------------------------------------------------------------------------------------------------------
const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skip) { console.log("  SKIP  section 2 -- " + skip); } else {
    let r = null, err = null;
    try { r = await DF.measureDock({ shots: 4 }); } catch (e) { err = e; }
    ok(!err && r, "*** the dock canvas on battleship3d.html was found, drew, and was shot four times ***", err ? String(err && err.message).slice(0, 140) : `${r.width}x${r.height}`);
    if (r) {
        const R = DF.NOISE_FLOOR_V4304;
        ok(r.width === R.width && r.height === R.height, "the strip is the recorded size", `${r.width}x${r.height}`);
        ok(r.fractions.length === 4 && r.fractions.every((f) => f > 0.05 && f < 0.9), "every shot has a subject: coverage between 5% and 90%", r.fractions.map((f) => f.toFixed(3)).join(" "));
        ok(Number.isFinite(r.sd) && r.max >= r.min, "the spread is reported", `sd ${r.sd.toFixed(3)}, range [${r.min.toFixed(3)}, ${r.max.toFixed(3)}]`);
        const lo = R.min - 3 * R.sd, hi = R.max + 3 * R.sd;
        ok(r.mean >= lo && r.mean <= hi,
           "*** the fresh mean lies inside the recorded floor widened by three sd -- nothing has moved the framing ***",
           `${r.mean.toFixed(3)} in [${lo.toFixed(3)}, ${hi.toFixed(3)}]; a mean outside this is a real change and the record must be re-taken with its reason`);
        ok(r.sd <= 4 * R.sd + 0.01, "and the fresh spread is of the recorded order -- the subject has not started thrashing", `${r.sd.toFixed(3)} vs ${R.sd}`);
    }
}

// ---- SABOTAGE LOG ---------------------------------------------------------------------------------------
//
//   A  the record's mean retyped as 0.285 beside fractions that average 0.255.
//      -> exit=1, section 1: the arithmetic line. A record whose summary is typed beside its data can drift
//      from it; this is the line that stops that.
//
//   B  the wide diorama's halfH pulled from 0.92 to 0.60 -- the "crop vertically" candidate from #83.
//      -> exit=1, section 2: fresh mean 0.312 against a floor of [0.206, 0.299]. *** THIS IS THE INSTRUMENT
//      DOING ITS JOB: *** the candidate moves coverage by five sd, so it is a REAL change and not wander noise
//      -- which is exactly the question v4107 could not answer. Whether the change is GOOD (a taller subject
//      or a cropped one) is a question for eyes, and the before/after shots for it are in the v4304 note.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: whether the framing is GOOD. This is the ruler, not the verdict; #83's cover-fit " +
    "candidates are to be read against NOISE_FLOOR_V4304 with this instrument, and a delta under three sd is not a delta.");
process.exit(fails ? 1 : 0);
