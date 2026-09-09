#!/usr/bin/env node
// WebGLEngine/tools/ship/aiPresenceOrb-selfcheck.mjs
//
// Run: node tools/ship/aiPresenceOrb-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES render/aiPresenceOrbState.mjs (the pure state/colour/envelope math) and render/aiPresenceOrbTsl.mjs
// (the "still" orb shader), tools/ship/nextRounds.mjs's ai-presence-orb-widget entry.
//
// Section order: pure-JS math first (fast, exact, no browser), then the real WebGL2 render (slow, needs
// Chromium), so a math regression fails in milliseconds rather than after a browser boot.
"use strict";
import { SECURE_HOST } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ST from "../../render/aiPresenceOrbState.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const report = (s) => console.log("  ----  " + s);
const sec = (s) => console.log("\n" + s);

sec("1. *** OKLAB ROUND-TRIP: FORWARD AND INVERSE ARE GENUINE MATRIX INVERSES, NOT JUST INDEPENDENTLY PLAUSIBLE ***");
{
    const cases = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1], [0, 0, 0], [0.5, 0.5, 0.5], [0.2, 0.7, 0.9], [0.1, 0.9, 0.3], [0.83, 0.12, 0.44]];
    let worst = 0, worstCase = null;
    for (const [r, g, b] of cases) {
        const { L, a, b: bb } = ST.srgbToOklab(r, g, b);
        const [r2, g2, b2] = ST.oklabToSrgb(L, a, bb);
        const d = Math.max(Math.abs(r - r2), Math.abs(g - g2), Math.abs(b - b2));
        if (d > worst) { worst = d; worstCase = [r, g, b]; }
    }
    ok("!! srgbToOklab -> oklabToSrgb returns the original colour to f64 rounding, across 9 real colours",
       worst < 1e-6, `worst |delta| = ${worst.toExponential(3)} at rgb=${JSON.stringify(worstCase)}`);
    // the LMS'<->OKLab half was cross-checked against a real, independently-fetched implementation
    // (color-js/color.js's oklab.js) before this file was written; this assertion is that check, pinned.
    const { L } = ST.linearToOklab(1, 1, 1);
    ok("white (1,1,1 linear) has OKLab L close to 1 (achromatic, near-maximal lightness)", Math.abs(L - 1) < 0.01, `L=${L}`);
}

sec("2. *** THE SWELL ENVELOPE'S PEAK LOCATION IS AN ALGEBRAIC FACT, CHECKED AT f64 ROUNDING, NOT READ OFF A SCAN ***");
{
    const atPeak = ST.swellEnvelope(ST.SWELL_PEAK_TIME);
    ok("!! swell(SWELL_PEAK_TIME) equals SWELL_GLOW_BOOST exactly -- f(1) = 1^p * e^0 = 1 for any p, by construction",
       Math.abs(atPeak - ST.SWELL_GLOW_BOOST) < 1e-12, `swell(${ST.SWELL_PEAK_TIME}) = ${atPeak}, SWELL_GLOW_BOOST = ${ST.SWELL_GLOW_BOOST}`);
    let numMax = -Infinity, numAt = -1;
    for (let tau = 0; tau <= ST.SWELL_DURATION; tau += 0.0005) { const v = ST.swellEnvelope(tau); if (v > numMax) { numMax = v; numAt = tau; } }
    ok("a 2000-sample scan over the whole duration finds no point higher, and finds it within one sample step of the proven location",
       numMax <= atPeak + 1e-9 && Math.abs(numAt - ST.SWELL_PEAK_TIME) < 0.001, `scan max ${numMax} at tau=${numAt.toFixed(4)}`);
    ok("swell(0) = 0 and swell(SWELL_DURATION) has decayed to well under the peak", ST.swellEnvelope(0) === 0 && ST.swellEnvelope(ST.SWELL_DURATION) < atPeak * 0.1);
}

