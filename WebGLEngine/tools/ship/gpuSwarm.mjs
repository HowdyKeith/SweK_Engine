// WebGLEngine/tools/ship/gpuSwarm.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/GPU_SWARM_WIP.md, the gate is tools/ship/gpuSwarm-selfcheck.mjs)
//
// THE GPU PILOT SWARM: N aircraft (the scenarios of brain/flightTask.mjs) flown together with brain/pilotFlightGpu.mjs's flyFleet -- one batched decision a tick -- decided by the CPU twin (brain/pilotFlightMlp.mjs forward, a row at a time)
// and by the GPU brain with its batchCap at N (one dispatch a layer, one read-back a tick). The page times the decision call alone, the whole flight and so the rest (the flight model, the features, the bookkeeping), and compares the two
// swarms; this file turns that into medians, a table, the registered predictions W1 to W5 and the swarm that fits a 30 Hz tick.
//   node tools/ship/gpuSwarm.mjs                          the sizes 64 to 8192, 3 rounds, 3 s a swarm
//   node tools/ship/gpuSwarm.mjs --write                  and appends the record: a SOFTWARE adapter's to brain/gpuSwarmSoftware.jsonl, a real adapter's to brain/rig-results/gpuSwarm.jsonl
//   node tools/ship/gpuSwarm.mjs --sizes 1024,4096 --rounds 1 --seconds 1      a quick look
//   node tools/ship/gpuSwarm.mjs --hardware --write       ASKS THE BROWSER FOR THE CARD (webgpuHarness HARDWARE_ARGS); an ordinary run on win32 asks for SwiftShader on purpose, so a rig run needs --hardware
// *** EVERY DEVICE THIS SANDBOX HAS IS SWIFTSHADER, A CPU RASTERISER: a swarm timed on it is a SOFTWARE ADAPTER'S and says nothing about a graphics card. The record names the adapter and the printout says SOFTWARE ADAPTER when it is one. ***
// The Node side is pure apart from the page it launches and the file --write appends to. No Math.random; the scenarios are the library's (seeded), the weights are the hand weights.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin } from "./webgpuHarness.mjs";
import { median, launchArgsOf, TOL } from "./gpuCrossover.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
export { median, launchArgsOf, TOL };
export const SIZES = Object.freeze([64, 256, 1024, 2048, 4096, 8192]);
export const DEFAULTS = Object.freeze({ rounds: 3, seconds: 3, warmup: 16 });
export const TICK_MS = 1000 / 30;   // a 30 Hz tick
export const THRESH = Object.freeze({ sameStatus: 0.99, sameAltitude: 0.95, altitudeTol: 1, flat: 1.5, perRowDrop: 3, share: 0.6, wholeSpeedup: 2.5, bigFrom: 1024, win: 4096, small: 64 });
export const OUT_SOFTWARE = "brain/gpuSwarmSoftware.jsonl", OUT_RIG = "brain/rig-results/gpuSwarm.jsonl";
export const MAX_SIZE = 8192;
/** Where a record is appended: a software adapter's record can never land in the rig's file (an adapter of unknown kind goes to the software file too). */
export const outFileFor = (software) => (software === false ? OUT_RIG : OUT_SOFTWARE);

