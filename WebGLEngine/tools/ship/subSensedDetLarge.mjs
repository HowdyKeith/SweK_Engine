// WebGLEngine/tools/ship/subSensedDetLarge.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 60" of brain/SENSED_NAV_WIP.md and its SECOND REGISTRATION, the gate is tools/ship/subSensedDetLarge-selfcheck.mjs)
//
// THE LARGER SET, READ TOGETHER: follow-up 60 flies three sets of 180 scenarios (HELD64, HELD65, HELD66: large-set-a, large-set-b, large-set-c of tools/ship/subSensedDetSpecs.mjs, one file each) and reads them as ONE study of 540 scenarios. This module puts the three files together and reads them with the study engine's own functions (summarize, judge, table, verdictText), so the bar and the eight predictions BH1 to BH8 are scored on the pooled counts, and adds what the registration said is reported and not predicted: for each feature the pooled paired difference of the arm WITH it minus the arm without it (the sign of follow-up 59), its value in each of the three sets, the discordant scenarios and the exact two-sided sign test (POST HOC: 540 paired scenarios, no correction for the number of tests).
//   node tools/ship/subSensedDetLarge.mjs            prints the report (the three files must all exist)
//   node tools/ship/subSensedDetLarge.mjs --write    writes brain/subSensedDetLarge.txt, ONCE (it refuses to overwrite it: the table is read once)
// A file is checked before it is read: 22 arms x 180 flights, every row of the study and the set it should be, every arm 180 rows. Anything else is an error naming the file; nothing is read from a partial set.
// Pure but for the reading of the files named by the specs. No clock, no random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as St from "./subSensedDetStudy.mjs";

export const STUDIES = Object.freeze(["large-set-a", "large-set-b", "large-set-c"]);
export const PER_ARM = 180;   // 60 seeds of each of the three kinds
/** [label, arm with the feature, arm without, seas]: the effect is reached(with) minus reached(without), as in follow-up 59. */
export const FEATURES = Object.freeze([
    ["the evidence hold (F8)", "m23e30", "inc", ["D30", "R3D30", "WD30L", "P"]],
    ["the gate on the hold (F4)", "m23re30", "m23e30", ["R3D30", "WD30L", "P"]],
    ["the first-reading near mark (F6)", "rm23e30", "m23e30", ["R3D30", "WD30L", "P"]],
    ["the run of three (F7)", "m33e30", "m23e30", ["R3D30", "WD30L", "P"]],
    ["the confirmed clear (F3)", "m23e30k", "m23e30", ["R3D30", "WD30L", "P"]],
].map((f) => Object.freeze(f)));

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const nameOfLine = (f) => path.basename(f);

/** The three sets' flights, each file checked: { sets: [{ study, held, file, rows }], runs: all rows in the order of the sets }. */
export function readLarge(root = REPO, read = (p) => fs.readFileSync(p, "utf8"), specs = St.SPECS) {
    const sets = [];
    for (const name of STUDIES) {
        const spec = specs[name], file = path.join(root, spec.out);
        let text;
        try { text = read(file); } catch { throw new Error(`subSensedDetLarge: ${spec.out} is missing: the three sets are read together, so none is read until all are flown`); }
        const rows = text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
        if (rows.length !== spec.arms.length * PER_ARM) throw new Error(`subSensedDetLarge: ${spec.out} has ${rows.length} flights, not ${spec.arms.length} arms x ${PER_ARM}`);
        const bad = rows.find((r) => r.study !== name || r.set !== spec.held);
        if (bad) throw new Error(`subSensedDetLarge: ${spec.out} has a row of study ${bad.study} set ${bad.set}, not ${name} ${spec.held}`);
        for (const arm of spec.arms) { const n = rows.filter((r) => r.arm === arm).length; if (n !== PER_ARM) throw new Error(`subSensedDetLarge: ${spec.out} has ${n} flights of ${arm}, not ${PER_ARM}`); }
        sets.push({ study: name, held: spec.held, file: spec.out, rows });
    }
    return { sets, runs: sets.flatMap((s) => s.rows) };
}

