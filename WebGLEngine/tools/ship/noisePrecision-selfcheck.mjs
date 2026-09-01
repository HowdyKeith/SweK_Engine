// WebGLEngine/tools/ship/noisePrecision-selfcheck.mjs -- v4246
//
// Run: node tools/ship/noisePrecision-selfcheck.mjs
//
// *** THIS TREE GRADES SHADERS BY COMPARING A JS MODEL AGAINST THE GPU PASS. FOR ANY SHADER BUILT ON SIMPLEX
// NOISE THAT COMPARISON WAS IMPOSSIBLE, AND NOBODY HAD NOTICED BECAUSE NOBODY HAD TRIED. ***
//
// The convention is everywhere: render/crtModel.js is graded against render/crtPass.js, swiftShaderModel
// against swiftShaderPass, and each gate reports a worst channel difference of 0 or 1 of 255. It rests on
// one assumption -- that the two implementations compute the same function.
//
// v4243 tried to apply it to a procedural texture and could not. It measured the JS snoise3 and the GLSL
// snoise agreeing to 1e-3 at only 23.5% of points, tried three instruments against a deliberately broken
// shader, found none of them could separate it from a correct one, and shipped a section that said so.
//
// *** THE CAUSE IS NOT A MISTRANSLATION AND CANNOT BE FIXED BY WRITING THE JS MORE CAREFULLY. *** It is one
// truncated decimal. Ashima writes 1/7 as the literal `const float n_ = 0.142857142857;` and then takes
// floor(j * n_) to choose a gradient. That literal is BELOW 1/7 at 64 bits and ABOVE it at 32, so at j = 7
// the product is 0.999999999999 one way and 1.0000000447 the other, and floor falls opposite ways. Every
// multiple of 7 sits on that boundary.
//
// *** v4243 GUESSED A DIFFERENT MECHANISM AND WAS WRONG, AND TWO SABOTAGES ARE WHAT SAID SO. *** It blamed
// mod289 crossing a floor boundary. Removing the 32-bit rounding from mod289, and then from the entire
// permute chain, changed NOTHING -- because the permute chain produces integers below 2^24 and integer
// arithmetic is exact at both precisions. It could never have been the cause. Section 1 measures the real
// one instead of restating the plausible one.
//
// So the fix is JS that makes the SAME ROUNDING DECISIONS: Math.fround after every operation. That is
// snoise3f32, added to shaders/ashimaNoise.mjs beside snoise3 rather than replacing it, because the two
// answer different questions and picking the wrong one is exactly the defect being fixed.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { snoise3, snoise3f32 } from "../../shaders/ashimaNoise.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

console.log("noisePrecision-selfcheck -- two JS simplexes, one GPU, and only one of them is what the GPU computes\n");

