// WebGLEngine/render/denoiseStats-selfcheck.mjs -- the denoiser arc, round 2
//
// Run: node render/denoiseStats-selfcheck.mjs
//
// GATES render/denoiseStats.mjs -- the pre-registration's statistic and controls -- on PLANTED outcomes only. Its
// exports, each named here: REL_EPS, C1_MIN_WINS, C3_FLOOR_FACTOR, C0_MAX_RATIO, relMSE, seedMean, effects,
// signTestUpper, holm, trainFit, verdict. Every verdict the function can return is planted below and has to come back.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//   S1  Holm does not stop at its first failure                                  1 RED
//   S2  the sign test counts strictly more than k                                2 RED
//   S3  control C2 inverted                                                      5 RED
//   S4  the network's error taken from its first seed only                       1 RED
//   S5  control C3 ignored                                                       1 RED
//   S6  C0 averages ratios arithmetically instead of geometrically                1 RED
//   S7  C0 passes when ANY seed fits, not every seed                             2 RED
//   S8  verdict() ignores a failed C0                                            1 RED (it crashed the gate until the row caught the throw)
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const S = await import(pathToFileURL(path.join(ENG, "render", "denoiseStats.mjs")).href);
const { REL_EPS, C1_MIN_WINS, C3_FLOOR_FACTOR, C0_MAX_RATIO, relMSE, seedMean, effects, signTestUpper, holm, trainFit, verdict } = S;

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

console.log("1. THE PIECES");
{
    ok("  relMSE of a known pair: errors 1 and 0 against references 0 and 3 -> (1/0.01 + 0) / 2 = 50", Math.abs(relMSE([1, 3], [0, 3]) - 50) < 1e-12);
    ok("  relMSE is zero on the reference itself, and refuses unequal or empty inputs", relMSE([0.5, 2], [0.5, 2]) === 0 &&
        (() => { try { relMSE([1], [1, 2]); return false; } catch { return true; } })() && (() => { try { relMSE([], []); return false; } catch { return true; } })());
    ok("  the network's per-image error is the mean over seeds of each seed's error", JSON.stringify(seedMean([[1, 4], [3, 8], [2, 0]])) === "[2,4]");
    ok("  d_i = ln filter - ln net: positive where the network won", JSON.stringify(effects([2, 1], [1, 2]).map((v) => +v.toFixed(6))) === JSON.stringify([+Math.log(2).toFixed(6), +(-Math.log(2)).toFixed(6)]));
    const p = [9, 10, 11, 12].map((k) => signTestUpper(k, 12));
    ok("!! the exact sign test reproduces the pre-registration's numbers: 9 of 12 -> 0.0730, 10 -> 0.0193, 11 -> 0.0032",
        p[0].toFixed(4) === "0.0730" && p[1].toFixed(4) === "0.0193" && p[2].toFixed(4) === "0.0032" && p[3] === 1 / 4096 && signTestUpper(0, 12) === 1,
        p.map((v) => v.toFixed(5)).join(", "));
    const h1 = holm([0.03, 0.019]), h2 = holm([0.03, 0.04]), h3 = holm([0.019, 0.019]);
    ok("!! Holm step-down: the smaller p held to 0.025, the other to 0.05 -- and a first failure stops the second",
        h1[1].threshold === 0.025 && h1[1].reject && h1[0].threshold === 0.05 && h1[0].reject &&
        h2[0].threshold === 0.025 && !h2[0].reject && !h2[1].reject && h3.every((x) => x.reject),
        "0.019 / 0.03 both pass; 0.03 / 0.04 both fail, though 0.04 < 0.05, because the first stopped it");
    ok("  the constants are the pre-registration's: eps 0.01, 11 of 12 for C1, a factor 2 for C3", REL_EPS === 0.01 && C1_MIN_WINS === 11 && C3_FLOOR_FACTOR === 2);
}

// a planted test set: the network's error is `ratio` times the filter's on the images it wins, `lose` times on the rest
const set = ({ n = 12, wins = 12, ratio = 0.5, lose = 1.2, noisy = 1, floor = 0.001, netNoisyLosses = 0 } = {}) => {
    const filter = Array.from({ length: n }, (_, i) => 0.1 + 0.01 * i);
    const net1 = filter.map((f, i) => (i < wins ? f * ratio : f * lose));
    const noisyArr = filter.map((f, i) => (i < netNoisyLosses ? net1[i] * 0.5 : noisy));
    return { noisy: noisyArr, filter, net: [net1, net1.map((v) => v * 1.01), net1.map((v) => v * 0.99)], floor: filter.map(() => floor) };
};
const shuffledLoses = (T) => T.filter.map(() => 0).map((_, i) => T.filter[i] * 1.5);
const run = (sets, opts = {}) => verdict({ sets, shuffled: opts.shuffled ?? [shuffledLoses(sets.H1), shuffledLoses(sets.H1), shuffledLoses(sets.H1)],
    determinism: opts.determinism ?? true, seedsDistinct: opts.seedsDistinct ?? true });

