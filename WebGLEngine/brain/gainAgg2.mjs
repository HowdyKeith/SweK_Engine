// WebGLEngine/brain/gainAgg2.mjs -- aggregates held-out runs of the contrast-normalised gain. Run: node brain/gainAgg2.mjs <dir> <lumScale> <g>
import fs from "node:fs";
const [dir, ls, g] = [process.argv[2], Number(process.argv[3]), process.argv[4]], R = {};
for (const f of fs.readdirSync(dir)) { const r = JSON.parse(fs.readFileSync(dir + "/" + f, "utf8")); if (r.ls === ls) R[[r.wc, r.k].join("|")] = r.cells[g]; }
const near = (a, b, t) => Math.abs(a - b) <= t, sp = (c, k) => R[[c, k].join("|")], rat = (c, k) => (sp(c, "none") ? sp(c, k) / sp(c, "none") : NaN);
const mx = Math.max(...[0.2, 0.4, 0.6, 0.8, 1].flatMap((c) => ["none", "static", "down"].map((k) => sp(c, k)))), r = (c, k) => sp(c, k) / mx;
console.log(`lumScale ${ls}, g ${g}: spikes gray/static/moving: ` + [0.2, 0.4, 0.6, 0.8, 1].map((c) => `${c}: ${sp(c, "none")}/${sp(c, "static")}/${sp(c, "down")}`).join("  ") + `; up at 1: ${sp(1, "up")}`);
console.log(`  moving/gray: ${[0.2, 0.4, 0.6, 0.8, 1].map((c) => c + ": " + rat(c, "down").toFixed(2)).join("  ")}   (animal 0.33, 0.98, 0.81, 0.70, 0.725)`);
console.log(`  static/gray: ${[0.2, 0.4, 0.6, 0.8, 1].map((c) => c + ": " + rat(c, "static").toFixed(2)).join("  ")}   (animal 0.33, 0.85, 0.97, 1.00, 0.99)`);
console.log(`  gray/gray(1): ${[0.2, 0.4, 0.6, 0.8, 1].map((c) => c + ": " + (sp(c, "none") / sp(1, "none")).toFixed(2)).join("  ")}   (animal 0.375, 0.59, 0.85, 1.0, 1.0)`);
const P4a = rat(1, "static") >= 0.85 && rat(1, "static") <= 1.15, P4b = near(rat(0.6, "down"), 0.81, 0.15) && near(rat(0.8, "down"), 0.70, 0.15), P5 = sp(1, "up") / sp(1, "none") - rat(1, "down") >= 0.05, allStatic = [0.2, 0.4, 0.6, 0.8, 1].every((c) => rat(c, "static") >= 0.85 && rat(c, "static") <= 1.15), low = rat(0.2, "static") <= 0.6 && rat(0.2, "down") <= 0.6;
const g_ = (c) => r(c, "none"), s_ = (c) => r(c, "static"), m_ = (c) => r(c, "down");
const C1 = g_(0.2) <= g_(0.6) + 0.05 && g_(0.6) <= g_(1) + 0.05, C2 = g_(0.2) - s_(0.2) > 0.1 && g_(0.2) - m_(0.2) > 0.1 && near(s_(0.2), m_(0.2), 0.1), C3 = [0.6, 0.8, 1].every((c) => near(g_(c), s_(c), 0.1)), C4 = [0.6, 0.8, 1].filter((c) => g_(c) - m_(c) > 0.1).length >= 2, score = [C1, C2, C3, C4].filter(Boolean).length;
console.log(`  static at 1 in [0.85,1.15]: ${P4a} | moving at 0.6 and 0.8 within 0.15: ${P4b} | up less inhibited (up/gray ${(sp(1, "up") / sp(1, "none")).toFixed(2)} vs down ${rat(1, "down").toFixed(2)}): ${P5} | static in range at every contrast: ${allStatic} | low-contrast stripes both <= 0.6: ${low} | ordering C1 ${C1} C2 ${C2} C3 ${C3} C4 ${C4} score ${score}/4`);
