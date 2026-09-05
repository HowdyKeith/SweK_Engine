#!/usr/bin/env node
// WebGLEngine/tools/ship/gpuOrbits-selfcheck.mjs -- v4299 (Level 12)
//
// GRADES render/gpuOrbits.mjs: THE ORRERY'S BODIES PLACED BY A COMPUTE PASS, FED STRAIGHT INTO THE CULL.
//
// The twin is world/orreryView.mjs positionAt() -- the function the 2D page draws with -- so the claim is not
// "the GPU orbits look right" but "the GPU puts every body where the page puts it", at f32. sin and cos on
// SwiftShader are the low-accuracy path (crossBackend-selfcheck measured tan at 4.6e-5), so the tolerance is
// stated against the body's own axis and the worst case is printed, not hidden inside a pass.
// v4474 -- THE THIRD ELEMENT. elementsOf carries two vec4 per body (the tilt's cos/sin and the node's, precomputed in
// f64), the kernel rotates its circle, the twin is positionAt3, and the bound is measured in THREE axes: worst 6.13e-5 of
// the axis on krbn. Three of fifteen bodies tilt (their opacity, world/orrery.mjs); the rest read z = 0 exactly.
// SABOTAGE (v4474): A  the kernel's z zeroed          -> exit=1, 3 red: the 3-axis bound at 4.63e-1 on fonts, "NOT 0 for every
//                                                       tilted one" (all three z=0.000), and the two backends' frames part by 113 px
//                   B  positionAt3's y-term sign flipped -> exit=1, 3 red: the in-plane identity with positionAt, the bound at 1.55
//                                                       on three-webgpu, and the frames part by 847 px. Both restored byte for byte.
// v4476 -- FLEETS AND FLYBYS as records of the same kernel (section 2b): 388 records, the twins satelliteAt about the parent's
// positionAt3 and flybyAt (Barker, the stable cube root). SABOTAGE (v4476): A  the kernel's satellite drops its parent's offset
// -> exit=1, 3 red: the satellite bound, "minus its parent IS satelliteAt" at 3.60, and the page's count. B  the flyby's
// D = u - 1/u reduced to D = u -> exit=1, 3 red: the flyby bound at 2.26, the perihelion control (28.95 against q 14.47), and
// passingWithin's count (2 against 39). A first B, the cube root's sign guard dropped, was BLIND: the argument is positive for
// every W, so the guard was dead code and is gone. C  the page's source built without flybys -> exit=1, 2 red: the page's
// wiring line and its count ("of 199" against 388). All restored byte for byte.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { validateWgsl, parseBindings } from "../../render/wgslSpec.mjs";
import * as G from "../../render/gpuDriven.mjs";
import * as O from "../../render/gpuOrbits.mjs";
import { buildOrrery } from "../../world/orrery.mjs";
import { fleetsFor, satelliteAt } from "../../world/orreryFleet.mjs";
import { reachedBodies, fromReachedRegister, fromKhronos, flybyAt, passingWithin } from "../../world/orreryReached.mjs";
import { REACHED_SOURCES, severityOf } from "../../world/reachedLicences.mjs";
import { models, mayVendor } from "../../gpu/khronosSamples.mjs";
import { phaseFor } from "../../world/orreryView.mjs";
import { positionAt, positionAt3 } from "../../world/orreryView.mjs";
import { nullBackend } from "../../gfx/device.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const TODAY = "2026-09-01", T = 37.25;
const raw = JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8"));
const system = buildOrrery(raw.bodies, { today: TODAY });
const { elements, count, names } = O.elementsOf(system);

