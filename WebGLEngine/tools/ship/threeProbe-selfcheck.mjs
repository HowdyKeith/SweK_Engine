#!/usr/bin/env node
// WebGLEngine/tools/ship/threeProbe-selfcheck.mjs -- v4494
//
// WHERE IS THE LINE, AND IS IT THE FLEET'S OR THE BUILD BOX'S? (docs/TSL-ROADMAP.md step 7 item 17, task 17.) v4319
// vendored 0.178 because 0.185 refused on this shell's Chromium; v4537 measured that 0.184 draws here and bumped the
// pin to it. This gate holds three-probe.html, the instrument that asks a rig the same question, and records what
// THIS box says. Section 1, headless: render/threeProbe.mjs's tar walker on a tarball `tar` itself wrote (a file over
// one block, a nested path, an empty file), pickBuild refusing by name when a build file is missing, rewriteImports
// touching exactly the two internal imports in both spellings and nothing else, the grader refusing lies.
//
// SECTION 2 PROBES BOTH SIDES OF PROBE_BOUNDARY, NOT ONE VERSION. Both tarballs are fetched from registry.npmjs.org
// once into ~/.cache/swek/three-probe (outside the tree, so no census sees them), unpacked by the same walker, served
// as ?src=/probe-cache/... and run on both routes beside the vendored control. MEASURED AT v4545 ON THIS BOX:
// 0.184.0 DRAWS on WebGPU and 0.185.1 is REFUSED there by the browser, not by three -- "Failed to execute 'createView'
// on 'GPUTexture': Failed to read the 'swizzle' property from 'GPUTextureViewDescriptor': The provided value is not of
// type 'GPUTextureComponentSwizzle'" -- while BOTH draw on three's WebGL2 backend. The mechanism is read on both
// sides too: the GPUTextureViewDescriptor carrying `this.swizzle = 'rgba'` ARRIVES between them, and the vendored
// build has none. That is what makes this a line and not an anecdote about one version.
//
// *** UNTIL v4545 THIS GATE'S CONTROL AND ITS SUBJECT WERE THE SAME BUILD. *** It probed PROBE_VERSIONS[0] against
// the vendored one; v4537 made PROBE_VERSIONS both sides of the line, so PROBE_VERSIONS[0] became 0.184 -- the build
// the tree already ships. Six rows went red and the rest compared a build to itself.
//
// Section 3 grades tools/ship/three-probe.json if a rig has saved one, AGAINST THE PIN THAT RECORD NAMES rather than
// the one this tree carries now, and reports staleness as its own fact. The record on disk was saved at v4494
// against "vendored 0.178" and says 0.185.1 DREW on a rig's WebGPU: the refusal is this build box's Chromium alone.
// Moving the pin past 0.184 is a round of its own and wants a record taken against the current pin first.
//
// SABOTAGE (v4494): A  untar reading the size field from the wrong offset (the mode field)              -> exit=1, red: the tar-walker row (the big file no longer round-trips)
//                   B  rewriteImports leaving three.tsl.js's import alone                                  -> exit=1, red 3: the rewrite row (0x) and both routes -- the CONTROL fails to import, and the
//                      grader says 'the box, not the version, is the finding', which is the right reading of a broken path
//                   C  gradeProbe accepting ok:true beside an error                                        -> exit=1, red: the eight-lies row
//                   D  the page reporting ok without reading the gradient back                            -> exit=1, red: the refusal row reads 'it drew' -- a probe that does not draw cannot refuse
//
// Run: node tools/ship/threeProbe-selfcheck.mjs      (~40 s; the first run fetches 5.3 MB from the registry)
// SABOTAGE (v4545) -- applied, gate run, red count read, render/threeProbe.mjs, this file and the rig record all
// restored and md5-verified. Baseline 0 red.
//   OO PROBE_BOUNDARY's two sides swapped                -> 3 red: the swizzle row (it arrives at the wrong one), the
//      pin-on-the-good-side row, and the WebGPU boundary row, which now expects 0.185.1 to draw and 0.184.0 to refuse.
//   PP both sides named as the SAME build                -> 2 red. This is the v4545 fault itself put back: the gate
//      probes one build twice and grades it against itself, and the rows say so instead of passing.
//   QQ VIEW_SWIZZLE matching anything                    -> 1 red: the mechanism stops telling the builds apart, so
//      the two-sided swizzle row fails on the vendored build carrying it too.
//   RR gradeProbe ignoring the control label it is given -> 2 red: back to "no vendored control" on a record that has
//      one, which is what this round fixed.
//   SS the rig record's control renamed so no `vendored ` entry exists -> 2 red, and by a different route: nothing to
//      grade against at all, rather than the wrong thing.
//   No 0-RED among the five. Freshness is REPORTED and not asserted -- see the note at that row: only a person
//   re-opening the page on a rig can clear a stale record, so failing on it would leave this gate red for something
//   no code change can fix. What is asserted there is that the label was found, that the grader used it, and that
//   that entry drew.
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
import { PROBE_CONTROL, PROBE_BOUNDARY, PROBE_VERSIONS, BUILD_FILES, tarballUrl, untar, pickBuild, rewriteImports, gradeProbe } from "../../render/threeProbe.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// OUTSIDE THE TREE: a first draft cached under tools/ship/cache/ (gitignored) and render/colourReach's census counted the cached
// three.webgpu.js as an arrival within the minute -- every tree walker would have. The cache lives in the home directory and the
// gate's own server maps /probe-cache/ onto it, so the page fetches it from the engine origin without it being in the engine.
const CACHE = path.join(os.homedir(), ".cache", "swek", "three-probe");
const CACHE_URL = "/probe-cache/";
const RIG_FILE = path.join(ENG, "tools", "ship", "three-probe.json");
// *** v4545 -- THIS GATE'S CONTROL AND ITS SUBJECT HAD BECOME THE SAME BUILD. *** It was written when the tree
// vendored 0.178 and probed the newest, 0.185.1, and every row said so: the control "drew ... revision 178", the
// subject was "three@${VERSION}" with VERSION = PROBE_VERSIONS[0]. v4537 bumped the vendored build to 0.184 and
// made PROBE_VERSIONS both sides of the line, so PROBE_VERSIONS[0] became 0.184 -- the version this tree already
// ships. Six rows went red, and the ones that still passed were comparing a build to itself.
//
// The question was never "does the newest work". It is WHERE THE LINE IS, and render/threeProbe.mjs's
// PROBE_BOUNDARY has named both sides since v4537. So the gate probes both: LAST_GOOD must draw on WebGPU and
// FIRST_REFUSED must be refused there, by name, by the browser. A build that starts refusing at the good side, or
// starts drawing at the bad one, is a changed browser -- and the row says which way it moved instead of the pin
// quietly meaning something else.
const LAST_GOOD = PROBE_BOUNDARY.lastGood, FIRST_REFUSED = PROBE_BOUNDARY.firstRefused;
const PROBED = [LAST_GOOD, FIRST_REFUSED];
const major = (v) => String(v).split(".")[1];   // "0.185.1" -> "185", three's own REVISION spelling
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

