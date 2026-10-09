// WebGLEngine/render/denoiseStats-selfcheck.mjs -- the denoiser arc, round 2
//
// Run: node render/denoiseStats-selfcheck.mjs
//
// GATES render/denoiseStats.mjs -- the pre-registration's statistic and controls -- on PLANTED outcomes only. Its
// exports, each named here: REL_EPS, C1_MIN_WINS, C1_OF, C3_FLOOR_FACTOR, C0_MAX_RATIO, C6_MAX_RATIO, relMSE, seedMean, effects,
// signTestUpper, signFlipUpper, TESTS, holm, trainFit, historyFit, trainSanity, verdict. Every verdict the function can return is planted below and has to come back.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//   S1  Holm does not stop at its first failure                                  1 RED
//   S2  the sign test counts strictly more than k                                2 RED
//   S3  control C2 inverted                                                      5 RED
//   S4  the network's error taken from its first seed only                       1 RED
//   S5  control C3 ignored                                                       1 RED
//   S6  C0 averages ratios arithmetically instead of geometrically                1 RED
//   S7  C0 passes when ANY seed fits, not every seed                             2 RED
//   S9  verdict() ignores a failed C6                                            1 RED
//   S10 C6 compares the accumulation with itself, not with the noisy frame       1 RED
//   S8  verdict() ignores a failed C0                                            1 RED (it crashed the gate until the row caught the throw)
//   S11 the training C1's bar 11 images, not 11 in 12 of them                   2 RED
//   S12 the training C1 counts the first seed, not the mean over seeds           1 RED
//   S13 a tie with the noisy input counted as a win                              1 RED
//   S14 with C1 decided on the training images, the test sets still decide it    1 RED (round 7's case)
//   S15 verdict() ignores a failed training C1                                   1 RED
//   S16 with test "signflip", Holm still reads the sign test's p                 1 RED
//   S17 the sign-flip test without its tie tolerance                             1 RED (equal effects of 0.1 split by rounding)
//   S18 the sign-flip test counts only sums strictly above the observed          2 RED
//   S19 the sign-flip test with every magnitude 1 -- the count again             4 RED
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const S = await import(pathToFileURL(path.join(ENG, "render", "denoiseStats.mjs")).href);
const { REL_EPS, C1_MIN_WINS, C1_OF, C3_FLOOR_FACTOR, C0_MAX_RATIO, C6_MAX_RATIO, relMSE, seedMean, effects, signTestUpper, signFlipUpper, TESTS, holm, trainFit, historyFit, trainSanity,
        verdict } = S;

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

// a planted test set: the network's error is `ratio` times the filter's on the images it wins, `lose` times on the rest.
// `netNoisyLosses` images where both methods lose to the noisy input; `filterNoisyLosses` where only the filter does.
const set = ({ n = 12, wins = 12, ratio = 0.5, lose = 1.2, noisy = 1, floor = 0.001, netNoisyLosses = 0, filterNoisyLosses = 0 } = {}) => {
    const filter = Array.from({ length: n }, (_, i) => 0.1 + 0.01 * i);
    const net1 = filter.map((f, i) => (i < wins ? f * ratio : f * lose));
    const noisyArr = filter.map((f, i) => (i < netNoisyLosses ? net1[i] * 0.5 : i < filterNoisyLosses ? f * 0.9 : noisy));
    return { noisy: noisyArr, filter, net: [net1, net1.map((v) => v * 1.01), net1.map((v) => v * 0.99)], floor: filter.map(() => floor) };
};
const shuffledLoses = (T) => T.filter.map(() => 0).map((_, i) => T.filter[i] * 1.5);
const run = (sets, opts = {}) => verdict({ sets, shuffled: opts.shuffled ?? [shuffledLoses(sets.H1), shuffledLoses(sets.H1), shuffledLoses(sets.H1)],
    determinism: opts.determinism ?? true, seedsDistinct: opts.seedsDistinct ?? true, c1Train: opts.c1Train ?? null });

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

