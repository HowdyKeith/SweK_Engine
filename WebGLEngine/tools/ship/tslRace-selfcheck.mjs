#!/usr/bin/env node
// WebGLEngine/tools/ship/tslRace-selfcheck.mjs -- v4329
//
// GRADES A RACE PAINTED BY A TSL NODE: the Chaos race's look (render/lyapunovWgsl.mjs LYAPUNOV_LOOK -- the hull's own
// coordinates as r and the seed, the exponent as the shade, lit by the normal) written once as a TSL graph
// (render/physicsTsl.mjs makeLyapunovLookTsl), emitted by three's node builders in WGSL and GLSL, and transplanted by
// render/tslSource.mjs INTO THE FLEET'S OWN SHELL -- the look's vertex stage, its Cam struct, its varyings (local, n,
// color) -- by the semantics three's vertex shader wrote beside each varying (uv, normal, color). The claim is to the
// byte on both backends: the fleets scene with the Chaos fleet's pipeline swapped for the generated one draws the
// hand-written Chaos race on every pixel; the pick is untouched; and the rules refuse by name.
//
// v4325 -- A SECOND SHELL (section 5). The shell transplant was written for the lit layout and, until now, only ever used
// on it -- so "any shell" was an untested word. The sprite layout (p, color, uv; no normal, and a uv that is a real
// attribute rather than the hull's own x and y) is the second, and the Heidler return-stroke current is the graph that
// suits it. What the second shell bought: the rename of three's locals is the SHELL's map now, not the transplant's
// hard-coded four, so a graph that displaces along the normal into a layout that has none is refused by name instead of
// renamed into a variable that layout never declares.
//
// v4326 -- A TEXTURE ACROSS THE BOUNDARY, AND THE TWIN IS SHIPPED CODE (section 6). Until now a shell transplant
// refused every texture, so the fleets' own bitmap sprite -- a texel fetched by integer coordinate, transparent
// texels discarded -- was the one race a graph could not paint. Now the SHELL says which textures it binds and the
// transplant keeps the graph's own label for them; one it does not bind, or a sampled texture where it declares no
// sampler, refuses by name. The claim this buys is the strongest in this file: the twin is not written for the
// occasion, it is render/fleets.mjs SPRITE_WGSL itself -- the generated pipeline draws the fleets' OWN Pixel race
// on every pixel of the frame, with the fleet's own bind hook feeding the generated shader unchanged.
//
// v4327 -- AND A SAMPLER (section 7). The shell may now declare one, and three's own `<tex>_sampler` becomes it, so a
// FILTERED sample crosses where only a texel fetch could before. What decides which of the two three writes is not the
// graph but the TEXTURE: a Linear-filtered texture makes it emit textureSample, a Nearest one makes the same TSL line
// emit textureLoad, and the shell's sampler then goes unused -- measured both ways here, and makeSpriteSampledTsl
// refuses a Nearest texture rather than quietly becoming a fetch. On the device the mirror holds: gfx/device.js hands
// the pipeline the sampler for the BOUND texture's own filter mode, so one generated pipeline draws hard or soft by
// what is bound to it (898 pixels apart on this scene, on both backends).
//
// v4328 -- THE INK LAYOUT, AND THE LAST ONE THE FLEETS HAVE (section 8). The Krbn race's strokes are the flat layout on
// a LINE-LIST: p and colour, no normal, no uv -- not even the hull's own x and y standing in for one, as the lit shell
// does. Its whole shipped fragment is `return v.color;`. A graph crosses here with ONE varying to read, three emits
// exactly one for it, and a graph reaching for a uv is refused by name. It is also the first shell whose TOPOLOGY is
// not the default, and the descriptor carries "line-list" out to the device.
//
// v4329 -- the shells and looks this file grades moved to render/fleetTsl.mjs, out of render/physicsTsl.mjs which
// was named for physics and had grown three shells and five looks. Section 3 also checks the FRONT DOOR now: the
// variants these sections prove (?tsl=1, its sampled twin, the probe forced onto WebGL2) are query strings, and
// server.html's drawer mover files pages rather than URLs -- so they are written out by hand in the Render TSL
// panel, and an unwritten one would leave a mode of the page reachable only by somebody who already knew it.
//
// *** AND WHAT TWIN-GRADING IS BLIND TO, WHICH THIS LAYOUT MADE PLAIN. *** Sabotage N drops the shell's topology, and
// the byte claim does not move: 36,864 of 36,864 pixels still agree, because the twin is built from the SAME shell and
// loses it too. A mistake in a shell moves both halves of the comparison together; only the named assertion on the
// descriptor (topology === "line-list") catches it. Every "on every pixel" line in this file grades the GRAPH against
// the twin, never the shell against itself -- read them that way.
//
// *** AND THE TWO BACKENDS DO NOT RASTERISE A LINE THE SAME. *** The generated ink parts from the fleets' own flat
// strokes on 467 pixels under WebGPU and 415 under WebGL2. Both are byte-exact against their own twin, and the two
// backends' pictures are not each other's -- a line-list claim is per-backend by nature, and this file makes no
// cross-backend pixel claim about one.
//
// *** AND WHAT THE REFUSAL DOES NOT REACH. *** The sampler refusal is WGSL-side only, and correctly so: GLSL's
// sampler2D carries its own sampler, so a sampled graph into a sampler-less shell simply works on the WebGL2 backend
// (sabotage M measured exactly that -- the page's soft path drew the fetched picture and only the shell's NAME gave it
// away). The guard exists for WebGPU, where an undeclared sampler is a binding nothing feeds.
//
// *** AND THE ONE-LINE DIFFERENCE THAT COSTS A UNIFORM NOBODY ASKED FOR. *** three's TextureNode constructor runs
// setUpdateMatrix( uvNode === null ): a texture node built WITHOUT a uv turns the texture's uv-transform matrix ON,
// and every clone keeps the flag -- textureLoad() clones. So the obvious spelling (texture(tex) first, the fetch
// coordinate later) emits a fragment that multiplies the coordinate by an unlabelled mat3, which this tree refuses
// by name (sabotage I). Written with the uv at construction, the fragment carries NO uniform at all. Measured, not
// guessed: the same graph, one argument apart, is either clean or unusable.
//
// *** AND WHAT THE BYTE CLAIM CANNOT SEE. *** Two sabotages of the hand-written twin's arithmetic -- ((i0/eta) * shape) / i0
// rewritten as (i0 * shape) / (eta * i0), and exp(log(r) * x) rewritten as pow(r, x) -- are algebraically equal and not
// bit-equal, and NEITHER moved a single byte of the picture. The claim these sections make is on the PICTURE, which is
// eight bits a channel; a difference smaller than 1/255 is below it. Read "on every pixel, worst 0" as what it says.
//
// *** AND THE ELEVENTH TIME A SCAN IN THIS TREE COUNTED A GRADER. *** v4324 section 4 builds the hand-written
// twin by cutting the generated WGSL vertex stage out with a regex, and that regex spelled the entry-point
// attribute in full -- so render/backendParity.mjs, whose whole census is that marker, counted this gate as a
// module that SHIPS WGSL: wgslBearing 56 -> 57, wgslOnly 43 -> 44, and, because the gate also imports
// gfx/device.js, it appeared as a third consumer of a contract that has exactly two. Three checks red on a
// gate that had not changed. The fix is the one this tree settled on nine rounds earlier and wrote down in
// backendParity.mjs's header: the attribute is assembled from two pieces at run time, so the census sees a
// string concatenation and the RegExp still sees the attribute. No exclusion list, here or there.
// (v4325 keeps the trick: section 5 splits the fleets' shipped sprite stage on "@ver" + "tex" for the same reason.
// *** AND THE TWELFTH TIME, v4326, IN THE SAME FILE. *** Section 6 asserts the sprite shell declares its atlas by
// writing that declaration out -- and that declaration IS backendParity's framework-style GLSL tell, so the census
// counted this gate as a GLSL-bearing file: glslBearing 145 -> 146, glslOnly 132 -> 133, framework 16 -> 17, and the
// third-consumer line again. Same fix, third time in this file: the tell is assembled from pieces at run time.)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// v4484 -- the write below used to be a bare writeFileSync followed by an existence check. It compares
// the fresh emit against the stored bytes first now, at no extra cost: by the time a gate reaches its
// write the expensive emit has already happened. v4480 recorded this as the open question.
import { writeIfReproducible, snapshot } from "./emitReproducibility.mjs";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import http from "node:http";
import { createRequire } from "node:module";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";
import { varyingSemantics, transplantIntoShell, vertexDisplacement } from "../../render/tslSource.mjs";
import { lyapunovLookShell, heidlerSpriteShell, heidlerSpriteHand, spriteAtlasShell, spriteSampledShell, spriteSampledHand, inkLookShell, inkHand } from "../../render/fleetTsl.mjs";
import { RACES, SPRITE_WGSL, SPRITE_VERTEX_GLSL, INK_WGSL, INK_VERTEX_GLSL } from "../../render/fleets.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EMITTED = path.join(ENG, "tools/ship/tsl-emitted-race.json");
// v4484 -- THE BASELINE, TAKEN BEFORE ANYTHING IS WRITTEN. This gate writes EMITTED five times: once
// with a fresh object that DROPS the four sprite keys, then four merges that add them back. Grading a
// merge against the file as it stands at that moment grades it against a state this same run created,
// and all four reported drift while the file ended byte-identical to the commit.
const EMITTED_BASELINE = snapshot(fs, EMITTED);
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const FIX = JSON.parse(fs.readFileSync(path.join(ENG, "tools/ship/tslRace-fixture.json"), "utf8"));
const fill = (t, m) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => m[k] == null ? "" : m[k]);