console.log("\n1. THE ELEMENTS ARE THE ORRERY'S OWN NUMBERS");
{
    ok("the orbit shader validates and declares info, elements, records", validateWgsl(O.orbitWgsl()).length === 0 && parseBindings(O.orbitWgsl()).map((b) => b.name).join() === "info,elements,records");
    ok(`the baked orrery gives ${system.bodies.length} bodies, plus the centre`, count === system.bodies.length + 1 && names[0] === "SweK");
    const E = O.ELEMENT_FLOATS;
    ok("  every body's axis, period and radius come from buildOrrery unchanged", system.bodies.every((b, i) => elements[(i + 1) * E] === Math.fround(b.a) && elements[(i + 1) * E + 1] === Math.fround(b.period) && elements[(i + 1) * E + 3] === Math.fround(b.radius)));
    // v4474 -- and the third element: cos/sin of the inclination and of the node, precomputed in f64 so the kernel's own trig stays the one it always did
    ok("  and so does the TILT: cos i, sin i, cos node, sin node in the second vec4, from buildOrrery's inclination and phaseFor", E === 12 && system.bodies.every((b, i) => { const ph = phaseFor(b.name), inc = b.inclination || 0;
        return elements[(i + 1) * E + 4] === Math.fround(Math.cos(inc)) && elements[(i + 1) * E + 5] === Math.fround(Math.sin(inc)) && elements[(i + 1) * E + 6] === Math.fround(Math.cos(ph)) && elements[(i + 1) * E + 7] === Math.fround(Math.sin(ph)); }));
    const tilted = system.bodies.filter((b) => b.inclination > 0);
    ok(`  ${tilted.length} of ${system.bodies.length} bodies are tilted (their opacity, world/orrery.mjs) and the rest lie in the plane`, tilted.length >= 1 && tilted.length < system.bodies.length, tilted.map((b) => `${b.name} ${(b.inclination * 180 / Math.PI).toFixed(1)}deg`).join(", "));
    ok("  the centre sits still at the origin", elements[0] === 0 && elements[1] === 0);
    const cpu = O.orbitRecordsCpu(system, T);
    ok("the twin IS positionAt3", system.bodies.every((b, i) => { const p = positionAt3(b, T); return cpu[(i + 1) * 4] === Math.fround(p.x) && cpu[(i + 1) * 4 + 1] === Math.fround(p.y) && cpu[(i + 1) * 4 + 2] === Math.fround(p.z); }));
    ok("  and for a body in the plane positionAt3 IS positionAt, so the 2D page's picture is the ecliptic's", system.bodies.filter((b) => !b.inclination).every((b) => { const p = positionAt(b, T), q = positionAt3(b, T); return Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9 && q.z === 0; }));
    ok("  at day 0 EVERY body, tilted or not, is where positionAt puts it: the node is the phase", system.bodies.every((b) => { const p = positionAt(b, 0), q = positionAt3(b, 0); return Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9 && Math.abs(q.z) < 1e-12; }));
    const nb = nullBackend(); const src = O.makeOrbitSource(nb, system); src.advance(T);
    const sc = G.makeGpuDrivenScene(nb, { lods: [{ name: "b", mesh: G.quadMesh(2) }, { name: "c", mesh: G.quadMesh(1) }], thresholds: [0.02], records: src });
    const ext = Math.max(...system.bodies.map((b) => b.a)), eye = [0, 0, ext * 2.2];
    sc.frame({ viewProj: G.multiply(G.perspective(1, 1, 0.1, 500), G.lookAt(eye, [0, 0, 0])), eye });
    ok("a source with only a cpu() twin drives the null backend's scene", src.count === count && nb.ops.some((o) => o[0] === "drawIndexed"));
}

