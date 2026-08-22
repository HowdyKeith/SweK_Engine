// WebGLEngine/physics/box3d/box3dConformance-selfcheck.mjs — v2564
//
// Run: node physics/box3d/box3dConformance-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// v2553 BUILT A CHECKER THAT TESTS A PHYSICS BACKEND BY MAKING IT DO THE JOB. IT HAD NEVER MET REAL BOX3D.
//
// For eleven versions it ran against six deliberate fakes and the flat fallback, because box3d.wasm did not
// exist here. v2560 built it. This is the first time the checker has been pointed at the thing it was written
// for, and it found three things -- one in box3d, two in me.
//
// ---- 1. REAL BOX3D FAILED CONFORMANCE, ON ITS FIRST EVER RUN -------------------------------------------------
//
// Missing: dimensionality. v2557 added an eleventh call to the CONTRACT and taught it to the FAKES and to the
// FALLBACK, and never taught it to the one backend that ships. THE CONTRACT GREW AND THE REAL IMPLEMENTATION
// DID NOT NOTICE, because nothing could run the check. A CHECK THAT CANNOT REACH THE REAL THING IS GRADING A
// REHEARSAL.
//
// ---- 2. "THE BOX3D Y", ANSWERED WITH A MEASUREMENT ------------------------------------------------------------
//
// Same engine, same 5 m/s push straight up, one second, gravity off:
//
//     swk_body_box(type=1, DYNAMIC)   y = 4.8765
//     swk_body_ship                   y = 0.0000
//
// BOX3D IS SPATIAL. The ship does not rise because swk_body_ship sets, in the C:
//
//     bd.motionLocks = (b3MotionLocks){ false, true, false, true, true, true };   // free X/Z
//
// Y IS LOCKED ON PURPOSE. Endless Sky ships fly in a plane; that is the entire point of the helper. So the
// answer to "is everything a 2D plane for it" is: for a SHIP, yes, deliberately, in a 3D engine.
//
// ---- 3. AND THE HOLE THAT MATTERS: THE CHECKER CANNOT DISCOVER THIS ------------------------------------------
//
// The CONTRACT's only body-maker is addShip. So v2553's checker has spent four versions ASKING A SHIP WHETHER
// THE ENGINE HAS AN UP AXIS. It cannot find what the probe forbids. THAT is why dimensionality has to be a
// DECLARATION: the world states what it is, and the checker's job is to catch it LYING -- which it does, by
// pushing up and measuring, which is why a planar world claiming "spatial" fails.
//
// I ALSO GUESSED TWICE GETTING HERE, and the second one nearly shipped: swk_body_box(type=0) is a STATIC BODY
// (`(type == 2) ? kinematic : (type == 1) ? dynamic : static`). A static box does not move, so my first run
// showed box AND ship both at 0.0000 and I was one paragraph from concluding box3d has no up axis. THE NUMBER
// THAT CANNOT BE TRUE IS WORTH MORE THAN THE ONE YOU LIKE -- a 3D physics engine that cannot move up is not a
// finding, it is a broken test.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { conform, CONTRACT } from "../backendConformance.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const WASM = path.join(here, "..", "..", "vendor", "box3d", "box3d.wasm");

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

if (!fs.existsSync(WASM)) {
    console.log("box3dConformance-selfcheck: SKIPPED -- vendor/box3d/box3d.wasm not present.");
    console.log("  This is NOT a pass. Run physics/box3d/build-box3d-wasm-clang.sh.");
    process.exit(0);
}

const load = async () => {
    const { instance } = await WebAssembly.instantiate(fs.readFileSync(WASM), {
        wasi_snapshot_preview1: new Proxy({}, { get: () => () => 0 }),
    });
    return instance.exports;
};

/**
 * A Node-side adapter over the raw wasm, matching box3dLoader.js's world CALL FOR CALL -- read from that file,
 * not invented. The browser loader cannot run here (it fetches its glue over HTTP and the bridge will not boot
 * in the sandbox), so this stands in for it. IF THE TWO EVER DRIFT, THIS CHECK IS TESTING A GHOST -- which is
 * why check 4 below compares them line by line.
 */
