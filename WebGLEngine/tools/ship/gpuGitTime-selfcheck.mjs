#!/usr/bin/env node
// WebGLEngine/tools/ship/gpuGitTime-selfcheck.mjs -- v4318
//
// GRADES GIT TIME ON THE GPU: every orrery body record carries its market's OPENING DAY (the day git says the
// repository was vendored) in extra.z, and the cull is handed the sim day in its uniforms (Cull.clock). A body
// not yet vendored on day t is dropped IN THE CULL -- not drawn, not picked, not counted -- on WebGPU by the
// compute pass and on WebGL2 by the twin, so the sky on any day is the sky git had that day. The claim is
// counted: on day t the scene draws exactly 1 + (markets open on day t) records, on both backends, and the
// twin's verdict is the compute pass's record for record.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { buildOrrery } from "../../world/orrery.mjs";
import { makeGitEconomy } from "../../world/gitEconomy.mjs";
import { orbitRecordsCpu } from "../../render/gpuOrbits.mjs";
import * as G from "../../render/gpuDriven.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const raw = JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8"));
const TODAY = "2026-09-01";
const system = buildOrrery(raw.bodies, { today: TODAY });
const economy = makeGitEconomy(system, { seed: 7, history: true });
/** The extras the page builds: record 0 is the centre (opens day 0), record m.id is market m. */
function bodyExtras() { const e = G.defaultExtras(system.bodies.length + 1); for (const m of economy.markets) e[m.id * G.EXTRA_FLOATS + 2] = m.opens || 0; return e; }
const opens = economy.markets.map((m) => m.opens || 0), lastDay = Math.max(...opens);
const openOn = (t) => 1 + opens.filter((d) => d <= t).length;
const days = [0, Math.floor(lastDay / 2), lastDay, lastDay + 30];
const camera = (records) => { let ext = 1; for (let i = 0; i < records.length; i += G.RECORD_FLOATS) ext = Math.max(ext, Math.hypot(records[i], records[i + 1]) + records[i + 3]);
    const dist = ext * 2.4, eye = [0, Math.sin(0.9) * dist, Math.cos(0.9) * dist]; return { eye, viewProj: G.multiply(G.perspective(0.9, 1, 0.1, dist * 4), G.lookAt(eye, [0, 0, 0], [0, 0, -1])) }; };

console.log("\n1. THE TWIN ON THE CPU: on day t the cull keeps the centre and the markets open on day t, nothing else");
{
    const ex = bodyExtras();
    ok(`the orrery under history: ${economy.markets.length} markets, opening days from 0 to ${lastDay} (${new Set(opens).size} distinct days), record 0 the centre on day 0`, opens.some((d) => d > 0) && ex[2] === 0 && opens.every((d, i) => ex[(i + 1) * G.EXTRA_FLOATS + 2] === d));
    const rec = orbitRecordsCpu(system, 0), cam = camera(rec);
    const u = (t) => G.packCullUniforms({ planes: G.frustumPlanes(cam.viewProj), eye: cam.eye, thresholds: [0], count: rec.length / G.RECORD_FLOATS, lodCount: 2, cap: rec.length / G.RECORD_FLOATS, clock: t });
    const all = G.cullLodCpu(rec, G.packCullUniforms({ planes: G.frustumPlanes(cam.viewProj), eye: cam.eye, thresholds: [0], count: rec.length / G.RECORD_FLOATS, lodCount: 2, cap: rec.length / G.RECORD_FLOATS }), null, ex);
    const total = (r) => Array.from(r.counts).reduce((a, b) => a + b, 0);
    ok(`with no clock every body the frustum holds is kept (${total(all)} of ${rec.length / G.RECORD_FLOATS}): the v4317 sky`, total(all) === rec.length / G.RECORD_FLOATS);
    let right = true; const seen = [];
    for (const t of days) { const r = G.cullLodCpu(rec, u(t), null, ex); seen.push(`day ${t}: ${total(r)} (open ${openOn(t)})`); if (total(r) !== openOn(t)) right = false;
        for (let k = 0; k < r.regions; k++) for (let s = 0; s < r.counts[k]; s++) { const o = (k * (rec.length / G.RECORD_FLOATS) + s) * G.OUT_RECORD_FLOATS; if (r.compact[o + 10] > t) right = false; } }
    ok("*** on days 0, mid, last and after: the twin keeps exactly 1 + the markets open that day, and every kept record's opening day is <= t ***", right, seen.join("; "));
    ok("  the packed uniforms carry the day and the enable flag at floats 36 and 37 (Cull.clock), forty floats in all", u(5)[36] === 5 && u(5)[37] === 1 && u(0)[37] === 1 && G.CULL_UNIFORM_FLOATS === 40 && G.packCullUniforms({ planes: G.frustumPlanes(cam.viewProj), eye: cam.eye, thresholds: [0], count: 1, lodCount: 1, cap: 1 })[37] === 0);
    ok("  the WGSL cull reads the clock (validates with the clock line present)", /cull\.clock\.y > 0\.5 && extras\[i\]\.z > cull\.clock\.x/.test(G.cullLodWgsl({})) && /clock: vec4<f32>/.test(G.cullLodWgsl({ occlusion: true })));
    report(`markets by opening day: ${economy.markets.slice().sort((a, b) => (a.opens || 0) - (b.opens || 0)).map((m) => `${m.name}@${m.opens || 0}`).join(" ")}`);
}

