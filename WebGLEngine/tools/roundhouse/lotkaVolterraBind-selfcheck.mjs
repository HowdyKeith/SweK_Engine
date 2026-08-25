// WebGLEngine/tools/roundhouse/lotkaVolterraBind-selfcheck.mjs
//
// Run: node tools/roundhouse/lotkaVolterraBind-selfcheck.mjs
// RUNTIME 0.62s MEASURED (median of 3 -- 611/615/622 -- with date(1) around the run). Section 4 runs every
// mode twice, nominal against planted. Measured with date(1), not guessed.
//
// GATES tools/roundhouse/lotkaVolterraBind.mjs -- the predator-prey device's binding.
//
// *** THE PLANT IS THE STANDARD TEXTBOOK REFINEMENT OF THIS VERY MODEL, AND MOST OF THE DEVICE'S OBSERVABLES
// CANNOT SEE IT. *** A logistic self-limitation on the prey leaves x* = gamma/delta bit-identical, moves the
// period under one percent, and lets the time-average theorem CONVERGE BACK onto the planted system as the run
// grows. Section 4 checks the plant moves a finite numeric observable in every declared mode -- which it can
// only do because every mode reports firstIntegralDrift and amplitudeRatio, the two quantities the plant
// actually destroys. That is the contract plantedCoverage grades, and here it is load-bearing rather than
// ceremonial: without those two shared fields the "volterra" mode would be entirely plant-blind.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    LOTKA_VOLTERRA_MODES, LOTKA_VOLTERRA_OBSERVABLES, lotkaVolterraDefaults, buildLotkaVolterra, lotkaVolterraDevice,
} from "./lotkaVolterraBind.mjs";
import { DEFAULTS, fixedPoint, integrate, timeAverages, PLANT_SIGMA } from "../../physics/ecology/lotkaVolterra.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