// =============================================================================================================
console.log("1. *** THE MECHANISM: one truncated decimal, and it is not the one v4243 blamed ***");
{
    const f = Math.fround;
    const LIT = 0.142857142857;          // Ashima's literal for 1/7, verbatim from the GLSL
    ok("!! *** THE LITERAL FOR 1/7 FALLS ON OPPOSITE SIDES OF 1/7 AT THE TWO PRECISIONS ***",
        LIT < 1 / 7 && f(LIT) > 1 / 7,
        "the source writes 0.142857142857; at 64 bits that is " + (1 / 7 - LIT).toExponential(2) + " BELOW " +
        "1/7, and rounded to 32 bits it becomes " + f(LIT).toPrecision(17) + ", which is " +
        (f(LIT) - 1 / 7).toExponential(2) + " ABOVE it. One literal, two sides of the value it approximates.");
    ok("!! *** SO floor(7 * n_) IS 0 AT 64 BITS AND 1 AT 32 -- a different gradient, from one multiply ***",
        Math.floor(7 * LIT) === 0 && Math.floor(f(7 * f(LIT))) === 1,
        "7 * " + LIT + " = " + (7 * LIT).toPrecision(17) + " -> floor 0, while 7 * fround(n_) = " +
        f(7 * f(LIT)).toPrecision(17) + " -> floor 1. Ashima uses floor(j * n_) to index the gradient table, " +
        "so every multiple of 7 picks a different gradient depending on the precision.");
    // How often does that actually bite? The permute chain's outputs are integers in [0, 289).
    let dj = 0, dx = 0;
    for (let pv = 0; pv < 289; pv++) {
        const j64 = pv - 49 * Math.floor(pv * LIT * LIT);
        const j32 = f(pv - f(49 * Math.floor(f(f(pv) * f(f(LIT) * f(LIT))))));
        if (j64 !== j32) dj++;
        if (Math.floor(j64 * LIT) !== Math.floor(f(j32 * f(LIT)))) dx++;
    }
    ok("!! *** 41 OF THE 289 POSSIBLE PERMUTE OUTPUTS SELECT A DIFFERENT GRADIENT ***",
        dx === 41 && dj === 5,
        dx + " of 289 differ in the gradient index x_, and " + dj + " differ in j itself. That is 14% per " +
        "lookup; four corners are summed per evaluation and octaves are stacked on top, which is how 14% " +
        "per lookup becomes the 76% per pixel that v4243 measured.");
    // *** AND THE MECHANISM v4243 BLAMED IS RULED OUT HERE, not merely replaced. ***
    ok("!! *** THE PERMUTE CHAIN ITSELF IS EXACT AT BOTH PRECISIONS, so mod289 was never the cause ***",
        (() => {
            for (let k = 0; k < 289; k++) {
                const v = ((k * 34) + 1) * k;                 // the largest value the chain reaches, ~2.8e6
                if (v >= 2 ** 24) return false;               // integers below 2^24 are exact in float32
                if (f(v) !== v) return false;
            }
            return true;
        })(),
        "every value the permute chain produces is an integer below 2^24 and is therefore represented " +
        "exactly in 32-bit float. v4243 blamed mod289's floor boundary; two sabotages at v4246 removed the " +
        "rounding from mod289 and then from the whole chain and changed nothing, which is what sent the " +
        "search here. A plausible mechanism that survives no sabotage is a story, not a diagnosis.");
    // The two JS functions are the SAME ALGORITHM, so they must agree where no boundary is straddled.
    let same = 0, tot = 0, worst = 0;
    for (let k = 0; k < 4000; k++) {
        const pt = [Math.sin(k * 1.7) * 5, Math.cos(k * 0.9) * 5, Math.sin(k * 0.3) * 5];
        const a2 = snoise3(...pt), b2 = snoise3f32(...pt);
        tot++;
        if (Math.abs(a2 - b2) < 1e-6) same++;
        worst = Math.max(worst, Math.abs(a2 - b2));
    }
    ok("!! ...and the two JS versions agree at most points and diverge only where a boundary is straddled",
        same > tot * 0.15 && same < tot && worst > 1,
        same + " of " + tot + " points (" + (100 * same / tot).toFixed(1) + "%) agree to 1e-6, worst " +
        "divergence " + worst.toFixed(3) + ". Agreement everywhere would mean precision does not matter; " +
        "disagreement everywhere would mean snoise3f32 is a different noise. Neither is what this is.");
}