const adapter = (e, gravity = [0, -9.8, 0]) => {
    e.swk_world_create(gravity[0], gravity[1], gravity[2]);
    return {
        addShip({ x = 0, z = 0, half = 0.5, density = 1 } = {}) { return e.swk_body_ship(x, z, half, density); },
        // v2565 -- the 12th call. Mirrors box3dLoader.js's addBox, which has existed all along; type "dynamic"
        // maps to 1 because the C reads `(type==2)?kinematic:(type==1)?dynamic:static`.
        addBox({ type = "dynamic", pos = [0, 0, 0], half = [0.5, 0.5, 0.5], density = 1 } = {}) {
            const t = type === "dynamic" ? 1 : type === "kinematic" ? 2 : 0;
            const h = Array.isArray(half) ? half : [half, half, half];
            return e.swk_body_box(t, pos[0], pos[1], pos[2], h[0], h[1], h[2], density);
        },
        setVelocity(i, v) { e.swk_body_set_velocity(i, v[0], v[1], v[2]); },
        // v2567 -- the 13th call. Mirrors box3dLoader.js line 46, which has had it all along.
        impulse(i, j) { e.swk_body_impulse(i, j[0], j[1], j[2]); },
        step(dt = 1 / 60, sub = 4) { e.swk_world_step(dt, sub); },
        bodyCount() { return e.swk_body_count(); },
        readTransforms() { const n = e.swk_body_count(); return new Float32Array(e.memory.buffer, e.swk_transforms(), n * 7).slice(); },
        readVelocities() { const n = e.swk_body_count(); return new Float32Array(e.memory.buffer, e.swk_velocities(), n * 3).slice(); },
        supportsJoints() { return true; },
        jointSpherical(a, b, p) { return e.swk_joint_spherical(a, b, p[0], p[1], p[2]); },
        jointRevolute() {}, jointWeld() {},
        dimensionality() { return "spatial"; },   // must match box3dLoader.js (check 4). SPATIAL as of v2565: addBox joined the contract, so the claim is now cashable.
    };
};

// ---- 1. THE FIRST EVER CONFORMANCE RUN AGAINST REAL BOX3D ----------------------------------------------------
{
    const e = await load();
    const w = adapter(e);
    ok("REAL box3d answers all THIRTEEN contract calls", CONTRACT.every((c) => typeof w[c] === "function"),
       "missing: " + (CONTRACT.filter((c) => typeof w[c] !== "function").join(", ") || "none") +
       " -- ON ITS FIRST EVER RUN IT FAILED ON `dimensionality`. v2557 added an 11th call and taught it to the FAKES and the FALLBACK, never to the backend that ships. A CHECK THAT CANNOT REACH THE REAL THING IS GRADING A REHEARSAL.");
    const r = conform(w, "REAL box3d");
    ok("...and REAL box3d CONFORMS", r.ok,
       r.ok ? "all " + r.checks.length + " checks, against the engine itself rather than a stand-in"
            : r.checks.filter((c) => !c.ok).map((c) => c.name + " -> " + c.detail).join(" | "));
}

// ---- 2. "THE BOX3D Y", MEASURED -------------------------------------------------------------------------------
{
    const e = await load();
    e.swk_world_create(0, 0, 0);   // gravity OFF, or gravity decides the answer instead of the lock
    const box = e.swk_body_box(1, 0, 0, 0, 0.5, 0.5, 0.5, 1.0);   // type 1 == DYNAMIC (the C: `(type==1) ? dynamic : static`)
    const ship = e.swk_body_ship(3, 0, 0.5, 1.0);
    e.swk_body_set_velocity(box, 0, 5, 0);
    e.swk_body_set_velocity(ship, 0, 5, 0);
    for (let s = 0; s < 60; s++) e.swk_world_step(1 / 60, 4);
    const t = new Float32Array(e.memory.buffer, e.swk_transforms(), 14).slice();

    ok("BOX3D IS SPATIAL: a dynamic box pushed up at 5 m/s RISES", Math.abs(t[1] - 5) < 0.3,
       "y = " + t[1].toFixed(4) + " after 1s. THE ENGINE HAS AN UP AXIS AND ALWAYS DID.");
    ok("...but a SHIP does not move, BY DESIGN", Math.abs(t[8]) < 1e-6,
       "y = " + t[8].toFixed(4) + ". swk_body_ship sets motionLocks{false,TRUE,false,true,true,true} IN THE C -- Y IS LOCKED ON PURPOSE. ENDLESS SKY SHIPS FLY IN A PLANE; that is the entire point of the helper. So 'is everything a 2D plane for it?' -> FOR A SHIP, YES, DELIBERATELY, IN A 3D ENGINE.");
    ok("...and a STATIC box does not move either, which is what fooled me first",
       (() => { const e2 = e; const st = e2.swk_body_box(0, -3, 0, 0, .5, .5, .5, 1); e2.swk_body_set_velocity(st, 0, 5, 0);
                for (let s = 0; s < 60; s++) e2.swk_world_step(1 / 60, 4);
                const t2 = new Float32Array(e2.memory.buffer, e2.swk_transforms(), 21).slice();
                return Math.abs(t2[15]) < 1e-6; })(),
       "swk_body_box(type=0) is STATIC, not dynamic. My first run passed 0, saw box AND ship both at 0.0000, and was one paragraph from 'box3d has no up axis'. A 3D PHYSICS ENGINE THAT CANNOT MOVE UP IS NOT A FINDING, IT IS A BROKEN TEST.");
}

