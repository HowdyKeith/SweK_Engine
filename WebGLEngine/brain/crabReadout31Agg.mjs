// WebGLEngine/brain/crabReadout31Agg.mjs -- aggregates stealth Round 31 (brain/STEALTH_ROUNDS_WIP.md), written BEFORE any of its runs were read. Run: node brain/crabReadout31Agg.mjs
//
// The model's r = (74 - alarm size) / 74 (0 when there is no alarm), per stimulus and contrast, from brain/crabReadout31Runs/ (crabOrder30.mjs at g 300, azimuth 315, r/v 0.55). A logistic readout
// P = 1 / (1 + exp(-(a + b r))) is fitted by maximum likelihood (Newton's method) to the animal's PLAIN (Grey) trials only, each given the model's plain r at its contrast; it then turns the static and moving r
// into probabilities, and Round 29's C1 to C4 are applied word for word. Verdict: SUPPORTED iff C2, C3 and C4 all hold. Reported: a and b, predicted against observed in all 15 cells, and the striped trials'
// log-likelihood under the predictions against a null (each striped trial given the plain ellipse's observed rate at its contrast).
import fs from "node:fs";
const D = "brain/crabReadout31Runs/", CS = [0.2, 0.4, 0.6, 0.8, 1];
const run = {}; for (const c of CS) run[c] = JSON.parse(fs.readFileSync(`${D}g300_wc${c}.json`, "utf8"));
const rOf = (size) => (size === null ? 0 : (74 - size) / 74);
const r = { Grey: {}, "Static stripes": {}, "Moving stripes": {} };
for (const c of CS) { r.Grey[c] = rOf(run[c].none); r["Static stripes"][c] = rOf(run[c].static); r["Moving stripes"][c] = rOf(run[c].moving); }
const lines = fs.readFileSync("vendor/santon2025/Treadmill_data.csv", "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
const trials = lines.map((f) => ({ stim: f[0], c: Number(f[3]), y: Number(f[6]) }));
// the fit, on Grey trials only
const grey = trials.filter((t) => t.stim === "Grey"), sig = (z) => 1 / (1 + Math.exp(-z));
let a = 0, b = 0;
for (let it = 0; it < 100; it++) {
    let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0;
    for (const t of grey) { const x = r.Grey[t.c], p = sig(a + b * x), w = p * (1 - p); ga += t.y - p; gb += (t.y - p) * x; haa += w; hab += w * x; hbb += w * x * x; }
    const det = haa * hbb - hab * hab; if (!(Math.abs(det) > 1e-12)) break;
    const da = (hbb * ga - hab * gb) / det, db = (haa * gb - hab * ga) / det; a += da; b += db; if (Math.abs(da) + Math.abs(db) < 1e-10) break;
}
const P = (stim, c) => sig(a + b * r[stim][c]);
const obs = (stim, c) => { const s = trials.filter((t) => t.stim === stim && t.c === c); return s.reduce((x, t) => x + t.y, 0) / s.length; };
console.log(`readout fitted on ${grey.length} Grey trials: a = ${a.toFixed(4)}, b = ${b.toFixed(4)}`);
console.log("contrast | r: grey static moving | predicted P: grey static moving | observed: grey static moving");
for (const c of CS) console.log(`${c.toFixed(1)} | ${["Grey", "Static stripes", "Moving stripes"].map((s) => r[s][c].toFixed(3)).join(" ")} | ${["Grey", "Static stripes", "Moving stripes"].map((s) => P(s, c).toFixed(3)).join(" ")} | ${["Grey", "Static stripes", "Moving stripes"].map((s) => obs(s, c).toFixed(3)).join(" ")}`);
// Round 29's criteria, word for word, on the predicted probabilities (G, S, M)
const G = (c) => P("Grey", c), S = (c) => P("Static stripes", c), M = (c) => P("Moving stripes", c);
const C1 = G(0.2) <= G(0.6) + 0.05 && G(0.6) <= G(1) + 0.05;
const C2 = G(0.2) - S(0.2) > 0.1 && G(0.2) - M(0.2) > 0.1 && Math.abs(S(0.2) - M(0.2)) <= 0.1;
const C3 = [0.6, 0.8, 1].every((c) => Math.abs(G(c) - S(c)) <= 0.1);
const C4 = [0.6, 0.8, 1].filter((c) => G(c) - M(c) > 0.1).length >= 2;
console.log(`C1 ${C1} (the fit's own, reported) | C2 ${C2} (grey - static ${(G(0.2) - S(0.2)).toFixed(3)}, grey - moving ${(G(0.2) - M(0.2)).toFixed(3)}, |static - moving| ${Math.abs(S(0.2) - M(0.2)).toFixed(3)}) | C3 ${C3} (${[0.6, 0.8, 1].map((c) => (G(c) - S(c)).toFixed(3)).join(", ")}) | C4 ${C4} (${[0.6, 0.8, 1].map((c) => (G(c) - M(c)).toFixed(3)).join(", ")})`);
const failed = [["C2", C2], ["C3", C3], ["C4", C4]].filter(([, v]) => !v).map(([k]) => k);
console.log(`VERDICT: ${failed.length ? `NOT SUPPORTED (${failed.join(", ")})` : "SUPPORTED"}`);
// the striped trials' log-likelihood: the predictions against the null (the plain ellipse's observed rate at the contrast)
const ll = (p, y) => Math.log(Math.min(1 - 1e-9, Math.max(1e-9, y ? p : 1 - p)));
let llModel = 0, llNull = 0, n = 0;
for (const t of trials) { if (t.stim === "Grey") continue; llModel += ll(P(t.stim, t.c), t.y); llNull += ll(obs("Grey", t.c), t.y); n++; }
console.log(`striped trials (${n}): log-likelihood under the predictions ${llModel.toFixed(2)}, under the null ${llNull.toFixed(2)} -> ${llModel > llNull ? "the predictions fit better" : "the null fits better"} (by ${(llModel - llNull).toFixed(2)})`);
