#!/usr/bin/env node
// WebGLEngine/tools/ship/foldStats-selfcheck.mjs -- v4698: the pre-registered statistic and runner, on SYNTHETIC
// data only, in the round that declares them.
//
// *** NO FSR DATA IS READ OR PRODUCED HERE. *** render/learned-folds-preregistration.md fixes the analysis
// before the four new scenes have been harvested. This gate proves the analysis does what the document says
// -- on scenes made up for the purpose -- so the next round's measurement is the document's and not a choice
// made after looking. Run: node tools/ship/foldStats-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PREREG, ARMS, declared, seededRng, minFoldsFor, usableFolds, foldMean, h4, c11 } from "./foldStats.mjs";
import { jointRows, runFolds, shuffled } from "./genGateFolds.mjs";
import { train } from "./genGateTrain.mjs";
import { N_FEATURES, N_FEATURES_V2, HIDDEN, auc, fitScaler } from "../../render/genGate.mjs";
import { MLPTrainer } from "../../brain/learn.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };

console.log("foldStats-selfcheck -- the seven-fold statistic, declared and proven before any fold is run\n");

console.log("1. *** THE CONSTANTS ARE THE DOCUMENT'S, AND THE ONE THAT CAN BE DERIVED IS ***");
const d = declared();
const docText = fs.readFileSync(path.join(ENG, PREREG), "utf8");
{
    const derived = minFoldsFor(d.alpha);
    ok("*** minFolds is DERIVED from alpha by the sign test, and the document agrees with the derivation ***",
       d.minFolds === derived && derived === 5,
       `declared ${d.minFolds}, derived ${derived}: at alpha ${d.alpha} the one-sided exact sign test reaches 1/32 at five ` +
       "and only 1/16 at four. A declared minimum the arithmetic contradicts would be a fold count nothing could clear.");
    const html = fs.readFileSync(path.join(ENG, "fsr.html"), "utf8");
    const m = /<select id="scene">([\s\S]*?)<\/select>/.exec(html);
    const page = m ? [...m[1].matchAll(/<option value="(\w+)">/g)].map((x) => x[1]) : [];
    const missing = d.scenes.filter((s) => !page.includes(s)), extra = page.filter((s) => !d.scenes.includes(s));
    ok("*** the declared scenes and the page's scene list are THE SAME SET, in both directions ***",
       !missing.length && !extra.length && d.scenes.length === 7,
       missing.length || extra.length ? `declared-not-on-page: ${missing.join(",") || "none"}; on-page-not-declared: ${extra.join(",") || "none"}`
       : `${d.scenes.length} of ${page.length}. A scene the page gains after this document would silently drop out of "leave one scene out" -- which is what happened to v4696's own scene-list row the round v4697 landed.`);
    ok("*** the declared width is the width render/genGate.mjs builds ***", d.hidden === HIDDEN,
       `hidden ${d.hidden} vs HIDDEN ${HIDDEN}. The GPU runner and the parity control are built at HIDDEN; a fold trained at another width would not be the network they check.`);
    ok("*** declared() refuses a document missing a key, carrying one nothing reads, or declaring one twice ***",
       throws(() => declared(docText.replace(/^minFolds = .*\n/m, "")), /does not declare "minFolds"/) &&
       throws(() => declared(docText.replace("alpha = 0.05", "alpha = 0.05\nbudget = 9")), /not a declared key/) &&
       throws(() => declared(docText.replace("alpha = 0.05", "alpha = 0.05\nalpha = 0.1")), /declared twice/) &&
       throws(() => declared("no block here"), /no ```declared block/),
       "four refusals, each with its own message -- a parser that silently defaulted a missing threshold would be the restated constant v4691 and v4693 both paid for.");
}

console.log("\n2. *** THE SEED SEEDS -- WHICH IT DID NOT BEFORE THIS ROUND ***");
{
    const mk = (seed) => { const r = seededRng(seed);
        return [{ nIn: 3, nOut: 4, W: Float32Array.from({ length: 12 }, () => r() - 0.5), b: new Float32Array(4) },
                { nIn: 4, nOut: 1, W: Float32Array.from({ length: 4 }, () => r() - 0.5), b: new Float32Array(1) }]; };
    const go = (initSeed, rng) => { const L = mk(initSeed);
        const t = new MLPTrainer(L, { lr: 0.05, batch: 32, minBuffer: 8, bufferCap: 1000, ...(rng ? { rng } : {}) });
        for (let i = 0; i < 200; i++) t.buffer.push({ x: Float32Array.from([i / 200, (i % 7) / 7, (i % 3) / 3]), r: i % 2, w: 1 });
        for (let s = 0; s < 100; s++) t.step();
        return [...L[0].W, ...L[1].W]; };
    const same = (a, b) => a.every((v, i) => v === b[i]);
    const a = go(7, seededRng(11)), b = go(7, seededRng(11)), c = go(7, seededRng(12));
    ok("*** same init seed AND same sampler seed -> bit-identical weights ***", same(a, b), `${a.length} of ${a.length} weights equal`);
    ok("...and a different sampler seed with the SAME init moves them, so the sampler is really being consulted",
       !same(a, c), `${a.filter((v, i) => v !== c[i]).length} of ${a.length} differ`);
    const u = go(7), v = go(7);
    ok("*** with NO rng the trainer still draws from Math.random -- the live brain is unchanged ***", !same(u, v),
       "same init, no rng passed, two runs differ -- which is exactly the behaviour every brain/brain.js caller had and still has, and exactly the behaviour the learned-gate rounds mistook for seeded.");
    const real = Math.random;
    let calls = 0;
    const L = mk(1), t = new MLPTrainer(L, { minBuffer: 1, batch: 4 });
    t.buffer.push({ x: Float32Array.from([1, 0, 0]), r: 1, w: 1 });
    Math.random = () => { calls++; return 0; };
    try { t.step(); } finally { Math.random = real; }
    ok("...and the default looks Math.random up at CALL time, so a gate that swaps it after construction still reaches the sampler",
       calls === 4, `${calls} of 4 draws went to the swapped Math.random; capturing it in the constructor would have made that 0.`);
    // *** THE ONE STATE THAT MATTERS IS SOLVED FOR, NOT SAMPLED FOR. *** A draw of exactly 1 needs the LCG state
    // 0x7fffffff, one state in 2^31; 200,000 random draws would almost surely never visit it, and a row built on
    // them could not tell a half-open generator from a closed one. The multiplier is odd, so it is invertible
    // mod 2^31, and the seed whose FIRST draw lands on that state is computed.
    const M = 1n << 31n, A = 1103515245n, C = 12345n;
    const inv = (a, m) => { let [r0, r1, s0, s1] = [a, m, 1n, 0n]; while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; } return ((s0 % m) + m) % m; };
    const edge = Number((((0x7fffffffn - C) % M + M) % M * inv(A, M)) % M);
    const first = seededRng(edge)();
    const r = seededRng(3); let mx = 0, mn = 1;
    for (let i = 0; i < 200000; i++) { const x = r(); if (x > mx) mx = x; if (x < mn) mn = x; }
    ok("*** seededRng is HALF-OPEN -- at the one state where a closed generator returns exactly 1, it does not ***",
       edge > 0 && first < 1 && first > 0.9999999 && mx < 1 && mn >= 0,
       `seed ${edge} puts the first draw on state 0x7fffffff: ${first}. Dividing by 0x7fffffff there gives 1, and ` +
       "buffer[(1 * n) | 0] is one past the end -- the LCG the learned-gate tools used did exactly that.");
}
{
    let s = 99; const r = () => ((s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x80000000);
    const rowsTyped = [], rowsPlain = [];
    for (let f = 0; f < 3; f++) { const nb = 100, x = new Float32Array(nb * N_FEATURES), y = new Uint8Array(nb);
        for (let b = 0; b < nb; b++) { for (let k = 0; k < N_FEATURES; k++) x[b * N_FEATURES + k] = r() * 2 - 1; y[b] = x[b * N_FEATURES] > 0 ? 1 : 0; }
        rowsTyped.push({ x, y }); rowsPlain.push({ x: Array.from(x), y: Array.from(y) }); }
    const a = train(rowsPlain, { seed: 5, steps: 200 }), b = train(rowsPlain, { seed: 5, steps: 200 });
    let c = null, cErr = "";
    try { c = train(rowsTyped, { seed: 5, steps: 200 }); } catch (e) { cErr = String(e.message).slice(0, 120); }
    const w = (m) => [...m.layers[0].W, ...m.layers[1].W];
    ok("*** genGateTrain.train with the same seed twice gives the same network -- the sentence in its comment is true now ***",
       w(a).every((v, i) => v === w(b)[i]), `${w(a).length} weights compared`);
    ok("*** ...and TYPED-array rows train the SAME network as plain ones, not a constant one ***",
       c !== null && w(c).every((v, i) => v === w(a)[i]),
       (cErr ? `threw: ${cErr}. ` : "") + "`.flat()` does not flatten a Float32Array, so typed rows used to become one NaN apiece: every ReLU dead, only the output bias training, no error raised.");
    ok("...and a NaN feature is REFUSED rather than trained into a constant network",
       throws(() => train([{ x: [NaN, ...Array(N_FEATURES - 1).fill(0)], y: [1] }], { seed: 1, steps: 1 }), /non-finite/));
}

console.log("\n3. *** THE RUNNER, OVER SEVEN MADE-UP SCENES ***");
const synth = (() => {
    let s = 2024; const r = () => ((s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x80000000);
    const by = {};
    d.scenes.forEach((sc, k) => {
        const frames = [];
        for (let f = 0; f < 2; f++) { const nb = 48, x = [], x2 = [], y = [];
            for (let b = 0; b < nb; b++) { const lab = r() < 0.3 + 0.06 * k ? 1 : 0; y.push(lab);
                for (let j = 0; j < N_FEATURES; j++) x.push(r() + (j === 0 ? 0.8 * lab : 0) + 0.3 * k);
                for (let j = 0; j < N_FEATURES_V2; j++) x2.push(r() + (j === 0 ? 0.8 * lab : 0)); }
            frames.push({ scene: sc, x, x2, y }); }
        by[sc] = frames; });
    return by;
})();
const dSmall = Object.freeze({ ...d, steps: 60, seeds: Object.freeze([1, 2]) });
const t0 = Date.now();
const run1 = runFolds(synth, dSmall), run2 = runFolds(synth, dSmall);
say(`two full runs, 7 folds x ${ARMS.length} arms x ${dSmall.seeds.length} seeds at ${dSmall.steps} steps, in ${Date.now() - t0} ms -- the declared ${d.steps} steps and ${d.seeds.length} seeds are the next round's`);
{
    ok("*** C5: no fold's training set contains the scene it scores, read off the runner's own record ***",
       d.scenes.every((h) => !run1.trainedOn[h].includes(h) && run1.trainedOn[h].length === d.scenes.length - 1),
       `${d.scenes.length} folds, each trained on ${d.scenes.length - 1}. The record is written by the loop that trained, not inferred from its source text.`);
    const same = (a, b) => a.length === b.length && Array.from(a).every((v, i) => v === b[i]);
    const scOk = d.scenes.every((h) => {
        const tr = jointRows(d.scenes.filter((s) => s !== h).flatMap((s) => synth[s])), te = jointRows(synth[h]);
        const want1 = fitScaler(tr.x1), want2 = fitScaler(tr.x2), heldSc = fitScaler(te.x2);
        const got = run1.scalers[h];
        return same(got.v1.mean, want1.mean) && same(got.v1.sd, want1.sd) && same(got.v2.mean, want2.mean) &&
               same(got.v2.sd, want2.sd) && !same(got.v2.mean, heldSc.mean);
    });
    ok("*** C5, the scaler's half: every fold's scaler is bit-identical to one fitted on its TRAINING rows, and not its held-out ones ***",
       scOk, "the pre-registration names the scaler and the weights both; the first draft of this gate checked the scenes alone, and a scaler fitted on held-out rows sailed through it. Recomputed here from the rows, not read off the code.");
    ok("*** C12 in miniature: the whole runner reproduces bit for bit ***",
       JSON.stringify(run1.results) === JSON.stringify(run2.results),
       `${d.scenes.length * ARMS.length * dSmall.seeds.length} AUCs, identical across two runs. Before this round, two runs of v4696's loop could not have agreed.`);
    const differ = d.scenes.some((h) => run1.results[h].SHUF_A.some((v, i) => v !== run1.results[h].SHUF_B[i]));
    const yA = shuffled(Uint8Array.from([1, 1, 1, 0, 0, 0, 0, 0]), 1, "SHUF_A"), yB = shuffled(Uint8Array.from([1, 1, 1, 0, 0, 0, 0, 0]), 1, "SHUF_B");
    ok("*** the two shuffled arms are DIFFERENT permutations of the SAME labels ***",
       differ && yA.join() !== yB.join() && yA.reduce((a, v) => a + v, 0) === 3 && yB.reduce((a, v) => a + v, 0) === 3,
       `A ${yA.join("")} vs B ${yB.join("")}, both keeping three positives. If the streams coincided C11 would compare an arm with itself and could never fire.`);
    ok("*** V2 on a real within-scene signal scores above its shuffled twin on every fold -- the runner can SEE signal ***",
       d.scenes.every((h) => foldMean(run1.results[h].V2) > foldMean(run1.results[h].SHUF_A)),
       d.scenes.map((h) => `${h} ${foldMean(run1.results[h].V2).toFixed(2)}/${foldMean(run1.results[h].SHUF_A).toFixed(2)}`).join("  "));
    const jr = jointRows([{ y: [1, 0, 1],
        x: [...Array(N_FEATURES).fill(1), ...Array(N_FEATURES).fill(1), ...Array(N_FEATURES).fill(NaN)],
        x2: [...Array(N_FEATURES_V2).fill(1), ...Array(N_FEATURES_V2).fill(NaN), ...Array(N_FEATURES_V2).fill(1)] }]);
    ok("*** a block non-finite in EITHER set is dropped from BOTH, so every arm scores one population ***",
       jr.n === 1 && jr.x1.length === N_FEATURES && jr.x2.length === N_FEATURES_V2,
       "block 1 bad in v2 only, block 2 bad in v1 only, both gone from both -- the fixture holds the two cases that per-set filtering gets wrong.");
}

console.log("\n4. *** THE STATISTIC: CONTROL C10, AND THE PRICE OF SEVEN FOLDS ***");
const seeds3 = [1, 2, 3];
function world({ signal = 0, reverse = null, prior = (k) => 0.2 + 0.1 * k, band = null, shufArtefact = 0, n = 800 }) {
    const results = {}, meta = {}, pooled = { s: [], y: [] };
    d.scenes.forEach((f, k) => {
        results[f] = Object.fromEntries(ARMS.map((a) => [a, []]));
        for (const sd of seeds3) {
            const r = seededRng(1000 * k + sd), y = new Uint8Array(n), base = new Float32Array(n), other = new Float32Array(n);
            for (let i = 0; i < n; i++) { y[i] = r() < prior(k) ? 1 : 0; base[i] = r(); other[i] = r(); }
            const sgn = f === reverse ? -1 : 1;
            const v2 = base.map((v, i) => v + (band ? band(k) : 0) + sgn * signal * y[i]);
            results[f].V2.push(auc(v2, y).auc);
            results[f].V1.push(auc(base, y).auc);
            results[f].SHUF_A.push(auc(base.map((v, i) => v + shufArtefact * y[i]), y).auc);
            results[f].SHUF_B.push(auc(other, y).auc);
            if (sd === 1) for (let i = 0; i < n; i++) { pooled.s.push(v2[i]); pooled.y.push(y[i]); }
            const pos = y.reduce((a, v) => a + v, 0); meta[f] = { n, pos, neg: n - pos };
        }
    });
    return { results, meta, pooled: auc(Float32Array.from(pooled.s), Uint8Array.from(pooled.y)).auc };
}
{
    const trap = world({ band: (k) => 2 * (0.2 + 0.1 * k) });
    const r = h4(trap.results, trap.meta, d);
    ok("*** C10: v4696's mechanism -- a score band that tracks each fold's prior, no within-fold signal -- does NOT clear ***",
       Math.abs(trap.pooled - 0.5) > 0.1 && r.reportable && !r.a.cleared && r.a.diffs.every((x) => x === 0),
       `POOLED AUC ${trap.pooled.toFixed(4)} from pure band-and-prior; every per-fold difference is exactly ${r.a.diffs[0]}, because a shift of one model's scores cannot move an AUC computed on that model alone. The artefact that stopped v4696 has no path into this statistic.`);
    const real = world({ signal: 0.25 });
    const q = h4(real.results, real.meta, d);
    ok("*** ...while a genuine within-fold signal of modest size DOES clear both clauses ***",
       q.reportable && q.a.cleared && q.b.cleared && q.supported,
       `(a) t p=${q.a.test.t.p.toExponential(2)}, sign ${q.a.test.sign.up}/${q.a.test.sign.n} p=${q.a.test.sign.p.toFixed(4)}. A statistic that refused everything would pass the row above for the wrong reason.`);
    const one = world({ signal: 0.25, reverse: "noise" });
    const o = h4(one.results, one.meta, d);
    ok("*** ONE fold against the direction fails the clause: 6 of 7 is 8/128 ***",
       o.reportable && !o.a.cleared && o.a.test.sign.up === 6 && Math.abs(o.a.test.sign.p - 8 / 128) < 1e-15,
       `sign ${o.a.test.sign.up}/${o.a.test.sign.n}, p = ${o.a.test.sign.p} -- the price section 5 states in advance, exercised rather than asserted.`);
}
{
    // n = 4000 at a 0.4% prior is 16 expected minority blocks against a floor of 40 -- six standard deviations
    // below it. The first draft used n = 800, where `smooth` drew enough by chance to clear the floor.
    const w = world({ signal: 0.25, prior: (k) => (k < 3 ? 0.004 : 0.3), n: 4000 });
    const u = usableFolds(w.meta, d), r = h4(w.results, w.meta, d);
    ok("*** a fold below the minority floor is EXCLUDED BY NAME, from its labels alone ***",
       u.excluded.length === 3 && u.excluded.every((e) => /minority class/.test(e.why)) && u.usable.length === 4,
       u.excluded.map((e) => `${e.fold}: ${e.why}`).join("; "));
    ok("*** ...and four usable folds is NOT REPORTABLE, in either direction -- the sign test cannot reach alpha there ***",
       r.reportable === false && /cannot reach/.test(r.why) && !("supported" in r), r.why);
    ok("...and a declared minFolds the arithmetic contradicts is refused rather than used",
       throws(() => h4(w.results, w.meta, { ...d, minFolds: 4 }), /derives 5/));
    const bad = world({ signal: 0.25 }); bad.results.zone.V1[1] = null;
    ok("...and an undefined AUC on a usable fold throws rather than averaging past it",
       foldMean([0.6, null]) === null && throws(() => h4(bad.results, bad.meta, d), /undefined AUC/));
    ok("...and a fold's value is the MEAN over its seeds, not any one of them",
       Math.abs(foldMean([0.5, 0.7, 0.9]) - 0.7) < 1e-12 && foldMean([0.9]) === 0.9,
       "the seeds are the error bar; a fold value read off one seed would be v4696's single draw again.");
}
{
    const quiet = world({}), aSide = world({ shufArtefact: 0.3 });
    const bSide = world({}); for (const f of d.scenes) [bSide.results[f].SHUF_A, bSide.results[f].SHUF_B] = [bSide.results[f].SHUF_B, aSide.results[f].SHUF_A];
    const q = c11(quiet.results, d.scenes, d.alpha), a = c11(aSide.results, d.scenes, d.alpha), b = c11(bSide.results, d.scenes, d.alpha);
    ok("*** C11 stays quiet when the two shuffled arms are both chance ***", !q.fired,
       `g = ${q.g.map((x) => x.toFixed(3)).join(" ")}`);
    ok("*** C11 FIRES when shuffled arm A carries an artefact ***", a.fired && a.fwd.cleared);
    ok("*** ...and FIRES when the artefact is in arm B -- the mirror a one-sided check would miss ***", b.fired && b.back.cleared && !b.fwd.cleared);
}

console.log(`\nfoldStats-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: ANY RESULT ON FSR DATA. No scene is harvested, no fold of the real design is run, no AUC " +
            "on bars, edges, noise or ramp exists. The declared seeds and steps are exercised at 2 seeds and 60 steps " +
            "on made-up scenes, which proves the machinery and says nothing about what it will find.");
process.exit(fails ? 1 : 0);
