#!/usr/bin/env node
// WebGLEngine/tools/ship/threeProbe-selfcheck.mjs -- v4494
//
// IS THE three 0.178 PIN THE FLEET'S OR THE BUILD BOX'S? (docs/TSL-ROADMAP.md step 7 item 17, task 17.) v4319 vendored
// 0.178 because 0.185 refused on this shell's Chromium. three-probe.html is the instrument that asks a rig the same
// question; this gate holds the instrument and records what THIS box says. Section 1, headless: render/threeProbe.mjs's
// tar walker on a tarball `tar` itself wrote (a file over one block, a nested path, an empty file), pickBuild on the
// real 0.185.1 tarball refusing by name when a build file is missing, rewriteImports touching exactly the two
// internal imports in both spellings and nothing else, the grader refusing lies. Section 2: three@0.185.1's tarball
// fetched from registry.npmjs.org once into ~/.cache/swek/three-probe (outside the tree, so no census sees it), unpacked
// by the same walker, served to the page by this gate's server as ?src=/probe-cache/..., and the page run here on both routes. MEASURED AT v4494 ON THIS BOX: the vendored 0.178 draws the
// gradient on WebGPU and on three's WebGL2 backend through the blob-import path (the control); 0.185.1 draws on the
// WebGL2 backend and is REFUSED on WebGPU by the browser, not by three: "Failed to execute 'createView' on
// 'GPUTexture': Failed to read the 'swizzle' property from 'GPUTextureViewDescriptor': The provided value is not of
// type 'GPUTextureComponentSwizzle'" -- v4319's finding, reproduced by name, and pinned to THIS Chromium's WebGPU
// (GPUTextureComponentSwizzle is a newer WebGPU dictionary). Whether a rig's Chrome knows it is the rig's answer:
// section 3 says RIG-PENDING until tools/ship/three-probe.json is saved from the page on a rig.
//
// SABOTAGE (v4494): A  untar reading the size field from the wrong offset (the mode field)              -> exit=1, red: the tar-walker row (the big file no longer round-trips)
//                   B  rewriteImports leaving three.tsl.js's import alone                                  -> exit=1, red 3: the rewrite row (0x) and both routes -- the CONTROL fails to import, and the
//                      grader says 'the box, not the version, is the finding', which is the right reading of a broken path
//                   C  gradeProbe accepting ok:true beside an error                                        -> exit=1, red: the eight-lies row
//                   D  the page reporting ok without reading the gradient back                            -> exit=1, red: the refusal row reads 'it drew' -- a probe that does not draw cannot refuse
//
// Run: node tools/ship/threeProbe-selfcheck.mjs      (~40 s; the first run fetches 5.3 MB from the registry)
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { webgpuSkipReason, LAUNCH_ARGS, SECURE_HOST } from "./webgpuHarness.mjs";
import { PROBE_CONTROL, PROBE_VERSIONS, BUILD_FILES, tarballUrl, untar, pickBuild, rewriteImports, gradeProbe } from "../../render/threeProbe.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// OUTSIDE THE TREE: a first draft cached under tools/ship/cache/ (gitignored) and render/colourReach's census counted the cached
// three.webgpu.js as an arrival within the minute -- every tree walker would have. The cache lives in the home directory and the
// gate's own server maps /probe-cache/ onto it, so the page fetches it from the engine origin without it being in the engine.
const CACHE = path.join(os.homedir(), ".cache", "swek", "three-probe");
const CACHE_URL = "/probe-cache/";
const RIG_FILE = path.join(ENG, "tools", "ship", "three-probe.json");
const VERSION = PROBE_VERSIONS[0];
const SWIZZLE = /swizzle/i;
// the texture-view swizzle 0.185 sends to createView: a GPUTextureViewDescriptor class carrying `this.swizzle = 'rgba'` ("requires the
// 'texture-component-swizzle' feature; ignored otherwise", its own docstring says -- and this Chromium rejects the dictionary member
// outright rather than ignoring it). TSL's vector swizzles (.xyz) are in both builds and are not this.
const VIEW_SWIZZLE = /class GPUTextureViewDescriptor[\s\S]{0,6000}?this\.swizzle = 'rgba'/;
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);

