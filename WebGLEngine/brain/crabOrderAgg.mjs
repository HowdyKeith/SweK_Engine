// WebGLEngine/brain/crabOrderAgg.mjs -- aggregates Round 29. Run: node brain/crabOrderAgg.mjs
import fs from "node:fs";
const d = "brain/crabOrderRuns/", R = {}; for (const f of fs.readdirSync(d)) { const r = JSON.parse(fs.readFileSync(d + f, "utf8")); R[r.g + "|" + r.wc] = r; }
const CON = [0.2, 0.4, 0.6, 0.8, 1], near = (a, b, t) => Math.abs(a - b) <= t, rr = (s) => (s === null ? 0 : (74 - s) / 74);
for (const g of [0, 300]) {
    const r = (c, k) => rr(R[g + "|" + c][k]), gr = (c) => r(c, "none"), st = (c) => r(c, "static"), mv = (c) => r(c, "moving");
    console.log(`g ${g}: r gray/static/moving ` + CON.map((c) => `${c}: ${gr(c).toFixed(3)}/${st(c).toFixed(3)}/${mv(c).toFixed(3)}`).join("  "));
    const C1 = gr(0.2) <= gr(0.6) + 0.05 && gr(0.6) <= gr(1) + 0.05, C2 = gr(0.2) - st(0.2) > 0.1 && gr(0.2) - mv(0.2) > 0.1 && near(st(0.2), mv(0.2), 0.1), C3 = [0.6, 0.8, 1].every((c) => near(gr(c), st(c), 0.1)), C4 = [0.6, 0.8, 1].filter((c) => gr(c) - mv(c) > 0.1).length >= 2;
    console.log(`  gray-static at 0.2: ${(gr(0.2) - st(0.2)).toFixed(3)}, gray-moving at 0.2: ${(gr(0.2) - mv(0.2)).toFixed(3)}, static-moving at 0.2: ${(st(0.2) - mv(0.2)).toFixed(3)}; gray-moving at 0.6/0.8/1: ${[0.6, 0.8, 1].map((c) => (gr(c) - mv(c)).toFixed(3)).join("/")}`);
    console.log(`  C1 ${C1} C2 ${C2} C3 ${C3} C4 ${C4} -> ${[C1, C2, C3, C4].filter(Boolean).length}/4`);
}
