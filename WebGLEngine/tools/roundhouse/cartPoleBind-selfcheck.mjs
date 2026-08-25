// WebGLEngine/tools/roundhouse/cartPoleBind-selfcheck.mjs
//
// Run: node tools/roundhouse/cartPoleBind-selfcheck.mjs
// RUNTIME 11.0s MEASURED (median of 3 -- 11544/10523/10967 -- with date(1) around the run). Section 4 builds
// every mode twice and section 8 designs six more regulators; each build runs a Riccati solve and a 20-second
// nonlinear simulation. It was 46.7s before the module's default step was coarsened.
//
// GATES tools/roundhouse/cartPoleBind.mjs -- the cart-pole LQR device's binding.
//
// *** THE PLANT PASSES EVERY CHECK THAT STAYS INSIDE THE MODEL, SO THE TWO SHARED OBSERVABLES ARE NOT
// CEREMONIAL HERE -- THEY ARE THE ONLY GRADEABLE THING IN TWO OF THE FOUR MODES. *** A controller designed on
// the hanging equilibrium has a converging Riccati solve, a tiny ARE residual, a stable closed loop on its own
// model and a Kalman inequality that holds to nine digits. Only trueClosedLoopStable and poleFellAtSeconds ask
// about the plant it will actually meet. Section 4 checks that every declared mode moves something, and section
// 5 checks WHICH things move -- because the interesting half of this device is what the plant does NOT disturb.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    CART_POLE_MODES, CART_POLE_OBSERVABLES, cartPoleDefaults, buildCartPole, cartPoleDevice,
} from "./cartPoleBind.mjs";
import { PARAMS, linearize, lqrGain, lyapunovStable, closedLoop, returnDifferenceMin } from "../../physics/control/cartPole.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

