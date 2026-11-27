// WebGLEngine/brain/crabGain32Agg.mjs -- aggregates stealth Round 32 (brain/STEALTH_ROUNDS_WIP.md), written BEFORE any of its runs were read.
//   node brain/crabGain32Agg.mjs A   -> step A: for each g in {50, 100, 150, 200, 300} at geometry A, the readout fitted on the plain trials and the log-likelihood of the MOVING trials at contrast 1.0;
//                                       prints the chosen g (the largest likelihood; a tie goes to the smaller g) and nothing about any other cell.
//   node brain/crabGain32Agg.mjs B <g> -> step B: the chosen g at geometry B, the readout refitted on the plain trials, C1-C4 (Round 29's, word for word) on the predicted probabilities, the striped
//                                       log-likelihood against the null, and the verdict (SUPPORTED iff C2, C3 and C4 hold AND the stripes beat the null).
// The readout, r and the null are Round 31's (brain/crabReadout31Agg.mjs), copied here so that file stays as it was read.
import fs from "node:fs";
const D = "brain/crabGain32Runs/", CS = [0.2, 0.4, 0.6, 0.8, 1], GS = [50, 100, 150, 200, 300], STIMS = ["Grey", "Static stripes", "Moving stripes"];
const rOf = (size) => (size === null ? 0 : (74 - size) / 74), sig = (z) => 1 / (1 + Math.exp(-z));
const trials = fs.readFileSync("vendor/santon2025/Treadmill_data.csv", "utf8").trim().split("\n").slice(1).map((l) => l.split(",")).map((f) => ({ stim: f[0], c: Number(f[3]), y: Number(f[6]) }));
const load = (prefix) => { const r = { Grey: {}, "Static stripes": {}, "Moving stripes": {} }; for (const c of CS) { const j = JSON.parse(fs.readFileSync(`${D}${prefix}_wc${c}.json`, "utf8")); r.Grey[c] = rOf(j.none); r["Static stripes"][c] = rOf(j.static); r["Moving stripes"][c] = rOf(j.moving); } return r; };
function fit(r) {   // Newton's method on the Grey trials only
    const grey = trials.filter((t) => t.stim === "Grey"); let a = 0, b = 0;
    for (let it = 0; it < 100; it++) {
        let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0;
        for (const t of grey) { const x = r.Grey[t.c], p = sig(a + b * x), w = p * (1 - p); ga += t.y - p; gb += (t.y - p) * x; haa += w; hab += w * x; hbb += w * x * x; }
        const det = haa * hbb - hab * hab; if (!(Math.abs(det) > 1e-12)) break;
        const da = (hbb * ga - hab * gb) / det, db = (haa * gb - hab * ga) / det; a += da; b += db; if (Math.abs(da) + Math.abs(db) < 1e-10) break;
    }
    return { a, b, P: (stim, c) => sig(a + b * r[stim][c]) };
}
const ll = (p, y) => Math.log(Math.min(1 - 1e-9, Math.max(1e-9, y ? p : 1 - p)));
const obs = (stim, c) => { const s = trials.filter((t) => t.stim === stim && t.c === c); return s.reduce((x, t) => x + t.y, 0) / s.length; };
const step = process.argv[2];
if (step === "A") {
    const rows = GS.map((g) => { const R = fit(load(`A_g${g}`)), L = trials.filter((t) => t.stim === "Moving stripes" && t.c === 1).reduce((x, t) => x + ll(R.P("Moving stripes", 1), t.y), 0); return { g, a: R.a, b: R.b, L }; });
    for (const x of rows) console.log(`g ${x.g}: readout a ${x.a.toFixed(3)} b ${x.b.toFixed(3)} | log-likelihood of the moving trials at contrast 1.0: ${x.L.toFixed(3)}`);
    const best = rows.reduce((m, x) => (x.L > m.L + 1e-12 ? x : m), rows[0]);
    console.log(`CHOSEN g = ${best.g}`);
} else if (step === "B") {
    const g = Number(process.argv[3]); if (!GS.includes(g)) throw new Error(`crabGain32Agg B: g must be one of ${GS.join(", ")}`);
    const r = load(`B_g${g}`), R = fit(r), G = (c) => R.P("Grey", c), S = (c) => R.P("Static stripes", c), M = (c) => R.P("Moving stripes", c);
    console.log(`step B at g ${g}: readout a ${R.a.toFixed(4)} b ${R.b.toFixed(4)}`);
    console.log("contrast | r: grey static moving | predicted: grey static moving | observed: grey static moving");
    for (const c of CS) console.log(`${c.toFixed(1)} | ${STIMS.map((s) => r[s][c].toFixed(3)).join(" ")} | ${STIMS.map((s) => R.P(s, c).toFixed(3)).join(" ")} | ${STIMS.map((s) => obs(s, c).toFixed(3)).join(" ")}`);
    const C1 = G(0.2) <= G(0.6) + 0.05 && G(0.6) <= G(1) + 0.05;
    const C2 = G(0.2) - S(0.2) > 0.1 && G(0.2) - M(0.2) > 0.1 && Math.abs(S(0.2) - M(0.2)) <= 0.1;
    const C3 = [0.6, 0.8, 1].every((c) => Math.abs(G(c) - S(c)) <= 0.1);
    const C4 = [0.6, 0.8, 1].filter((c) => G(c) - M(c) > 0.1).length >= 2;
    let llM = 0, llN = 0; for (const t of trials) { if (t.stim === "Grey") continue; llM += ll(R.P(t.stim, t.c), t.y); llN += ll(obs("Grey", t.c), t.y); }
    console.log(`C1 ${C1} (reported) | C2 ${C2} (${(G(0.2) - S(0.2)).toFixed(3)}, ${(G(0.2) - M(0.2)).toFixed(3)}, ${Math.abs(S(0.2) - M(0.2)).toFixed(3)}) | C3 ${C3} (${[0.6, 0.8, 1].map((c) => (G(c) - S(c)).toFixed(3)).join(", ")}) | C4 ${C4} (${[0.6, 0.8, 1].map((c) => (G(c) - M(c)).toFixed(3)).join(", ")})`);
    console.log(`striped trials: log-likelihood ${llM.toFixed(2)} under the predictions, ${llN.toFixed(2)} under the null (${llM > llN ? "the predictions fit better" : "the null fits better"} by ${Math.abs(llM - llN).toFixed(2)})`);
    const failed = [["C2", C2], ["C3", C3], ["C4", C4], ["the null", llM > llN]].filter(([, v]) => !v).map(([k]) => k);
    console.log(`VERDICT: ${failed.length ? `NOT SUPPORTED (${failed.join(", ")})` : "SUPPORTED"}`);
} else { console.error("crabGain32Agg: A, or B <g>"); process.exit(2); }
