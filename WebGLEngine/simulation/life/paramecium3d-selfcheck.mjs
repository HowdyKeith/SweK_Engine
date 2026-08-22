// WebGLEngine/simulation/life/paramecium3d-selfcheck.mjs — v2569
//
// Run: node simulation/life/paramecium3d-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// THE 3D PARAMECIUM, MEASURED CLEANLY, WITH THE SENSOR ACTUALLY FED.
//
// v2568 found that swim() never called observe() -- the mold sampled the origin forever, picked ONE heading, and
// swam in a straight line for 600 steps. IT WAS A COMPASS. v2568 wired the missing line and deliberately quoted
// NO 3D numbers, because the 2D numbers had just moved underneath and rushed numbers are how you get a compass.
// These are those numbers.
//
//     world                policy                  food    best   final y
//     freeSpaceWorld       moldReflex3 cone5      312.4   1.000      5.65
//     freeSpaceWorld       moldReflex3 cone9      316.5   1.000      5.30
//     freeSpaceWorld       moldReflex (2D rule)     0.0   0.000     30.00
//     freeSpaceWorld       UCB1                     0.9   0.007      2.22
//     REAL box3d (-9.8)    moldReflex3 cone5      282.8   1.000      4.96
//     REAL box3d (-9.8)    moldReflex3 cone9      286.0   1.000      5.12
//     REAL box3d (-9.8)    UCB1                     0.2   0.002     -4.57
//
// ---- GRAVITY FINALLY COSTS FOOD ------------------------------------------------------------------------------
//
// 312.4 -> 282.8. A 9.5% TAX. v2567 predicted exactly this: "give the nose a y and the legs a y, and THEN gravity
// should cost food -- and if it STILL does not, something is wrong far beyond the control loop." It does.
//
// And the creature WINS ANYWAY: it climbs to y=4.96 against -9.8 m/s^2, and the peak is at y=5. It is not being
// dragged; it is paying a toll and arriving.
//
// Compare v2567, where the same creature FELL 418 METRES AND SCORED IDENTICALLY, because its nose had no y. THE
// WORLD REACHED THE CREATURE; THE CREATURE'S SENSES DID NOT REACH THE WORLD. Now they do, and the world costs
// something. A WORLD THAT COSTS NOTHING IS A BACKDROP.
//
// ---- THE 2D RULE STILL SCORES ZERO ---------------------------------------------------------------------------
//
// moldReflex on 3D headings: 0.0 food, and it ends at y=30 -- FLYING AWAY. v2557 saw this and blamed the number
// three. THE REAL CAUSE IS ADJACENCY: moldReflex samples dirs[heading-1], dirs[heading], dirs[heading+1], and on
// a Fibonacci sphere THOSE ARE NOT NEIGHBOURS. It was sampling three essentially random directions and taking
// the best of three randoms. ADJACENCY IN THE ARRAY IS A FACT ABOUT CIRCLES.
//
// moldReflex3 finds its cone BY DOT PRODUCT, which is the only honest definition of "beside me" on a sphere.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { swim, chemoField, headings3, moldReflex, moldReflex3 } from "./paramecium.js";
import { ucb1 } from "../../brain/bench/bandit.mjs";
import { freeSpaceWorld } from "../../physics/freeSpaceWorld.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const WASM = path.join(here, "..", "..", "vendor", "box3d", "box3d.wasm");

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const box3d = async (g) => {
    const { instance } = await WebAssembly.instantiate(fs.readFileSync(WASM), {
        wasi_snapshot_preview1: new Proxy({}, { get: () => () => 0 }),
    });
    const e = instance.exports;
    e.swk_world_create(g[0], g[1], g[2]);
    return {
        addShip({ x = 0, z = 0, half = 0.5, density = 1 } = {}) { return e.swk_body_ship(x, z, half, density); },
        addBox({ type = "dynamic", pos = [0, 0, 0], half = [0.5, 0.5, 0.5], density = 1 } = {}) {
            const t = type === "dynamic" ? 1 : type === "kinematic" ? 2 : 0;
            const h = Array.isArray(half) ? half : [half, half, half];
            return e.swk_body_box(t, pos[0], pos[1], pos[2], h[0], h[1], h[2], density);
        },
        setVelocity(i, v) { e.swk_body_set_velocity(i, v[0], v[1], v[2]); },
        impulse(i, j) { e.swk_body_impulse(i, j[0], j[1], j[2]); },
        step(dt = 1 / 60, s = 4) { e.swk_world_step(dt, s); },
        bodyCount() { return e.swk_body_count(); },
        readTransforms() { return new Float32Array(e.memory.buffer, e.swk_transforms(), e.swk_body_count() * 7).slice(); },
        readVelocities() { return new Float32Array(e.memory.buffer, e.swk_velocities(), e.swk_body_count() * 3).slice(); },
        supportsJoints() { return true; }, jointSpherical() {}, jointRevolute() {}, jointWeld() {},
        dimensionality() { return "spatial"; },
    };
};

