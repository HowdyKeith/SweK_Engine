#!/usr/bin/env node
// WebGLEngine/tools/ship/genGateFoldsMeasure-selfcheck.mjs -- v4699: the measurement render/learned-folds-
// preregistration.md declared at v4698, read back off its committed data and RE-DERIVED rather than trusted.
//
// *** NOTHING HERE IS TAKEN FROM THE RUNNER'S OWN VERDICT. *** tools/ship/genGateFolds.mjs wrote a result file
// with its c11 and h4 in it. This gate recomputes both from the recorded per-seed AUCs through the committed
// statistic, recomputes the exclusions from the cached LABELS, re-runs one fold/arm/seed from the cached
// FEATURES (control C12), and recomputes one fold's scalers from its training rows (C5). A result file that
// disagreed with its own data would be caught here and nowhere else.
//
// *** THE CACHE IS GZIPPED. *** Seven scenes of per-block features in JSON is ~50 MB, GitHub's warning line;
// the runner writes plain JSON and the round compressed it for the commit. That is storage, not analysis --
// the bytes the gate decompresses are the bytes the runner wrote, which row 1 checks by count.
// Run: node tools/ship/genGateFoldsMeasure-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { ARMS, declared, usableFolds, foldMean, h4, c11 } from "./foldStats.mjs";
import { jointRows, fit, shuffled, ARM_SPEC, RESULT } from "./genGateFolds.mjs";
import { N_FEATURES, N_FEATURES_V2, fitScaler, applyScaler, forward, auc } from "../../render/genGate.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CACHE_GZ = "tools/ship/genGate-folds7.json.gz";
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);

const d = declared();
const R = JSON.parse(fs.readFileSync(path.join(ENG, RESULT), "utf8"));
const byScene = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ENG, CACHE_GZ))).toString("utf8"));

console.log("genGateFoldsMeasure-selfcheck -- H4 on seven folds, as declared, re-derived from its own data\n");
const J = (x) => JSON.stringify(x);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const sdev = (a) => { const u = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - u) ** 2, 0) / (a.length - 1)); };

console.log("1. *** PROVENANCE: THE DATA IS THE DOCUMENT'S, AND THE RECORD IS THE DATA'S ***");
const rows = {};
{
    ok("*** the run's declared constants are the document's today -- nothing was edited after the data arrived ***",
       J(R.declared) === J(d), `${d.scenes.length} scenes, ${d.seeds.length} seeds, alpha ${d.alpha}, minFolds ${d.minFolds}, ${d.steps} steps`);
    ok("*** the cache holds exactly the declared scenes ***", J(Object.keys(byScene).sort()) === J(d.scenes.slice().sort()),
       Object.keys(byScene).map((s) => `${s} ${byScene[s].length} frames`).join(", "));
    for (const s of d.scenes) rows[s] = jointRows(byScene[s]);
    const counts = Object.fromEntries(d.scenes.map((s) => { const pos = rows[s].y.reduce((a, v) => a + v, 0); return [s, { n: rows[s].n, pos, neg: rows[s].n - pos }]; }));
    ok("*** every fold's held-out block and label counts, recomputed from the cached rows, equal the recorded ones ***",
       J(counts) === J(R.meta), d.scenes.map((s) => `${s} ${counts[s].pos}/${counts[s].n}`).join("  "));
    const u = usableFolds(counts, d);
    ok("*** the exclusions, recomputed from LABELS ALONE, are the recorded ones -- and there are none ***",
       J(u.usable) === J(R.h4.usable) && u.excluded.length === 0 && J(R.h4.excluded) === "[]",
       `lowest minority share ${Math.min(...d.scenes.map((s) => Math.min(counts[s].pos, counts[s].neg) / counts[s].n)).toFixed(3)} ` +
       `against a floor of ${d.minorityFloor}. The pre-registration named ramp as the likeliest exclusion; its base rate is ` +
       `${(counts.ramp.pos / counts.ramp.n).toFixed(3)}, far from one-sided, and it stays in.`);
}

