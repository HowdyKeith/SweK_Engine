#!/usr/bin/env node
// WebGLEngine/tools/ship/genGateAbsoluteMeasure-selfcheck.mjs -- v4701: H5 as render/learned-absolute-
// preregistration.md declared it at v4700, read back off its committed data and RE-DERIVED rather than trusted.
//
// *** THE SAME DISCIPLINE AS v4699's GATE, AND ONE CHECK IT DID NOT NEED. *** Every verdict is recomputed from the
// recorded per-seed AUCs, the exclusions from the cached labels, one fold's every arm from the cached features.
// The new check is FRESHNESS: the whole point of v4700 was data nobody had seen, and a harvest that silently
// ignored the slab-speed control would have produced x2's frames again under an x4 name -- this page once had a
// control that did exactly that (startframe as a <select>, v4661). So each scene's x4 label counts are compared
// with v4699's recorded x2 ones and must differ. Counts and not labels: an ignored control reproduces the harvest
// exactly, which identical counts catch, and reading the x2 cache to compare block by block cost a second and
// took the gate over budget (3269 ms) to catch nothing more of that failure.
// Run: node tools/ship/genGateAbsoluteMeasure-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { ARMS_H5, PREREG_H5, readDoc, declared, usableFolds, foldMean, clause, h5, c11 } from "./foldStats.mjs";
import { jointRows, fit, shuffled, ARM_SPEC } from "./genGateFolds.mjs";
import { CACHE_H5, RESULT_H5 } from "./genGateAbsolute.mjs";
import { N_FEATURES, N_FEATURES_V2, fitScaler, applyScaler, forward, auc } from "../../render/genGate.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const J = (x) => JSON.stringify(x);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const sdev = (a) => { const u = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - u) ** 2, 0) / (a.length - 1)); };
const gz = (rel) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ENG, rel))).toString("utf8"));

const d = declared(readDoc(PREREG_H5));
const R = JSON.parse(fs.readFileSync(path.join(ENG, RESULT_H5), "utf8"));
const byScene = gz(CACHE_H5);
const R2 = JSON.parse(fs.readFileSync(path.join(ENG, "tools/ship/genGate-folds7-result.json"), "utf8"));

console.log("genGateAbsoluteMeasure-selfcheck -- H5 at slab speed x4, as declared, re-derived from its own data\n");
console.log("1. *** PROVENANCE AND FRESHNESS ***");
const rows = {};
{
    ok("*** the run's constants and arms are the document's today -- nothing was edited after the data arrived ***",
       J(R.declared) === J(d) && J(R.arms) === J(ARMS_H5), `x${d.speed}, seeds ${d.seeds[0]}-${d.seeds[d.seeds.length - 1]}, arms ${R.arms.join(" ")}`);
    ok("*** the cache holds exactly the declared scenes ***", J(Object.keys(byScene).sort()) === J(d.scenes.slice().sort()));
    for (const s of d.scenes) rows[s] = jointRows(byScene[s]);
    const counts = Object.fromEntries(d.scenes.map((s) => { const pos = rows[s].y.reduce((a, v) => a + v, 0); return [s, { n: rows[s].n, pos, neg: rows[s].n - pos }]; }));
    ok("*** every fold's held-out counts, recomputed from the cached rows, equal the recorded ones ***", J(counts) === J(R.meta));
    const u = usableFolds(counts, d);
    ok("*** the exclusions, recomputed from labels alone, are the recorded ones -- none ***",
       J(u.usable) === J(R.h5.usable) && !u.excluded.length && J(R.h5.excluded) === "[]");
    const moved = d.scenes.map((s) => [s, counts[s].pos, R2.meta[s].pos]);
    ok("*** FRESH: on every scene the x4 positive count differs from v4699's x2 one -- the harvest honoured the speed control ***",
       moved.every(([, a, b]) => a !== b) && d.speed !== R2.declared.speed,
       moved.map(([s, a, b]) => `${s} ${b}->${a}`).join("  ") + ". A harvest that ignored slabspeed would reproduce every x2 count exactly.");
}