console.log("\n1. THE SHELL TRANSPLANT ON THE CPU: three's varyings named by what its vertex stage put in them, the shell's names put in their place");
{
    const shell = lyapunovLookShell([{ stride: 40, stepMode: "vertex", attributes: [] }, { stride: 48, stepMode: "instance", attributes: [] }]);
    const em = { wgsl: { vertex: FIX.wgslVertex, fragment: fill(FIX.wgslFragment, {}) }, glsl: { vertex: FIX.glslVertex, fragment: fill(FIX.glslFragment, {}) } };
    ok("varyingSemantics reads `varyings.nodeVaryingN = uv | normal | color` off the WGSL vertex and `nodeVaryingN = ...` off the GLSL one", JSON.stringify(varyingSemantics(em.wgsl.vertex, "wgsl")) === JSON.stringify({ nodeVarying3: "uv", nodeVarying4: "normal", nodeVarying5: "color" }) && JSON.stringify(varyingSemantics(em.glsl.vertex, "glsl")) === JSON.stringify({ nodeVarying3: "uv", nodeVarying4: "normal", nodeVarying5: "color" }));
    const d = transplantIntoShell(em, shell);
    ok("*** the transplanted WGSL is the look's own shell (struct Cam, its vertex stage, VOut) with three's body reading v.local, v.n, v.color and cam.light / cam.chaos ***", d.shaders.wgsl.includes(shell.wgsl.prefix.replace("{{DISPLACE}}", "")) && /fs\(v: VOut\)/.test(d.shaders.wgsl) && /v\.local\.x/.test(d.shaders.wgsl) && /normalLocal = v\.n;/.test(d.shaders.wgsl) && /v\.color\.x/.test(d.shaders.wgsl) && /cam\.light\.xyz/.test(d.shaders.wgsl) && !/nodeVarying|object\.|output\.color/.test(d.shaders.wgsl) && validateWgsl(d.shaders.wgsl).length === 0, validateWgsl(d.shaders.wgsl).join("; "));
    ok("  the GLSL the same: the look's vertex stage, vLocal / vN / vColor, light and chaos by name", d.shaders.glsl.vertex === shell.glsl.vertex && /vLocal\.x/.test(d.shaders.glsl.fragment) && /normalLocal = vN;/.test(d.shaders.glsl.fragment) && /vColor\.x/.test(d.shaders.glsl.fragment) && /\blight\.xyz/.test(d.shaders.glsl.fragment) && !/nodeVarying|f_light/.test(d.shaders.glsl.fragment));
    ok("  the descriptor carries the shell's uniform list (viewProj, light, chaos) and the fleet's buffers", d.uniforms.map((u) => u.name).join() === "viewProj,light,chaos" && d.buffers.length === 2 && d.shell === "lyapunov look");
    const noNormal = lyapunovLookShell([]); noNormal.wgsl.varyings = { uv: "v.local" }; noNormal.glsl.varyings = { uv: "vLocal" };
    ok("REFUSED: a varying the shell does not carry (the graph reads the normal, the shell passes only uv)", throwsWith(() => transplantIntoShell(em, noNormal), /which the shell "lyapunov look" does not carry/));
    ok("REFUSED: a uniform the shell's struct lacks, and a fragment that samples a texture", throwsWith(() => transplantIntoShell({ wgsl: { vertex: FIX.wgslVertex, fragment: FIX.wgslFragment.replace("light : vec4<f32>,", "light : vec4<f32>,\n\tgain : f32,") }, glsl: em.glsl }, shell), /not in the shell "lyapunov look"'s struct/) && throwsWith(() => transplantIntoShell({ wgsl: { vertex: FIX.wgslVertex, fragment: FIX.wgslFragment.replace("// uniforms", "// uniforms\n@binding( 3 ) @group( 1 ) var tDiffuse : texture_2d<f32>;") }, glsl: em.glsl }, shell), /does not bind \(it binds no textures\)/));   // v4326: a texture crosses only into a shell that binds it, and this one binds none
    ok("REFUSED: a uniform whose type differs between the fragment and the shell", throwsWith(() => transplantIntoShell({ wgsl: { vertex: FIX.wgslVertex, fragment: FIX.wgslFragment.replace("light : vec4<f32>,", "light : f32,") }, glsl: em.glsl }, shell), /is f32 in the fragment and vec4 in the shell/));
}

console.log("\n2. ON BOTH BACKENDS: the Chaos race drawn by the generated pipeline is the hand-written Chaos race, to the byte, and the pick still names it");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const CHAOS = RACES.findIndex((x) => x.name === "Chaos");
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 192, CHAOS }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const P = await import("/render/fleetTsl.mjs"); const S = await import("/render/tslSource.mjs"); const G = await import("/render/gpuDriven.mjs"); const F = await import("/render/fleets.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const em = {};
        for (const mode of ["webgpu", "webgl2"]) { const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64; const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
            const look = P.makeLyapunovLookTsl(THREE, T, {}); renderer.setRenderTarget(new THREE.RenderTarget(64, 64)); em[mode] = await S.emitShaders(renderer, { scene: look.scene, camera: look.camera, mesh: look.scene.children[0] }); }
        const out = { sem: S.varyingSemantics(em.webgpu.vertex, "wgsl"), emitted: { wgsl: em.webgpu, glsl: em.webgl2 } };
        const records = G.gridScene({ side: 6, z: -2, spacing: 1.2, radii: [0.45] }), count = records.length / 4; const fleetOf = Uint32Array.from({ length: count }, (_, i) => (i % 3 === 0 ? a.CHAOS : i % 10));
        const cam = { viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 100), G.lookAt([0, 0, 8], [0, 0, 0])), eye: [0, 0, 8] };
        for (const backend of ["webgpu", "webgl2"]) {
            const o = {};
            try {
                const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N; const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
                const std = F.standardFleets(dev, { clock: () => 0.5 });
                const scH = G.makeGpuDrivenScene(dev, { fleets: std.fleets, fleetOf, thresholds: [0.03], records }); const pixH = (await scH.frame({ ...cam, read: true, clear: [0.05, 0.05, 0.08, 1] }).pixels).pixels;
                const shell = P.lyapunovLookShell(std.fleets[a.CHAOS].pipeline.buffers); const desc = S.transplantIntoShell({ wgsl: em.webgpu, glsl: em.webgl2 }, shell); if (backend === "webgpu") out.transplanted = { wgsl: desc.shaders.wgsl, glsl: desc.shaders.glsl.fragment };
                const std2 = F.standardFleets(dev, { clock: () => 0.5 }); std2.fleets[a.CHAOS] = { ...std2.fleets[a.CHAOS], pipeline: desc };
                const scT = G.makeGpuDrivenScene(dev, { fleets: std2.fleets, fleetOf, thresholds: [0.03], records }); const pixT = (await scT.frame({ ...cam, read: true, clear: [0.05, 0.05, 0.08, 1] }).pixels).pixels;
                let same = 0, worst = 0, lit = 0; for (let i = 0; i < a.N * a.N; i++) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(pixH[i * 4 + c] - pixT[i * 4 + c])); if (d === 0) same++; worst = Math.max(worst, d); if (pixT[i * 4 + 1] > 40) lit++; }
                const pk = await scT.pickPicture(); let chaosHits = 0; for (const h of pk.hits) if (h && h.fleet === a.CHAOS) chaosHits++;
                o.same = same; o.worst = worst; o.lit = lit; o.total = a.N * a.N; o.chaosHits = chaosHits; o.errs = errs; o.backend = dev.backend;
            } catch (e) { o.error = String(e && e.message || e).slice(0, 400); }
            out[backend] = o;
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error, r.ok ? JSON.stringify([r.result.webgpu && r.result.webgpu.error, r.result.webgl2 && r.result.webgl2.error]) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result.webgpu && !r.result.webgpu.error && !r.result.webgl2.error) {
        const R = r.result;
        ok("three's vertex stage carried three varyings and said what each is: uv, normal, color", JSON.stringify(R.sem) === JSON.stringify({ nodeVarying3: "uv", nodeVarying4: "normal", nodeVarying5: "color" }), JSON.stringify(R.sem));
        for (const b of ["webgpu", "webgl2"]) { const o = R[b];
            ok(`*** ${b}: the Chaos race drawn by the pipeline three GENERATED is the hand-written Chaos race on EVERY pixel (${o.same} of ${o.total}, worst 0), lit and among the other races ***`, o.backend === b && o.same === o.total && o.worst === 0 && o.lit > 500 && o.errs.length === 0, `${o.same}/${o.total}, worst ${o.worst}, ${o.lit} lit; errors ${o.errs.length}`);
            ok(`  ${b}: the pick still names the Chaos ships (the pick pipeline is the fleet's own)`, o.chaosHits > 200, `${o.chaosHits} pixels name Chaos`); }
        const rep0 = writeIfReproducible(fs, EMITTED, { at: "v4322", three: "0.178.0", note: "the Lyapunov look as three's node builders emitted it from render/physicsTsl.mjs makeLyapunovLookTsl, and as render/tslSource.mjs transplanted it into the look's own shell; rewritten by tools/ship/tslRace-selfcheck.mjs on every run", ...R.emitted, transplanted: R.transplanted }, EMITTED_BASELINE);
        ok("the emitted and transplanted look is written to tools/ship/tsl-emitted-race.json for the WGSL corpus", fs.existsSync(EMITTED));
        // *** v4484. *** This file is written FIVE times in one run -- once here with a fresh object and four
        // more merges below -- so the comparison is per-KEY: the keys this write carries, against the stored
        // ones. A whole-file compare would call every intermediate state drift.
        ok("!! *** the Lyapunov look re-emits BYTE-IDENTICAL to the stored artifact ***", rep0.same, rep0.detail);
    }
}

