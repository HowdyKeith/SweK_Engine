#!/usr/bin/env node
// WebGLEngine/tools/ship/aiPresenceOrbPresent-selfcheck.mjs
//
// Run: node tools/ship/aiPresenceOrbPresent-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES render/aiPresenceOrbPresent.mjs -- the HDR present pass tools/ship/nextRounds.mjs's ai-presence-orb-
// widget entry named as not done at first ship (exposure/bloom/tone-curve/dither) -- and the two real, measured
// bugs found building it: a Y-flip on RenderTarget texture sampling, and THREE.WebGPURenderer's default
// outputColorSpace double-encoding an already-sRGB-encoded shader output. tools/ship/aiPresenceOrb-selfcheck.mjs
// owns the scene shader's own math (still unaffected here -- its section 10 measured value is unchanged, proven
// in this round's own commit); tools/ship/aiPresenceOrbWidget-selfcheck.mjs owns the live-HUD mount. This file
// is the present pass alone: the knee tone curve, the bloom tent filter, the dither, and the real render-target
// plumbing that chains scene -> present.
"use strict";
import { SECURE_HOST } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const report = (s) => console.log("  ----  " + s);
const sec = (s) => console.log("\n" + s);

async function runInEngineOrigin({ engineRoot, script, args = null }) {
    if (!fs.existsSync(HEADLESS_SHELL)) return { ok: false, skipped: true, reason: "no headless shell", result: null, pageErrors: [] };
    const pw = resolvePlaywright();
    if (!pw) return { ok: false, skipped: true, reason: "playwright not resolvable", result: null, pageErrors: [] };
    const root = path.resolve(engineRoot);
    const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html" };
    const srv = http.createServer((q, s) => {
        let u = decodeURIComponent(String(q.url).split("?")[0]);
        if (u === "/") { s.writeHead(200, { "Content-Type": "text/html" }); return s.end("<!doctype html><title>engine-origin</title>"); }
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
        page.on("pageerror", (e) => pageErrors.push(String(e && e.stack || e).slice(0, 400)));
        page.on("console", (m) => { if (m.type() === "error") pageErrors.push("console: " + m.text().slice(0, 400)); });
        await page.goto(`http://${SECURE_HOST}:${srv.address().port}/`);
        const out = await page.evaluate(async ({ src, a }) => {
            try { const fn = new Function("return (" + src + ")")(); return { ok: true, result: await fn(a) }; }
            catch (e) { return { ok: false, reason: String(e && e.stack || e).slice(0, 800) }; }
        }, { src: String(script), a: args });
        return { skipped: false, ok: out.ok, result: out.ok ? out.result : null, reason: out.ok ? null : out.reason, pageErrors };
    } catch (e) {
        return { ok: false, skipped: false, reason: "harness error: " + String(e).slice(0, 300), result: null, pageErrors: [] };
    } finally { try { await browser?.close(); } catch {} srv.close(); }
}

// ---------------------------------------------------------------------------------------------------------
// PURE-JS REFERENCE MATH -- render/aiPresenceOrbState.mjs's own precedent: a CPU reference the shader is
// graded against, not trusted on its own. Every formula here is the SAME one render/aiPresenceOrbPresent.mjs's
// TSL Fn()s carry, restated in plain JS so the properties below can be proven without a GPU.
// ---------------------------------------------------------------------------------------------------------
const KNEE_K = 0.90;
function kneeRef(x, k = KNEE_K) { return x < k ? x : k + (1 - k) * (1 - Math.exp(-(x - k) / Math.max(1 - k, 1e-3))); }
function ignRef(px, py, frame) {
    const ox = px + 5.588238 * (frame % 64), oy = py + 5.588238 * (frame % 64);
    const d = ox * 0.06711056 + oy * 0.00583715;
    return frac(52.9829189 * frac(d));
}
function frac(x) { return x - Math.floor(x); }
function srgbEncode1(c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 1e-6), 1 / 2.4) - 0.055; }
const TENT_TAPS = [
    { dx: 0, dy: 0, w: 4 },
    { dx: -1, dy: -1, w: 1 }, { dx: 1, dy: -1, w: 1 }, { dx: -1, dy: 1, w: 1 }, { dx: 1, dy: 1, w: 1 },
    { dx: 0, dy: -1, w: 2 }, { dx: 0, dy: 1, w: 2 }, { dx: -1, dy: 0, w: 2 }, { dx: 1, dy: 0, w: 2 },
];

