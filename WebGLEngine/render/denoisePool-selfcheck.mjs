// WebGLEngine/render/denoisePool-selfcheck.mjs -- the denoiser arc, round 9
//
// Run: node render/denoisePool-selfcheck.mjs
//
// GATES render/denoisePool.mjs -- several networks trained side by side in worker threads -- and its use by
// render/denoiseStudy.mjs (pre-registration section 28). Its export, named here: trainParallel. What it holds: the
// networks come back BIT FOR BIT as training them one after another gives, in job order; a training that throws in a
// worker throws here, not hangs; and a whole miniature study shaped like round 9 -- the large network, the sign-flip
// test, the small-network comparison -- gives the same result with workers as without, and with workers training only
// the networks a half-filled cache does not hold, as a resumed harvest does.
//
// *** NOTHING HERE RENDERS A DATASET SEED. *** The images are synthetic, or scenes seeded from 975000 up.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//   P1  results placed by worker block, not by job index                         1 RED
//   P2  a worker's failure swallowed: it posts no networks and no reason         1 RED
//   P3  the caller does not wait for a worker's flag                             1 RED (it crashed the gate until the row caught the throw;
//       the first P3, job order reversed inside a worker, is no defect -- results are placed by index -- and was replaced)
//   P4  the study hands the pool every job, not the missing ones                 1 RED (0 until the cache held networks from the MIDDLE
//       of a batch: with only the last one held, the first n jobs were the missing ones by luck)
//   P5  a worker drops a job's size: the small network trained in its place      2 RED

"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { trainParallel } = await imp("render/denoisePool.mjs");
const { INIT, TRAIN } = await imp("render/denoiseNet.mjs");
const { seededRandom } = await imp("brain/convNet.mjs");
const { runStudy, renderSplit } = await imp("render/denoiseStudy.mjs");
const { openCache, hashArrays } = await imp("render/denoiseCache.mjs");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();
const flat = (n) => n.layers.flatMap((L) => [...L.W, ...L.b]);
const sameNet = (a, b) => { const x = flat(a), y = flat(b); return x.length === y.length && x.every((v, i) => Object.is(v, y[i])); };
// two values are the same when every number in them is the same double and every typed array the same kind
function same(a, b) {
    if (typeof a === "number" || typeof b === "number") return Object.is(a, b);
    if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) return a?.constructor === b?.constructor && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
    if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]));
    if (a && b && typeof a === "object" && typeof b === "object") {
        const ka = Object.keys(a).filter((k) => a[k] !== undefined).sort(), kb = Object.keys(b).filter((k) => b[k] !== undefined).sort();
        return ka.join() === kb.join() && ka.every((k) => same(a[k], b[k]));
    }
    return a === b;
}

console.log("1. THE SAME NETWORKS, IN THE SAME ORDER");
{
    // synthetic 10-channel images (mask channel 0), small enough that each training is a few milliseconds
    const r = seededRandom(3), img = () => {
        const x = new Float64Array(16 * 16 * 10), ref = new Float64Array(16 * 16 * 3);
        for (let i = 0; i < x.length; i++) x[i] = r.u();
        for (let p = 0; p < 256; p++) x[p * 10 + 9] = 0;
        for (let i = 0; i < ref.length; i++) ref[i] = r.u();
        return { x, ref, w: 16, h: 16 };
    };
    const set = [img(), img()], other = [img(), img()];
    // four jobs: three seeds and seed 1 again, the large network among them, and a job on another set
    const jobs = [{ set, opts: { seed: 1, init: INIT, head: "kernel", steps: 3, batch: 2, crop: 8 } }, { set, opts: { seed: 2, init: INIT, head: "kernel", steps: 3, batch: 2, crop: 8, size: "large" } },
                  { set: other, opts: { seed: 3, init: INIT, head: "kernel", steps: 3, batch: 2, crop: 8 } }, { set, opts: { seed: 1, init: INIT, head: "kernel", steps: 3, batch: 2, crop: 8 } }];
    const serial = trainParallel(jobs, 0);
    let two = [], many = [], err = null;
    try { two = trainParallel(jobs, 2); many = trainParallel(jobs, 9); } catch (e) { err = e.message; }
    ok("!! *** trained in workers, every network is the serial one bit for bit, in job order -- two workers, or more workers than jobs ***",
        !err && [two, many].every((out) => out.length === 4 && out.every((n, i) => sameNet(n, serial[i]))), err || `${flat(serial[1]).length} weights in the large one`);
    ok("  ...and the jobs really differ, so the order is held, not luck: seeds 1 and 2 and the other set give other weights, seed 1 twice the same",
        !sameNet(serial[0], serial[1]) && !sameNet(serial[0], serial[2]) && sameNet(serial[0], serial[3]) && serial[1].layers.length === 5);
    ok("  a network comes back as a network: Float64Array weights, the head's 81 logits, its activations named", two.every((n) => n.layers.every((L) => L.W instanceof Float64Array && L.b instanceof Float64Array)) &&
        two[0].layers.at(-1).Cout === 81 && two[0].layers[0].act === "relu");
    let threw = null; try { trainParallel([...jobs.slice(0, 2), { set, opts: { seed: 4, init: INIT, head: "kernel", steps: 1, batch: 1, crop: 32 } }], 3); } catch (e) { threw = e.message; }
    ok("!! a training that throws in a worker throws HERE, with the worker's reason -- not a hang, not a missing network", /worker 2: .*at least 32 x 32/.test(threw || ""), threw);
}