// =============================================================================================================
console.log("\n2. *** WHICH OF THE TWO IS WHAT THE GPU ACTUALLY COMPUTES -- asked of a real GPU ***");
const require_ = createRequire(import.meta.url);
const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skip) {
    report("SKIPPED -- " + skip);
    report("*** A SKIP, NOT A PASS. Section 1 is arithmetic and proves the mechanism EXISTS; only a GPU can " +
           "say which JS function it agrees with, which is the whole claim of this round.");
} else {
    const srv = http.createServer((rq, rs) => {
        const p = path.join(ENG, decodeURIComponent(rq.url.split("?")[0]));
        if (!fs.existsSync(p) || !fs.statSync(p).isFile()) { rs.writeHead(404); return rs.end("nf"); }
        rs.writeHead(200, { "content-type": path.extname(p) === ".html" ? "text/html" : "text/javascript" });
        rs.end(fs.readFileSync(p));
    });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
    const pg = await b.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await pg.goto("http://127.0.0.1:" + srv.address().port + "/tools/ship/solidTextureHarness.html", { waitUntil: "load", timeout: 45000 });
    await pg.waitForFunction(() => window.__ready === true, { timeout: 30000 }).catch(() => {});
    const O = [-1.5, -1.0, 0.25], U = [3, 0, 0], V = [0, 2, 0];
    const raw = await pg.evaluate(([o, u, v]) => window.__render(o, u, v, false, true), [O, U, V]);
    await b.close(); srv.close();

    ok("!! the harness rendered RAW simplex, encoded across rgb at 24 bits so the readback is not the limit",
        errs.length === 0 && raw && raw.ok, (raw && raw.error) || errs.slice(0, 1).join(" | "));
    if (raw && raw.ok) {
        const N = raw.n;
        let e64 = 0, e32 = 0, w64 = 0, w32 = 0;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const uu = (x + 0.5) / N, vv = (y + 0.5) / N;
            const p = [O[0] + U[0] * uu + V[0] * vv, O[1] + U[1] * uu + V[1] * vv, O[2] + U[2] * uu + V[2] * vv];
            const i = (y * N + x) * 4;
            const gpu = ((raw.px[i] / 255 + raw.px[i + 1] / 65025 + raw.px[i + 2] / 16581375) - 0.5) * 8;
            const d64 = Math.abs(gpu - snoise3(...p)), d32 = Math.abs(gpu - snoise3f32(...p));
            if (d64 < 1e-3) e64++;
            if (d32 < 1e-3) e32++;
            if (d64 > w64) w64 = d64;
            if (d32 > w32) w32 = d32;
        }
        const T = N * N;
        ok("!! *** snoise3f32 REPRODUCES THE GPU AT EVERY SINGLE POINT ***",
            e32 === T && w32 < 1e-4,
            e32 + " of " + T + " points agree to better than 1e-3, worst deviation " + w32.toExponential(2) +
            " -- which is the 24-bit readback's own resolution, not a disagreement.");
        ok("!! *** ...AND snoise3 DOES NOT, WHICH IS THE CONTROL THAT MAKES THE ABOVE MEAN ANYTHING ***",
            e64 < T * 0.5 && w64 > 1,
            e64 + " of " + T + " (" + (100 * e64 / T).toFixed(1) + "%) for the f64 reference, worst " +
            w64.toFixed(3) + ". Same GPU, same points, same shader, two JS functions -- and only one of them " +
            "is what the hardware computes. Without this line the check above would pass for a noise that " +
            "happened to be right for some other reason.");
    }
}

