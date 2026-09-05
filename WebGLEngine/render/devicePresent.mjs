// WebGLEngine/render/devicePresent.mjs -- v4462
// ---------------------------------------------------------------------------------------------------------------
// THE PRESENTED FRAME, READ BACK THREE WAYS AND COMPARED, SO THAT CANVAS PRESENTATION ON WebGPU HAS A GATE.
//
// Every WebGPU frame the tree's gates check goes to an OWNED OFFSCREEN TEXTURE, because this build box loses the
// device on any render pass whose attachment is the canvas's current texture (gfx/device.js Level 11 note). The
// canvas path is the product and, until this round, had no check anywhere: deviceTexture, deviceBlend,
// deviceFormats and slugDevice all say "unchecked: presenting to a canvas" in their last line.
//
// presentCheck() draws one known pattern through gfx/device.js -- left half red, right half blue, opaque -- on a
// canvas the device PRESENTS to, and reads the result back three ways:
//   A  the device's own canvas-mode readback (frame({ read: true }) with the canvas as the attachment);
//   B  an OFFSCREEN frame with the same commands (frame({ offscreen: true, read: true })), the path every gate uses;
//   C  a 2D canvas's drawImage() of the presented canvas, then getImageData(): what the COMPOSITOR is handed.
// Each is compared with the expectation and with the others; the result names every count. A device that is lost
// on the presented pass is reported as that, by the message the browser gave, not as a crash.
//
// This module ships so the page and the gate run ONE routine: the gate runs it here on both backends and asserts
// what this box can show (WebGL2 presents; WebGPU either presents or loses the device, and which is printed), and
// the page runs it on the rig, where the WebGPU answer is the one that matters.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

import { requestDevice } from "../gfx/device.js";
import { renderPipelineDesc } from "./gpuDriven.mjs";

export const LEFT = [255, 0, 0, 255], RIGHT = [0, 0, 255, 255];

/** The pattern, as the bytes a W x H frame must hold: left half LEFT, right half RIGHT, top row to bottom row. */
export function expectedPattern(W, H) {
    const out = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out.set(x < W / 2 ? LEFT : RIGHT, (y * W + x) * 4);
    return out;
}

/** Compare two RGBA byte arrays: { differing, worst, n } -- pure, so a gate can hold it to fabricated inputs. */
export function comparePixels(a, b) {
    if (!a || !b || a.length !== b.length) return { differing: -1, worst: 255, n: a ? a.length / 4 : 0, reason: "length mismatch" };
    let differing = 0, worst = 0;
    for (let i = 0; i < a.length; i += 4) {
        let d = 0; for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(a[i + c] - b[i + c]));
        if (d) differing++; if (d > worst) worst = d;
    }
    return { differing, worst, n: a.length / 4 };
}

const quad = (x0, x1, z, c) => { const v = []; const tri = (x, y) => v.push(x, y, z, c[0] / 255, c[1] / 255, c[2] / 255, c[3] / 255);
    tri(x0, -1); tri(x1, -1); tri(x1, 1); tri(x0, -1); tri(x1, 1); tri(x0, 1); return new Float32Array(v); };

/**
 * Run the check on `canvas` with the given backend ("webgpu" | "webgl2"). Resolves to
 *   { backend, W, H, state: "presented" | "device-lost" | "no-backend", lost, A, B, C, AB, AC, pairs }
 * where A/B/C are each { differing, worst, n } against the expectation and AB/AC compare the readbacks.
 * Never throws for a GPU-side failure: the outcome is a result a page or a gate reports.
 */
export async function presentCheck(canvas, backend, opts = {}) {
    const W = canvas.width, H = canvas.height;
    const out = { backend, W, H, state: "no-backend", lost: null, A: null, B: null, C: null, AB: null, AC: null };
    let device = null;
    const lostP = new Promise((res) => { out._resolveLost = res; });
    try {
        device = await requestDevice(canvas, { backend });
        if (!device || device.backend !== backend) { out.state = "no-backend"; out.lost = "requestDevice gave " + (device ? device.backend : "nothing"); return out; }
        if (device.gpu && device.gpu.lost) device.gpu.lost.then((info) => { out.lost = "device lost: " + (info && info.message || "(no message)"); out._resolveLost(); });
        const pipe = device.pipeline(renderPipelineDesc());
        const left = device.buffer({ usage: "vertex", data: quad(-1, 0, 0.5, LEFT) }), right = device.buffer({ usage: "vertex", data: quad(0, 1, 0.5, RIGHT) });
        const rec = new Float32Array(12); rec[3] = 1; const inst = device.buffer({ usage: "vertex", data: rec });
        const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
        const draw = ({ pass }) => {
            pass.clear([0, 0, 0, 1]);
            pass.use(pipe); pass.uniform("viewProj", I); pass.vertices(left); pass.instances(inst); pass.draw(6, 1);
            pass.use(pipe); pass.uniform("viewProj", I); pass.vertices(right); pass.instances(inst); pass.draw(6, 1);
        };
        const want = expectedPattern(W, H);
        // A: the presented canvas, read by the device in the same task
        const frA = await Promise.race([device.frame(draw, { read: true }), lostP.then(() => null)]);
        if (!frA) { out.state = "device-lost"; return out; }
        out.A = comparePixels(frA.pixels, want);
        // C: what the compositor is handed -- a 2D copy of the presented canvas, taken right after the frame
        try {
            const c2 = document.createElement("canvas"); c2.width = W; c2.height = H;
            const ctx = c2.getContext("2d"); ctx.drawImage(canvas, 0, 0);
            out.C = comparePixels(new Uint8Array(ctx.getImageData(0, 0, W, H).data.buffer), want);
            out.AC = comparePixels(frA.pixels, new Uint8Array(ctx.getImageData(0, 0, W, H).data.buffer));
        } catch (e) { out.C = { differing: -1, worst: 255, n: 0, reason: "drawImage: " + e.message }; }
        // B: the offscreen path every gate uses, same commands
        const frB = await Promise.race([device.frame(draw, { offscreen: true, read: true }), lostP.then(() => null)]);
        if (!frB) { out.state = "device-lost"; return out; }
        out.B = comparePixels(frB.pixels, want);
        out.AB = comparePixels(frA.pixels, frB.pixels);
        out.state = "presented";
        if (opts.keepDevice) out.device = device; else { try { device.destroy(); } catch (e) {} }
        return out;
    } catch (e) {
        out.lost = out.lost || ("threw: " + String(e && e.message).slice(0, 160));
        out.state = /lost|Instance reference|destroyed/i.test(out.lost) ? "device-lost" : "threw";
        return out;
    } finally { delete out._resolveLost; }
}

/** One line a page or a gate can print. */
export function describe(r) {
    if (r.state !== "presented") return `${r.backend}: ${r.state}${r.lost ? " -- " + r.lost : ""}`;
    const f = (c) => c ? `${c.differing} of ${c.n} differ (worst ${c.worst})` : "n/a";
    return `${r.backend}: presented -- A canvas readback ${f(r.A)}; B offscreen ${f(r.B)}; C compositor copy ${f(r.C)}; A vs B ${f(r.AB)}; A vs C ${f(r.AC)}`;
}
