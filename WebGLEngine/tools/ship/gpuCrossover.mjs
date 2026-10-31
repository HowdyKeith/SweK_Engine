// WebGLEngine/tools/ship/gpuCrossover.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/GPU_CROSSOVER_WIP.md, the gate is tools/ship/gpuCrossover-selfcheck.mjs)
//
// THE GPU BATCH-SIZE CROSSOVER: at how many rows decided in one call does the GPU Brain's decide() (brain/pilotFlightGpu.mjs GpuPilotBrain, brain/seatGunnerGpu.mjs GpuSeatBrain) overtake the CPU twin's forward passes? One script runs in the
// harness's browser page (tools/ship/webgpuHarness.mjs runInEngineOrigin) so both sides are timed by the same clock on the same machine; this file turns the raw timings into medians, crossovers, the registered predictions G1 to G5 and a table.
//   node tools/ship/gpuCrossover.mjs                         the full sweep (N = 1 to 8192), prints the tables
//   node tools/ship/gpuCrossover.mjs --write                 and appends the record: a SOFTWARE adapter's record to brain/gpuCrossoverSoftware.jsonl, a real adapter's to brain/rig-results/gpuCrossover.jsonl
//   node tools/ship/gpuCrossover.mjs --sizes 1,64,512 --rounds 3 --min-ms 5      a quick look
// *** EVERY DEVICE THIS SANDBOX HAS IS SWIFTSHADER, A CPU RASTERISER: a crossover measured on it is a SOFTWARE ADAPTER'S and says nothing about a graphics card. The record names the adapter and the printout says SOFTWARE ADAPTER when it is one;
// the rig's run (SWEK_LAUNCH_ARGS="--enable-unsafe-webgpu --enable-features=Vulkan" if the browser falls back to software, docs/real-hardware-fsr.md) is the answer to the question. ***
// The Node side is pure apart from the page it launches and the file --write appends to. No Math.random; the rows and weights are seeded in the page.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin } from "./webgpuHarness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export const SIZES = Object.freeze([1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192]);
export const NETS = Object.freeze(["pilot", "seat"]);
export const CONFIGS = Object.freeze(["capMax", "cap64"]);
export const DEFAULTS = Object.freeze({ rounds: 5, minMs: 25, warmup: 3 });
export const TOL = 1e-4, CAP_DEFAULT = 64;
export const OUT_SOFTWARE = "brain/gpuCrossoverSoftware.jsonl", OUT_RIG = "brain/rig-results/gpuCrossover.jsonl";

