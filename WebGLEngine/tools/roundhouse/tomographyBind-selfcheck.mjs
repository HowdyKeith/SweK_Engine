// tools/roundhouse/tomographyBind-selfcheck.mjs
//
// v3732 -- THE ANSWER KEY FOR THE ct DEVICE'S ABSOLUTE HALF, AND THE PLANT THAT SHOWED IT WAS MISSING.
// Beside the bind (v3724's split); registry-shape checks stay in tools/ship/labDevices-selfcheck.mjs. This
// file imports physics/tomography/ct.js DIRECTLY AND USES IT (v3729's lesson).
//
// *** WHAT THE ROUND FOUND. The curriculum asked for a PLANT on `ct`. Choosing one meant asking which wrong
// derivation this API invites, and the answer was the angular weight: angleSet returns [0, pi), nothing in the
// call signature mentions dtheta, and "a sweep is a sweep, just add the views up" is one line away.
// THEN THE PLANT DID NOT FIRE ON ANYTHING THE DEVICE REPORTED. ***
//
// Every observable ct had carried since v2814 is a CORRELATION, and scoreRecon's corr is PEARSON: invariant to
// scale AND offset. Its sibling `rms` is worse -- it FITS the gain out (g = cov/vr) before measuring the
// residual, so it survives any invertible affine map INCLUDING A SIGN FLIP. Multiply a finished reconstruction
// by 1, 2, 17 or -3 and corr reads 0.992068153755 every time; rms reads 0.125701146794 every time; at -3 even
// the SIGN of the picture is inverted and rms does not move.
//
// *** SO THIS IS A GAP AND NOT A DECLARED BLINDNESS. *** v3715's rule is to ask whether the observable ever
// CLAIMED to look -- and here it did: the bind's own header says a reconstruction lab answers "did the
// reconstruction work", and CT's whole purpose is ABSOLUTE density (Hounsfield units are absolute). A picture
// correct only up to a factor of 76 did not work. That is v3713's shape -- a gap closed by a NEW OBSERVABLE --
// not v3715's, where an invariant is blind by construction and the gate asserts the blindness instead.
//
// THE NEW KEY IS NOT "gain = 1" TYPED IN. It is that THE GAIN DOES NOT DEPEND ON THE VIEW COUNT, because
// backProject's scale = pi/angles.length exactly compensates each added view. The honest run is flat to
// 1.68e-3 across a factor of eight in views; the plant tracks the view count LINEARLY.
//
// WHEN A CHECK HERE GOES RED: the fix is in the reconstruction's normalisation, NEVER a wider gainViewSpread --
// the flatness is what the dtheta weight is FOR. And do not "fix" a red absoluteGain by asserting gain = 1: the
// 2.5% shortfall from unity is discretisation, it is REPORTED rather than asserted, and tightening it would
// fail correct code (v3675).

import { buildCT, ctDevice, affineGain } from "./tomographyBind.mjs";
import { phantomField, radon, filteredBackProjection, scoreRecon, angleSet } from "../../physics/tomography/ct.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const PHANTOM = [{ cx: 0, cy: 0, a: 0.7, b: 0.5, rho: 1 }, { cx: 0.25, cy: 0.15, a: 0.2, b: 0.15, rho: 0.6 }, { cx: -0.3, cy: -0.2, a: 0.12, b: 0.12, rho: -0.4 }];

// ---- 1. WHAT THE SHIPPED OBSERVABLES CANNOT SEE, SHOWN RATHER THAN ASSERTED ------------------------------
console.log("1. THE BLINDNESS, DEMONSTRATED ON A FINISHED RECONSTRUCTION");
const N = 96, nDet = 96, img = phantomField(N, PHANTOM);
const ang = angleSet(120);
const rec = filteredBackProjection(radon(img, N, ang, nDet), N, ang, nDet, true);
const base = scoreRecon(rec, img);
const scaled = [2, 17, -3].map((k) => ({ k, s: scoreRecon(rec.map((v) => v * k), img) }));
ok("!! *** corr AND rms ARE BOTH BLIND TO AN ARBITRARY GAIN -- AND rms SURVIVES A SIGN FLIP ***",
    scaled.every((x) => Math.abs(Math.abs(x.s.corr) - base.corr) < 1e-12 && Math.abs(x.s.rms - base.rms) < 1e-12),
    `corr ${base.corr.toFixed(12)} and rms ${base.rms.toFixed(12)} on the honest picture; scaling it by ` +
    scaled.map((x) => `${x.k} -> rms ${x.s.rms.toFixed(12)}`).join(", ") +
    `. At -3 THE PICTURE IS INVERTED and rms does not move, because it fits the gain out before measuring`);

// ---- 2. THE NEW KEY: THE GAIN DOES NOT TRACK THE VIEW COUNT ----------------------------------------------
console.log("\n2. THE ABSOLUTE HALF -- and the key is a FLATNESS, not a typed constant");
const g = await buildCT({ mode: "gain" });
ok("!! the absolute gain does not depend on how many views were taken",
    !g.error && g.gainViewSpread < 1e-2,
    `${g.gainAtViews.map((v) => v.toFixed(4)).join(" / ")} across ${g.gainViews.join(" / ")} views -- spread ` +
    `${g.gainViewSpread.toExponential(3)} across a factor of EIGHT. backProject's scale = pi/angles.length is ` +
    `what buys that, and it is the only thing that does`);

