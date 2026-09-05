#!/usr/bin/env node
// WebGLEngine/tools/ship/esShipLabelsDevice-selfcheck.mjs -- v4463
//
// GRADES ev/esShipLabels.js ON THE DEVICE PATH -- THE FIRST CONSUMER OF render/slugDevice.mjs -- AND ITS FALLBACK,
// WHICH THIS BOX EXERCISES FOR REAL.
//
// The ship labels drew on a raw WebGL2 overlay from v3831; since v4463 they draw through gfx/device.js, WebGPU
// where the page has it. The design that makes that safe before the rig has answered whether a presented WebGPU
// frame is right (task 19, device-present.html) is the FALLBACK: a lost WebGPU device rebuilds the overlay on a
// fresh canvas with the raw batch. This build box loses the device on the first presented pass, so the fallback
// is not a code path this gate reads -- it is one it WATCHES HAPPEN, and the labels it draws afterwards are read.
//
// THREE SCENES, ONE CAMERA, TWO SHIPS:
//   1. The device path pinned to WebGL2: the overlay's picture is read through a 2D drawImage (what the compositor
//      sees), and it holds labels.
//   2. The v3831 raw path, same scene: its picture and the device path's agree everywhere but the quad edges the
//      raw canvas's MSAA touches -- held to a bound and counted, since the raw context asks for antialias and the
//      device's does not, on purpose (parity across backends is the device's promise).
//   3. The default (prefer WebGPU): on this box the device is lost, the handle reports the fall back with the
//      browser's message, and the labels drawn after it are there. On a box that presents, the path stays
//      device:webgpu and its picture is held to scene 1's. Either state is named; a third is red.
//
// SABOTAGE LOG (v4463) -- each applied to ev/esShipLabels.js, gate run, exit read, file restored byte for byte:
//   A  the lost-device handler removed (no fallback)         -> exit=1, 1 red: the default path stays device:webgpu
//      with nothing drawn -- the blank overlay the fallback exists to prevent, reproduced on demand.
//   B  the device path draws no label (frame clears only)    -> exit=1, 2 red: scene 1 has no lit pixel and the
//      raw comparison cannot hold.
//
// *** THE FIRST DRAFT TOOK 66 SECONDS *** because it shipped three 1280x720 pictures through the harness as JSON;
// the comparison moved into the page and the gate takes one second.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const codeOf = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

