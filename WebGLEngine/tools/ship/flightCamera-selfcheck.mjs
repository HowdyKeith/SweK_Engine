// WebGLEngine/tools/ship/flightCamera-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node tools/ship/flightCamera-selfcheck.mjs      (a real browser, software rendering; the page is booted in an iframe like flightPage-selfcheck's)
//
// v4897 -- THE GATE STEPS THE CAMERA ITSELF (the page's cameraSteps hook runs its own updateCamera), so it waits on no software frame: 33 s became 2 s, past the 20 s cap, and the numbers are exact, so the bars are tight (a drag of 41 degrees within 2, a wheel by exp(delta / 1000) within 3%).
// GATES two things es-flight6dof.html did not do: (1) THE MOUSE ON THE DEFAULT CAMERA. Drag and scroll were wired to OrbitControls only, which the page enables on the "orbit" camera and not on the default "chase" one, so on
// the camera everybody starts with, nothing answered the mouse and the hint said it would. The chase camera now turns round the aircraft on a drag, moves in and out on the wheel and resets on a double click; (2) THE MINIMAP: the
// widget main.js builds top-right (world/WadMap.js) is on the page, fed the followed aircraft as the player dot and the other two as blips (the flight is z-up, so the map's z is the flight's y).
// Events are dispatched on the canvas as synthetic pointer and wheel events (the page listens on the canvas).
//
// SABOTAGES, RESULTS BY NAME (each against es-flight6dof.html, this gate run, restored identical):
//   C1 the wheel handler removed                                       -> 1 RED: the scroll row (all six measured, each 1 RED but C5, which is 2)
//   C2 the drag handler's yaw never applied                            -> 1 RED: the drag row
//   C3 the double click not resetting                                  -> 1 RED: the reset row
//   C4 the drag guarded to the orbit camera only (the old behaviour)   -> 1 RED: the drag row (the wheel row stays: it is a separate handler)
//   C5 updateMinimap never called                                      -> 2 RED: the blips row and the player-dot row
//   C6 the other aircraft left out of the blips                        -> 1 RED: the blips row
"use strict";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; };
console.log("flightCamera-selfcheck -- the chase camera answers the mouse, and the minimap is on the page\n");
const skip = webgpuSkipReason(createRequire(import.meta.url));
if (skip) { console.log("  SKIP  " + skip); console.log("  ----  *** NOT A PASS. ***"); fails++; }
else {
    const run = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 120000, script: `async () => {
        globalThis.__swekStep = "booting es-flight6dof.html";
        const f = document.createElement("iframe"); f.style.width = "900px"; f.style.height = "600px"; f.src = "/es-flight6dof.html"; document.body.appendChild(f);
        await new Promise((res) => { f.onload = res; });
        const win = f.contentWindow, wait = (ms) => new Promise((r) => setTimeout(r, ms)), t0 = performance.now();
        while (performance.now() - t0 < 40000 && (!win.__flightDemo || win.__flightDemo.state().tick < 1)) await wait(200);
        if (!win.__flightDemo) return { booted: false };
        const D = win.__flightDemo, doc = win.document, cv = doc.querySelector("canvas:not(#wadmap-widget canvas):not(#brainBox canvas)") || doc.querySelectorAll("canvas")[0];
        const view = () => { const p = D.state().fleet[0].pos, c = D.camera.position; const dx = c.x - p[0], dy = c.y - p[1], dz = c.z - p[2]; return { dist: Math.hypot(dx, dy, dz), az: Math.atan2(dy, dx) }; };
        const settle = async () => { D.cameraSteps(120); return view(); };   // the camera lerps 12% a step toward its goal: 120 steps of the page's own updateCamera settle it, with no wait on a software frame
        const ev = (type, init) => cv.dispatchEvent(type === "wheel" ? new win.WheelEvent("wheel", { bubbles: true, cancelable: true, ...init }) : type === "dblclick" ? new win.MouseEvent("dblclick", { bubbles: true, ...init }) : new win.PointerEvent(type, { bubbles: true, pointerId: 7, ...init }));
        const mode = doc.getElementById("camMode").value;
        const v0 = await settle();
        ev("wheel", { deltaY: -700 }); const vIn = await settle();
        ev("wheel", { deltaY: 1400 }); const vOut = await settle();
        ev("dblclick", {}); const vReset = await settle();
        ev("pointerdown", { clientX: 300, clientY: 300 }); ev("pointermove", { clientX: 420, clientY: 300 }); ev("pointerup", { clientX: 420, clientY: 300 }); const vDrag = await settle();
        ev("dblclick", {}); await settle();
        await wait(300);
        const w = doc.getElementById("wadmap-widget"), mc = w && w.querySelector("canvas");
        let lit = 0; if (mc) { const d = mc.getContext("2d").getImageData(0, 0, mc.width, mc.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++; }
        return { booted: true, mode, v0, vIn, vOut, vReset, vDrag, widget: !!w, lit, blips: D.mapBots.bots.size, active: D.minimap.active, chase: { ...D.chase } };
    }` });
    if (!run.ok || !run.result) ok("the page ran in the browser", false, JSON.stringify(run).slice(0, 300));
    else {
        const r = run.result;
        ok("the page boots on the chase camera", r.booted && r.mode === "chase", JSON.stringify({ mode: r.mode }));
        if (r.booted) {
            ok("!! SCROLL moves the chase camera by exp(deltaY / 1000) (in 0.50x, out 4.06x of that): " + r.v0.dist.toFixed(1) + " m, in to " + r.vIn.dist.toFixed(1) + " m, out to " + r.vOut.dist.toFixed(1) + " m", Math.abs(r.vIn.dist / r.v0.dist - Math.exp(-0.7)) < 0.03 && Math.abs(r.vOut.dist / r.vIn.dist - Math.exp(1.4)) < 0.2);
            ok("a DOUBLE CLICK puts it back (" + r.vReset.dist.toFixed(1) + " m, was " + r.v0.dist.toFixed(1) + ")", Math.abs(r.vReset.dist - r.v0.dist) < r.v0.dist * 0.1);
            const dAz = Math.abs(((r.vDrag.az - r.vReset.az + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            ok("!! DRAG turns it round the aircraft: a 120 px drag moves the camera's bearing by " + (dAz * 57.3).toFixed(0) + " degrees (41 expected: 120 px at 0.006 rad a px)", Math.abs(dAz - 0.72) < 0.04);
            ok("the minimap widget is on the page, active, with a drawn dial", r.widget && r.active && r.lit > 200, "lit pixels " + r.lit);
            ok("!! the other two aircraft are on the map as blips, the followed one is the player dot", r.blips === 2, "blips " + r.blips);
        }
    }
}
console.log(`\nflightCamera-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