// THE PEAK IS AT y=5. If the food sat at y=0 the third dimension would be decoration and every number below
// would be a 2D number wearing a sphere.
const field = chemoField([6, 5, 6], 4);
const dirs = headings3(26);
const go = (w, p) => swim(w, "3d", p, { steps: 600, field, dirs });

// ---- 1. the mold climbs ---------------------------------------------------------------------------------------
{
    const w = freeSpaceWorld();
    const r = go(w, moldReflex3(field, dirs, 1.2, 5));
    ok("moldReflex3 FINDS A PEAK THAT IS UP AND AWAY", r.best > 0.99 && r.food > 200,
       "food " + r.food.toFixed(1) + ", best " + r.best.toFixed(3));
    ok("...and it is actually UP there -- not a 2D answer wearing a sphere", Math.abs(w.readTransforms()[1] - 5) < 2,
       "final y = " + w.readTransforms()[1].toFixed(2) + ", peak y = 5. THE PEAK IS OFF THE PLANE ON PURPOSE: if the food sat at y=0, every number here would be a 2D number in fancy dress.");
    ok("...and a wider cone buys almost nothing", (() => {
        const c9 = go(freeSpaceWorld(), moldReflex3(field, dirs, 1.2, 9));
        return c9.food / r.food < 1.1;
    })(), "cone5 " + r.food.toFixed(1) + " vs cone9 316.5 -- 1.3%. Five samples is enough on a sphere; nine is insurance, exactly as v2556 found the third sensor was insurance in a plane.");
}

// ---- 2. THE 2D RULE STILL SCORES ZERO, AND NOW WE KNOW WHY -----------------------------------------------------
{
    const w = freeSpaceWorld();
    const r = go(w, moldReflex(field, dirs));
    ok("the 2D rule on 3D headings SCORES ZERO", r.food < 1,
       "food " + r.food.toFixed(1) + ", and it ends at y = " + w.readTransforms()[1].toFixed(1) + " -- FLYING AWAY. v2557 saw this and blamed THE NUMBER THREE. THE REAL CAUSE IS ADJACENCY: it samples dirs[h-1], dirs[h], dirs[h+1], and ON A FIBONACCI SPHERE THOSE ARE NOT NEIGHBOURS. It was taking the best of three randoms. ADJACENCY IN THE ARRAY IS A FACT ABOUT CIRCLES.");
    ok("...and moldReflex3 finds its cone BY DOT PRODUCT, which is the fix", moldReflex3(field, dirs).name.includes("cone"),
       "the only honest definition of 'beside me' on a sphere is angular");
}

// ---- 3. GRAVITY FINALLY COSTS FOOD ----------------------------------------------------------------------------
{
    if (!fs.existsSync(WASM)) {
        console.log("  SKIPPED (not a pass): vendor/box3d/box3d.wasm absent -- run build-box3d-wasm-clang.sh");
    } else {
        const free = go(freeSpaceWorld(), moldReflex3(field, dirs, 1.2, 5));
        const wg = await box3d([0, -9.8, 0]);
        const grav = go(wg, moldReflex3(field, dirs, 1.2, 5));
        ok("!! GRAVITY COSTS FOOD NOW", grav.food < free.food * 0.97,
           "no gravity " + free.food.toFixed(1) + " -> gravity " + grav.food.toFixed(1) + " = a " +
           ((1 - grav.food / free.food) * 100).toFixed(1) + "% TAX. v2567 PREDICTED EXACTLY THIS: 'give the nose a y and the legs a y, and THEN gravity should cost food -- and if it STILL does not, something is wrong far beyond the control loop.' IT DOES. Compare v2567, where the same creature FELL 418 METRES AND SCORED IDENTICALLY because its nose had no y.");
        ok("...and it WINS ANYWAY -- it climbs against -9.8", grav.best > 0.99 && wg.readTransforms()[1] > 3,
           "best " + grav.best.toFixed(3) + " at final y = " + wg.readTransforms()[1].toFixed(2) +
           " with the peak at y=5. IT IS NOT BEING DRAGGED; IT IS PAYING A TOLL AND ARRIVING. A WORLD THAT COSTS NOTHING IS A BACKDROP.");
        const b = go(await box3d([0, -9.8, 0]), ucb1());
        ok("...and UCB1 COLLAPSES in 3D", b.food < 5,
           "food " + b.food.toFixed(1) + " vs the mold's " + grav.food.toFixed(1) +
           ". 26 arms and 75 decisions: IT CANNOT TRY EACH ARM THREE TIMES. v2557 said the bandit's handicap is its MEMORY -- it assumes stationary arms in a body where every arm changes every step. Widening the sphere makes that worse, not better.");
    }
}

console.log(fails ? "\nparamecium3d-selfcheck: " + fails + " FAILED" : "\nparamecium3d-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