/** the tarball, from the cache or the registry once */
async function tarball(version) {
    fs.mkdirSync(CACHE, { recursive: true });
    const f = path.join(CACHE, `three-${version}.tgz`);
    if (fs.existsSync(f) && fs.statSync(f).size > 1e6) return { bytes: new Uint8Array(fs.readFileSync(f)), from: "cache" };
    const res = await fetch(tarballUrl(version));
    if (!res.ok) throw new Error("registry " + res.status);
    const bytes = new Uint8Array(await res.arrayBuffer()); fs.writeFileSync(f, bytes);
    return { bytes, from: "registry" };
}

sec("1. HEADLESS: the tar walker, the build picker, the import rewrite, the grader");
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "threeProbe-")); const pkg = path.join(tmp, "package", "build"); fs.mkdirSync(pkg, { recursive: true });
    const big = "x".repeat(1500) + "END"; fs.writeFileSync(path.join(pkg, "big.js"), big); fs.writeFileSync(path.join(pkg, "empty.js"), ""); fs.writeFileSync(path.join(tmp, "package", "package.json"), "{}");
    execFileSync("tar", ["-czf", path.join(tmp, "t.tgz"), "-C", tmp, "package"]);
    const entries = untar(new Uint8Array(zlib.gunzipSync(fs.readFileSync(path.join(tmp, "t.tgz")))));
    const bigE = entries.find((e) => e.name === "package/build/big.js"), emptyE = entries.find((e) => e.name === "package/build/empty.js");
    ok("untar walks a tarball `tar` wrote: a file over one 512-byte block comes back byte for byte, an empty file is present and empty, the nested path is whole",
        entries.length === 3 && bigE && new TextDecoder().decode(bigE.bytes) === big && emptyE && emptyE.bytes.length === 0 && entries.some((e) => e.name === "package/package.json"), entries.map((e) => `${e.name}:${e.bytes.length}`).join(" "));
    fs.rmSync(tmp, { recursive: true, force: true });
    let threw = null; try { pickBuild(entries); } catch (e) { threw = e.message; }
    ok("pickBuild refuses a tarball without the three build files, naming the first missing one", /package\/build\/three\.webgpu\.js/.test(threw || ""), threw);

    const vend = {}; for (const f of BUILD_FILES) vend[f] = fs.readFileSync(path.join(ENG, "vendor", "three-webgpu", f), "utf8");
    const urls = { "three.core.js": "blob:core", "three.webgpu.js": "blob:webgpu", "three.tsl.js": "blob:tsl" };
    const rw = rewriteImports(vend, urls);
    const bare = (t) => (t.match(/from\s+['"](?:\.\/three\.(?:core|webgpu)\.js|three\/webgpu)['"]/g) || []).length;
    ok(`rewriteImports on the vendored 0.178 touches three.webgpu.js's core import (${rw.counts["three.webgpu.js"]}x) and three.tsl.js's './three.webgpu.js' (${rw.counts["three.tsl.js"]}x), leaves no bare internal import, and changes nothing else`,
        rw.counts["three.webgpu.js"] >= 1 && rw.counts["three.tsl.js"] === 1 && rw.counts["three.core.js"] === 0 && bare(rw.files["three.webgpu.js"]) === 0 && bare(rw.files["three.tsl.js"]) === 0 && rw.files["three.core.js"] === vend["three.core.js"]
        && rw.files["three.tsl.js"].includes('from "blob:webgpu"') && rw.files["three.webgpu.js"].includes('from "blob:core"')
        && rw.files["three.webgpu.js"].length === vend["three.webgpu.js"].length + rw.counts["three.webgpu.js"] * ('"blob:core"'.length - "'./three.core.js'".length));
    const good = { page: "three-probe.html", route: "webgpu", results: [{ label: PROBE_CONTROL.label, ok: true, error: null, revision: "178", backend: "webgpu", ms: 300 }, { label: "three@0.185.1", version: "0.185.1", ok: false, error: "swizzle", revision: "185", backend: null, ms: 400 }] };
    ok("CONTROL: a well-formed record grades ok", gradeProbe(good).ok, gradeProbe(good).problems.join("; "));
    const lies = [
        ["ok beside an error", { ...good, results: [{ ...good.results[0], error: "boom" }, good.results[1]] }],
        ["failed with no error text", { ...good, results: [good.results[0], { ...good.results[1], error: null }] }],
        ["ok with no revision", { ...good, results: [{ ...good.results[0], revision: null }, good.results[1]] }],
        ["no vendored control", { ...good, results: [good.results[1], { ...good.results[1], label: "three@0.180.0" }] }],
        ["the control itself failed", { ...good, results: [{ ...good.results[0], ok: false, error: "no adapter" }, good.results[1]] }],
        ["a NaN time", { ...good, results: [{ ...good.results[0], ms: NaN }, good.results[1]] }],
        ["another page's record", { ...good, page: "slug-rig.html" }],
        ["only the control", { ...good, results: [good.results[0]] }],
    ];
    ok("*** the grader refuses eight lies by name: " + lies.map(([n]) => n).join(", ") + " ***", lies.every(([, l]) => !gradeProbe(l).ok), lies.map(([n, l]) => `${n}: ${gradeProbe(l).problems[0]}`).join(" | ").slice(0, 240));
    ok("the front door links three-probe.html, so a rig can reach it", /href="\/three-probe\.html"/.test(fs.readFileSync(path.join(ENG, "server.html"), "utf8")));
}

sec(`2. THIS BOX: three@${VERSION} from the registry (cached), the page on both routes beside the vendored control`);
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        let tb = null, why = null; try { tb = await tarball(VERSION); } catch (e) { why = e.message; }
        ok(`three@${VERSION}'s tarball is at hand (${tb ? tb.from : "no"}) -- registry.npmjs.org reachable from here or a cached copy`, !!tb, why || `${(tb.bytes.length / 1e6).toFixed(1)} MB`);
        if (tb) {
            const files = pickBuild(untar(new Uint8Array(zlib.gunzipSync(tb.bytes))));
            const dir = path.join(CACHE, `three-${VERSION}`); fs.mkdirSync(dir, { recursive: true });
            for (const f of BUILD_FILES) fs.writeFileSync(path.join(dir, f), files[f]);
            const rev = (files["three.core.js"].match(/const REVISION = '(\d+)'/) || [])[1];
            ok(`the tarball's build says REVISION ${rev}, and its three.webgpu.js carries a GPUTextureViewDescriptor with a swizzle field (the thing v4319 tripped on)`, rev === VERSION.split(".")[1] && VIEW_SWIZZLE.test(files["three.webgpu.js"]), `${(files["three.webgpu.js"].match(/swizzle/g) || []).length} mentions of swizzle, most of them TSL's .xyz`);
            ok("and the vendored 0.178 has no texture-view swizzle (its swizzles are all TSL's)", !VIEW_SWIZZLE.test(fs.readFileSync(path.join(ENG, "vendor/three-webgpu/three.webgpu.js"), "utf8")) && !/this\.swizzle = /.test(fs.readFileSync(path.join(ENG, "vendor/three-webgpu/three.webgpu.js"), "utf8")));

            const pw = resolvePlaywright(createRequire(import.meta.url));
            const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json" };
            const srv = http.createServer((q, s2) => { const u = decodeURIComponent(String(q.url).split("?")[0]);
                const f = u.startsWith(CACHE_URL) ? path.join(CACHE, u.slice(CACHE_URL.length)) : path.join(ENG, u === "/" ? "three-probe.html" : u);
                if (!(f.startsWith(ENG) || f.startsWith(CACHE)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s2.writeHead(404); return s2.end("no"); }
                s2.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); s2.end(fs.readFileSync(f)); });
            await new Promise((r) => srv.listen(0, SECURE_HOST, r));
            const out = {};
            for (const route of ["webgpu", "webgl2"]) {
                const br = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: [...LAUNCH_ARGS] });
                const pg = await br.newPage(); const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
                await pg.goto(`http://${SECURE_HOST}:${srv.address().port}/?src=${CACHE_URL}three-${VERSION}/${route === "webgl2" ? "&webgl=1" : ""}`, { waitUntil: "load" });
                await pg.waitForFunction(() => window.__threeProbe, null, { timeout: 120000 }).catch(() => {});
                out[route] = { json: await pg.evaluate(() => window.__threeProbe || null), errs };
                await br.close();
            }
            srv.close();
            for (const route of ["webgpu", "webgl2"]) {
                const j = out[route].json, g = j && gradeProbe(j);
                ok(`${route} route: the page produced a record the grader accepts`, !!g && g.ok && j.route === route, g ? g.problems.join("; ") : "no record; " + out[route].errs.join(" | "));
                if (!g || !g.ok) continue;
                const c = g.control, n = g.newest[0];
                ok(`  ${route}: the vendored 0.178 control drew the gradient through the blob-import path on ${c.backend} (revision ${c.revision})`, c.ok && c.revision === "178" && c.backend === route, c.error || `${c.ms} ms`);
                if (route === "webgl2") ok(`  webgl2: three@${VERSION} draws on three's WebGL2 backend here (revision ${n.revision}) -- the refusal is not the build, it is a WebGPU API`, n.ok && n.revision === "185" && n.backend === "webgl2", n.error || `${n.ms} ms`);
                else {
                    ok(`*** webgpu: THIS BOX REFUSES three@${VERSION} ON WebGPU BY NAME -- ${n.ok ? "it drew" : n.error.slice(0, 140)} ***`, !n.ok && SWIZZLE.test(n.error || "") && /GPUTextureComponentSwizzle|createView/.test(n.error || ""),
                        "v4319's finding reproduced: the browser's GPUTextureViewDescriptor has no swizzle; the pin is at least the build box's");
                    report(`the rig's half is section 3; if a rig's Chrome knows GPUTextureComponentSwizzle the same page will say so there`);
                }
                ok(`  ${route}: no page errors`, out[route].errs.length === 0, out[route].errs.join(" | ").slice(0, 200));
            }
        }
    }
}

