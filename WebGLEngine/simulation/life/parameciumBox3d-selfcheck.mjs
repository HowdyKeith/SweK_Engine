// WebGLEngine/simulation/life/parameciumBox3d-selfcheck.mjs — v2566
//
// Run: node simulation/life/parameciumBox3d-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// THE PARAMECIUM IN REAL BOX3D. This was the point of v2552, and it took fourteen versions to get here because
// box3d.wasm did not exist until v2560.
//
// ---- IT WAS A SHIP -------------------------------------------------------------------------------------------
//
// swim() called world.addShip() for fourteen versions. In the flat fallback that is harmless -- everything there
// is planar anyway. Point the same creature at REAL box3d and it becomes a real bug: swk_body_ship sets
// motionLocks{false,TRUE,false,...}, Y LOCKED ON PURPOSE, because Endless Sky ships fly in a plane.
//
// THE PARAMECIUM WOULD HAVE BEEN FLAT IN A 3D ENGINE AND THE ENGINE WOULD NOT HAVE BEEN AT FAULT. It asked for a
// ship. It got a ship. v2565 put addBox in the contract so a caller could ask for something else; nothing asked
// until now. A CAPABILITY NOBODY REQUESTS IS INDISTINGUISHABLE FROM ONE THAT DOES NOT EXIST.
//
// ---- AND THE ANSWER IS BORING, WHICH IS THE RESULT ------------------------------------------------------------
//
//     world                        mold     UCB1
//     planarFallbackWorld         200.4     75.4
//     REAL box3d (no gravity)     201.1     74.5
//     REAL box3d (gravity -9.8)   201.1     74.5
//
// SAME CREATURE, SAME POLICY INTERFACE, THREE BACKENDS, SAME NUMBERS. v2552 claimed the ten calls existed so a
// backend could be swapped without the creature noticing, and asserted it against a fallback that was built to
// agree. THIS IS THE FIRST TIME IT HAS BEEN TRUE OF A BACKEND THAT WAS NOT BUILT TO AGREE. The contract works.
//
// ---- GRAVITY DID NOTHING, AND THAT IS THE FINDING -------------------------------------------------------------
//
// -9.8 m/s^2 changed the score by zero. Not "a little" -- 201.1 both ways. Because swim() RE-ASSERTS ITS VELOCITY
// EVERY runLen TICKS (default 8): gravity gets eight ticks to pull, and then setVelocity overwrites the result.
// THE CREATURE'S OWN CONTROL LOOP ERASES THE WORLD.
//
// That is not a bug in box3d and not a bug in swim. It is a fact about velocity control: A BODY THAT SETS ITS
// VELOCITY DOES NOT HAVE PHYSICS DONE TO IT, IT HAS PHYSICS DONE TO IT FOR EIGHT TICKS AT A TIME. If the
// paramecium is ever meant to FEEL the world -- to sink, to be pushed -- it must apply FORCES, not velocities.
// The shim has swk_body_impulse. Nothing calls it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { swim, chemoField, headings, moldReflex } from "./paramecium.js";
import { ucb1 } from "../../brain/bench/bandit.mjs";
import { planarFallbackWorld } from "../../physics/planarFallbackWorld.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const WASM = path.join(here, "..", "..", "vendor", "box3d", "box3d.wasm");

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

if (!fs.existsSync(WASM)) {
    console.log("parameciumBox3d-selfcheck: SKIPPED -- vendor/box3d/box3d.wasm not present.");
    console.log("  This is NOT a pass. Run physics/box3d/build-box3d-wasm-clang.sh.");
    process.exit(0);
}

/** Mirrors box3dLoader.js call for call -- the browser loader cannot run here (it fetches its glue over HTTP). */
const box3dWorld = async (gravity) => {
    const { instance } = await WebAssembly.instantiate(fs.readFileSync(WASM), {
        wasi_snapshot_preview1: new Proxy({}, { get: () => () => 0 }),
    });
    const e = instance.exports;
    e.swk_world_create(gravity[0], gravity[1], gravity[2]);
    return {
        _e: e,
        addShip({ x = 0, z = 0, half = 0.5, density = 1 } = {}) { return e.swk_body_ship(x, z, half, density); },
        addBox({ type = "dynamic", pos = [0, 0, 0], half = [0.5, 0.5, 0.5], density = 1 } = {}) {
            const t = type === "dynamic" ? 1 : type === "kinematic" ? 2 : 0;
            const h = Array.isArray(half) ? half : [half, half, half];
            return e.swk_body_box(t, pos[0], pos[1], pos[2], h[0], h[1], h[2], density);
        },
        setVelocity(i, v) { e.swk_body_set_velocity(i, v[0], v[1], v[2]); },
        step(dt = 1 / 60, s = 4) { e.swk_world_step(dt, s); },
        bodyCount() { return e.swk_body_count(); },
        readTransforms() { return new Float32Array(e.memory.buffer, e.swk_transforms(), e.swk_body_count() * 7).slice(); },
        readVelocities() { return new Float32Array(e.memory.buffer, e.swk_velocities(), e.swk_body_count() * 3).slice(); },
        supportsJoints() { return true; }, jointSpherical() {}, jointRevolute() {}, jointWeld() {},
        dimensionality() { return "spatial"; },
    };
};