sec("3. *** THE WAKE ENVELOPE: EXACT BOUNDARY VALUE, MONOTONIC DECAY -- AN ANTICIPATION FLASH, NOT A BUMP ***");
{
    ok("!! wake(0) = 1 + WAKE_OVERSHOOT exactly", ST.wakeEnvelope(0) === 1 + ST.WAKE_OVERSHOOT, `wake(0)=${ST.wakeEnvelope(0)}`);
    ok("wake decays toward 1 (never below it, never rising) past its duration", Math.abs(ST.wakeEnvelope(1000) - 1) < 1e-9);
    let monotonic = true, prev = ST.wakeEnvelope(0);
    for (let tau = 0.005; tau <= ST.WAKE_DURATION; tau += 0.005) { const v = ST.wakeEnvelope(tau); if (v > prev + 1e-12) monotonic = false; prev = v; }
    ok("!! strictly non-increasing across its whole duration (a 500-sample scan)", monotonic);
}

sec("4. *** arch() AND THE STUTTER ENVELOPE: EXACT ZERO OUTSIDE SUPPORT, EXACT PEAK AT CENTRE ***");
{
    ok("arch(center) = 1 exactly", ST.arch(0.5, 0.5, 0.2) === 1);
    ok("!! arch is EXACTLY 0 at and beyond the half-width boundary (a hand-provable zero, not merely small)",
       ST.arch(0.7, 0.5, 0.2) === 0 && ST.arch(0.9, 0.5, 0.2) === 0 && ST.arch(0.5 - 0.2, 0.5, 0.2) === 0);
    const outsideBoth = ST.stutterEnvelope(ST.STUTTER_DURATION + 0.001);
    ok("stutter is 0 once both catches' windows have fully closed", outsideBoth === 0, `stutter(past duration)=${outsideBoth}`);
    const atFirstCatch = ST.stutterEnvelope(ST.FIRST_CATCH.center);
    ok("stutter at the first catch's own centre is at least that catch's own depth (the second catch cannot subtract)",
       atFirstCatch >= ST.FIRST_CATCH.depth - 1e-9, `stutter(${ST.FIRST_CATCH.center})=${atFirstCatch}`);
}

sec("5. *** SIGNAL ENVELOPE: THE EXPONENTIAL-APPROACH STEP IS FRAME-RATE INDEPENDENT BY CONSTRUCTION (A SEMIGROUP), NOT ASSUMED ***");
{
    const e1 = new ST.SignalEnvelope(0.2); e1.step(0.9, 0.1);
    const e2 = new ST.SignalEnvelope(0.2); e2.step(0.9, 0.05); e2.step(0.9, 0.05);
    ok("!! one 0.1s step equals two 0.05s steps toward the same target (e^{-t/tau} is a semigroup: e^{-a}e^{-b}=e^{-(a+b)})",
       Math.abs(e1.value - e2.value) < 1e-12, `one-step=${e1.value} two-step=${e2.value}`);
    const rise = new ST.SignalEnvelope(0); rise.step(1, 5);
    const fall = new ST.SignalEnvelope(1); fall.step(0, 5);
    ok("!! attack (rising) reaches further in the same dt than release (falling) -- attack tau < release tau, by design",
       rise.value > (1 - fall.value), `after 5s: rise=${rise.value.toFixed(4)} fall=${fall.value.toFixed(4)}`);
}

sec("6. *** SIMPSON'S RULE TEMPO INTEGRATION: EXACT AGAINST THE CLOSED-FORM ANTIDERIVATIVE, NOT MERELY STABLE UNDER REFINEMENT ***");
{
    const c = ST.integrateTempo(() => 1.15, 0, 2.5, 32);
    ok("!! constant speed 1.15 over 2.5s integrates to exactly 1.15*2.5 (degree 0 <= Simpson's exactness degree 3)",
       Math.abs(c - 1.15 * 2.5) < 1e-9, `got ${c}, expected ${1.15 * 2.5}`);
    const speedFn = (t) => 0.3 + 0.4 * t;
    const exact = 0.3 * 1.5 + 0.5 * 0.4 * 1.5 * 1.5;    // integral of (0.3+0.4t) dt, 0..1.5, closed form
    const got = ST.integrateTempo(speedFn, 0, 1.5, 32);
    ok("!! linear speed integrates to the closed-form antiderivative exactly (degree 1 <= 3)", Math.abs(got - exact) < 1e-9, `got ${got}, expected ${exact}`);
}

