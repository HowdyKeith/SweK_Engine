// tools/roundhouse/bonefieldBind-selfcheck.mjs
//
// v3522 -- THE BONEFIELD DEVICE (Round 2, cont'd). physics/soft/boneField.js turns a skeleton into a signed
// distance field of capsules. Three facts to single precision, and the plant is the module's own warning: remove
// the segment clamp and every capsule becomes an infinite cylinder -- "limbs that reach out of the room."

import { bonefieldDevice } from "./bonefieldBind.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const g = bonefieldDevice.build({ mode: "capsule" });
const b = bonefieldDevice.build({ mode: "capsule", config: { planted: true } });

ok("!! the distance to the middle of a bone is the perpendicular distance minus the radius",
    g.segmentExact === true,
    `the mid-segment field matches perp - r to ${g.segmentErr.toExponential(2)} (single precision) -- the capsule ` +
    "is an EXACT distance, which is what lets a marched mesh be graded against it");

ok("!! beyond an endpoint the distance is a spherical CAP, |p - a| - r -- the segment clamp",
    g.capClamped === true,
    `a point one unit past the end reads ${g.capErr.toExponential(2)} from the closed-form cap distance -- the ` +
    "clamp is what makes a bone a segment and not an infinite line");

ok("!! with blend 0 the union of two bones is plain min of their distances",
    g.unionIsMin === true,
    `the two-bone field matches min(d1, d2) to ${g.unionErr.toExponential(2)} -- flesh is the union of the capsules`);

ok("!! the field is deterministic -- a pure function of the bones, bit-identical across builds",
    g.deterministic === true,
    "same bones in, same field out to the bit -- a deterministic skeleton must not wear a non-deterministic skin");

ok("!! the unclamped plant turns the capsule into an infinite cylinder, wrong beyond the endpoints",
    b.capClamped === false && b.capErr > 0.5,
    `without the clamp, a point 0.7 OUTSIDE the flesh is reported inside -- capErr jumps to ${b.capErr.toExponential(2)}. ` +
    "This is the limbs-reaching-out-of-the-room failure the module names");

ok("...and the mid-segment distance and the union stay GREEN",
    b.segmentExact === true && b.unionIsMin === true,
    "the clamp only matters past the ends, so the perpendicular distance and the union -- which never leave the " +
    "clamped interval -- do not move; the cap key is the one that had to be built to catch the missing clamp");

console.log();
if (fails) { console.log("bonefieldBind-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("bonefieldBind-selfcheck: all checks pass");