console.log("\n4. CONTROL C6 -- THE TEMPORAL ROUND'S HISTORY CHECK (pre-registration section 17)");
{
    const h = historyFit([0.25, 4, 0.5], [1, 1, 1]);
    ok("!! C6 is the geometric mean over training images of accumulated / noisy, against 0.8: 0.25, 4 and 0.5 make 0.794, which holds; 1, 1 does not",
        C6_MAX_RATIO === 0.8 && Math.abs(h.ratio - 0.5 ** (1 / 3)) < 1e-12 && h.ok === true && historyFit([0.2, 0.3], [0.2, 0.3]).ok === false, h.ratio.toFixed(3));
    let stop = null, threw = null; try { stop = verdict({ c6: historyFit([1, 1], [1, 1]), c0: trainFit([[0.1]], [1]) }); } catch (e) { threw = e.message; }
    ok("!! a failed C6 is NOT REPORTED before anything else is read -- even with C0 passing",
        !!stop && stop.run === "not reported" && /^C6: /.test(stop.reasons[0]) && stop.controls.C6.ok === false && Object.keys(stop.hypotheses).length === 0, threw || stop.reasons[0]);
}

console.log("\n5. CONTROL C1 ON THE TRAINING IMAGES (pre-registration section 26)");
{
    // k of n training images where a method beats the noisy input (error 0.5 against 1), the rest where it loses (2)
    const wins = (k, n) => Array.from({ length: n }, (_, i) => (i < k ? 0.5 : 2)), ones = (n) => new Array(n).fill(1);
    const at = (fk, nk, n) => trainSanity(wins(fk, n), [wins(nk, n), wins(nk, n), wins(nk, n)], ones(n));
    ok("!! the bar is the test sets' FRACTION, 11 in 12: 88 of 96 holds and 87 does not, for either method -- and 11 of 12 is still 11",
        C1_OF === 12 && at(88, 96, 96).ok && at(88, 96, 96).need === 88 && !at(87, 96, 96).ok && !at(96, 87, 96).ok && at(11, 11, 12).need === 11 && at(11, 11, 12).ok && !at(10, 12, 12).ok,
        `96 images: need ${at(88, 96, 96).need}`);
    // the network is counted as on a test set: per image, the MEAN over seeds -- one seed losing an image the mean wins costs nothing
    const m = trainSanity([0.5, 0.5], [[1.2, 0.5], [0.5, 0.5], [0.5, 0.5]], [1, 1]);
    ok("!! the network's count is over its per-image mean over seeds, as on a test set: a first seed that loses an image the mean wins does not cost it",
        m.netWins === 2, `${m.netWins} of 2`);
    ok("  a tie with the noisy input is not a win, and mismatched sets are refused", trainSanity([1, 0.5], [[0.5, 1]], [1, 1]).filterWins === 1 &&
        trainSanity([1, 0.5], [[0.5, 1]], [1, 1]).netWins === 1 && [() => trainSanity([1], [[1, 1]], [1, 1]), () => trainSanity([1, 1], [[1]], [1, 1]), () => trainSanity([], [[]], [])]
            .every((f) => { try { f(); return false; } catch { return true; } }));
    // round 7's case: the filter loses to the noisy input on 2 of 12 TEST images, everything else clean
    const T7 = { H1: set({ wins: 12, filterNoisyLosses: 2 }), H2: set({ wins: 12 }) };
    const old = run(T7), now = run(T7, { c1Train: at(96, 96, 96) });
    ok("!! decided on the training images, C1 no longer reads the test sets: round 7's case -- the filter under the noisy input on 2 of 12 test images -- is REPORTED, not stopped",
        old.run === "not reported" && old.controls.C1 === false && now.run === "reported" && now.hypotheses.H1.status === "supported" && now.controls.C1.ok === true &&
        now.hypotheses.H1.c1.filterWins === 10 && now.hypotheses.H1.c1.netWins === 12 && now.hypotheses.H1.c1.tested === false && now.reasons.length === 0,
        `without: "${old.reasons[0]}"; with: H1 ${now.hypotheses.H1.status}, its test counts ${now.hypotheses.H1.c1.netWins} / ${now.hypotheses.H1.c1.filterWins} reported`);
    let stop = null, threw = null; try { stop = verdict({ c0: trainFit([[0.1]], [1]), c1Train: at(87, 96, 96) }); } catch (e) { threw = e.message; }
    ok("!! a failed training C1 is NOT REPORTED before a test set is read -- with C0 passing, and with no `sets` at all",
        !!stop && stop.run === "not reported" && /^C1 on the training images: /.test(stop.reasons[0]) && stop.controls.C1.ok === false && stop.controls.C0.ok === true &&
        Object.keys(stop.hypotheses).length === 0, threw || stop.reasons[0]);
}