console.log("\n2. A WHOLE MINIATURE STUDY, SHAPED LIKE ROUND 9, WITH WORKERS AND WITHOUT");
{
    // the large network trained longer than the small one, the sign-flip test, the small network as the comparison --
    // scenes seeded outside every split
    const MINI9 = {
        splits: { train: { family: "R", seeds: [975000, 975001, 975002] }, val: { family: "R", seeds: [975100] },
                  T1: { family: "R", seeds: [975200, 975201] }, T2: { family: "C", seeds: [975300, 975301] } },
        image: 8, sppIn: 1, sppRef: 16, train: { steps: 4, batch: 1, crop: 8 }, secondarySpp: [], c0: false, head: "kernel", emitterMask: true,
        size: "large", test: "signflip", compareSize: { size: "small", train: { steps: 2, batch: 1, crop: 8 } },
    };
    // the run without workers fills a cache. Then the primary networks of seeds 2 and 3 are taken out of it -- the MIDDLE
    // of their batch, beside seed 1's and C4's second, which stay -- and every shuffled-target and small network; the run
    // with three workers must train exactly those eight and give the same study. The keys are the study's own: a
    // training set's every bit, then the options in the order the study writes them.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "denoisePool-")), stamp = { round: "mini9" };
    try {
        const a = runStudy({ ...MINI9, cache: openCache(dir, stamp) });
        const train = renderSplit(MINI9.splits.train, { harvest: false, image: 8, sppIn: 1, sppRef: 16, ref2: false, emitterMask: true, cache: openCache(dir, stamp) });
        const setKey = hashArrays(train.flatMap((im) => [im.x, im.ref, 8, 8]));
        const primary = (s) => `net-${setKey}-${hashArrays([JSON.stringify({ seed: s, init: INIT, head: "kernel", ...MINI9.train, size: "large" })])}.json`;
        const nets = fs.readdirSync(dir).filter((f) => f.startsWith("net-") && f.endsWith(".json")), keep = new Set([primary(1), primary(1).replace(/\.json$/, "-again.json")]);
        const dropped = nets.filter((f) => !keep.has(f));
        for (const f of dropped) { fs.rmSync(path.join(dir, f)); fs.rmSync(path.join(dir, f.replace(/\.json$/, ".bin"))); }
        const cb = openCache(dir, stamp), b = runStudy({ ...MINI9, cache: cb, workers: 3 });
        ok("!! *** with three workers and a half-filled cache the study is the one without, bit for bit -- verdict, every table, every secondary, C4 ***",
            a.tables !== null && same({ ...a, timings: null }, { ...b, timings: null }) && a.determinism === true && b.determinism === true, `run "${a.verdict.run}"`);
        ok("  ...and the workers trained exactly what was missing: eight networks -- two from the middle of a batch -- beside the two they read back",
            nets.length === 10 && nets.includes(primary(1)) && nets.includes(primary(2)) && dropped.length === 8 && cb.misses === 8,
            `${nets.length} network records; ${cb.misses} trained again, ${cb.hits} read back`);
        const H = a.verdict.hypotheses.H1, S = a.secondary["T1@small"];
        ok("  round 9's plumbing is in it: the tested p is the sign-flip one with the sign test beside it, and the small network's statistics are reported",
            H.test === "signflip" && H.p === H.pSignFlip && typeof H.pSign === "number" && a.config.size === "large" && a.config.test === "signflip" &&
            !!S && S.net.length === 3 && typeof S.p === "number" && typeof S.pSign === "number" && !!a.secondary["T2@small"], `H1 p ${H.p.toFixed(3)} (sign ${H.pSign.toFixed(3)}); small: k ${S.k}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: how much faster it is. That depends on the box's cores; on four, section 28's harvest trains four at once.");
process.exit(fails ? 1 : 0);
