// WebGLEngine/brain/seatGunnerGpu-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/seatGunnerGpu-selfcheck.mjs      (~25 s: a headless Chromium, SwiftShader on the build box; the card on a rig)
//
// THE SEAT NETWORKS OF A FIGHT, DECIDED ON A REAL WebGPU DEVICE IN ONE BATCH, GRADED AGAINST THE CPU TWIN. brain/seatGunnerGpu.mjs runs the networks of a capital ship's gun seats (the fruit fly's and the GPU brain's, brain/seatGunnerPolicy.mjs and seatGunnerMlp.mjs) through brain/mlp.js's BatchedMLP for all the
// seats of all the ships at once, through brain/spaceArena.mjs's two-phase tick (stepSpaceArenaAsync); this holds it to the CPU twin the networks were written against.
//
//   0  WHAT NEEDS NO DEVICE  the brain refuses what it cannot run (no device, no network, a network with no layers or no post); the batcher with nothing to decide makes no brain and no call
//   1  THE DEVICE AGAINST THE TWIN  random networks (both kinds) and random feature rows: every control within 1e-4 of the twin's (float32 on the device), and the number of cells that are BIT-identical reported, never asserted (a card that fuses a multiply-add differs in the last bit)
//   2  THE FIGHT ON THE DEVICE  a bow attack of twelve seconds with a network in every seat, once stepped on the CPU and once with the device deciding, for each kind of network: the ship's trajectory is the same to the bit (the seats do not move the hull), both fire (hundreds of rounds) and the rounds fired agree to
//                              within 10%; whether the whole state is bit-identical is REPORTED, not asserted
//   3  THE MACHINERY         the seats of the fight are ONE forward() call a tick for one network (and the device is not asked in a tick no seat had a target), two for a fight with two different networks (`seatNetworks`: the turrets' and the mounts'), a batch past the cap is split into the calls it needs and the answers are
//                              the same as one big batch's, a network is built once and kept
//   4  THE PRICE             the time of the same fight on the CPU and on the device, printed: the header says the GPU is not what makes this fast, and this is the number
//   5  THE FRONT DOOR        the export list is pinned and the report lines say real things
//
// SABOTAGE LOG (each applied to brain/seatGunnerGpu.mjs, the gate run, the file restored byte for byte; the number is how many rows went red):
//   GA1 every job goes to the first network 3 | GA2 the split skips a row at each seam 1 | GA3 the controls are not squashed 4 | GA4 a brain is built for every ask 3 | GA5 the answers are put back in the order of the groups 2 | GA6 the rows are packed one float off 5
//   GA7 calls do not queue 1 (BatchedMLP's mapAsync error surfaces: "the harness ran the device script" goes red with the device's own message) | GA8 a call is counted per row 4 | GA9 the device is not checked 1 | GA10 a network with no post is accepted 1 | GA11 the batcher builds a brain for an empty batch 5
// WHAT THE GATE MEASURED, SAID PLAINLY (the software adapter of the build box, SwiftShader): the device's controls are the CPU twin's BIT FOR BIT on all 192 cells of both networks, and a twelve-second fight stepped with the device deciding is bit-identical to the CPU's in every state field -- reported, and not asserted, because a card that fuses a
// multiply-add will differ in the last bit (the rows assert the hull's trajectory to the bit, which the seats cannot move, the controls to 1e-4 and the rounds fired to 10%); and the price: 346 forward() calls for the twelve seconds, the device 2.7 (the fruit fly's) to 5.4 (the GPU brain's) TIMES SLOWER than the CPU on this adapter. A card's figure is the rig's to read: the gate prints it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { createRequire } from "node:module";
import * as G from "./seatGunnerGpu.mjs";
import * as SG from "./seatGunnerPolicy.mjs";
import * as MG from "./seatGunnerMlp.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }
const throwsAsync = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
const mulberry = SG.rngFor;
const netOf = (mod, w) => ({ w, forward: mod.forward, layersOf: mod.layersOf, post: SG.post });

console.log("seatGunnerGpu-selfcheck -- the seat networks of a fight, decided on the GPU in one batch\n");

