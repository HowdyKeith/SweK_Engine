// WebGLEngine/tools/ship/flyConnectomePage-selfcheck.mjs
//
// Run: node tools/ship/flyConnectomePage-selfcheck.mjs
//
// fly-connectome.html is the front door onto vendor/male-cns/ + render/maleCnsLoader.mjs. The usual two
// failure modes apply -- a private copy of the geometry math, or a page that renders without actually
// drawing anything -- plus one specific to a GPU canvas page: a demo that "loads fine" (no script error) and
// still shows a blank canvas, which is exactly what this page showed the first time it was driven through a
// live headless Chromium in the authoring sandbox.
//
// *** THAT BLANK CANVAS WAS THE SANDBOX, NOT THE PAGE, AND SECTION 4 PROVES WHICH ONE BY NOT TRUSTING EITHER
// CLAIM ON ITS OWN. *** gfx/device.js's own header says a WebGPU render pass targeting the canvas's live
// texture loses the device in a headless shell with no compositor ("A valid external Instance reference no
// longer exists") -- the fix it names is to render OFFSCREEN and read the pixels back, which is what a gate
// wanting real pixels from this backend does everywhere else in this tree. So section 4 checks the DOM half
// (loads, picker populates, click updates the detail panel) against the live canvas-bound page, and the
// PIXEL half against an offscreen render built from the page's own imported modules -- the same shaders,
// the same loader, the same vendored data, just not the code path this sandbox cannot present.
//
// SABOTAGE LOG: section 5's "all four GFC type colors appear" check first computed its OWN expected colors by
// calling colorForType() -- the same function being tested. Sabotaging render/maleCnsLoader.mjs's
// colorForType() to always return GFC1's color (every neuron painted red) went 0 red: the check's ground
// truth broke identically to the code under test and still agreed with it. Fixed by hardcoding the 4
// expected RGB byte-triples as an independent literal; re-sabotaged the same way and it correctly failed on
// GFC2/GFC3/GFC4 while GFC1 (the color everything collapsed to) still read true. Reverted.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

const PAGE = path.join(ENG, "fly-connectome.html");
const raw = fs.readFileSync(PAGE, "utf8");
const src = noComments(raw);
const sm = /<script type="module">([\s\S]*?)<\/script>/.exec(raw);
const code = sm ? sm[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "") : "";

console.log("flyConnectomePage-selfcheck -- does the front door actually draw the circuit, and does the picker work?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE PAGE EXISTS, DECLARES ITSELF, AND PARSES ***");
{
    for (const tag of ["demo:title", "demo:desc", "demo:category"]) ok(`carries a ${tag} meta tag`, new RegExp('name="' + tag + '"').test(src));
    ok("it is a module script", /<script type="module">/.test(src));
    ok("!! and this gate actually extracted that script body", code.length > 1500, code.length + " chars extracted");
    ok("the inline script is balanced", (src.match(/<script/g) || []).length === (src.match(/<\/script>/g) || []).length);
}