sec("3. THE RIG'S ANSWER: tools/ship/three-probe.json, if a rig has saved one");
{
    if (!fs.existsSync(RIG_FILE)) {
        report("RIG-PENDING: no tools/ship/three-probe.json. Open three-probe.html on a rig (it fetches the version from the registry), save the JSON as that file, and this section grades it.");
        ok("without the rig's file the gate refuses the fleet claim by saying so (not by passing quietly)", true, "RIG-PENDING");
    } else {
        const j = JSON.parse(fs.readFileSync(RIG_FILE, "utf8")); const g = gradeProbe(j);
        ok("*** the rig's record: a control that drew, every result honest ***", g.ok, g.problems.join("; ") || `${j.ua && j.ua.slice(0, 70)} at ${j.when}, route ${g.route}`);
        for (const n of g.newest) report(`${n.label}: ${n.ok ? "DREW on " + n.backend + " (revision " + n.revision + ")" : "REFUSED: " + (n.error || "").slice(0, 160)}`);
        const drewOnWebgpu = g.newest.some((n) => n.ok && n.backend === "webgpu");
        report(drewOnWebgpu ? "THE PIN WAS THE BUILD BOX'S: a rig draws the newer build on WebGPU. Re-vendoring is a round of its own, with the pages re-graded." : "THE PIN IS THE FLEET'S TOO on this rig: the newer build is refused there as well.");
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the rig (this box's Chromium is the one that refused at v4319; its answer is the build box's); versions other than " + VERSION + " (the page takes ?versions=); the registry's future tarball layout.");
process.exit(fails ? 1 : 0);
