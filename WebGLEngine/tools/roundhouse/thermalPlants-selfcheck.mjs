// tools/roundhouse/thermalPlants-selfcheck.mjs -- v3850
//
// *** THE THERMAL FOUR HAD NO BIND GATE BETWEEN THEM. *** thermal (v2817), melt (v3618), freeze (v3619) and
// vaporize (v3620) are all registered devices with real external keys -- the Stefan solution, Clausius-
// Clapeyron, an emergent diffusivity, a two-route expansion ratio -- and the only thing asserting anything
// about them AS DEVICES was labDevices-selfcheck's registry contract. Nothing drove a plant, because none of
// them had one.
//
// ONE GATE FOR FOUR DEVICES, and that is a deliberate departure from one-gate-per-bind. What these four share
// is not a fixture, it is a ROUND: they are the thermal arc off the census's uncovered list, every plant here
// is a mode plant adjudicated by the same contract, and three of the four turned out to be plants the tree had
// ALREADY RUN AND THROWN AWAY. Splitting that into four files would split one argument into four.
// (Precedent: cflStabilityKeys-selfcheck grades two modules in one gate for the same reason.)
//
// *** THE SHAPE THIS ROUND KEEPS FINDING, NOW FOR THE FOURTH, FIFTH AND SIXTH TIME: A MEASUREMENT MADE AND
// DISCARDED IS NOT COVERAGE. ***
//   melt   -- ships `naive`, a wrong solver its own header calls a "negative control". By plantedCoverage's
//             OWN discriminator it is a PLANT: a control moves the observable TO its ideal, a plant moves it
//             AWAY, and naive has no front at all. It was a plant wearing a control's name for 200 versions.
//   freeze -- v3619 ran a 3% freeze-only timestep sabotage, measured that the FIELD control catches it and the
//             FRONT control does not, wrote the sentence, and kept no mode.
//   thermal / vaporize -- genuinely new plants, both one character wide.
//
// RUNTIME 15 s MEASURED with time(1), against verify.mjs's 180 s per-gate budget. The cost is thermal's LBM
// runs; the phase-change devices are arithmetic and cost nothing.
"use strict";
import { probeModePlant } from "./plantedCoverage.mjs";
import { thermalDevice } from "./thermalBind.mjs";
import { meltDevice } from "./meltBind.mjs";
import { freezeDevice } from "./freezeBind.mjs";
import { vaporizeDevice } from "./vaporizeBind.mjs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const say = (m) => console.log("  " + m);

/**
 * THE CONTRACT, ASSERTED THE SAME WAY FOR ALL FOUR -- and it is asserted through probeModePlant ITSELF rather
 * than through a local re-implementation of it. *** THAT IS THE POINT: mpmrefine declared a BOOLEAN observable
 * from v3802 to v3849 and every gate it had passed the whole time, because no gate ran the census's own
 * adjudicator. A plant that fires and cannot be adjudicated is, in the census, indistinguishable from no plant
 * at all. ***
 */
async function contract(name, dev, { mode, flips, primary }) {
    ok(dev.plantMode === mode && dev.plantFlips === flips,
        `${name}: declares plantMode=${mode} plantFlips=${flips} (got ${dev.plantMode}/${dev.plantFlips})`);
    ok(dev.modes.includes(mode), `${name}: the plant mode is in the modes list, or it is not a plant at all`);
    ok(dev.modes[0] === primary,
        `${name}: modes[0] must be "${primary}" -- the mode that OWNS ${flips}, because probeModePlant compares ` +
        `against modes.find(m => m !== plantMode). Got "${dev.modes[0]}"`);

    const r = await probeModePlant(dev);
    ok(r && r.ok === true,
        `${name}: THE CENSUS'S OWN ADJUDICATOR REFUSES IT -- ${r ? r.why : "no declaration found"}`);
    if (r && r.ok) say(`${name.padEnd(9)} ${flips}: ${typeof r.from === "number" ? r.from.toExponential(4) : r.from}` +
                       ` -> ${typeof r.to === "number" ? r.to.toExponential(4) : r.to}`);

    // AND THE VALIDATOR MUST LIST THE PLANT MODE. v3806 wrote one as `if (mode !== primary) mode = primary`,
    // which SILENTLY REVERTED the plant -- both arms read an identical number and it fired at nothing.
    const back = dev.defaults({ mode });
    ok(back && back.mode === mode, `${name}: defaults() drops the plant mode -- it would silently revert`);
    const junk = dev.defaults({ mode: "nonsense-mode-xyz" });
    ok(junk && junk.mode !== "nonsense-mode-xyz", `${name}: defaults() accepts an undeclared mode`);
    return r;
}