console.log("\n3. THE PAGE (v4323): orrery-gpu.html?tsl=1 swaps the Chaos fleet's pipeline for the generated one, says so, and still names a Chaos ship");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const pw = resolvePlaywright(createRequire(import.meta.url));
    const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json" };
    const srv = http.createServer((q, s2) => { const u = decodeURIComponent(String(q.url).split("?")[0]); const f = path.join(ENG, u === "/" ? "orrery-gpu.html" : u);
        if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s2.writeHead(404); return s2.end("no"); }
        s2.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); s2.end(fs.readFileSync(f)); });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    // the page PRESENTS to a canvas, which loses a WebGPU device on this headless shell (measured at v4319 and again here), so the page
    // is loaded on the WebGL2 route as every other page gate loads its page: three's WebGL backend emits GLSL, and the swap is graded there
    const br = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
    const pg = await br.newPage({ viewport: { width: 640, height: 480 } }); const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    await pg.goto(`http://127.0.0.1:${srv.address().port}/?tsl=1&history=0`, { waitUntil: "load" }); await pg.waitForTimeout(6000);
    const st = await pg.evaluate(() => ({ route: document.getElementById("route").textContent, tsl: window.__universe && window.__universe.tslLook, races: document.getElementById("races").textContent }));
    const chaosPixels = await pg.evaluate(async (CH) => { try { const pk = await window.__lifeScene.pickPicture(); let n = 0; for (const h of pk.hits) if (h && h.fleet === CH) n++; return n; } catch (e) { return "pick failed: " + e.message; } }, RACES.findIndex((x) => x.name === "Chaos"));
    // v4327 -- the same page with &soft=1: the Glyph race's look sampled through the shell's sampler instead of fetched
    const pg2 = await br.newPage({ viewport: { width: 640, height: 480 } }); const errs2 = []; pg2.on("pageerror", (e) => errs2.push(String(e).slice(0, 200)));
    await pg2.goto(`http://127.0.0.1:${srv.address().port}/?tsl=1&soft=1&history=0`, { waitUntil: "load" }); await pg2.waitForTimeout(6000);
    const st2 = await pg2.evaluate(() => (window.__universe && window.__universe.tslLook && window.__universe.tslLook.atlas) || null);
    await br.close(); srv.close();
    ok("*** the page says the Chaos look is GENERATED (a TSL graph, three's language for the backend it is on) and records that the fleet's pipeline IS the generated descriptor ***", !!(st.tsl && st.tsl.language) && st.tsl.applied === true && /GENERATED/.test(st.route), st.route);
    ok("  the language emitted is the device's backend's (WGSL on WebGPU, GLSL on WebGL2)", st.tsl && ((/webgpu/.test(st.route) && st.tsl.language === "wgsl") || (/webgl2/.test(st.route) && st.tsl.language === "glsl")), st.tsl && st.tsl.language);
    ok("  the page threw nothing", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
    ok("  and the identity picture still names Chaos ships (the pick pipeline is the fleet's own; the generated one only paints)", chaosPixels > 0, `${chaosPixels} pixels name Chaos`);
    // v4325 -- the same page, the SECOND shell: the Pixel race's sprite quad painted by the lightning graph
    ok("*** the page also draws the Glyph race's OWN shipped look from a graph, the atlas crossing into the shell it binds ***", !!(st.tsl && st.tsl.atlas) && st.tsl.atlas.applied === true && st.tsl.atlas.textures.join() === "atlas" && st.tsl.atlas.shell === "sprite (atlas)", st.tsl && JSON.stringify(st.tsl.atlas));
    // v4329 -- THE FRONT DOOR OFFERS WHAT THIS SECTION PROVES. The variants above are QUERY STRINGS, which the
    // server page's drawer mover files nothing about (it moves page anchors, not URLs) -- so the Render TSL panel
    // carries them hand-written, and this is the check that they are still there. A page nobody can reach from the
    // front door is the failure pageReach has been ratcheting against for dozens of rounds; a page you can reach
    // only in the one mode that does not show the work is the same failure wearing a query string.
    const front = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    ok("*** server.html's Render TSL panel links the variants this section just proved: ?tsl=1, its sampled twin, and the probe forced onto WebGL2 ***",
        /data-panel="rendertsl"/.test(front) && /href="\/orrery-gpu\.html\?tsl=1"/.test(front) && /href="\/orrery-gpu\.html\?tsl=1&amp;soft=1"/.test(front) && /href="\/tsl-probe\.html\?webgl=1"/.test(front),
        "the drawer moves PAGES; a query variant has to be written out or it is unreachable from the front door");
        ok("*** and the Krbn race's strokes are GENERATED on a LINE-LIST -- the leanest layout, one varying, no uv (v4328) ***", !!(st.tsl && st.tsl.ink) && st.tsl.ink.applied === true && st.tsl.ink.topology === "line-list" && st.tsl.ink.varyings.join() === "color", st.tsl && JSON.stringify(st.tsl.ink));
    ok("*** and with &soft=1 the same race is SAMPLED instead: the shell carries a sampler and the page binds a filtered texture to it (v4327) ***", !!st2 && st2.applied === true && st2.soft === true && st2.shell === "sprite (atlas + sampler)" && errs2.length === 0, `${st2 && JSON.stringify(st2)}; page errors ${errs2.slice(0, 1).join(" | ") || "none"}`);
    ok("*** the page also swapped the Pixel race into the SPRITE shell -- a second layout, whose varyings are uv and colour and no normal ***", !!(st.tsl && st.tsl.sprite) && st.tsl.sprite.applied === true && st.tsl.sprite.shell === "heidler sprite" && st.tsl.sprite.varyings.join() === "uv,color", st.tsl && JSON.stringify(st.tsl.sprite));
}

