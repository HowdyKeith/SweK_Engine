// WebGLEngine/tools/ship/subSensedDetSweep.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 61" of brain/SENSED_NAV_WIP.md and its SECOND REGISTRATION, the gate is tools/ship/subSensedDetSweep-selfcheck.mjs)
//
// THE SENSITIVITY SWEEP, READ TOGETHER: follow-up 61 flies three sets of 180 scenarios (HELD67, HELD68, HELD69: sweep-a, sweep-b, sweep-c of tools/ship/subSensedDetSpecs.mjs, one file each) and reads them as ONE study of 540 scenarios, as follow-up 60 did (tools/ship/subSensedDetLarge.mjs, whose exact sign test and paired difference this module uses). It puts the three files together, reads them with the study engine's own summarize, judge, table and verdictText (so the bar and the eight predictions BI1 to BI8 are scored on the pooled counts), and adds what the registration said is reported and not predicted: for each level of each constant the pooled paired difference of the arm at that level minus its base, in each of the three sets, the discordant scenarios and the exact two-sided sign test (POST HOC: 540 paired scenarios, no correction for the number of tests).
//   node tools/ship/subSensedDetSweep.mjs            prints the report (the three files must all exist)
//   node tools/ship/subSensedDetSweep.mjs --write    writes brain/subSensedDetSweep.txt, ONCE (it refuses to overwrite it: the table is read once)
// A file is checked before it is read: 26 arms x 180 flights, every row of the study and the set it should be, every arm 180 rows. Anything else is an error naming the file; nothing is read from a partial set.
// Pure but for the reading of the files named by the specs. No clock, no random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as St from "./subSensedDetStudy.mjs";
import { signP, paired } from "./subSensedDetLarge.mjs";

export const STUDIES = Object.freeze(["sweep-a", "sweep-b", "sweep-c"]);
export const PER_ARM = 180;   // 60 seeds of each of the three kinds
/** [label, the arm at the level, its base, the seas]: the effect is reached(level) minus reached(base). */
export const LEVELS = Object.freeze([
    ["the near radius 40 m, on the base that barely uses it", "fn100f80g-n40", "fn100f80g"], ["the near radius 120 m, on the same base", "fn100f80g-n120", "fn100f80g"],
    ["the cap 15", "fn100f80g-c15", "fn100f80g"], ["the cap 60", "fn100f80g-c60", "fn100f80g"],
    ["the fraction 0.7", "fn100f80g-f70", "fn100f80g"], ["the fraction 0.9", "fn100f80g-f90", "fn100f80g"],
    ["the ghost's life 20", "fn100f80g-l20", "fn100f80g"], ["the ghost's life 180", "fn100f80g-l180", "fn100f80g"],
    ["the near radius 40 m, on the gate", "m23re30-n40", "m23re30"], ["the near radius 120 m, on the gate", "m23re30-n120", "m23re30"],
].map((l) => Object.freeze([...l, Object.freeze(["R3D30", "WD30L"])])));

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const nameOfLine = (f) => path.basename(f);

/** The three sets' flights, each file checked: { sets: [{ study, held, file, rows }], runs: all rows in the order of the sets }. */
export function readSweep(root = REPO, read = (p) => fs.readFileSync(p, "utf8"), specs = St.SPECS) {
    const sets = [];
    for (const name of STUDIES) {
        const spec = specs[name], file = path.join(root, spec.out);
        let text;
        try { text = read(file); } catch { throw new Error(`subSensedDetSweep: ${spec.out} is missing: the three sets are read together, so none is read until all are flown`); }
        const rows = text.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
        if (rows.length !== spec.arms.length * PER_ARM) throw new Error(`subSensedDetSweep: ${spec.out} has ${rows.length} flights, not ${spec.arms.length} arms x ${PER_ARM}`);
        const bad = rows.find((r) => r.study !== name || r.set !== spec.held);
        if (bad) throw new Error(`subSensedDetSweep: ${spec.out} has a row of study ${bad.study} set ${bad.set}, not ${name} ${spec.held}`);
        for (const arm of spec.arms) { const n = rows.filter((r) => r.arm === arm).length; if (n !== PER_ARM) throw new Error(`subSensedDetSweep: ${spec.out} has ${n} flights of ${arm}, not ${PER_ARM}`); }
        sets.push({ study: name, held: spec.held, file: spec.out, rows });
    }
    return { sets, runs: sets.flatMap((s) => s.rows) };
}

const fp = (p) => (p < 0.0001 ? "<0.0001" : p.toFixed(4));
const sg = (v) => (v > 0 ? "+" : "") + v;
/** The report of the three sets read together. */
export function report(sweep) {
    const spec = St.SPECS[STUDIES[0]], sum = St.summarize(sweep.runs, spec), j = St.judge(sum, spec);
    const L = [];
    L.push(`SENSITIVITY SWEEP (follow-up 61): ${sweep.sets.length} sets (${sweep.sets.map((s) => s.held).join(", ")}), ${sweep.runs.length / spec.arms.length} scenarios of each arm, ${spec.arms.length} arms, READ TOGETHER`);
    L.push("");
    L.push(St.table(sum, spec, "the three sets pooled (the three kinds, 60 seeds of each in each set)"));
    L.push("");
    L.push(St.verdictText(j, spec));
    L.push("");
    L.push("POST HOC (nothing here is a registered prediction): the arm at the level minus its base, pooled over the 540 paired scenarios, and in each set; discordant scenarios g (level reached, base not) / l; the exact two-sided sign test, no correction for the number of tests");
    L.push("level | sea | level minus base | pooled | HELD67 / HELD68 / HELD69 | g / l | p");
    for (const [label, arm, base, seas] of LEVELS) for (const sea of seas) {
        const r = paired(sweep.sets, `${arm}@${sea}`, `${base}@${sea}`);
        L.push(`${label} | ${sea} | ${arm} minus ${base} | ${sg(r.pooled.effect)} | ${r.per.map((q) => sg(q.effect)).join(" / ")} | ${r.pooled.g} / ${r.pooled.l} | ${fp(r.pooled.p)}`);
    }
    return L.join("\n") + "\n";
}

/** The command: no flag prints the report; --write writes brain/subSensedDetSweep.txt once and refuses to overwrite it; any other flag is a usage error (exit 1); a missing or malformed file is exit 2. */
export function main(argv, io = {}) {
    const out = io.out || path.join(REPO, "brain/subSensedDetSweep.txt"), exists = io.exists || fs.existsSync, writeFile = io.writeFile || fs.writeFileSync;
    const log = io.log || console.log, err = io.err || console.error, print = io.print || ((t) => process.stdout.write(t)), go = io.run || (() => report(readSweep())), write = argv.includes("--write"), unknown = argv.filter((a) => a !== "--write");
    if (unknown.length) { err(`usage: node tools/ship/subSensedDetSweep.mjs [--write]   (not understood: ${unknown.join(" ")})`); return 1; }
    if (write && exists(out)) { err(`subSensedDetSweep: ${nameOfLine(out)} exists; the table is read once and is not overwritten`); return 2; }
    let text;
    try { text = go(); } catch (e) { err(String((e && e.message) || e)); return 2; }
    if (write) { writeFile(out, text); log(`wrote ${nameOfLine(out)}`); } else print(text);
    return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