console.log("\n2. *** THE CONTROLS THAT DECIDE WHETHER ANYTHING BELOW MAY BE READ ***");
{
    ok("*** C5, the weights' half: no fold trained on the scene it scored, per the runner's own record ***",
       d.scenes.every((h) => !R.trainedOn[h].includes(h) && R.trainedOn[h].length === d.scenes.length - 1));
    const h = d.scenes[0];
    const tr = jointRows(d.scenes.filter((s) => s !== h).flatMap((s) => byScene[s]));
    const want = fitScaler(tr.x2), got = R.scalers[h].v2;
    const same = (a, b) => a.length === Object.keys(b).length && Array.from(a).every((v, i) => v === b[i]);
    ok(`*** C5, the scaler's half: fold ${h}'s recorded scaler IS the one fitted on its six training scenes ***`,
       same(want.mean, got.mean) && same(want.sd, got.sd) && !same(fitScaler(rows[h].x2).mean, got.mean),
       "recomputed from the cached rows, bit for bit, and unequal to a scaler fitted on the held-out rows.");
    // C12: the FIRST entry of each declared list, so the one re-run is not chosen by looking at the results.
    const arm = ARMS[0], seed = d.seeds[0];
    const t0 = Date.now();
    const m = fit(tr.x2, tr.y, tr.n, N_FEATURES_V2, seed, d, fitScaler(tr.x2));
    const a = auc(forward(m.layers, applyScaler(rows[h].x2, m.scaler), rows[h].n), rows[h].y).auc;
    ok(`*** C12: re-running fold ${h}, arm ${arm}, seed ${seed} reproduces its recorded AUC BIT FOR BIT ***`,
       a === R.results[h][arm][0],
       `${a} vs ${R.results[h][arm][0]}, retrained from the cache in ${Date.now() - t0} ms. The seeds are replicates of something -- which, before v4698, they were not.`);
    // v4700 -- ALL FOUR ARMS, not V2 alone. v4700 generalised the runner's arms, and "v4698's four arms are
    // exactly what they were" is only a claim until every one of them re-derives its recorded AUC.
    // One fold, not runFolds: the runner would re-train all seven folds to answer a question about one.
    const sc1 = fitScaler(tr.x1), sc2 = fitScaler(tr.x2);
    const redo = Object.fromEntries(ARMS.map((a2) => {
        const sp = ARM_SPEC[a2], v2 = sp.set === "v2";
        const ytr = sp.shuf ? shuffled(tr.y, seed, sp.shuf) : tr.y;
        const mm = fit(v2 ? tr.x2 : tr.x1, ytr, tr.n, v2 ? N_FEATURES_V2 : N_FEATURES, seed, d, v2 ? sc2 : sc1);
        return [a2, auc(forward(mm.layers, applyScaler(v2 ? rows[h].x2 : rows[h].x1, mm.scaler), rows[h].n), rows[h].y).auc];
    }));
    ok(`*** C12, every arm: fold ${h}, seed ${seed}, all four arms re-derive their recorded AUCs bit for bit ***`,
       ARMS.every((a2) => redo[a2] === R.results[h][a2][0]),
       ARMS.map((a2) => `${a2} ${redo[a2].toFixed(6)}`).join("  ") + " -- through ARM_SPEC as it stands after v4700 generalised the runner's arms.");
    const q = c11(R.results, R.h4.usable, d.alpha);
    ok("*** C11 DID NOT FIRE: the two shuffled arms separate in neither direction, recomputed ***",
       !q.fired && J(q.g) === J(R.c11.g) && R.c11.fired === false,
       `g = ${q.g.map((x) => x.toFixed(4)).join(" ")}; forward t p ${q.fwd.t.p.toFixed(3)} sign p ${q.fwd.sign.p.toFixed(3)}, ` +
       `backward t p ${q.back.t.p.toFixed(3)} sign p ${q.back.sign.p.toFixed(3)}. So the harness is not manufacturing signal, and H4 may be read.`);
}