console.log("== THE CONTRACT: four plants, adjudicated by the census's own probeModePlant ==");
const rT = await contract("thermal",  thermalDevice,  { mode: "onedmoment", flips: "alphaErrFrac",       primary: "diffuse" });
const rM = await contract("melt",     meltDevice,     { mode: "naive",      flips: "moltenFraction",     primary: "front" });
const rF = await contract("freeze",   freezeDevice,   { mode: "slowfreeze", flips: "controlFieldMirror", primary: "control" });
const rV = await contract("vaporize", vaporizeDevice, { mode: "celsius",    flips: "routeGap",           primary: "ratio" });

console.log("\n== thermal: THE PLANT IS A DIMENSION, and the KEY does not move ==");
{
    const a = await thermalDevice.build({ mode: "diffuse" });
    const b = await thermalDevice.build({ mode: "onedmoment" });
    ok(b.alphaErrFrac > 0.9 && a.alphaErrFrac < 1e-3,
        `alphaErrFrac ${a.alphaErrFrac.toExponential(3)} -> ${b.alphaErrFrac.toExponential(3)}: <r^2> = 4*alpha*t ` +
        "in 2D, and the 1-D law 2*alpha*t is one character. The spot still spreads and the fit is still clean");
    ok(Math.abs(b.alphaMeasured - 2 * a.alphaMeasured) < 1e-12,
        `!! and it is EXACTLY a factor of two: alphaMeasured ${a.alphaMeasured.toFixed(6)} -> ${b.alphaMeasured.toFixed(6)}. ` +
        "A dimension error is not a perturbation, it is a rescaling, and the exact factor is what says so");
    ok(a.alphaTheory === b.alphaTheory,
        `!! *** AND THE ANSWER KEY DOES NOT MOVE: alphaTheory ${a.alphaTheory} in both arms. *** It is computed ` +
        "from tau_g and the plant lives in the INFERENCE, so the whole excursion belongs to the measurement " +
        "under grade. A plant that moved both sides would be measuring nothing");
}

console.log("\n== melt: THE OBSERVABLE HAD TO BE ONE THAT SURVIVES THE DEFECT ==");
{
    const a = await meltDevice.build({ mode: "front" });
    const b = await meltDevice.build({ mode: "naive" });
    ok(a.solverFront !== null && b.solverFront === null,
        `!! *** THE NAIVE ARM HAS NO FRONT AT ALL -- solverFront ${a.solverFront.toFixed(6)} -> ${b.solverFront}. *** ` +
        "This is why the declared observable is moltenFraction and NOT frontRelErr: frontRelErr is null there, " +
        "and probeModePlant requires a finite number in BOTH arms. Declaring the obvious one would have " +
        "produced exactly the DECLARED BUT DEAD reading mpmrefine carried from v3802 to v3849");
    ok(b.moltenFraction === 1 && a.moltenFraction < 0.5,
        `moltenFraction ${a.moltenFraction} -> ${b.moltenFraction}: the plant PINS THE OBSERVABLE AT ITS CEILING. ` +
        "The ratio is only 3.25x and that is not the content -- every one of the 400 cells is above Tm, which " +
        "is the statement that the front the device exists to locate does not exist");
    ok(a.exactFront === b.exactFront,
        `!! and the EXTERNAL key is untouched: exactFront ${a.exactFront.toFixed(6)} in both arms -- it comes ` +
        "from the Stefan transcendental and knows nothing about which solver ran");
}

