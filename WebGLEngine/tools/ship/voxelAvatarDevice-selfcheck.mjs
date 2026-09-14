#!/usr/bin/env node
// WebGLEngine/tools/ship/voxelAvatarDevice-selfcheck.mjs -- v4551
//
// Run: node tools/ship/voxelAvatarDevice-selfcheck.mjs      (~2.8 s -- MEASURED, and OVER the 3,000 ms
// ship-time budget ON PURPOSE. See below.)
//
// *** THE DEVICE HALF OF tools/ship/voxelAvatar-selfcheck.mjs, SPLIT OUT AT v4551 SO THE CPU HALF COULD GO
// BACK INTO THE SHIP SWEEP. *** This file boots a headless shell, creates a real WebGPU device AND a real
// WebGL2 device, renders the avatar's view twice on each, reads the pixels back, and holds the two backends
// against one another. That is ~2.8 seconds and NONE OF IT IS COMPRESSIBLE: it is a browser launch plus two
// device initialisations, and the work inside them is already ONE origin call looping over both backends.
// There is no faster way to boot Chromium and two GPU devices, so "make the gate faster" has exactly one
// available meaning -- make the SHIP-TIME gate cheap -- and that is what the split does.
//
// ---- WHY THE SPLIT, MEASURED RATHER THAN ASSUMED -------------------------------------------------------
//
// voxelAvatar-selfcheck read 3,063 ms in the v4550 timings against a 3,000 ms budget, so the quick sweep
// skipped the WHOLE FILE -- and the rows that had actually caught a camera regression were inside it.
// Timed by section on this box:
//
//     section 1  the walk, headless, on the hand world          40 ms
//     section 2  the matrix twin                                 2 ms
//     section 3  ON BOTH BACKENDS (this file)               ~2,800 ms
//
// 42 ms of 2,850 was CPU. *** THE 98.5% THAT IS NOT CPU WAS EXILING THE 1.5% THAT IS, AND THE 1.5% IS THE
// HALF WITH THE PROVEN CATCH. *** v4545's repair was caught by section 1 -- green at HEAD and red against
// the repair -- and that row's own comment says so in as many words. Section 3's rows are about the
// RENDERER: does the tower stand in the frame's centre column, do the two backends agree. Both matter;
// only one of them is cheap, and only one of them was being paid for at ship time.
//
// *** NO COVERAGE IS LOST BY THE SPLIT, AND THAT IS THE WHOLE ARGUMENT FOR IT. *** Before v4551 the entire
// file was over budget, so BOTH halves were covered only by the ship ritual's sweep rotation. After it the
// CPU half runs on EVERY ship and this half stays exactly where it already was. Nothing moves down; half
// of it moves up. A split that could not say that would be a coverage cut wearing a performance argument,
// and the way to check is the ledger rather than the intention.
//
// ---- AND voxelAvatar IS ONE OF FIFTY-TWO ---------------------------------------------------------------
//
// 95 gates in this tree call runInEngineOrigin and 52 of them are over the budget. The species is not "one
// gate got slow", it is "A GATE THAT BOOTS A BROWSER CANNOT FIT IN A SHIP-TIME BUDGET, AND ANY CPU ROWS
// SHARING ITS FILE ARE EXILED WITH IT". v4551's census of that population is in the round note; this file
// is the first split and not the last word on it.
//
// ---- SABOTAGES: THE v4522 BATTERY RE-RUN ACROSS BOTH HALVES --------------------------------------------
//
// *** THE TEST OF A SPLIT IS NOT THAT THE NEW FILE PASSES, IT IS THAT THE OLD BATTERY STILL LANDS. *** The
// four sabotages voxelAvatar-selfcheck recorded at v4522 were re-run against the two halves together:
//
//                                                       v4522   v4551   cpu   device
//   A  avatarForward with fz = +cos yaw                    5       5      3      2
//   B  stepAvatar stepping with dt 0                      12      12     10      2
//   C  avatarCamera not entering fp (observer stays)      13      13     11      2
//   D  avatarViewProj looking from the target to the eye   4       4      2      2
//
// EVERY COUNT IS IDENTICAL AND EVERY SABOTAGE IS CAUGHT BY BOTH HALVES. A split that had opened a blind
// spot would show up as a number that fell; none did. And because each is caught on the CPU side too, all
// four are now caught AT SHIP TIME, which none of them was while the file sat over budget.
//
//   E  this file deleted outright                 2 RED in tools/ship/instruments-selfcheck.mjs
//
// E is the keeper for the SPLIT ITSELF rather than for the avatar: physics/instruments.mjs carries a
// voxel-avatar-device entry, and that gate's "every entry's GATE exists" row names it missing. So the
// device half cannot quietly evaporate and leave the register claiming coverage nobody runs -- which is
// the failure mode a split invites and the reason the entry was written in the same round as the file.
//
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);

console.log("== voxelAvatarDevice-selfcheck (v4551) ==");

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. ON BOTH BACKENDS: from the avatar's eye");
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
console.log("the CPU half is tools/ship/voxelAvatar-selfcheck.mjs, which runs in the ship sweep; this file is "
  + "over the budget on purpose and is covered by the ship ritual's sweep rotation. unchecked here: pointer "
  + "lock itself, which is a user gesture the harness cannot give.");
process.exit(fails ? 1 : 0);