console.log("\n3. *** H4, RE-DERIVED FROM THE RECORDED AUCS -- NOT SUPPORTED ***");
const H = h4(R.results, R.meta, d);
{
    say("fold      base    V2      V1      SHUF_A  SHUF_B   (seed-mean held-out AUC over ten seeds)");
    for (const f of d.scenes) say(`${f.padEnd(8)}  ${(R.meta[f].pos / R.meta[f].n).toFixed(3)}  ` +
        ARMS.map((a) => foldMean(R.results[f][a]).toFixed(4)).join("  "));
    ok("*** the recomputed H4 is the recorded H4, diff for diff ***", J(H.a.diffs) === J(R.h4.a.diffs) && J(H.b.diffs) === J(R.h4.b.diffs) && H.supported === R.h4.supported);
    const rev = d.scenes.filter((f, i) => H.a.diffs[i] <= 0);
    ok("*** CLAUSE (a) FAILS AT THE PRICE THE DOCUMENT NAMED: six folds of seven, and 6 of 7 is 8/128 ***",
       !H.a.cleared && H.a.test.sign.up === 6 && H.a.test.sign.n === 7 && H.a.test.sign.p === 8 / 128 && H.a.test.t.p > d.alpha && J(rev) === J(["edges"]),
       `V2 minus its shuffled twin, per fold: ${H.a.diffs.map((x) => x.toFixed(4)).join(" ")}; mean +${H.a.test.t.mean.toFixed(4)}, ` +
       `t p ${H.a.test.t.p.toFixed(4)}, sign p ${H.a.test.sign.p}. The one fold against the direction is ${rev[0]}, where V2 scores ` +
       `${foldMean(R.results.edges.V2).toFixed(4)} -- below a coin -- against its twin's ${foldMean(R.results.edges.SHUF_A).toFixed(4)}. ` +
       "Section 5, in advance: \"One fold moving the wrong way fails a clause\" and a failed clause is NOT SUPPORTED, never \"trending\".");
    ok("*** CLAUSE (b) FAILS OUTRIGHT: the absolute set beats the scale-free one on five folds of seven ***",
       !H.b.cleared && H.b.test.t.mean < 0 && H.b.test.sign.up === 2,
       `V2 minus V1, per fold: ${H.b.diffs.map((x) => x.toFixed(4)).join(" ")}; mean ${H.b.test.t.mean.toFixed(4)}, sign ${H.b.test.sign.up}/7. ` +
       "The mechanism v4695 proposed -- absolute magnitudes forcing the network to learn scene identity -- predicted the opposite sign.");
    ok("*** H4 IS NOT SUPPORTED, and the pre-registered reading is the fails/fails row ***", H.reportable && !H.supported && !H.a.cleared && !H.b.cleared,
       "\"the features were not the problem either\" -- with seeds that seed and a statistic that does not pool, the scale-free set is not shown " +
       "to transfer and is not shown to beat the absolute one.");
}

console.log("\n4. *** SECONDARIES -- REPORTED, NEVER PROMOTED ***");
{
    const spread = d.scenes.map((f) => [f, Math.max(...ARMS.map((a) => sdev(R.results[f][a])))]);
    say(`S13 the noise floor: the largest across-seed AUC sd per fold is ${spread.map(([f, s]) => `${f} ${s.toFixed(3)}`).join(", ")}. ` +
        `The widest is ${(Math.max(...spread.map((x) => x[1])) / Math.min(...spread.map((x) => x[1]))).toFixed(1)}x the narrowest: ` +
        "one seed-averaged number per fold carries very different uncertainty from fold to fold, and a power calculation for the next design starts here.");
    // v4697's census |laplacian| per scene, COPIED from tools/ship/fsrContent-selfcheck.mjs's output: that gate measures
    // it in the page and does not export it, and S14 is a description, not a test. Said so rather than passed off as derived.
    const LAP = { zone: 0.4432, smooth: 0.0002, checker: 0.6400, bars: 0.0217, edges: 0.0208, noise: 0.0075, ramp: 0.0000 };
    const rank = (v) => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = Array(v.length); o.forEach(([, i], k) => { r[i] = k + 1; }); return r; };
    const ra = rank(d.scenes.map((f) => LAP[f])), rb = rank(H.b.diffs);
    const rho = 1 - 6 * ra.reduce((s, v, i) => s + (v - rb[i]) ** 2, 0) / (7 * 48);
    say(`S14 Spearman rho between the V2-over-V1 advantage and v4697's |laplacian|: ${rho.toFixed(3)} over seven scenes -- ` +
        "no visible relation, and seven points could not carry one. (The |laplacian| figures are copied from v4697's census output.)");
    const v1t = d.scenes.map((f) => foldMean(R.results[f].V1) - foldMean(R.results[f].SHUF_A));
    // v4700 -- THIS LINE SAID "V1 minus the shuffled twin" AT v4699, AND SHUF_A IS NOT V1'S TWIN. It is trained on
    // the SCALE-FREE features; v4698's design has no shuffled arm on the absolute set at all. v4699's closing
    // repeated it as "the absolute set beats ITS shuffled twin". The closing stands; this label is corrected.
    say(`UNDECLARED, NO TEST RUN ON IT: V1 minus SHUF_A per fold is ${v1t.map((x) => x.toFixed(4)).join(" ")}. ` +
        "Six of seven positive. SHUF_A is V2's twin, trained on the SCALE-FREE features, so this is not a matched comparison -- " +
        "render/learned-absolute-preregistration.md builds the matched one on fresh data. It is not a result here.");
}

console.log(`\ngenGateFoldsMeasure-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: ANYTHING BEYOND SEVEN SYNTHETIC SCENES. No dB was measured -- the ranking is upstream of any " +
            "threshold, and H4 did not clear. NOTHING ABOUT FSR4, A BIGGER NETWORK, OR REAL HARDWARE.");
process.exit(fails ? 1 : 0);