report("THE 2.5% SHORTFALL FROM UNITY IS REPORTED, NOT ASSERTED",
    `absoluteGain reads ${g.absoluteGain.toFixed(6)} at the 120-view default with an offset of ` +
    `${g.absoluteOffset.toExponential(2)}. That residue is DISCRETISATION -- a finite detector count and a ` +
    `nearest-bin back-projection -- and pinning it to 1.0 would fail correct code (v3675). THE FLATNESS IS THE ` +
    `CLAIM; the value is the report.`);

// ---- 3. THE DECLARED PLANT -------------------------------------------------------------------------------
console.log("\n3. THE PLANT -- a MODE, declared, and it overturns the observable it names");
const u = await buildCT({ mode: "unweighted" });
ok("!! the declared plant moves absoluteGain by a factor of 38 at the default view count",
    u.absoluteGain / g.absoluteGain > 30,
    `honest ${g.absoluteGain.toFixed(4)} -> planted ${u.absoluteGain.toFixed(4)} ` +
    `(${(u.absoluteGain / g.absoluteGain).toFixed(1)}x)`);

ok("!! ...and it does so BY TRACKING THE VIEW COUNT, which is the signature of a missing dtheta",
    u.gainViewSpread > 1,
    `planted gains ${u.gainAtViews.map((v) => v.toFixed(2)).join(" / ")} across ${u.gainViews.join(" / ")} ` +
    `views -- each doubling of the views doubles the gain, spread ${u.gainViewSpread.toExponential(3)} against ` +
    `the honest ${g.gainViewSpread.toExponential(3)}`);

// *** THE CHECK THIS WHOLE ROUND EXISTS FOR. ***
const worstCorrDiff = Math.max(...g.corrAtViews.map((c, i) => Math.abs(c - u.corrAtViews[i])));
ok("!! *** AND EVERY CORRELATION THE DEVICE REPORTED IS UNCHANGED TO FOURTEEN DIGITS ***",
    worstCorrDiff < 1e-13,
    `worst |difference| ${worstCorrDiff.toExponential(2)} across ${g.gainViews.length} view counts, while the ` +
    `gain moved ${(u.absoluteGain / g.absoluteGain).toFixed(0)}x. *** NOT bit-identical -- 1.07e-14 at 120 views ` +
    `is float rounding, and saying "identical" would have been a claim the measurement does not support -- but ` +
    `THE SHIPPED OBSERVABLE MOVES BY 1e-14 WHERE THE TRUTH MOVES BY 3800%. A PLANT THAT DOES NOT FIRE IS EITHER ` +
    `A FINDING OR A BADLY CHOSEN PLANT, AND THIS ONE IS THE FIRST: the plant is real, it sits on the DEFAULT ` +
    `path, and the observables were the wrong ones. ***`);

ok("the plant is DECLARED the way plantedCoverage's mode contract requires",
    ctDevice.plantMode === "unweighted" && ctDevice.plantFlips === "absoluteGain" &&
    ctDevice.modes.includes(ctDevice.plantMode) && ctDevice.plantKind === "mode",
    `plantMode "${ctDevice.plantMode}" flips "${ctDevice.plantFlips}" -- a mode that is not in modes is not a ` +
    `plant, and a plant that does not name what it overturns cannot be verified, since building two DIFFERENT ` +
    `modes trivially produces different numbers`);

// ---- 4. THE ROUND DID NOT MOVE A VERDICT IT IS NOT ABOUT --------------------------------------------------
console.log("\n4. THE PRE-EXISTING KEYS ARE UNTOUCHED");
const p = await buildCT({ mode: "parallel" });
ok("!! the parallel-beam keys still read what they read before this round",
    p.fbpCorr > 0.99 && p.rampGain > 0 && p.bpCorr < p.fbpCorr,
    `fbpCorr ${p.fbpCorr.toFixed(6)}, bpCorr ${p.bpCorr.toFixed(6)}, rampGain ${p.rampGain.toFixed(6)} -- the ` +
    `filter IS the reconstruction and that claim is unchanged (v3679: a round must not move a verdict it is ` +
    `not about)`);

ok("every key measured in every mode is declared",
    [g, u, p].every((o) => Object.keys(o).every((k) => ctDevice.observables.includes(k))),
    `${ctDevice.observables.length} declared observables across ${ctDevice.modes.length} modes`);

ok("the gain fit is EXPORTED and driven here, so this gate measures the same way the device does",
    typeof affineGain === "function" &&
    Math.abs(affineGain(rec, img).gain - g.absoluteGain) < 1e-9,
    "two copies of a fit are two declarations about one measurement that nobody ever compares");

report("WHAT THIS DOES NOT CLAIM",
    "That the reconstruction is correct in absolute units. The gain is FLAT and it is 0.9746, not 1 -- so what " +
    "is established is that the normalisation does not drift with the view count, NOT that the scale is right. " +
    "Fixing the 2.5% would need a detector-width term this bench does not model, and inventing one to make the " +
    "number prettier would be fabricating provenance.");

console.log("\ntomographyBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