console.log("\n2. THE GPU PUTS EVERY BODY WHERE positionAt PUTS IT");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { T, bodies: raw.bodies, TODAY }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const O = await import("/render/gpuOrbits.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const { buildOrrery } = await import("/world/orrery.mjs");
        const system = buildOrrery(a.bodies, { today: a.TODAY });
        const ext = Math.max(...system.bodies.map((b) => b.a)), eye = [0, 0, ext * 2.2];
        const proj = G.perspective(1, 1, 0.1, 500), view = G.lookAt(eye, [0, 0, 0]), viewProj = G.multiply(proj, view);
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = 128; cv.height = 128;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const src = O.makeOrbitSource(dev, system);
            const sc = G.makeGpuDrivenScene(dev, { lods: [{ name: "big", mesh: G.quadMesh(2, [1, 1, 0, 1]) }, { name: "small", mesh: G.quadMesh(1, [0, 0.5, 1, 1]) }], thresholds: [0.02], records: src });
            const o = { backend: dev.backend, path: src.advance(a.T).path };
            const f = sc.frame({ viewProj, eye, read: true }); const p = await f.pixels;
            o.records = Array.from(await src.readRecords()); o.counts = await sc.readCounts(); o.pixels = Array.from(p.pixels);
            src.advance(a.T + 100); sc.frame({ viewProj, eye }); o.records2 = Array.from(await src.readRecords());
            sc.destroy(); src.destroy(); dev.destroy(); out[backend] = o;
        }
        return out;
    }` });
    ok("*** the orbit pass runs and feeds the cull on WebGPU; WebGL2 runs the twin ***", r.ok && r.result.webgpu.path === "compute" && r.result.webgl2.path === "cpu", r.ok ? "" : r.reason);
    if (r.ok) {
        const W = r.result.webgpu, cpu = O.orbitRecordsCpu(system, T);
        let worstRel = 0, worstName = "";
        for (let i = 0; i < count; i++) { const a = Math.max(0.05, elements[i * O.ELEMENT_FLOATS]); const d = Math.hypot(W.records[i * 4] - cpu[i * 4], W.records[i * 4 + 1] - cpu[i * 4 + 1], W.records[i * 4 + 2] - cpu[i * 4 + 2]) / a; if (d > worstRel) { worstRel = d; worstName = names[i]; } }
        // Measured at Level 12: 1.9e-4 of the axis with the raw angle, and sin/cos are SwiftShader's low-accuracy
        // path (tan measured 4.6e-5 off at v4290). The bound is stated against that measurement, not chosen
        // to pass, and the worst body is printed so a regression has a name.
        ok("*** every GPU position is within 2e-4 of its axis from positionAt3, in THREE axes ***", worstRel < 2e-4, `worst ${worstRel.toExponential(2)} of the axis, on ${worstName}`);
        ok("  radii travel through untouched", system.bodies.every((b, i) => W.records[(i + 1) * 4 + 3] === Math.fround(b.radius)));
        // v4474 -- z was 0 for every body until the third element; now it is the tilt's, and only the tilted have one
        ok("  z is 0 for every body in the plane, and NOT 0 for every tilted one at this time", system.bodies.every((b, i) => (b.inclination > 0) === (W.records[(i + 1) * 4 + 2] !== 0)),
           system.bodies.filter((b) => b.inclination > 0).map((b, k) => { const i = system.bodies.indexOf(b); return `${b.name} z=${W.records[(i + 1) * 4 + 2].toFixed(3)}`; }).join(", "));
        ok("  and no body's |z| exceeds a sin i, the tilt's own ceiling", system.bodies.every((b, i) => Math.abs(W.records[(i + 1) * 4 + 2]) <= b.a * Math.sin(b.inclination || 0) + 1e-4));
        ok("CONTROL: 100 days later every orbiting body has moved", system.bodies.every((b, i) => Math.hypot(W.records2[(i + 1) * 4] - W.records[(i + 1) * 4], W.records2[(i + 1) * 4 + 1] - W.records[(i + 1) * 4 + 1]) > 1e-3));
        const ext = Math.max(...system.bodies.map((b) => b.a)), eye = [0, 0, ext * 2.2];
        const u = G.packCullUniforms({ planes: G.frustumPlanes(G.multiply(G.perspective(1, 1, 0.1, 500), G.lookAt(eye, [0, 0, 0]))), eye, thresholds: [0.02], count, lodCount: 2, cap: count });
        const twin = G.cullLodCpu(cpu, u);
        ok("*** the cull counts on the GPU-written records equal the twin's on positionAt's ***", W.counts.join() === Array.from(twin.counts).join(), `gpu ${W.counts.join("/")} twin ${Array.from(twin.counts).join("/")}`);
        ok("  and WebGL2's twin route agrees", r.result.webgl2.counts.join() === Array.from(twin.counts).join());
        const hist = (P) => { const c = {}; for (let i = 0; i < P.length; i += 4) { const k = P[i] + "," + P[i + 1] + "," + P[i + 2]; c[k] = (c[k] || 0) + 1; } return c; };
        const hw = hist(W.pixels), hl = hist(r.result.webgl2.pixels);
        const keys = [...new Set([...Object.keys(hw), ...Object.keys(hl)])]; let worstHist = 0; for (const k of keys) worstHist = Math.max(worstHist, Math.abs((hw[k] || 0) - (hl[k] || 0)));
        ok("  the two backends' frames agree per colour to within a body's edge pixels", worstHist <= 64, `largest per-colour count difference ${worstHist} pixels`);
        ok("CONTROL: bodies were drawn", (hw["255,255,0"] || 0) + (hw["0,128,255"] || 0) > 50);
    }
    if (r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
}

// v4476 -- THE FLEETS AND THE FLYBYS, as records of the same kernel, held to the 2D page's own functions.
console.log("\n2b. SATELLITES, DEBRIS AND FLYBYS: three kinds of record, one kernel, the 2D page's functions as twins");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const fleetRaw = JSON.parse(fs.readFileSync(path.join(ENG, "orrery-fleet.json"), "utf8"));
    const reachedRaw = JSON.parse(fs.readFileSync(path.join(ENG, "orrery-reached.json"), "utf8"));
    const FLEET_OPTS = { altFloor: 0.12, altGain: 0.04 };   // the page's compact fleet, so moons hug their planets at the system scale
    const far = Math.max(...system.bodies.map((b) => b.a + b.radius)), Q_NEAR = far * 1.3, Q_FAR = far * 3.2;
    const FLYBY_OPTS = { nearest: Q_NEAR, farthest: Q_FAR, qGain: (Q_FAR - Q_NEAR) / Math.log1p(8), loop: Math.max(...system.bodies.map((b) => b.period)) * 10 };
    const fleets = fleetsFor(system, fleetRaw.bodies, FLEET_OPTS);
    const flybys = reachedBodies([...fromReachedRegister(REACHED_SOURCES, severityOf), ...fromKhronos(models(), (reachedRaw.visited || []).map((v) => v.name), mayVendor)], FLYBY_OPTS);
    const full = O.elementsOf(system, { fleets, flybys });
    const nSat = [...fleets.values()].reduce((n, f) => n + f.satellites.length, 0), nDeb = [...fleets.values()].reduce((n, f) => n + f.debris.length, 0);
    ok(`the source carries 1 + ${system.bodies.length} bodies + ${nSat} satellites + ${nDeb} debris + ${flybys.length} flybys = ${full.count} records`,
       full.count === 1 + system.bodies.length + nSat + nDeb + flybys.length && full.counts.satellites === nSat && full.counts.debris === nDeb && full.counts.flybys === flybys.length && nSat > 100 && flybys.length > 150);
    ok("  every record has a NAME a pick can say: the file and which body it imports, the source and whether SweK may take it", full.names.every((n) => typeof n === "string" && n.length > 2) && full.names.some((n) => /\(imports /.test(n)) && full.names.some((n) => /\(reached, /.test(n)));
    const T2 = 412.5, cpu2 = O.orbitRecordsCpu(system, T2, full.layout);
    // the twin itself, against the 2D page's functions record by record
    let twinOk = true;
    full.layout.forEach((L, i) => { if (L.kind === O.KIND.satellite) { const c = positionAt3(full.layout[L.parent].body, T2), s = satelliteAt(L.sat, T2); if (Math.abs(cpu2[i * 4] - Math.fround(c.x + s.x)) > 1e-6 || Math.abs(cpu2[i * 4 + 2] - Math.fround(c.z)) > 1e-6) twinOk = false; }
        else if (L.kind === O.KIND.flyby) { const f = flybyAt(L.flyby, T2); if (Math.abs(cpu2[i * 4] - Math.fround(f.x)) > 1e-6 || cpu2[i * 4 + 2] !== 0) twinOk = false; } });
    ok("the twin IS satelliteAt about the parent's positionAt3, and flybyAt in the plane", twinOk);
    const r2 = await runInEngineOrigin({ engineRoot: ENG, args: { T2, bodies: raw.bodies, TODAY, fleetBodies: fleetRaw.bodies, visited: (reachedRaw.visited || []).map((v) => v.name), FLEET_OPTS, FLYBY_OPTS, epochOf: flybys[7].epoch }, script: `async (a) => {
        const O = await import("/render/gpuOrbits.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const { buildOrrery } = await import("/world/orrery.mjs"); const { fleetsFor } = await import("/world/orreryFleet.mjs");
        const R = await import("/world/orreryReached.mjs"); const { REACHED_SOURCES, severityOf } = await import("/world/reachedLicences.mjs"); const K = await import("/gpu/khronosSamples.mjs");
        const system = buildOrrery(a.bodies, { today: a.TODAY });
        const fleets = fleetsFor(system, a.fleetBodies, a.FLEET_OPTS);
        const flybys = R.reachedBodies([...R.fromReachedRegister(REACHED_SOURCES, severityOf), ...R.fromKhronos(K.models(), a.visited, K.mayVendor)], a.FLYBY_OPTS);
        const cv = document.createElement("canvas"); cv.width = 64; cv.height = 64;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const src = O.makeOrbitSource(dev, system, { fleets, flybys });
        const o = { count: src.count, path: src.advance(a.T2).path };
        o.records = Array.from(await src.readRecords());
        src.advance(a.epochOf); o.atEpoch = Array.from(await src.readRecords());
        src.destroy(); dev.destroy(); return o;
    }` });
    ok("*** the kernel places all three kinds on WebGPU ***", r2.ok && r2.result.path === "compute" && r2.result.count === full.count, r2.ok ? `${r2.result.count} records` : r2.reason);
    if (r2.ok) {
        const W2 = r2.result.records;
        const worst = { body: 0, satellite: 0, flyby: 0 }, worstName = { body: "", satellite: "", flyby: "" };
        full.layout.forEach((L, i) => { const scale = Math.max(0.05, Math.hypot(cpu2[i * 4], cpu2[i * 4 + 1], cpu2[i * 4 + 2]));
            const d = Math.hypot(W2[i * 4] - cpu2[i * 4], W2[i * 4 + 1] - cpu2[i * 4 + 1], W2[i * 4 + 2] - cpu2[i * 4 + 2]) / scale;
            const k = L.kind === O.KIND.body ? "body" : L.kind === O.KIND.satellite ? "satellite" : "flyby"; if (d > worst[k]) { worst[k] = d; worstName[k] = L.name; } });
        // A satellite's error is the parent's (2e-4 of the parent's axis, the bound above) PLUS its own circle's (2e-4 of its own,
        // smaller, axis), both from SwiftShader's low-accuracy sin/cos, so the bound is the SUM: 2e-4 x (1 + a_sat / a_parent),
        // at most 3e-4 here. Measured 2.04e-4 at v4476 -- over the single-term bound, as two terms must be allowed to be.
        ok("*** every satellite is within 3e-4 (two trig terms: the parent's 2e-4 and its own) of the twin -- the parent recomputed in the kernel, the circle about it ***", worst.satellite < 3e-4, `worst ${worst.satellite.toExponential(2)} on ${worstName.satellite}`);
        ok("*** every flyby is within 2e-4 of its distance of flybyAt -- Barker in f32, the stable cube root ***", worst.flyby < 2e-4, `worst ${worst.flyby.toExponential(2)} on ${worstName.flyby}`);
        ok("  and the bodies still are", worst.body < 2e-4, `worst ${worst.body.toExponential(2)} on ${worstName.body}`);
        // a satellite minus its parent is satelliteAt, on the GPU as on the CPU
        let relOk = true, relWorst = 0;
        full.layout.forEach((L, i) => { if (L.kind !== O.KIND.satellite) return; const pi = L.parent, s = satelliteAt(L.sat, T2);
            const d = Math.hypot(W2[i * 4] - W2[pi * 4] - s.x, W2[i * 4 + 1] - W2[pi * 4 + 1] - s.y, W2[i * 4 + 2] - W2[pi * 4 + 2]); relWorst = Math.max(relWorst, d); if (d > 2e-4 * Math.max(1, s.a)) relOk = false; });
        ok("  a satellite's GPU position minus its parent's GPU position IS satelliteAt", relOk, `worst ${relWorst.toExponential(2)}`);
        // the flyby control: at a flyby's own epoch it is at perihelion, exactly q from the origin
        const fi = full.layout.findIndex((L) => L.kind === O.KIND.flyby && L.flyby === flybys[7]);
        const rEpoch = Math.hypot(r2.result.atEpoch[fi * 4], r2.result.atEpoch[fi * 4 + 1]);
        ok("CONTROL: at its own epoch a flyby sits at perihelion, |p| = q", Math.abs(rEpoch - flybys[7].q) < 2e-4 * flybys[7].q, `${rEpoch.toFixed(4)} against q ${flybys[7].q.toFixed(4)} for ${flybys[7].name}`);
        // what a frame can show: the count inside a radius, GPU against passingWithin
        const RAD = Q_FAR * 1.5; let inside = 0;
        full.layout.forEach((L, i) => { if (L.kind === O.KIND.flyby && Math.hypot(W2[i * 4], W2[i * 4 + 1]) <= RAD) inside++; });
        const pw = passingWithin(flybys, T2, RAD);
        ok(`*** the GPU's count of flybys within ${RAD.toFixed(1)} equals passingWithin's, the 2D page's own readout ***`, inside === pw && pw > 0 && pw < flybys.length, `${inside} on the GPU, ${pw} on the CPU, of ${flybys.length}`);
    }
}