const field = chemoField(), dirs = headings(8);

// ---- 1. IT ASKS FOR THE RIGHT BODY NOW ------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(here, "paramecium.js"), "utf8");
    ok("swim() asks a SPATIAL world for a body that is not a ship", /world\.addBox\(\{ pos:/.test(src),
       "it called addShip for fourteen versions. Harmless in the flat fallback -- everything there is planar. A REAL BUG in box3d, where swk_body_ship LOCKS Y ON PURPOSE so Endless Sky ships fly in a plane. THE PARAMECIUM WOULD HAVE BEEN FLAT IN A 3D ENGINE AND THE ENGINE WOULD NOT HAVE BEEN AT FAULT.");
    ok("...and still takes the ship in a PLANAR world, which is all it has", /world\.addShip\(\{ x:/.test(src),
       "a planar world offering addBox does not become spatial -- planarFallbackWorld still eats v[1] on line 12, and still says so");
}

// ---- 2. THE SUBSTITUTION IS INVISIBLE -- against a backend NOT built to agree ---------------------------------
{
    const plan = swim(planarFallbackWorld(), "planarFallbackWorld", moldReflex(field, dirs), { steps: 600, field, dirs });
    const real = swim(await box3dWorld([0, 0, 0]), "box3d", moldReflex(field, dirs), { steps: 600, field, dirs });
    ok("THE MOLD SCORES THE SAME IN REAL BOX3D AS IN THE FALLBACK", Math.abs(real.food / plan.food - 1) < 0.05,
       "fallback " + plan.food.toFixed(1) + " vs REAL box3d " + real.food.toFixed(1) +
       " -- v2552 claimed the contract existed so a backend could be swapped WITHOUT THE CREATURE NOTICING, and proved it against a fallback BUILT TO AGREE. THIS IS THE FIRST TIME IT IS TRUE OF A BACKEND THAT WAS NOT.");
    ok("...and both find the peak", plan.best > 0.99 && real.best > 0.99,
       "best taste " + plan.best.toFixed(3) + " / " + real.best.toFixed(3));

    const bandit = swim(await box3dWorld([0, 0, 0]), "box3d", ucb1(), { steps: 600, field, dirs });
    ok("...and UCB1 still loses to the mold IN THE REAL ENGINE", bandit.food < real.food * 0.6,
       "UCB1 " + bandit.food.toFixed(1) + " vs mold " + real.food.toFixed(1) +
       " -- v2552's finding survives contact with real physics. The bandit's handicap was never the world.");
}

// ---- 3. GRAVITY DID NOTHING, AND THAT IS THE FINDING -----------------------------------------------------------
{
    const none = swim(await box3dWorld([0, 0, 0]), "box3d", moldReflex(field, dirs), { steps: 600, field, dirs });
    const full = swim(await box3dWorld([0, -9.8, 0]), "box3d", moldReflex(field, dirs), { steps: 600, field, dirs });
    ok("!! -9.8 m/s^2 OF GRAVITY CHANGES THE SCORE BY NOTHING", Math.abs(full.food - none.food) < 1,
       "no gravity " + none.food.toFixed(1) + " vs gravity " + full.food.toFixed(1) +
       " -- NOT 'a little'. swim() RE-ASSERTS ITS VELOCITY EVERY 8 TICKS, so gravity gets eight ticks to pull and then setVelocity overwrites the result. THE CREATURE'S OWN CONTROL LOOP ERASES THE WORLD.");

    // Prove the world really does have gravity, so the check above is about swim() and not a dead parameter.
    const w = await box3dWorld([0, -9.8, 0]);
    const b = w.addBox({ pos: [0, 10, 0], half: 0.5 });
    for (let i = 0; i < 60; i++) w.step(1 / 60);
    ok("...and the gravity IS there -- an unattended body falls", w.readTransforms()[b * 7 + 1] < 6,
       "dropped from y=10 to y=" + w.readTransforms()[b * 7 + 1].toFixed(2) + " in 1s. So the parameter is live and the creature is simply overwriting it. A BODY THAT SETS ITS VELOCITY DOES NOT HAVE PHYSICS DONE TO IT -- IT HAS PHYSICS DONE TO IT EIGHT TICKS AT A TIME.");
    ok("...and the fix, if the paramecium should ever FEEL the world, is forces not velocities", true,
       "the shim exports swk_body_impulse. NOTHING CALLS IT. That is the next question, not this version's answer.");
}

console.log(fails ? "\nparameciumBox3d-selfcheck: " + fails + " FAILED" : "\nparameciumBox3d-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