const choose = (n, k) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r; };
/** The exact two-sided sign test: g and l discordant scenarios; 2 x P(X <= min) for X ~ Binomial(g + l, 1/2), at most 1. */
export function signP(g, l) {
    const n = g + l;   // no discordant scenario: the one term is 1, twice it is 2, and the cap makes it 1
    let s = 0;
    for (let i = 0; i <= Math.min(g, l); i++) s += choose(n, i) / Math.pow(2, n);
    return Math.min(1, 2 * s);
}
/** The paired difference of `x` against `y` on the scenarios (kind and seed) both flew: per set { effect, g, l } (g: x reached and y not; l: y reached and x not; effect = reached(x) - reached(y)) and pooled { effect, g, l, p }. */
export function paired(sets, x, y) {
    const per = sets.map((s) => {
        const key = (r) => `${r.kind}|${r.seed}`, X = new Map(), Y = new Map();
        for (const r of s.rows) { if (r.arm === x) X.set(key(r), r.reached === true); else if (r.arm === y) Y.set(key(r), r.reached === true); }
        let g = 0, l = 0, ex = 0, ey = 0;
        for (const [k, a] of X) { const b = Y.get(k); if (b === undefined) continue; if (a) ex++; if (b) ey++; if (a && !b) g++; if (!a && b) l++; }
        return { effect: ex - ey, g, l };
    });
    const g = per.reduce((a, r) => a + r.g, 0), l = per.reduce((a, r) => a + r.l, 0);
    return { per, pooled: { effect: per.reduce((a, r) => a + r.effect, 0), g, l, p: signP(g, l) } };
}

const fp = (p) => (p < 0.0001 ? "<0.0001" : p.toFixed(4));
const sg = (v) => (v > 0 ? "+" : "") + v;
/** The report of the three sets read together. */
export function report(large) {
    const spec = St.SPECS[STUDIES[0]], sum = St.summarize(large.runs, spec), j = St.judge(sum, spec);
    const L = [];
    L.push(`LARGER SET (follow-up 60): ${large.sets.length} sets (${large.sets.map((s) => s.held).join(", ")}), ${large.runs.length / spec.arms.length} scenarios of each arm, ${spec.arms.length} arms, READ TOGETHER`);
    L.push("");
    L.push(St.table(sum, spec, "the three sets pooled (the three kinds, 60 seeds of each in each set)"));
    L.push("");
    L.push(St.verdictText(j, spec));
    L.push("");
    L.push("POST HOC (nothing here is a registered prediction): the arm WITH the feature minus the arm without it, pooled over the 540 paired scenarios, and in each set; discordant scenarios g (with reached, without not) / l; the exact two-sided sign test, no correction for the number of tests");
    L.push("feature | sea | with minus without | pooled | HELD64 / HELD65 / HELD66 | g / l | p");
    for (const [label, w, wo, seas] of FEATURES) for (const sea of seas) {
        const r = paired(large.sets, `${w}@${sea}`, `${wo}@${sea}`);
        L.push(`${label} | ${sea} | ${w} minus ${wo} | ${sg(r.pooled.effect)} | ${r.per.map((q) => sg(q.effect)).join(" / ")} | ${r.pooled.g} / ${r.pooled.l} | ${fp(r.pooled.p)}`);
    }
    return L.join("\n") + "\n";
}

/** The command: no flag prints the report; --write writes brain/subSensedDetLarge.txt once and refuses to overwrite it; any other flag is a usage error (exit 1); a missing or malformed file is exit 2. */
export function main(argv, io = {}) {
    const out = io.out || path.join(REPO, "brain/subSensedDetLarge.txt"), exists = io.exists || fs.existsSync, writeFile = io.writeFile || fs.writeFileSync;
    const log = io.log || console.log, err = io.err || console.error, print = io.print || ((t) => process.stdout.write(t)), go = io.run || (() => report(readLarge())), write = argv.includes("--write"), unknown = argv.filter((a) => a !== "--write");
    if (unknown.length) { err(`usage: node tools/ship/subSensedDetLarge.mjs [--write]   (not understood: ${unknown.join(" ")})`); return 1; }
    if (write && exists(out)) { err(`subSensedDetLarge: ${nameOfLine(out)} exists; the table is read once and is not overwritten`); return 2; }
    let text;
    try { text = go(); } catch (e) { err(String((e && e.message) || e)); return 2; }
    if (write) { writeFile(out, text); log(`wrote ${nameOfLine(out)}`); } else print(text);
    return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