// =============================================================================================================
// ---- v4246 SABOTAGES, RESTORED BYTE-IDENTICAL AND md5-VERIFIED ------------------------------------------
//
// *** TWO OF THESE PASSED, AND THAT IS HOW THE ROUND FOUND ITS ACTUAL MECHANISM. ***
//
//   A  fround removed from the multiply inside the f32 mod289. -> ALL GREEN. No effect whatsoever.
//   B  fround removed from the ENTIRE permute chain. -> ALL GREEN. Still no effect.
//
//      Those two were aimed at the mechanism v4243 named, and they could not break anything, because the
//      permute chain produces integers below 2^24 and integer arithmetic is exact in 32-bit float. A
//      mechanism no sabotage can break is not a diagnosis; it is a story that happens to sound right. The
//      search moved on and found the gradient index, which section 1 now measures.
//
//   C  snoise3f32 replaced by a call to snoise3. -> 2 RED. The gross case: agreement with the GPU collapses
//      from 9216/9216 to 2164/9216, and the "same algorithm" check goes red the other way, at 100% identical.
//      A check that only asked "does f32 match the GPU" would pass a build where f32 and f64 were the same
//      function and the GPU happened to be graded against neither.
//
//   D  fround removed from the GRADIENT INDEX ALONE -- one line, Math.floor(fmul(n, nsz)) -> Math.floor(n *
//      0.142857142857). -> 1 RED, agreement falling from 9216 to 4146 of 9216. That single rounding is the
//      whole effect, which is the sabotage that turns section 1's argument into a measurement.
//
console.log("\n3. *** WHAT THIS COST THE TREE, COUNTED RATHER THAN FEARED ***");
{
    // The worry filed at v4243 was that every CPU-model-against-GPU gate touching noise had been grading
    // against the wrong function. That is checkable: find the gates that render on a GPU, and see which of
    // them involve simplex.
    const gates = [];
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (e.name === "node_modules" || e.name === ".git" || e.name === "vendor") continue;
            const f = path.join(d, e.name);
            if (e.isDirectory()) walk(f);
            else if (/-selfcheck\.mjs$/.test(e.name)) gates.push(f);
        }
    };
    walk(ENG);
    const gpuGates = [], noiseGpuGates = [];
    for (const g of gates) {
        const src = fs.readFileSync(g, "utf8");
        const rel = path.relative(ENG, g);
        const isGpu = /chromium\.launch|HEADLESS_SHELL/.test(src);
        if (!isGpu) continue;
        gpuGates.push(rel);
        if (/snoise|ashimaNoise/.test(src)) noiseGpuGates.push(rel);
    }
    report("gates that drive a real GPU: " + gpuGates.length + " of " + gates.length + " total");
    report("of those, ones that touch simplex noise: " + (noiseGpuGates.length ? noiseGpuGates.join(", ") : "(none besides this round's)"));
    // *** AND THE ANSWER IS NARROWER THAN THE WORRY, WHICH IS WORTH SAYING PLAINLY. ***
    const aq = fs.readFileSync(path.join(ENG, "render/aquarelle-selfcheck.mjs"), "utf8");
    ok("!! *** THE aquarelle GATE WAS NEVER WRONG -- IT NEVER COMPARED VALUES AT ALL ***",
        !/chromium\.launch|HEADLESS_SHELL/.test(aq) && /unchecked here: the pass RENDERING/.test(aq),
        "render/aquarelle-selfcheck.mjs drives no browser and says so in its own closing note: 'unchecked " +
        "here: the pass RENDERING. That needs a GL context and a GPU.' It compares SOURCE TEXT -- that the " +
        "model calls snoise3 with z pinned to 0, that the shader declares snoise(vec3). v4243 named it as a " +
        "pair at risk; it was at risk of nothing, because it never made the comparison.");
    ok("!! ...so NO gate in this tree was grading a noise shader against the wrong function -- none was grading one at all",
        noiseGpuGates.every((g) => /solidTexture|noisePrecision/.test(g)),
        "the only GPU gates touching simplex are this round's and v4243's, and v4243's is the round that " +
        "discovered the problem. The defect was a MISSING capability, not a wrong result in a shipped gate -- " +
        "which is a smaller claim than the backlog item made and is the one the evidence supports.");
    report("what remains true and is the reason this round exists: any FUTURE gate comparing a noise-based " +
           "shader to a JS model would have been silently ungradeable. It no longer is.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: whether OTHER GPUs agree with swiftshader. Everything above is measured on one " +
    "software rasteriser, and float32 is a standard while the order a compiler evaluates an expression in is " +
    "not -- a driver that contracts a multiply-add differently could land on the other side of a floor " +
    "boundary in a different place. snoise3f32 is therefore the right reference for THIS harness and a " +
    "hypothesis about any other. Also unchecked: the 2D snoise2, which has the same permute chain at smaller " +
    "magnitudes and has not been measured; and whether shaders/ashimaNoise-selfcheck.mjs should now assert " +
    "value agreement rather than text -- it still checks constants and a sha256, which is what it was for.");
process.exit(fails ? 1 : 0);
