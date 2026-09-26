#!/usr/bin/env node
// WebGLEngine/tools/ship/threeProbe-selfcheck.mjs -- v4494
//
// WAS THE three 0.178 PIN THE FLEET'S OR THE BUILD BOX'S? IT WAS THE BUILD BOX'S. (docs/TSL-ROADMAP.md step 7
// item 17, task 17.) v4319 vendored 0.178 because 0.185 refused on this shell's Chromium; tools/ship/
// three-probe.json (a real rig, Chrome 152, 2026-09-08) drew 0.185.1 cleanly on WebGPU, and vendor/three-webgpu
// was re-vendored to 0.185.1 on that finding (its own PROVENANCE.txt). *** THIS GATE'S OWN SECTION 2 THEREFORE
// CHANGED SHAPE, NOT JUST ITS NUMBERS. *** Before the re-vendor, PROBE_CONTROL (vendored) and PROBE_VERSIONS[0]
// (fetched fresh from the registry) were two DIFFERENT builds, so the control was expected to succeed
// everywhere and only the newer, untested version was expected to fail on webgpu -- a control failure meant
// the harness was broken. They are now the SAME build, 0.185.1, so this gate checks: the vendored files and a
// fresh registry fetch of the SAME version agree (revision, swizzle presence, webgl2 success, and on webgpu
// whichever of drawing or refusing the box does, by the SAME named shape) -- proving the vendored copy is a
// faithful, unmodified-beyond-the-one-documented-edit copy of upstream, not that the box behaves any
// particular way. Section 3 (the rig's own record) already shows 0.185.1 drawing cleanly on a real
// Windows/Chrome 152 WebGPU -- that finding is what justified vendoring it in the first place and is
// unaffected by any of this.
//
// *** v4680 -- "REFUSES ON WEBGPU" STOPPED BEING UNIVERSAL, ON A REAL BOX, AND THE GATE ONCE ASSERTED IT WAS. ***
// This section originally hardcoded refusal (the named swizzle TypeError) as the only passing shape on webgpu,
// because that was the only shape ever measured -- this sandbox's Chromium 141-ish still throws it. A real
// Windows box shipping this branch (Chrome 153) drew three@0.185.1 on WebGPU cleanly, PIXEL-VERIFIED by
// three-probe.html's own renderProbe() (it throws unless the read-back gradient is real), through BOTH the
// control and a fresh fetch -- and the gate called that a failure, twice, because "it drew" and "control drew"
// were the two detail strings its old two-`ok()` shape could only ever print on the FAIL branch. The invariant
// that matters was never "refuses"; it is that a fresh fetch and the vendored control OF THE SAME BUILD agree.
// Restated on that: both drawing is a pass (the swizzle bug going away upstream, not a code defect here), both
// refusing by the same named error is still a pass (v4319's finding, alive on a box that still has it), and
// only a SPLIT between the two -- one drawing, the other not, on one build -- is what "the box, not the
// version" actually looks like now.
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
import { PROBE_CONTROL, PROBE_VERSIONS, BUILD_FILES, KNOWN_WEBGPU_SWIZZLE_REFUSAL, tarballUrl, untar, pickBuild, rewriteImports, gradeProbe } from "../../render/threeProbe.mjs";

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
    ok(`rewriteImports on the vendored 0.185.1 touches three.webgpu.js's core import (${rw.counts["three.webgpu.js"]}x) and three.tsl.js's './three.webgpu.js' (${rw.counts["three.tsl.js"]}x), leaves no bare internal import, and changes nothing else`,
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
            // *** POST-RE-VENDOR: THE VENDORED COPY IS EXPECTED TO CARRY THE SAME SWIZZLE FIELD NOW, NOT LACK
            // IT. *** Before the re-vendor this asserted the OLD vendored 0.178 had none -- true then, and
            // false now that vendor/three-webgpu IS 0.185.1. The meaningful check is that the vendored file and
            // a fresh registry fetch of the SAME named version AGREE on carrying it, proving the vendored copy
            // was not quietly patched or left behind a version bump.
            const vendoredWebgpu = fs.readFileSync(path.join(ENG, "vendor/three-webgpu/three.webgpu.js"), "utf8");
            ok(`and the vendored copy agrees with a fresh registry fetch of ${VERSION} on carrying a texture-view swizzle field`,
                VIEW_SWIZZLE.test(vendoredWebgpu) === VIEW_SWIZZLE.test(files["three.webgpu.js"]) && VIEW_SWIZZLE.test(vendoredWebgpu),
                `vendored: ${VIEW_SWIZZLE.test(vendoredWebgpu)}, registry ${VERSION}: ${VIEW_SWIZZLE.test(files["three.webgpu.js"])}`);

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
                // *** POST-RE-VENDOR: THE CONTROL AND THE NEWEST PROBE ARE THE SAME BUILD, SO THEY MUST AGREE. ***
                // On webgl2 both are expected to draw. On webgpu both are expected to be refused by THIS box's
                // Chromium, with the identical named error -- that agreement (not a lone success) is now the
                // proof that the vendored copy is faithfully 0.185.1 and not something else.
                if (route === "webgl2") {
                    ok(`  webgl2: the vendored control draws the gradient through the blob-import path (revision ${c.revision})`,
                        c.ok && c.revision === rev && c.backend === "webgl2", c.error || `${c.ms} ms`);
                    ok(`  webgl2: three@${VERSION} draws on three's WebGL2 backend here too (revision ${n.revision}) -- the refusal is not the build, it is a WebGPU API`,
                        n.ok && n.revision === rev && n.backend === "webgl2", n.error || `${n.ms} ms`);
                } else {
                    // *** v4680 -- A REAL WINDOWS BOX (Chrome 153) DREW three@0.185.1 ON WebGPU, PIXEL-VERIFIED,
                    // AND THE HARDCODED "REFUSAL IS THE ONLY PASS" SHAPE BELOW CALLED THAT A FAILURE. ***
                    // Measured on the box that ships this branch: both the fresh registry fetch AND the vendored
                    // control drew the gradient (renderProbe()'s own corner-pixel check, not merely "did not
                    // throw") -- "it drew" / "control drew (unexpected post-re-vendor)", the two detail strings
                    // this section's OLD two-`ok()` shape could only ever print as failures. v4319's finding was
                    // that ONE box's Chromium was stricter than the spec required about an ignored dictionary
                    // member; a LATER Chromium stopping being stricter than the spec is the bug going away, not
                    // a reason to keep failing a gate whose real job (this section's own comment, one line up)
                    // is proving the control and a fresh fetch of the SAME build agree -- not that they agree by
                    // refusing specifically. Restated on that actual invariant: agreement is the pass, and
                    // DISAGREEMENT between two copies of one build -- the shape v4319 never had to consider -- is
                    // the only thing that still means "the box, not the version".
                    const bothDrew = n.ok && c.ok, bothRefused = !n.ok && !c.ok;
                    const refusalNamed = bothRefused && SWIZZLE.test(n.error || "") && KNOWN_WEBGPU_SWIZZLE_REFUSAL.test(n.error || "") && KNOWN_WEBGPU_SWIZZLE_REFUSAL.test(c.error || "");
                    ok(`*** webgpu: CONTROL AND A FRESH FETCH OF THE SAME BUILD AGREE -- ${bothDrew ? "both drew, pixel-verified" : bothRefused ? "both refused, by the same named error" : "THEY DISAGREE"} ***`,
                        bothDrew || refusalNamed,
                        bothDrew
                            ? `newest ${n.ms} ms, control ${c.ms} ms -- this box's Chromium no longer throws on GPUTextureViewDescriptor.swizzle; v4319's finding is retired on THIS box, not universally`
                            : bothRefused
                            ? "v4319's finding reproduced on both: the browser's GPUTextureViewDescriptor has no swizzle; the pin is at least the build box's"
                            : `newest ${n.ok ? "drew" : "refused (" + (n.error || "").slice(0, 80) + ")"}, control ${c.ok ? "drew" : "refused (" + (c.error || "").slice(0, 80) + ")"} -- the SAME build behaving two different ways is the box, not the version`);
                    report(bothDrew
                        ? "the rig's half is section 3; a rig that also draws confirms the box moved, not the vendored copy"
                        : "the rig's half is section 3; if a rig's Chrome knows GPUTextureComponentSwizzle the same page will say so there");
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
        const raw = JSON.parse(fs.readFileSync(RIG_FILE, "utf8"));
        // *** THIS FILE PREDATES THE RE-VENDOR IT JUSTIFIED, AND ITS LABEL SAYS SO -- READ AS-IS, NOT REWRITTEN.
        // *** Keith's rig captured this on 2026-09-08, the same day it was used to decide the re-vendor; at that
        // moment PROBE_CONTROL.label was "vendored 0.178" (the file's own literal string), because the local
        // vendor/three-webgpu really was 0.178 when the page ran. The re-vendor happened AFTER, as a consequence
        // of what this file proved -- so this is a real, unedited measurement wearing an old name, not a stale
        // one. Every MEASURED FIELD (revision, ok, ms, error) stays exactly as captured; only the label is
        // mapped to today's PROBE_CONTROL.label, on a COPY, purely so gradeProbe() can find "the control" by
        // its current name. A future capture (a fresh Open three-probe.html on a rig, post-re-vendor) will
        // write the current label itself and need no mapping -- this is a one-time reading of one dated file,
        // not a general exemption in the grader.
        const LEGACY_CONTROL_LABEL = "vendored 0.178";
        const j = raw.results && raw.results.some((r) => r.label === LEGACY_CONTROL_LABEL) && !raw.results.some((r) => r.label === PROBE_CONTROL.label)
            ? { ...raw, results: raw.results.map((r) => r.label === LEGACY_CONTROL_LABEL ? { ...r, label: PROBE_CONTROL.label } : r) }
            : raw;
        const g = gradeProbe(j);
        ok("*** the rig's record: a control that drew, every result honest ***", g.ok, g.problems.join("; ") || `${j.ua && j.ua.slice(0, 70)} at ${j.when}, route ${g.route}`);
        if (j !== raw) report(`this capture predates the PROBE_CONTROL rename -- graded with its own "${LEGACY_CONTROL_LABEL}" read as today's control label, every measured field untouched`);
        for (const n of g.newest) report(`${n.label}: ${n.ok ? "DREW on " + n.backend + " (revision " + n.revision + ")" : "REFUSED: " + (n.error || "").slice(0, 160)}`);
        const drewOnWebgpu = g.newest.some((n) => n.ok && n.backend === "webgpu");
        report(drewOnWebgpu ? "THE PIN WAS THE BUILD BOX'S: a rig drew the newer build on WebGPU, and vendor/three-webgpu has since been re-vendored to it (see its own PROVENANCE.txt). A fresh capture post-re-vendor would retire this legacy-label reading entirely, but is not required for this gate to pass." : "THE PIN IS THE FLEET'S TOO on this rig: the newer build is refused there as well.");
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the rig (this box's Chromium is the one that refused at v4319; its answer is the build box's); versions other than " + VERSION + " (the page takes ?versions=); the registry's future tarball layout.");
process.exit(fails ? 1 : 0);