console.log("lotkaVolterraBind-selfcheck -- is the device declared honestly, and can the plant be seen in every mode?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE DECLARATION MATCHES THE CODE ***");
{
    const src = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "lotkaVolterraBind.mjs"), "utf8");
    // *** THE MODE LIST IS DECLARED ONCE. *** v3421 found kepler declaring its modes twice with the two copies
    // already disagreeing -- kepler3 was a working mode nobody could discover. One export, and the branches are
    // checked against it rather than against a second list.
    const branched = [...src.matchAll(/h\.mode === "(\w+)"/g)].map((m) => m[1]);
    const missing = branched.filter((m) => !LOTKA_VOLTERRA_MODES.includes(m));
    ok("!! every mode the build BRANCHES on is declared", missing.length === 0,
        missing.length ? "UNDECLARED: " + missing.join(", ") : branched.join(", ") + " + the fallthrough");
    ok("...and the declared list has no mode the build cannot serve",
        LOTKA_VOLTERRA_MODES.every((m) => branched.includes(m) || m === "cycle"),
        LOTKA_VOLTERRA_MODES.join(", "));
    ok("the device exports its own mode list rather than a second copy",
        lotkaVolterraDevice.modes === LOTKA_VOLTERRA_MODES);
    ok("it is declared a KNOB plant", lotkaVolterraDevice.plantKind === "knob",
        "sigma perturbs the MODEL upstream of every observable rather than nudging a reported number");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** EVERY REPORTED FIELD IS DECLARED, AND EVERY DECLARED FIELD IS REPORTED SOMEWHERE ***");
{
    const seen = new Set();
    for (const mode of LOTKA_VOLTERRA_MODES) {
        const out = await buildLotkaVolterra({ mode });
        for (const k of Object.keys(out)) seen.add(k);
        const undeclared = Object.keys(out).filter((k) => !LOTKA_VOLTERRA_OBSERVABLES.includes(k));
        ok(`mode "${mode}" reports only declared observables`, undeclared.length === 0,
            undeclared.length ? "UNDECLARED: " + undeclared.join(", ") : Object.keys(out).length + " fields");
    }
    // A declared observable nobody reports is the census's "DECLARED BUT DEAD" -- an advertised field that
    // cannot be read, which is the v3436 dead-knob defect wearing a different hat.
    const dead = LOTKA_VOLTERRA_OBSERVABLES.filter((o) => !seen.has(o));
    ok("!! no declared observable is DEAD -- every one is reported by some mode", dead.length === 0,
        dead.length ? "DEAD: " + dead.join(", ") : seen.size + " of " + LOTKA_VOLTERRA_OBSERVABLES.length + " reported");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE DEFAULTS CLAMP TO A SYSTEM THAT IS STILL A PREDATOR-PREY CYCLE ***");
{
    const wild = lotkaVolterraDefaults({ config: { alpha: -5, beta: 0, gamma: NaN, delta: 1e9, amplitude: 99, cycles: 1e9 } }).config;
    ok("!! every rate is clamped strictly positive", wild.alpha > 0 && wild.beta > 0 && wild.gamma > 0 && wild.delta > 0,
        `alpha=${wild.alpha} beta=${wild.beta} gamma=${wild.gamma} delta=${wild.delta}`);
    ok("...and the amplitude stays above 1, since 1.0 IS the fixed point and has no cycle at all", wild.amplitude > 1,
        `amplitude=${wild.amplitude}`);
    // *** THE HARVEST CLAMP IS A FRACTION OF alpha, NOT A ROUND NUMBER. *** Past the prey growth rate the system
    // collapses and volterraPrinciple throws, so a fixed ceiling would be correct for the default parameters and
    // wrong for every other set.
    const lowAlpha = lotkaVolterraDefaults({ config: { alpha: 0.2, harvest: 5 } }).config;
    ok("!! the harvest is clamped below the PREY GROWTH RATE, whatever that rate is", lowAlpha.harvest < lowAlpha.alpha,
        `alpha=${lowAlpha.alpha} -> harvest clamped to ${lowAlpha.harvest}`);
    const hiAlpha = lotkaVolterraDefaults({ config: { alpha: 4, harvest: 5 } }).config;
    ok("...and it tracks alpha rather than sitting at a constant", hiAlpha.harvest > lowAlpha.harvest,
        `alpha 0.2 -> ${lowAlpha.harvest}, alpha 4 -> ${hiAlpha.harvest}`);
    ok("an unknown mode falls back rather than throwing", lotkaVolterraDefaults({ mode: "nope" }).mode === "cycle");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE PLANT MOVES A FINITE NUMERIC OBSERVABLE IN EVERY DECLARED MODE ***");
{
    for (const mode of LOTKA_VOLTERRA_MODES) {
        const nom = await buildLotkaVolterra({ mode });
        const pla = await buildLotkaVolterra({ mode, config: { planted: true } });
        const moved = Object.keys(nom).filter((k) =>
            typeof nom[k] === "number" && Number.isFinite(nom[k]) &&
            typeof pla[k] === "number" && Number.isFinite(pla[k]) && nom[k] !== pla[k]);
        ok(`!! mode "${mode}" is gradeable -- the plant moves ${moved.length} finite observable(s)`, moved.length > 0,
            moved.join(", ") || "*** NOTHING MOVED: this mode cannot be graded ***");
    }
    // and the two shared ones must move HARD, since they are what carries the plant-blind modes
    const nom = await buildLotkaVolterra({ mode: "volterra" });
    const pla = await buildLotkaVolterra({ mode: "volterra", config: { planted: true } });
    ok("!! the first integral drift moves by two orders", pla.firstIntegralDrift / nom.firstIntegralDrift > 50,
        `${nom.firstIntegralDrift.toExponential(2)} -> ${pla.firstIntegralDrift.toExponential(2)}`);
    ok("!! the prey amplitude collapses", nom.amplitudeRatio > 0.9 && pla.amplitudeRatio < 0.05,
        `${nom.amplitudeRatio.toFixed(6)} -> ${pla.amplitudeRatio.toExponential(3)}`);

    // *** AND THE MODE-SPECIFIC NUMBERS ARE THE ONES THAT DO NOT MOVE, WHICH IS THE DEVICE'S WHOLE CONTENT. ***
    ok("!! ...while VOLTERRA'S PRINCIPLE ITSELF SURVIVES THE PLANT, bit for bit",
        nom.preyAfter === pla.preyAfter && nom.predatorAfter === pla.predatorAfter,
        `predicted prey after harvest ${nom.preyAfter} either way -- gamma/delta carries no sigma, so the ` +
        `logistic refinement does not touch the direction of the principle`);
    report("that is why every mode owes the two shared observables: without them this mode would be entirely " +
           "plant-blind and the census would read it as ungradeable");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** THE BIND REPORTS THE MODULE'S NUMBERS AND DOES NOT RECOMPUTE THEM ***");
{
    const c = lotkaVolterraDefaults({}).config;
    const p = { alpha: c.alpha, beta: c.beta, gamma: c.gamma, delta: c.delta };
    const fp = fixedPoint(p);
    const opts = { p, x0: fp.x * c.amplitude, y0: fp.y, integrator: "symplectic",
                   stepsPerCycle: c.stepsPerCycle, cycles: c.cycles };
    const direct = integrate(opts), viaBind = await buildLotkaVolterra({ mode: "cycle" });
    ok("!! the drift the bind reports IS integrate()'s, bit-identical",
        viaBind.firstIntegralDrift === direct.driftSecondHalf,
        `${viaBind.firstIntegralDrift.toExponential(6)}`);
    ok("...and the measured period likewise", viaBind.measuredPeriod === direct.measuredPeriod);
    const avg = await buildLotkaVolterra({ mode: "average" });
    const directAvg = timeAverages(opts);
    ok("!! the averages the bind reports ARE timeAverages()'s", avg.meanPrey === directAvg.meanX && avg.meanPredator === directAvg.meanY,
        `<x>=${avg.meanPrey.toFixed(8)} <y>=${avg.meanPredator.toFixed(8)}`);
    ok("...and the exact values come from fixedPoint(), not from arithmetic typed here",
        avg.exactPrey === fp.x && avg.exactPredator === fp.y);

    const src = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "lotkaVolterraBind.mjs"), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    ok("!! the bind carries no stepper and no first integral of its own",
        !/Math\.log\(/.test(src) && !/Math\.exp\(/.test(src),
        "the only arithmetic here is clamping and the harvest substitution");
}

// ---------------------------------------------------------------------------
console.log("\n6. *** IT IS REGISTERED WHERE THE SWEEP AND THE LAB WILL FIND IT ***");
{
    const dev = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "devices.mjs"), "utf8");
    ok("!! registered in the device REGISTRY", /lotkavolterra:\s*\(\)\s*=>\s*lotkaVolterraDevice/.test(dev));
    ok("...and imported there", /from "\.\/lotkaVolterraBind\.mjs"/.test(dev));
    const inst = fs.readFileSync(path.join(ENG, "physics", "instruments.mjs"), "utf8");
    ok("!! carries an instrument row", /device:\s*"lotkavolterra"/.test(inst));
    // THE `gate` FIELD NAMES THE MODULE'S GATE, NOT THE DEVICE'S -- this file's standing rule, learned four
    // times over (pulsar v3418, heidler v3419, whitedwarf v3422, xpbd v3460). A device gate reaches physics
    // only through the bind, so a row naming it shares no module with the device and the link cannot be CHECKED.
    ok("!! ...whose gate field names the MODULE's gate, not this one",
        /gate:\s*"physics\/ecology\/lotkaVolterra-selfcheck\.mjs"/.test(inst));
    ok("...and whose page field names the real front door rather than the generic viewer",
        /page:\s*"ecology\.html"/.test(inst));
    ok("the front door exists", fs.existsSync(path.join(ENG, "ecology.html")));
}

// ---------------------------------------------------------------------------
console.log("\n7. *** SABOTAGE ***");
{
    // (a) a plant of zero is no plant: the graded difference must vanish
    const a = await buildLotkaVolterra({ mode: "cycle" });
    const b = await buildLotkaVolterra({ mode: "cycle", config: { planted: false } });
    ok("!! SABOTAGE: planted:false reproduces the nominal run exactly",
        a.firstIntegralDrift === b.firstIntegralDrift && a.amplitudeRatio === b.amplitudeRatio);
    // (b) and PLANT_SIGMA must actually be non-zero, or every check in section 4 is decoration
    ok("!! SABOTAGE: PLANT_SIGMA is not zero", PLANT_SIGMA > 0, "sigma = " + PLANT_SIGMA);
    // (c) drive the harvest and the reported direction must follow -- a hard-coded ladder would not
    const h0 = await buildLotkaVolterra({ mode: "volterra", config: { harvest: 0 } });
    const h3 = await buildLotkaVolterra({ mode: "volterra", config: { harvest: 0.3 } });
    ok("!! SABOTAGE: the harvest knob is LIVE -- driving it moves the predicted averages",
        h3.preyAfter > h0.preyAfter && h3.predatorAfter < h0.predatorAfter,
        `prey ${h0.preyAfter} -> ${h3.preyAfter}, predator ${h0.predatorBefore} -> ${h3.predatorAfter}`);
    // (d) and the amplitude knob must be live too, or the "any amplitude" claim is untested
    const lo = await buildLotkaVolterra({ mode: "cycle", config: { amplitude: 1.05 } });
    const hi = await buildLotkaVolterra({ mode: "cycle", config: { amplitude: 3.0 } });
    ok("!! SABOTAGE: the amplitude knob is LIVE -- the period grows with the orbit",
        hi.measuredPeriod > lo.measuredPeriod * 1.05,
        `1.05x -> ${lo.measuredPeriod.toFixed(6)}, 3.0x -> ${hi.measuredPeriod.toFixed(6)} (this centre is not isochronous)`);
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