/** The median of a list (the mean of the middle two when even); NaN for none. */
export function median(xs) {
    if (!xs.length) return NaN;
    const a = xs.slice().sort((p, q) => p - q), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
/**
 * The crossover of a series [{ n, cpu, gpu }] (milliseconds per call, ascending n): the smallest n at which the GPU is below the CPU AND stays below at every larger n tested.
 * { kind: "never" } when the GPU is not below at the largest n; { kind: "always", n: first n } when it is below at every n; else { kind: "at", n }.
 */
export function crossover(points) {
    if (!points.length) return { kind: "none", n: null };
    const last = points[points.length - 1];
    if (!(last.gpu < last.cpu)) return { kind: "never", n: null };
    let i = points.length - 1;
    while (i > 0 && points[i - 1].gpu < points[i - 1].cpu) i--;
    return i === 0 ? { kind: "always", n: points[0].n } : { kind: "at", n: points[i].n };
}
const roundMs = (t, c) => Math.min(...t.map((x, i) => x * c[i]));   // the length of each round (time per call x calls), the shortest: a round is at least the minimum asked for
/** The rows of one net from the page's raw rounds: per size the medians (ms per call) of the CPU twin and of the two GPU configurations, the worst parity of each, and the per-row costs. */
export function rowsOf(raw) {
    return raw.map((r) => ({
        n: r.n, cpu: median(r.cpu), capMax: median(r.capMax), cap64: median(r.cap64), parityCapMax: r.parityCapMax, parityCap64: r.parityCap64,
        cpuPerRow: median(r.cpu) / r.n, capMaxPerRow: median(r.capMax) / r.n, cap64Dispatches: Math.ceil(r.n / CAP_DEFAULT),
        rounds: Math.min(r.cpu.length, r.capMax.length, r.cap64.length), measured: r.dispatchesCapMax === undefined ? null : { capMax: r.dispatchesCapMax, cap64: r.dispatchesCap64, decidedCapMax: r.decidedCapMax, decidedCap64: r.decidedCap64, cpuRoundMsMin: roundMs(r.cpu, r.cpuCalls), gpuRoundMsMin: roundMs(r.capMax, r.gpuCalls) },
    }));
}
/** The crossovers of a net's rows, both configurations: { capMax, cap64 }. */
export function crossoversOf(rows) {
    return { capMax: crossover(rows.map((r) => ({ n: r.n, cpu: r.cpu, gpu: r.capMax }))), cap64: crossover(rows.map((r) => ({ n: r.n, cpu: r.cpu, gpu: r.cap64 }))) };
}
const ratio = (a, b) => Math.max(a, b) / Math.min(a, b);
/** The registered predictions G1 to G5 (brain/GPU_CROSSOVER_WIP.md) from the nets' rows and crossovers: { gN: true | false | null (cannot be read) }. G6 is the table. */
export function score(nets) {
    const names = Object.keys(nets), g = {};
    g.g1 = names.length ? names.every((k) => nets[k].rows.every((r) => r.parityCapMax <= TOL && r.parityCap64 <= TOL)) : null;
    const at = (rows, n) => rows.find((r) => r.n === n);
    g.g2 = names.length && names.every((k) => at(nets[k].rows, 1) && at(nets[k].rows, 64)) ? names.every((k) => ratio(at(nets[k].rows, 1).capMax, at(nets[k].rows, 64).capMax) <= 3) : null;
    g.g3 = names.length && names.every((k) => nets[k].rows.filter((r) => r.n >= 16).length >= 2) ? names.every((k) => { const per = nets[k].rows.filter((r) => r.n >= 16).map((r) => r.cpuPerRow); return Math.max(...per) / Math.min(...per) <= 1.5; }) : null;
    g.g4 = names.length && names.every((k) => at(nets[k].rows, 8192)) ? names.every((k) => at(nets[k].rows, 8192).cap64 > at(nets[k].rows, 8192).capMax) : null;
    const c = (k) => nets[k] && nets[k].crossovers.capMax;
    g.g5 = c("pilot") && c("seat") && c("pilot").n !== null && c("seat").n !== null ? ratio(c("pilot").n, c("seat").n) <= 2 : null;
    return g;
}
const f3 = (v) => (Number.isFinite(v) ? (v < 0.01 ? v.toExponential(2) : v.toFixed(v < 10 ? 3 : 1)) : "n/a");
const sci = (v) => (Number.isFinite(v) ? v.toExponential(1) : "n/a");
const crossText = (x) => (x.kind === "never" ? "NEVER (the GPU is not below the CPU at the largest size tested)" : x.kind === "always" ? `from the first size tested (N = ${x.n})` : x.kind === "at" ? `N = ${x.n}` : "n/a");
/** The printed block for one net. */
export function netTable(name, net) {
    const lines = [`${name} network -- ms per call (median of rounds), CPU twin against the GPU brain with cap = largest N (one dispatch) and cap = ${CAP_DEFAULT} (the default)`, "       N |  CPU twin |  GPU capMax |  GPU cap64 | CPU/GPU capMax | CPU/GPU cap64 | dispatches (cap64) | worst parity"];
    for (const r of net.rows) lines.push(`${String(r.n).padStart(8)} | ${f3(r.cpu).padStart(9)} | ${f3(r.capMax).padStart(11)} | ${f3(r.cap64).padStart(10)} | ${f3(r.cpu / r.capMax).padStart(14)} | ${f3(r.cpu / r.cap64).padStart(13)} | ${String(r.cap64Dispatches).padStart(18)} | ${sci(Math.max(r.parityCapMax, r.parityCap64))}${Math.max(r.parityCapMax, r.parityCap64) > TOL ? "  OVER " + TOL : ""}`);
    lines.push(`crossover, cap = largest N: ${crossText(net.crossovers.capMax)}`, `crossover, cap = ${CAP_DEFAULT}:        ${crossText(net.crossovers.cap64)}`);
    return lines.join("\n");
}
/** The predictions block. */
export function scoreText(g) {
    const w = (v) => (v === null ? "cannot be read" : v ? "HELD" : "MISSED");
    return [`G1 the GPU matches the CPU twin within ${TOL} at every size (both nets, both configurations): ${w(g.g1)}`, `G2 the GPU's time at N = 1 is within a factor of 3 of its time at N = 64 (a fixed cost): ${w(g.g2)}`, `G3 the CPU twin's time per row is flat from N = 16 up (largest over smallest within 1.5): ${w(g.g3)}`,
        `G4 at N = 8192 the default cap of ${CAP_DEFAULT} is slower than one dispatch, both nets: ${w(g.g4)}`, `G5 the pilot's and the seat network's one-dispatch crossovers are within a factor of 2 (when both exist): ${w(g.g5)}`].join("\n");
}
/** The record --write appends: the adapter, the settings, the nets (rows, crossovers) and the score. */
export function recordOf(res, settings) {
    return { adapter: res.adapter, software: res.software, launchArgs: res.launchArgs || null, settings, nets: res.nets, score: score(res.nets) };
}
/** Where a record is appended: a software adapter's record can never land in the rig's file. */
export const outFileFor = (software) => (software === false ? OUT_RIG : OUT_SOFTWARE);

// ---- the page --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const PAGE_SCRIPT = `async (a) => {
    const { requestDevice } = await import("/gfx/device.js");
    const G = await import("/brain/pilotFlightGpu.mjs"), M = await import("/brain/pilotFlightMlp.mjs");
    const SG = await import("/brain/seatGunnerGpu.mjs"), SM = await import("/brain/seatGunnerMlp.mjs"), SP = await import("/brain/seatGunnerPolicy.mjs");
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
    const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
    if (!dev.gpu) return { noGpu: dev.backend };
    const mulberry = (s) => () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pw = M.perturb(M.handWeights(), 0.3, mulberry(11)), sw = SM.perturb(SM.handWeights(), 0.3, mulberry(12));
    const nets = {
        pilot: { nIn: M.FEATURES, make: (cap) => new G.GpuPilotBrain(dev.gpu, pw, { batchCap: cap }), cpu: (rows) => rows.map((r) => M.forward(pw, r)), flat: (y) => [y.pitch, y.roll, y.yaw, y.throttle] },
        seat: { nIn: SM.FEATURES, make: (cap) => new SG.GpuSeatBrain(dev.gpu, { w: sw, forward: SM.forward, layersOf: SM.layersOf, post: SP.post }, { batchCap: cap }), cpu: (rows) => rows.map((r) => SM.forward(sw, r)), flat: (y) => y },
    };
    const maxN = Math.max(...a.sizes), out = { backend: dev.backend, maxN };
    let adapter = null; try { adapter = dev.adapterInfo || null; } catch {} out.adapterInfo = adapter;
    const timeAsync = async (fn) => { const t = [], c = []; for (let r = 0; r < a.rounds; r++) { let calls = 0; const t0 = performance.now(); let el = 0; do { await fn(); calls++; el = performance.now() - t0; } while (el < a.minMs); t.push(el / calls); c.push(calls); } return { t, c }; };
    const timeSync = (fn) => { const t = [], c = []; for (let r = 0; r < a.rounds; r++) { let calls = 0; const t0 = performance.now(); let el = 0; do { fn(); calls++; el = performance.now() - t0; } while (el < a.minMs); t.push(el / calls); c.push(calls); } return { t, c }; };
    for (const name of ["pilot", "seat"]) {
        const net = nets[name], rnd = mulberry(name === "pilot" ? 77 : 78), all = Array.from({ length: maxN }, () => Array.from({ length: net.nIn }, () => (rnd() * 2 - 1) * 3));
        const bMax = net.make(maxN), b64 = net.make(64), rows = [];
        for (let w = 0; w < a.warmup; w++) { await bMax.decide(all.slice(0, 16)); await b64.decide(all.slice(0, 16)); }
        out["warm_" + name] = [bMax.dispatches, b64.dispatches];
        for (const n of a.sizes) {
            const r = all.slice(0, n), want = net.cpu(r).map(net.flat);
            const worst = (got) => { let m = 0; for (let i = 0; i < n; i++) { const g = net.flat(got[i]); for (let k = 0; k < g.length; k++) m = Math.max(m, Math.abs(g[k] - want[i][k])); } return m; };
            const gMax = await bMax.decide(r), g64 = await b64.decide(r), cs = timeSync(() => net.cpu(r));
            const d0 = bMax.dispatches, k0 = bMax.decisions, tMax = await timeAsync(() => bMax.decide(r)), cMax = tMax.c.reduce((x, y) => x + y, 0), dMax = (bMax.dispatches - d0) / cMax, kMax = (bMax.decisions - k0) / cMax;
            const e0 = b64.dispatches, l0 = b64.decisions, t64 = await timeAsync(() => b64.decide(r)), c64 = t64.c.reduce((x, y) => x + y, 0), d64 = (b64.dispatches - e0) / c64, k64 = (b64.decisions - l0) / c64;
            rows.push({ n, parityCapMax: worst(gMax), parityCap64: worst(g64), dispatchesCapMax: dMax, dispatchesCap64: d64, decidedCapMax: kMax, decidedCap64: k64, cpu: cs.t, cpuCalls: cs.c, capMax: tMax.t, cap64: t64.t, gpuCalls: tMax.c });
        }
        out[name] = rows;
    }
    return out;
}`;

/**
 * Measure on the device the harness gives: { ok, skipped, reason, adapter, software, launchArgs, nets: { pilot: { rows, crossovers }, seat: ... } }. `run` is the harness (the gate hands in a stand-in); `settings` { sizes, rounds, minMs, warmup }.
 */
export async function measure(settings, run = runInEngineOrigin) {
    const r = await run({ engineRoot: ENG, script: PAGE_SCRIPT, args: settings, timeoutMs: 900000 });
    if (r.skipped) return { ok: false, skipped: true, reason: r.reason };
    if (!r.ok || !r.result) return { ok: false, skipped: false, reason: r.reason || (r.result && r.result.error) || "the page did not answer" };
    if (r.result.noGpu !== undefined) return { ok: false, skipped: false, reason: "no GPU in the page (backend " + r.result.noGpu + ")" };
    const nets = {};
    for (const name of NETS) { const rows = rowsOf(r.result[name]); nets[name] = { rows, crossovers: crossoversOf(rows) }; }
    return { ok: true, adapter: r.adapter || null, software: r.software === undefined ? null : r.software, launchArgs: r.launchArgs || null, nets, warm: { pilot: r.result.warm_pilot || null, seat: r.result.warm_seat || null }, pageErrors: r.pageErrors || [] };
}

/** The command as a function: returns the exit code (0 fine, 1 no measurement, 2 a bad argument). `io` is for the gate: { out, err, run, appendFile }. */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), appendFile = io.appendFile || fs.appendFileSync;
    const settings = { sizes: [...SIZES], rounds: DEFAULTS.rounds, minMs: DEFAULTS.minMs, warmup: DEFAULTS.warmup }; let write = false;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") write = true;
        else if (a === "--sizes") {
            const v = String(argv[++i] || "").split(",").map(Number);
            if (!v.length || v.some((x) => !Number.isInteger(x) || x < 1 || x > 8192) || new Set(v).size !== v.length) { err("gpuCrossover: --sizes needs distinct whole numbers from 1 to 8192, comma separated"); return 2; }
            settings.sizes = v.slice().sort((p, q) => p - q);
        } else if (a === "--rounds" || a === "--min-ms") {
            const v = Number(argv[++i]);
            if (!Number.isFinite(v) || v <= 0 || (a === "--rounds" && !Number.isInteger(v))) { err(`gpuCrossover: ${a} needs a positive number${a === "--rounds" ? " (a whole one)" : ""}`); return 2; }
            settings[a === "--rounds" ? "rounds" : "minMs"] = v;
        } else { err(`gpuCrossover: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    const res = await measure(settings, io.run || runInEngineOrigin);
    if (!res.ok) { err(`gpuCrossover: ${res.skipped ? "skipped" : "no measurement"}: ${res.reason}`); return 1; }
    const a = res.adapter;
    out(`${res.software === true ? "*** SOFTWARE ADAPTER *** " : res.software === false ? "hardware adapter: " : "adapter of unknown kind: "}${a ? [a.vendor, a.architecture, a.device, a.description].filter(Boolean).join(" ") : "not described"}`);
    if (res.software === true) out("(a CPU emulating a GPU: these are a software renderer's times and no statement about a graphics card; the rig's run is the answer)");
    for (const name of NETS) { out(""); out(netTable(name, res.nets[name])); }
    const rec = recordOf(res, settings);
    out(""); out(scoreText(rec.score));
    if (write) { const file = path.join(ENG, outFileFor(res.software)); appendFile(file, JSON.stringify(rec) + "\n"); out(`appended the record to ${outFileFor(res.software)}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) command(process.argv.slice(2)).then((c) => { process.exitCode = c; });
