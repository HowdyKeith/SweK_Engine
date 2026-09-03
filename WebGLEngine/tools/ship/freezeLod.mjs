// Re-freeze render/lodRecord.mjs: the disc ladder priced on a device. Run it when discMesh, the render pipeline
// or the ladder's segment counts change -- the thresholds two shipped pages use are derived from what it writes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
import { runInEngineOrigin } from "./webgpuHarness.mjs";
const SEG = [32, 10, 5], DIST = [3, 4, 6, 9, 14, 22, 36, 60, 95, 150], WS = [128, 256, 512, 1024];
const r = await runInEngineOrigin({ engineRoot: ENG, args: { WS, DIST, SEG }, script: `async (a) => {
  const G = await import("/render/gpuDriven.mjs"); const { requestDevice } = await import("/gfx/device.js");
  const RAD = 0.5, ONE = [0.7, 0.8, 0.9, 1]; const out = {};
  for (const W of a.WS) {
    const cv = document.createElement("canvas"); cv.width = W; cv.height = W;
    const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
    const shoot = (mesh, dist) => { const sc = G.makeGpuDrivenScene(dev, { lods: [{ name: "only", mesh }], thresholds: [], records: Float32Array.from([0, 0, 0, RAD]) });
      const eye = [0, 0, dist];
      return sc.frame({ viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 300), G.lookAt(eye, [0, 0, 0])), eye, read: true, clear: [0, 0, 0, 1] }).pixels; };
    const rec = []; for (let k = 1; k < a.SEG.length; k++) rec.push({ rung: k, samples: [] });
    for (const d of a.DIST) { const base = (await shoot(G.discMesh(a.SEG[0], ONE), d)).pixels;
      for (let k = 1; k < a.SEG.length; k++) { const p = (await shoot(G.discMesh(a.SEG[k], ONE), d)).pixels;
        let ch = 0, cov = 0;
        for (let i = 0; i * 4 < base.length; i++) { let df = 0; for (let c = 0; c < 3; c++) df = Math.max(df, Math.abs(base[i*4+c] - p[i*4+c]));
          if (df) ch++; if (base[i*4] + base[i*4+1] + base[i*4+2] > 24) cov++; }
        rec[k-1].samples.push({ metric: RAD / d, changed: ch, covered: cov }); } }
    out[W] = rec;
  }
  return out;
}` });
if (!r.ok || !r.result) { console.log("HARNESS:", r.reason || (r.pageErrors||[]).join("; ")); process.exit(1); }
const body = `"use strict";
/**
 * THE FROZEN PRICING OF THE DISC LADDER (v4377), so a threshold can be derived without a GPU.
 *
 * Measured by tools/ship/shippedLadder-selfcheck.mjs's own method: one instance of render/gpuDriven.mjs discMesh at
 * radius 0.5, rendered through gfx/device.js on WebGPU at eight distances and three frame widths, every rung under
 * ONE COLOUR so only the geometry can differ. \`changed\` is the pixels that rung moves against rung 0 (a ${SEG[0]}-gon);
 * \`covered\` is what rung 0 itself covers; \`metric\` is the angular size the cull reads, radius over distance.
 *
 * WHAT IT IS AND IS NOT. It is a measurement of THIS ladder, on THIS rasteriser (SwiftShader in the sandbox), at
 * these three widths. It is not a claim about a rig's GPU, and render/lodBudget.mjs derives from it rather than
 * asserting from it, so a re-freeze changes the thresholds and nothing else. Rewritten by tools/ship/freezeLod.mjs.
 */
export const LOD_RECORD = Object.freeze(${JSON.stringify({ at: "v4377", segments: SEG, distances: DIST, widths: WS, radius: 0.5, byWidth: r.result }, null, 1)});
`;
fs.writeFileSync(path.join(ENG, "render/lodRecord.mjs"), body);
console.log("frozen:", body.length, "bytes;", WS.length, "widths x", DIST.length, "distances x", SEG.length - 1, "rungs");
