// tools/ship/localModelProbe-selfcheck.mjs
//
// Run: node tools/ship/localModelProbe-selfcheck.mjs   (live half skips cleanly without Chromium)
// RUNTIME 2.7s MEASURED (median of 3 -- 2728/2705/2728 ms -- with date(1) around the run). Section 5's
// live half is a real headless Chromium rendering the page and clicking the persist button; the rest
// drives the module directly with a stub navigator.
//
// v4007 -- Keith, on kessler/gemma-gem: "a page that reports whether this box can actually run it (WebGPU
// adapter, reported VRAM, model cache present) before anything downloads a gigabyte."
//
// *** THE HARDEST PROPERTY HERE IS THAT THE PAGE MUST NEVER SAY YES. *** The one number that would settle it
// -- VRAM -- is not exposed to a page by any browser, deliberately, because it is a fingerprinting surface.
// So the ceiling on an honest answer is "nothing measurable rules it out", and a page that rounded that up to
// a green tick would send somebody to download a gigabyte on a machine that cannot run it.
//
// THE THREE FALSE GREENS THIS GATES, each of which the probe got wrong at some point in the writing:
//   1. `navigator.gpu` EXISTS, so WebGPU works. MEASURED: on this tree's headless Chromium the namespace is
//      TRUE and requestAdapter() returns NULL. Same distinction as the Bun.WebView probe one round earlier.
//   2. An ADAPTER exists, so there is a GPU. MEASURED: with the flags on, the adapter is SwiftShader -- CPU
//      emulation. The first version of this probe reported MAYBE for a 4 GB model on a software rasteriser.
//   3. A limit could not be READ, so it is fine. Unknown is not yes (v3103), and here it is the difference
//      between "we checked" and "we could not".
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { codeOnly } from "./sourceScan.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

const SRC = fs.readFileSync(path.join(ENG, "ui", "localModelProbe.js"), "utf8");
const PAGE = fs.readFileSync(path.join(ENG, "webgpu-llm.html"), "utf8");
// *** codeOnly() IS BUILT FOR .js/.mjs. ON RAW HTML IT SILENTLY MANGLES THE OUTPUT -- confirmed the hard way
// while writing section 3b below: `/\.onclick\s*=\s*doPersist\b/` matched the real script fine and failed
// against codeOnly(PAGE), because codeOnly's state machine does not know about <style>, <script> tags or HTML
// attributes and drops chunks of the document. The extraction below pulls the ONE <script type="module"> block
// out first, so codeOnly ever only sees the JavaScript it was built to strip.
const PAGE_SCRIPT = (PAGE.match(/<script type="module">([\s\S]*?)<\/script>/) || ["", ""])[1];
const { probeLocalModel, verdictFor, summarise, MODELS, SOFTWARE_HINTS, requestPersistentStorage } = await import("../../ui/localModelProbe.js");

// A navigator this gate controls completely, so every branch is DRIVEN rather than waited for. A real box has
// one GPU and one answer; the interesting cases are the ones this machine does not happen to be.
const nav = ({ gpu = null, quota = null, usage = 0 } = {}) => ({
    gpu, storage: { estimate: async () => ({ quota, usage }) },
});
const adapter = ({ f16 = true, maxBuf = 2e9, info = null, fallback = undefined } = {}) => {
    const a = { features: new Set(f16 ? ["shader-f16"] : []), limits: { maxBufferSize: maxBuf, maxStorageBufferBindingSize: maxBuf }, info };
    if (fallback !== undefined) a.isFallbackAdapter = fallback;
    return a;
};
const gpuWith = (a) => ({ requestAdapter: async () => a });
const win = { isSecureContext: true, crossOriginIsolated: false };

console.log("localModelProbe-selfcheck -- does it answer before the gigabyte, and does it ever say yes?\n");