console.log("\n4. THE VERTEX STAGE (v4324): a graph that MOVES the hull -- three's position node carried into the fleet's own vertex stage, to the byte against a hand-written twin");
{
    const vfix = FIX.wgslVertex.replace("\tvaryings.nodeVarying3 = uv;", "\tvar positionLocal : vec3<f32>;\n\tvar normalLocal : vec3<f32>;\n\tpositionLocal = position;\n\tnormalLocal = normal;\n\tpositionLocal = ( positionLocal + ( normalLocal * vec3<f32>( object.amp ) ) );\n\tvaryings.nodeVarying3 = uv;");
    const d = vertexDisplacement(vfix, "wgsl");
    ok("vertexDisplacement reads the statements between `positionLocal = position;` and the varyings, and the uniforms they touch", d && d.statements.length === 1 && /positionLocal = \( positionLocal \+/.test(d.statements[0]) && d.uniforms.join() === "amp" && vertexDisplacement(FIX.wgslVertex, "wgsl") === null);
    const shellNo = lyapunovLookShell([]); const em = { wgsl: { vertex: vfix, fragment: FIX.wgslFragment.replace("light : vec4<f32>,", "light : vec4<f32>,\n\tamp : f32,") } };
    // the vertex reads amp; the fragment does not name it (three's fragment struct carries only what the fragment reads), so the refusal is the displacement's
    const emV = { wgsl: { vertex: vfix, fragment: FIX.wgslFragment } };
    const shellAmpNoHook = lyapunovLookShell([], { extraUniforms: [{ name: "amp", type: "f32" }] }); shellAmpNoHook.wgsl = { ...shellAmpNoHook.wgsl, vertexTemplate: null };
    ok("REFUSED: a moving graph into a shell whose vertex stage has no {{DISPLACE}}, and a displacement reading a uniform the shell lacks", throwsWith(() => transplantIntoShell(emV, shellAmpNoHook), /has no \{\{DISPLACE\}\}/) && throwsWith(() => transplantIntoShell(emV, shellNo), /displacement's uniform "amp" is not in the shell/));
    void em;
    const shellAmp = lyapunovLookShell([], { extraUniforms: [{ name: "amp", type: "f32" }] }); const t = transplantIntoShell({ wgsl: { vertex: vfix, fragment: em.wgsl.fragment } }, shellAmp);
    ok("  with the shell carrying amp and a {{DISPLACE}}, the generated vertex stage is the fleet's own with three's statement in it, renamed (pl, nl, cam.amp), and it validates", t.displaced === true && /pl = \( pl \+ \( nl \* vec3<f32>\( cam\.amp \) \) \);/.test(t.shaders.wgsl) && /turned\(pl, extra\.x\)/.test(t.shaders.wgsl) && !/\{\{DISPLACE\}\}|positionLocal|object\./.test(t.shaders.wgsl) && validateWgsl(t.shaders.wgsl).length === 0, validateWgsl(t.shaders.wgsl).join("; "));
}
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const CHAOS = RACES.findIndex((x) => x.name === "Chaos");
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 192, CHAOS, AMP: 0.12 }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const P = await import("/render/fleetTsl.mjs"); const S = await import("/render/tslSource.mjs"); const G = await import("/render/gpuDriven.mjs"); const F = await import("/render/fleets.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const em = {};
        for (const mode of ["webgpu", "webgl2"]) { const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64; const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
            const look = P.makeLyapunovLookTsl(THREE, T, { breathe: a.AMP }); renderer.setRenderTarget(new THREE.RenderTarget(64, 64)); em[mode] = await S.emitShaders(renderer, { scene: look.scene, camera: look.camera, mesh: look.scene.children[0] }); }
        const out = { statement: (S.vertexDisplacement(em.webgpu.vertex, "wgsl") || {}).statements };
        const records = G.gridScene({ side: 6, z: -2, spacing: 1.2, radii: [0.45] }), count = records.length / 4; const fleetOf = Uint32Array.from({ length: count }, (_, i) => (i % 3 === 0 ? a.CHAOS : i % 10));
        const cam = { viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 100), G.lookAt([0, 0, 8], [0, 0, 0])), eye: [0, 0, 8] };
        const hand = "pl = p + n * (cam.amp * (sin(p.x * 4.0) + 1.0));", handG = "pl = p + n * (amp * (sin(p.x * 4.0) + 1.0));";
        for (const backend of ["webgpu", "webgl2"]) {
            const o = {};
            try {
                const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N; const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
                const draw = async (pipeline, amp) => { const std = F.standardFleets(dev, { clock: () => 0.5 }); const f = std.fleets[a.CHAOS]; if (pipeline) { const ob = f.bind; std.fleets[a.CHAOS] = { ...f, pipeline, bind: (pass, ctx) => { ob(pass, ctx); pass.uniform("amp", amp); } }; }
                    const sc = G.makeGpuDrivenScene(dev, { fleets: std.fleets, fleetOf, thresholds: [0.03], records }); return (await sc.frame({ ...cam, read: true, clear: [0.05, 0.05, 0.08, 1] }).pixels).pixels; };
                const plain = await draw(null, 0);
                const buffers = F.standardFleets(dev, { clock: () => 0.5 }).fleets[a.CHAOS].pipeline.buffers;
                const shellGen = P.lyapunovLookShell(buffers, { extraUniforms: [{ name: "amp", type: "f32" }] }); const descGen = S.transplantIntoShell({ wgsl: em.webgpu, glsl: em.webgl2 }, shellGen);
                const shellHand = P.lyapunovLookShell(buffers, { extraUniforms: [{ name: "amp", type: "f32" }], displace: handG });   // its GLSL vertex is the twin's; the WGSL twin is filled below with the WGSL line
                const twin = { ...descGen, shaders: { wgsl: descGen.shaders.wgsl.replace(new RegExp("@" + "vertex fn vs[\\\\s\\\\S]*?\\\\n}\\\\n"), shellHand.wgsl.vertexTemplate.replace("{{DISPLACE}}", hand) + "\\n"), glsl: { vertex: shellHand.glsl.vertex, fragment: descGen.shaders.glsl.fragment } } };
                const gen = await draw(descGen, a.AMP), tw = await draw(twin, a.AMP), still = await draw(descGen, 0);
                let same = 0, worst = 0, moved = 0, stillSame = 0; for (let i = 0; i < a.N * a.N; i++) { let d = 0, m = 0, s0 = 0; for (let c = 0; c < 3; c++) { d = Math.max(d, Math.abs(gen[i * 4 + c] - tw[i * 4 + c])); m = Math.max(m, Math.abs(gen[i * 4 + c] - plain[i * 4 + c])); s0 = Math.max(s0, Math.abs(still[i * 4 + c] - plain[i * 4 + c])); } if (d === 0) same++; worst = Math.max(worst, d); if (m) moved++; if (s0 === 0) stillSame++; }
                o.same = same; o.worst = worst; o.moved = moved; o.stillSame = stillSame; o.total = a.N * a.N; o.errs = errs; o.backend = dev.backend; o.displaced = descGen.displaced; o.twinHasHand = twin.shaders.wgsl.includes(hand) && twin.shaders.glsl.vertex.includes(handG);
            } catch (e) { o.error = String(e && e.message || e).slice(0, 400); }
            out[backend] = o;
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error, r.ok ? JSON.stringify([r.result.webgpu && r.result.webgpu.error, r.result.webgl2 && r.result.webgl2.error]) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result.webgpu && !r.result.webgpu.error && !r.result.webgl2.error) {
        const R = r.result;
        ok("three put the position node in the VERTEX stage as one statement on positionLocal, and the transplant took it", R.statement && R.statement.length === 1 && /object\.amp/.test(R.statement[0]) && R.webgpu.displaced && R.webgl2.displaced, R.statement && R.statement[0]);
        for (const b of ["webgpu", "webgl2"]) { const o = R[b];
            ok(`*** ${b}: the Chaos race BREATHING by the generated vertex stage is the hand-written twin's picture on EVERY pixel (${o.same} of ${o.total}, worst 0), and it moved (${o.moved} pixels differ from the still race) ***`, o.backend === b && o.twinHasHand && o.same === o.total && o.worst === 0 && o.moved > 500 && o.errs.length === 0, `${o.same}/${o.total}, worst ${o.worst}, ${o.moved} moved; errors ${o.errs.length}`);
            ok(`  ${b}: with amp 0 the generated vertex stage draws the still race exactly (the displacement is the only difference)`, o.stillSame === o.total, `${o.stillSame}/${o.total}`); }
    }
}

