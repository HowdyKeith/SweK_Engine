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
import { PREREG, ARMS, ARMS_H5, PREREG_H5, RULE_KEYS, readDoc, declared, seededRng, minFoldsFor, usableFolds, foldMean, clause, h4, h5, c11 } from "./foldStats.mjs";
import { jointRows, runFolds, shuffled } from "./genGateFolds.mjs";
import { analyse } from "./genGateAbsolute.mjs";
import { train } from "./genGateTrain.mjs";
import { N_FEATURES, N_FEATURES_V2, HIDDEN, auc, fitScaler } from "../../render/genGate.mjs";
import { MLPTrainer } from "../../brain/learn.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const J = (x) => JSON.stringify(x);
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
    // v4702 -- RULE_KEYS, the schema a document with nothing to train declares.
    const ruleDoc = "```declared\nscenes = a b\nspeeds = 2 4\nalpha = 0.05\nminFolds = 5\nminorityFloor = 0.01\ncolumnTol = 1e-4\n```";
    ok("*** RULE_KEYS: a rule's document parses under it, a learned key is refused under it, and its own keys are required ***",
       (() => { try { return declared(ruleDoc, RULE_KEYS).speeds.join() === "2,4"; } catch { return false; } })() &&
       throws(() => declared(ruleDoc.replace("alpha = 0.05", "alpha = 0.05\nseeds = 1 2"), RULE_KEYS), /not a declared key/) &&
       throws(() => declared(ruleDoc.replace(/columnTol = .*\n/, ""), RULE_KEYS), /does not declare "columnTol"/) &&
       throws(() => declared(ruleDoc), /not a declared key|does not declare/),
       "a rule has no seeds, steps or width: carrying them to satisfy one schema would be five keys nothing reads.");
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

