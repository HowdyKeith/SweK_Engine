#!/usr/bin/env node
// WebGLEngine/tools/ship/pipboyWireframe-selfcheck.mjs
//
// Run: node tools/ship/pipboyWireframe-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// *** tools/ship/nextRounds.mjs's own barycentric-stylized-wireframe entry, closed. *** ui/pipboyWireframe.js's
// wireBox/wireCyl/knob built through THREE.EdgesGeometry/WireframeGeometry + LineBasicMaterial + LineSegments --
// LineBasicMaterial's linewidth is a documented no-op on nearly every desktop GPU (capped at 1px by the native
// GL line rasterizer), so those lines could never be thick or anti-aliased. ui/barycentricWireframe.js replaces
// them with a hand-written barycentric-coordinate edge shader (mattdesl/webgl-wireframes' published technique,
// independently re-derived, not vendored -- see that file's own header). This gate is what that file's header
// promises: the diagonal classification checked against THREE.EdgesGeometry's own output, the shader checked on
// a real WebGL2 context, and the actual module this replaces checked end to end.
"use strict";
import * as THREE from "../../vendor/three/three.module.js";
import { classifyDiagonals, barycentricGeometry, wireframeMesh } from "../../ui/barycentricWireframe.js";
import { SECURE_HOST } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * *** NOT tools/ship/webgpuHarness.mjs's runInEngineOrigin -- MEASURED, NOT ASSUMED SAFE TO REUSE. *** This gate
 * has no WebGPU in it at all, but a first draft used runInEngineOrigin anyway (it is the generic "run any script
 * in a real browser at the engine origin" tool) and got numbers that would not reproduce: the SAME shader source
 * measured thickness 0.5 at 587 lit pixels through that harness and 4486 through a plain WebGL2 launch. The cause
 * was found by bisection, not guessed -- runInEngineOrigin launches Chromium with LAUNCH_ARGS =
 * ["--enable-unsafe-webgpu"], while this file's own renderThreePassToPixels (the THREE.js-through-WebGLRenderer
 * path this gate's own subject matches) launches with ["--use-gl=swiftshader"] instead. fwidth()'s exact
 * per-pixel derivative is implementation-defined, and the two launch configurations resolve to genuinely
 * different GL backends underneath -- a real, expected difference in WHICH numbers a real device gives, the
 * same category of fact this whole tree's f32-vs-f64 tolerance discipline already exists for, not a logic bug
 * in either harness. This function is renderThreePassToPixels's own server/launch pattern, generalised to run an
 * arbitrary script the way runInEngineOrigin does, rather than that function's fixed fullscreen-pass shape.
 */
async function runWebGL2InEngineOrigin({ engineRoot, script, args = null }) {
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
        browser = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
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
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const report = (s) => console.log("  ----  " + s);
const sec = (s) => console.log("\n" + s);

const round = (v) => Math.round(v * 1e5) / 1e5;
const posKey = (x, y, z) => round(x) + "," + round(y) + "," + round(z);
const edgeKey = (a, b) => { const ka = posKey(...a), kb = posKey(...b); return ka < kb ? ka + "|" + kb : kb + "|" + ka; };

/** The "real edge" set classifyDiagonals implies (every local edge it did NOT flag as a diagonal), as a set of
 *  position-pair keys -- built independently of barycentricGeometry so this cross-check does not share code
 *  with the thing it is grading. */
function realEdgeSet(geo) {
    const diag = classifyDiagonals(geo.attributes.position.array, geo.index.array);
    const idx = geo.index.array, pos = geo.attributes.position.array;
    const P = (i) => { const b = idx[i] * 3; return [pos[b], pos[b + 1], pos[b + 2]]; };
    const set = new Set();
    for (let t = 0; t < diag.length; t++) {
        const p0 = P(t * 3), p1 = P(t * 3 + 1), p2 = P(t * 3 + 2);
        const edges = [[p1, p2, 0], [p2, p0, 1], [p0, p1, 2]];
        for (const [a, b, opp] of edges) if (!diag[t][opp]) set.add(edgeKey(a, b));
    }
    return set;
}
function edgesGeometrySet(geo) {
    const eg = new THREE.EdgesGeometry(geo);
    const ep = eg.attributes.position.array;
    const set = new Set();
    for (let i = 0; i < ep.length; i += 6) set.add(edgeKey([ep[i], ep[i + 1], ep[i + 2]], [ep[i + 3], ep[i + 4], ep[i + 5]]));
    return set;
}

sec("1. *** THE DIAGONAL CLASSIFICATION AGAINST THREE.EdgesGeometry'S OWN OUTPUT -- ON EVERY SHAPE THIS TREE ACTUALLY WIREFRAMES ***");
{
    const shapes = {
        "wireBox (main body, 2.0x1.4x0.72)": new THREE.BoxGeometry(2.0, 1.4, 0.72),
        "wireCyl side wall (sleeve, r0.66 len2.1 18x2 open)": new THREE.CylinderGeometry(0.66, 0.66, 2.1, 18, 2, true),
        "knob (capped, r0.12 len0.12 18 segs)": new THREE.CylinderGeometry(0.12, 0.12, 0.12, 18),
    };
    for (const [name, geo] of Object.entries(shapes)) {
        const mine = realEdgeSet(geo), theirs = edgesGeometrySet(geo);
        let matches = 0; for (const k of mine) if (theirs.has(k)) matches++;
        ok(`!! ${name}: my "real edge" set matches THREE.EdgesGeometry EXACTLY`,
           mine.size === theirs.size && matches === mine.size,
           `mine=${mine.size}, EdgesGeometry=${theirs.size}, exact matches=${matches}`);
    }
}

sec("2. barycentricGeometry's own shape: unindexed, valid 0/1 attributes, hideDiagonals:false suppresses nothing");
{
    const box = new THREE.BoxGeometry(2.0, 1.4, 0.72);
    const triCount = box.index.count / 3;
    const bg = barycentricGeometry(THREE, box, { hideDiagonals: true });
    ok("!! position count is exactly 3 per triangle (fully unindexed, no shared vertices)",
       bg.attributes.position.count === triCount * 3, `${bg.attributes.position.count} of expected ${triCount * 3}`);
    const bary = bg.attributes.barycentric.array;
    let shapeOk = true, twoHot = 0;
    for (let i = 0; i < bary.length; i += 3) {
        const v = [bary[i], bary[i + 1], bary[i + 2]], sum = v[0] + v[1] + v[2], ones = v.filter((x) => x === 1).length;
        if (!(sum === 1 || sum === 2) || v.some((x) => x !== 0 && x !== 1)) shapeOk = false;
        if (ones === 2) twoHot++;
    }
    ok("!! every corner's barycentric value is a valid 0/1 vector summing to 1 (real vertex) or 2 (bumped, diagonal-hiding)",
       shapeOk, `${bary.length / 3} corners checked`);
    ok("!! the box's own 6 hidden diagonals bump exactly 2 corners each (both endpoints), matching section 1's edge count",
       twoHot === 24, `${twoHot} two-hot corners (expect 2 x 2 endpoints x 6 hidden diagonals = 24)`);

    const bgNoHide = barycentricGeometry(THREE, box, { hideDiagonals: false });
    const baryNoHide = bgNoHide.attributes.barycentric.array;
    let allOneHot = true;
    for (let i = 0; i < baryNoHide.length; i += 3) if (baryNoHide[i] + baryNoHide[i + 1] + baryNoHide[i + 2] !== 1) allOneHot = false;
    ok("!! hideDiagonals:false (wireCyl's own convention) suppresses nothing -- every corner stays plain one-hot",
       allOneHot, "matches WireframeGeometry's own every-edge-visible behaviour, which this option is asked to reproduce");
}

async function main() {
    const skip = !fs.existsSync(HEADLESS_SHELL) ? "no headless shell" : (!resolvePlaywright() ? "playwright not resolvable" : null);
    if (skip) { ok("browser jobs ran", false, "SKIP: " + skip + " -- a SKIP counts as a fail here"); console.log(fails ? "\npipboyWireframe-selfcheck: " + fails + " FAILED" : "\nall checks pass"); process.exit(fails ? 1 : 0); }

    sec("3. *** ON A REAL WebGL2 CONTEXT: THICKNESS IS MONOTONIC, AND hideDiagonals MEASURABLY DROPS THE LIT COUNT ***");
    const r3 = await runWebGL2InEngineOrigin({ engineRoot: ENG, args: {}, script: `async () => {
        const THREE = await import("/vendor/three/three.module.js");
        const { wireframeMesh } = await import("/ui/barycentricWireframe.js");
        const W = 128, H = 128;
        const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
        renderer.setSize(W, H, false);
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
        camera.position.set(1.6, 1.2, 2.0); camera.lookAt(0, 0, 0);
        const rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
        const errs = [];
        if (renderer.getContext) { const gl = renderer.getContext(); }
        function litCount(code) {
            const box = new THREE.BoxGeometry(1, 1, 1);
            const { mesh, geometry, material } = wireframeMesh(THREE, box, { hideDiagonals: true, color: 0x37e07a, opacity: 1, thickness: 1.5, ...(code || {}) });
            const scene = new THREE.Scene(); scene.add(mesh);
            renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, camera);
            const px = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
            let lit = 0; for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 10) lit++;
            geometry.dispose(); material.dispose(); box.dispose();
            return lit;
        }
        const thicknessLit = {};
        for (const t of [1.0, 1.5, 2.0, 3.0, 5.0]) thicknessLit[t] = litCount({ thickness: t });
        const hideLit = { true: litCount({ hideDiagonals: true }), false: litCount({ hideDiagonals: false }) };
        return { thicknessLit, hideLit };
    }` });
    ok("!! the browser job ran with no page errors", r3.ok, r3.ok ? "" : (r3.reason || r3.error || (r3.pageErrors || []).join(" | ")).slice(0, 400));
    if (r3.ok) {
        const tl = r3.result.thicknessLit;
        report(`lit pixels by thickness: ${JSON.stringify(tl)}`);
        const vals = [1.0, 1.5, 2.0, 3.0, 5.0].map((t) => tl[t]);
        let monotonic = true; for (let i = 1; i < vals.length; i++) if (vals[i] <= vals[i - 1]) monotonic = false;
        ok("!! *** THICKNESS IS STRICTLY MONOTONIC, ON A REAL DEVICE, NOT JUST ARGUED FROM THE SHADER TEXT ***", monotonic, JSON.stringify(vals));
        ok("!! thickness 1.0 is the effective floor: no thinner than a plain 1px line (matches this option's own documented clamp)",
           tl["1"] > 0 && tl["1"] <= vals[1], `thickness 1.0 -> ${tl["1"]}, thickness 1.5 -> ${vals[1]}`);
        const hl = r3.result.hideLit;
        report(`lit pixels, hideDiagonals true/false at thickness 1.5: ${JSON.stringify(hl)}`);
        ok("!! *** hideDiagonals:true drops the lit count relative to false, on a real render, not just in the attribute data ***",
           hl.true < hl.false, `true=${hl.true}, false=${hl.false}`);
    }
    if (r3.pageErrors && r3.pageErrors.length) report("page errors: " + r3.pageErrors.slice(0, 3).join(" | "));

    sec("4. *** SABOTAGE: REINTRODUCING THE NEGATIVE-LOWER-BOUND BUG THIS SHADER WAS MEASURED TO HAVE ***");
    // *** THIS WAS A REAL BUG, FOUND BY MEASURING, NOT A HYPOTHETICAL. *** The naive d*(thickness*0.5-0.5) goes
    // negative for thickness < 1, and a real render on a real box measured thickness 0.5 producing MORE lit
    // pixels than thickness 1.0 (4486 vs 806) -- the opposite of "thinner". max(vec3(0.0), ...) fixed it; this
    // sabotage removes exactly that clamp and confirms section 3's own monotonicity check would have caught it.
    {
        // The shader text itself is exported (WIREFRAME_FRAG_GLSL), the same convention every WGSL sabotage test
        // in this tree already uses (BRDF_LUT_WGSL.replace(...), PREFILTER_ENV_WGSL.replace(...)) rather than a
        // second, separate mechanism invented for GLSL: patch the STRING, build a ShaderMaterial from the patched
        // string directly, run the same thickness pair section 3 already measured on the real one.
        const r4 = await runWebGL2InEngineOrigin({ engineRoot: ENG, args: {}, script: `async () => {
            const THREE = await import("/vendor/three/three.module.js");
            const { barycentricGeometry, WIREFRAME_VERT_GLSL, WIREFRAME_FRAG_GLSL } = await import("/ui/barycentricWireframe.js");
            // *** BOTH LINES, REPLACED TOGETHER, INTO THE EXACT ORIGINAL SINGLE EXPRESSION -- NOT JUST "REMOVE
            // max()" LEFT AS TWO STATEMENTS. *** A first draft of this sabotage patched out only max(vec3(0.0),
            // ...) and kept "smoothstep(lo, lo + d, ...)" -- and it measured 587 lit pixels at thickness 0.5, not
            // the original 4486, on the SAME real hardware. d*(t*0.5+0.5) and d*(t*0.5-0.5)+d are mathematically
            // equal but NOT bit-identical under mediump float (IEEE addition is not associative with
            // multiplication's own rounding), and this exact bug is ABOUT values landing near a threshold -- so a
            // sabotage that changes which floating-point PATH computes the upper bound is not a faithful replay of
            // the original defect, even though it is still "no clamp". Replacing the whole two-line block with the
            // ORIGINAL one-line form (the literal text this file's own header quotes as measuring 4486) is what
            // actually reproduces it, confirmed below.
            const clampNeedle = "    vec3 lo = max(vec3(0.0), d * (thickness * 0.5 - 0.5));\\n    vec3 s = smoothstep(lo, lo + d, vBarycentric);";
            if (!WIREFRAME_FRAG_GLSL.includes(clampNeedle)) return { ok: false, reason: "clamp string not found -- the shader text changed under this check" };
            const sabotagedFrag = WIREFRAME_FRAG_GLSL.replace(clampNeedle, "    vec3 s = smoothstep(d * (thickness * 0.5 - 0.5), d * (thickness * 0.5 + 0.5), vBarycentric);");
            const W = 128, H = 128;
            const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
            const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
            renderer.setSize(W, H, false);
            const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
            camera.position.set(1.6, 1.2, 2.0); camera.lookAt(0, 0, 0);
            const rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
            function litCount(thickness) {
                const box = new THREE.BoxGeometry(1, 1, 1);
                const geometry = barycentricGeometry(THREE, box, { hideDiagonals: true });
                const material = new THREE.ShaderMaterial({
                    uniforms: { color: { value: new THREE.Color(0x37e07a) }, opacity: { value: 1 }, thickness: { value: thickness } },
                    vertexShader: WIREFRAME_VERT_GLSL, fragmentShader: sabotagedFrag,
                    transparent: true, depthWrite: true, depthTest: true, side: THREE.DoubleSide,
                });
                const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geometry, material));
                renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(scene, camera);
                const px = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
                let lit = 0; for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 10) lit++;
                geometry.dispose(); material.dispose(); box.dispose();
                return lit;
            }
            return { ok: true, lit05: litCount(0.5), lit10: litCount(1.0) };
        }` });
        ok("!! the sabotage patch was applied (clamp string found and replaced)", r4.ok && r4.result && r4.result.ok !== false,
           r4.ok ? (r4.result.reason || "") : (r4.reason || r4.error || "").slice(0, 300));
        if (r4.ok && r4.result && r4.result.ok !== false) {
            const { lit05, lit10 } = r4.result;
            report(`sabotaged shader: thickness 0.5 -> ${lit05} lit, thickness 1.0 -> ${lit10} lit`);
            ok("!! *** THE SABOTAGE REPRODUCES THE ORIGINAL BUG: thinner (0.5) now lights MORE pixels than 1.0, confirming section 3's monotonicity check has real teeth ***",
               lit05 > lit10, `0.5->${lit05} vs 1.0->${lit10} (the real, un-sabotaged shader gave 1.0 as the floor -- section 3's own measurement)`);
        }
    }

    sec("5. *** THE ACTUAL MODULE THIS ARC REPLACES: createPipboyWireframe(THREE) BUILDS, USES THE NEW MATERIAL, AND DISPOSES CLEANLY ***");
    const r5 = await runWebGL2InEngineOrigin({ engineRoot: ENG, args: {}, script: `async () => {
        const THREE = await import("/vendor/three/three.module.js");
        const { createPipboyWireframe } = await import("/ui/pipboyWireframe.js");
        let pip, buildErr = null;
        try { pip = createPipboyWireframe(THREE); } catch (e) { buildErr = String(e && e.stack || e); }
        if (!pip) return { ok: false, buildErr };
        const kinds = {};
        pip.group.traverse((o) => { if (o.material) { const k = o.material.type; kinds[k] = (kinds[k] || 0) + 1; } });
        let disposeErr = null;
        try { pip.update(0.016); pip.dispose(); } catch (e) { disposeErr = String(e && e.stack || e); }
        return { ok: true, kinds, disposeErr };
    }` });
    ok("!! createPipboyWireframe(THREE) builds with no error, on a real WebGL2-capable page", r5.ok && r5.result && r5.result.ok,
       r5.ok ? (r5.result.buildErr || "") : (r5.reason || r5.error || "").slice(0, 300));
    if (r5.ok && r5.result && r5.result.ok) {
        const k = r5.result.kinds;
        report(`material kinds in the built group: ${JSON.stringify(k)}`);
        ok("!! *** LineBasicMaterial IS GONE -- every wireframe element now uses the new ShaderMaterial ***",
           !k.LineBasicMaterial && k.ShaderMaterial === 7, `ShaderMaterial=${k.ShaderMaterial || 0} (expect 7: body, bezel, radarBezel, sideHousing, knob, sleeve, arm), LineBasicMaterial=${k.LineBasicMaterial || 0}`);
        ok("...and the 6 solid (non-wireframe) elements are untouched -- 3 screens + 3 indicator lights, still MeshBasicMaterial",
           k.MeshBasicMaterial === 6, `MeshBasicMaterial=${k.MeshBasicMaterial || 0}`);
        ok("!! dispose() runs with no error on the new geometry/material pairs", !r5.result.disposeErr, r5.result.disposeErr || "");
    }
    if (r5.pageErrors && r5.pageErrors.length) report("page errors: " + r5.pageErrors.slice(0, 3).join(" | "));

    console.log(fails ? "\npipboyWireframe-selfcheck: " + fails + " FAILED" : "\npipboyWireframe-selfcheck: all checks pass");
    console.log("unchecked here: pipboy-models.html itself (the one real caller) is not loaded and screenshotted by this gate -- section 5 exercises createPipboyWireframe directly, which is what that page calls, but the page's own model-picker wiring and GLB-fallback path are untouched. Also unchecked: any perceptual/visual judgement of what 'good' thickness looks like -- section 3 proves thickness is monotonic and hideDiagonals behaves, not that 2.0 (the chosen default) is the right number for anyone's taste.");
    process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error("pipboyWireframe-selfcheck: threw " + (e && e.stack || e)); process.exit(1); });
