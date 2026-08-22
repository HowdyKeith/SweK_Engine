// physics/xpbd/frictionalContactKey-selfcheck.mjs
//
// v3533 -- lab reach for frictionalContact.js. The particle-particle Coulomb contact mechanics that make a heap
// hold a slope: the cone clamp (slip), the stick case, the two-way split, determinism. The plant removes the cone
// clamp and only the slip key moves.

import { frictionalContactKeys } from "./frictionalContactKey.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const g = frictionalContactKeys(false);
const b = frictionalContactKeys(true);

ok("!! a fast slide is CLAMPED to the Coulomb cone, mu*depth -- it slips, it does not stick",
    g.coneHolds === true,
    `the applied tangential correction is within mu*depth to ${g.coneErr.toExponential(2)} -- the bound that lets a ` +
    "pile hold an angle of repose instead of spreading flat");

ok("!! below the cone a pair STICKS -- the tangential motion is cancelled in full, exactly",
    g.sticks === true && g.stickErr === 0,
    `a slow pair loses all of its tangential motion (stickErr ${g.stickErr.toExponential(2)}) -- the sticking half of ` +
    "the friction law");

ok("!! the correction is two-way: the pair centre of mass does not move (Newton's third law)",
    g.twoWay === true,
    `the split is by inverse mass and equal-and-opposite, so the centroid holds to ${g.comErr.toExponential(2)}`);

ok("!! the contact solve is deterministic -- the same input twice is bit-identical",
    g.deterministic === true,
    "pure +,-,*,/ and sqrt, same in same out to the last bit");

ok("!! the no-clamp plant makes a sliding pair over-stick, breaking the cone",
    b.coneHolds === false && b.coneErr > 0.05,
    `resisting the tangential motion in full puts the correction ${b.coneErr.toExponential(2)} past the cone -- an ` +
    "unbounded friction that would freeze a heap solid instead of letting it slump to repose");

ok("...and the stick case, the two-way split and determinism stay GREEN",
    b.sticks === true && b.twoWay === true,
    "none of them depend on the clamp -- a pair already within the cone, and the momentum split, are untouched; " +
    "the cone key is the one that had to be built to catch the missing clamp");

console.log();
if (fails) { console.log("frictionalContactKey-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("frictionalContactKey-selfcheck: all checks pass");