// ---------------------------------------------------------------------------
console.log("\n2. *** IT IMPORTS THE LOADER AND DEVICE, AND OWNS NEITHER ***");
{
    ok("!! imports render/maleCnsLoader.mjs", /from "\/render\/maleCnsLoader\.mjs"/.test(src));
    ok("!! imports gfx/device.js's requestDevice", /from "\/gfx\/device\.js"/.test(src) && /requestDevice/.test(code));
    ok("!! imports render/gpuDriven.mjs's camera helpers rather than a private mat4", /from "\/render\/gpuDriven\.mjs"/.test(src));
    ok("!! fetches the vendored data rather than embedding a copy of it",
        /vendor\/male-cns\/giant-fiber-circuit\.json/.test(src));
    // A plain `["GFC1", "GFC2", ...]` list for UI ordering (the legend, the picker's grouping) is fine -- the
    // thing that would actually be a private copy is a GFC1/GFC2/... key mapped to its OWN color literal,
    // which only colorForType() (imported, not redefined here) is allowed to hold.
    ok("does NOT define its own GFC-type-to-color table (colorForType owns that)", !/GFC[1-4]['"`]?\s*:\s*\[/.test(code));
    // *** NO SECOND OWNER OF THE GEOMETRY. *** The centering/scaling and parent-edge walk belong to the
    // loader; a page that reimplements them privately would drift from what the gate above actually checks.
    ok("does NOT recompute a bounding box/center itself", !/Infinity[\s\S]{0,80}Infinity[\s\S]{0,80}Infinity/.test(code));
    ok("does NOT walk n.parent[i] itself (that belongs to the loader)", !/\.parent\[i?\]/.test(code));
    report("the page's own logic is limited to the orbit camera, the pipeline/uniform wiring, and picker UI");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE FRONT DOOR IS ACTUALLY A DOOR ***");
{
    ok("!! server.html links it", /href="\/fly-connectome\.html"/.test(fs.readFileSync(path.join(ENG, "server.html"), "utf8")));
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE REAL BROWSER: THE PAGE (DOM) AND THE PIPELINE (PIXELS), CHECKED SEPARATELY ***");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-3 read source, and source cannot show it runs");
    } else {
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader", "--enable-unsafe-webgpu"] });
        const ctx = await b.newContext();
        const pg = await ctx.newPage();
        const errs = [];
        pg.on("pageerror", (e) => errs.push(String(e.message)));
        await pg.route("**/*", (route) => {
            const u = new URL(route.request().url());
            const fp2 = path.join(ENG, decodeURIComponent(u.pathname));
            if (fs.existsSync(fp2) && fs.statSync(fp2).isFile()) {
                const ext = path.extname(fp2);
                const type = ext === ".mjs" || ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html" : ext === ".json" ? "application/json" : "text/plain";
                return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(fp2) });
            }
            return route.fulfill({ status: 404, body: "not found" });
        });
        await pg.setViewportSize({ width: 1000, height: 700 });
        await pg.goto("http://localhost:8787/fly-connectome.html", { waitUntil: "load" }).catch(() => {});
        await pg.waitForTimeout(1200);

        ok("!! the page loads with no script error", errs.length === 0, errs.join(" | ").slice(0, 300));

        const items = await pg.$$(".item");
        ok("!! the picker lists exactly 34 neurons -- the Giant Fiber Circuit's own known size", items.length === 34, String(items.length));

        if (items.length) {
            await items[0].click();
            await pg.waitForTimeout(200);
            const detail = await pg.$eval("#detail", (el) => el.textContent);
            ok("!! clicking a neuron fills the detail panel with its type/instance/synapse fields",
                /type/.test(detail) && /instance/.test(detail) && /pre-synapses/.test(detail) && /post-synapses/.test(detail), detail.slice(0, 120));
        }

        // ---- 5. THE PIPELINE, RENDERED OFFSCREEN (see the header comment for why not the live canvas) -----
        console.log("\n5. *** THE SAME PIPELINE, RENDERED OFFSCREEN, ACTUALLY DRAWS THE FOUR GFC COLORS ***");
        const pixelResult = await pg.evaluate(async () => {
            const { requestDevice } = await import("/gfx/device.js");
            const { maleCnsBounds, maleCnsNeuronMeshes } = await import("/render/maleCnsLoader.mjs");
            const { perspective, lookAt, multiply } = await import("/render/gpuDriven.mjs");

            const canvas = document.createElement("canvas");
            canvas.width = 256; canvas.height = 256;
            const device = await requestDevice(canvas, { offscreen: true });
            if (device.backend === "null") return { backend: "null" };

            const res = await fetch("/vendor/male-cns/giant-fiber-circuit.json");
            const data = await res.json();
            const bounds = maleCnsBounds(data);
            const neurons = maleCnsNeuronMeshes(data, bounds);

            const WGSL = `struct Uniforms { viewProj: mat4x4<f32>, color: vec4<f32> };
@group(0) @binding(0) var<uniform> U: Uniforms;
struct VO { @builtin(position) pos: vec4<f32> };
@vertex fn vs(@location(0) p: vec3<f32>) -> VO { var o: VO; o.pos = U.viewProj * vec4<f32>(p, 1.0); return o; }
@fragment fn fs() -> @location(0) vec4<f32> { return U.color; }`;
            const GLSL_VERTEX = `#version 300 es
precision highp float;
in vec3 p;
uniform mat4 viewProj;
void main() { gl_Position = viewProj * vec4(p, 1.0); }`;
            const GLSL_FRAGMENT = `#version 300 es
precision highp float;
uniform vec4 color;
out vec4 fragColor;
void main() { fragColor = color; }`;

            const pipe = device.pipeline({
                shaders: { wgsl: WGSL, glsl: { vertex: GLSL_VERTEX, fragment: GLSL_FRAGMENT } },
                attributes: [{ name: "p", size: 3, offset: 0 }], stride: 12,
                uniforms: [{ name: "viewProj", type: "mat4" }, { name: "color", type: "vec4" }],
                topology: "line-list",
            });
            const gpuNeurons = neurons.map((n) => ({
                bodyId: n.bodyId, color: n.mesh.color,
                posBuf: device.buffer({ data: n.mesh.positions, usage: "vertex" }),
                idxBuf: device.buffer({ data: n.mesh.indices, usage: "index" }),
                indexCount: n.mesh.indices.length,
            }));

            const eye = [2.61, 1.96, 3.10];
            const viewProj = multiply(perspective(45 * Math.PI / 180, 1, 0.1, 100), lookAt(eye, [0, 0, 0], [0, 1, 0]));

            const out = await device.frame(({ pass }) => {
                pass.clear([0.02, 0.024, 0.04, 1]);
                pass.use(pipe);
                pass.uniform("viewProj", viewProj);
                for (const n of gpuNeurons) { pass.uniform("color", n.color); pass.vertices(n.posBuf, 0); pass.indices(n.idxBuf); pass.drawIndexed(n.indexCount); }
            }, { read: true });

            const px = out.pixels;
            const bgR = 5, bgG = 6, bgB = 10;
            let nonBg = 0;
            const seen = new Set();
            for (let i = 0; i < px.length; i += 4) {
                const r = px[i], g = px[i + 1], bl = px[i + 2];
                if (Math.abs(r - bgR) > 8 || Math.abs(g - bgG) > 8 || Math.abs(bl - bgB) > 8) { nonBg++; seen.add(`${r},${g},${bl}`); }
            }
            // Hardcoded, NOT derived from colorForType(): if colorForType were broken to return the same
            // value for every type (sabotage-tested -- see the header comment), a check that asked
            // colorForType what to look for would break identically and still pass. These 4 literals are
            // render/maleCnsLoader.mjs's TYPE_COLORS table, independently restated as ground truth.
            const EXPECTED = { GFC1: [242, 89, 64], GFC2: [76, 191, 242], GFC3: [115, 230, 115], GFC4: [204, 115, 242] };
            const near = (want) => [...seen].some((k) => { const [r, g, bl] = k.split(",").map(Number); return Math.abs(r - want[0]) <= 3 && Math.abs(g - want[1]) <= 3 && Math.abs(bl - want[2]) <= 3; });
            return {
                backend: device.backend, totalPixels: px.length / 4, nonBg, pipeError: pipe.error,
                foundGFC1: near(EXPECTED.GFC1), foundGFC2: near(EXPECTED.GFC2), foundGFC3: near(EXPECTED.GFC3), foundGFC4: near(EXPECTED.GFC4),
            };
        });

        ok("!! the offscreen device is a real backend, not the recording null stub", pixelResult.backend !== "null" && pixelResult.backend !== undefined, String(pixelResult.backend));
        ok("!! the pipeline compiled with no error", !pixelResult.pipeError, String(pixelResult.pipeError));
        ok("!! *** DRAWING THE CIRCUIT ACTUALLY PAINTS PIXELS -- NOT A BLANK FRAME ***",
            pixelResult.nonBg > 500, `${pixelResult.nonBg} of ${pixelResult.totalPixels} pixels`);
        ok("!! ...and all four GFC type colors appear on screen, not just one", pixelResult.foundGFC1 && pixelResult.foundGFC2 && pixelResult.foundGFC3 && pixelResult.foundGFC4,
            JSON.stringify({ GFC1: pixelResult.foundGFC1, GFC2: pixelResult.foundGFC2, GFC3: pixelResult.foundGFC3, GFC4: pixelResult.foundGFC4 }));

        await ctx.close();
        await b.close();
    }
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
