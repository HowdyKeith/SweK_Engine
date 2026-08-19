// tools/roundhouse/fdtdBind-selfcheck.mjs
//
// v3734 -- THE ANSWER KEY FOR THE fdtd DEVICE'S DIELECTRIC PATH, AND THE PLANT THAT SHOWED IT WAS UNTESTED.
// Beside the bind (v3724's split); registry-shape checks stay in tools/ship/labDevices-selfcheck.mjs. This
// file imports simulation/em/fdtd1d.js DIRECTLY AND USES IT (v3729's lesson).
//
// *** THIS ROUND OPENED BY CORRECTING A CLAIM I MADE ONE ROUND EARLIER, AND THAT CORRECTION IS THE FIRST
// THING IN IT. *** v3733's notes announced, from two plant rounds, that "a device that grades SHAPE cannot see
// SCALE" as though it were a new finding. IT IS WRITTEN IN fdtdBind.mjs'S OWN HEADER, AT v3318, FROM v2496:
// a mutation sweep moved the speed of light by 3% and every FDTD check stayed green, because vp/c and
// reflection coefficients are RATIOS -- and the `lightspeed` mode was built precisely to close that hole.
// THE TREE ALREADY KNEW. The true and duller statement: the lesson had not propagated to ct or eccentric, and
// two plant rounds rediscovered it because nothing carried it across. A TALLY REPEATED FROM MEMORY RECRUITS
// NEIGHBOURING CASES (v3709), and "I have found a pattern" is the most flattering shape that takes. THE
// DENOMINATOR IS TWO DEVICES I HAPPENED TO PLANT, OUT OF 86.
//
// *** THE HOLE THIS ROUND DOES FIND IS A DIFFERENT ONE, AND IT IS v3730's: A KEY EVALUATED ONLY WHERE ITS
// PARAMETER IS ONE IS BLIND TO EVERY TERM THAT PARAMETER MULTIPLIES. *** 'eps' has been a parameter of
// createFdtd1d since v2487 and NO device mode ever passed it, so all three original modes run in VACUUM.
// The Yee update sets cE[i] = S / epsR[i], and the mistake the API invites is `S / Math.sqrt(epsR[i])` --
// PERMITTIVITY confused with REFRACTIVE INDEX, which are n = sqrt(epsR) apart and differ by exactly one square
// root in the one place a reader half-expects to see one. AT epsR = 1 THE TWO SPELLINGS ARE THE SAME LINE.
//
// MEASURED with the defect planted IN THE SHIPPED MODULE and reverted: dispersion vpErrAbs 1.594e-5, magic
// 0.000e+0 and lightspeed cErrFrac 0.000e+0 -- ALL THREE BIT-IDENTICAL to the honest run -- while the new
// dielectric key goes 2.500e-3 -> 2.925e-1.
//
// WHEN A CHECK HERE GOES RED: the fix is in the update coefficients, NEVER a wider indexErrFrac. The bar is
// 1e-2 and the honest reading is 2.5e-3; the residue below it is PHYSICS and is explained in section 1.

import { fdtdDevice, buildFdtd, slabFlight } from "./fdtdBind.mjs";
import { createFdtd1d, C0 } from "../../simulation/em/fdtd1d.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

// ---- 1. THE DIELECTRIC KEY -------------------------------------------------------------------------------
console.log("1. A WAVE INSIDE epsR TRAVELS AT c/sqrt(epsR) -- exact, external, and in neither file");
const d = await buildFdtd({ mode: "dielectric" });
ok("!! the measured refractive index of an epsR = 4 slab is sqrt(epsR)",
    !d.error && d.indexErrFrac < 1e-2,
    `n ${d.indexMeasured.toFixed(6)} against an exact ${d.indexExact} (v/c ${d.vpInSlab.toFixed(6)}), err ` +
    `${d.indexErrFrac.toExponential(3)} against a bar of 1e-2. NOTHING IN fdtd1d.js OR IN THE BIND CONTAINS ` +
    `sqrt(epsR) -- the solver is only ever told epsR, and n is what comes out`);

// The residue is explained rather than tolerated, and the explanation is the file's own physics.
const sweep = [1, 2, 4, 9].map((e) => {
    const f = slabFlight({ epsR: e });
    return { e, err: Math.abs(f.indexMeasured - Math.sqrt(e)) / Math.sqrt(e) };
});
ok("!! ...and the residue GROWS with epsR, which this solver's own header predicts",
    sweep[0].err < 1e-9 && sweep.every((r, i) => i === 0 || r.err > sweep[i - 1].err),
    sweep.map((r) => `epsR ${r.e}: ${r.err.toExponential(2)}`).join(", ") +
    `. *** INSIDE THE SLAB THE EFFECTIVE COURANT NUMBER IS S/sqrt(epsR), so a run launched AT the magic step ` +
    `S = 1 IS NO LONGER AT IT once the wave crosses in, and the numerical dispersion the magic step suppresses ` +
    `comes back. At epsR = 1 the error is EXACTLY ZERO because the wave never leaves the magic step. THE ` +
    `GROWTH IS ASSERTED, NOT AVERAGED AWAY -- a flat residue here would mean the explanation is wrong. ***`);