sec(`2. THIS BOX: both sides of the line (${LAST_GOOD} and ${FIRST_REFUSED}) from the registry, on both routes, beside the vendored control`);
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const got = {}, revs = {};
        for (const v of PROBED) { let tb = null, why = null; try { tb = await tarball(v); } catch (e) { why = e.message; }
            ok(`three@${v}'s tarball is at hand (${tb ? tb.from : "no"}) -- registry.npmjs.org reachable from here or a cached copy`, !!tb, why || `${(tb.bytes.length / 1e6).toFixed(1)} MB`);
            got[v] = tb; }
        if (PROBED.every((v) => got[v])) {
            const swz = {};
            for (const v of PROBED) {
                const files = pickBuild(untar(new Uint8Array(zlib.gunzipSync(got[v].bytes))));
                const dir = path.join(CACHE, `three-${v}`); fs.mkdirSync(dir, { recursive: true });
                for (const f of BUILD_FILES) fs.writeFileSync(path.join(dir, f), files[f]);
                revs[v] = (files["three.core.js"].match(/const REVISION = '(\d+)'/) || [])[1];
                swz[v] = VIEW_SWIZZLE.test(files["three.webgpu.js"]);
            }
            ok(`each tarball's build says the REVISION its version names (${PROBED.map((v) => `${v} -> r${revs[v]}`).join(", ")})`,
               PROBED.every((v) => revs[v] === major(v)), PROBED.map((v) => `${v}: r${revs[v]} want r${major(v)}`).join("; "));
            // *** THE MECHANISM, STATED ON BOTH SIDES. *** A row saying only "the refused build has a swizzle" cannot
            // tell a build that has it from one that does not; the line is where it ARRIVES, so both sides are read.
            const vendored = fs.readFileSync(path.join(ENG, "vendor/three-webgpu/three.webgpu.js"), "utf8");
            ok(`*** the texture-view swizzle ARRIVES between the two: ${FIRST_REFUSED} carries a GPUTextureViewDescriptor with \`this.swizzle = 'rgba'\` and ${LAST_GOOD} does not -- and neither does the vendored build, whose swizzles are all TSL's ***`,
               swz[FIRST_REFUSED] === true && swz[LAST_GOOD] === false && !VIEW_SWIZZLE.test(vendored),
               `${LAST_GOOD}: ${swz[LAST_GOOD]}, ${FIRST_REFUSED}: ${swz[FIRST_REFUSED]}, vendored: ${VIEW_SWIZZLE.test(vendored)}`);
            const vendoredRev = (fs.readFileSync(path.join(ENG, "vendor/three-webgpu/three.core.js"), "utf8").match(/const REVISION = '(\d+)'/) || [])[1];
            ok(`  and the PIN SITS ON THE GOOD SIDE OF THE LINE: the vendored build is r${vendoredRev}, which is ${LAST_GOOD}'s revision -- read off disk, not typed here`,
               !!vendoredRev && vendoredRev === major(LAST_GOOD), `vendored r${vendoredRev}, lastGood ${LAST_GOOD} (r${major(LAST_GOOD)})`);

            const pw = resolvePlaywright(createRequire(import.meta.url));
            const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json" };
            const srv = http.createServer((q, s2) => { const u = decodeURIComponent(String(q.url).split("?")[0]);
                const f = u.startsWith(CACHE_URL) ? path.join(CACHE, u.slice(CACHE_URL.length)) : path.join(ENG, u === "/" ? "three-probe.html" : u);
                if (!(f.startsWith(ENG) || f.startsWith(CACHE)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s2.writeHead(404); return s2.end("no"); }
                s2.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); s2.end(fs.readFileSync(f)); });
            await new Promise((r) => srv.listen(0, SECURE_HOST, r));
            const srcList = PROBED.map((v) => `${CACHE_URL}three-${v}/`).join(",");
            const out = {};
            for (const route of ["webgpu", "webgl2"]) {
                const br = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: [...LAUNCH_ARGS] });
                const pg = await br.newPage(); const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
                await pg.goto(`http://${SECURE_HOST}:${srv.address().port}/?src=${srcList}${route === "webgl2" ? "&webgl=1" : ""}`, { waitUntil: "load" });
                await pg.waitForFunction(() => window.__threeProbe, null, { timeout: 180000 }).catch(() => {});
                out[route] = { json: await pg.evaluate(() => window.__threeProbe || null), errs };
                await br.close();
            }
            srv.close();
            for (const route of ["webgpu", "webgl2"]) {
                const j = out[route].json, g = j && gradeProbe(j);
                ok(`${route} route: the page produced a record the grader accepts, with the control and BOTH probed builds in it`,
                   !!g && g.ok && j.route === route && g.newest.length === 2, g ? `${g.problems.join("; ")}${g.newest ? ` (${g.newest.length} probed)` : ""}` : "no record; " + out[route].errs.join(" | "));
                if (!g || !g.ok || g.newest.length !== 2) continue;
                const c = g.control;
                // the probed results are matched by the version in their label, because a REFUSED result carries no
                // revision to match on -- that is the whole point of it
                const byVersion = (v) => g.newest.find((r) => String(r.label).includes(v));
                const good = byVersion(LAST_GOOD), bad = byVersion(FIRST_REFUSED);
                ok(`  ${route}: the vendored control drew the gradient through the blob-import path on ${c.backend} (r${c.revision}) -- so a refusal below names a VERSION and not the path`,
                   c.ok && c.revision === vendoredRev && c.backend === route, c.error || `r${c.revision} on ${c.backend}, want r${vendoredRev}`);
                ok(`  ${route}: both probed builds were reached (${LAST_GOOD} and ${FIRST_REFUSED}), so the row below is about the two of them and not about one build twice`, !!good && !!bad,
                   g.newest.map((r) => r.label).join(" | "));
                if (!good || !bad) continue;
                if (route === "webgl2") {
                    ok(`  webgl2: BOTH sides of the line draw on three's WebGL2 backend here (r${good.revision} and r${bad.revision}) -- whatever the refusal is, it is not the build and not three`,
                       good.ok && bad.ok && good.revision === major(LAST_GOOD) && bad.revision === major(FIRST_REFUSED),
                       `${LAST_GOOD}: ${good.ok ? "drew r" + good.revision : good.error} | ${FIRST_REFUSED}: ${bad.ok ? "drew r" + bad.revision : bad.error}`);
                } else {
                    ok(`*** webgpu: THE LINE IS WHERE render/threeProbe.mjs SAYS IT IS -- ${LAST_GOOD} DRAWS (r${good.revision}) and ${FIRST_REFUSED} is REFUSED, by the browser and by name: ${bad.ok ? "IT DREW" : String(bad.error).slice(0, 110)} ***`,
                       good.ok && good.revision === major(LAST_GOOD) && !bad.ok && SWIZZLE.test(bad.error || "") && /GPUTextureComponentSwizzle|createView/.test(bad.error || ""),
                       `${LAST_GOOD}: ${good.ok ? "drew r" + good.revision : "REFUSED " + good.error} | ${FIRST_REFUSED}: ${bad.ok ? "DREW r" + bad.revision : "refused"}`);
                    report(`v4319's finding, now pinned on both sides: the refusal is this Chromium's GPUTextureViewDescriptor having no swizzle member, and ${PROBE_BOUNDARY.why}`);
                    report(`the rig's half is section 3; if a rig's Chrome knows GPUTextureComponentSwizzle the same page will draw ${FIRST_REFUSED} there and the pin can move`);
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
        const j = JSON.parse(fs.readFileSync(RIG_FILE, "utf8"));
        // *** v4545 -- THE RECORD NAMES THE PIN IT WAS TAKEN AGAINST, AND THAT PIN HAS MOVED. *** This section
        // graded against PROBE_CONTROL.label and said "no vendored control": true as written, useless as a reading.
        // The record is not missing a control; it has one, for the build this tree shipped at v4494. So the control
        // is read OUT OF THE RECORD, everything else is graded exactly as before, and the staleness is reported as
        // the separate fact it is. A record that is stale is not a record that is dishonest.
        const named = (j.results || []).map((r) => r.label).find((L) => /^vendored /.test(String(L)));
        const g = gradeProbe(j, named || PROBE_CONTROL.label);
        ok("*** the rig's record: a control that drew, every result honest by the grader's own eight rules ***", g.ok,
           g.problems.join("; ") || `${j.ua && j.ua.slice(0, 70)} at ${j.when}, route ${g.route}, control ${JSON.stringify(g.controlLabel)}`);
        const fresh = named === PROBE_CONTROL.label;
        // FRESHNESS IS REPORTED, NOT ASSERTED, and on purpose: a rig record taken against an older pin is a legitimate
        // state that no code change can clear -- only a person re-opening the page on a rig can -- so failing on it
        // would leave this gate red for something the tree cannot fix. What IS asserted is that the label was found
        // in the record, that it is the entry the grader actually used as the control, and that that entry drew;
        // otherwise "graded against the pin it names" would be a sentence with nothing behind it.
        ok(`  and the record is graded against the pin IT names (${JSON.stringify(named)}), which ${fresh ? "IS" : "is NOT"} the one this tree carries now (${JSON.stringify(PROBE_CONTROL.label)}) -- freshness is REPORTED below, not asserted, because only a rig can refresh it`,
           !!named && !!g.control && g.control.label === named && g.control.ok === true && !g.newest.some((n) => n.label === named),
           `record ${JSON.stringify(named)} | tree ${JSON.stringify(PROBE_CONTROL.label)} | grader used ${JSON.stringify(g.control && g.control.label)}, drew=${g.control && g.control.ok} | ${fresh ? "fresh" : "STALE"}`);
        for (const n of g.newest) report(`${n.label}: ${n.ok ? "DREW on " + n.backend + " (revision " + n.revision + ")" : "REFUSED: " + (n.error || "").slice(0, 160)}`);
        const drewOnWebgpu = g.newest.some((n) => n.ok && n.backend === "webgpu");
        // the finding this record carries, which outlives the pin it was taken against: the question is whether a
        // rig's Chromium knows GPUTextureComponentSwizzle, and that answer does not depend on which build sat beside it
        if (drewOnWebgpu) {
            report(`THE REFUSAL IS THIS BUILD BOX'S ALONE: a rig drew ${g.newest.filter((n) => n.ok && n.backend === "webgpu").map((n) => n.label).join(", ")} on WebGPU, at ${j.when}. Section 2 measures ${FIRST_REFUSED} refused HERE by name; a rig draws it. Moving the pin past ${LAST_GOOD} is a round of its own, with every page re-graded -- and it needs a record taken against the current pin first.`);
        } else report(`THE PIN IS THE FLEET'S TOO on this rig: the newer build was refused there as well.`);
        if (!fresh) report(`STALE: this record was saved at ${j.at} against ${JSON.stringify(named)}; the tree now vendors ${JSON.stringify(PROBE_CONTROL.label)}. It answers "does a rig's WebGPU draw ${FIRST_REFUSED}" and NOT "is the current pin the fleet's".`);
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the rig (this box's Chromium is the one that refused at v4319; its answer is the build box's); versions BETWEEN " +
    LAST_GOOD + " and " + FIRST_REFUSED + " -- the line is known to lie between them and is not known to be exactly there, because nothing " +
    "in this arc has probed 0.185.0 (the page takes ?versions= and PROBE_VERSIONS is the list); versions above " + FIRST_REFUSED + "; and the " +
    "registry's future tarball layout.");
process.exit(fails ? 1 : 0);
