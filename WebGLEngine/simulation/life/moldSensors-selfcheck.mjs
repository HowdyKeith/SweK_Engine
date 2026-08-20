// WebGLEngine/simulation/life/moldSensors-selfcheck.mjs — v2556
//
// Run: node simulation/life/moldSensors-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// TWO SENSORS OR THREE? A COMPARISON AGAINST A REAL SHIPPED SLIME MOLD.
//
// Velfi/Vizza (17 stars, 137 commits, 26 releases, v0.12.0 Mar 2026; Tauri + Svelte + WebGPU, Rust 64% / WGSL
// 11.5%) ships a slime mold. Transcribed from src-tauri/src/simulations/slime_mold/shaders/compute.wgsl:
//
//     let left_angle  = angle - sensor_angle;
//     let right_angle = angle + sensor_angle;
//     ...
//     if (left_value > right_value)      { angle -= turn_rate; }
//     else if (right_value > left_value) { angle += turn_rate; }
//     else { /* If equal, do nothing */ }
//
// TWO SENSORS. NO CENTRE. The classic Physarum rule (Jones 2010) samples THREE -- front-left, FRONT, front-right
// -- with a branch for "forward is best, go straight" and another for "forward is worse than both, turn away".
// v2552's moldReflex samples [-1, 0, +1]. Three. So this is the same organism with a different nervous system,
// and the difference is testable.
//
// ---- I PREDICTED THE TWO-SENSOR WOULD FAIL TO SETTLE. I WAS WRONG. ------------------------------------------
//
// On a smooth Gaussian peak, measured: 2-sensor food 654.4 / final taste 0.999; 3-sensor 657.9 / 0.999. THE
// CENTRE SENSOR BUYS 0.5%. The reasoning was that a two-sensor agent cannot know it has arrived -- true, but
// irrelevant: at the peak left == right, so it does nothing, drives straight, overshoots, the asymmetry flips,
// and it comes back. AN ORBIT AT THE PEAK IS SETTLING. A smooth peak does not need a centre sample.
//
// ---- WHERE IT ACTUALLY MATTERS: A SYMMETRIC DEAD END --------------------------------------------------------
//
// Food behind, a repellent ridge dead ahead, left and right IDENTICAL by construction. Measured: the two-sensor
// agent reached food 0.131 and ended at x=35 -- IT DROVE THROUGH THE RIDGE AND KEPT GOING FOREVER, because
// left == right means "do nothing" and nothing it samples is where it is going. The three-sensor agent reached
// 1.000 and came home.
//
// ---- AND THE CAVEAT, WHICH CUTS IN HER FAVOUR ----------------------------------------------------------------
//
// THAT DEAD END NEVER HAPPENS IN HER SIMULATION. Her agents read a TRAIL MAP written by thousands of other
// agents. It is never symmetric to floating-point equality, so the `else` branch is nearly unreachable, and two
// sensors are two sensors' worth of bandwidth saved on a GPU running a million of them. HER SIMPLIFICATION IS
// CORRECT FOR HER PROBLEM. The third sensor is not better -- it is insurance against a symmetry her field never
// produces and this engine's smooth analytic chemoField does.
//
// This file exists so that "we sample three because Physarum does" stops being folklore and starts being a
// measurement with a number attached.
import { chemoField } from "./paramecium.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const SA = 0.5, SD = 1.2, TURN = 0.35, SPEED = 0.05;

/** Vizza's rule, transcribed. Two samples, three branches, and the third does nothing. */
function steerTwo(at, x, z, a) {
    const l = at(x + Math.cos(a - SA) * SD, z + Math.sin(a - SA) * SD);
    const r = at(x + Math.cos(a + SA) * SD, z + Math.sin(a + SA) * SD);
    if (l > r) return a - TURN;
    if (r > l) return a + TURN;
    return a;                      // "If equal, do nothing" -- the line that drives into the wall
}

/** The classic. Three samples INCLUDING straight ahead. */
function steerThree(at, x, z, a) {
    let bv = -Infinity, ba = a;
    for (const d of [-SA, 0, SA]) {
        const v = at(x + Math.cos(a + d) * SD, z + Math.sin(a + d) * SD);
        if (v > bv) { bv = v; ba = a + d; }
    }
    return ba;
}

