// WebGLEngine/brain/gainAgg.mjs -- aggregates the Round 18 held-out runs (brain/gainRuns/held). Run: node brain/gainAgg.mjs
import fs from "node:fs";
const d = "brain/gainRuns/held/", R = {};
for (const f of fs.readdirSync(d)) { const r = JSON.parse(fs.readFileSync(d + f, "utf8")); R[[r.tauD, r.wc, r.k].join("|")] = { spikes: r.cells["10"], peak: r.peak, maxDs: r.maxDs }; }
const near = (a, b, t) => Math.abs(a - b) <= t;
for (const tau of [0, 0.2]) {
    const sp = (c, k) => R[[tau, c, k].join("|")].spikes, rat = (c, k) => (sp(c, "none") ? sp(c, k) / sp(c, "none") : NaN), mx = Math.max(...[0.2, 0.4, 0.6, 0.8, 1].flatMap((c) => ["none", "static", "down"].map((k) => sp(c, k)))), r = (c, k) => sp(c, k) / mx;
    console.log(`\ntauD ${tau}, lumScale 5, g 10: spikes gray/static/moving: ` + [0.2, 0.4, 0.6, 0.8, 1].map((c) => `${c}: ${sp(c, "none")}/${sp(c, "static")}/${sp(c, "down")}`).join("  ") + `; up at 1: ${sp(1, "up")}`);
    console.log(`  moving/gray: ${[0.2, 0.4, 0.6, 0.8, 1].map((c) => c + ": " + rat(c, "down").toFixed(2)).join("  ")}   (animal 0.33, 0.98, 0.81, 0.70, 0.725)`);
    console.log(`  static/gray: ${[0.2, 0.4, 0.6, 0.8, 1].map((c) => c + ": " + rat(c, "static").toFixed(2)).join("  ")}   (animal 0.33, 0.85, 0.97, 1.00, 0.99)`);
    const P1 = rat(1, "static") >= 0.85 && rat(1, "static") <= 1.15, P2 = near(rat(0.6, "down"), 0.81, 0.15) && near(rat(0.8, "down"), 0.70, 0.15), P3 = sp(1, "up") / sp(1, "none") - rat(1, "down") >= 0.05, P4 = [0.2, 0.4, 0.6, 0.8, 1].every((c) => rat(c, "static") >= 0.85 && rat(c, "static") <= 1.15);
    const g_ = (c) => r(c, "none"), s_ = (c) => r(c, "static"), m_ = (c) => r(c, "down");
    const C1 = g_(0.2) <= g_(0.6) + 0.05 && g_(0.6) <= g_(1) + 0.05, C2 = g_(0.2) - s_(0.2) > 0.1 && g_(0.2) - m_(0.2) > 0.1 && near(s_(0.2), m_(0.2), 0.1), C3 = [0.6, 0.8, 1].every((c) => near(g_(c), s_(c), 0.1)), C4 = [0.6, 0.8, 1].filter((c) => g_(c) - m_(c) > 0.1).length >= 2, score = [C1, C2, C3, C4].filter(Boolean).length;
    console.log(`  P1 static at 1 in [0.85,1.15]: ${P1} | P2 moving at 0.6 and 0.8 within 0.15: ${P2} | P3 up less inhibited (up/gray ${(sp(1, "up") / sp(1, "none")).toFixed(2)} vs down ${rat(1, "down").toFixed(2)}): ${P3} | P4 static in range at all contrasts: ${P4} | ordering C1 ${C1} C2 ${C2} C3 ${C3} C4 ${C4} score ${score}/4`);
}