console.log("\n5. *** v4700: THE SECOND DOCUMENT -- THE ABSOLUTE SET AGAINST ITS OWN TWIN, AT A CELL NOBODY HAS HARVESTED ***");
{
    const e = declared(readDoc(PREREG_H5));
    const html = fs.readFileSync(path.join(ENG, "fsr.html"), "utf8");
    const opts = (id) => { const m = new RegExp(`<select id="${id}">([\\s\\S]*?)<\\/select>`).exec(html);
        return m ? [...m[1].matchAll(/<option value="(\w+)">/g)].map((x) => x[1]) : []; };
    const page = opts("scene"), speeds = opts("slabspeed");
    ok("*** H5's document parses, its minFolds is the derived one, and its scenes are the page's, both directions ***",
       e.minFolds === minFoldsFor(e.alpha) && J(e.scenes.slice().sort()) === J(page.slice().sort()),
       `${e.scenes.length} scenes, minFolds ${e.minFolds}`);
    ok("*** the cell is FRESH: a speed the page offers, and not the one v4698's data were harvested at ***",
       speeds.includes(e.speed) && e.speed !== d.speed, `x${e.speed} against v4698's x${d.speed}; the page offers ${speeds.map((x) => "x" + x).join(" ")}.`);
    ok("*** ...and the seeds are DISJOINT from v4698's, so no seed that produced the observation is reused ***",
       e.seeds.length === d.seeds.length && e.seeds.every((x) => !d.seeds.includes(x)), `${e.seeds.join(" ")}`);
    const same = ["alpha", "minorityFloor", "steps", "hidden", "lr", "batch", "upto"].filter((k) => e[k] !== d[k]);
    ok("*** every other constant IS v4698's -- the cell and the seeds are the only things that move ***", !same.length,
       same.length ? `differs: ${same.join(", ")}` : "alpha, minorityFloor, steps, hidden, lr, batch, upto -- all equal.");

    // C13. A permutation of a CONSTANT label vector is the identity, so on a fold whose training labels are all
    // one class a shuffled arm is its unshuffled source, bit for bit -- which proves which features it trains on.
    let sd = 77; const r = () => ((sd = (Math.imul(sd, 1103515245) + 12345) & 0x7fffffff) / 0x80000000);
    const by = {};
    for (const sc of d.scenes) { const fr = [];
        for (let f = 0; f < 2; f++) { const x = [], x2 = [], y = [];
            for (let b = 0; b < 40; b++) { const lab = sc === "zone" ? (b % 2) : 1; y.push(lab);
                for (let j = 0; j < N_FEATURES; j++) x.push(r() + (j === 0 ? lab : 0));
                for (let j = 0; j < N_FEATURES_V2; j++) x2.push(r() + (j === 1 ? lab : 0)); }
            fr.push({ scene: sc, x, x2, y }); }
        by[sc] = fr; }
    let t5 = null, t5err = "";
    try { t5 = runFolds(by, { ...e, steps: 40, seeds: [11] }, ARMS_H5).results.zone;
          if (!ARMS_H5.every((a) => t5[a] && Number.isFinite(t5[a][0]))) { t5err = `arms returned: ${Object.keys(t5).join(",")}`; t5 = null; } }
    catch (err) { t5err = String(err.message).slice(0, 120); }
    ok("*** C13: with constant training labels SHUF1_A IS V1 and SHUF_A IS V2, bit for bit -- each twin trains on the set its name says ***",
       t5 !== null && t5.SHUF1_A[0] === t5.V1[0] && t5.SHUF1_B[0] === t5.V1[0] && t5.SHUF_A[0] === t5.V2[0] && t5.V1[0] !== t5.V2[0],
       t5 === null ? `the runner did not return the five arms: ${t5err}` :
       `V1 ${t5.V1[0].toFixed(6)} = SHUF1_A ${t5.SHUF1_A[0].toFixed(6)}; V2 ${t5.V2[0].toFixed(6)} = SHUF_A ${t5.SHUF_A[0].toFixed(6)}; ` +
       "and V1 != V2, or the row would pass on two sets that were the same. v4699 named SHUF_A as V1's twin in prose; this is the property checked.");
    const y8 = Uint8Array.from([1, 1, 1, 0, 0, 0, 0, 0]);
    const p1 = shuffled(y8, 11, "SHUF1_A"), p2 = shuffled(y8, 11, "SHUF1_B"), p3 = shuffled(y8, 11, "SHUF_A");
    ok("*** the absolute twins have streams of their OWN -- different from each other and from the scale-free twin's ***",
       p1.join() !== p2.join() && p1.join() !== p3.join(), `SHUF1_A ${p1.join("")}, SHUF1_B ${p2.join("")}, SHUF_A ${p3.join("")}`);

    const world5 = ({ signal = 0, reverse = null, art = null, artSize = 0.3 }) => {
        const results = {}, meta = {};
        d.scenes.forEach((f, k) => { results[f] = Object.fromEntries(ARMS_H5.map((a) => [a, []]));
            for (const s2 of e.seeds.slice(0, 3)) { const rr = seededRng(97 * k + s2), n = 600, y = new Uint8Array(n);
                const cols = Object.fromEntries(ARMS_H5.map((a) => [a, new Float32Array(n)]));
                for (let i = 0; i < n; i++) { y[i] = rr() < 0.4 ? 1 : 0; for (const a of ARMS_H5) cols[a][i] = rr(); }
                const sg = f === reverse ? -1 : 1;
                for (const a of ARMS_H5) { const add = (a === "V1" ? sg * signal : 0) + (a === art ? artSize : 0);
                    results[f][a].push(auc(cols[a].map((v, i) => v + add * y[i]), y).auc); }
                meta[f] = { n, pos: y.reduce((q, v) => q + v, 0), neg: n - y.reduce((q, v) => q + v, 0) }; } });
        return { results, meta };
    };
    const w1 = world5({ signal: 0.25 }), w2 = world5({ signal: 0.25, reverse: "edges" });
    const a1 = h5(w1.results, w1.meta, e), a2 = h5(w2.results, w2.meta, e);
    ok("*** h5 clears on a genuine within-fold V1 signal, and FAILS when edges alone reverses -- the price section 5 names ***",
       a1.reportable && a1.supported && a2.reportable && !a2.supported && a2.a.test.sign.up === 6 && a2.a.test.sign.p === 8 / 128,
       `clean: sign ${a1.a.test.sign.up}/7; edges reversed: sign ${a2.a.test.sign.up}/7 p ${a2.a.test.sign.p}`);
    // *** WHICH ARM h5 READS, IDENTIFIED RATHER THAN ASSUMED. *** Push ONE arm below chance on every fold. If that
    // arm is h5's baseline, V1 minus it is positive everywhere and h5 clears; if it is not, h5 stays at chance. So
    // exactly one arm may move h5, and it must be SHUF1_A. The first draft pushed SHUF_A UP, where a mis-wired h5
    // fails too; the second pushed SHUF_A down and checked only SHUF_A, and a sabotage pointing h5 at V2 passed it.
    const moves = ["SHUF1_A", "SHUF1_B", "V2", "SHUF_A"].map((arm) => {
        const q = world5({ art: arm, artSize: -0.3 });
        return { arm, wouldClear: clause(q.results, d.scenes, "V1", arm, e.alpha).cleared, h5: h5(q.results, q.meta, e).supported };
    });
    ok("*** h5 reads SHUF1_A and NOTHING ELSE: of four arms pushed below chance, only SHUF1_A moves it ***",
       moves.every((m) => m.wouldClear) && moves.filter((m) => m.h5).map((m) => m.arm).join() === "SHUF1_A",
       moves.map((m) => `${m.arm}: ${m.h5 ? "MOVES h5" : "h5 unmoved"}`).join("; ") + ". Every one of the four would clear a clause taken against it, so each probe has teeth.");
    ok("...and h5 refuses a declared minFolds the arithmetic contradicts",
       throws(() => h5(w1.results, w1.meta, { ...e, minFolds: 4 }), /derives 5/));
    const q1 = world5({ art: "SHUF1_A" }), q2 = world5({ art: "SHUF1_B" }), q3 = world5({ art: "SHUF_A" });
    const an = (w) => analyse(w, e).c11;
    ok("*** the runner's C11 watches the ABSOLUTE twins, in both directions -- and not the scale-free one ***",
       an(q1).fired && an(q2).fired && !an(q3).fired && !an(world5({})).fired,
       "fires on an artefact in SHUF1_A, fires on one in SHUF1_B, stays quiet when only SHUF_A carries one -- that arm is a secondary here.");
}

console.log(`\nfoldStats-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
// v4700 -- THIS LINE SAID "no AUC on bars, edges, noise or ramp exists" UNTIL v4700, A ROUND AFTER v4699 MADE IT FALSE.
console.log("unchecked here: ANY RESULT ON FSR DATA. This gate reads none: v4699's seven-fold measurement is " +
            "tools/ship/genGateFoldsMeasure-selfcheck.mjs's, and v4700's x4 cell has not been harvested. Seeds and steps " +
            "are exercised at one or two seeds and tens of steps on made-up scenes, which proves the machinery and says " +
            "nothing about what it will find.");
process.exit(fails ? 1 : 0);