console.log("\n5. A SECOND SHELL, A SECOND RACE (v4325): the SPRITE layout -- p, color, uv and no normal -- and the lightning painted on the Pixel race's quad");
{
    const buffers = [{ stride: 36, stepMode: "vertex", attributes: [] }, { stride: 48, stepMode: "instance", attributes: [] }];
    const shell = heidlerSpriteShell(buffers);
    const norm = (t) => t.replace(/\s+/g, " ").trim();
    const shippedW = norm(SPRITE_WGSL.split("@ver" + "tex")[1].split("@frag" + "ment")[0]);
    const mineW = norm(shell.wgsl.vertexTemplate.replace("{{DISPLACE}}", "").split("@ver" + "tex")[1]).replace("var pl = p; ", "").replace("turned(pl,", "turned(p,");
    const shippedG = norm(SPRITE_VERTEX_GLSL.split("void main()")[1]);
    const mineG = norm(shell.glsl.vertexTemplate.replace("{{DISPLACE}}", "").split("void main()")[1]).replace("vec3 pl = p; ", "").replace("turned(pl,", "turned(p,");
    ok("*** the shell's vertex stage IS the fleets' own sprite vertex stage (render/fleets.mjs), in both languages -- the hook and its local are the whole difference ***", mineW === shippedW && mineG === shippedG, mineW === shippedW ? "" : mineW);
    ok("  the hand-written twin of the graph validates as WGSL, and its GLSL says the same arithmetic", validateWgsl(heidlerSpriteHand(buffers).shaders.wgsl).length === 0 && /bolt\.x \/ bolt\.w/.test(heidlerSpriteHand(buffers).shaders.glsl.fragment), validateWgsl(heidlerSpriteHand(buffers).shaders.wgsl).join("; "));
    // the LIT graph -- the Lyapunov look, which reads the normal -- into a shell that has no normal at all
    const em = { wgsl: { vertex: FIX.wgslVertex, fragment: fill(FIX.wgslFragment, {}) }, glsl: { vertex: FIX.glslVertex, fragment: fill(FIX.glslFragment, {}) } };
    ok("REFUSED: the Chaos race's graph (it reads the normal) into the sprite shell, which carries uv and colour and nothing else", throwsWith(() => transplantIntoShell(em, heidlerSpriteShell(buffers, { extraUniforms: [{ name: "light", type: "vec4" }, { name: "chaos", type: "vec4" }] })), /which the shell "heidler sprite" does not carry \(it carries uv, color\)/));
    // and a graph that MOVES vertices along the normal, into a layout that has no normal to move along
    const vfix = FIX.wgslVertex.replace("\tvaryings.nodeVarying3 = uv;", "\tvar positionLocal : vec3<f32>;\n\tvar normalLocal : vec3<f32>;\n\tpositionLocal = position;\n\tnormalLocal = normal;\n\tpositionLocal = ( positionLocal + ( normalLocal * vec3<f32>( object.amp ) ) );\n\tvaryings.nodeVarying3 = uv;");
    const d = vertexDisplacement(vfix, "wgsl");
    ok("vertexDisplacement says WHICH of three's locals the displacement reads (positionLocal and normalLocal here)", d && d.reads.join() === "positionLocal,normalLocal", d && d.reads.join());
    const spriteAmp = heidlerSpriteShell(buffers, { extraUniforms: [{ name: "amp", type: "f32" }, { name: "light", type: "vec4" }, { name: "chaos", type: "vec4" }] });
    ok("*** REFUSED: a displacement along the normal into the sprite layout -- the shell has no name for one, so it is refused rather than renamed into a variable its vertex stage never declared ***", throwsWith(() => transplantIntoShell({ wgsl: { vertex: vfix, fragment: fill(FIX.wgslFragment, {}) } }, spriteAmp), /the displacement reads normalLocal, which the shell "heidler sprite" does not carry/));
    ok("CONTROL: the same displacement into the LIT shell, which does carry one, still crosses", (() => { const t = transplantIntoShell({ wgsl: { vertex: vfix, fragment: FIX.wgslFragment.replace("light : vec4<f32>,", "light : vec4<f32>,\n\tamp : f32,") } }, lyapunovLookShell(buffers, { extraUniforms: [{ name: "amp", type: "f32" }] })); return t.displaced === true && /nl \* vec3<f32>\( cam\.amp \)/.test(t.shaders.wgsl); })());
}
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const PIX = RACES.findIndex((x) => x.name === "Pixel");
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 192, PIX }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const P = await import("/render/fleetTsl.mjs"); const S = await import("/render/tslSource.mjs"); const G = await import("/render/gpuDriven.mjs"); const F = await import("/render/fleets.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const em = {};
        for (const mode of ["webgpu", "webgl2"]) { const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64; const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
            const look = P.makeHeidlerSpriteTsl(THREE, T, {}); renderer.setRenderTarget(new THREE.RenderTarget(64, 64)); em[mode] = await S.emitShaders(renderer, { scene: look.scene, camera: look.camera, mesh: look.scene.children[0] }); }
        const out = { sem: S.varyingSemantics(em.webgpu.vertex, "wgsl"), semG: S.varyingSemantics(em.webgl2.vertex, "glsl"), emitted: { wgsl: em.webgpu, glsl: em.webgl2 }, displaced: S.vertexDisplacement(em.webgpu.vertex, "wgsl") };
        const records = G.gridScene({ side: 6, z: -2, spacing: 1.2, radii: [0.45] }), count = records.length / 4; const fleetOf = Uint32Array.from({ length: count }, (_, i) => (i % 2 === 0 ? a.PIX : i % 10));
        const cam = { viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 100), G.lookAt([0, 0, 8], [0, 0, 0])), eye: [0, 0, 8] };
        const knobs = P.heidlerSpriteKnobs();
        for (const backend of ["webgpu", "webgl2"]) {
            const o = {};
            try {
                const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N; const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
                const draw = async (pipeline) => { const std = F.standardFleets(dev, { clock: () => 0.5 }); const f = std.fleets[a.PIX];
                    if (pipeline) std.fleets[a.PIX] = { ...f, pipeline, bind: (pass) => { pass.uniform("bolt", knobs.bolt); pass.uniform("span", knobs.span); } };
                    const sc = G.makeGpuDrivenScene(dev, { fleets: std.fleets, fleetOf, thresholds: [0.03], records }); const px = (await sc.frame({ ...cam, read: true, clear: [0.05, 0.05, 0.08, 1] }).pixels).pixels; return { px, sc }; };
                const buffers = F.standardFleets(dev, { clock: () => 0.5 }).fleets[a.PIX].pipeline.buffers;
                const shell = P.heidlerSpriteShell(buffers); const descGen = S.transplantIntoShell({ wgsl: em.webgpu, glsl: em.webgl2 }, shell);
                if (backend === "webgpu") out.transplanted = { wgsl: descGen.shaders.wgsl, glsl: descGen.shaders.glsl.fragment };
                const bitmap = (await draw(null)).px, gen = await draw(descGen), tw = (await draw(P.heidlerSpriteHand(buffers))).px;
                let same = 0, worst = 0, differ = 0, bright = 0; for (let i = 0; i < a.N * a.N; i++) { let d = 0, b = 0; for (let c = 0; c < 3; c++) { d = Math.max(d, Math.abs(gen.px[i * 4 + c] - tw[i * 4 + c])); b = Math.max(b, Math.abs(gen.px[i * 4 + c] - bitmap[i * 4 + c])); } if (d === 0) same++; worst = Math.max(worst, d); if (b) differ++; if (gen.px[i * 4 + 1] > 120) bright++; }
                const pk = await gen.sc.pickPicture(); let hits = 0; for (const h of pk.hits) if (h && h.fleet === a.PIX) hits++;
                o.same = same; o.worst = worst; o.differ = differ; o.bright = bright; o.total = a.N * a.N; o.hits = hits; o.errs = errs; o.backend = dev.backend; o.uniforms = descGen.uniforms.map((u) => u.name).join(); o.shell = descGen.shell;
            } catch (e) { o.error = String(e && e.message || e).slice(0, 400); }
            out[backend] = o;
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error, r.ok ? JSON.stringify([r.result.webgpu && r.result.webgpu.error, r.result.webgl2 && r.result.webgl2.error]) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result.webgpu && !r.result.webgpu.error && !r.result.webgl2.error) {
        const R = r.result;
        ok("three's vertex stage carried TWO varyings for this graph -- uv and color, no normal, because the graph never asks for one", JSON.stringify(Object.values(R.sem)) === JSON.stringify(["uv", "color"]) && JSON.stringify(Object.values(R.semG)) === JSON.stringify(["uv", "color"]) && R.displaced === null, JSON.stringify(R.sem) + " " + JSON.stringify(R.semG));
        for (const b of ["webgpu", "webgl2"]) { const o = R[b];
            ok(`*** ${b}: the Pixel race painted by the GENERATED sprite pipeline is the hand-written twin's picture on EVERY pixel (${o.same} of ${o.total}, worst 0) ***`, o.backend === b && o.same === o.total && o.worst === 0 && o.errs.length === 0, `${o.same}/${o.total}, worst ${o.worst}; errors ${o.errs.length}`);
            ok(`  ${b}: it is a DIFFERENT picture from the race's own bitmap look (${o.differ} pixels), the lightning is lit on it (${o.bright}), and the descriptor is the sprite shell's`, o.differ > 300 && o.bright > 50 && o.shell === "heidler sprite" && o.uniforms === "viewProj,bolt,span", `${o.differ} differ, ${o.bright} bright, ${o.uniforms}`);
            ok(`  ${b}: the pick still names the Pixel ships`, o.hits > 100, `${o.hits} pixels name Pixel`); }
        const rep_sprite = { same: true, first: true, detail: "artifact absent: nothing to compare" };
        if (fs.existsSync(EMITTED)) { const j = JSON.parse(fs.readFileSync(EMITTED, "utf8")); j.sprite = { note: "v4325 -- the Heidler sprite look as three's builders emitted it, and as tslSource transplanted it into the sprite shell", ...R.emitted, transplanted: R.transplanted };
            Object.assign(rep_sprite, writeIfReproducible(fs, EMITTED, j, EMITTED_BASELINE)); }
        ok("the emitted and transplanted sprite look joins tools/ship/tsl-emitted-race.json for the WGSL corpus", fs.existsSync(EMITTED) && !!JSON.parse(fs.readFileSync(EMITTED, "utf8")).sprite);
        ok("!! ...and the sprite look re-emits BYTE-IDENTICAL to the stored artifact", rep_sprite.same, rep_sprite.detail);
    }
}

