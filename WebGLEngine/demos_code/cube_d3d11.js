// demos_code/cube_d3d11.js — port of the VBA engine's DemoD3D11.RunCube
//
// The VBA engine's D3D11 path demo spins a single textured cube with
// half-Lambert lighting against a dark sky. This is the WebGL
// equivalent — a single bright entity rotating in place, demonstrating
// that the same visual concept renders cleanly across both engines.
//
// VBA reference: EngineCore_63_Enemies.xlsm → DemoD3D11.bas → RunCube()
// Original loop: 60° rotation per second around Y and X axes.
//
// This demo uses tier-1 spawnMesh + tier-2 router.exec for entity:move
// (rotation isn't in the blessed API yet — router fallback is fine).

const SPAWN_X = 0;
const SPAWN_Y = 25;     // mid-air so it's visible from default cam
const SPAWN_Z = 0;
const SPIN_PER_SEC = Math.PI;   // ~180°/s — same feel as the VBA demo's 60°/s × scale-up

let cubeId = null;
let yawAccum = 0;
let tiltAccum = 0;

export default {
    id:    "cube_d3d11",
    label: "CUBE (D3D11 PORT)",
    hint:  "rotating cube — VBA DemoD3D11.RunCube ported to WebGL",
    controls: [
        "Auto — entity rotates on Y and X axes",
        "Compare with EngineCore.xlsm → DemoD3D11.RunCube",
    ],

    start(ctx) {
        cubeId = ctx.spawnMesh("ogre_hp_weapon", SPAWN_X, SPAWN_Y, SPAWN_Z, 3.0);
        if (cubeId == null) {
            console.warn("[cube_d3d11] spawnMesh returned null — engine may not have entity system ready");
            return;
        }
        yawAccum = 0;
        tiltAccum = 0;
        // Look at the spawn point so the user sees the cube on demo start
        try { ctx.lookAt?.(SPAWN_X, SPAWN_Y, SPAWN_Z); } catch {}
        ctx.kpop?.info?.("Cube demo", "VBA DemoD3D11.RunCube ported");
        console.log("[cube_d3d11] started; entity id =", cubeId);
    },

    tick(ctx, dt) {
        if (cubeId == null) return;
        yawAccum  = (yawAccum  + SPIN_PER_SEC        * dt) % (Math.PI * 2);
        tiltAccum = (tiltAccum + SPIN_PER_SEC * 0.5 * dt) % (Math.PI * 2);
        // Router fallback — entity:move with yaw + tilt applied each frame
        ctx.router?.exec?.({
            type: "entity:move",
            id:   cubeId,
            x:    SPAWN_X,
            y:    SPAWN_Y,
            z:    SPAWN_Z,
            yaw:  yawAccum,
            tilt: tiltAccum,
        });
    },

    stop(ctx) {
        if (cubeId != null) {
            ctx.despawnEntity?.(cubeId);
            cubeId = null;
        }
        console.log("[cube_d3d11] stopped");
    },
};