console.log("\n3. THE PAGE: orrery-gpu.html LOADS, PICKS A ROUTE AND SAYS WHICH");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const page = fs.readFileSync(path.join(ENG, "orrery-gpu.html"), "utf8");
    ok("the page imports the orbit source, the GPU-driven scene and the device, and links the 2D orrery", /gpuOrbits\.mjs/.test(page) && /gpuDriven\.mjs/.test(page) && /gfx\/device\.js/.test(page) && /orrery\.html/.test(page));
    // v4476 -- the page builds its flybys the way orrery.html does (the same registers, the same options) and hands fleets and flybys to the source
    ok("  and builds the fleets and the flybys from the same registers the 2D page reads, handing both to makeOrbitSource", /fleetsFor\(system, fleetRaw\.bodies/.test(page) && /fromReachedRegister\(REACHED_SOURCES, severityOf\)/.test(page) && /fromKhronos\(models\(\), visited, mayVendor\)/.test(page) && /makeOrbitSource\(device, system, \{ fleets, flybys/.test(page));
    ok("  and a pick names a satellite or a flyby by the source's own name, and only a BODY can be landed on or followed", /source\.names\[hit\.id\]/.test(page) && /source\.kinds\[hit\.id\] === KIND\.body/.test(page));
    ok("  and refuses to pretend when there is no device", /nothing can be drawn/.test(page));
    // Loaded WITHOUT WebGPU flags: this shell cannot present WebGPU to a canvas, so the page's WebGL2 fallback is
    // the route under test, and the HUD must say so. (The WebGPU route is graded in section 2, offscreen.)
    const { resolvePlaywright, HEADLESS_SHELL } = await import("./playwrightResolve.mjs");
    const { createRequire } = await import("node:module"); const http = await import("node:http");
    const pw = resolvePlaywright(createRequire(import.meta.url));
    const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json" };
    const srv = http.createServer((q, s2) => { const u = decodeURIComponent(String(q.url).split("?")[0]); const f = path.join(ENG, u === "/" ? "orrery-gpu.html" : u);
        if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s2.writeHead(404); return s2.end("no"); }
        s2.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); s2.end(fs.readFileSync(f)); });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const br = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
    const pg = await br.newPage(); const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await pg.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: "load" }); await pg.waitForTimeout(1500);
    const st = await pg.evaluate(() => ({ route: document.getElementById("route").textContent, drawn: document.getElementById("drawn").textContent, t: Number(document.getElementById("t").textContent) }));
    const shot1 = await pg.screenshot({ type: "png" }); await pg.waitForTimeout(400); const shot2 = await pg.screenshot({ type: "png" });
    await br.close(); srv.close();
    ok("*** the page loads and takes the WebGL2 route here, saying so in the HUD ***", /webgl2/.test(st.route) && /CPU twin/.test(st.route), st.route);
    // *** "of 15" WAS TYPED AND THE TREE GREW TO 15 BODIES PLUS THE CENTRE. *** The page prints its own
    // source.count, so the expected figure is read from the same bake the page loads rather than written here:
    // a sixteenth dependency must not need this line edited, and must not pass silently either.
    // v4476 -- the page's source carries the fleets and the flybys too, so the count it reports is the FULL one, derived here
    // from the same bakes and registers the page reads rather than typed
    const fleetRawP = JSON.parse(fs.readFileSync(path.join(ENG, "orrery-fleet.json"), "utf8")), reachedRawP = JSON.parse(fs.readFileSync(path.join(ENG, "orrery-reached.json"), "utf8"));
    const nFleet = [...fleetsFor(system, fleetRawP.bodies).values()].reduce((n, f) => n + f.satellites.length + f.debris.length, 0);
    const nFly = fromReachedRegister(REACHED_SOURCES, severityOf).length + fromKhronos(models(), (reachedRawP.visited || []).map((v) => v.name), mayVendor).length;
    const wantDrawn = "of " + (raw.bodies.length + 1 + nFleet + nFly);
    ok("  the clock runs and the counts are reported", st.t > 0 && st.drawn.includes(wantDrawn),
        `t=${st.t} drawn ${st.drawn}, expected "${wantDrawn}" (${raw.bodies.length} bodies + SweK + ${nFleet} in the fleets + ${nFly} flybys)`);
    ok("  the picture moves", !shot1.equals(shot2));
    ok("  and the page threw nothing", errs.filter((e) => !/favicon/.test(e)).length === 0, errs.slice(0, 2).join(" | ") || "clean");
}

// =============================================================================================================
// SABOTAGE LOG -- each applied, gate run, exit code read, restored. MEASURED at Level 12.
//   A  the angular rate doubled in the WGSL -> exit=1, 1 red: worst 1.99 of the axis on heerich (a body on the
//      far side of its orbit). Counts and pictures stayed within bounds: the cull does not know where a body
//      SHOULD be, only where it is -- which is why positionAt is the oracle and not the frame.
//   B  the orbit pass never dispatched -> exit=1, 6 red: every record reads back as zero, the radii are gone,
//      nothing moves after 100 days, the GPU culls 0/15 against the twin's 7/8, and no bodies are drawn.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THE PICTURE AGAINST THE 2D ORRERY. The 2D page draws discs, labels and orbit rings in " +
    "canvas 2D; this draws quads through the device. What is compared is WHERE, not how it looks -- the " +
    "position is the physics, the disc is the view. Also unchecked: f32 sin/cos over very many periods, where " +
    "2*PI*t/period loses precision on the GPU before it does in f64.");
process.exit(fails ? 1 : 0);