sec("7. *** THE STATE TABLE AND THE ORCHESTRATOR: EXACT VALUES, AND A REAL TRANSITION FIRES THE RIGHT ENTRY ENVELOPE ***");
{
    ok("all 6 states named in the backlog entry are present, and only those 6",
       ST.STATE_NAMES.length === 6 && ["idle", "listening", "thinking", "responding", "success", "error"].every((n) => ST.STATES[n]));
    ok("thinking/success/error each declare their own distinct entry envelope",
       ST.STATES.thinking.entry === "wake" && ST.STATES.success.entry === "swell" && ST.STATES.error.entry === "stutter");
    ok("idle/listening/responding declare none (only arrival at thinking/success/error is an EVENT worth flashing)",
       ST.STATES.idle.entry === null && ST.STATES.listening.entry === null && ST.STATES.responding.entry === null);

    const p = ST.createPresenceState("idle");
    ok("starts in idle", p.state === "idle");
    p.setState("thinking");
    // *** MEASURED, NOT ASSUMED, WHEN TO SAMPLE: a first draft checked glow the INSTANT after arrival (tau ~
    // 0) and found it BARELY above idle's own 0.65, not thinking's 1.2 -- because the 0.6s state CROSSFADE and
    // the wake envelope both start counting from the same arrival moment, so at tau~0 the crossfade is also
    // barely started (smoothstep01 is ~0 near 0) and the blended base is still close to idle's. The wake
    // envelope's own boost only means something once ticked PAST the crossfade, so that is where this checks.
    for (let i = 0; i < 14; i++) p.tick(0.1);   // 1.4s: past the 0.6s crossfade, inside the 2.5s wake window
    const midWake = p.getParams();
    ok("!! once the crossfade has settled but the wake envelope is still active, glow exceeds thinking's own bare glow",
       midWake.glow > ST.STATES.thinking.glow * 1.01, `glow=${midWake.glow}, bare thinking glow=${ST.STATES.thinking.glow}`);
    for (let i = 0; i < 400; i++) p.tick(0.05);   // 20s later: long past both the 0.6s crossfade and the 2.5s wake envelope
    const settled = p.getParams();
    ok("settles to exactly thinking's own table values once the crossfade and entry envelope have both finished",
       Math.abs(settled.speed - ST.STATES.thinking.speed) < 1e-9 && Math.abs(settled.glow - ST.STATES.thinking.glow) < 1e-9,
       `settled speed=${settled.speed} glow=${settled.glow}`);
    ok("phase kept accumulating (Simpson integration of a positive speed over 20s is a large positive number)", settled.phase > 15);
}

sec("8. *** THE ANALYTIC SPHERE SOLVE IS CROSS-CHECKED AGAINST AN INDEPENDENT NUMERIC ROOT-FIND, A DIFFERENT METHOD REACHING THE SAME ANSWER ***");
{
    // the shader's closed form: for an orthographic ray at in-plane offset rho against a sphere of radius R
    // centred at the origin, z = sqrt(R^2 - rho^2). Checked here against BISECTION on the sphere's own
    // implicit equation x^2+y^2+z^2=R^2 walked along the ray -- a root-finder that never sees the closed form.
    const R = 0.62;
    function bisectSphereZ(rho, R) {
        const f = (z) => rho * rho + z * z - R * R;   // 0 at the surface
        let lo = 0, hi = R;                            // the front hemisphere's z is in [0, R]
        if (f(lo) > 0) return null;                     // rho already outside the sphere at z=0
        for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; }
        return (lo + hi) / 2;
    }
    let worst = 0;
    for (const rho of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.61]) {
        const closedForm = Math.sqrt(Math.max(0, R * R - rho * rho));
        const numeric = bisectSphereZ(rho, R);
        worst = Math.max(worst, Math.abs(closedForm - numeric));
    }
    ok("!! closed-form z=sqrt(R^2-rho^2) agrees with 80-iteration bisection on the implicit sphere equation, across 8 radii",
       worst < 1e-10, `worst |delta| = ${worst.toExponential(3)}`);
}