console.log("\n2. *** THE CONTROLS ***");
{
    ok("*** C5, the weights' half: no fold trained on the scene it scored ***",
       d.scenes.every((h) => !R.trainedOn[h].includes(h) && R.trainedOn[h].length === d.scenes.length - 1));
    const h = d.scenes[0], seed = d.seeds[0];
    const tr = jointRows(d.scenes.filter((s) => s !== h).flatMap((s) => byScene[s]));
    const sc1 = fitScaler(tr.x1), sc2 = fitScaler(tr.x2);
    const same = (a, b) => a.length === Object.keys(b).length && Array.from(a).every((v, i) => v === b[i]);
    ok(`*** C5, the scaler's half: fold ${h}'s recorded scalers ARE the ones fitted on its six training scenes ***`,
       same(sc1.mean, R.scalers[h].v1.mean) && same(sc1.sd, R.scalers[h].v1.sd) && same(sc2.mean, R.scalers[h].v2.mean) &&
       !same(fitScaler(rows[h].x1).mean, R.scalers[h].v1.mean));
    const redo = Object.fromEntries(ARMS_H5.map((a2) => {
        const sp = ARM_SPEC[a2], v2 = sp.set === "v2";
        const ytr = sp.shuf ? shuffled(tr.y, seed, sp.shuf) : tr.y;
        const mm = fit(v2 ? tr.x2 : tr.x1, ytr, tr.n, v2 ? N_FEATURES_V2 : N_FEATURES, seed, d, v2 ? sc2 : sc1);
        return [a2, auc(forward(mm.layers, applyScaler(v2 ? rows[h].x2 : rows[h].x1, mm.scaler), rows[h].n), rows[h].y).auc];
    }));
    ok(`*** C12: fold ${h}, seed ${seed} -- the first of each declared list -- every arm re-derives its recorded AUC bit for bit ***`,
       ARMS_H5.every((a2) => redo[a2] === R.results[h][a2][0]), ARMS_H5.map((a2) => `${a2} ${redo[a2].toFixed(6)}`).join("  "));
    const q = c11(R.results, R.h5.usable, d.alpha, "SHUF1_A", "SHUF1_B");
    ok("*** C11 DID NOT FIRE: the absolute set's two twins separate in neither direction, recomputed ***",
       !q.fired && J(q.g) === J(R.c11.g) && R.c11.fired === false,
       `g = ${q.g.map((x) => x.toFixed(4)).join(" ")}; forward sign p ${q.fwd.sign.p}, backward sign p ${q.back.sign.p}. H5 may be read.`);
}

console.log("\n3. *** H5, RE-DERIVED -- NOT SUPPORTED ***");
const H = h5(R.results, R.meta, d);
{
    say("fold      base    " + ARMS_H5.map((a) => a.padEnd(7)).join(" ") + "  (seed-mean held-out AUC, seeds 11-20, x4)");
    for (const f of d.scenes) say(`${f.padEnd(8)}  ${(R.meta[f].pos / R.meta[f].n).toFixed(3)}  ` + ARMS_H5.map((a) => foldMean(R.results[f][a]).toFixed(4)).join("  "));
    ok("*** the recomputed H5 is the recorded H5, diff for diff ***", J(H.a.diffs) === J(R.h5.a.diffs) && H.supported === R.h5.supported);
    const below = d.scenes.filter((f, i) => H.a.diffs[i] < 0);
    ok("*** H5 IS NOT SUPPORTED: the absolute set beats its own twin on four folds of seven, and its MEAN is NEGATIVE ***",
       H.reportable && !H.supported && H.a.test.sign.up === 4 && H.a.test.t.mean < 0 && H.a.test.t.p > 0.5,
       `V1 minus SHUF1_A: ${H.a.diffs.map((x) => x.toFixed(4)).join(" ")}; mean ${H.a.test.t.mean.toFixed(4)}, t p ${H.a.test.t.p.toFixed(3)}, ` +
       `sign ${H.a.test.sign.up}/7 p ${H.a.test.sign.p}. Against it: ${below.join(", ")}. This is not the one-fold price section 5 named -- ` +
       "three folds go the wrong way and the mean does too.");
    ok("*** edges fails it, as the document named in advance -- and ranks BELOW chance again, now at x4 ***",
       below.includes("edges") && foldMean(R.results.edges.V1) < 0.4 && foldMean(R.results.edges.V2) < 0.4,
       `V1 ${foldMean(R.results.edges.V1).toFixed(4)}, V2 ${foldMean(R.results.edges.V2).toFixed(4)} on edges at x4; at x2 they were ` +
       `${foldMean(R2.results.edges.V1).toFixed(4)} and ${foldMean(R2.results.edges.V2).toFixed(4)}. Two cells, two feature sets, the same inversion.`);
    ok("*** the pre-registered reading: v4699's observation does NOT replicate as a matched comparison at a fresh cell ***", !H.supported,
       "and section 2 said in advance what this cannot separate: no transfer, or transfer at x2 that does not survive the move to x4.");
}

