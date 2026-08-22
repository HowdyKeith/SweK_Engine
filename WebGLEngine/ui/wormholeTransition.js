// ui/wormholeTransition.js -- plays the wormhole as the ES system-jump transition. When the flight view enters a new
// system (ev.html enterSystem, on a real jump), this drops a fullscreen overlay that flies the camera through the
// Ellis throat -- from the departing system's living nebula, through the throat, into the arriving one -- then fades
// out to reveal the new system loaded behind it. Uses the verified renderWormholeNebulaCPU (Canvas2D, downsampled),
// so it runs on every machine; the transition is brief so the CPU cost is a non-issue. Exposed as window.swekWormholeJump.
"use strict";

import { renderWormholeNebulaCPU } from "../fx/wormhole/wormholeNebula.js";
import { makeVortons, step2D } from "../fx/vorton/vortonNebula.js";

let busy = false;
export function playWormholeJump(opts = {}) {
    return new Promise((resolve) => {
        if (busy || typeof document === "undefined") { resolve(); return; }
        busy = true;
        const cv = document.createElement("canvas");
        cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:99998;opacity:0;transition:opacity .28s ease;pointer-events:none;background:#02030a;";
        document.body.appendChild(cv); const ctx = cv.getContext("2d");
        const DPR = Math.min(2, devicePixelRatio || 1); cv.width = Math.floor(innerWidth * DPR); cv.height = Math.floor(innerHeight * DPR);
        const V = makeVortons((Math.random() * 100000) | 0), P = { k: 1, a: 0.5, camL: 7, maxPsi: 1.35, sigma: 0.35, gain: 0.5, camFar: 5.3, vortons: V };
        const dur = opts.duration || 1.5, s = 4; let t = 0, last = performance.now();
        requestAnimationFrame(() => { cv.style.opacity = "1"; });
        function frame() {
            const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
            step2D(V, dt, P.sigma); P.camL = 7 - 14 * Math.min(1, t / dur);   // near +7 -> throat 0 -> far -7
            const w = Math.max(90, Math.floor(cv.width / s)), h = Math.max(60, Math.floor(cv.height / s));
            const buf = renderWormholeNebulaCPU(w, h, P), img = new ImageData(buf, w, h), tmp = new OffscreenCanvas(w, h);
            tmp.getContext("2d").putImageData(img, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(tmp, 0, 0, cv.width, cv.height);
            if (t < dur + 0.35) requestAnimationFrame(frame);
            else { cv.style.opacity = "0"; setTimeout(() => { cv.remove(); busy = false; resolve(); }, 300); }
        }
        requestAnimationFrame(frame);
    });
}
if (typeof window !== "undefined") window.swekWormholeJump = playWormholeJump;
