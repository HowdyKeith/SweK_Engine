#!/usr/bin/env node
// WebGLEngine/tools/ship/genGateRule.mjs -- v4702: the parameter-free rule render/gate-rule-preregistration.md
// declares, and the measurement it will be put through.
//
// *** A RULE WITH NOTHING FITTED HAS NOTHING TO TRANSFER. *** Five learned designs (H1-H5) failed on content they
// did not train on, and transfer is a learning problem. This score is fixed by the physics of the choice: a
// cross-fade blends each pixel IN PLACE, which is exactly the no-motion hypothesis, and generation wins where
// motion explains the change between the two real frames better than standing still does. So the score is how
// much the chain's best motion candidate beats no motion at all -- log(sadStill / min(sadApp, sadFlow)) -- read
// off quantities the chain has already computed before any middle frame exists. No weight, no threshold, no
// scaler, no seed.
//
// NOT RUN on FSR data in the round that commits it. tools/ship/genGateRule-selfcheck.mjs gates it on synthetic
// frames only; the measurement is the next round's.
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { auc, N_FEATURES } from "../../render/genGate.mjs";
import { RULE_KEYS, declared, readDoc, usableFolds } from "./foldStats.mjs";
import { pairedBoth } from "./pairedStats.mjs";
import { jointRows } from "./genGateFolds.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PREREG_H6 = "render/gate-rule-preregistration.md";
export const RESULT_H6 = "tools/ship/genGate-rule-result.json";
export const EPS = 1e-6;    // featuresV2's EPS, so the score is exactly the negation of its third column
// The two cells the document declares, each already harvested -- by v4699 at x2 and v4701 at x4.
export const CELLS = Object.freeze({
    "2": Object.freeze({ cache: "tools/ship/genGate-folds7.json.gz", result: "tools/ship/genGate-folds7-result.json" }),
    "4": Object.freeze({ cache: "tools/ship/genGate-absolute4.json.gz", result: "tools/ship/genGate-absolute4-result.json" }),
});

/** The score: how much the best motion candidate beats no motion. Higher = generation more likely to win. */
export function ruleScore(sadApp, sadFlow, sadStill) {
    return Math.log((sadStill + EPS) / (Math.min(sadApp, sadFlow) + EPS));
}

/** A cell is only the cell its name says if the run that harvested it recorded that speed. */
export function checkCell(speed, recordedDeclared) {
    if (!CELLS[speed]) throw new Error(`genGateRule.checkCell: no cache for speed x${speed}`);
    if (!recordedDeclared || String(recordedDeclared.speed) !== String(speed))
        throw new Error(`genGateRule.checkCell: the x${speed} cache's run recorded speed ${recordedDeclared && recordedDeclared.speed}`);
    return true;
}

/**
 * The cache must be the one its result was computed from: every scene's usable-block and positive counts must
 * equal the counts that run recorded. checkCell alone ties the RESULT file to the speed; without this, a cache path
 * pointed at the other cell would be scored under this cell's name and nothing would notice.
 */
export function matchesMeta(byScene, meta, scenes) {
    const bad = [];
    for (const s of scenes) {
        const r = jointRows(byScene[s] || []), pos = r.y.reduce((a, v) => a + v, 0);
        if (!meta[s] || meta[s].n !== r.n || meta[s].pos !== pos) bad.push(`${s} ${pos}/${r.n} vs ${meta[s] ? meta[s].pos + "/" + meta[s].n : "none"}`);
    }
    if (bad.length) throw new Error(`genGateRule.matchesMeta: the cache is not the one its result recorded -- ${bad.join("; ")}`);
    return true;
}

export function loadCell(speed, scenes) {
    // Refused BEFORE any file is touched: the first draft read CELLS[speed].result first, so an undeclared speed
    // died on a TypeError about `undefined` instead of saying which cell was missing.
    if (!CELLS[speed]) throw new Error(`genGateRule.loadCell: no cache for speed x${speed}`);
    const c = CELLS[speed];
    const res = JSON.parse(fs.readFileSync(path.join(ENG, c.result), "utf8"));
    checkCell(speed, res.declared);
    const byScene = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ENG, c.cache))).toString("utf8"));
    matchesMeta(byScene, res.meta, scenes);
    return byScene;
}

/**
 * Per-scene AUC of the score against the label, on the SAME block population every learned arm used (finite in
 * both feature sets). The score reads the first three ABSOLUTE columns and nothing else.
 */
export function sceneAucs(byScene, scenes) {
    const out = {};
    for (const s of scenes) {
        const r = jointRows(byScene[s]), NF = N_FEATURES;
        const sc = new Float64Array(r.n);
        for (let i = 0; i < r.n; i++) sc[i] = ruleScore(r.x1[i * NF], r.x1[i * NF + 1], r.x1[i * NF + 2]);
        const pos = r.y.reduce((a, v) => a + v, 0);
        out[s] = { n: r.n, pos, neg: r.n - pos, auc: auc(sc, r.y).auc };
    }
    return out;
}

/** One cell: d = AUC - 0.5 per usable scene, paired t AND exact sign, one-sided, positive mean. */
export function h6Cell(per, d) {
    const { usable, excluded } = usableFolds(per, d);
    if (usable.length < d.minFolds) return { usable, excluded, reportable: false, cleared: false,
        why: `${usable.length} usable scenes; the sign test cannot reach ${d.alpha} below ${d.minFolds}` };
    const diffs = usable.map((s) => per[s].auc - 0.5);
    if (!diffs.every(Number.isFinite)) throw new Error("genGateRule.h6Cell: an undefined AUC on a usable scene");
    const test = pairedBoth(diffs, d.alpha);
    return { usable, excluded, reportable: true, diffs, test, cleared: test.cleared && test.t.mean > 0 };
}

/** H6: EVERY declared cell clears -- an intersection-union test over the speeds. */
export function h6(perBySpeed, d) {
    const cells = Object.fromEntries(d.speeds.map((sp) => [sp, h6Cell(perBySpeed[sp], d)]));
    const reportable = d.speeds.every((sp) => cells[sp].reportable);
    return { cells, reportable, supported: reportable && d.speeds.every((sp) => cells[sp].cleared) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const d = declared(readDoc(PREREG_H6), RULE_KEYS);
    const per = Object.fromEntries(d.speeds.map((sp) => [sp, sceneAucs(loadCell(sp, d.scenes), d.scenes)]));
    const out = { declared: d, per, h6: h6(per, d) };
    fs.writeFileSync(path.join(ENG, RESULT_H6), JSON.stringify(out, null, 1) + "\n");
    console.log(JSON.stringify({ h6: out.h6.reportable ? out.h6.supported : "not reportable" }));
}
