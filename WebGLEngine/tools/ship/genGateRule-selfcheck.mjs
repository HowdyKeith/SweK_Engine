#!/usr/bin/env node
// WebGLEngine/tools/ship/genGateRule-selfcheck.mjs -- v4702: the parameter-free rule and its test, on SYNTHETIC
// frames only, in the round that declares them.
//
// *** NO FSR DATA IS READ HERE. *** The two caches the rule will be scored on exist, and this gate checks only that
// they exist -- it never opens them. Every property below is proven on frames made up for the purpose, through
// the REAL feature code, so the next round's measurement is the document's and not a choice made after looking.
// Run: node tools/ship/genGateRule-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { features, featuresV2, N_FEATURES, N_FEATURES_V2, auc } from "../../render/genGate.mjs";
import { RULE_KEYS, declared, readDoc, minFoldsFor, seededRng } from "./foldStats.mjs";
import { PREREG_H6, RESULT_H6, EPS, CELLS, ruleScore, checkCell, matchesMeta, loadCell, sceneAucs, h6Cell, h6 } from "./genGateRule.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };
const J = (x) => JSON.stringify(x);

console.log("genGateRule-selfcheck -- a rule with nothing fitted, and the test it will face\n");

console.log("1. *** THE DOCUMENT ***");
let d = null, dErr = "";
try { d = declared(readDoc(PREREG_H6), RULE_KEYS); } catch (e) { dErr = String(e.message).slice(0, 160); }
ok("*** the rule's document parses under its OWN schema, and is REFUSED under the learned one ***",
   d !== null && throws(() => declared(readDoc(PREREG_H6)), /does not declare|not a declared key/),
   d === null ? `under RULE_KEYS: ${dErr}` : "a rule has no seeds, steps or width, so the learned schema must reject this document -- if declared() ignored its schema argument, one of these would pass that should not.");
if (d === null) { console.log(`\ngenGateRule-selfcheck: ${fails} FAILED`); process.exit(1); }
{
    const html = fs.readFileSync(path.join(ENG, "fsr.html"), "utf8");
    const opts = (id) => { const m = new RegExp(`<select id="${id}">([\\s\\S]*?)<\\/select>`).exec(html);
        return m ? [...m[1].matchAll(/<option value="(\w+)">/g)].map((x) => x[1]) : []; };
    ok("*** minFolds is the one the sign test derives, and the scenes are the page's, both directions ***",
       d.minFolds === minFoldsFor(d.alpha) && J(d.scenes.slice().sort()) === J(opts("scene").slice().sort()), `${d.scenes.length} scenes, minFolds ${d.minFolds}`);
    ok("*** every declared speed is a page option AND has a cache, and every cache the code knows is declared ***",
       d.speeds.every((sp) => opts("slabspeed").includes(sp) && CELLS[sp] && fs.existsSync(path.join(ENG, CELLS[sp].cache))) &&
       J(Object.keys(CELLS).sort()) === J(d.speeds.slice().sort()),
       d.speeds.map((sp) => `x${sp} -> ${CELLS[sp] ? CELLS[sp].cache.split("/").pop() : "NONE"}`).join(", ") + " -- existence only; this gate does not open them.");
    ok("*** loadCell refuses an undeclared speed BEFORE it opens anything -- by name, not by a TypeError ***",
       throws(() => loadCell("8", d.scenes), /no cache for speed x8/),
       "exercised without opening either real cache; this round's gate does not read data.");
    const known = Object.values(CELLS).flatMap((c) => [c.cache, c.result]);
    ok("*** RESULT_H6 is a file of its own -- the rule's result can never overwrite a harvest's record ***",
       /^tools\/ship\/.+-result\.json$/.test(RESULT_H6) && !known.includes(RESULT_H6),
       `${RESULT_H6}, distinct from ${known.length} cache and result paths. The rule reads v4699's and v4701's records; writing over one would destroy the cell identity checkCell and matchesMeta depend on.`);
    ok("*** a cache is refused unless the run that harvested it recorded that speed ***",
       checkCell("4", { speed: "4" }) && throws(() => checkCell("4", { speed: "2" }), /recorded speed 2/) && throws(() => checkCell("8", { speed: "8" }), /no cache/));
}