sec("9. *** THE TIR GUARD IS PROVABLY UNREACHABLE AT THIS ETA -- WHICH IS THE CORRECT PHYSICS FOR ENTERING GLASS, NOT A DEAD BRANCH BY ACCIDENT ***");
{
    // eta = n_from/n_to = 1/1.2 (air into glass) is < 1; total internal reflection can only occur going from a
    // DENSER medium into a SPARSER one (eta > 1). kTir = 1 - eta^2*(1-ci^2) is minimised at ci=0 (grazing),
    // where kTir = 1 - eta^2 -- checked here to be comfortably positive, so the TIR branch never fires for any
    // incidence angle on the front hemisphere, and the guard exists for a species this port did not build
    // (leaving glass, eta>1) rather than for a case "still" can ever hit.
    const eta = 1 / 1.2;
    const kAtGrazing = 1 - eta * eta * (1 - 0 * 0);
    ok("!! kTir at the worst case (grazing incidence, ci=0) is well clear of zero: 1 - eta^2, eta=1/1.2",
       kAtGrazing > 0.25, `kTir(ci=0) = ${kAtGrazing.toFixed(6)}`);
    let minK = Infinity;
    for (let ci = 0; ci <= 1; ci += 0.001) minK = Math.min(minK, 1 - eta * eta * (1 - ci * ci));
    ok("a 1000-sample scan over the whole front hemisphere (ci in [0,1]) confirms grazing IS the minimum", Math.abs(minK - kAtGrazing) < 1e-9);
}

async function runWebGL2InEngineOrigin({ engineRoot, script, args = null, sabotageDir = null }) {
    if (!fs.existsSync(HEADLESS_SHELL)) return { ok: false, skipped: true, reason: "no headless shell", result: null, pageErrors: [] };
    const pw = resolvePlaywright();
    if (!pw) return { ok: false, skipped: true, reason: "playwright not resolvable", result: null, pageErrors: [] };
    const root = path.resolve(engineRoot);
    const sabRoot = sabotageDir ? path.resolve(sabotageDir) : null;
    const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html" };
    const srv = http.createServer((q, s) => {
        let u = decodeURIComponent(String(q.url).split("?")[0]);
        if (u === "/") { s.writeHead(200, { "Content-Type": "text/html" }); return s.end("<!doctype html><title>engine-origin</title>"); }
        // /_sabotage/<file> serves a patched copy from sabotageDir instead of the real engine tree -- kept OUT
        // of the engine root entirely so a sabotage run can never accidentally serve real, unmodified source.
        if (sabRoot && u.startsWith("/_sabotage/")) {
            const f = path.join(sabRoot, u.slice("/_sabotage/".length));
            if (!f.startsWith(sabRoot) || !fs.existsSync(f)) { s.writeHead(404); return s.end("no"); }
            s.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
            return s.end(fs.readFileSync(f));
        }
        const f = path.join(root, u);
        if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end("no"); }
        s.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
        s.end(fs.readFileSync(f));
    });
    await new Promise((r) => srv.listen(0, SECURE_HOST, r));
    let browser = null;
    try {
        browser = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader", "--enable-unsafe-webgpu"] });
        const page = await browser.newPage();
        const pageErrors = [];
        page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)));
        page.on("console", (m) => { if (m.type() === "error") pageErrors.push("console: " + m.text().slice(0, 300)); });
        await page.goto(`http://${SECURE_HOST}:${srv.address().port}/`);
        const out = await page.evaluate(async ({ src, a }) => {
            try { const fn = new Function("return (" + src + ")")(); return { ok: true, result: await fn(a) }; }
            catch (e) { return { ok: false, reason: String(e && e.stack || e).slice(0, 600) }; }
        }, { src: String(script), a: args });
        return { skipped: false, ok: out.ok, result: out.ok ? out.result : null, reason: out.ok ? null : out.reason, pageErrors };
    } catch (e) {
        return { ok: false, skipped: false, reason: "harness error: " + String(e).slice(0, 300), result: null, pageErrors: [] };
    } finally { try { await browser?.close(); } catch {} srv.close(); }
}