// ---- 2. THE DECLARED PLANT, AND WHAT IT LEAVES UNTOUCHED --------------------------------------------------
console.log("\n2. THE PLANT -- permittivity mistaken for refractive index, one square root apart");
const p = await buildFdtd({ mode: "indexconfusion" });
ok("!! the declared plant moves indexErrFrac by two orders",
    p.indexErrFrac / d.indexErrFrac > 50,
    `n ${p.indexMeasured.toFixed(6)} -- which is sqrt(2), not 2 -- err ${p.indexErrFrac.toExponential(3)}, ` +
    `${(p.indexErrFrac / d.indexErrFrac).toFixed(0)}x the honest reading and ` +
    `${(p.indexErrFrac / 1e-2).toFixed(0)}x the bar. At epsR = 4 the wave runs at 0.7071 c where the truth is ` +
    `0.5 c: A 41% ERROR IN THE SPEED OF LIGHT IN GLASS`);

const disp = await buildFdtd({ mode: "dispersion" });
const mag = await buildFdtd({ mode: "magic" });
const ls = await buildFdtd({ mode: "lightspeed" });
ok("!! *** AND ALL THREE ORIGINAL MODES RUN IN VACUUM, WHERE THE TWO SPELLINGS ARE THE SAME LINE ***",
    mag.magicErr < 1e-12 && ls.cErrFrac < 1e-12 && disp.vpErrAbs < 1e-3,
    `with cE = S/sqrt(epsR) planted IN THE SHIPPED MODULE and reverted, dispersion read 1.594e-5, magic ` +
    `0.000e+0 and lightspeed 0.000e+0 -- BIT-IDENTICAL to the honest run. Today's honest readings: ` +
    `${disp.vpErrAbs.toExponential(3)} / ${mag.magicErr.toExponential(3)} / ${ls.cErrFrac.toExponential(3)}. ` +
    `*** epsR = 1 AND sqrt(1) = 1: A KEY EVALUATED ONLY WHERE ITS PARAMETER IS ONE IS BLIND TO EVERY TERM THAT ` +
    `PARAMETER MULTIPLIES (v3730). NOT a gap in those three -- they never claimed to look at dielectrics -- ` +
    `but the device as a whole did, because 'eps' is a shipped parameter it accepted and never exercised. ***`);

ok("the plant is DECLARED the way plantedCoverage's mode contract requires",
    fdtdDevice.plantMode === "indexconfusion" && fdtdDevice.plantFlips === "indexErrFrac" &&
    fdtdDevice.modes.includes(fdtdDevice.plantMode) && fdtdDevice.plantKind === "mode",
    `plantMode "${fdtdDevice.plantMode}" flips "${fdtdDevice.plantFlips}"`);

ok("!! ...and the PRIMARY mode reports the flipped observable, applied BEFORE the sweep complained",
    Number.isFinite(disp.indexErrFrac),
    `dispersion reports indexErrFrac ${disp.indexErrFrac.toExponential(3)}. v3732 and v3733 both shipped a ` +
    `DECLARED-BUT-DEAD plant first and were told by the sweep; this is the first round that applied the ` +
    `lesson in advance, which is the only evidence that writing it down did anything`);

// ---- 3. THE ROUND DID NOT MOVE A VERDICT IT IS NOT ABOUT -------------------------------------------------
console.log("\n3. THE PRE-EXISTING KEYS ARE UNTOUCHED");
ok("!! the magic step is still exact and a SMALLER step is still WORSE",
    mag.magicErr < 1e-12 && mag.errorGrowsAsStepShrinks === true,
    `magicErr ${mag.magicErr.toExponential(3)}, off-magic ${mag.offMagicErr.toExponential(3)} -- the ` +
    `counterintuitive half, unchanged (v3679: a round must not move a verdict it is not about)`);

ok("!! ...and lightspeed still measures c in absolute units, which is the hole v2496 opened",
    ls.cErrFrac < 1e-12,
    `${ls.cMeasured.toExponential(9)} against ${ls.cExact} m/s. THIS MODE IS THE PRECEDENT THIS ROUND'S ` +
    `CORRECTION IS ABOUT: the tree closed a scale hole here at v3318, and nothing carried that across to the ` +
    `other 85 devices`);

ok("every key measured in every mode is declared",
    [disp, mag, ls, d, p].every((o) => Object.keys(o).every((k) => fdtdDevice.observables.includes(k))),
    `${fdtdDevice.observables.length} declared observables across ${fdtdDevice.modes.length} modes`);

ok("the slab measurement is EXPORTED and driven here, so this gate measures the same way the device does",
    typeof slabFlight === "function" && typeof createFdtd1d === "function" &&
    Math.abs(slabFlight({ epsR: 4 }).indexMeasured - d.indexMeasured) < 1e-12,
    "two copies of a fixture are two declarations about one experiment that nobody ever compares");

report("WHAT THIS DOES NOT CLAIM",
    "That the dielectric path is correct in general. ONE slab, ONE interface, normal incidence, 1-D, and the " +
    "REFLECTION coefficient at the boundary is UNGRADED -- it is a ratio, (n1-n2)/(n1+n2), and would have been " +
    "blind to this very plant in the same way vp/c was blind at v2496. Grading it needs its own key and is " +
    "not smuggled in here.");

console.log("\nfdtdBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