console.log("\n2. *** THE SCORE: THE COLUMNS, NOTHING FITTED, AND ITS DIRECTION ***");
// One synthetic frame through the REAL feature code: features() and featuresV2() are the functions the page calls.
const synthFrame = (seed, bw = 8, bh = 6, block = 4) => {
    const r = seededRng(seed), w = bw * block, h = bh * block, nb = bw * bh;
    const cur = new Float32Array(w * h * 4).map(() => r());
    const rc = { bw, bh, sadApp: new Float32Array(nb).map(() => r() * 3), sadFlow: new Float32Array(nb).map(() => r() * 3),
                 sadStill: new Float32Array(nb).map(() => r() * 3), flow: new Float32Array(nb * 2).map(() => r() * 4 - 2),
                 source: new Uint8Array(nb).map(() => (r() * 3) | 0) };
    rc.sadStill[0] = 0; rc.sadApp[0] = 0; rc.sadFlow[0] = 0;       // a flat static block: the eps path
    return { cur, w, h, rc, hole: new Uint8Array(w * h), depthBlock: new Float32Array(nb).map(() => r()), block };
};
{
    const fr = synthFrame(5), x1 = features(fr), x2 = featuresV2(fr), nb = fr.rc.bw * fr.rc.bh;
    let worst = 0;
    for (let b = 0; b < nb; b++) worst = Math.max(worst, Math.abs(ruleScore(x1[b * N_FEATURES], x1[b * N_FEATURES + 1], x1[b * N_FEATURES + 2]) + x2[b * N_FEATURES_V2 + 2]));
    ok("*** C16: the score is the NEGATED third scale-free column, through the real features() and featuresV2() ***",
       worst <= d.columnTol && worst < 1e-5, `${nb} blocks, worst |score + x2[2]| ${worst.toExponential(2)} against columnTol ${d.columnTol}. ` +
       "Reading the wrong three absolute columns would miss by whole units.");
    const k = [0.01, 7, 1e4].map((kk) => { let w2 = 0;
        for (let b = 1; b < nb; b++) { const a = fr.rc.sadApp[b], f = fr.rc.sadFlow[b], s = fr.rc.sadStill[b];
            w2 = Math.max(w2, Math.abs(ruleScore(kk * a, kk * f, kk * s) - ruleScore(a, f, s))); }
        return [kk, w2]; });
    ok("*** C15: nothing fitted -- scaling all three SADs by k leaves the score where it was ***",
       k.every(([kk, w2]) => w2 < 1e-3 * Math.max(1, 1 / kk)),
       k.map(([kk, w2]) => `k=${kk}: ${w2.toExponential(1)}`).join(", ") + " -- the residual is eps's, largest when k shrinks the SADs toward it.");
    ok("*** the direction is the physics': a better motion match scores HIGHER, and no motion benefit scores 0 ***",
       ruleScore(0.1, 0.5, 1) > ruleScore(0.5, 0.5, 1) && ruleScore(0.5, 0.9, 1) === ruleScore(0.9, 0.5, 1) &&
       Math.abs(ruleScore(1, 1, 1)) < 1e-12 && ruleScore(0, 0, 0) === 0 && Number.isFinite(ruleScore(0, 0, 1)),
       "min(sadApp, sadFlow) is symmetric in the two candidates; a flat static block (all three zero) scores exactly 0 and a zero-SAD candidate stays finite.");
}

