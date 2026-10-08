// WebGLEngine/render/denoiseCache-selfcheck.mjs -- the denoiser arc, round 7
//
// Run: node render/denoiseCache-selfcheck.mjs
//
// GATES render/denoiseCache.mjs -- the checkpoint that lets round 7's harvest, longer than one background run, resume
// where it was stopped (pre-registration section 24). Its exports, each named here: hashArrays, saveRecord, loadRecord,
// openCache, cached. Also held here: render/denoiseStudy.mjs's use of it -- that a study interrupted and resumed from
// its cache gives what the same study run straight through gives, BIT FOR BIT, on a miniature shaped like round 7's
// (family R, the emitter mask, the kernel head, the other-training comparison); that control C4 still compares two
// trainings; and that a scene rendered under --harvest is never served to a run without it.
//
// *** NOTHING HERE RENDERS A DATASET SEED. *** Every scene is seeded from 970000 up. The cache directories are made
// under the system's temporary directory and removed at the end.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//   K1  the render key without --harvest                                         2 RED
//   K2  control C4's second training without its own tag (one record for both)    3 RED
//   K3  a network keyed by its training set alone, not its seed and options       4 RED
//   K4  a training set keyed by its inputs alone, not its references (C2's set     4 RED
//       is then the real one)
//   K12 the render key without the input's samples (the secondaries collide)      4 RED
//   K5  -0 saved untagged, through JSON                                           2 RED
//   K6  a function silently dropped from a record, not refused                    2 RED
//   K7  a short array file read as a record                                       2 RED
//   K8  the key without each array's length (where one ends and the next begins)  2 RED
//   K9  a directory stamped for another run accepted                              2 RED
//   K10 the cache never read: every piece computed again                          5 RED
//   K11 another typed array not refused by name                                   0 RED -- the plain-object rule refuses it too (its
//       prototype is not Object's); with both lines removed, 2 RED. Kept as two lines, each enough alone.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { hashArrays, saveRecord, loadRecord, openCache, cached } = await imp("render/denoiseCache.mjs");
const { runStudy, renderSplit } = await imp("render/denoiseStudy.mjs");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();
const root = fs.mkdtempSync(path.join(os.tmpdir(), "denoiseCache-"));
const dirOf = (name) => path.join(root, name);
const throws = (f) => { try { f(); return false; } catch { return true; } };

// two values are the same when every number in them is the same double (Object.is: -0 is not 0, NaN is NaN) and every
// typed array is the same kind with the same elements
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

console.log("1. A RECORD COMES BACK AS IT WENT");
{
    const odd = Float64Array.of(-0, 0, NaN, Infinity, -Infinity, 5e-324, -1.7976931348623157e308, 0.1 + 0.2, 1 / 3);
    const nanBits = new Float64Array(1); new Uint32Array(nanBits.buffer).set([0x1234, 0x7ff80000]);   // a NaN with a payload
    const rec = { odd, nanBits, empty: new Float64Array(0), n: -0, inf: Infinity, ninf: -Infinity, nan: NaN, tiny: 5e-324, third: 1 / 3,
                  ints: Int32Array.of(-1, 0, 2 ** 31 - 1), bytes: Uint8Array.of(0, 255), s: "kernel", t: true, z: null,
                  nested: [{ W: Float64Array.of(1.5, -0), b: [Float64Array.of(2)], act: "relu" }, [-0, [Infinity]]] };
    saveRecord(dirOf("rt"), "rec-1", rec);
    const back = loadRecord(dirOf("rt"), "rec-1");
    const bits = (a) => Array.from(new Uint32Array(a.buffer, a.byteOffset, a.length * 2)).join();
    ok("!! every number back as the same double -- -0, NaN, the infinities, the smallest subnormal -- in arrays and out of them, and every typed array its own kind",
        back !== null && same(back, rec) && Object.is(back.n, -0) && Object.is(back.nested[1][0], -0) && back.ints instanceof Int32Array && back.bytes instanceof Uint8Array);
    ok("  ...to the bit: a NaN's payload survives, which JSON could never carry", bits(back.nanBits) === bits(nanBits) && bits(back.odd) === bits(odd));
    ok("  a record it could not give back exactly is refused when it is SAVED: another typed array, a function, a Map, a class instance",
        [Float32Array.of(1), () => 1, new Map(), new (class P { constructor() { this.a = 1; } })()].every((v) => throws(() => saveRecord(dirOf("rt"), "bad", { v }))));
    ok("  no record, another key's record, or a torn write (the arrays without the JSON, or a short array file) reads as none", (() => {
        const d = dirOf("torn");
        saveRecord(d, "a", { x: Float64Array.of(1, 2) });
        const missing = loadRecord(d, "b") === null;
        fs.copyFileSync(path.join(d, "a.json"), path.join(d, "b.json")); fs.copyFileSync(path.join(d, "a.bin"), path.join(d, "b.bin"));
        const otherKey = loadRecord(d, "b") === null;
        fs.rmSync(path.join(d, "a.json"));
        const noJson = loadRecord(d, "a") === null;
        saveRecord(d, "c", { x: Float64Array.of(1, 2) }); fs.writeFileSync(path.join(d, "c.bin"), Buffer.alloc(8));
        return missing && otherKey && noJson && loadRecord(d, "c") === null;
    })());
}