console.log("\n== freeze: THE PLANT'S REAL SUBJECT IS THE CHEAPER OBSERVABLE'S BLINDNESS ==");
{
    const a = await freezeDevice.build({ mode: "control" });
    const b = await freezeDevice.build({ mode: "slowfreeze" });
    ok(b.controlFieldMirror > 1e-6 && a.controlFieldMirror < 1e-12,
        `controlFieldMirror ${a.controlFieldMirror.toExponential(4)} -> ${b.controlFieldMirror.toExponential(4)}, ` +
        "a separation of 2.0e9 off machine zero, from a 3% timestep change on the FREEZE BRANCH ONLY");
    ok(a.controlFrontTie === true && b.controlFrontTie === true && a.freezeFront === b.freezeFront,
        `!! *** AND THE FRONT-BASED CONTROL DOES NOT NOTICE AT ALL: controlFrontTie true -> true, with the ` +
        `fronts identical at ${a.freezeFront} in both arms. *** THIS IS THE ROUND. A front is a CELL INDEX, so ` +
        "two genuinely different runs quantise onto the same cell and the cheaper observable reads a perfect " +
        "tie. The field comparison exists for exactly this, and until now that was a sentence in a header");
    ok(b.controlFieldMirror / a.controlFieldMirror > 1e6,
        "...so the two observables disagree by six orders about whether anything happened, which is what makes " +
        "the choice between them a finding rather than a preference");
}

console.log("\n== vaporize: CELSIUS WHERE KELVIN BELONGS, on ONE of two routes ==");
{
    const a = await vaporizeDevice.build({ mode: "ratio" });
    const b = await vaporizeDevice.build({ mode: "celsius" });
    ok(b.routeGap > 0.5 && a.routeGap < 0.05,
        `routeGap ${a.routeGap.toExponential(4)} -> ${b.routeGap.toExponential(4)}, a separation of 45.8x. It does ` +
        "not throw, it does not go negative, it produces a perfectly ordinary-looking expansion ratio");
    ok(a.ratioMeasured === b.ratioMeasured,
        `!! *** AND THE OTHER ROUTE IS UNTOUCHED: ratioMeasured ${a.ratioMeasured.toFixed(4)} in both arms. *** It ` +
        "comes from tabulated saturated densities and never touches T, so the answer key does not move and the " +
        "whole excursion belongs to the ideal-gas route the plant sits on");
    ok(Math.abs(a.ratioIdeal / b.ratioIdeal - 373.15 / 100) < 1e-9,
        `!! and the factor is EXACTLY 373.15/100: ratioIdeal ${a.ratioIdeal.toFixed(4)} -> ${b.ratioIdeal.toFixed(4)}. ` +
        "The ideal-gas ratio is linear in T, so a units error is a clean rescaling and the exact factor proves " +
        "it is the units and not a coincidence");
}

console.log("\n== ALL FOUR MOVE A DIFFERENT OBSERVABLE, so this is four claims and not one repeated ==");
{
    const flips = [thermalDevice.plantFlips, meltDevice.plantFlips, freezeDevice.plantFlips, vaporizeDevice.plantFlips];
    ok(new Set(flips).size === 4, `declared observables: ${flips.join(", ")}`);
    ok([rT, rM, rF, rV].every((r) => r && r.ok), "and every one of the four is adjudicated live by the census");
}

console.log("\nWHAT THIS DOES NOT CLAIM: that any of these four modules is verified. Each device gained ONE");
console.log("plant against ONE key -- thermal's diffusivity inference, melt's front, freeze's field control,");
console.log("vaporize's ideal-gas route. Convection, the Stefan convergence order, the reversibility identity");
console.log("and the trilemma are all UNTOUCHED by these plants. ONE PLANT TESTS ONE CLAIM.");

if (fail) { console.error(`\nthermalPlants-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`\nthermalPlants-selfcheck: all ${pass} pass. Four devices off the census's uncovered list, three of`);
console.log("them carrying plants the tree had already run and discarded.");