console.log("\n3. *** C14: THE SCORE IS BLIND ***");
const synthScenes = (signal, seed = 11, scenes = d.scenes, reverse = null, prior = () => 0.4) => {
    const r = seededRng(seed), by = {};
    scenes.forEach((s, k) => { const fr = [];
        for (let f = 0; f < 2; f++) { const x = [], x2 = [], y = [];
            for (let b = 0; b < 300; b++) { const lab = r() < prior(k) ? 1 : 0; y.push(lab);
                const still = 1 + r(), gain = (s === reverse ? -1 : 1) * signal * (lab ? 1 : -1);
                // noise 1.5 against a signal of 0.3: the first draft used 0.2, every scene separated perfectly at
                // AUC 1.000, the seven differences were identical, and pairedT refused a sample with no variance --
                // which is its correct answer, and a fixture that could only ever produce it.
                const best = still * Math.exp(-(0.3 + gain + 1.5 * r()));
                const row = [best * (1 + r() * 0.2), best, still, r(), r(), r(), r(), r(), 0, 0, 0];
                x.push(...row); for (let j = 0; j < N_FEATURES_V2; j++) x2.push(r()); }
            fr.push({ scene: s, x, x2, y }); }
        by[s] = fr; });
    return by;
};
{
    const by = synthScenes(0.3), a = sceneAucs(by, d.scenes);
    const by2 = JSON.parse(J(by)); for (const s of d.scenes) for (const f of by2[s]) f.x2 = f.x2.map((v) => v * 3 + 1);
    ok("*** altering every scale-free column leaves every scene's AUC identical -- the score reads the absolute SADs only ***",
       J(sceneAucs(by2, d.scenes)) === J(a));
    const by3 = JSON.parse(J(by)); for (const s of d.scenes) for (const f of by3[s]) f.y = f.y.slice().reverse();
    const a3 = sceneAucs(by3, d.scenes);
    ok("*** ...and moving the labels moves the AUC while the population stays the same -- the labels are read only by auc() ***",
       d.scenes.every((s) => a3[s].n === a[s].n && a3[s].auc !== a[s].auc), d.scenes.map((s) => `${s} ${a[s].auc.toFixed(3)}->${a3[s].auc.toFixed(3)}`).join(" "));
    const meta = Object.fromEntries(d.scenes.map((s) => [s, { n: a[s].n, pos: a[s].pos }]));
    const other = synthScenes(0.3, 99);
    ok("*** a cache is refused unless its per-scene counts are the ones its own run recorded ***",
       matchesMeta(by, meta, d.scenes) && throws(() => matchesMeta(other, meta, d.scenes), /not the one its result recorded/),
       "checkCell ties the RESULT to the speed; this ties the CACHE to the result. Without it, a cache path pointed at the other cell would be scored under this cell's name.");
    const direct = (() => { const f = by.zone.flatMap((fr) => fr.y.map((yy, b) => [ruleScore(fr.x[b * 11], fr.x[b * 11 + 1], fr.x[b * 11 + 2]), yy]));
        return auc(Float64Array.from(f.map((p) => p[0])), Uint8Array.from(f.map((p) => p[1]))).auc; })();
    ok("*** sceneAucs agrees with the score computed by hand, block by block ***", direct === a.zone.auc, `${direct} vs ${a.zone.auc}`);
}

console.log("\n4. *** H6: PER SCENE, BOTH CELLS, AND THE PRICE ***");
{
    const g = sceneAucs(synthScenes(0.3, 11), d.scenes), g2 = sceneAucs(synthScenes(0.3, 12), d.scenes);
    const nul = sceneAucs(synthScenes(0, 13), d.scenes), rev = sceneAucs(synthScenes(0.3, 14, d.scenes, "edges"), d.scenes);
    const both = h6({ 2: g, 4: g2 }, d), oneNull = h6({ 2: g, 4: nul }, d), oneRev = h6({ 2: g, 4: rev }, d);
    ok("*** a genuine signal in both cells SUPPORTS H6 ***", both.reportable && both.supported,
       `x2 sign ${both.cells[2].test.sign.up}/7, x4 sign ${both.cells[4].test.sign.up}/7`);
    ok("*** ...a cell at chance fails it -- BOTH cells must clear, an intersection-union test ***",
       oneNull.cells[2].cleared && !oneNull.cells[4].cleared && !oneNull.supported);
    ok("*** ...and edges alone reversed in one cell fails it: 6 of 7 is 8/128 ***",
       !oneRev.supported && oneRev.cells[4].test.sign.up === 6 && oneRev.cells[4].test.sign.p === 8 / 128,
       `x4 sign ${oneRev.cells[4].test.sign.up}/7 p ${oneRev.cells[4].test.sign.p}`);
    const thin = sceneAucs(synthScenes(0.3, 15, d.scenes, null, (k) => (k < 3 ? 0.001 : 0.4)), d.scenes);
    const t = h6Cell(thin, d);
    ok("*** scenes under the minority floor are excluded from labels alone, and four usable is NOT reportable ***",
       !t.reportable && t.excluded.length === 3 && /cannot reach/.test(t.why) && !h6({ 2: g, 4: thin }, d).supported,
       t.excluded.map((e) => e.fold).join(", ") + " excluded");
    ok("...and seven scenes a hair above chance with one far above clear the sign test but NOT the t-test -- both are required",
       (() => { const m = JSON.parse(J(g)); for (const s of d.scenes) m[s].auc = 0.5001; m.zone.auc = 0.99; const c = h6Cell(m, d); return c.test.sign.up === 7 && c.test.t.p > d.alpha && !c.cleared; })(),
       "seven scenes a hair above 0.5 and one far above: the sign test says 7/7 and the t-test refuses -- both are required, so it does not clear.");
}

console.log(`\ngenGateRule-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: THE SCORE ON ANY HARVESTED BLOCK. Both caches exist and neither is opened. Nothing in dB.");
process.exit(fails ? 1 : 0);