/** A list of controls ({ pitch, roll, yaw, throttle } for each aircraft) as a flat list of numbers, four an aircraft in that order. */
export const flatControls = (list) => list.flatMap((c) => [c.pitch, c.roll, c.yaw, c.throttle]);
/** The worst difference per control between two flat lists of controls (pitch, roll, yaw, throttle for each aircraft in turn): { worst, by: [pitch, roll, yaw, throttle] }. Lists of different lengths, a non-finite number or no aircraft at all are NOT a parity: worst is Infinity for the first two and NaN for none. */
export function parityOf(a, b) {
    const by = [0, 0, 0, 0];
    if (a.length !== b.length || a.length % 4 !== 0) return { worst: Infinity, by: [Infinity, Infinity, Infinity, Infinity] };
    if (!a.length) return { worst: NaN, by: [NaN, NaN, NaN, NaN] };
    for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); by[i % 4] = Number.isFinite(d) ? Math.max(by[i % 4], d) : Infinity; }
    return { worst: Math.max(...by), by };
}
/** How alike two swarms ended, aircraft by aircraft: { sameStatus (share ending in the same status), sameAltitude (share whose final altitudes are within `tol` m) }. Lists of different lengths or no aircraft give NaN for both. */
export function agreementOf(statusA, statusB, altA, altB, tol = THRESH.altitudeTol) {
    const n = statusA.length;
    if (!n || statusB.length !== n || altA.length !== n || altB.length !== n) return { sameStatus: NaN, sameAltitude: NaN };
    let alike = 0, near = 0;
    for (let i = 0; i < n; i++) { if (statusA[i] === statusB[i]) alike++; if (Math.abs(altA[i] - altB[i]) <= tol) near++; }
    return { sameStatus: alike / n, sameAltitude: near / n };
}
/** How many different aircraft a flat list of controls describes (distinct tuples of four): a swarm of one scenario repeated would say 1. */
export function distinctOf(flat) {
    const seen = new Set();
    for (let i = 0; i + 3 < flat.length; i += 4) seen.add(`${flat[i]},${flat[i + 1]},${flat[i + 2]},${flat[i + 3]}`);
    return seen.size;
}
/**
 * The rows of a run from the page's raw rounds. Per size: the medians over the rounds of the whole flight and of the decision call (ms) for each decider, the swarm's ticks (the decisions asked for) and rows, and from them:
 * the per-tick times, the physics (whole less decision), the decision's share of the CPU-decided tick, the speedups of the decision call and of the whole tick (CPU over GPU), the first-tick parity and the share of aircraft that end alike.
 */
export function rowsOf(raw) {
    return raw.map((r) => {
        const side = (x) => ({ whole: median(x.map((q) => q.whole)), decision: median(x.map((q) => q.decision)), ticks: median(x.map((q) => q.calls)), rows: median(x.map((q) => q.rows)) });
        const c = side(r.cpu), g = side(r.gpu), t = (s) => s.whole / s.ticks, d = (s) => s.decision / s.ticks, fc = flatControls(r.firstCpu), par = parityOf(fc, flatControls(r.firstGpu)), agr = agreementOf(r.statusCpu, r.statusGpu, r.altCpu, r.altGpu);
        return {
            n: r.n, rounds: Math.min(r.cpu.length, r.gpu.length), ticks: c.ticks, cpuRows: c.rows, gpuRows: g.rows, cpuWholeMs: c.whole, gpuWholeMs: g.whole, cpuDecisionMs: c.decision, gpuDecisionMs: g.decision,
            cpuTickMs: t(c), gpuTickMs: t(g), cpuDecisionTickMs: d(c), gpuDecisionTickMs: d(g), cpuPhysicsTickMs: t(c) - d(c), gpuPhysicsTickMs: t(g) - d(g),
            cpuDecisionUs: (1000 * c.decision) / c.rows, gpuDecisionUs: (1000 * g.decision) / g.rows, share: c.decision / c.whole, decisionSpeedup: c.decision / g.decision, wholeSpeedup: c.whole / g.whole,
            parityFirst: par.worst, parityBy: par.by, inputsIdentical: Number.isInteger(r.rowsHashCpu) && r.rowsHashCpu === r.rowsHashGpu && r.rowsHashCpu !== r.rowsHashControl, distinct: distinctOf(fc), kindsFlown: new Set(r.kinds).size, aircraft: r.statusCpu.length, sameStatus: agr.sameStatus, sameAltitude: agr.sameAltitude, dispatches: r.dispatches === undefined ? null : r.dispatches,
        };
    });
}
/** The largest size whose tick fits `limit` ms under `key` ("cpuTickMs" or "gpuTickMs"); null when none does. */
export function largestInTick(rows, key, limit = TICK_MS) {
    let best = null;
    for (const r of rows) if (Number.isFinite(r[key]) && r[key] <= limit && (best === null || r.n > best)) best = r.n;
    return best;
}
const ratioOf = (xs) => Math.max(...xs) / Math.min(...xs);
/**
 * The registered predictions W1 to W5 (brain/GPU_SWARM_WIP.md) from the rows and whether the adapter was software (true), a card (false) or unknown (null): { wN: true | false | null (cannot be read) }. W6 is the table.
 * W1 every first-tick control within TOL. W2 at every size the share ending in the same status is at least THRESH.sameStatus and the share within THRESH.altitudeTol m of the same altitude at least THRESH.sameAltitude.
 * W3 the CPU's decision time per row from THRESH.bigFrom rows up is flat (largest over smallest within THRESH.flat) and the GPU's per row at the largest size flown is at most 1/perRowDrop of what it is at the smallest size of 256 rows or more.
 * W4 on a card: the GPU decides faster than the CPU at THRESH.win rows and at the largest size, and slower at THRESH.small; on a software adapter: slower at every size. W5 from THRESH.bigFrom rows up the decision is at most THRESH.share of the CPU-decided flight, and at every size the whole-flight speedup is below THRESH.wholeSpeedup.
 */