console.log("cartPoleBind-selfcheck -- is the device declared honestly, and can the plant be seen in every mode?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE DECLARATION MATCHES THE CODE ***");
{
    const src = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "cartPoleBind.mjs"), "utf8");
    const branched = [...src.matchAll(/h\.mode === "(\w+)"/g)].map((m) => m[1]);
    const undeclared = branched.filter((m) => !CART_POLE_MODES.includes(m));
    ok("!! every mode the build BRANCHES on is declared", undeclared.length === 0,
        undeclared.length ? "UNDECLARED: " + undeclared.join(", ") : branched.join(", ") + " + the fallthrough");
    ok("the device exports its own mode list rather than a second copy", cartPoleDevice.modes === CART_POLE_MODES);
    ok("it is declared a KNOB plant", cartPoleDevice.plantKind === "knob",
        "the knob replaces the MODEL THE CONTROLLER IS DESIGNED ON, upstream of every gain");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** EVERY REPORTED FIELD IS DECLARED, AND EVERY DECLARED FIELD IS REPORTED SOMEWHERE ***");
{
    const seen = new Set();
    for (const mode of CART_POLE_MODES) {
        const out = await buildCartPole({ mode });
        for (const k of Object.keys(out)) seen.add(k);
        const undeclared = Object.keys(out).filter((k) => !CART_POLE_OBSERVABLES.includes(k));
        ok(`mode "${mode}" reports only declared observables`, undeclared.length === 0,
            undeclared.length ? "UNDECLARED: " + undeclared.join(", ") : Object.keys(out).length + " fields");
    }
    const dead = CART_POLE_OBSERVABLES.filter((o) => !seen.has(o));
    ok("!! no declared observable is DEAD -- every one is reported by some mode", dead.length === 0,
        dead.length ? "DEAD: " + dead.join(", ") : seen.size + " of " + CART_POLE_OBSERVABLES.length);
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE DEFAULTS CLAMP TO A PROBLEM LQR IS ACTUALLY DEFINED ON ***");
{
    const wild = cartPoleDefaults({ config: { qx: -5, qtheta: NaN, r: 0, tilt: 99, horizon: 1e9 } }).config;
    ok("!! Q stays positive SEMI-definite (zero allowed, negative not)", wild.qx >= 0 && wild.qtheta >= 0,
        `qx=${wild.qx} qtheta=${wild.qtheta}`);
    ok("!! R stays strictly positive -- r = 0 is the singular cheap-control limit, where the gain runs away",
        wild.r > 0, `r=${wild.r}`);
    ok("!! the tilt is clamped inside the basin the LINEAR design can recover from", wild.tilt <= 0.6,
        `tilt=${wild.tilt} rad -- past this the nonlinear plant has left the regime the design was made for, ` +
        `and reporting 'it fell over' there would be grading the tilt rather than the controller`);
    ok("an unknown mode falls back rather than throwing", cartPoleDefaults({ mode: "nope" }).mode === "regulate");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE PLANT MOVES A FINITE NUMERIC OBSERVABLE IN EVERY DECLARED MODE ***");
{
    for (const mode of CART_POLE_MODES) {
        const nom = await buildCartPole({ mode });
        const pla = await buildCartPole({ mode, config: { planted: true } });
        const moved = Object.keys(nom).filter((k) =>
            typeof nom[k] === "number" && Number.isFinite(nom[k]) &&
            typeof pla[k] === "number" && Number.isFinite(pla[k]) && nom[k] !== pla[k]);
        ok(`!! mode "${mode}" is gradeable -- ${moved.length} finite observable(s) move`, moved.length > 0,
            moved.join(", ") || "*** NOTHING MOVED ***");
    }
}

// ---------------------------------------------------------------------------
console.log("\n5. *** AND WHAT THE PLANT DOES NOT MOVE IS THE DEVICE'S WHOLE CONTENT ***");
{
    const nomR = await buildCartPole({ mode: "regulate" }), plaR = await buildCartPole({ mode: "regulate", config: { planted: true } });
    ok("!! the planted design is STABLE ON ITS OWN MODEL, by both routes, exactly like the honest one",
        plaR.designStableHurwitz === 1 && plaR.designStableLyapunov === 1 &&
        nomR.designStableHurwitz === 1 && nomR.designStableLyapunov === 1);
    ok("!! ...and has no unstable closed-loop roots either", plaR.designRhpCount === 0 && nomR.designRhpCount === 0);
    ok("!! ...and its ARE residual is just as small", plaR.areResidual < 1e-8 && nomR.areResidual < 1e-8,
        `honest ${nomR.areResidual.toExponential(2)}  planted ${plaR.areResidual.toExponential(2)}`);
    const nomM = await buildCartPole({ mode: "margin" }), plaM = await buildCartPole({ mode: "margin", config: { planted: true } });
    ok("!! ...and the KALMAN INEQUALITY HOLDS ON ITS OWN LOOP, to nine digits of the honest one's",
        plaM.satisfiesKalman === 1 && Math.abs(plaM.returnDifferenceMin - nomM.returnDifferenceMin) < 1e-8,
        `honest ${nomM.returnDifferenceMin.toFixed(9)}  planted ${plaM.returnDifferenceMin.toFixed(9)}`);
    report("four green checks on a controller that drops the pole. Self-consistency grades the model you " +
           "brought, not the one you are standing in front of");

    ok("!! *** AND THE TWO SHARED OBSERVABLES ARE THE ONES THAT CATCH IT ***",
        nomR.trueClosedLoopStable === 1 && plaR.trueClosedLoopStable === 0 &&
        nomR.poleFellAtSeconds === -1 && plaR.poleFellAtSeconds > 0,
        `honest: stable on the true plant, pole never fell. planted: unstable, pole passed 90 degrees at ` +
        `t = ${plaR.poleFellAtSeconds.toFixed(3)} s`);

    // THE OPEN-LOOP COUNT DIFFERS TOO, AND IT IS PHYSICS RATHER THAN AN ARTEFACT: an upright pendulum has one
    // unstable mode and a hanging one has none. That is why the fixture is hard in one orientation and trivial
    // in the other, and it is reported as an INTEGER, which is the sharpest shape this lab collects.
    ok("!! the upright plant has exactly ONE unstable root and the hanging plant has NONE",
        nomR.openLoopRhpCount === 1 && plaR.openLoopRhpCount === 0,
        `upright ${nomR.openLoopRhpCount}, hanging ${plaR.openLoopRhpCount}`);
}

// ---------------------------------------------------------------------------
console.log("\n6. *** THE BIND REPORTS THE MODULE'S NUMBERS AND DOES NOT RECOMPUTE THEM ***");
{
    const c = cartPoleDefaults({}).config;
    const Q = [[c.qx, 0, 0, 0], [0, c.qv, 0, 0], [0, 0, c.qtheta, 0], [0, 0, 0, c.qomega]], R = [[c.r]];
    const { A, B } = linearize(PARAMS, false);
    const g = lqrGain(A, B, Q, R);
    const viaBind = await buildCartPole({ mode: "regulate" });
    ok("!! the gain the bind reports IS lqrGain()'s, bit-identical",
        viaBind.gainX === g.K[0][0] && viaBind.gainTheta === g.K[0][2] && viaBind.areResidual === g.residual);
    const m = await buildCartPole({ mode: "margin" });
    ok("!! ...and the return-difference minimum IS returnDifferenceMin()'s",
        m.returnDifferenceMin === returnDifferenceMin(A, B, g.K).min);
    ok("!! ...and the true-plant verdict IS lyapunovStable()'s",
        (viaBind.trueClosedLoopStable === 1) === lyapunovStable(closedLoop(A, B, g.K)));

    const src = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "cartPoleBind.mjs"), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    ok("!! the bind carries no Riccati solve and no matrix arithmetic of its own",
        !/Math\.sqrt\(\s*\w+\.\w+\s*\*/.test(src) && !/for \(let k = 0/.test(src),
        "the only arithmetic here is clamping, assembling Q and R from scalars, and one exact-key ratio");
}

// ---------------------------------------------------------------------------
console.log("\n7. *** IT IS REGISTERED WHERE THE SWEEP AND THE LAB WILL FIND IT ***");
{
    const dev = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "devices.mjs"), "utf8");
    ok("!! registered in the device REGISTRY", /cartpole:\s*\(\)\s*=>\s*cartPoleDevice/.test(dev));
    ok("...and imported there", /from "\.\/cartPoleBind\.mjs"/.test(dev));
    const inst = fs.readFileSync(path.join(ENG, "physics", "instruments.mjs"), "utf8");
    ok("!! carries an instrument row", /device:\s*"cartpole"/.test(inst));
    ok("!! ...whose gate field names the MODULE's gate, not this one",
        /gate:\s*"physics\/control\/cartPole-selfcheck\.mjs"/.test(inst));
    ok("...and whose page field names the real front door", /page:\s*"cartpole\.html"/.test(inst));
    ok("the front door exists", fs.existsSync(path.join(ENG, "cartpole.html")));
}

// ---------------------------------------------------------------------------
console.log("\n8. *** SABOTAGE ***");
{
    const a = await buildCartPole({ mode: "regulate" }), b = await buildCartPole({ mode: "regulate", config: { planted: false } });
    ok("!! SABOTAGE: planted:false reproduces the nominal design exactly", a.gainTheta === b.gainTheta);
    // the weights must be live, or the device is reporting one fixed controller forever
    const heavy = await buildCartPole({ mode: "regulate", config: { qtheta: 1000 } });
    ok("!! SABOTAGE: the angle weight is LIVE -- driving it moves the gain",
        Math.abs(heavy.gainTheta) > 1.5 * Math.abs(a.gainTheta),
        `${a.gainTheta.toFixed(3)} -> ${heavy.gainTheta.toFixed(3)}`);
    ok("...and the exact-key ratio still reads 1 under the new weights",
        Math.abs(heavy.positionGainVsExact - 1) < 1e-6, heavy.positionGainVsExact.toFixed(12));
    // *** THE TILT'S LIVENESS WITNESS WAS finalCartPosition AND THAT WAS A CHECK THAT COULD NOT FAIL. *** The
    // regulator drives the cart back to the origin whatever the release angle, so both runs printed 0.0000 and
    // the assertion passed only because two floating-point zeros happened to differ in their last bits. A
    // control that passes on noise is the v3985 shape. The real witness is EXACT: J* = x0'Px0 with
    // x0 = [0, 0, tilt, 0] is quadratic in the tilt by construction, so doubling the release must quadruple the
    // cost -- and it does, BIT-EXACTLY, across an eightfold range.
    const costs = [];
    for (const t of [0.02, 0.04, 0.08, 0.16]) costs.push((await buildCartPole({ mode: "cost", config: { tilt: t } })).predictedCost);
    const quadErr = costs.map((c, i) => Math.abs(c - costs[0] * Math.pow(2, 2 * i)) / (costs[0] * Math.pow(2, 2 * i)));
    ok("!! SABOTAGE: the tilt knob is LIVE, and the optimal cost is EXACTLY quadratic in it",
        costs[0] > 0 && Math.max(...quadErr) === 0,
        [0.02, 0.04, 0.08, 0.16].map((t, i) => `${t}: ${costs[i].toFixed(9)}`).join("  ") +
        `  worst deviation from x4 per doubling: ${Math.max(...quadErr).toExponential(1)}`);
    const bigTilt = await buildCartPole({ mode: "balance", config: { tilt: 0.5 } });
    const smallTilt = await buildCartPole({ mode: "balance", config: { tilt: 0.02 } });
    ok("...and the honest controller catches BOTH releases", bigTilt.poleFellAtSeconds === -1 && smallTilt.poleFellAtSeconds === -1);
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