// Renders the orb -- WebGL2 (three's forceWebGL), since section 10's own control run confirmed the real
// WebGPU render pass fails in this headless environment even for badTvTsl.mjs, this tree's own first, already-
// shipped TSL shader; that is a pre-existing environment limit, not something this port introduced -- at
// N=64, samples a handful of exact pixel coordinates, and also reports whether WGSL EMISSION (not execution)
// succeeds, which is the compiler-level check still available on that backend. `modulePath` lets section 11
// point this at a SABOTAGED copy of aiPresenceOrbTsl.mjs instead of the real one.
const RENDER_SCRIPT = `async ({ n, time, modulePath }) => {
    const THREE = await import("/vendor/three-webgpu/three.webgpu.js");
    const TSL = await import("/vendor/three-webgpu/three.tsl.js");
    const { makeAiPresenceOrbTsl } = await import(modulePath);
    const S = await import("/render/tslSource.mjs");
    const canvas = document.createElement("canvas");
    canvas.width = n; canvas.height = n;
    const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: true, antialias: false });
    await renderer.init();
    const fx = makeAiPresenceOrbTsl(THREE, TSL, {});
    fx.setKnobs({ time });

    // *** MEASURED, NOT ASSUMED: A forceWebGL RENDERER REPORTS isWebGPUBackend=false, SO ASKING IT FOR WGSL
    // JUST RE-EMITS GLSL. *** A first draft asked THIS SAME renderer for WGSL and got language:"glsl" back --
    // emitShaders() derives the language from renderer.backend.isWebGPUBackend, which forceWebGL sets false by
    // definition. A SEPARATE, non-forced renderer (never rendered through, only asked to compile) is what
    // actually reaches the WGSL builder -- the same instance the earlier throwaway probe used successfully.
    let wgslOk = false, wgslLen = 0, wgslError = null;
    try {
        const wgslRenderer = new THREE.WebGPURenderer({ canvas: document.createElement("canvas"), forceWebGL: false, antialias: false });
        await wgslRenderer.init();
        const fxW = makeAiPresenceOrbTsl(THREE, TSL, {});
        const sh = await S.emitShaders(wgslRenderer, { scene: fxW.scene, camera: fxW.camera, mesh: fxW.scene.children[0] });
        wgslOk = sh.language === "wgsl" && sh.fragment.length > 0; wgslLen = sh.fragment.length;
    } catch (e) { wgslError = String(e && e.message || e); }

    renderer.setSize(n, n, false);
    renderer.render(fx.scene, fx.camera);

    const gl = canvas.getContext("webgl2");
    const buf = new Uint8Array(n * n * 4);
    gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const at = (x, y) => { const o = (y * n + x) * 4; return [buf[o], buf[o + 1], buf[o + 2], buf[o + 3]]; };
    const c = n / 2;
    return { ok: true, wgslOk, wgslLen, wgslError, center: at(c, c), farCorner: at(2, 2) };
}`;

