#!/usr/bin/env node
// WebGLEngine/tools/ship/voxelAvatar-selfcheck.mjs -- v4522
//
// THE AVATAR ON THE DEVICE WORLD (sandbox round 6): render/voxelAvatar.mjs over camera/camera.js, the sandbox's own first-person
// camera, driven headless on a hand world (a slab, a wall three high, a one-voxel step, a two-voxel ledge, a tower). Section 1,
// the walk: the eye snaps to the ground plus 1.7; a second of W at yaw 0 moves 5 units along -z on the ground; the wall stops the
// walk short of its voxel and a diagonal walk slides along it; the one-voxel step is climbed and the two-voxel wall is not; Space
// jumps to an apex of v^2 / 2g and lands where it left; walking off the ledge falls two voxels and lands; Shift sprints at 9; two
// runs of the same keys give the same positions; the spec is read from the instance. Section 2, the matrix: avatarViewProj equals
// camera/buildViewProj.js element for element on several poses (the twin: both column-major, -z forward, +y up), and the
// forward is buildViewProj's. Section 3, ON BOTH BACKENDS: the avatar standing on the slab looking at the tower draws the tower
// across the frame's centre column; after walking three units toward it the tower is wider; the window's keydown reaches the
// camera's keys through its own listeners; the backends agree.
//
// MEASURED AT v4522: the eye snaps to 5.7 on the slab; a second of W walks to z 25.5 at velocity -5; the three-high wall stops the walk
// at z 11.083 and a diagonal walk slides to x 31.57 with z 11.02; the one-voxel step is stood on at z 16.5 with the eye at 6.7; the jump
// apex is +1.50 (v^2 / 2g is 1.56 at 60 Hz) with the landing at tick 49; Shift walks 9 units; avatarViewProj is within 1.9e-6 of
// buildViewProj on four poses; on both backends the tower is 8 px wide at the frame's centre from 12 units and 10 px from 9, the
// backends 0 apart, and a window keydown reaches the camera's keys. *** THE SANDBOX'S CAMERA, MEASURED AND RECORDED, NOT FIXED
// HERE: *** its bilinear ground sample blends the standing column with the columns at +x and +z only, so a two-voxel wall approached
// going +z is a ramp and is climbed (z 21.08, eye 7.53) while approached going -z it is a wall (z 22.08); and a two-voxel ledge walked
// off toward +z SINKS THE FEET INTO THE LAST ROW AND STICKS AT THE LIP (z 39.08, eye 5.53) while walked off toward -z it is descended
// (z 2.5, eye 3.7). Three gate-side corrections: a wall eight voxels wide was slid AROUND (it spans the world now); the step was read
// at z 17.17 where the blend to the next row had begun (read at 16.5 now); the ledge walk ran fifteen units and left the floor's own
// end behind (three units now).
//
// SABOTAGE (v4522): A  avatarForward with fz = +cos yaw                      -> 5 red: the twin off by 61, the forward, the tower off
//                                                                                the centre column on both backends.
//                   B  stepAvatar stepping with dt 0                        -> 12 red: nothing moves, jumps or falls.
//                   C  avatarCamera not entering fp (observer stays)        -> 13 red: the eye at 50, the observer flies through walls.
//                   D  avatarViewProj looking from the target to the eye    -> 4 red: the twin, the centre column, both backends.
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/voxelAvatar-selfcheck.mjs      (~20 s)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { avatarCamera, stepAvatar, avatarForward, avatarViewProj, avatarPose, avatarSpec } from "../../render/voxelAvatar.mjs";
import { buildViewProj } from "../../camera/buildViewProj.js";
import * as G from "../../render/gpuDriven.mjs";
import { miniWorld } from "../../render/voxelDevice.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const quiet = () => { const log = console.log; console.log = (...a) => { if (!/\[Camera\]/.test(String(a[0]))) log(...a); }; };
quiet();
/** the hand world: a floor (top y 1) 48 x 48 and a slab (top y 3) for z in [4, 40); a wall 3 high across the whole width at z 10; a step (one
 *  voxel) at z 16..17, x 4..11; a two-voxel wall at z 20..21, x 4..11; a tower at (30, 4..8, 30). The slab's two ends are two-voxel ledges. */
