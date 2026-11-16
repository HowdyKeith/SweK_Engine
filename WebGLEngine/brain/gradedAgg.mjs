// WebGLEngine/brain/gradedAgg.mjs -- aggregates the Round 17 held-out runs (brain/gradedRuns/held). Run: node brain/gradedAgg.mjs
import fs from "node:fs";
const d = "brain/gradedRuns/held/", R = {};
for (const f of fs.readdirSync(d)) { const r = JSON.parse(fs.readFileSync(d + f, "utf8")); R[[r.scope, r.ls, r.g, r.wc, r.k].join("|")] = r.spikes; }
const near = (a, b, t) => Math.abs(a - b) <= t, animal = { 0.6: 0.81, 0.8: 0.70 };
for (const [scope, ls, g] of [["global", 255, 10], ["global", 5, 100], ["local", 255, 10], ["local", 5, 30]]) {
    const sp = (wc, k) => R[[scope, ls, g, wc, k].join("|")], mx = Math.max(...[0.2, 0.4, 0.6, 0.8, 1].flatMap((c) => ["none", "static", "down"].map((k) => sp(c, k)))), r = (c, k) => sp(c, k) / mx;
    console.log(`\n${scope} lum${ls} g ${g}: spikes gray/static/moving by contrast: ` + [0.2, 0.4, 0.6, 0.8, 1].map((c) => `${c}: ${sp(c, "none")}/${sp(c, "static")}/${sp(c, "down")}`).join("  ") + `; up at 1: ${sp(1, "up")}`);
    const rat = (c, k) => (sp(c, "none") ? sp(c, k) / sp(c, "none") : NaN);
    const P1 = rat(1, "static") >= 0.85 && rat(1, "static") <= 1.15, P2 = [0.6, 0.8].every((c) => near(rat(c, "down"), animal[c], 0.15)), P3a = near(rat(0.2, "down"), 1, 0.15) && near(rat(0.2, "static"), 1, 0.15), P3b = rat(0.2, "down") <= 0.7 && rat(0.2, "static") <= 0.7, P4 = sp(1, "up") / sp(1, "none") - rat(1, "down") >= 0.05;
    const g_ = (c) => r(c, "none"), s_ = (c) => r(c, "static"), m_ = (c) => r(c, "down");
    const C1 = g_(0.2) <= g_(0.6) + 0.05 && g_(0.6) <= g_(1) + 0.05, C2 = g_(0.2) - s_(0.2) > 0.1 && g_(0.2) - m_(0.2) > 0.1 && near(s_(0.2), m_(0.2), 0.1), C3 = [0.6, 0.8, 1].every((c) => near(g_(c), s_(c), 0.1)), C4 = [0.6, 0.8, 1].filter((c) => g_(c) - m_(c) > 0.1).length >= 2, score = [C1, C2, C3, C4].filter(Boolean).length;
    console.log(`  moving/gray: ${[0.2, 0.4, 0.6, 0.8, 1].map((c) => c + ": " + rat(c, "down").toFixed(2)).join("  ")} (animal 0.33 at 0.2, 0.98 at 0.4, 0.81, 0.70, 0.725)`);
    console.log(`  static/gray: ${[0.2, 0.4, 0.6, 0.8, 1].map((c) => c + ": " + rat(c, "static").toFixed(2)).join("  ")} (animal 0.33, 0.85, 0.97, 1.00, 0.99)`);
    console.log(`  P1 static kept ${P1} | P2 held-out contrasts ${P2} | P3 low contrast not reproduced (255) ${P3a} / reproduced (5) ${P3b} | P4 up less inhibited ${P4} | ordering C1 ${C1} C2 ${C2} C3 ${C3} C4 ${C4} score ${score}/4`);
}