console.log("\n4. *** SECONDARIES -- REPORTED, NEVER PROMOTED ***");
{
    const s15 = clause(R.results, d.scenes, "V2", "SHUF_A", d.alpha), s16 = d.scenes.map((f) => foldMean(R.results[f].V1) - foldMean(R.results[f].V2));
    say(`S15 V2 minus SHUF_A at x4 (v4699's clause (a), fresh cell): ${s15.diffs.map((x) => x.toFixed(4)).join(" ")}; sign ${s15.test.sign.up}/7, mean ${s15.test.t.mean.toFixed(4)}.`);
    say(`S16 V1 minus V2 at x4: ${s16.map((x) => x.toFixed(4)).join(" ")}.`);
    say(`S17 edges at x4: base ${(R.meta.edges.pos / R.meta.edges.n).toFixed(3)}; ` + ARMS_H5.map((a) => `${a} ${foldMean(R.results.edges[a]).toFixed(4)}`).join(", ") + ".");
    say("S18 base rate x2 -> x4: " + d.scenes.map((f) => `${f} ${(R2.meta[f].pos / R2.meta[f].n).toFixed(3)}->${(R.meta[f].pos / R.meta[f].n).toFixed(3)}`).join("  "));
    // v4701 -- THE FIRST DRAFT OF THIS LINE CLAIMED checker AND edges WERE "the two held-out scenes whose base rates sit
    // furthest from the pooled training mean". It was written, not computed. Computed, zone sits as far as checker.
    const base = Object.fromEntries(d.scenes.map((f) => [f, R.meta[f].pos / R.meta[f].n]));
    const dist = d.scenes.map((f) => [f, Math.abs(base[f] - mean(d.scenes.filter((g) => g !== f).map((g) => base[g])))]).sort((p, q) => q[1] - p[1]);
    const inv = d.scenes.filter((f) => foldMean(R.results[f].V1) < 0.45 && foldMean(R.results[f].V2) < 0.45);
    say(`S18b both learned sets rank below 0.45 on: ${inv.join(", ")}. Held-out base rate's distance from its six training scenes', largest first: ` +
        dist.map(([f, x]) => `${f} ${x.toFixed(3)}`).join(", ") + ". zone is as far as checker and ranks ABOVE chance, so distance from the training prior does not sort these folds.");
    const spread = d.scenes.map((f) => [f, Math.max(...ARMS_H5.map((a) => sdev(R.results[f][a])))]);
    say(`S19 the largest across-seed sd per fold: ${spread.map(([f, s]) => `${f} ${s.toFixed(3)}`).join(", ")}.`);
}

console.log(`\ngenGateAbsoluteMeasure-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: WHETHER THE x2 OBSERVATION WAS REAL AT x2. The document forbids re-analysing the x2 cache for H5, " +
            "and this gate does not. NOTHING IN dB, NOTHING BEYOND SEVEN SYNTHETIC SCENES AT TWO SPEEDS, NOTHING ABOUT REAL HARDWARE.");
process.exit(fails ? 1 : 0);
