// WebGLEngine/tools/ship/subReconcilePostHoc.mjs -- UNNUMBERED (export-free on purpose: it is a command, run after the HELD13 record exists)
//
// THE POST HOC READS OF FOLLOW-UP 13 (brain/SUB_FIELD_NAV_WIP.md, "RESULT OF FOLLOW-UP 13"): none of it registered, none of it moves the verdict.
//   node tools/ship/subReconcilePostHoc.mjs      reads brain/subReconcileHeld13.jsonl and the two series' stored reference flights and prints: the five-way outcome agreement of each
//   flyer with the other's stored flights and the missions that differ, every reference flight of the round pooled by chord band (one curve?), the median joules a metre, and the slow arm's timeouts.
// Pure: reads files, prints. No clock, no Math.random.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const rd = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
const rows = rd("brain/subReconcileHeld13.jsonl").trim().split("\n").map((l) => JSON.parse(l));
const stM = rd("brain/navMissionHeld83.jsonl").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.arm === "any+predict+edge+yield");
const stB = rd("brain/subMissionHeld10.jsonl").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.arm === "any+predict+edge+yield");
const norm = (s) => ({ complete: "completed", completed: "completed", "energy-out": "energy-out", flat: "energy-out" }[s] || s);
const cmp = (flown, stored, label) => {
  const by = new Map(stored.map((r) => [r.seed, norm(r.status)])); let same = 0; const diffs = [];
  for (const f of flown) { const o = by.get(f.seed); if (o === f.outcome) same++; else diffs.push(`${f.seed}: stored ${o} / other flyer ${f.outcome}`); }
  console.log(label, "five-way outcome agreement", same + "/" + flown.length, "; disagreeing:", diffs.join("; ") || "none");
};
const A1 = rows.filter((r) => r.part === "A1"), A2 = rows.filter((r) => r.part === "A2"), B = rows.filter((r) => r.part === "B" && r.arm === "any+predict+edge+yield");
cmp(A1, stM, "A1 (B's flyer vs main's stored)"); cmp(A2, stB, "A2 (main's flyer vs B's stored)");
// one curve: every reference flight of the round pooled, by chord band; energy-out and completed rates
const all = [...A1, ...A2, ...B]; const bands = [[600, 750], [750, 850], [850, 950], [950, 1050], [1050, 1200]];
console.log("\nONE CURVE? every reference flight of this round pooled (A1 + A2 + B), by chord band");
for (const [lo, hi] of bands) { const g = all.filter((r) => r.chord >= lo && r.chord < hi); const c = (o) => g.filter((r) => r.outcome === o).length; console.log(`[${lo},${hi})`.padEnd(12), "n", String(g.length).padStart(3), " energy-out", String(c("energy-out")).padStart(3), `(${(100 * c("energy-out") / g.length).toFixed(0)}%)`, " completed", String(c("completed")).padStart(3), " collided/left", c("collided") + c("left")); }
// by source within the overlapping band 850-1050 (main's missions and B's bins 3): energy-out rate
for (const [lo, hi] of [[850, 950], [950, 1050]]) { const a = A1.filter((r) => r.chord >= lo && r.chord < hi), b = B.filter((r) => r.chord >= lo && r.chord < hi); const f = (g) => `${g.filter((r) => r.outcome === "energy-out").length}/${g.length}`; console.log(`band [${lo},${hi}): main's missions (A1) ${f(a)} energy-out; series B's generator (HELD13 bins) ${f(b)}`); }
// the energy a flight spent per metre of path (reference), by set
const jpm = (g) => { const x = g.filter((r) => r.path > 0 && r.energy).map((r) => r.energy / r.path).sort((p, q) => p - q); return x.length ? x[x.length >> 1].toFixed(0) : "n/a"; };
console.log("\nmedian J per metre of path, reference: A1", jpm(A1), " A2", jpm(A2), " bins", jpm(B));
// slow arm: timeouts vs energy
const S = rows.filter((r) => r.part === "B" && r.arm.endsWith("@2.5")); for (let k = 1; k <= 4; k++) { const g = S.filter((r) => r.bin === k); const med = g.filter((r) => r.t).map((r) => r.t).sort((a, b) => a - b); console.log(`slow arm bin ${k}: completed ${g.filter((r) => r.outcome === "completed").length}, timeout ${g.filter((r) => r.outcome === "timeout").length}, energy-out ${g.filter((r) => r.outcome === "energy-out").length}, median finishing time of those that finished ${med.length ? med[med.length >> 1].toFixed(0) + " s" : "n/a"}`); }