console.log("\n2. THE KEY");
{
    const a = Float64Array.of(1, 2, 3), h = hashArrays([a, 4, "net"]);
    const flip = Float64Array.from(a); new Uint32Array(flip.buffer)[0] ^= 1;   // one bit of the first element's mantissa
    const others = [hashArrays([flip, 4, "net"]), hashArrays([Float64Array.of(1, 2, 3), -4, "net"]), hashArrays([a, 4, "nets"]), hashArrays([4, a, "net"]),
                    hashArrays([Float64Array.of(1, 2), Float64Array.of(3), 4, "net"]), hashArrays([Float64Array.of(-0, 2, 3), 4, "net"]), hashArrays([Float64Array.of(0, 2, 3), 4, "net"])];
    ok("!! the same inputs give the same key; one bit, a sign, a letter, the order or where one array ends and the next begins gives another -- and so do -0 and 0",
        /^[0-9a-f]{16}$/.test(h) && h === hashArrays([Float64Array.of(1, 2, 3), 4, "net"]) && new Set([h, ...others]).size === others.length + 1);
    ok("  it hashes only what it can hash exactly: a plain array or a Float32Array is refused", throws(() => hashArrays([[1, 2]])) && throws(() => hashArrays([Float32Array.of(1)])));
}

console.log("\n3. CACHED");
{
    let n = 0;
    const f = () => ({ v: Float64Array.of(++n) });
    const none = [cached(null, "k", f), cached(null, "k", f)];
    ok("  with no cache, every call computes, and nothing is written", n === 2 && none[1].v[0] === 2 && !fs.existsSync(dirOf("k")));
    const c = openCache(dirOf("once"), { round: "mini" });
    const first = cached(c, "k", f), again = cached(c, "k", f), other = cached(c, "k2", f);
    ok("!! with one, each key is computed ONCE and then read back, and the cache counts which", n === 4 && first.v[0] === 3 && again.v[0] === 3 && other.v[0] === 4 &&
        c.hits === 1 && c.misses === 2);
    ok("  a directory stamped for another run is refused -- one round's pieces are never served to another, or one commit's to the next",
        throws(() => openCache(dirOf("once"), { round: "other" })) && !throws(() => openCache(dirOf("once"), { round: "mini" })));
}