export function score(rows, software) {
    const w = {}, at = (n) => rows.find((r) => r.n === n), big = rows.filter((r) => r.n >= THRESH.bigFrom);
    w.w1 = rows.length ? rows.every((r) => r.inputsIdentical === true && r.parityFirst <= TOL) : null;
    w.w2 = rows.length ? rows.every((r) => r.sameStatus >= THRESH.sameStatus && r.sameAltitude >= THRESH.sameAltitude) : null;
    const lo = rows.filter((r) => r.n >= 256).sort((p, q) => p.n - q.n)[0], hi = rows.reduce((b, r) => (b === null || r.n > b.n ? r : b), null);
    w.w3 = big.length >= 2 ? ratioOf(big.map((r) => r.cpuDecisionUs)) <= THRESH.flat && hi.gpuDecisionUs <= lo.gpuDecisionUs / THRESH.perRowDrop : null;
    const big4 = at(THRESH.win), small = at(THRESH.small), top = hi;
    w.w4 = software === null || software === undefined ? null : software ? (rows.length ? rows.every((r) => r.gpuDecisionTickMs > r.cpuDecisionTickMs) : null) : big4 && small && top ? big4.gpuDecisionTickMs < big4.cpuDecisionTickMs && top.gpuDecisionTickMs < top.cpuDecisionTickMs && small.gpuDecisionTickMs > small.cpuDecisionTickMs : null;
    w.w5 = big.length ? big.every((r) => r.share <= THRESH.share) && rows.every((r) => r.wholeSpeedup < THRESH.wholeSpeedup) : null;
    return w;
}
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(v < 10 ? 2 : 1) : "n/a");
const f3 = (v) => (Number.isFinite(v) ? (v !== 0 && Math.abs(v) < 0.01 ? v.toExponential(1) : v.toFixed(v < 10 ? 3 : 1)) : "n/a");
const sci = (v) => (Number.isFinite(v) ? v.toExponential(1) : "n/a");
const pc = (v) => (Number.isFinite(v) ? (100 * v).toFixed(1) + "%" : "n/a");
/** The printed table: per size the decision call and the whole tick under each decider, in ms a tick, with the ratios, the share and the agreement. */
export function table(rows) {
    const lines = ["swarm flown by flyFleet (one batched decision a tick); ms a TICK, medians of the rounds; speedup = CPU-decided over GPU-decided", "       N | ticks | decision CPU | decision GPU | CPU/GPU | rest of tick (CPU run) | tick CPU | tick GPU | tick CPU/GPU | decision share (CPU) | first-tick parity | same status | same altitude"];
    for (const r of rows) lines.push(`${String(r.n).padStart(8)} | ${String(r.ticks).padStart(5)} | ${f3(r.cpuDecisionTickMs).padStart(12)} | ${f3(r.gpuDecisionTickMs).padStart(12)} | ${f2(r.decisionSpeedup).padStart(7)} | ${f3(r.cpuPhysicsTickMs).padStart(22)} | ${f3(r.cpuTickMs).padStart(8)} | ${f3(r.gpuTickMs).padStart(8)} | ${f2(r.wholeSpeedup).padStart(12)} | ${pc(r.share).padStart(20)} | ${(sci(r.parityFirst) + (r.parityFirst > TOL ? " OVER" : "")).padStart(17)} | ${pc(r.sameStatus).padStart(11)} | ${pc(r.sameAltitude).padStart(13)}`);
    const a = largestInTick(rows, "cpuTickMs"), b = largestInTick(rows, "gpuTickMs"), s = (v) => (v === null ? "none of the sizes flown" : `${v} aircraft`);
    lines.push(`largest swarm whose tick fits ${TICK_MS.toFixed(1)} ms (30 Hz): CPU-decided ${s(a)}; GPU-decided ${s(b)}`);
    return lines.join("\n");
}
/** The predictions block. */
export function scoreText(w, software) {
    const y = (v) => (v === null ? "cannot be read" : v ? "HELD" : "MISSED");
    return [`W1 the GPU's controls on the first tick (the same inputs, checked) are within ${TOL} of the CPU twin's at every size: ${y(w.w1)}`, `W2 at every size at least ${pc(THRESH.sameStatus)} of the aircraft end in the same status and at least ${pc(THRESH.sameAltitude)} within ${THRESH.altitudeTol} m of the same altitude: ${y(w.w2)}`,
        `W3 the CPU's decision time per row is flat from ${THRESH.bigFrom} rows up (within ${THRESH.flat}) and the GPU's per row at the largest size is at most 1/${THRESH.perRowDrop} of what it is at the smallest size of 256 rows or more: ${y(w.w3)}`,
        software === false ? `W4 (a card) the GPU decides faster than the CPU twin at ${THRESH.win} rows and at the largest size and slower at ${THRESH.small}: ${y(w.w4)}` : `W4 (${software === true ? "a software adapter" : "an adapter of unknown kind"}) the GPU decides slower than the CPU twin at every size: ${y(w.w4)}`,
        `W5 from ${THRESH.bigFrom} rows up the decision is at most ${pc(THRESH.share)} of the CPU-decided flight, and at every size the whole-flight speedup is below ${THRESH.wholeSpeedup}: ${y(w.w5)}`].join("\n");
}
/** The record --write appends: the adapter, the settings, the rows and the score. */
export function recordOf(res, settings) {
    return { adapter: res.adapter, software: res.software, launchArgs: res.launchArgs || null, settings, rows: res.rows, score: score(res.rows, res.software) };
}

