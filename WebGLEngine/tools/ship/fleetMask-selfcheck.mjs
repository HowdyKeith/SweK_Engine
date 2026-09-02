#!/usr/bin/env node
// WebGLEngine/tools/ship/fleetMask-selfcheck.mjs -- v4317 (Level 17)
//
// GRADES THE IDENTITY PICTURE AS A MASK: the fleets scene's pick picture turned into a strength field (1 where one
// race is, 0 elsewhere), and Level 11's badTv FIELD pipeline drawing the colour picture through it on both
// backends. The claim is to the byte: outside the mask the picture is unchanged, inside it the effect changed
// pixels; a mask of nothing changes nothing; a mask of everything changes as the plain effect would. The mask goes
// through the CPU this round (a readback, an upload) and the gate says so.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { maskFromPick, maskDiff } from "../../render/fleetMask.mjs";
import { RACES } from "../../render/fleets.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

console.log("\n1. THE MASK ON THE CPU: from hits to a field, counted");
{
    const hits = [null, { id: 1, lod: 0, fleet: 2 }, { id: 2, lod: 0, fleet: 5 }, { id: 3, lod: 1, fleet: 2 }];
    const m = maskFromPick({ width: 2, height: 2, hits }, 2);
    ok("a mask of one fleet: red 255 where that fleet is, 0 elsewhere, alpha 255 everywhere; the counts add up", Array.from(m.data).join() === [0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255].join() && m.inside === 2 && m.outside === 2);
    const m2 = maskFromPick({ width: 2, height: 2, hits }, [2, 5], { soft: 0.2 });
    ok("  several fleets at once, and a soft floor for the rest", m2.inside === 3 && m2.data[0] === 51 && m2.data[8] === 255);
    const src = { width: 2, height: 2, pixels: new Uint8Array([10, 10, 10, 255, 20, 20, 20, 255, 30, 30, 30, 255, 40, 40, 40, 255]) }, res = { width: 2, height: 2, pixels: new Uint8Array([10, 10, 10, 255, 99, 20, 20, 255, 30, 31, 30, 255, 40, 40, 40, 255]) };
    const d = maskDiff(src, res, m);
    ok("  maskDiff counts a change inside and a change outside separately, and reports the worst outside", d.inChanged === 1 && d.outChanged === 1 && d.worstOut === 1 && d.inside === 2);
}

console.log("\n2. ON BOTH BACKENDS: one race flickers, the rest of the picture is untouched to the byte");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const CHAOS = RACES.findIndex((r) => r.name === "Chaos"), UNION = RACES.findIndex((r) => r.name === "Union");
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 192, CHAOS, UNION, FLEETS: RACES.length }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const F = await import("/render/fleets.mjs"); const M = await import("/render/fleetMask.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const records = G.gridScene({ side: 10, z: -2, spacing: 1, radii: [0.4] }), count = records.length / 4, fleetOf = Uint32Array.from({ length: count }, (_, i) => i % a.FLEETS);
        const viewProj = G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 100), G.lookAt([0, 0, 8], [0, 0, 0]));
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const std = F.standardFleets(dev, { clock: () => 0.5 });
            const sc = G.makeGpuDrivenScene(dev, { fleets: std.fleets, fleetOf, thresholds: [0.03], records });
            const source = await sc.frame({ viewProj, eye: [0, 0, 8], read: true, clear: [0.05, 0.05, 0.08, 1] }).pixels;
            const pick = await sc.pickPicture();
            const one = M.maskFromPick(pick, a.CHAOS), none = M.maskFromPick(pick, 99), all = M.maskFromPick(pick, Array.from({ length: a.FLEETS }, (_, i) => i));
            all.data.fill(255);   // everything: the plain effect
            const res1 = await M.maskedBadTv(dev, { source, mask: one, read: true, offscreen: true, time: 0.5 });
            const res0 = await M.maskedBadTv(dev, { source, mask: none, read: true, offscreen: true, time: 0.5 });
            const resAll = await M.maskedBadTv(dev, { source, mask: all, read: true, offscreen: true, time: 0.5 });
            out[backend] = { backend: dev.backend, one: M.maskDiff(source, res1, one), none: M.maskDiff(source, res0, none), all: M.maskDiff(source, resAll, all), maskInside: one.inside, total: source.width * source.height };
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2, r.ok ? "" : (r.reason || (r.pageErrors || []).join("; ") || r.error));
    if (r.ok && r.result.webgpu && r.result.webgl2) {
        for (const b of ["webgpu", "webgl2"]) {
            const R = r.result[b];
            ok(`${b}: the Chaos race's mask covers some of the picture and not most of it`, R.maskInside > 200 && R.maskInside < R.total * 0.3, `${R.maskInside} of ${R.total} pixels`);
            ok(`*** ${b}: through the mask, badTv changed pixels INSIDE the race and left the rest UNCHANGED TO THE BYTE ***`, R.one.inChanged > R.one.inside * 0.2 && R.one.outChanged === 0 && R.one.worstOut === 0, `inside ${R.one.inChanged}/${R.one.inside} changed, outside ${R.one.outChanged}/${R.one.outside} (worst ${R.one.worstOut})`);
            ok(`  ${b}: a mask of nothing changes nothing`, R.none.inChanged === 0 && R.none.outChanged === 0, `worst ${R.none.worstOut}`);
            ok(`  ${b}: a mask of everything changes the picture as the plain effect would -- more pixels than the one race's mask did, well over a twentieth of the picture (badTv at these knobs leaves a dark background dark)`, R.all.inChanged > R.one.inChanged && R.all.inChanged > R.total * 0.05, `${R.all.inChanged} of ${R.total}`);
        }
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4317.
//   A  maskFromPick() writing 255 everywhere -> exit=1, 7 red: the CPU byte pattern, the soft floor and the diff count;
//      on both backends "a mask of nothing" changes everything and the everything-mask control is no longer more
//      than the one race's (they are the same mask).
//   B  the field texture bound to the wrong unit (the source as the mask, the mask as the source) -> exit=1, 4 red:
//      on both backends every outside pixel changes (36,429 of 36,429, worst 255) and a mask of nothing changes everything.
//   C  maskDiff() counting everything as inside -> exit=1, 3 red: the CPU diff line, and on both backends the
//      "outside unchanged" claim has no outside to be unchanged (0 of 0), which the gate refuses as a pass.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the mask ON THE DEVICE -- a render attachment would keep the pick picture, the mask and the pass on the GPU; " +
    "this round reads both pictures back and uploads them, and a page that does it every frame pays two readbacks, which the gate does " +
    "not time. Also: only badTv is masked here; crt and the SwiftUI ports take the same field.");
process.exit(fails ? 1 : 0);
