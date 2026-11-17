// WebGLEngine/brain/crabDrift4xAgg.mjs -- aggregates the Round 26 runs (720 x 240). Run: node brain/crabDrift4xAgg.mjs
import fs from "node:fs";
const d = "brain/crabDrift4xRuns/", R = {};
for (const f of fs.readdirSync(d).filter((x) => !x.includes("pilot"))) { const r = JSON.parse(fs.readFileSync(d + f, "utf8")); R[[r.scope, r.g, r.which].join("|")] = r.cells; }
const ratio = (x, p) => (x === null || p === null ? null : x / p), q = (v) => (v === null ? "none" : v.toFixed(2));
const strictCell = (c, key) => c.plain !== null && c.static !== null && ratio(c.static, c.plain) >= 0.85 && ratio(c.static, c.plain) <= 1.2 && (c.moving === null || ratio(c.moving, c.plain) >= 1.15);
const relaxedCell = (c) => c.plain !== null && ((c.moving === null && c.static !== null) || (c.moving !== null && c.static !== null && ratio(c.moving, c.plain) >= ratio(c.static, c.plain) + 0.1));
const base = {}; for (const w of ["5", "10", "9"]) base[w] = R[["segment", 0, w].join("|")];
console.log("construction 5 (r/v 0.2, 0.4): moving ratio / static ratio / UP ratio; plain size vs gain-free; receding alarm");
const summary = [];
for (const scope of ["segment"]) for (const g of [0, 10, 100, 300]) {
    const c5 = R[[scope, g, "5"].join("|")], c10 = R[[scope, g, "10"].join("|")], c9 = R[[scope, g, "9"].join("|")], row = (cs) => cs.map((c) => `${q(ratio(c.moving, c.plain))}/${q(ratio(c.static, c.plain))}/${q(ratio(c.up, c.plain))}`).join("  ");
    const strict5 = c5.every((c) => strictCell(c)), strict10 = c10.every((c) => strictCell(c)), strict9 = strictCell(c9[0]) , rel5 = c5.every(relaxedCell), rel10 = c10.every(relaxedCell), plainKept = c5.every((c, i) => Math.abs(c.plain / base["5"][i].plain - 1) <= 0.05) && c10.every((c, i) => Math.abs(c.plain / base["10"][i].plain - 1) <= 0.05), recedes = [...c5, ...c10, c9[0]].every((c) => c.recede);
    summary.push({ scope, g, strict: strict5 && strict10 && strict9, rel: rel5 && rel10, plainKept, recedes, mv5: c5.map((c) => ratio(c.moving, c.plain)), st5: c5.map((c) => ratio(c.static, c.plain)) });
    console.log(`${scope.padEnd(7)} g ${String(g).padEnd(3)} R5 ${row(c5)} | R10 ${row(c10)} | R9 time ratios ${q(ratio(c9[0].moving, c9[0].plain))}/${q(ratio(c9[0].static, c9[0].plain))}/${q(ratio(c9[0].up, c9[0].plain))} | strict ${strict5 && strict10 && strict9} relaxed(5,10) ${rel5 && rel10} | plain kept ${plainKept} | all recede alarm ${recedes}`);
}
console.log(`\nSTRICT in all three: ${summary.filter((x) => x.g > 0 && x.strict).map((x) => x.scope + " g " + x.g).join(", ") || "none"}; RELAXED (5 and 10): ${summary.filter((x) => x.g > 0 && x.rel).map((x) => x.scope + " g " + x.g).join(", ") || "none"}`);