console.log("0. WHAT NEEDS NO DEVICE");
{
    const stub = { createShaderModule() {} }, w = MG.handWeights();
    const e1 = await throwsAsync(() => new G.GpuSeatBrain(null, netOf(MG, w))), e2 = await throwsAsync(() => new G.GpuSeatBrain(stub, null)), e3 = await throwsAsync(() => new G.GpuSeatBrain(stub, { w, layersOf: MG.layersOf })), e4 = await throwsAsync(() => new G.GpuSeatBrain(stub, { layersOf: MG.layersOf, post: SG.post }));
    ok("!! the brain refuses what it cannot run, each by name and before any GPU object is made: no device, no network, a network with no post, a network with no weights", /needs a GPUDevice/.test(e1) && /needs a network/.test(e2) && /needs a network/.test(e3) && /needs a network/.test(e4), [e1, e2, e3, e4].join(" | "));
    let made = 0; const dev = new Proxy({ createShaderModule() { made++; } }, { get: (t, k) => (k in t ? t[k] : () => { made++; }) }), batch = G.gpuBatcher(dev), empty = await batch([]);
    ok("!! A BATCH OF NOTHING MAKES NO BRAIN AND NO CALL: the batcher asked for no jobs answers an empty list, has seen no network, has made no forward() and touched the device not at all", Array.isArray(empty) && empty.length === 0 && batch.brains.size === 0 && batch.dispatches() === 0 && made === 0);
}