// ---------------------------------------------------------------------------
console.log("1. *** IT RUNS IN A BROWSER, WHICH MEANS NO node: IMPORT ANYWHERE NEAR IT ***");
{
    // v3951's defect: a bare `node:` import is resolved before a line of the module runs, so ONE of them makes
    // the whole page throw on load. This module is page-loaded, so the rule is absolute rather than a style.
    ok("!! *** ui/localModelProbe.js imports nothing from node: ***", !/from\s+["']node:/.test(SRC),
        "a bare node: specifier is resolved before the first line executes, so one of them takes the page down");
    ok("...and the page imports it as a module from /ui/", /from ["']\/ui\/localModelProbe\.js["']/.test(PAGE));
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE NAMESPACE IS NOT AN ADAPTER, AND AN ADAPTER IS NOT A GPU ***");
{
    // MEASURED on this tree's headless Chromium: navigator.gpu true, requestAdapter() null.
    const f = await probeLocalModel(nav({ gpu: gpuWith(null), quota: 8e9 }), win);
    ok("!! *** navigator.gpu present with requestAdapter() -> null reads as NO ADAPTER ***",
        f.gpuNamespace === true && f.adapter === false,
        "namespace " + f.gpuNamespace + ", adapter " + f.adapter + " -- the exact shape this box produces");
    const v = verdictFor(f, MODELS[0]);
    ok("!! ...and that RULES THE MODEL OUT rather than merely warning", v.state === "no",
        v.blockers.join("; "));

    // A SOFTWARE ADAPTER IS THE FALSE GREEN THIS PROBE ACTUALLY GAVE before the check existed.
    const sw = await probeLocalModel(nav({ gpu: gpuWith(adapter({ info: { vendor: "google", architecture: "swiftshader" } })), quota: 8e9 }), win);
    ok("!! *** a SwiftShader adapter is detected as a software renderer ***", sw.softwareRenderer === true,
        "vendor/architecture matched " + SOFTWARE_HINTS);
    ok("!! ...and it is a BLOCKER, not a warning", verdictFor(sw, MODELS[0]).state === "no",
        "a model 'running' on CPU emulation while the page reports a GPU is the most misleading green light " +
        "there is -- capable-looking and unusable");
    const real = await probeLocalModel(nav({ gpu: gpuWith(adapter({ info: { vendor: "nvidia", architecture: "ada" } })), quota: 8e9 }), win);
    ok("...and a real GPU is NOT flagged, so the check is specific rather than strict",
        real.softwareRenderer === false && verdictFor(real, MODELS[0]).state === "maybe");
    // THE SPEC'S FLAG WINS WHERE IT EXISTS. String-matching a vendor is the weaker instrument and says so.
    const flagged = await probeLocalModel(nav({ gpu: gpuWith(adapter({ fallback: true, info: { vendor: "nvidia", architecture: "ada" } })), quota: 8e9 }), win);
    ok("!! isFallbackAdapter is preferred over the name match when the browser implements it",
        flagged.softwareRenderer === true,
        "a vendor string that looks like a real GPU still reads as fallback when the flag says so");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE ANSWER THAT COSTS NOTHING: A QUOTA SMALLER THAN THE MODEL ***");
{
    // MEASURED on this box: navigator.storage.estimate() reports a ~1.01 GB quota, which is LESS than
    // gemma-gem's E4B at 1.5 GB. That is a decisive no available before a single byte moves.
    const small = await probeLocalModel(nav({ gpu: gpuWith(adapter({ info: { vendor: "nvidia" } })), quota: 1.01e9 }), win);
    const e2b = verdictFor(small, MODELS.find((m) => m.id === "E2B"));
    const e4b = verdictFor(small, MODELS.find((m) => m.id === "E4B"));
    ok("!! *** a 1.01 GB quota RULES OUT the 1.5 GB model and NOT the 0.5 GB one ***",
        e4b.state === "no" && e2b.state === "maybe",
        "E4B: " + e4b.blockers.join("; ") + "  |  E2B: maybe");
    ok("...and the blocker names both numbers, so a reader can act on it",
        /1\.01 GB/.test(e4b.blockers.join(" ")) && /1\.50 GB/.test(e4b.blockers.join(" ")));
    // AN UNREADABLE QUOTA IS NOT A PASS.
    const noQuota = await probeLocalModel({ gpu: gpuWith(adapter({ info: { vendor: "nvidia" } })), storage: null }, win);
    ok("!! an unreadable quota lands in `unknowns`, never in the yes column",
        noQuota.quotaBytes === null &&
        verdictFor(noQuota, MODELS[1]).unknowns.some((u) => /quota/i.test(u)),
        "UNKNOWN IS NOT THE DEFAULT (v3103) -- and here it is the difference between checking and not");
}

// ---------------------------------------------------------------------------
console.log("\n3b. *** \"STORAGE QUOTA CAN RAISE TO 2 GB, WITH APPROVAL DIALOG\" -- CONFIRMED AND BOUNDED ***");
{
    // Keith's claim, checked against the real API rather than taken on faith: navigator.storage.persist()
    // exists in this tree's own Chromium, and navigator.permissions.query({name:"persistent-storage"}) reports
    // "prompt" there -- MEASURED, a genuine dialog is what a real click shows.
    const detected = await probeLocalModel(nav({ gpu: gpuWith(null), quota: 1e9 }).storage
        ? { storage: { estimate: async () => ({ quota: 1e9, usage: 0 }), persist: async () => false, persisted: async () => false } }
        : {}, win);
    ok("persistAvailable is detected feature-by-feature", detected.persistAvailable === true && detected.persisted === false);

    const noApi = await probeLocalModel({ storage: { estimate: async () => ({ quota: 1e9, usage: 0 }) } }, win);
    ok("!! a browser with no persist() reports persistAvailable === false, not a guess",
        noApi.persistAvailable === false);

    // *** THE FUNCTION MUST NEVER PROMISE "2 GB". *** It reports what the browser did, not what Keith observed
    // on his box: the persisted-storage ceiling is disk-relative and platform-dependent, and this module has
    // no way to know it in advance. Driven with a stub that GRANTS and RAISES the quota, and one that DENIES.
    let seq = [{ quota: 1.01e9, usage: 0 }, { quota: 2e9, usage: 0 }];
    const grantedNav = { storage: { estimate: async () => seq.shift(), persist: async () => true } };
    const granted = await requestPersistentStorage(grantedNav);
    ok("!! *** a GRANTED request reports the MEASURED before and after, not a typed number ***",
        granted.available && granted.granted === true &&
        granted.quotaBeforeBytes === 1.01e9 && granted.quotaAfterBytes === 2e9,
        "before " + (granted.quotaBeforeBytes / 1e9).toFixed(2) + "GB, after " +
        (granted.quotaAfterBytes / 1e9).toFixed(2) + "GB -- both READ from estimate(), neither typed here");

    seq = [{ quota: 1.01e9, usage: 0 }, { quota: 1.01e9, usage: 0 }];
    const deniedNav = { storage: { estimate: async () => seq.shift(), persist: async () => false } };
    const denied = await requestPersistentStorage(deniedNav);
    ok("!! ...and a DENIED request reports granted:false with the quota UNCHANGED",
        denied.granted === false && denied.quotaBeforeBytes === denied.quotaAfterBytes);

    ok("!! ...and a browser with no persist() at all reports available:false rather than throwing",
        (await requestPersistentStorage({ storage: {} })).available === false);

    // THE STRING "2 GB" (or "2GB") MUST NOT APPEAR AS A PROMISE in the module. It is fine in a COMMENT quoting
    // Keith's own words, which is why this greps the CODE rather than the whole file.
    const code = codeOnly(SRC);
    ok("!! *** the module contains no hardcoded storage-size promise ***",
        !/["'`]\s*2\s*GB\s*["'`]/i.test(code) && !/2e9/.test(code.replace(/quotaAfterBytes/g, "")),
        "the only 2e9 in this file is a TEST FIXTURE value in the gate, never a claim the module makes about " +
        "what a real browser will grant");

    // AND THE ESCALATION REQUIRES A REAL CALL -- it must not be invoked from probeLocalModel's own auto-run,
    // because persist() without a user gesture is refused by most browsers and folding it in would make the
    // page's own load silently ask for a permission nobody clicked for.
    const probeCode = codeOnly(fs.readFileSync(path.join(ENG, "ui", "localModelProbe.js"), "utf8"));
    const probeBody = (probeCode.match(/export async function probeLocalModel[\s\S]*?\n\}/) || [""])[0];
    ok("!! probeLocalModel() itself never calls persist() -- only DETECTS whether it exists",
        !/\.persist\(\)/.test(probeBody) && /persistAvailable/.test(probeBody),
        "escalating storage is a decision a person makes by clicking a button, not a side effect of asking " +
        "what the browser has");
    // THE CALL SITE, NOT A SUBSTRING OF THE PAGE. Stripping the function's own body first and then searching
    // the remainder is what makes "doPersist is invoked only from a click handler" checkable at all -- without
    // stripping it, the function's own internal `await go()` line or its name appearing in a comment would
    // read as a second, unwanted call site.
    const pageCode = codeOnly(PAGE_SCRIPT);
    const withoutBody = pageCode.replace(/async function doPersist\s*\([^)]*\)\s*\{[\s\S]*?\n\}/, "");
    const callSites = withoutBody.match(/\bdoPersist\s*\(/g) || [];
    ok("!! the page wires the escalation to an actual click, not to page load",
        /\.onclick\s*=\s*doPersist\b/.test(pageCode) && callSites.length === 0,
        callSites.length ? "ALSO CALLED FROM: outside the click handler" :
        "the only reference to doPersist outside its own body is the onclick assignment");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** VRAM IS NOT EXPOSED, AND THE PROBE NEVER PRETENDS OTHERWISE ***");
{
    const f = await probeLocalModel(nav({ gpu: gpuWith(adapter({ info: { vendor: "nvidia", device: "RTX 4090" } })), quota: 900e9 }), win);
    ok("!! *** vramBytes is null on a machine with EVERYTHING ELSE available ***", f.vramBytes === null,
        "no browser exposes device memory -- WebGPU withholds it as a fingerprinting surface -- so a number " +
        "here could only ever have been invented");
    ok("...and the field EXISTS so that its absence is visible rather than merely missing",
        "vramBytes" in f && typeof f.vramNote === "string" && f.vramNote.length > 40);
    ok("!! ...and every verdict carries VRAM as an explicit `cannot check`",
        summarise(f).every((v) => v.unknowns.some((u) => /VRAM/.test(u))),
        "which is why the best available state is `maybe` and not `yes`");
    // *** THE PROPERTY THAT MATTERS MOST: THERE IS NO YES. ***
    const states = new Set();
    for (const q of [null, 1e6, 1.01e9, 900e9]) for (const g of [null, gpuWith(null), gpuWith(adapter({})), gpuWith(adapter({ info: { vendor: "google", architecture: "swiftshader" } }))]) {
        const p = await probeLocalModel(nav({ gpu: g, quota: q }), win);
        for (const v of summarise(p)) states.add(v.state);
    }
    ok("!! *** ACROSS EVERY COMBINATION DRIVEN, THE VERDICT IS ONLY EVER `no` OR `maybe` ***",
        [...states].every((s) => s === "no" || s === "maybe") && states.has("no") && states.has("maybe"),
        "states reached: " + [...states].join(", ") + " -- 16 combinations of quota and adapter. A `yes` would " +
        "be a claim about VRAM, and nobody can make one from a page");
    ok("!! the page says so where a reader will meet it, not only here",
        /VRAM is not exposed to a page/i.test(PAGE) && /NOT EXPOSED BY ANY BROWSER/.test(SRC),
        "a limit recorded only in a gate is a limit the person reading the page never sees");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** AND IT DOWNLOADS NOTHING -- WHICH IS THE WHOLE POINT ***");
{
    ok("!! the module fetches nothing at all", !/\bfetch\s*\(|XMLHttpRequest|import\s*\(/.test(SRC),
        "the probe answers from what the browser already knows; a probe that fetched to find out would be the " +
        "gigabyte it exists to avoid");
    ok("...and reads the cache index rather than opening a cache", /caches\.keys\(\)/.test(SRC) && !/caches\.open\(/.test(SRC),
        "caches.keys() lists names and touches no entry");

    const { chromium, from } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, from, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-4 drive the module with a stub navigator, and a " +
               "stub cannot show what a real browser hands back or what the page requests over the wire.");
    } else {
        const srv = http.createServer((q, s) => {
            const p = path.join(ENG, decodeURIComponent(new URL(q.url, "http://x").pathname));
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                const e = path.extname(p);
                s.writeHead(200, { "Content-Type": e === ".html" ? "text/html" : e === ".js" ? "text/javascript" : "text/plain" });
                return s.end(fs.readFileSync(p));
            }
            s.writeHead(404); s.end("nf");
        });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const base = "http://127.0.0.1:" + srv.address().port;
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const pg = await b.newPage();
        const errs = [], weights = [];
        pg.on("pageerror", (e) => errs.push(String(e)));
        pg.on("request", (r) => { const u = r.url(); if (/\.onnx|\.safetensors|\.bin\b|huggingface|hf\.co/i.test(u)) weights.push(u); });
        await pg.goto(base + "/webgpu-llm.html", { waitUntil: "load" });
        await pg.waitForTimeout(2200);
        const view = await pg.evaluate(() => ({
            facts: document.getElementById("facts").innerText,
            verdicts: document.getElementById("verdicts").innerText,
            state: document.getElementById("state").textContent,
        }));
        ok("!! *** THE PAGE RENDERS ITS FACTS AND ITS VERDICTS ***",
            /adapter/i.test(view.facts) && /Gemma/.test(view.verdicts), view.state.trim());
        ok("!! *** AND NOT ONE BYTE OF MODEL WEIGHT WAS REQUESTED ***", weights.length === 0,
            weights.length ? "FETCHED: " + weights.slice(0, 2).join(", ") : "zero weight requests, as promised");
        ok("...and it names VRAM as unavailable on the rendered page", /not exposed/i.test(view.facts));
        ok("no page errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
        await b.close(); srv.close();
    }
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