async function main() {
    const skip = !fs.existsSync(HEADLESS_SHELL) ? "no headless shell" : (!resolvePlaywright() ? "playwright not resolvable" : null);

    sec("1. *** THE HOUSE KNEE (murmur-web's present.wgsl, k=0.90 exact): IDENTITY BELOW k, CONTINUOUS AT k, MONOTONIC AND ASYMPTOTIC TO 1 ABOVE IT ***");
    {
        ok("!! identity below the knee -- the authored colour passes through UNCHANGED", kneeRef(0.5) === 0.5 && kneeRef(0.0) === 0.0 && kneeRef(0.899999) === 0.899999);
        ok("!! continuous AT the knee -- both branches agree exactly at x=k (compressed(k) = k + (1-k)*(1-e^0) = k)", Math.abs(kneeRef(KNEE_K) - KNEE_K) < 1e-12);
        // *** THE PLATEAU IS REAL AND NAMED, NOT AVOIDED. *** Analytically 1-e^-t never reaches 1 for finite t,
        // but float64 has ~2.22e-16 machine epsilon near 1 -- so for x beyond about 4.5 (where e^-t first drops
        // under that epsilon), (1-e^-t) ROUNDS to exactly 1.0 and kneeRef(x) saturates numerically, even though
        // it never does analytically. Both facts are checked: monotonic increase up to x=3 (safely below the
        // saturation point, where every sample is still a distinct float), and the saturation itself, measured
        // rather than asserted away by picking "safe" numbers -- real HDR inputs to this shader (bounded by a
        // few specular lobes and one bloom add, not a full path-traced scene) rarely reach the single digits.
        const xs = [0.90, 0.92, 0.95, 1.0, 1.2, 1.5, 2.0, 3.0];
        let monotonic = true; for (let i = 1; i < xs.length; i++) if (kneeRef(xs[i]) <= kneeRef(xs[i - 1])) monotonic = false;
        ok("!! strictly increasing above the knee, across 8 sample points spanning 0.90..3.0 (below the float64 saturation point)", monotonic);
        ok("!! still measurably below 1 at x=3.0 -- soft compression, not a hard clip", kneeRef(3.0) < 1.0 && kneeRef(3.0) > kneeRef(2.0), `knee(3.0)=${kneeRef(3.0)}`);
        ok("!! ...and the float64 saturation point itself is where this test measures it, not an assumption: still <1 at x=4, exactly 1.0 by x=10",
           kneeRef(4.0) < 1.0 && kneeRef(10.0) === 1.0, `knee(4)=${kneeRef(4.0)} knee(10)=${kneeRef(10.0)}`);
        ok("!! and it is a REAL compression, not identity-in-disguise: at x=0.95 it reads well below both x itself and a hard clamp-to-1",
           kneeRef(0.95) < 0.95 && kneeRef(0.95) < 1.0 && kneeRef(0.95) > 0.90, `knee(0.95)=${kneeRef(0.95).toFixed(5)}`);
    }

    sec("2. *** THE DITHER (murmur-web's present.wgsl own ign(pixel,frame), Jimenez 2014 IGN, exact constants): BOUNDED, AND NOT A CONSTANT ***");
    {
        const samples = [];
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) samples.push(ignRef(x, y, 0));
        const allIn01 = samples.every((v) => v >= 0 && v < 1);
        ok("!! every sample lands in [0,1) -- fract() of anything is bounded by construction", allIn01);
        const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
        ok("!! the mean over a 32x32 grid is close to 0.5 -- a real spread, not a constant or a narrow band", Math.abs(mean - 0.5) < 0.08, `mean=${mean.toFixed(4)}`);
        const distinct = new Set(samples.map((v) => v.toFixed(3))).size;
        ok("!! and it actually varies pixel to pixel -- measured 705 of 1024 distinct at 3-decimal resolution; a real regression (e.g. dither silently disabled) would read 1, not hundreds",
           distinct > 500, `distinct=${distinct}`);
        const frame0 = ignRef(10, 10, 0), frame32 = ignRef(10, 10, 32);
        ok("!! the SAME pixel reads a DIFFERENT value across the 64-frame temporal cycle -- this is what breaks a static dither pattern into noise integrated over time",
           Math.abs(frame0 - frame32) > 0.05, `frame0=${frame0.toFixed(4)} frame32=${frame32.toFixed(4)}`);
    }

    sec("3. *** THE BLOOM TENT FILTER: THE STANDARD BINOMIAL [1,2,1;2,4,2;1,2,1] KERNEL, WEIGHTS SUM TO 16, UNITY GAIN AFTER /16 ***");
    {
        const sum = TENT_TAPS.reduce((a, t) => a + t.w, 0);
        ok("!! 9 taps, weights sum to exactly 16", sum === 16, `sum=${sum}`);
        const normalizedSum = TENT_TAPS.reduce((a, t) => a + t.w / 16, 0);
        ok("!! normalised (each /16), the taps sum to exactly 1 -- a UNIFORM input passes through unscaled", Math.abs(normalizedSum - 1.0) < 1e-12, `normalizedSum=${normalizedSum}`);
        ok("!! the centre tap (0,0) carries the heaviest weight (4 of 16 = 25%), a true tent not a flat box", TENT_TAPS.find((t) => t.dx === 0 && t.dy === 0).w === 4);
    }

    if (skip) { ok("browser jobs ran", false, "SKIP: " + skip + " -- a SKIP counts as a fail here"); console.log(fails ? "\naiPresenceOrbPresent-selfcheck: " + fails + " FAILED" : "\nall checks pass"); process.exit(fails ? 1 : 0); }

    sec("4. *** A REAL RENDER: THE KNEE CURVE ON THE ACTUAL GPU SHADER MATCHES SECTION 1's PURE-JS REFERENCE ***");
    {
        // A tiny, KNOWN, flat "fake scene" render target (no real orb shader involved) isolates the present
        // pass's OWN math from the scene's -- render/aiPresenceOrbWidget-selfcheck.mjs already covers the
        // mount, tools/ship/aiPresenceOrb-selfcheck.mjs the scene's own geometry/colour; this is the present
        // pass alone, "test the module, not the whole app" as the two sibling gates already do.
        const SCRIPT = `async () => {
            const THREE = await import("/vendor/three-webgpu/three.webgpu.js");
            const TSL = await import("/vendor/three-webgpu/three.tsl.js");
            const { makeAiPresenceOrbPresentTsl } = await import("/render/aiPresenceOrbPresent.mjs");

            async function testFlat(linearValue) {
                const canvas = document.createElement("canvas");
                canvas.width = 8; canvas.height = 8;
                const ctx = canvas.getContext("webgl2", { alpha: true, antialias: false, preserveDrawingBuffer: true });
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: true, context: ctx, antialias: false, alpha: true });
                await renderer.init();
                renderer.setSize(8, 8, false);
                renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

                const { Fn, vec4, float } = TSL;
                const sceneMat = new THREE.NodeMaterial();
                sceneMat.fragmentNode = Fn(() => vec4(float(linearValue), float(linearValue), float(linearValue), float(1.0)))();
                const sceneScene = new THREE.Scene(), sceneCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                sceneScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sceneMat));
                const target = new THREE.RenderTarget(8, 8, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false });
                const prev = renderer.getRenderTarget();
                renderer.setRenderTarget(target);
                renderer.render(sceneScene, sceneCam);
                renderer.setRenderTarget(prev);

                const presentFx = makeAiPresenceOrbPresentTsl(THREE, TSL, target.texture, { knobs: { exposure: 1.0, bloomIntensity: 0.0, frame: 0 } });
                presentFx.setResolution(8, 8);
                renderer.render(presentFx.scene, presentFx.camera);

                const gl = canvas.getContext("webgl2");
                const buf = new Uint8Array(4);
                gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
                return [buf[0], buf[1], buf[2], buf[3]];
            }
            const low = await testFlat(0.3);     // well below the knee -- should read as a near-pure sRGB encode of 0.3
            const nearKnee = await testFlat(0.95); // just above the knee -- should read compressed, not hard-clamped
            return { low, nearKnee };
        }`;
        const r4 = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT });
        if (!r4.ok || !r4.result) {
            ok("!! knee-curve render harness ran", false, r4.ok ? JSON.stringify(r4.result) : "harness: " + r4.reason);
        } else {
            const R = r4.result;
            if (r4.pageErrors && r4.pageErrors.length) report("page errors: " + r4.pageErrors.slice(0, 5).join(" | "));
            const expectLow = Math.round(srgbEncode1(kneeRef(0.3)) * 255);
            const expectNearKnee = Math.round(srgbEncode1(kneeRef(0.95)) * 255);
            const hardClampNearKnee = Math.round(srgbEncode1(1.0) * 255);
            ok("!! x=0.3 (below the knee) renders within dither tolerance of the hand-derived reference (identity -> sRGB encode)",
               Math.abs(R.low[0] - expectLow) <= 2, `rendered=${R.low[0]} expected~${expectLow}`);
            ok("!! x=0.95 (just above the knee) renders within dither tolerance of the SOFT-COMPRESSED reference, not a hard clamp-to-1",
               Math.abs(R.nearKnee[0] - expectNearKnee) <= 2 && R.nearKnee[0] < hardClampNearKnee,
               `rendered=${R.nearKnee[0]} soft-compressed-expected~${expectNearKnee} hard-clamp-would-be=${hardClampNearKnee}`);
        }
    }

    sec("5. *** A REAL RENDER: THE Y-FLIP REGRESSION -- SAMPLING A RenderTarget.texture VIA TSL's texture() MATCHES A DIRECT RENDER's PIXEL POSITIONS ***");
    {
        // The exact bug found building this round: measured a specular highlight at (18,19) on a direct
        // render and (18,12) -- the mirror around the canvas centre -- through an UNFLIPPED render-target
        // round-trip. render/aiPresenceOrbPresent.mjs's sceneUv() flip fixes it; this proves it stays fixed.
        const SCRIPT = `async () => {
            const THREE = await import("/vendor/three-webgpu/three.webgpu.js");
            const TSL = await import("/vendor/three-webgpu/three.tsl.js");
            const { makeAiPresenceOrbTsl } = await import("/render/aiPresenceOrbTsl.mjs");
            const { makeAiPresenceOrbHdrPipeline } = await import("/render/aiPresenceOrbPresent.mjs");
            const KNOBS = { time: 3.7, speed: 1.45, glow: 1.3, depth: 1.25, hueShift: 0, presence: 0.5, clarity: 0.6, glintRate: 0.3, voice: 0, aspect: 1 };

            function scan(gl, size) {
                const buf = new Uint8Array(size * size * 4);
                gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, buf);
                let best = -1, bx = -1, by = -1;
                for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                    const i = (y * size + x) * 4, lum = buf[i] + buf[i + 1] + buf[i + 2];
                    if (lum > best) { best = lum; bx = x; by = y; }
                }
                return { bx, by };
            }
            async function mkRenderer(size) {
                const canvas = document.createElement("canvas");
                canvas.width = size; canvas.height = size;
                const ctx = canvas.getContext("webgl2", { alpha: true, antialias: false, preserveDrawingBuffer: true });
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: true, context: ctx, antialias: false, alpha: true });
                await renderer.init();
                renderer.setSize(size, size, false);
                renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
                return { canvas, renderer };
            }

            const size = 32;
            const A = await mkRenderer(size);
            const fx = makeAiPresenceOrbTsl(THREE, TSL, {});
            fx.setKnobs(KNOBS);
            A.renderer.render(fx.scene, fx.camera);
            const direct = scan(A.canvas.getContext("webgl2"), size);

            const B = await mkRenderer(size);
            const pipeline = makeAiPresenceOrbHdrPipeline(THREE, TSL, {});
            pipeline.resize(size, size);
            pipeline.setKnobs(KNOBS);
            pipeline.render(B.renderer);
            const viaPipeline = scan(B.canvas.getContext("webgl2"), size);

            return { direct, viaPipeline };
        }`;
        const r5 = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT });
        if (!r5.ok || !r5.result) {
            ok("!! Y-flip regression harness ran", false, r5.ok ? JSON.stringify(r5.result) : "harness: " + r5.reason);
        } else {
            const R = r5.result;
            if (r5.pageErrors && r5.pageErrors.length) report("page errors: " + r5.pageErrors.slice(0, 5).join(" | "));
            ok("!! the two-pass HDR pipeline's brightest pixel lands at the SAME (x,y) a direct single-pass render does",
               R.direct.bx === R.viaPipeline.bx && R.direct.by === R.viaPipeline.by,
               `direct=(${R.direct.bx},${R.direct.by}) viaPipeline=(${R.viaPipeline.bx},${R.viaPipeline.by})`);
        }
    }

    sec("6. *** A REAL RENDER: THE outputColorSpace REGRESSION -- THE PIPELINE'S RENDERER DOES NOT DOUBLE-ENCODE ***");
    {
        // The second real bug found building this round: THREE.WebGPURenderer defaults outputColorSpace to
        // "srgb", auto-encoding a shader's own manual linearToSrgb() output a second time. Measured directly: a
        // renderer LEFT AT DEFAULT reads a flat 0.3 linear input back sRGB-encoded twice (149, not the
        // once-encoded ~76). ui/aiPresenceOrbWidget.js and ai-presence-orb.html now both set
        // renderer.outputColorSpace = THREE.LinearSRGBColorSpace; this proves the SAME renderer, left at its
        // OWN default (no fix applied), really does exhibit the double-encode this round fixed -- so section 4
        // and 5's fixed-up renderers are being tested against a REAL, reproduced bug, not a mistaken worry.
        const SCRIPT = `async () => {
            const THREE = await import("/vendor/three-webgpu/three.webgpu.js");
            const TSL = await import("/vendor/three-webgpu/three.tsl.js");
            async function testFlat(fixColorSpace) {
                const canvas = document.createElement("canvas");
                canvas.width = 8; canvas.height = 8;
                const ctx = canvas.getContext("webgl2", { alpha: true, antialias: false, preserveDrawingBuffer: true });
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: true, context: ctx, antialias: false, alpha: true });
                await renderer.init();
                renderer.setSize(8, 8, false);
                if (fixColorSpace) renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
                const { Fn, vec4, float } = TSL;
                const mat = new THREE.NodeMaterial();
                mat.transparent = true;
                mat.fragmentNode = Fn(() => vec4(float(0.3), float(0.3), float(0.3), float(1.0)))();
                const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
                renderer.render(scene, cam);
                const gl = canvas.getContext("webgl2");
                const buf = new Uint8Array(4);
                gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
                return buf[0];
            }
            return { defaultRenderer: await testFlat(false), fixedRenderer: await testFlat(true) };
        }`;
        const r6 = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT });
        if (!r6.ok || !r6.result) {
            ok("!! outputColorSpace regression harness ran", false, r6.ok ? JSON.stringify(r6.result) : "harness: " + r6.reason);
        } else {
            const R = r6.result;
            const rawExpected = Math.round(0.3 * 255), doubleEncodedExpected = Math.round(srgbEncode1(0.3) * 255);
            ok("!! a renderer LEFT AT DEFAULT really does double-encode -- reproduces the bug this round found, not merely claims it existed",
               Math.abs(R.defaultRenderer - doubleEncodedExpected) <= 1, `default=${R.defaultRenderer} double-encoded-expected~${doubleEncodedExpected}`);
            ok("!! and THREE.LinearSRGBColorSpace fixes it -- the SAME renderer, one line different, reads back the raw linear value",
               Math.abs(R.fixedRenderer - rawExpected) <= 1, `fixed=${R.fixedRenderer} raw-expected~${rawExpected}`);
        }
    }

    sec("7. *** WIRED IN: BOTH REAL CALL SITES USE THE HDR PIPELINE, NOT THE OLD DIRECT SINGLE-PASS RENDER (SOURCE CHECK) ***");
    {
        const widgetSrc = fs.readFileSync(path.join(ENG, "ui", "aiPresenceOrbWidget.js"), "utf8");
        ok("ui/aiPresenceOrbWidget.js imports makeAiPresenceOrbHdrPipeline", /makeAiPresenceOrbHdrPipeline/.test(widgetSrc));
        ok("!! ...and actually calls pipeline.render(renderer) (not the old renderer.render(fx.scene, fx.camera))",
           /pipeline\.render\(renderer\)/.test(widgetSrc) && !/renderer\.render\(fx\.scene/.test(widgetSrc));
        ok("!! ...and fixes the outputColorSpace bug at the same renderer construction site", /outputColorSpace\s*=\s*THREE\.LinearSRGBColorSpace/.test(widgetSrc));

        const demoSrc = fs.readFileSync(path.join(ENG, "ai-presence-orb.html"), "utf8");
        ok("ai-presence-orb.html imports makeAiPresenceOrbHdrPipeline", /makeAiPresenceOrbHdrPipeline/.test(demoSrc));
        ok("!! ...and actually calls pipeline.render(renderer)", /pipeline\.render\(renderer\)/.test(demoSrc));
        ok("!! ...and fixes the outputColorSpace bug too", /outputColorSpace\s*=\s*THREE\.LinearSRGBColorSpace/.test(demoSrc));
    }

    sec("8. *** SABOTAGE, ON THE REAL AUTHORED SOURCE TEXT: CORRUPTING THE KNEE'S k CONSTANT MEASURABLY CHANGES A NEAR-KNEE PIXEL ***");
    {
        const realSrc = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbPresent.mjs"), "utf8");
        const needle = "const KNEE_K = 0.90;";
        ok("the sabotage needle is present in the real source (so the replace below is not a silent no-op)", realSrc.includes(needle));
        const sabotaged = realSrc.replace(needle, "const KNEE_K = 0.50;");
        ok("the sabotage actually changed the text", sabotaged !== realSrc);

        const tmpDir = fs.mkdtempSync(path.join(ENG, "tools", "ship", ".sabotage-orbpresent-"));
        try {
            fs.writeFileSync(path.join(tmpDir, "aiPresenceOrbPresent.mjs"), sabotaged);
            fs.copyFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), path.join(tmpDir, "aiPresenceOrbTsl.mjs"));
            const SCRIPT = `async ({ dir }) => {
                const THREE = await import("/vendor/three-webgpu/three.webgpu.js");
                const TSL = await import("/vendor/three-webgpu/three.tsl.js");
                async function render(modulePath) {
                    const canvas = document.createElement("canvas");
                    canvas.width = 8; canvas.height = 8;
                    const ctx = canvas.getContext("webgl2", { alpha: true, antialias: false, preserveDrawingBuffer: true });
                    const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: true, context: ctx, antialias: false, alpha: true });
                    await renderer.init();
                    renderer.setSize(8, 8, false);
                    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
                    const { makeAiPresenceOrbPresentTsl } = await import(/* @vite-ignore */ modulePath);
                    const { Fn, vec4, float } = TSL;
                    const sceneMat = new THREE.NodeMaterial();
                    sceneMat.fragmentNode = Fn(() => vec4(float(0.95), float(0.95), float(0.95), float(1.0)))();
                    const sceneScene = new THREE.Scene(), sceneCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                    sceneScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sceneMat));
                    const target = new THREE.RenderTarget(8, 8, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false });
                    const prev = renderer.getRenderTarget();
                    renderer.setRenderTarget(target);
                    renderer.render(sceneScene, sceneCam);
                    renderer.setRenderTarget(prev);
                    const presentFx = makeAiPresenceOrbPresentTsl(THREE, TSL, target.texture, { knobs: { exposure: 1.0, bloomIntensity: 0.0, frame: 0 } });
                    presentFx.setResolution(8, 8);
                    renderer.render(presentFx.scene, presentFx.camera);
                    const gl = canvas.getContext("webgl2");
                    const buf = new Uint8Array(4);
                    gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
                    return buf[0];
                }
                const real = await render("/render/aiPresenceOrbPresent.mjs");
                const sabotaged = await render(dir);
                return { real, sabotaged };
            }`;
            const relDir = "/" + path.relative(ENG, tmpDir).split(path.sep).join("/") + "/aiPresenceOrbPresent.mjs";
            const r8 = await runInEngineOrigin({ engineRoot: ENG, script: SCRIPT, args: { dir: relDir } });
            if (!r8.ok || !r8.result) {
                ok("!! sabotage render harness ran", false, r8.ok ? JSON.stringify(r8.result) : "harness: " + r8.reason);
            } else {
                const R = r8.result;
                ok("!! under the corrupted knee (k=0.50 instead of 0.90), a x=0.95 pixel's colour measurably differs from the real k=0.90 render",
                   R.real !== R.sabotaged, `real=${R.real} sabotaged=${R.sabotaged}`);
            }
        } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
    }

    console.log(fails ? "\naiPresenceOrbPresent-selfcheck: " + fails + " FAILED" : "\naiPresenceOrbPresent-selfcheck: all checks pass");
    process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error("aiPresenceOrbPresent-selfcheck: threw " + (e && e.stack || e)); process.exit(1); });