console.log("\n2. ON BOTH BACKENDS: the counts the device reports on each day are the open bodies, a closed body is not picked, and both backends agree");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const late = economy.markets.reduce((b, m) => ((m.opens || 0) > (b.opens || 0) ? m : b), economy.markets[0]);
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 256, bodies: raw.bodies, today: TODAY, days, lateId: late.id }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const O = await import("/render/gpuOrbits.mjs"); const { buildOrrery } = await import("/world/orrery.mjs"); const { makeGitEconomy } = await import("/world/gitEconomy.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const system = buildOrrery(a.bodies, { today: a.today }); const economy = makeGitEconomy(system, { seed: 7, history: true });
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const source = O.makeOrbitSource(dev, system);
            const ex = G.defaultExtras(source.count); for (const m of economy.markets) ex[m.id * G.EXTRA_FLOATS + 2] = m.opens || 0;
            let day = 0;
            const lods = [{ name: "far", mesh: G.quadMesh(1, [0.55, 0.75, 0.62, 1]) }, { name: "near", mesh: G.quadMesh(6, [0.62, 0.94, 0.71, 1]) }];
            const sc = G.makeGpuDrivenScene(dev, { lods, thresholds: [0], records: source, headings: ex, clock: () => day });
            const rec = O.orbitRecordsCpu(system, 0); let ext = 1; for (let i = 0; i < rec.length; i += G.RECORD_FLOATS) ext = Math.max(ext, Math.hypot(rec[i], rec[i + 1]) + rec[i + 3]);
            const dist = ext * 2.4, eye = [0, Math.sin(0.9) * dist, Math.cos(0.9) * dist], viewProj = G.multiply(G.perspective(0.9, 1, 0.1, dist * 4), G.lookAt(eye, [0, 0, 0], [0, 0, -1]));
            const perDay = [];
            for (const t of a.days) { day = t; source.advance(0); sc.frame({ viewProj, eye, clear: [0, 0, 0, 1] }); const c = await sc.readCounts();
                const p = O.orbitRecordsCpu(system, 0), i = a.lateId * G.RECORD_FLOATS, q = G.project(viewProj, [p[i], p[i + 1], p[i + 2]]);
                const hit = await sc.pick((q[0] * 0.5 + 0.5) * a.N, (1 - (q[1] * 0.5 + 0.5)) * a.N);
                perDay.push({ day: t, total: c.reduce((x, y) => x + y, 0), lateHit: hit ? hit.id : null }); }
            out[backend] = { backend: dev.backend, path: sc.path, perDay };
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2, r.ok ? "" : (r.reason || (r.pageErrors || []).join("; ") || r.error));
    if (r.ok && r.result.webgpu && r.result.webgl2) {
        for (const b of ["webgpu", "webgl2"]) {
            const R = r.result[b];
            ok(`*** ${b} (${R.path}): on each day the device's counts are 1 + the markets open that day ***`, R.backend === b && R.perDay.every((d) => d.total === openOn(d.day)), R.perDay.map((d) => `day ${d.day}: ${d.total}/${openOn(d.day)}`).join(", "));
            ok(`  ${b}: the last body to arrive (${late.name}, day ${late.opens}) is NOT under the pointer before its day and IS on it`, R.perDay.filter((d) => d.day < (late.opens || 0)).every((d) => d.lateHit == null) && R.perDay.filter((d) => d.day >= (late.opens || 0)).every((d) => d.lateHit === late.id), R.perDay.map((d) => `day ${d.day}: ${d.lateHit == null ? "nothing" : "record " + d.lateHit}`).join(", "));
        }
        ok("both backends report the same counts on every day (the compute pass and the twin agree)", JSON.stringify(r.result.webgpu.perDay) === JSON.stringify(r.result.webgl2.perDay));
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4318.
//   A  the WGSL comparison flipped (a body dropped when its day is BEFORE t) -> exit=1, 4 red: WebGPU counts 15/4/3/0 against
//      10/11/15/15 across the four days, draco is under the pointer before its day and gone after, and the twin (untouched)
//      disagrees with the compute pass on every day.
//   B  the twin's clock line removed -> exit=1, 4 red: the CPU keeps 15 on every day, WebGL2 draws every body from day 0, and
//      the two backends part -- WebGPU still right.
//   C  the WGSL reading extra.x (the heading) for the day -> exit=1, 4 red: WebGPU keeps 1/3/5/15 (the golden-angle headings
//      compared to a day), the twin keeps 10/11/15/15, and the backends disagree.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the TRADERS' scene (a hauler joins on its market's day already, by the sim, so its record never exists before; the " +
    "clock is only wired to the bodies); and orbits before a body's day -- the orbit pass still computes a closed body's position, the cull " +
    "just refuses it, so the work saved is the draw, not the orbit.");
process.exit(fails ? 1 : 0);