console.log("\n6. A TEXTURE ACROSS THE SHELL BOUNDARY (v4326): the fleets' OWN Pixel look written as a graph, graded against the shipped pipeline itself");
{
    const buffers = [{ stride: 36, stepMode: "vertex", attributes: [] }, { stride: 48, stepMode: "instance", attributes: [] }];
    const shell = spriteAtlasShell(buffers);
    ok("the shell binds the atlas where the fleets' own sprite pipeline binds it -- after the uniform struct, and nothing else with it", shell.textures.join() === "atlas" && shell.uniforms.map((u) => u.name).join() === "viewProj" && /@group\(0\) @binding\(1\) var atlas: texture_2d<f32>;/.test(shell.wgsl.prefix) && new RegExp(" uni" + "form sam" + "pler2D atlas;").test(shell.glsl.fragmentPrefix), shell.wgsl.prefix.split("fn turned")[0]);
    // a fragment that samples a texture the shell does NOT bind, and one that wants a sampler the shell does not declare
    const em = { wgsl: { vertex: FIX.wgslVertex, fragment: fill(FIX.wgslFragment, {}) }, glsl: { vertex: FIX.glslVertex, fragment: fill(FIX.glslFragment, {}) } };
    const withTex = (n) => ({ wgsl: { vertex: FIX.wgslVertex, fragment: fill(FIX.wgslFragment, {}).replace("// uniforms", `// uniforms\n@binding( 0 ) @group( 1 ) var ${n} : texture_2d<f32>;`) }, glsl: em.glsl });
    const litShell = lyapunovLookShell(buffers);
    ok("REFUSED: a texture the shell does not bind (the lit shell binds none at all)", throwsWith(() => transplantIntoShell(withTex("glyphs"), litShell), /which the shell "lyapunov look" does not bind \(it binds no textures\)/));
    const litTex = lyapunovLookShell(buffers); litTex.textures = ["atlas"];
    ok("  and one the shell DOES bind crosses, keeping the name the graph labelled it with", (() => { const d = transplantIntoShell(withTex("atlas"), litTex); return d.textures.join() === "atlas"; })());
    ok("REFUSED: a SAMPLED texture where the shell declares no sampler (a textureLoad graph needs none; a filtered one does)", throwsWith(() => transplantIntoShell({ wgsl: { vertex: FIX.wgslVertex, fragment: fill(FIX.wgslFragment, {}).replace("// uniforms", "// uniforms\n@binding( 0 ) @group( 1 ) var atlas : texture_2d<f32>;").replace("return output;", "output.color = textureSample( atlas, atlas_sampler, vec2<f32>( 0.0 ) );\n\treturn output;") }, glsl: em.glsl }, litTex), /through a sampler and the shell "lyapunov look" declares none/));
}
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const PIX = RACES.findIndex((x) => x.name === "Pixel");
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 192, PIX }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const P = await import("/render/fleetTsl.mjs"); const S = await import("/render/tslSource.mjs"); const G = await import("/render/gpuDriven.mjs"); const F = await import("/render/fleets.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const sb = F.spriteBitmap(0);
        const tex = new THREE.DataTexture(sb.data, sb.width, sb.height); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.needsUpdate = true;
        const em = {};
        for (const mode of ["webgpu", "webgl2"]) { const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64; const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
            const look = P.makeSpriteAtlasTsl(THREE, T, { texture: tex }); renderer.setRenderTarget(new THREE.RenderTarget(64, 64)); em[mode] = await S.emitShaders(renderer, { scene: look.scene, camera: look.camera, mesh: look.scene.children[0] }); }
        const out = { sem: S.varyingSemantics(em.webgpu.vertex, "wgsl"), emitted: { wgsl: em.webgpu, glsl: em.webgl2 },
                      uniformsWgsl: S.uniformFields(em.webgpu.fragment, "wgsl").map((u) => u.name), uniformsGlsl: S.uniformFields(em.webgl2.fragment, "glsl").map((u) => u.name),
                      textures: S.textureNames(em.webgpu.fragment, "wgsl"), fetches: (em.webgpu.fragment.match(/textureLoad\\(/g) || []).length };
        const records = G.gridScene({ side: 6, z: -2, spacing: 1.2, radii: [0.45] }), count = records.length / 4; const fleetOf = Uint32Array.from({ length: count }, (_, i) => (i % 2 === 0 ? a.PIX : i % 10));
        const cam = { viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 100), G.lookAt([0, 0, 8], [0, 0, 0])), eye: [0, 0, 8] };
        for (const backend of ["webgpu", "webgl2"]) {
            const o = {};
            try {
                const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N; const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
                const draw = async (pipeline) => { const std = F.standardFleets(dev, { clock: () => 0.5 }); if (pipeline) std.fleets[a.PIX] = { ...std.fleets[a.PIX], pipeline };   // the fleet's OWN bind hook stands: it binds the atlas by name, and the generated shader declares it under that name
                    const sc = G.makeGpuDrivenScene(dev, { fleets: std.fleets, fleetOf, thresholds: [0.03], records }); const px = (await sc.frame({ ...cam, read: true, clear: [0.05, 0.05, 0.08, 1] }).pixels).pixels; return { px, sc }; };
                const buffers = F.standardFleets(dev, { clock: () => 0.5 }).fleets[a.PIX].pipeline.buffers;
                const desc = S.transplantIntoShell({ wgsl: em.webgpu, glsl: em.webgl2 }, P.spriteAtlasShell(buffers));
                if (backend === "webgpu") out.transplanted = { wgsl: desc.shaders.wgsl, glsl: desc.shaders.glsl.fragment };
                const shipped = (await draw(null)).px, gen = await draw(desc);
                let same = 0, worst = 0, painted = 0; for (let i = 0; i < a.N * a.N; i++) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(gen.px[i * 4 + c] - shipped[i * 4 + c])); if (d === 0) same++; worst = Math.max(worst, d);
                    if (Math.abs(gen.px[i * 4] - 13) > 4 || Math.abs(gen.px[i * 4 + 1] - 13) > 4 || Math.abs(gen.px[i * 4 + 2] - 20) > 4) painted++; }
                const pk = await gen.sc.pickPicture(); let hits = 0; for (const h of pk.hits) if (h && h.fleet === a.PIX) hits++;
                o.same = same; o.worst = worst; o.painted = painted; o.total = a.N * a.N; o.hits = hits; o.errs = errs; o.backend = dev.backend; o.textures = desc.textures; o.shell = desc.shell;
            } catch (e) { o.error = String(e && e.message || e).slice(0, 400); }
            out[backend] = o;
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error, r.ok ? JSON.stringify([r.result.webgpu && r.result.webgpu.error, r.result.webgl2 && r.result.webgl2.error]) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result.webgpu && !r.result.webgpu.error && !r.result.webgl2.error) {
        const R = r.result;
        ok("*** the emitted fragment carries the atlas under the name the graph labelled it with and NO uniform at all -- the uv given at construction, so three's uv-transform matrix is never built ***", R.textures.join() === "atlas" && R.uniformsWgsl.length === 0 && R.uniformsGlsl.length === 0 && JSON.stringify(Object.values(R.sem)) === JSON.stringify(["uv", "color"]), `textures ${R.textures.join()}, uniforms ${R.uniformsWgsl.join()}|${R.uniformsGlsl.join()}, varyings ${JSON.stringify(R.sem)}`);
        report(`three fetches the texel ${R.fetches} times for one Discard that reads it: the var it fetched into is not reused across the discard, so the texel is read again after it. Measured, not fixed -- the picture is the same and the cost is one extra fetch on a texel already in cache.`);
        for (const b of ["webgpu", "webgl2"]) { const o = R[b];
            ok(`*** ${b}: the Pixel race painted by the GENERATED pipeline is the fleets' OWN shipped Pixel race on EVERY pixel (${o.same} of ${o.total}, worst 0) -- transparent texels discarded the same, and the fleet's own bind hook fed the generated shader ***`, o.backend === b && o.same === o.total && o.worst === 0 && o.errs.length === 0 && o.textures.join() === "atlas", `${o.same}/${o.total}, worst ${o.worst}; errors ${o.errs.length}`);
            ok(`  ${b}: the sprite is actually on the screen (${o.painted} pixels are not the clear colour) and the pick still names the Pixel ships`, o.painted > 300 && o.hits > 100, `${o.painted} painted, ${o.hits} name Pixel`); }
        const rep_atlas = { same: true, first: true, detail: "artifact absent: nothing to compare" };
        if (fs.existsSync(EMITTED)) { const j = JSON.parse(fs.readFileSync(EMITTED, "utf8")); j.atlas = { note: "v4326 -- the fleets' own sprite look as three's builders emitted it, and as tslSource transplanted it into the sprite shell with the atlas bound", ...R.emitted, transplanted: R.transplanted };
            Object.assign(rep_atlas, writeIfReproducible(fs, EMITTED, j, EMITTED_BASELINE)); }
        ok("the emitted and transplanted bitmap look joins tools/ship/tsl-emitted-race.json for the WGSL corpus", fs.existsSync(EMITTED) && !!JSON.parse(fs.readFileSync(EMITTED, "utf8")).atlas);
        ok("!! ...and the atlas look re-emits BYTE-IDENTICAL to the stored artifact", rep_atlas.same, rep_atlas.detail);
    }
}

