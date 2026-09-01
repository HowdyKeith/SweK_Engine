// tools/roundhouse/gateLadders.mjs -- v4303
//
// Run: node tools/roundhouse/gateLadders.mjs   (~1s -- it reads files, it does not build devices)
//
// LADDERS TYPED INTO A GATE'S OWN PROSE.
//
// headerLadders.mjs asks the question of BIND headers and is now exhausted -- every ladder it still reports
// belongs to a device already adjudicated. THE SELFCHECKS WERE NEVER SWEPT, and they are the richer target:
// a bind header DESCRIBES, a gate ASSERTS, so a stale number in an assertion name is a claim a gate is making.
//
// Found by hand at v4194 in cflBind-selfcheck alone: "0.450, 0.600, 0.600" in an assertion NAME, "45x", and
// "0.003 / 0.002 / 0.001" in an evidence string -- three, in one file, all stale.
//
// *** SCANNED: COMMENTS AND STRING LITERALS ONLY, NEVER CODE. *** A number in a condition is a THRESHOLD and
// is supposed to be typed; a number in a name or an evidence string is a MEASUREMENT that has been copied out
// of a run and can rot. Scanning code would drown the real hits in tolerances.
// MEASURED at v4303: 815 gate files scanned, 26 ladders in gate prose the freeze does not fully hold.
// The first adjudicated was blackHoleBind's escape-convergence ladder, and ALL THREE RUNGS WERE STALE:
// "0.5717/0.5730/0.5766 at 200/400/800" re-runs at 0.573792/0.573792/0.575180, the residual at the default is
// 0.38% and not the 0.13% quoted, and THE FIRST TWO RUNGS ARE NOW BIT-IDENTICAL -- a monotone convergence that
// has gone flat over two of its three steps.
//
// *** THE SAME CAVEAT AS headerLadders.mjs, AND ONE MORE. *** The reference is lab-results-baseline.json, which
// is mid-drift with a re-freeze pending, so this is a REPORT and not a gate. And where a gate's filename does
// not map to a device (marked * in the output) the comparison falls back to EVERY watched value in the lab,
// which is much looser and produces the weaker half of the list. A ZERO HERE WOULD MEAN "NONE FOUND IN WHAT
// WAS OPENED", NEVER "NONE".
//
// A KNOWN FALSE POSITIVE, INHERITED: a re-measurement record is itself a ladder. This file's own note about
// blackHole's numbers would be flagged by it, as would the v4194 comment in stabilityBind-selfcheck that
// quotes the values it was correcting. headerLadders.mjs deduplicates identical series per file; that helps
// and does not fix the case where a correction quotes the old series beside the new one.

import fs from "node:fs";
import path from "node:path";

const ROOT = "/home/user/SweK_Engine/WebGLEngine";
const RH = path.join(ROOT, "tools/roundhouse");
const base = JSON.parse(fs.readFileSync(path.join(RH, "lab-results-baseline.json"), "utf8"));

const ALL = [];
const eat = (v) => {
    if (typeof v === "number" && Number.isFinite(v)) ALL.push(v);
    else if (Array.isArray(v)) v.forEach(eat);
    else if (v && typeof v === "object") Object.values(v).forEach(eat);
};
const perDevice = new Map();
for (const [k, row] of Object.entries(base.pairs || {})) {
    if (!row.outputs) continue;
    const d = k.split("/")[0];
    const before = ALL.length; eat(row.outputs);
    if (!perDevice.has(d)) perDevice.set(d, []);
    perDevice.get(d).push(...ALL.slice(before));
}

const sig = (x, n) => { if (x === 0) return 0;
    const f = Math.pow(10, n - Math.ceil(Math.log10(Math.abs(x)))); return Math.round(x * f) / f; };
const NUM = String.raw`-?\d+\.\d+e[+-]?\d+|-?\d+e[+-]?\d+|-?\d+\.\d+|-?\d+`;
// *** v4304 -- THIS COUNTED LEADING ZEROS AS SIGNIFICANT, AND IT MATTERED TWICE. *** It read the digits of
// "0.005" as FOUR and of "0.0000091" as SIX, where they carry one and two. Two consequences, and the second
// is the worse: the >=4-figure filter let INPUT LISTS through (inspiral's "safety 0.02/0.01/0.005" was flagged
// as a measurement ladder), and sig() then compared such a token against the freeze at four figures instead of
// one -- FAR STRICTER THAN INTENDED, so ladders that ARE held could be reported unwatched. A detector whose
// precision estimate is wrong reports both kinds of error at once.
const digitsOf = (t) => {
    const m = t.replace(/^[+-]/, "").replace(/e[+-]?\d+$/i, "").replace(".", "").replace(/^0+/, "");
    return Math.min(Math.max(m.length, 1), 6);
};

/** comment lines and string literals -- the prose half of a gate, never its conditions */
function proseOf(src) {
    const out = [];
    for (const L of src.split("\n")) {
        const c = L.match(/\/\/(.*)$/);
        if (c) out.push(c[1]);
    }
    for (const m of src.matchAll(/"((?:[^"\\]|\\.)*)"/g)) out.push(m[1]);
    return out.join("\n");
}

const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (/-selfcheck\.mjs$/.test(e.name)) files.push(p);
} })(path.join(ROOT, "tools"));

const rows = [];
for (const f of files) {
    const stem = path.basename(f).replace(/-selfcheck\.mjs$/, "").replace(/Bind$/, "").toLowerCase();
    const watched = perDevice.get(stem) || perDevice.get(stem.replace(/device$/, "")) || ALL;
    const scoped = perDevice.has(stem);
    const text = proseOf(fs.readFileSync(f, "utf8")).replace(/\bv\d{3,4}\b/g, " ");
    const seen = new Set();
    for (const m of text.matchAll(new RegExp(`(?:${NUM})(?:\\s*[/,]\\s*(?:${NUM}))+`, "gi"))) {
        const toks = m[0].match(new RegExp(NUM, "gi")) || [];
        if (toks.length < 3) continue;
        const vals = toks.map(Number).filter(Number.isFinite);
        if (vals.length < 3) continue;
        if (vals.every((v) => Number.isInteger(v) && v > 1900 && v < 2100)) continue;
        if (!toks.some((t) => digitsOf(t) >= 4) || vals.every((v) => Number.isInteger(v))) continue;
        const series = m[0].trim().replace(/\s+/g, " ");
        if (seen.has(series)) continue; seen.add(series);
        const n = toks.filter((t) => watched.some((w) => sig(w, digitsOf(t)) === sig(Number(t), digitsOf(t)))).length;
        if (n < toks.length) rows.push({ file: path.basename(f), scoped, series, rungs: toks.length, watched: n });
    }
}
rows.sort((a, b) => (a.watched / a.rungs) - (b.watched / b.rungs));
for (const r of rows.slice(0, 40))
    console.log(`  ${r.file.replace("-selfcheck.mjs","").padEnd(24)} ${r.watched}/${r.rungs}${r.scoped ? " " : "*"}  ${r.series.slice(0, 62)}`);
console.log(`\n${files.length} gate files scanned, ${rows.length} ladders in gate prose not fully held by the freeze.`);
console.log("* = filename did not map to a device, compared against EVERY watched value in the lab (looser).");