// ---- the page --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const PAGE_SCRIPT = `async (a) => {
    const { requestDevice } = await import("/gfx/device.js");
    const G = await import("/brain/pilotFlightGpu.mjs"), M = await import("/brain/pilotFlightMlp.mjs"), T = await import("/brain/flightTask.mjs");
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
    const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
    if (!dev.gpu) return { noGpu: dev.backend };
    const out = { backend: dev.backend };
    try { out.adapterInfo = dev.adapterInfo || null; } catch (e) { out.adapterInfo = null; }
    const w = M.handWeights(), scen = (n, at = 0) => Array.from({ length: n }, (_, i) => T.scenario(at + i + 1, T.KINDS[i % 3]));
    const cpuDecide = (rows) => rows.map((r) => M.forward(w, r));
    const swarm = async (inner, n, seconds, seedAt = 0) => {
        const acc = { decision: 0, rows: 0, calls: 0, first: null, firstRows: null };
        const decide = async (rows) => { const t0 = performance.now(); const o = await inner(rows); acc.decision += performance.now() - t0; acc.rows += rows.length; acc.calls++; if (acc.first === null) { acc.first = o; acc.firstRows = rows.map((r) => Array.from(r)); } return o; };
        const sc = scen(n, seedAt), t0 = performance.now(), res = await G.flyFleet(decide, sc, { seconds });
        return { whole: performance.now() - t0, decision: acc.decision, rows: acc.rows, calls: acc.calls, first: acc.first, firstRows: acc.firstRows, res };
    };
    const warm = await swarm(cpuDecide, a.warmup, 1);
    out.warm = { aircraft: a.warmup, ticks: warm.calls, rows: warm.rows };
    const fnv = (rows) => { let h = 0x811c9dc5; const buf = new Float64Array(1), u = new Uint32Array(buf.buffer); for (const r of rows) for (const v of r) { buf[0] = v; h = Math.imul(h ^ u[0], 16777619); h = Math.imul(h ^ u[1], 16777619); } return h >>> 0; };
    const sizes = [];
    for (const n of a.sizes) {
        const brain = new G.GpuPilotBrain(dev.gpu, w, { batchCap: n });
        await brain.decide(Array.from({ length: Math.min(16, n) }, () => new Array(M.FEATURES).fill(0)));
        const gpuDecide = (rows) => brain.decide(rows), cpu = [], gpu = [];
        let last = null;
        for (let r = 0; r < a.rounds; r++) {
            const c = await swarm(cpuDecide, n, a.seconds), g = await swarm(gpuDecide, n, a.seconds);
            cpu.push({ whole: c.whole, decision: c.decision, rows: c.rows, calls: c.calls }); gpu.push({ whole: g.whole, decision: g.decision, rows: g.rows, calls: g.calls });
            last = { c, g };
        }
        const ctl = await swarm(cpuDecide, n, 1 / 30, 100000);
        sizes.push({ n, cpu, gpu, firstCpu: last.c.first, firstGpu: last.g.first, rowsHashCpu: fnv(last.c.firstRows), rowsHashGpu: fnv(last.g.firstRows), rowsHashControl: fnv(ctl.firstRows), kinds: last.c.res.map((x) => x.kind), statusCpu: last.c.res.map((x) => x.status), statusGpu: last.g.res.map((x) => x.status), altCpu: last.c.res.map((x) => x.final.alt), altGpu: last.g.res.map((x) => x.final.alt), dispatches: brain.dispatches });
    }
    out.sizes = sizes;
    return out;
}`;

/** Measure on the device the harness gives: { ok, skipped, reason, adapter, software, launchArgs, rows }. `run` is the harness (the gate hands in a stand-in); `settings` { sizes, rounds, seconds, warmup }. */
export async function measure(settings, run = runInEngineOrigin, { hardware = false } = {}) {
    const launchArgs = launchArgsOf(hardware), r = await run({ engineRoot: ENG, script: PAGE_SCRIPT, args: { ...settings, altTol: THRESH.altitudeTol }, timeoutMs: 1800000, ...(hardware ? { launchArgs } : {}) });
    if (r.skipped) return { ok: false, skipped: true, reason: r.reason };
    if (!r.ok || !r.result) return { ok: false, skipped: false, reason: r.reason || (r.result && r.result.error) || "the page did not answer" };
    if (r.result.noGpu !== undefined) return { ok: false, skipped: false, reason: "no GPU in the page (backend " + r.result.noGpu + ")" };
    return { ok: true, adapter: r.adapter || null, software: r.software === undefined ? null : r.software, launchArgs, rows: rowsOf(r.result.sizes), warm: r.result.warm || null, pageErrors: r.pageErrors || [] };
}

/** The command as a function: returns the exit code (0 fine, 1 no measurement, 2 a bad argument). `io` is for the gate: { out, err, run, appendFile }. */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), appendFile = io.appendFile || fs.appendFileSync;
    const settings = { sizes: [...SIZES], rounds: DEFAULTS.rounds, seconds: DEFAULTS.seconds, warmup: DEFAULTS.warmup }; let write = false, hardware = false;
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--write") write = true;
        else if (a === "--hardware") hardware = true;
        else if (a === "--sizes") {
            const v = String(argv[++i] || "").split(",").map(Number);
            if (!v.length || v.some((x) => !Number.isInteger(x) || x < 1 || x > MAX_SIZE) || new Set(v).size !== v.length) { err(`gpuSwarm: --sizes needs distinct whole numbers from 1 to ${MAX_SIZE}, comma separated`); return 2; }
            settings.sizes = v.slice().sort((p, q) => p - q);
        } else if (a === "--rounds" || a === "--seconds") {
            const v = Number(argv[++i]);
            if (!Number.isInteger(v) || v <= 0) { err(`gpuSwarm: ${a} needs a positive whole number`); return 2; }
            settings[a.slice(2)] = v;
        } else { err(`gpuSwarm: unknown argument ${JSON.stringify(a)}`); return 2; }
    }
    const res = await measure(settings, io.run || runInEngineOrigin, { hardware });
    if (!res.ok) { err(`gpuSwarm: ${res.skipped ? "skipped" : "no measurement"}: ${res.reason}`); return 1; }
    const ad = res.adapter;
    out(`${res.software === true ? "*** SOFTWARE ADAPTER *** " : res.software === false ? "hardware adapter: " : "adapter of unknown kind: "}${ad ? [ad.vendor, ad.architecture, ad.device, ad.description].filter(Boolean).join(" ") : "not described"}`);
    if (res.software === true) out(`(a CPU emulating a GPU: these are a software renderer's times and no statement about a graphics card; the rig's run is the answer${hardware ? "" : "; on a machine with a card, run again with --hardware to ask the browser for it"})`);
    out(""); out(table(res.rows));
    const rec = recordOf(res, settings);
    out(""); out(scoreText(rec.score, res.software));
    if (write) { const file = path.join(ENG, outFileFor(res.software)); appendFile(file, JSON.stringify(rec) + "\n"); out(`appended the record to ${outFileFor(res.software)}`); }
    return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) command(process.argv.slice(2)).then((c) => { process.exitCode = c; });