console.log("\n6. THE SIGN-FLIP TEST -- EACH IMAGE WEIGHED BY HOW MUCH (pre-registration section 28)");
{
    // by hand: d = (1, -1). Observed sum 0; the four sign assignments sum to 2, 0, 0, -2 -- three reach it.
    ok("  by hand: two effects of +1 and -1 -- three of the four sign assignments reach the observed sum, p = 3/4; all of twelve positive, p = 1/4096",
        signFlipUpper([1, -1]) === 0.75 && signFlipUpper(new Array(12).fill(0.3)) === 1 / 4096 && signFlipUpper([0.5]) === 0.5 && TESTS.join() === "sign,signflip");
    // when every image is won or lost by the SAME amount, only the count is left -- and it must be the sign test exactly,
    // with magnitudes (0.1) whose sums round differently in different orders, so ties must not be split by rounding
    const equal = [0, 3, 6, 9, 10, 11, 12].every((k) => signFlipUpper(Array.from({ length: 12 }, (_, i) => (i < k ? 0.1 : -0.1))) === signTestUpper(k, 12));
    ok("!! with every effect the same size it IS the sign test, to the last bit, for every count -- a tie in exact arithmetic is not split by rounding", equal);
    // magnitude counts: three large wins and nine near-ties lost -- round 8's H1, as its file records it
    const d8 = [0.58, -0.02, -0.07, 0.02, 0.66, 0.04, -0.10, 0.25, 0.02, -0.01, 0.74, -0.03];
    const flip = signFlipUpper(d8), sign = signTestUpper(d8.filter((v) => v > 0).length, 12);
    ok("!! it weighs size: three large wins among near-ties (round 8's H1, to two places) -- 7 of 12 is p 0.39 by count, about 0.05 by size",
        Math.abs(sign - 0.3872) < 1e-4 && flip > 0.04 && flip < 0.06, `sign ${sign.toFixed(4)}, sign-flip ${flip.toFixed(4)}`);
    ok("  it refuses what it cannot enumerate or read: no effects, more than 24, a NaN", [[], new Array(25).fill(1), [1, NaN]].every((d) => { try { signFlipUpper(d); return false; } catch { return true; } }));
    // in the verdict: Holm reads the chosen test's p; both are reported
    const T = { H1: set({ wins: 12 }), H2: set({ wins: 9 }) };
    const vs = run(T), vf = verdict({ sets: T, shuffled: [shuffledLoses(T.H1), shuffledLoses(T.H1), shuffledLoses(T.H1)], determinism: true, seedsDistinct: true, test: "signflip" });
    const h = vf.hypotheses.H2;
    ok("!! with test \"signflip\" Holm is applied to the sign-flip p, and the sign test's is reported beside it; the default is still the sign test",
        h.test === "signflip" && h.p === signFlipUpper(h.d) && h.pSign === signTestUpper(h.k, 12) && h.p !== h.pSign && vs.hypotheses.H2.p === signTestUpper(9, 12) &&
        vs.hypotheses.H2.test === undefined && vf.hypotheses.H1.status === "supported", `H2: sign-flip ${h.p.toFixed(4)}, sign ${h.pSign.toFixed(4)}`);
    ok("  an unknown test is refused", (() => { try { verdict({ sets: T, determinism: true, seedsDistinct: true, test: "t" }); return false; } catch { return true; } })());
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"}` +
    "\nnot closed here: that the measured errors handed to verdict() are the right ones. That is the harness's, next round.");
process.exit(fails ? 1 : 0);