const skip = webgpuSkipReason(createRequire(import.meta.url));
if (skip) { console.log(`\n  SKIP  ${skip}`); report("*** NOT A PASS. ***", ""); fails++; }
else {
    const rng = mulberry(5), rows = Array.from({ length: 64 }, () => Array.from({ length: 12 }, () => (rng() * 2 - 1) * (rng() < 0.2 ? 3 : 1)));
    const wF = SG.perturb(SG.handWeights(), 0.3, mulberry(21)), wM = MG.perturb(MG.handWeights(), 0.3, mulberry(22)), wF2 = SG.perturb(SG.handWeights(), 0.2, mulberry(31)), wM2 = MG.perturb(MG.handWeights(), 0.2, mulberry(32));
    const run = await runInEngineOrigin({
        engineRoot: ENG, timeoutMs: 400000,
        args: { rows, wF: Array.from(wF), wM: Array.from(wM), wF2: Array.from(wF2), wM2: Array.from(wM2) },
        script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const G = await import("/brain/seatGunnerGpu.mjs"), SG = await import("/brain/seatGunnerPolicy.mjs"), MG = await import("/brain/seatGunnerMlp.mjs"), SA = await import("/brain/spaceArena.mjs"), BS = await import("/brain/battleshipFight.mjs");
            const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
            const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            if (!dev.gpu) return { noGpu: dev.backend };
            let adapter = null; try { adapter = dev.adapterInfo || null; } catch {}
            const out = { backend: dev.backend, adapter }, W = { F: Float32Array.from(a.wF), M: Float32Array.from(a.wM), F2: Float32Array.from(a.wF2), M2: Float32Array.from(a.wM2) };
            const netOf = (mod, w) => ({ w, forward: mod.forward, layersOf: mod.layersOf, post: SG.post });
            // 1: the device against the twin
            out.raw = {};
            for (const [k, mod, w] of [["F", SG, W.F], ["M", MG, W.M]]) { const g = new G.GpuSeatBrain(dev.gpu, netOf(mod, w), { batchCap: 64 }); out.raw[k] = await g.decide(a.rows); out.raw[k + "cpu"] = a.rows.map((r) => mod.forward(w, r)); }
            // 2: the fight, twelve seconds, a network in every seat, the CPU and the device
            const sig = (ar) => JSON.stringify([ar.i, ar.rounds.length, ar.crafts.map((c) => [c.body.pos, c.body.vel, c.body.q, c.body.w, c.hp, c.hits, (c.seats || []).map((q) => [q.state.yaw, q.state.pitch, q.state.gun.fired, q.state.gun.ammo])])]);
            const fired = (ar) => ar.crafts.filter((c) => c.kind === "capital").reduce((n, c) => n + c.seats.reduce((m, q) => m + q.state.gun.fired, 0), 0);
            out.fight = {};
            for (const [k, mod, w] of [["F", SG, W.F], ["M", MG, W.M]]) {
                const cpu = BS.build(1, "bow", { network: { module: mod, weights: w } }).arena, t0 = performance.now(); for (let i = 0; i < 360; i++) SA.stepSpaceArena(cpu); const cpuMs = performance.now() - t0;
                const batch = G.gpuBatcher(dev.gpu), gpu = BS.build(1, "bow", { network: { module: mod, weights: w } }).arena, t1 = performance.now(); let asked = 0; const counting = async (jobs) => { asked++; return batch(jobs); }; for (let i = 0; i < 360; i++) await SA.stepSpaceArenaAsync(gpu, counting); const gpuMs = performance.now() - t1;
                out.fight[k] = { sameState: sig(cpu) === sig(gpu), firedCpu: fired(cpu), firedGpu: fired(gpu), shipCpu: cpu.crafts[0].body.pos, shipGpu: gpu.crafts[0].body.pos, shipQCpu: cpu.crafts[0].body.q, shipQGpu: gpu.crafts[0].body.q, cpuMs, gpuMs, asked, forwards: batch.dispatches(), brains: batch.brains.size,
                    fightersCpu: cpu.crafts.filter((c) => c.kind === "fighter" && c.dead).length, fightersGpu: gpu.crafts.filter((c) => c.kind === "fighter" && c.dead).length };
            }
            // 3: the machinery. Two different networks in one fight (the turrets' and the mounts'), two ships; a batch past the cap
            { const batch = G.gpuBatcher(dev.gpu); let calls = 0; const counting = async (jobs) => { calls++; return batch(jobs); };
              const ar = BS.build(2, "beam", { ships: 2, seatNetworks: { main: { module: MG, weights: W.M2 }, pd: { module: SG, weights: W.F2 } } }).arena; let ticks = 0; for (let i = 0; i < 240; i++) { await SA.stepSpaceArenaAsync(ar, counting); ticks++; }
              const cpu = BS.build(2, "beam", { ships: 2, seatNetworks: { main: { module: MG, weights: W.M2 }, pd: { module: SG, weights: W.F2 } } }).arena; for (let i = 0; i < 240; i++) SA.stepSpaceArena(cpu);
              out.two = { calls, ticks, forwards: batch.dispatches(), brains: batch.brains.size, firedGpu: fired(ar), firedCpu: fired(cpu), same: sig(ar) === sig(cpu) }; }
            { const jobs = a.rows.slice(0, 26).map((x) => ({ net: netOf(MG, W.M), x })), one = G.gpuBatcher(dev.gpu, { batchCap: 64 }), split = G.gpuBatcher(dev.gpu, { batchCap: 8 });
              const y1 = await one(jobs), y2 = await split(jobs); out.cap = { oneForwards: one.dispatches(), splitForwards: split.dispatches(), same: JSON.stringify(y1) === JSON.stringify(y2), n: y1.length }; }
            { const batch = G.gpuBatcher(dev.gpu), jobsA = a.rows.slice(0, 5).map((x) => ({ net: netOf(MG, W.M), x })), jobsB = a.rows.slice(5, 9).map((x) => ({ net: netOf(MG, W.M2), x })); await batch(jobsA); const b1 = batch.brains.get(W.M); await batch(jobsA); await batch([...jobsA, ...jobsB]); out.kept = { sameBrain: batch.brains.get(W.M) === b1, brains: batch.brains.size, forwards: batch.dispatches() }; }
            // jobs of two different networks INTERLEAVED, each answered as the twin answers it (the grouping and the scatter back to the job's place); and three calls at once on one brain (they queue)
            { const batch = G.gpuBatcher(dev.gpu), jobs = a.rows.slice(0, 24).map((x, i) => ({ net: i % 3 === 0 ? netOf(SG, W.F2) : i % 3 === 1 ? netOf(MG, W.M2) : netOf(MG, W.M), x }));
              out.mixed = { got: await batch(jobs), want: jobs.map((j) => j.net.forward(j.net.w, j.x)), brains: batch.brains.size };
              const g = new G.GpuSeatBrain(dev.gpu, netOf(MG, W.M), { batchCap: 64 }), parts = [a.rows.slice(0, 16), a.rows.slice(16, 40), a.rows.slice(40, 64)];
              const together = await Promise.all(parts.map((p) => g.raw(p))); const apart = []; for (const p of parts) apart.push(await g.raw(p));
              out.concurrent = { same: JSON.stringify(together) === JSON.stringify(apart), lengths: together.map((t) => t.length) }; }
            return out;
        }`,
    });
    if (run.skipped) { console.log(`\n  SKIP  ${run.reason}`); report("*** NOT A PASS. ***", ""); fails++; }
    else if (!run.ok || !run.result || run.result.noGpu) { ok("the harness ran the device script", false, String(run.reason || (run.result && run.result.noGpu) || JSON.stringify(run)).slice(0, 300)); }
    else {
        const r = run.result;
        report("the adapter", `${r.backend} ${r.adapter ? [r.adapter.vendor, r.adapter.architecture].join(" ") : "?"}${run.software ? " (software)" : ""}`);
        if (run.pageErrors && run.pageErrors.length) report("page console errors", run.pageErrors.slice(0, 3).join(" | ").slice(0, 300));
        ok("!! no page errors were logged while the device ran", !run.pageErrors || run.pageErrors.length === 0, (run.pageErrors || []).slice(0, 2).join(" | ").slice(0, 200));

        console.log("\n1. THE DEVICE AGAINST THE CPU TWIN");
        {
            const diff = (g, c) => Math.max(...g.map((row, i) => Math.max(...row.map((v, j) => Math.abs(v - c[i][j]))))), bits = (g, c) => g.reduce((n, row, i) => n + row.filter((v, j) => Object.is(Math.fround(v), Math.fround(c[i][j]))).length, 0);
            const dF = diff(r.raw.F, r.raw.Fcpu), dM = diff(r.raw.M, r.raw.Mcpu);
            ok("!! THE DEVICE'S CONTROLS ARE THE TWIN'S: 64 random feature rows (a fifth of the features out of range, three times too large) through a random fruit fly network and a random GPU brain network give, on the device, every one of the 3 x 64 controls of each within 1e-4 of the CPU twin's (float32 against the twin's float32 mirror; the tanh is the twin's own), and they are controls (not all zero, none outside [-1, 1])",
                r.raw.F.length === 64 && r.raw.M.length === 64 && dF < 1e-4 && dM < 1e-4 && r.raw.F.every((row) => row.length === 3 && row.every((v) => Math.abs(v) <= 1)) && r.raw.M.some((row) => row.some((v) => Math.abs(v) > 0.05)) && r.raw.F.some((row) => row.some((v) => Math.abs(v) > 0.05)), `worst ${dF.toExponential(1)} (fruit fly), ${dM.toExponential(1)} (GPU brain)`);
            report("bit-identical cells (reported, never asserted)", `fruit fly ${bits(r.raw.F, r.raw.Fcpu)} of 192, GPU brain ${bits(r.raw.M, r.raw.Mcpu)} of 192`);
        }

        console.log("\n2. THE FIGHT ON THE DEVICE");
        {
            for (const [k, name] of [["F", "fruit fly"], ["M", "GPU brain"]]) {
                const f = r.fight[k], dq = Math.max(...f.shipQCpu.map((v, i) => Math.abs(v - f.shipQGpu[i]))), dp = Math.max(...f.shipCpu.map((v, i) => Math.abs(v - f.shipGpu[i])));
                ok(`!! A TWELVE-SECOND BOW ATTACK WITH THE ${name.toUpperCase()}'S NETWORK IN EVERY SEAT IS THE SAME FIGHT ON THE DEVICE: the ship's position and attitude are the CPU fight's to the bit (the seats do not move the hull), both fire hundreds of rounds and the rounds agree to within 10%, the fighters shot down are the same number`,
                    dp === 0 && dq === 0 && f.firedCpu > 200 && f.firedGpu > 200 && Math.abs(f.firedGpu - f.firedCpu) <= 0.1 * f.firedCpu && f.fightersCpu === f.fightersGpu, `${f.firedCpu} against ${f.firedGpu} rounds, ${f.fightersCpu} down; whole state ${f.sameState ? "BIT-IDENTICAL" : "different in the last bits"}`);
            }
        }

        console.log("\n3. THE MACHINERY");
        {
            const f = r.fight.M, t = r.two, c = r.cap, k = r.kept;
            ok("!! ONE NETWORK IS ONE forward() A TICK FOR THE WHOLE FIGHT: the twelve seconds of 360 ticks asked the device at most once a tick (and not in a tick no seat had a target: fewer than 360 asks), made exactly one forward() per ask, and built one network", f.asked < 360 && f.asked > 200 && f.forwards === f.asked && f.brains === 1, `${f.asked} asks, ${f.forwards} forwards, ${f.brains} network`);
            ok("!! TWO DIFFERENT NETWORKS ARE TWO forward() CALLS A TICK AT MOST, FOR BOTH SHIPS: the beam attack of seed 2 against two ships with the GPU brain's network in the turrets and the fruit fly's in the mounts, 240 ticks, made one batch call per tick at most and two forward() calls per batch at most (the turrets' and the mounts'), built two networks, and the fight fires as on the CPU (within 10%)",
                t.calls <= t.ticks && t.forwards <= 2 * t.calls && t.forwards > t.calls && t.brains === 2 && t.firedGpu > 100 && Math.abs(t.firedGpu - t.firedCpu) <= 0.1 * t.firedCpu, `${t.calls} asks, ${t.forwards} forwards, ${t.brains} networks, ${t.firedGpu} against ${t.firedCpu} rounds, whole state ${t.same ? "BIT-IDENTICAL" : "different in the last bits"}`);
            ok("!! A BATCH PAST THE CAP IS SPLIT AND THE ANSWERS ARE THE SAME: 26 jobs with a cap of 64 are one forward() call, with a cap of 8 four (8 + 8 + 8 + 2), and the 26 controls are the same either way, to the bit", c.n === 26 && c.oneForwards === 1 && c.splitForwards === 4 && c.same, `${c.oneForwards} against ${c.splitForwards}`);
            const mx = r.mixed, dm = Math.max(...mx.got.map((row, i) => Math.max(...row.map((v, j) => Math.abs(v - mx.want[i][j])))));
            ok("!! JOBS OF DIFFERENT NETWORKS INTERLEAVED ARE EACH ANSWERED BY ITS OWN: 24 jobs in the order fruit fly, GPU brain, GPU brain (another set of weights), repeated -- three networks, grouped by weights, run, and put back where they came from: every one of the 24 answers within 1e-4 of the twin's own forward on that job (the fruit fly's rows are not given the GPU brain's network, nor the other way round)", mx.got.length === 24 && mx.brains === 3 && dm < 1e-4 && mx.got.some((row, i) => Math.abs(row[0] - mx.got[(i + 1) % 24][0]) > 1e-3), `worst ${dm.toExponential(1)}, ${mx.brains} networks`);
            ok("!! CALLS THAT OVERLAP QUEUE: three raw() calls started at once on one brain (16, 24 and 24 rows) give the answers the same three one after another give, whole -- BatchedMLP keeps one pair of activation buffers and one staging buffer, so overlapping forward() calls would fight over a buffer that is already mapped", r.concurrent.same && r.concurrent.lengths.join() === "16,24,24");
            ok("!! A NETWORK IS BUILT ONCE AND KEPT: asking again with the same weights reuses the same brain (the object), a second set of weights makes a second, and the forward() calls are counted per ask (1 + 1 + 2)", k.sameBrain && k.brains === 2 && k.forwards === 4, JSON.stringify(k));
        }

        console.log("\n4. THE PRICE");
        {
            const f = r.fight.M, g = r.fight.F;
            report("the same twelve seconds, GPU brain's network", `CPU ${f.cpuMs.toFixed(0)} ms, device ${f.gpuMs.toFixed(0)} ms (${(f.gpuMs / f.cpuMs).toFixed(1)}x), ${f.forwards} forward() calls`);
            report("the same twelve seconds, fruit fly's network", `CPU ${g.cpuMs.toFixed(0)} ms, device ${g.gpuMs.toFixed(0)} ms (${(g.gpuMs / g.cpuMs).toFixed(1)}x), ${g.forwards} forward() calls`);
            ok("both times are real numbers (the printed price is not NaN)", [f.cpuMs, f.gpuMs, g.cpuMs, g.gpuMs].every((v) => Number.isFinite(v) && v > 0));
        }
    }

    console.log("\n5. THE FRONT DOOR");
    {
        ok("!! the export list is pinned: GpuSeatBrain, gpuBatcher, reportLines", Object.keys(G).sort().join() === "GpuSeatBrain,gpuBatcher,reportLines", Object.keys(G).sort().join());
        const lines = G.reportLines();
        ok("the report lines name the module and say it is slower on a fight of two ships", lines.length === 2 && lines.every((l) => !/NaN|undefined/.test(l)) && /seatGunnerGpu/.test(lines[0]) && /slower/.test(lines[1]), lines[1]);
    }
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