console.log("\n1. THE WIRING, READ FROM THE SOURCE");
{
    const src = codeOf(read("ev/esShipLabels.js"));
    ok("the labels import render/slugDevice.mjs and gfx/device.js, and still the raw batch", /render\/slugDevice\.mjs/.test(src) && /gfx\/device\.js/.test(src) && /SlugTextBatch/.test(src));
    ok("  the device is requested with prefer: webgpu unless a backend is pinned", /requestDevice\(canvas, opts\.backend \? \{ backend: opts\.backend \} : \{ prefer: "webgpu" \}\)/.test(src));
    ok("*** a lost device rebuilds the overlay on the raw batch, on a FRESH canvas ***", /device\.gpu\.lost\.then/.test(src) && /useRaw\("WebGPU device lost: /.test(src) && /canvas\.remove\(\); canvas = overlayCanvas\(container\);/.test(src));
    ok("  and the handle reports path and reason", /get path\(\) \{ return impl\.kind; \}/.test(src) && /get reason\(\)/.test(src));
    ok("  one batch per label SLOT on the device path, so no buffer is destroyed under a frame's own draw", /batches\[i\] = new SlugDeviceBatch\(fontDevice\)/.test(src));
    ok("  the page still calls makeShipLabels the same way", /makeShipLabels\(\{ container: document\.body, enabled: labelsOn \}\)/.test(read("es-box3d-fly3d.html")));
}

console.log("\n2. ON THE DEVICE: LABELS, THE RAW TWIN, AND THE FALLBACK WATCHED");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, args: {}, script: `async (a) => {
            const { makeShipLabels } = await import("/ev/esShipLabels.js");
            const f = 1 / Math.tan((60 * Math.PI / 180) / 2), asp = innerWidth / innerHeight, n = 0.1, fa = 1000;
            const camera = { projectionMatrix: { elements: [f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, (2 * fa * n) / (n - fa), 0] },
                             matrixWorldInverse: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -80, 1] } };
            const ships = [{ name: "Corvette", team: "A", x: -20, alt: 5, y: 0, shield: 40, maxShield: 50, armor: 10, maxArmor: 20 },
                           { name: "Freighter", team: "B", x: 25, alt: -8, y: 10, shield: 5, maxShield: 50, armor: 20, maxArmor: 20 }];
            // Pictures stay in the page: 1280x720x4 bytes three times over would be eleven million JSON numbers through
            // the harness (the first draft did that and took 66 s). Only counts and a diff cross.
            const snap = (canvas) => { const c = document.createElement("canvas"); c.width = canvas.width; c.height = canvas.height; const ctx = c.getContext("2d"); ctx.drawImage(canvas, 0, 0);
                const d = ctx.getImageData(0, 0, c.width, c.height).data; let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) lit++; return { w: c.width, h: c.height, lit, data: d }; };
            const diff = (A, B) => { if (A.data.length !== B.data.length) return { differing: -1, worst: 255 }; let differing = 0, worst = 0;
                for (let i = 0; i < A.data.length; i += 4) { let d = 0; for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(A.data[i + c] - B.data[i + c])); if (d) differing++; if (d > worst) worst = d; } return { differing, worst }; };
            const counts = (s) => ({ w: s.w, h: s.h, lit: s.lit });
            const out = {};
            // 1. device path, WebGL2
            const L1 = await makeShipLabels({ container: document.body, backend: "webgl2" });
            L1.update(ships, camera, 1);
            const devSnap = snap(L1.canvas);
            out.dev = { path: L1.path, reason: L1.reason, snap: counts(devSnap) };
            L1.destroy();
            // 2. the raw path
            const L2 = await makeShipLabels({ container: document.body, path: "raw" });
            L2.update(ships, camera, 1);
            const rawSnap = snap(L2.canvas);
            out.raw = { path: L2.path, reason: L2.reason, snap: counts(rawSnap) };
            out.devVsRaw = diff(devSnap, rawSnap);
            L2.destroy();
            // 3. the default: prefer WebGPU, watch what happens
            const L3 = await makeShipLabels({ container: document.body });
            const fell = new Promise((res) => L3.onFallback((why) => res(why)));
            const pathBefore = L3.path;
            L3.update(ships, camera, 1);
            const why = await Promise.race([fell, new Promise((res) => setTimeout(() => res(null), 4000))]);
            L3.update(ships, camera, 1);
            const defSnap = snap(L3.canvas);
            out.def = { pathBefore, pathAfter: L3.path, why, reason: L3.reason, snap: counts(defSnap), vsDev: diff(defSnap, devSnap) };
            L3.destroy();
            return out;
        }`, timeoutMs: 90000 });
        ok("*** the three scenes ran ***", r.ok && r.result && r.result.dev && r.result.raw && r.result.def, r.ok ? "" : r.reason);
        if (r.ok) {
            const { dev, raw, def } = r.result;
            ok("*** device path on WebGL2: the handle says device:webgl2 and the overlay holds labels ***", dev.path === "device:webgl2" && dev.snap.lit > 200, `${dev.path}, ${dev.snap.lit} lit pixels of ${dev.snap.w}x${dev.snap.h}`);
            ok("  the raw path draws the same scene", raw.path === "raw" && raw.snap.lit > 200, `${raw.snap.lit} lit`);
            const { differing, worst } = r.result.devVsRaw;
            const litRatio = raw.snap.lit ? dev.snap.lit / raw.snap.lit : 0;
            ok("*** the device picture and the raw picture agree on all but the MSAA-touched edge pixels ***", differing >= 0 && differing < dev.snap.w * dev.snap.h * 0.005 && litRatio > 0.95 && litRatio < 1.05,
                `${differing} of ${dev.snap.w * dev.snap.h} pixels differ (worst ${worst}); lit ${dev.snap.lit} vs ${raw.snap.lit}`);
            report(`default path: ${def.pathBefore} before the first frame, ${def.pathAfter} after; ${def.why ? "fell back: " + String(def.why).slice(0, 110) : "no fallback fired"}`);
            if (def.pathBefore === "device:webgpu" && def.pathAfter === "raw") {
                ok("*** WebGPU lost the device on the presented frame and the labels FELL BACK to the raw batch, by name ***", /device lost/.test(String(def.why)) && /raw WebGL2 batch/.test(String(def.why)));
                ok("  and after the fall back the labels are there", def.snap.lit > 200, `${def.snap.lit} lit`);
                report("rig-pending -- RIG-ONLY: on Galaxina the default path must READ device:webgpu after a frame, with labels visible; the build box can only show the fall back.");
            } else if (def.pathBefore === "device:webgpu" && def.pathAfter === "device:webgpu") {
                ok("*** the path stayed device:webgpu, so the labels must be there -- a blank overlay here is the fallback NOT firing ***", def.snap.lit > 200, `${def.snap.lit} lit`);
                ok("  and the WebGPU picture agrees with the WebGL2 device picture", def.vsDev.differing >= 0 && def.vsDev.differing < def.snap.w * def.snap.h * 0.005, `${def.vsDev.differing} differ, worst ${def.vsDev.worst}`);
                report("this box presents on WebGPU -- the Level 11 note no longer describes it; say so in the changelog");
            } else {
                ok("the default path is a named state (device:webgpu that fell back, or device:webgpu that presented)", def.pathBefore === "device:webgl2" && def.snap.lit > 200, `${def.pathBefore} -> ${def.pathAfter}: only acceptable when the box has no WebGPU at all`);
            }
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the labels PRESENTED on WebGPU (rig-only, per the line above); the dogfight page itself with " +
    "Three's canvas underneath (the overlay is driven with a constructed camera here); and the cost of one batch " +
    "per label slot against the raw path's single batch, which task 12 measures.");
process.exit(fails ? 1 : 0);