function run(at, steer, x0, z0, a0, steps) {
    let x = x0, z = z0, a = a0, food = 0, best = -Infinity;
    for (let s = 0; s < steps; s++) {
        a = steer(at, x, z, a);
        x += Math.cos(a) * SPEED; z += Math.sin(a) * SPEED;
        const v = at(x, z);
        food += v; if (v > best) best = v;
    }
    return { food, best, x, z };
}

// ---- 1. ON A SMOOTH PEAK, THE CENTRE SENSOR BUYS ALMOST NOTHING ----------------------------------------------
{
    const f = chemoField([6, 0, 6], 4);
    const at = (x, z) => f.at(x, z);
    const two = run(at, steerTwo, -6, -6, 0.7, 900);
    const three = run(at, steerThree, -6, -6, 0.7, 900);
    ok("BOTH rules find a smooth peak", two.best > 0.99 && three.best > 0.99,
       "2-sensor best " + two.best.toFixed(3) + ", 3-sensor best " + three.best.toFixed(3));
    ok("...and the centre sensor is worth under 5% of the food (I PREDICTED IT WOULD MATTER. IT DOES NOT.)",
       Math.abs(three.food - two.food) / three.food < 0.05,
       "2-sensor " + two.food.toFixed(1) + " vs 3-sensor " + three.food.toFixed(1) + " = " +
       (100 * (three.food - two.food) / three.food).toFixed(1) + "%. At the peak left==right, so it does nothing, drives straight, overshoots, and comes back. AN ORBIT AT THE PEAK IS SETTLING.");
}

// ---- 2. AT A SYMMETRIC DEAD END, IT IS EVERYTHING -------------------------------------------------------------
// Food behind; a repellent ridge dead ahead with NO z dependence, so left and right are identical to the bit.
{
    const at = (x, z) => Math.exp(-(((x + 6) ** 2 + z * z) / 18)) - Math.exp(-((x - 2) ** 2) / 0.5);
    const two = run(at, steerTwo, 0, 0, 0, 700);
    const three = run(at, steerThree, 0, 0, 0, 700);
    const foodOnly = (x, z) => Math.exp(-(((x + 6) ** 2 + z * z) / 18));
    ok("THE TWO-SENSOR AGENT DRIVES STRAIGHT THROUGH A WALL IT CANNOT SEE", two.x > 20,
       "ended at x=" + two.x.toFixed(1) + " -- left == right means 'do nothing', and NOTHING IT SAMPLES IS WHERE IT IS GOING");
    ok("...and never finds the food behind it", foodOnly(two.x, two.z) < 0.2, "food at its final position: " + foodOnly(two.x, two.z).toFixed(4));
    ok("THE THREE-SENSOR AGENT TURNS AROUND AND COMES HOME", foodOnly(three.x, three.z) > 0.9,
       "ended at (" + three.x.toFixed(2) + ", " + three.z.toFixed(2) + "), food " + foodOnly(three.x, three.z).toFixed(4) + " -- it SEES that forward is worst. That is exactly what Jones's third branch is for.");
}

// ---- 3. THE CAVEAT, ASSERTED SO IT CANNOT BE FORGOTTEN --------------------------------------------------------
// A trail map written by thousands of agents is never symmetric to float equality, so Vizza's dead `else` is
// nearly unreachable and two sensors are two sensors' worth of bandwidth saved on a GPU. HER SIMPLIFICATION IS
// CORRECT FOR HER PROBLEM. This asserts the mechanism of that defence rather than just asserting the opinion.
{
    let hits = 0;
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const noisy = (x, z) => Math.exp(-((x - 3) ** 2 + (z - 3) ** 2) / 8) + rnd() * 1e-3;
    for (let i = 0; i < 2000; i++) {
        const x = rnd() * 10 - 5, z = rnd() * 10 - 5, a = rnd() * Math.PI * 2;
        const l = noisy(x + Math.cos(a - SA) * SD, z + Math.sin(a - SA) * SD);
        const r = noisy(x + Math.cos(a + SA) * SD, z + Math.sin(a + SA) * SD);
        if (l === r) hits++;
    }
    ok("ON A NOISY TRAIL MAP, left == right ESSENTIALLY NEVER FIRES (so her dead branch costs her nothing)",
       hits === 0, hits + " exact ties in 2000 samples -- the third sensor is INSURANCE AGAINST A SYMMETRY HER FIELD NEVER PRODUCES and this engine's smooth analytic chemoField does");
}

console.log(fails ? "\nmoldSensors-selfcheck: " + fails + " FAILED" : "\nmoldSensors-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