console.log("\n7. AND A SAMPLER (v4327): the same sprite FILTERED -- three's sampler becomes the shell's, and what filters is the texture, not the shader");
{
    const buffers = [{ stride: 36, stepMode: "vertex", attributes: [] }, { stride: 48, stepMode: "instance", attributes: [] }];
    const shell = spriteSampledShell(buffers);
    ok("the shell declares the sampler beside the atlas and names it, so the transplant has somewhere to put three's", shell.wgsl.sampler === "samp" && /@group\(0\) @binding\(2\) var samp: sampler;/.test(shell.wgsl.prefix) && shell.name === "sprite (atlas + sampler)", shell.name);
    const sampled = (t) => ({ wgsl: { vertex: FIX.wgslVertex, fragment: fill(FIX.wgslFragment, {}).replace("// uniforms", `// uniforms\n@binding( 0 ) @group( 1 ) var ${t}_sampler : sampler;\n@binding( 1 ) @group( 1 ) var ${t} : texture_2d<f32>;`).replace("output.color =", `output.color = textureSample( ${t}, ${t}_sampler, vec2<f32>( 0.0 ) ) * 0.0 +`) } });
    // the fixture fragment is the lit race's (it reads the normal), so the shell it crosses into is the lit one, given the
    // atlas and a sampler -- the declaration above is the sprite shell's own, checked as text
    const litS = lyapunovLookShell(buffers); litS.textures = ["atlas"]; litS.wgsl = { ...litS.wgsl, sampler: "samp" };
    const d = transplantIntoShell(sampled("atlas"), litS);
    ok("*** three's own sampler name becomes the shell's, and nothing of three's is left in the fragment ***", /textureSample\( atlas, samp,/.test(d.shaders.wgsl) && !/atlas_sampler/.test(d.shaders.wgsl) && validateWgsl(d.shaders.wgsl).length === 0, validateWgsl(d.shaders.wgsl).join("; "));
    const litNo = lyapunovLookShell(buffers); litNo.textures = ["atlas"];
    ok("REFUSED: the same sampled fragment into a shell that binds the atlas but declares NO sampler (the v4326 shape)", throwsWith(() => transplantIntoShell(sampled("atlas"), litNo), /through a sampler and the shell "lyapunov look" declares none/));
    ok("  the hand-written twin validates as WGSL and says the same thing in GLSL", validateWgsl(spriteSampledHand(buffers).shaders.wgsl).length === 0 && /texture\(atlas, vUv\)/.test(spriteSampledHand(buffers).shaders.glsl.fragment));
}
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const PIX = RACES.findIndex((x) => x.name === "Pixel");
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 192, PIX }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const P = await import("/render/fleetTsl.mjs"); const S = await import("/render/tslSource.mjs"); const G = await import("/render/gpuDriven.mjs"); const F = await import("/render/fleets.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const sb = F.spriteBitmap(0);
        const soft = new THREE.DataTexture(sb.data, sb.width, sb.height); soft.magFilter = THREE.LinearFilter; soft.minFilter = THREE.LinearFilter; soft.generateMipmaps = false; soft.needsUpdate = true;
        const hard = new THREE.DataTexture(sb.data, sb.width, sb.height); hard.magFilter = THREE.NearestFilter; hard.minFilter = THREE.NearestFilter; hard.needsUpdate = true;
        const em = {}; const out = {};
        for (const mode of ["webgpu", "webgl2"]) { const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64; const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
            const look = P.makeSpriteSampledTsl(THREE, T, { texture: soft }); renderer.setRenderTarget(new THREE.RenderTarget(64, 64)); em[mode] = await S.emitShaders(renderer, { scene: look.scene, camera: look.camera, mesh: look.scene.children[0] });
            if (mode === "webgpu") { const nearestLook = P.makeSpriteSampledTsl(THREE, T, { texture: Object.assign(hard, { magFilter: THREE.LinearFilter }) }); hard.magFilter = THREE.NearestFilter; hard.minFilter = THREE.NearestFilter; hard.needsUpdate = true;
                const emN = await S.emitShaders(renderer, { scene: nearestLook.scene, camera: nearestLook.camera, mesh: nearestLook.scene.children[0] });
                out.nearestEmitsFetch = /textureLoad\\(/.test(emN.fragment) && !/textureSample\\(/.test(emN.fragment); } }
        out.sampled = /textureSample\\(/.test(em.webgpu.fragment); out.samplerName = (em.webgpu.fragment.match(/var (\\w+_sampler) : sampler;/) || [])[1];
        out.emitted = { wgsl: em.webgpu, glsl: em.webgl2 };
        const records = G.gridScene({ side: 6, z: -2, spacing: 1.2, radii: [0.45] }), count = records.length / 4; const fleetOf = Uint32Array.from({ length: count }, (_, i) => (i % 2 === 0 ? a.PIX : i % 10));
        const cam = { viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 100), G.lookAt([0, 0, 8], [0, 0, 0])), eye: [0, 0, 8] };
        for (const backend of ["webgpu", "webgl2"]) {
            const o = {};
            try {
                const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N; const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
                const linearTex = dev.texture({ width: sb.width, height: sb.height, data: sb.data, nearest: false });
                const pointTex = dev.texture({ width: sb.width, height: sb.height, data: sb.data, nearest: true });
                const draw = async (pipeline, tex) => { const std = F.standardFleets(dev, { clock: () => 0.5 });
                    if (pipeline) std.fleets[a.PIX] = { ...std.fleets[a.PIX], pipeline, bind: (pass) => pass.texture("atlas", tex, 0) };
                    const sc = G.makeGpuDrivenScene(dev, { fleets: std.fleets, fleetOf, thresholds: [0.03], records }); const px = (await sc.frame({ ...cam, read: true, clear: [0.05, 0.05, 0.08, 1] }).pixels).pixels; return { px, sc }; };
                const buffers = F.standardFleets(dev, { clock: () => 0.5 }).fleets[a.PIX].pipeline.buffers;
                const desc = S.transplantIntoShell({ wgsl: em.webgpu, glsl: em.webgl2 }, P.spriteSampledShell(buffers));
                if (backend === "webgpu") out.transplanted = { wgsl: desc.shaders.wgsl, glsl: desc.shaders.glsl.fragment };
                const gen = await draw(desc, linearTex), tw = (await draw(P.spriteSampledHand(buffers), linearTex)).px, point = (await draw(desc, pointTex)).px;
                let same = 0, worst = 0, softer = 0, painted = 0; for (let i = 0; i < a.N * a.N; i++) { let d = 0, p = 0; for (let c = 0; c < 3; c++) { d = Math.max(d, Math.abs(gen.px[i * 4 + c] - tw[i * 4 + c])); p = Math.max(p, Math.abs(gen.px[i * 4 + c] - point[i * 4 + c])); }
                    if (d === 0) same++; worst = Math.max(worst, d); if (p) softer++;
                    if (Math.abs(gen.px[i * 4] - 13) > 4 || Math.abs(gen.px[i * 4 + 1] - 13) > 4 || Math.abs(gen.px[i * 4 + 2] - 20) > 4) painted++; }
                const pk = await gen.sc.pickPicture(); let hits = 0; for (const h of pk.hits) if (h && h.fleet === a.PIX) hits++;
                o.same = same; o.worst = worst; o.softer = softer; o.painted = painted; o.total = a.N * a.N; o.hits = hits; o.errs = errs; o.backend = dev.backend; o.shell = desc.shell;
            } catch (e) { o.error = String(e && e.message || e).slice(0, 400); }
            out[backend] = o;
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error, r.ok ? JSON.stringify([r.result.webgpu && r.result.webgpu.error, r.result.webgl2 && r.result.webgl2.error]) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result.webgpu && !r.result.webgpu.error && !r.result.webgl2.error) {
        const R = r.result;
        ok("*** WHAT DECIDES IS THE TEXTURE: the same graph emits textureSample for a LinearFilter texture and textureLoad for a Nearest one ***", R.sampled === true && R.samplerName === "atlas_sampler" && R.nearestEmitsFetch === true, `sampled ${R.sampled}, sampler ${R.samplerName}, nearest emits a fetch: ${R.nearestEmitsFetch}`);
        for (const b of ["webgpu", "webgl2"]) { const o = R[b];
            ok(`*** ${b}: the FILTERED sprite drawn by the generated pipeline is the hand-written twin's picture on EVERY pixel (${o.same} of ${o.total}, worst 0) -- three's sampler bound as the shell's ***`, o.backend === b && o.same === o.total && o.worst === 0 && o.errs.length === 0 && o.shell === "sprite (atlas + sampler)", `${o.same}/${o.total}, worst ${o.worst}; errors ${o.errs.length}`);
            ok(`  ${b}: and the SAME pipeline draws a different picture when a point-sampled texture is bound to it (${o.softer} pixels) -- the device picks the sampler by the texture, not the shader`, o.softer > 100 && o.painted > 300 && o.hits > 100, `${o.softer} differ, ${o.painted} painted, ${o.hits} name Pixel`); }
        const rep_sampled = { same: true, first: true, detail: "artifact absent: nothing to compare" };
        if (fs.existsSync(EMITTED)) { const j = JSON.parse(fs.readFileSync(EMITTED, "utf8")); j.sampled = { note: "v4327 -- the filtered sprite look as three emitted it, and as tslSource transplanted it into the sprite shell with the atlas and a sampler", ...R.emitted, transplanted: R.transplanted };
            Object.assign(rep_sampled, writeIfReproducible(fs, EMITTED, j, EMITTED_BASELINE)); }
        ok("the emitted and transplanted filtered look joins tools/ship/tsl-emitted-race.json for the WGSL corpus", fs.existsSync(EMITTED) && !!JSON.parse(fs.readFileSync(EMITTED, "utf8")).sampled);
        ok("!! ...and the sampled look re-emits BYTE-IDENTICAL to the stored artifact", rep_sampled.same, rep_sampled.detail);
    }
}

console.log("\n8. THE INK LAYOUT (v4328): a LINE-LIST, one varying, and no uv anywhere -- the leanest shell the fleets have");
{
    const buffers = [{ stride: 28, stepMode: "vertex", attributes: [] }, { stride: 48, stepMode: "instance", attributes: [] }];
    const shell = inkLookShell(buffers);
    const norm = (t) => t.replace(/\s+/g, " ").trim();
    const shippedW = norm(INK_WGSL.split("@ver" + "tex")[1].split("@frag" + "ment")[0]);
    const mineW = norm(shell.wgsl.vertexTemplate.replace("{{DISPLACE}}", "").split("@ver" + "tex")[1]).replace("var pl = p; ", "").replace("turned(pl,", "turned(p,");
    const shippedG = norm(INK_VERTEX_GLSL.split("void main()")[1]);
    const mineG = norm(shell.glsl.vertexTemplate.replace("{{DISPLACE}}", "").split("void main()")[1]).replace("vec3 pl = p; ", "").replace("turned(pl,", "turned(p,");
    ok("*** the shell's vertex stage IS the fleets' own ink vertex stage, in both languages -- the hook and its local are the whole difference ***", mineW === shippedW && mineG === shippedG, mineW === shippedW ? "" : mineW);
    ok("  and it carries the look's TOPOLOGY, which no shell before it had to", shell.topology === "line-list" && inkHand(buffers).topology === "line-list");
    // the lit fixture reads uv, the normal and the colour; this shell carries the colour alone
    const em = { wgsl: { vertex: FIX.wgslVertex, fragment: fill(FIX.wgslFragment, {}) }, glsl: { vertex: FIX.glslVertex, fragment: fill(FIX.glslFragment, {}) } };
    ok("*** REFUSED: a graph that reads a uv into a layout that has none -- not the hull's x and y standing in for one, a refusal by name ***", throwsWith(() => transplantIntoShell(em, inkLookShell(buffers, { extraUniforms: [{ name: "light", type: "vec4" }, { name: "chaos", type: "vec4" }] })), /which the shell "ink" does not carry \(it carries color\)/));
    ok("  the hand-written twin validates as WGSL and says the same thing in GLSL", validateWgsl(inkHand(buffers).shaders.wgsl).length === 0 && /mix\(vColor\.rgb, vec3\(lum\), ink\.x\)/.test(inkHand(buffers).shaders.glsl.fragment), validateWgsl(inkHand(buffers).shaders.wgsl).join("; "));
}
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const KRBN = RACES.findIndex((x) => x.name === "Krbn");
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 192, KRBN, WASH: 0.6, GAIN: 1.5 }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const P = await import("/render/fleetTsl.mjs"); const S = await import("/render/tslSource.mjs"); const G = await import("/render/gpuDriven.mjs"); const F = await import("/render/fleets.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const em = {};
        for (const mode of ["webgpu", "webgl2"]) { const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64; const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
            const look = P.makeInkTsl(THREE, T, { wash: a.WASH, gain: a.GAIN }); renderer.setRenderTarget(new THREE.RenderTarget(64, 64)); em[mode] = await S.emitShaders(renderer, { scene: look.scene, camera: look.camera, mesh: look.scene.children[0] }); }
        const out = { sem: S.varyingSemantics(em.webgpu.vertex, "wgsl"), semG: S.varyingSemantics(em.webgl2.vertex, "glsl"), emitted: { wgsl: em.webgpu, glsl: em.webgl2 } };
        const records = G.gridScene({ side: 6, z: -2, spacing: 1.2, radii: [0.45] }), count = records.length / 4; const fleetOf = Uint32Array.from({ length: count }, (_, i) => (i % 2 === 0 ? a.KRBN : i % 10));
        const cam = { viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 100), G.lookAt([0, 0, 8], [0, 0, 0])), eye: [0, 0, 8] };
        const knobs = [a.WASH, a.GAIN, 0, 0];
        for (const backend of ["webgpu", "webgl2"]) {
            const o = {};
            try {
                const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N; const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
                const draw = async (pipeline) => { const std = F.standardFleets(dev, { clock: () => 0.5 });
                    if (pipeline) std.fleets[a.KRBN] = { ...std.fleets[a.KRBN], pipeline, bind: (pass) => pass.uniform("ink", knobs) };
                    const sc = G.makeGpuDrivenScene(dev, { fleets: std.fleets, fleetOf, thresholds: [0.03], records }); const px = (await sc.frame({ ...cam, read: true, clear: [0.05, 0.05, 0.08, 1] }).pixels).pixels; return { px, sc }; };
                const buffers = F.standardFleets(dev, { clock: () => 0.5 }).fleets[a.KRBN].pipeline.buffers;
                const desc = S.transplantIntoShell({ wgsl: em.webgpu, glsl: em.webgl2 }, P.inkLookShell(buffers));
                if (backend === "webgpu") out.transplanted = { wgsl: desc.shaders.wgsl, glsl: desc.shaders.glsl.fragment };
                const strokes = (await draw(null)).px, gen = await draw(desc), tw = (await draw(P.inkHand(buffers))).px;
                let same = 0, worst = 0, washed = 0, drawn = 0; for (let i = 0; i < a.N * a.N; i++) { let d = 0, w = 0; for (let c = 0; c < 3; c++) { d = Math.max(d, Math.abs(gen.px[i * 4 + c] - tw[i * 4 + c])); w = Math.max(w, Math.abs(gen.px[i * 4 + c] - strokes[i * 4 + c])); }
                    if (d === 0) same++; worst = Math.max(worst, d); if (w) washed++;
                    if (Math.abs(gen.px[i * 4] - 13) > 3 || Math.abs(gen.px[i * 4 + 1] - 13) > 3 || Math.abs(gen.px[i * 4 + 2] - 20) > 3) drawn++; }
                const pk = await gen.sc.pickPicture(); let hits = 0; for (const h of pk.hits) if (h && h.fleet === a.KRBN) hits++;
                o.same = same; o.worst = worst; o.washed = washed; o.drawn = drawn; o.total = a.N * a.N; o.hits = hits; o.errs = errs; o.backend = dev.backend; o.topology = desc.topology; o.shell = desc.shell;
            } catch (e) { o.error = String(e && e.message || e).slice(0, 400); }
            out[backend] = o;
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error, r.ok ? JSON.stringify([r.result.webgpu && r.result.webgpu.error, r.result.webgl2 && r.result.webgl2.error]) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result.webgpu && !r.result.webgpu.error && !r.result.webgl2.error) {
        const R = r.result;
        ok("*** three's vertex stage carried exactly ONE varying for this graph -- the colour, because the graph asks for nothing else ***", JSON.stringify(Object.values(R.sem)) === JSON.stringify(["color"]) && JSON.stringify(Object.values(R.semG)) === JSON.stringify(["color"]), JSON.stringify(R.sem) + " " + JSON.stringify(R.semG));
        for (const b of ["webgpu", "webgl2"]) { const o = R[b];
            ok(`*** ${b}: the Krbn race's strokes painted by the GENERATED pipeline are the hand-written twin's picture on EVERY pixel (${o.same} of ${o.total}, worst 0), on a LINE-LIST the descriptor carried out to the device ***`, o.backend === b && o.same === o.total && o.worst === 0 && o.errs.length === 0 && o.topology === "line-list" && o.shell === "ink", `${o.same}/${o.total}, worst ${o.worst}, topology ${o.topology}; errors ${o.errs.length}`);
            ok(`  ${b}: the wash did something (${o.washed} pixels differ from the fleets' own flat strokes), the drawing is on the screen (${o.drawn}), and the pick still names the Krbn ships`, o.washed > 100 && o.drawn > 200 && o.hits > 50, `${o.washed} washed, ${o.drawn} drawn, ${o.hits} name Krbn`); }
        const rep_ink = { same: true, first: true, detail: "artifact absent: nothing to compare" };
        if (fs.existsSync(EMITTED)) { const j = JSON.parse(fs.readFileSync(EMITTED, "utf8")); j.ink = { note: "v4328 -- the ink wash as three's builders emitted it, and as tslSource transplanted it into the fleets' line-list shell", ...R.emitted, transplanted: R.transplanted };
            Object.assign(rep_ink, writeIfReproducible(fs, EMITTED, j, EMITTED_BASELINE)); }
        ok("the emitted and transplanted ink look joins tools/ship/tsl-emitted-race.json for the WGSL corpus", fs.existsSync(EMITTED) && !!JSON.parse(fs.readFileSync(EMITTED, "utf8")).ink);
        ok("!! ...and the ink look re-emits BYTE-IDENTICAL to the stored artifact", rep_ink.same, rep_ink.detail);
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4322.
//   A  varyingSemantics() swapping normal and color -> exit=1, 4 red: the fixture's semantics line, both transplant lines, and on
//      the device the GLSL refuses to compile (a vec4 assigned to a vec3) -- a wrong map is a type error before it is a wrong picture.
//   B  the TSL look's shade fixed at 1 (the light dropped) -> exit=1, 3 red: three's vertex stage carries TWO varyings now (uv,
//      color -- the normal is dead and three drops it), and on both backends 36,175 of 36,864 pixels agree: every lit hull pixel
//      differs from the hand-written race, the background and the other races do not.
//   MEASURED at v4323 (the page):
//   C  the page building the generated descriptor but NOT swapping it in (the fleet keeps the hand-written look while the HUD says
//      GENERATED) -> exit=1, 1 red: window.__universe.tslLook.applied is false, and the gate refuses the HUD's word without it.
//   MEASURED at v4324 (the vertex stage):
//   D  vertexDisplacement() returning null for every vertex (the displacement dropped) -> exit=1, 6 red: the CPU lines, and on both
//      backends the "breathing" race moved 0 pixels from the still race and parts from the twin on ~720 pixels.
//   E  the rename leaving normalLocal in place (no `nl`) -> exit=1, 5 red: the generated vertex stage names a variable the shell never
//      declared, the WGSL fails to validate on the CPU and to compile on the device, and nothing breathes.
//   MEASURED at v4325 (the second shell):
//   F  the sprite shell's varyings map swapped (uv <-> color) -> exit=1, 3 red: the page throws before it draws ("'xyz': vector field
//      selection out of range" -- a vec2 read where a vec4 is), its pick never runs, and the WebGL2 device refuses the fragment. A
//      wrong map is a type error before it is a wrong picture, on this layout as on the lit one (sabotage A).
//   G  the graph's uv.y fade dropped (glow = 1) -> exit=1, 2 red: on both backends the generated picture parts from the hand-written
//      twin on 3,416 of 36,864 pixels, worst channel difference 240. The twin grades the graph, not a copy of it.
//   H  transplantIntoShell ignoring the shell's own `locals` (v4324's hard-coded pl/nl/p/n) -> exit=1, 1 red: the displacement along
//      the normal is renamed into `nl` for a vertex stage that never declares one, instead of being refused by name.
//   MEASURED at v4326 (a texture across the boundary):
//   I  the graph's texture node built without its uv (texture(image) instead of texture(image, uv())) -> exit=1, 4 red: the
//      transplant refuses by name ("uniform nodeUniform1 has type mat3, which the device's uniform list does not carry"), the
//      page says so and keeps the Glyph race's own look, and on this headless shell the WebGPU run does not merely fail -- the
//      renderer's execution context is destroyed under it. The refusal is the only thing standing between that and a ship.
//   J  the shell-binds-it check dropped from transplantIntoShell -> exit=1, 2 red: both texture refusals, here and in section 1.
//      A shader declaring a binding nothing feeds would throw at draw, in the device's own words, one layer too late.
//   K  the graph's Discard dropped -> exit=1, 2 red: on both backends the generated race parts from the SHIPPED race on 2,712 of
//      36,864 pixels (worst 20) -- the transparent texels it should have discarded, painted.
//   MEASURED at v4327 (a sampler):
//   L  the sampler rewritten to a name the shell never declares -> exit=1, 3 red: the CPU line, and on WebGPU the frame is wrong
//      everywhere (0 of 36,864 pixels agree, worst 255, 12 device errors). WebGL2 passes unchanged: it has no separate sampler
//      to get wrong, which is the asymmetry stated above rather than a gap in the check.
//   M  the sprite shell built WITHOUT its sampler -> exit=1, 3 red: the declaration line, and the transplant refusing by name on
//      both of section 7's backends. The page's soft path is the third: on GLSL it does not refuse at all, it falls back to the
//      fetching shell and only the shell's name says so.
//   MEASURED at v4328 (the ink layout):
//   N  the ink shell's topology dropped (line-list -> the default) -> exit=1, 4 red: the CPU line, the page's line, and the two
//      device lines on the descriptor's topology alone. The PICTURE claim does not move at all -- see the note above; the twin
//      shares the shell and loses the topology with it. This is the sabotage that found the limit, not a weak one.
//   O  the graph's wash dropped (the colour passed through with only the gain) -> exit=1, 2 red: the generated ink parts from the
//      hand-written twin on 467 pixels under WebGPU and 415 under WebGL2, worst 6. Small, because a wash toward luminance is
//      small on strokes this dark -- and still caught on every one of them.
//   MEASURED at v4329 (the split, and the front door):
//   Q  the ?tsl=1&soft=1 link in server.html's Render TSL panel replaced with the plain page -> exit=1, 1 red, by name. A mode of a
//      page that no link reaches is reachable only by somebody who already knows it exists, which is the whole of pageReach's case.
//   (P and R are in tools/ship/tslPhysics-selfcheck.mjs and tools/ship/pageSections-selfcheck.mjs, the gates that own those claims.)
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the LOOK_KNOBS baked into the TSL Loop where the WGSL reads them at run time (the fleet binds the same numbers, " +
    "so the pictures agree; a page turning the knobs would need a new graph); a MIPPED or anisotropic sample (the device makes one sampler per filter mode, repeat " +
    "addressing, no mip chain, so a graph asking for a level would find nothing to ask); the double texel fetch three emits around a " +
    "Discard, measured here and not fixed; and three's camera or model matrices inside a graph, which stay refused because the shell " +
    "owns the transform.");
process.exit(fails ? 1 : 0);