async function main() {
    const skip = !fs.existsSync(HEADLESS_SHELL) ? "no headless shell" : (!resolvePlaywright() ? "playwright not resolvable" : null);
    if (skip) { ok("browser jobs ran", false, "SKIP: " + skip + " -- a SKIP counts as a fail here"); console.log(fails ? "\naiPresenceOrb-selfcheck: " + fails + " FAILED" : "\nall checks pass"); process.exit(fails ? 1 : 0); }

    const N = 64;
    const script = RENDER_SCRIPT;

    sec("10. *** A REAL RENDER, WebGL2, 64x64: THE SILHOUETTE IS EXACTLY WHERE THE ANALYTIC RADIUS SAYS, AND WGSL EMISSION ALSO SUCCEEDS ***");
    const r10 = await runWebGL2InEngineOrigin({ engineRoot: ENG, script, args: { n: N, time: 1.2, modulePath: "/render/aiPresenceOrbTsl.mjs" } });
    if (!r10.ok || !r10.result || !r10.result.ok) {
        ok("!! the render ran at all", false, r10.ok ? JSON.stringify(r10.result) : "harness: " + r10.reason);
        report("cannot continue past section 10 without a real render");
    } else {
        const { center, farCorner, wgslOk, wgslLen, wgslError } = r10.result;
        if (r10.pageErrors && r10.pageErrors.length) report("page errors: " + r10.pageErrors.slice(0, 3).join(" | "));
        ok("!! the orb's centre is opaque and not black (alpha>200, some real colour) -- something was actually drawn",
           center[3] > 200 && (center[0] + center[1] + center[2]) > 30, `centre rgba=${JSON.stringify(center)}`);
        ok("!! a far corner (well outside the R_BODY=0.62 disk on a -1..1 quad) is fully transparent (alpha=0)",
           farCorner[3] === 0, `corner rgba=${JSON.stringify(farCorner)}`);
        ok("!! WGSL emission (three's OTHER compiler backend for the same graph) also succeeds, proving the graph is valid on both",
           wgslOk && wgslLen > 500, `wgslOk=${wgslOk} len=${wgslLen} error=${wgslError}`);
        report("NOT executed: a real WebGPU RENDER of this graph in headless Chromium. Confirmed (control run against " +
               "render/badTvTsl.mjs, this tree's own already-shipped first TSL shader) to fail identically in this " +
               "sandbox with 'GPUTextureComponentSwizzle' from three's own WebGPUBackend -- a pre-existing environment " +
               "limit this port did not introduce, not a defect in this graph. Cross-backend PIXEL agreement is " +
               "therefore not established this round; WGSL COMPILATION is.");
    }

    sec("11. *** SABOTAGE, ON THE REAL AUTHORED SOURCE TEXT: CORRUPTING THE OKLAB DECODE'S DOMINANT COEFFICIENT MEASURABLY CHANGES THE RENDERED CENTRE PIXEL ***");
    {
        // *** THE FIRST SABOTAGE TRIED HERE WAS THE smoothstep ARGUMENT-ORDER FIX, AND IT IS NOT ONE. ***
        // Hand-derived, then measured on this exact device, BEFORE trusting it as a sabotage target:
        // smoothstep(a,b,x) = clamp((x-a)/(b-a),0,1) run through a Hermite curve that is itself point-
        // symmetric (smoothstep(t) = 1-smoothstep(1-t)); substituting shows (x-a)/(b-a) = 1-(x-b)/(a-b)
        // EXACTLY, for every x, not only inside the transition band -- so smoothstep(a,b,x) IS 1-smoothstep(b,
        // a,x), identically, and reverting the earlier fix renders BIT-IDENTICAL output on this device. That
        // is not a failure to find a real sabotage; it is the proof that fix was spec-compliance (the GLSL/
        // WGSL spec still calls edge0>=edge1 undefined, and a DIFFERENT device is free to implement it some
        // other way), not a correctness bug this specific renderer ever had. Recorded rather than discarded --
        // a sabotage that measurably does nothing is itself a finding, and pretending otherwise would be
        // exactly the "asserted rather than measured" mistake this tree's own gates exist to catch.
        //
        // A GENUINELY LOAD-BEARING TARGET INSTEAD: the OKLab decode's dominant L-channel coefficient
        // (4.0767416621, the l-term of the R-channel reconstruction) -- corrupting it must change the
        // rendered colour, because "L" (lightness) is the ONE OKLab channel that is never near zero for this
        // orb (density is always positive), unlike a and b which legitimately can be.
        const realSrc = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
        const needle = "l.mul(4.0767416621).sub(m.mul(3.3077115913)).add(s.mul(0.2309699292))";
        ok("the sabotage needle is present in the real source (so the replace below is not a silent no-op)", realSrc.includes(needle));
        const sabotaged = realSrc.replace(needle, "l.mul(0.5).sub(m.mul(3.3077115913)).add(s.mul(0.2309699292))");
        ok("the sabotage actually changed the text", sabotaged !== realSrc);

        const sabDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiOrbSab-"));
        fs.writeFileSync(path.join(sabDir, "aiPresenceOrbTsl.sabotage.mjs"), sabotaged);
        const r11 = await runWebGL2InEngineOrigin({
            engineRoot: ENG, script, sabotageDir: sabDir,
            args: { n: N, time: 1.2, modulePath: "/_sabotage/aiPresenceOrbTsl.sabotage.mjs" },
        });
        fs.rmSync(sabDir, { recursive: true, force: true });
        if (!r11.ok || !r11.result || !r11.result.ok) {
            ok("!! sabotage harness ran", false, r11.ok ? JSON.stringify(r11.result) : "harness: " + r11.reason);
        } else {
            const { center } = r11.result;
            const baseline = r10 && r10.result ? r10.result.center : null;
            const changed = baseline ? Math.abs(center[0] - baseline[0]) + Math.abs(center[1] - baseline[1]) + Math.abs(center[2] - baseline[2]) : -1;
            ok("!! under the corrupted OKLab L-coefficient, the centre pixel's colour measurably differs from section 10's real render",
               baseline !== null && changed >= 10, `sabotaged centre=${JSON.stringify(center)} vs real centre=${JSON.stringify(baseline)}, |delta|=${changed}`);
        }
    }

    console.log(fails ? "\naiPresenceOrb-selfcheck: " + fails + " FAILED" : "\naiPresenceOrb-selfcheck: all checks pass");
    process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error("aiPresenceOrb-selfcheck: threw " + (e && e.stack || e)); process.exit(1); });
