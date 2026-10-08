// WebGLEngine/brain/convNet-selfcheck.mjs -- the denoiser arc, round 2
//
// Run: node brain/convNet-selfcheck.mjs
//
// GATES brain/convNet.mjs -- a stack of conv2d layers and how it learns. Its exports, each named here: ADAM,
// seededRandom, initNet, paramCount, netForward, netBackward, adamState, adamStep, cloneNet.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//   N1  Adam without bias correction                                             1 RED
//   N2  the backward pass reads relu's mask from the layer's INPUT               3 RED (1 here, 2 in denoiseNet-selfcheck)
//   N3  Xavier's 1/fan-in instead of He's 2/fan-in                               1 RED
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { ADAM, seededRandom, initNet, paramCount, netForward, netBackward, adamState, adamStep, cloneNet } =
    await import(pathToFileURL(path.join(ENG, "brain", "convNet.mjs")).href);

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

console.log("1. THE STREAM AND THE INITIALISATION");
{
    const a = seededRandom(7), b = seededRandom(7), c = seededRandom(8);
    const sa = Array.from({ length: 50 }, () => a.gauss()), sb = Array.from({ length: 50 }, () => b.gauss()), sc = Array.from({ length: 50 }, () => c.gauss());
    ok("  one seed, one stream; another seed, another", same(sa, sb) && !same(sa, sc));
    const r = seededRandom(3), n = 40000; let m = 0, v = 0, lo = 1, hi = 0;
    const g = Array.from({ length: n }, () => r.gauss()); for (const x of g) m += x / n; for (const x of g) v += (x - m) ** 2 / n;
    for (let i = 0; i < n; i++) { const x = r.u(); lo = Math.min(lo, x); hi = Math.max(hi, x); }
    ok("  gauss() is standard normal and u() is in [0, 1)", Math.abs(m) < 0.02 && Math.abs(v - 1) < 0.03 && lo >= 0 && hi < 1, `mean ${m.toFixed(4)}, variance ${v.toFixed(4)}`);
    const net = initNet([[9, 16, "relu"], [16, 3, "none"]], seededRandom(1));
    const W0 = net.layers[0].W, std = Math.sqrt(W0.reduce((s, x) => s + x * x, 0) / W0.length);
    ok("  He-normal weights: std sqrt(2 / (3 x 3 x 9)) = 0.157 for the first layer, and zero biases", Math.abs(std - Math.sqrt(2 / 81)) < 0.01 && net.layers.every((L) => L.b.every((x) => x === 0)),
        `measured ${std.toFixed(4)}`);
    ok("  the parameter count is every weight and bias", paramCount(net) === 9 * 16 * 9 + 16 + 16 * 3 * 9 + 3);
    let threw = null; try { initNet([[9, 16, "relu"], [8, 3, "none"]], seededRandom(1)); } catch (e) { threw = e.message; }
    ok("  a stack whose channels do not chain is refused by name", /takes 8 channels/.test(threw || ""), threw);
}

console.log("\n2. THE BACKWARD PASS THROUGH THE STACK, AGAINST CENTRAL FINITE DIFFERENCES");
{
    const net = initNet([[4, 6, "relu"], [6, 5, "relu"], [5, 2, "none"]], seededRandom(11)), H = 6, W = 5;
    const rr = seededRandom(12), x = Float64Array.from({ length: H * W * 4 }, () => rr.gauss());
    net.layers.forEach((L) => { for (let i = 0; i < L.b.length; i++) L.b[i] = rr.gauss() * 0.1; });
    const dOut = Float64Array.from({ length: H * W * 2 }, () => rr.gauss());
    const loss = () => { const a = netForward(net, x, H, W); const o = a[a.length - 1]; let s = 0; for (let i = 0; i < o.length; i++) s += o[i] * dOut[i]; return s; };
    const { grads, dX } = netBackward(net, netForward(net, x, H, W), H, W, dOut), h = 1e-6;
    const fd = (arr, i) => { const o = arr[i]; arr[i] = o + h; const a = loss(); arr[i] = o - h; const b = loss(); arr[i] = o; return (a - b) / (2 * h); };
    let worst = 0, n = 0;
    net.layers.forEach((L, li) => { for (let i = 0; i < L.W.length; i++) { worst = Math.max(worst, Math.abs(fd(L.W, i) - grads[li].dW[i])); n++; }
                                    for (let i = 0; i < L.b.length; i++) { worst = Math.max(worst, Math.abs(fd(L.b, i) - grads[li].db[i])); n++; } });
    for (let i = 0; i < x.length; i++) { worst = Math.max(worst, Math.abs(fd(x, i) - dX[i])); n++; }
    ok(`!! every weight, bias and input of a three-layer stack (two relus) against central differences: worst ${worst.toExponential(2)} over ${n}`, worst < 1e-6);
    const acts = netForward(net, x, H, W);
    ok("  netForward keeps the input and every layer's output", acts.length === 4 && acts[0] === x && acts[3].length === H * W * 2);
}

console.log("\n3. ADAM, AGAINST THE UPDATE WRITTEN OUT BY HAND");
{
    const net = { layers: [{ Cin: 1, Cout: 1, k: 1, W: Float64Array.from([0.5]), b: Float64Array.from([0]), act: "none" }] };
    const st = adamState(net), gs = [0.3, -0.2, 0.7];
    let w = 0.5, m = 0, v = 0;
    for (let t = 1; t <= 3; t++) {
        adamStep(net, [{ dW: [gs[t - 1]], db: [0] }], st);
        m = 0.9 * m + 0.1 * gs[t - 1]; v = 0.999 * v + 0.001 * gs[t - 1] ** 2;
        w -= 1e-3 * (m / (1 - 0.9 ** t)) / (Math.sqrt(v / (1 - 0.999 ** t)) + 1e-8);
    }
    ok("!! three Adam steps land where the textbook update does, bias correction included", Math.abs(net.layers[0].W[0] - w) < 1e-15 && st.t === 3,
        `${net.layers[0].W[0]} vs ${w}`);
    ok("  the defaults are the pre-registration's: lr 1e-3, betas 0.9 / 0.999, eps 1e-8", ADAM.lr === 1e-3 && ADAM.beta1 === 0.9 && ADAM.beta2 === 0.999 && ADAM.eps === 1e-8);
    const c = cloneNet(net); c.layers[0].W[0] = 99;
    ok("  cloneNet copies the weights, it does not share them", net.layers[0].W[0] !== 99);
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"}`);
process.exit(fails ? 1 : 0);