console.log("\n2. EVERY VERDICT, PLANTED");
{
    const a = run({ H1: set({ wins: 12 }), H2: set({ wins: 10 }) });
    ok("!! 12 of 12 and 10 of 12 with every control clean: both SUPPORTED", a.run === "reported" && a.hypotheses.H1.status === "supported" && a.hypotheses.H2.status === "supported",
        `H1 p ${a.hypotheses.H1.p.toFixed(5)} vs ${a.hypotheses.H1.threshold}, H2 p ${a.hypotheses.H2.p.toFixed(4)} vs ${a.hypotheses.H2.threshold}`);
    const b = run({ H1: set({ wins: 12 }), H2: set({ wins: 9 }) });
    ok("!! 9 of 12 on the transfer set: H1 supported, H2 NOT -- p 0.0730 does not clear 0.05", b.hypotheses.H1.status === "supported" && b.hypotheses.H2.status === "not supported");
    const c = run({ H1: set({ wins: 11 }), H2: set({ wins: 11, ratio: 0.99, lose: 3 }) });
    ok("!! 11 of 12 wins that are SMALL against one large loss: the mean effect is negative, so NOT supported however low p is",
        c.hypotheses.H2.k === 11 && c.hypotheses.H2.meanD < 0 && c.hypotheses.H2.status === "not supported", `H2 mean d ${c.hypotheses.H2.meanD.toFixed(4)}`);
    const d = run({ H1: set({ wins: 12, netNoisyLosses: 2 }), H2: set({ wins: 12 }) });
    ok("!! C1: the network fails to beat the NOISY input on 2 of 12 -- the run is NOT REPORTED", d.run === "not reported" && !d.controls.C1 &&
        Object.values(d.hypotheses).every((h) => h.status === "not reported"), d.reasons[0]);
    const T = set({ wins: 12 });
    const e = run({ H1: T, H2: set({ wins: 12 }) }, { shuffled: [T.filter.map((f) => f * 0.8), T.filter.map((f) => f * 0.8), T.filter.map((f) => f * 0.8)] });
    ok("!! C2: a shuffled-target network that beats the filter makes the run NOT RESOLVABLE -- v4696's shape, caught", e.run === "not resolvable" && e.controls.C2.ok === false &&
        e.hypotheses.H1.status === "not resolvable", e.reasons.join("; "));
    const f = run({ H1: set({ wins: 12 }), H2: set({ wins: 12, floor: 0.05 }) });
    ok("!! C3: the network within 2x of the reference floor on more than half of a set makes THAT hypothesis not resolvable, and only that one",
        f.run === "reported" && f.hypotheses.H2.status === "not resolvable" && f.hypotheses.H1.status === "supported", `near floor on ${f.hypotheses.H2.c3.nearFloor} of 12`);
    const g = run({ H1: set({ wins: 12 }), H2: set({ wins: 12 }) }, { determinism: false });
    const g2 = run({ H1: set({ wins: 12 }), H2: set({ wins: 12 }) }, { seedsDistinct: false });
    ok("!! C4 and C5: a seed that does not reproduce, or a shared render seed, and nothing is reported", g.run === "not reported" && g2.run === "not reported");
    const h = verdict({ sets: { H1: set({ wins: 12 }), H2: set({ wins: 12 }) }, determinism: true, seedsDistinct: true });
    ok("  a run that never trained the shuffled-target network cannot claim C2 passed", h.run === "not resolvable" && /not run/.test(h.reasons.join()));
}

console.log("\n3. CONTROL C0 -- THE RE-RUN'S TRAINING-FIT CHECK (pre-registration section 13)");
{
    ok("  the bar is 0.8 x the noisy input's error", C0_MAX_RATIO === 0.8);
    // per seed, the GEOMETRIC mean of net / noisy over the training images: ratios 0.25 and 4 average to 1, not 2.125
    const g = trainFit([[0.25, 4], [0.5, 0.5]], [1, 1]);
    ok("!! the ratio is a geometric mean over images, one per seed: 0.25 and 4 make 1.000, and 0.5 and 0.5 make 0.500",
        Math.abs(g.ratios[0] - 1) < 1e-12 && Math.abs(g.ratios[1] - 0.5) < 1e-12 && g.ok === false, g.ratios.map((r) => r.toFixed(3)).join(" / "));
    ok("!! C0 holds only when EVERY seed fits: 0.5 / 0.79 holds, 0.5 / 0.81 does not", trainFit([[0.5], [0.79]], [1]).ok === true && trainFit([[0.5], [0.81]], [1]).ok === false);
    ok("  an untrained identity network fits to exactly 1, which fails", (() => { const f = trainFit([[0.3, 0.2]], [0.3, 0.2]); return f.ratios[0] === 1 && !f.ok; })());
    let stop = null, threw = null; try { stop = verdict({ c0: trainFit([[2, 2]], [2, 2]) }); } catch (e) { threw = e.message; }
    ok("!! a failed C0 is NOT REPORTED, with no hypothesis tested and no test set needed -- verdict() never reads `sets`",
        !!stop && stop.run === "not reported" && Object.keys(stop.hypotheses).length === 0 && /^C0: /.test(stop.reasons[0]) && stop.controls.C0.ok === false,
        threw ? `threw: ${threw}` : stop.reasons[0]);
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"}` +
    "\nnot closed here: that the measured errors handed to verdict() are the right ones. That is the harness's, next round.");
process.exit(fails ? 1 : 0);
