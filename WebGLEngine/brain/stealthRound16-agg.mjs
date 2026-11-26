// WebGLEngine/brain/stealthRound16-agg.mjs -- aggregates the Round 16 runs (JSON files in a directory given as argv[2]). Run: node brain/stealthRound16-agg.mjs <dir>
import fs from "node:fs";
import path from "node:path";
const dir = process.argv[2], runs = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
const U = runs.find((r) => r.scope === "U"), near = (a, b, t) => Math.abs(a - b) <= t, rows = [];
for (const r of runs.filter((x) => x.scope !== "U").sort((a, b) => (a.scope < b.scope ? -1 : a.scope > b.scope ? 1 : a.g - b.g))) {
    const rat = (rv, k) => r.A[rv][k] / r.A[rv].none, ret = (rv) => r.A[rv].none / U.A[rv].none, upc = (rv) => r.A[rv].up / U.A[rv].up;
    const sc = [];
    for (const ls of [255, 1]) { const raw = r.B[ls], mx = Math.max(...Object.values(raw)), rr = (wc, st) => (mx > 0 ? raw[`${wc}|${st}`] / mx : 0), g = (c) => rr(c, "none"), s = (c) => rr(c, "static"), m = (c) => rr(c, "moving");
        const C1 = g(0.2) <= g(0.6) + 0.05 && g(0.6) <= g(1.0) + 0.05, C2 = g(0.2) - s(0.2) > 0.1 && g(0.2) - m(0.2) > 0.1 && near(s(0.2), m(0.2), 0.1), C3 = [0.6, 0.8, 1.0].every((c) => near(g(c), s(c), 0.1)), C4 = [0.6, 0.8, 1.0].filter((c) => g(c) - m(c) > 0.1).length >= 2;
        sc.push({ ls, C1, C2, C3, C4, n: [C1, C2, C3, C4].filter(Boolean).length }); }
    const p1 = rat(0.05, "down") <= 0.6 && rat(0.1, "down") <= 0.6, p2 = ret(0.05) >= 0.8 && ret(0.1) >= 0.8 && upc(0.05) >= 0.9 && upc(0.1) >= 0.9, p4 = rat(0.05, "static") >= 0.8 && rat(0.1, "static") >= 0.8;
    rows.push({ scope: r.scope, g: r.g, down50: rat(0.05, "down"), down100: rat(0.1, "down"), stat50: rat(0.05, "static"), stat100: rat(0.1, "static"), ret50: ret(0.05), ret100: ret(0.1), up50: upc(0.05), up100: upc(0.1), p1, p2, p4, sc });
    console.log(`${r.scope.padEnd(6)} g ${String(r.g).padEnd(4)} down ${rat(0.05, "down").toFixed(3)} / ${rat(0.1, "down").toFixed(3)} | static ${rat(0.05, "static").toFixed(3)} / ${rat(0.1, "static").toFixed(3)} | plain kept ${ret(0.05).toFixed(3)} / ${ret(0.1).toFixed(3)} | up kept ${upc(0.05).toFixed(3)} / ${upc(0.1).toFixed(3)} | P1 ${p1 ? "Y" : "n"} P2 ${p2 ? "Y" : "n"} P4 ${p4 ? "Y" : "n"} | ordering ${sc.map((x) => `lum${x.ls}: ${x.n}/4`).join(", ")}`);
}
console.log(`\nungated U: down ${(U.A[0.05].down / U.A[0.05].none).toFixed(3)} / ${(U.A[0.1].down / U.A[0.1].none).toFixed(3)}`);
const best = rows.slice().sort((a, b) => Math.max(a.down50, a.down100) - Math.max(b.down50, b.down100))[0];
console.log(`best setting by the larger of the two moving-down ratios: ${best.scope} g ${best.g} (${Math.max(best.down50, best.down100).toFixed(3)})`);
const ok = rows.filter((x) => x.p1 && x.p2 && x.p4 && x.sc.some((s) => s.n === 4));
console.log(`settings satisfying predictions 1, 2, 4 and the ordering 4/4: ${ok.length ? ok.map((x) => `${x.scope} g ${x.g}`).join(", ") : "none"}`);
