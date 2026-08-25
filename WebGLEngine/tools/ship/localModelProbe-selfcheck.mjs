// tools/ship/localModelProbe-selfcheck.mjs
//
// Run: node tools/ship/localModelProbe-selfcheck.mjs   (live half skips cleanly without Chromium)
// RUNTIME: measured at the foot of this round with date(1) -- never estimated.
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

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

const SRC = fs.readFileSync(path.join(ENG, "ui", "localModelProbe.js"), "utf8");
const PAGE = fs.readFileSync(path.join(ENG, "webgpu-llm.html"), "utf8");
const { probeLocalModel, verdictFor, summarise, MODELS, SOFTWARE_HINTS } = await import("../../ui/localModelProbe.js");

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