console.log("\n4. THE STUDY, INTERRUPTED AND RESUMED");
// a miniature shaped like round 7: training on family R, H2 on family C, the emitter mask, the kernel head, a comparison
// trained on another split, and two secondaries that differ only in their input's samples (round 7's are 1 and 16)
const MINI7 = {
    splits: { train: { family: "R", seeds: [970000, 970001, 970002] }, val: { family: "R", seeds: [970100] },
              T1: { family: "R", seeds: [970200, 970201] }, T2: { family: "C", seeds: [970300, 970301] } },
    image: 8, sppIn: 4, sppRef: 16, train: { steps: 2, batch: 1, crop: 8 }, secondarySpp: [1, 2], c0: false, head: "kernel", emitterMask: true,
    compareTrainSplit: { family: "A", seeds: [970400, 970401] },
};
const outOf = (o) => ({ ...o, timings: null });
{
    const straight = runStudy(MINI7);
    // the interruption: the run is stopped right after its networks are trained, as a background limit would stop it
    const c1 = openCache(dirOf("study"), { round: "mini7" });
    let stopped = false;
    try { runStudy({ ...MINI7, cache: c1, log: (m) => { if (m.startsWith("networks trained")) throw new Error("stopped"); } }); } catch (e) { stopped = e.message === "stopped"; }
    const c2 = openCache(dirOf("study"), { round: "mini7" }), resumed = runStudy({ ...MINI7, cache: c2 });
    const c3 = openCache(dirOf("study"), { round: "mini7" }), whole = runStudy({ ...MINI7, cache: c3 });
    ok("!! a run stopped after training and resumed from its cache gives what the uninterrupted run gives, bit for bit -- verdict, every table, the filter, every secondary, C4, C5",
        stopped && straight.tables !== null && same(outOf(resumed), outOf(straight)), `run "${straight.verdict.run}"`);
    ok("  ...and it RESUMED: the second run read back what the first finished (renders, the filter, four networks) and computed only the rest",
        c1.misses === 9 && c1.hits === 0 && c2.hits === 9 && c2.misses > 0, `stopped run saved ${c1.misses}; resumed read ${c2.hits}, computed ${c2.misses}`);
    ok("  a third run computes nothing, and still gives the same", c3.misses === 0 && c3.hits === c2.hits + c2.misses && same(outOf(whole), outOf(straight)));
    // control C4 compares two trainings of seed 1: in the cache they must be two records, so that a resumed run compares
    // two things that were computed apart. Nudge one weight of the second by one ulp: the resumed run must see it.
    const againFile = fs.readdirSync(dirOf("study")).find((f) => f.endsWith("-again.json"));
    const key = againFile && JSON.parse(fs.readFileSync(path.join(dirOf("study"), againFile), "utf8")).key;
    const net = key && loadRecord(dirOf("study"), key);
    if (net) { const W = net.layers[0].W; W[0] = W[0] + Math.abs(W[0]) * Number.EPSILON || Number.MIN_VALUE; saveRecord(dirOf("study"), key, net); }
    const c4 = openCache(dirOf("study"), { round: "mini7" }), nudged = runStudy({ ...MINI7, cache: c4 });
    ok("!! control C4 still compares two trainings: seed 1's second training is its own record, and one ulp in it turns determinism off",
        net !== null && straight.determinism === true && straight.verdict.controls.C4 === true && nudged.determinism === false && nudged.verdict.controls.C4 === false &&
        nudged.verdict.reasons.some((r) => r.startsWith("C4")));
}
{
    // a scene rendered under --harvest is keyed apart from one rendered without it, so a run without --harvest -- which
    // render/denoiseScenes.mjs refuses for every dataset seed -- is never handed one from the cache
    const split = { family: "R", seeds: [970500, 970501] };
    const c = openCache(dirOf("harvest"), { round: "flag" });
    const withFlag = renderSplit(split, { harvest: true, image: 6, sppIn: 1, sppRef: 2, ref2: false, cache: c });
    const c2 = openCache(dirOf("harvest"), { round: "flag" });
    const without = renderSplit(split, { harvest: false, image: 6, sppIn: 1, sppRef: 2, ref2: false, cache: c2 });
    ok("  a scene rendered under --harvest is never served to a run without it", c.misses === 2 && c2.hits === 0 && c2.misses === 2 && same(withFlag, without));
}

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: the harvest itself. `node tools/denoiseStudy.mjs --harvest-r7 --cache <dir>` is round 7's command, run " +
    "again until it finishes; no gate runs it.");
process.exit(fails ? 1 : 0);