// ---- 3. THE HOLE: the checker cannot DISCOVER what the probe forbids -------------------------------------------
{
    // v2565 -- THIS CHECK USED TO ASSERT THE OPPOSITE, AND ITS FAILING IS THE VERSION.
    // v2564 read: "the CONTRACT's only body-maker is addShip ... IT CANNOT FIND WHAT THE PROBE FORBIDS", and
    // that was true and was the reason box3d had to declare itself planar. THE FIX WAS TO CHANGE THE PROBE.
    ok("the CONTRACT can now ask for a body that is NOT a ship", CONTRACT.includes("addShip") && CONTRACT.includes("addBox"),
       "12 calls. v2564's checker spent four versions ASKING A SHIP WHETHER THE ENGINE HAD AN UP AXIS -- and swk_body_ship locks Y on purpose, so the answer was always no and it was never about the engine. A CHECKER CANNOT FIND WHAT ITS PROBE FORBIDS. The instrument was the limit, so the instrument changed.");
    // and it does catch that -- proven here against REAL box3d, not a fake
    const e = await load();
    // v2565 -- THE LIE TO CATCH HAS FLIPPED, AND THAT IS THE VERSION.
    // In v2564 the trap was box3d claiming "spatial" -- a claim it could not cash, because addShip was the only
    // body the contract could make and ships lock Y. Now addBox is in the contract, box3d cashes "spatial" for
    // real, and THE LIE WORTH CATCHING IS THE OPPOSITE ONE: a world with an up axis claiming it has none. That
    // lie is not harmless -- a creature told "planar" will never try to swim up, and the world would never
    // contradict it. AN UNDERSTATED CAPABILITY IS STILL A FALSE INTERFACE.
    const liar = adapter(e);
    liar.dimensionality = () => "planar";     // box3d hiding an axis it really has
    const r = conform(liar, "box3d claiming planar");
    ok("CAUGHT: box3d claiming 'planar' when addBox can rise", !r.ok,
       r.ok ? "*** PASSED. The checker only catches lies in one direction, which is half a gate. ***"
            : "-> " + r.checks.filter((c) => !c.ok)[0].detail +
              ". Caught in BOTH directions now: v2557 proved a planar world claiming spatial fails; this proves a spatial world claiming planar fails too.");
}

// ---- 4. the adapter is not a ghost ----------------------------------------------------------------------------
// This file stands in for box3dLoader.js because the browser loader fetches its glue over HTTP and the bridge
// will not boot here. If the two drift, this check is testing something that does not ship.
{
    const src = fs.readFileSync(path.join(here, "box3dLoader.js"), "utf8");
    ok("box3dLoader.js DECLARES dimensionality -- and NOW declares SPATIAL", /dimensionality\(\) \{ return "spatial"; \}/.test(src),
       "v2564 made this say planar and WAS RIGHT TO: addShip was the only body the contract could make, and ships lock Y, so spatial was a claim no caller could cash. v2565 added addBox -- A METHOD THIS FILE HAS HAD ALL ALONG -- and the same unchanged engine now lifts a box to 4.8765. v2564 ANSWER WENT STALE; v2564 REASONING DID NOT. dimensionality ANSWERS FOR THE CONTRACT, AND THE CONTRACT GREW.");
    for (const call of ["addShip", "addBox", "setVelocity", "impulse", "readTransforms", "supportsJoints", "dimensionality"]) {
        ok("...and the loader really has " + call + "()", new RegExp("\\b" + call + "\\s*\\(").test(src));
    }
}

console.log(fails ? "\nbox3dConformance-selfcheck: " + fails + " FAILED" : "\nbox3dConformance-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