function handWorld() {
    const w = miniWorld(); for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) { w.setVoxel(x, 1, z, 2); if (z >= 4 && z < 40) { w.setVoxel(x, 3, z, 3); w.setVoxel(x, 2, z, 2); } }
    for (let x = 0; x < 48; x++) for (let y = 4; y < 7; y++) w.setVoxel(x, y, 10, 1);
    for (let x = 4; x < 12; x++) for (let z = 16; z < 18; z++) w.setVoxel(x, 4, z, 4);
    for (let x = 4; x < 12; x++) for (let z = 20; z < 22; z++) { w.setVoxel(x, 4, z, 1); w.setVoxel(x, 5, z, 1); }
    for (let y = 4; y < 9; y++) w.setVoxel(30, y, 30, 1);
    return w;
}
const walk = (cam, keys, ticks, dt = 1 / 60) => { let p = null; for (let i = 0; i < ticks; i++) p = stepAvatar(cam, dt, keys); return p; };

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. the walk, headless, on the hand world");
{
    const w = handWorld(), cam = avatarCamera(w, { x: 8.5, z: 30.5 }), spec = avatarSpec(cam);
    ok("the spec is the sandbox's: eye 1.7, walk 5, sprint 9, jump 7.5, gravity 18", spec.eyeHeight === 1.7 && spec.walk === 5 && spec.sprint === 9 && spec.jump === 7.5 && spec.gravity === 18, JSON.stringify(spec));
    ok("in fp mode the eye snaps to the ground (the slab's top is y 4) plus 1.7", cam.mode === "fp" && near(cam.position.y, 5.7) && avatarPose(cam).onGround);
    const p1 = walk(cam, ["KeyW"], 60);
    ok("a second of W at yaw 0 walks 5 units along -z and stays on the ground", near(p1.z, 25.5, 1e-6) && near(p1.x, 8.5) && near(p1.y, 5.7) && p1.onGround && near(p1.velocity.z, -5), `${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}, ${p1.z.toFixed(2)}`);
    const c2 = avatarCamera(w, { x: 24.5, z: 14.5 }); const p2 = walk(c2, ["KeyW"], 120);
    ok("walking into the three-high wall at z 10 stops in the voxel before it (z in [11, 12))", p2.z >= 11 && p2.z < 12 && near(p2.y, 5.7), `z ${p2.z.toFixed(3)}`);
    const c3 = avatarCamera(w, { x: 24.5, z: 14.5, yaw: Math.PI / 4 }); const p3 = walk(c3, ["KeyW"], 120);
    ok("walking diagonally into it slides along the wall: x keeps moving (5 cos 45 a second) while z stays in the voxel before the wall", p3.z >= 11 && p3.z < 12 && p3.x > 24.5 + 5 * Math.SQRT1_2 * 1.5, `x ${p3.x.toFixed(2)}, z ${p3.z.toFixed(3)}`);
    const c4 = avatarCamera(w, { x: 8.5, z: 14.5, yaw: Math.PI }); const p4 = walk(c4, ["KeyW"], 24);
    ok("the one-voxel step at z 16 is climbed (auto-step): standing on it at z 16.5 the eye is 6.7", near(p4.z, 16.5, 1e-6) && near(p4.y, 6.7, 1e-6) && p4.onGround, `z ${p4.z.toFixed(2)}, y ${p4.y.toFixed(2)}`);
    // *** THE SANDBOX'S OWN ASYMMETRY, MEASURED AND RECORDED, NOT FIXED HERE. *** camera.js samples the ground bilinearly between the column
    // it stands in and the columns at +x and +z, so a wall approached going +z is felt as a ramp one voxel early and climbed if the eye
    // can rise past it, while the same wall approached going -z is a wall. Two voxels is climbable one way and not the other; three is
    // a wall both ways. And a two-voxel ledge walked off toward +z sinks the feet into the last row and STICKS at the lip; walked off
    // toward -z it is descended. The camera is index.html's and is left as it is; this round carries it, and says what it does.
    const c5 = avatarCamera(w, { x: 8.5, z: 18.5, yaw: Math.PI }); const p5 = walk(c5, ["KeyW"], 60);
    ok("the two-voxel wall at z 20 approached going +z is CLIMBED as a ramp (the bilinear sample looks toward +z)", p5.z > 21 && near(p5.y, 7.7, 0.3), `z ${p5.z.toFixed(3)}, y ${p5.y.toFixed(2)}`);
    const c5b = avatarCamera(w, { x: 8.5, z: 23.5, yaw: 0 }); const p5b = walk(c5b, ["KeyW"], 60);
    ok("the same two-voxel wall approached going -z is a wall: the walk stops in the voxel before it", p5b.z >= 22 && p5b.z < 23 && near(p5b.y, 5.7), `z ${p5b.z.toFixed(3)}, y ${p5b.y.toFixed(2)}`);
    const c6 = avatarCamera(w, { x: 8.5, z: 30.5 }); stepAvatar(c6, 1 / 60, ["Space"]); let apex = 0, landed = -1; for (let i = 0; i < 120; i++) { const p = stepAvatar(c6, 1 / 60, []); if (p.y > apex) apex = p.y; if (landed < 0 && p.onGround && i > 5) landed = i; }
    ok("Space jumps: the apex is near v^2 / 2g = 1.56 above the eye and the landing is back at 5.7", apex - 5.7 > 1.3 && apex - 5.7 < 1.7 && landed > 0 && near(c6.position.y, 5.7), `apex +${(apex - 5.7).toFixed(2)} at tick ${landed}`);
    const c7 = avatarCamera(w, { x: 40.5, z: 38.5, yaw: Math.PI }); const p7 = walk(c7, ["KeyW"], 180);
    ok("walking toward +z off the two-voxel ledge at z 40 STICKS at the lip (the sandbox's own: the bilinear ground sinks the feet into the last row)", p7.z > 39 && p7.z < 40 && p7.y < 5.7 && p7.y > 5.3, `z ${p7.z.toFixed(2)}, y ${p7.y.toFixed(2)}`);
    const c7b = avatarCamera(w, { x: 40.5, z: 5.5, yaw: 0 }); const p7b = walk(c7b, ["KeyW"], 36);   // three units: onto the floor, not off the world (the first draft walked 15 and left the floor's end at z 0 behind)
    ok("walking toward -z off the ledge at z 4 descends to the floor (eye 3.7 at z 2.5)", near(p7b.z, 2.5, 1e-6) && near(p7b.y, 3.7, 1e-6) && p7b.onGround, `z ${p7b.z.toFixed(2)}, y ${p7b.y.toFixed(2)}`);
    const c8 = avatarCamera(w, { x: 40.5, z: 30.5 }); const p8 = walk(c8, ["KeyW", "ShiftLeft"], 60);
    ok("Shift sprints at 9 units a second", near(p8.z, 21.5, 1e-6) && near(p8.velocity.z, -9), `z ${p8.z.toFixed(2)}`);
    const c9 = avatarCamera(w, { x: 8.5, z: 30.5 }); const r1 = [];  for (let i = 0; i < 90; i++) r1.push(stepAvatar(c9, 1 / 60, i < 30 ? ["KeyW"] : i < 40 ? ["KeyW", "Space"] : ["KeyD"]).z);
    const c10 = avatarCamera(w, { x: 8.5, z: 30.5 }); const r2 = []; for (let i = 0; i < 90; i++) r2.push(stepAvatar(c10, 1 / 60, i < 30 ? ["KeyW"] : i < 40 ? ["KeyW", "Space"] : ["KeyD"]).z);
    ok("two runs of the same keys give the same positions tick for tick", r1.every((v, i) => v === r2[i]));
    ok("no keys, no motion: the pose is what it was after a second", (() => { const c = avatarCamera(w, { x: 8.5, z: 30.5 }); const a = avatarPose(c); const b = walk(c, [], 60); return a.x === b.x && a.y === b.y && a.z === b.z; })());
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. the matrix twin");
{
    const w = handWorld(), W = 200, H = 120;
    let worst = 0; const poses = [[8.5, 30.5, 0, 0], [24.5, 14.5, Math.PI / 4, -0.3], [8.5, 18.5, Math.PI, 0.5], [30.5, 5.5, -2.1, -0.9]];
    for (const [x, z, yaw, pitch] of poses) { const cam = avatarCamera(w, { x, z, yaw, pitch }); const mine = avatarViewProj(cam, W, H, G).viewProj, ref = new Float32Array(16); buildViewProj(ref, cam.position, cam.yaw, cam.pitch, cam.fov, cam.near, cam.far, W / H); for (let i = 0; i < 16; i++) worst = Math.max(worst, Math.abs(mine[i] - ref[i])); }
    ok("*** avatarViewProj equals camera/buildViewProj.js element for element on four poses (within 1e-4 of values up to 1000) ***", worst < 1e-4, `worst ${worst.toExponential(2)}`);
    const f = avatarForward(0, 0), g = avatarForward(Math.PI / 2, 0), h = avatarForward(0, Math.PI / 2);
    ok("the forward is buildViewProj's: yaw 0 looks down -z, yaw pi/2 down +x, pitch pi/2 straight up", near(f[2], -1) && near(f[0], 0) && near(g[0], 1) && near(g[2], 0, 1e-9) && near(h[1], 1));
    const cam = avatarCamera(w, { x: 30.5, z: 40.5, yaw: 0, pitch: 0 }); const vp = avatarViewProj(cam, W, H, G), p = G.project(vp.viewProj, [30.5, 6, 30]);
    ok("the tower ten units ahead projects to the frame's centre column", Math.abs(p[0]) < 0.05 && p[3] > 0, `ndc x ${p[0].toFixed(3)}`);
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("3. ON BOTH BACKENDS: from the avatar's eye");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const W = 200, H = 120;
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const G = await import("/render/gpuDriven.mjs");
            const L = await import("/render/litSphere.mjs");
            const V = await import("/render/voxelDevice.mjs");
            const E = await import("/render/voxelDeviceEdit.mjs");
            const A = await import("/render/voxelAvatar.mjs");
            const { W, H } = a; const out = {};
            const make = () => { const w = V.miniWorld(); for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) { w.setVoxel(x, 3, z, 3); w.setVoxel(x, 2, z, 2); } for (let y = 4; y < 9; y++) w.setVoxel(30, y, 30, 1); return w; };
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 300)));
                const w = make(), st = E.editState(w), sc = E.editScene(dev, st, G, L);
                const cam = A.avatarCamera(w, { canvas: cv, x: 30.5, z: 42.5, yaw: 0, pitch: 0 });   // twelve units south of the tower, looking north (-z)
                const shoot = async () => { const vp = A.avatarViewProj(cam, W, H, G); return Array.from((await sc.frame({ viewProj: vp.viewProj, eye: vp.eye, read: true, clear: [0, 0, 0, 1] }).pixels).pixels); };
                const far = await shoot();
                for (let i = 0; i < 36; i++) A.stepAvatar(cam, 1 / 60, ["KeyW"]);   // 3 units closer
                const nearer = await shoot(); const pose = A.avatarPose(cam);
                // the camera's OWN listeners: a keydown on the window reaches its key set
                cam.keys.clear(); window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", bubbles: true })); const hasW = cam.keys.has("KeyW"); window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW", bubbles: true })); const releasedW = !cam.keys.has("KeyW");
                out[backend] = { path: sc.path, errs, far, nearer, pose, hasW, releasedW };
                dev.destroy();
            }
            return out;
        }` });
        ok("both backends drew the world from the avatar's eye and stepped it", r.ok && r.result && r.result.webgpu && r.result.webgl2 && r.result.webgpu.errs.length === 0, r.ok ? (r.result.webgpu.errs || []).join(" | ").slice(0, 300) : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && r.result.webgpu && r.result.webgl2) {
            const N = W * H, apart = (A, B) => { let n = 0; for (let p = 0; p < N; p++) if (Math.abs(A[p * 4] - B[p * 4]) > 8 || Math.abs(A[p * 4 + 1] - B[p * 4 + 1]) > 8 || Math.abs(A[p * 4 + 2] - B[p * 4 + 2]) > 8) n++; return n; };
            // stone is grey (r ~ g ~ b) and the slab is green: the tower's pixels are the grey ones; its width is the grey run on the row through the frame's middle
            const greyWidth = (px, row) => { let x0 = W, x1 = -1; for (let x = 0; x < W; x++) { const p = (row * W + x) * 4, r_ = px[p], g_ = px[p + 1], b_ = px[p + 2]; if (r_ > 40 && Math.abs(r_ - g_) < 12 && Math.abs(b_ - g_) < 20 && g_ < r_ * 1.15) { if (x < x0) x0 = x; if (x > x1) x1 = x; } } return x1 < 0 ? { w: 0, mid: -1 } : { w: x1 - x0 + 1, mid: (x0 + x1) / 2 }; };
            for (const bk of ["webgpu", "webgl2"]) {
                const R = r.result[bk], row = Math.floor(H * 0.55), a = greyWidth(R.far, row), b = greyWidth(R.nearer, row);
                report(`${bk} (${R.path}): tower ${a.w} px wide centred at ${a.mid} from 12 units, ${b.w} px at ${b.mid} from ${(42.5 - R.pose.z).toFixed(1)} units closer; eye ${R.pose.y.toFixed(2)}; keydown reached the camera: ${R.hasW}, keyup released it: ${R.releasedW}`);
                ok(`*** ${bk}: the tower stands in the frame's centre column from the avatar's eye, and is wider after three units of walking toward it ***`, a.w > 3 && Math.abs(a.mid - W / 2) < 6 && b.w > a.w * 1.2 && Math.abs(b.mid - W / 2) < 6 && Math.abs(R.pose.z - 39.5) < 1e-3 && Math.abs(R.pose.y - 5.7) < 1e-6);
                ok(`  ${bk}: a keydown on the window reaches the camera's own key set and a keyup releases it`, R.hasW && R.releasedW);
            }
            ok("  the two backends agree on the nearer frame within 8 of 255 on all but edge pixels (fewer than 3 %)", apart(r.result.webgpu.nearer, r.result.webgl2.nearer) < N * 0.03, `${apart(r.result.webgpu.nearer, r.result.webgl2.nearer)} apart`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: pointer lock itself (a user gesture the harness cannot give); the sandbox's sprint energy bar (null here, so sprint is free); the observer and kaiju modes (not the avatar's); the page's Walk toggle (eyeballed).");
process.exit(fails ? 1 : 0);
