// WebGLEngine/simulation/life/parameciumDrive-selfcheck.mjs — v2567
//
// Run: node simulation/life/parameciumDrive-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// v2566 WROTE A KILL CONDITION AGAINST ITSELF AND THE KILL CONDITION WAS WRONG.
//
// It said: "-9.8 m/s^2 of gravity changes the paramecium's score by exactly zero, because swim() re-asserts
// setVelocity every 8 ticks and overwrites whatever the world did. Make it apply FORCES instead -- the shim
// exports swk_body_impulse and NOTHING CALLS IT. IF GRAVITY STILL CHANGES NOTHING UNDER IMPULSE CONTROL, THE
// WORLD IS NOT REACHING THE CREATURE AT ALL."
//
// It reaches it. Measured, 600 steps, mold reflex, real box3d:
//
//     drive       gravity     food     best    final y
//     velocity    none       201.1    1.000       0.00
//     velocity    -9.8       201.1    1.000      -6.72
//     impulse     none        39.0    1.000       0.00
//     impulse     -9.8        39.0    1.000    -417.80
//
// THE CREATURE FELL FOUR HUNDRED AND EIGHTEEN METRES AND SCORED EXACTLY THE SAME.
//
// So the premise was wrong in a way worth keeping: "score unchanged" did NOT mean "world not reaching". The
// world reached. It fell out of the world. THE SCORE DOES NOT KNOW, because chemoField is `at(x, z)` -- IT HAS
// NO Y. Even the velocity-driven creature had already sunk to -6.72 and scored an identical 201.1.
//
// THE WORLD REACHES THE CREATURE. THE CREATURE'S SENSES DO NOT REACH THE WORLD.
//
// That is the same disease as every other finding this session, in its purest form yet: v2557's checker pushed
// x and z and never y; v2564's probe asked a ship whether the engine had an up axis; v2565's up-test asserted an
// endpoint that assumed no gravity. HERE THE INSTRUMENT IS THE CREATURE'S OWN NOSE. A creature whose sensor has
// no y cannot be given a y by any amount of physics -- IT WILL FALL FOREVER AND REPORT THAT DINNER WAS LOVELY.
//
// ---- WHY THE DEFAULT DID NOT CHANGE ---------------------------------------------------------------------------
//
// drive defaults to "velocity". Switching it would move every number v2552 through v2566 measured, and this
// engine does not rewrite history to make a new idea look good. The impulse path is opt-in and gated.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { swim, chemoField, headings, moldReflex } from "./paramecium.js";
import { CONTRACT } from "../../physics/backendConformance.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const WASM = path.join(here, "..", "..", "vendor", "box3d", "box3d.wasm");

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

if (!fs.existsSync(WASM)) {
    console.log("parameciumDrive-selfcheck: SKIPPED -- vendor/box3d/box3d.wasm not present. NOT a pass.");
    process.exit(0);
}

const mk = async (g) => {
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

const field = chemoField(), dirs = headings(8);
const run = async (drive, g) => {
    const w = await mk(g);
    const r = swim(w, "box3d", moldReflex(field, dirs), { steps: 600, field, dirs, drive });
    return { ...r, y: w.readTransforms()[1] };
};

// ---- 1. impulse is in the contract, and it was in the loader all along ----------------------------------------
{
    ok("impulse is a contract call now", CONTRACT.includes("impulse"),
       CONTRACT.length + " calls. box3dLoader.js has had `impulse(idx, v)` ON LINE 46 ALL ALONG -- exactly as it had addBox before v2565 asked for it. THE LOADER KEEPS HAVING CAPABILITIES THE CONTRACT DOES NOT REQUEST, AND A CAPABILITY NOBODY REQUESTS IS INDISTINGUISHABLE FROM ONE THAT DOES NOT EXIST.");
    const src = fs.readFileSync(path.join(here, "paramecium.js"), "utf8");
    ok("...and swim() still DECLARES by default", /const drive = opts\.drive \?\? "velocity"/.test(src),
       "switching the default would move every number v2552 through v2566 measured. THIS ENGINE DOES NOT REWRITE HISTORY TO MAKE A NEW IDEA LOOK GOOD.");
}

// ---- 2. THE WORLD REACHES THE CREATURE ------------------------------------------------------------------------
{
    const a = await run("impulse", [0, 0, 0]);
    const b = await run("impulse", [0, -9.8, 0]);
    ok("UNDER IMPULSE, GRAVITY REACHES IT -- it falls hundreds of metres", b.y < -100,
       "final y = " + b.y.toFixed(2) + " with gravity vs " + a.y.toFixed(2) + " without. v2566 asked: 'if gravity still changes nothing under impulse control, the world is not reaching the creature at all.' IT IS REACHING IT. IT FELL OUT OF THE WORLD.");
    ok("!! ...AND IT SCORED EXACTLY THE SAME WHILE FALLING", Math.abs(a.food - b.food) < 1,
       "food " + a.food.toFixed(1) + " vs " + b.food.toFixed(1) + " -- IT FELL " + Math.abs(b.y).toFixed(0) +
       " METRES AND DINNER WAS UNAFFECTED. chemoField is `at(x, z)`: IT HAS NO Y. THE WORLD REACHES THE CREATURE; THE CREATURE'S SENSES DO NOT REACH THE WORLD.");
    ok("...and it still finds the peak, which is the damning part", b.best > 0.99,
       "best taste " + b.best.toFixed(3) + " at y = " + b.y.toFixed(0) + ". A CREATURE WHOSE SENSOR HAS NO Y CANNOT BE GIVEN A Y BY ANY AMOUNT OF PHYSICS -- IT WILL FALL FOREVER AND REPORT THAT DINNER WAS LOVELY.");
}

// ---- 3. v2566's premise, corrected ----------------------------------------------------------------------------
{
    const v = await run("velocity", [0, -9.8, 0]);
    const v0 = await run("velocity", [0, 0, 0]);
    ok("v2566 WAS RIGHT that velocity-drive scores identically with and without gravity",
       Math.abs(v.food - v0.food) < 1, "food " + v0.food.toFixed(1) + " vs " + v.food.toFixed(1));
    ok("...but WRONG about why -- it had ALREADY sunk to -6.72 and scored the same anyway", v.y < -1,
       "final y = " + v.y.toFixed(2) + ". Even the velocity-driven creature was falling between its 8-tick corrections. 'SCORE UNCHANGED' NEVER MEANT 'WORLD NOT REACHING'. IT MEANT THE SCORE COULD NOT SEE.");
    ok("...and impulse-drive is WEAKER, which is arithmetic, not a finding",
       (await run("impulse", [0, 0, 0])).food < v0.food,
       "impulse 39.0 vs velocity 201.1 at impulseScale 0.35 -- it asks for less momentum than setVelocity declares, so it moves slower and eats less. Turning that dial would change the number and prove nothing.");
}

// ---- 4. the fix this points at, NOT DONE, and named ------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(here, "paramecium.js"), "utf8");
    ok("chemoField STILL has no y, and this version does not pretend otherwise", /at\(x, z\)/.test(src),
       "THE NEXT ROUND IS A 3D FIELD AND 3D HEADINGS -- the creature cannot be asked to care about a dimension its nose cannot smell and its legs cannot walk. Everything else here is scaffolding for that.");
}

console.log(fails ? "\nparameciumDrive-selfcheck: " + fails + " FAILED" : "\nparameciumDrive-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
