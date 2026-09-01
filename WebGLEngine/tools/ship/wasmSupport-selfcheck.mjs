#!/usr/bin/env node
// tools/ship/wasmSupport-selfcheck.mjs -- v4229
//
// Run: node tools/ship/wasmSupport-selfcheck.mjs      (pure checks always; the live browser sections skip loudly)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES engine/wasmSupport.mjs, and the two loaders that were measured misreporting.
//
// Filed off evanw/polywasm (MIT), and the polyfill is REFUSED -- see section 1. What polywasm is FOR is the
// case where WebAssembly is switched off, and checking this tree against that case found a real defect that
// has nothing to do with polyfills.
import { probeWasm, wasmUsable, wasmUnavailableReason, explainWasmFailure, _resetWasmProbe } from "../../engine/wasmSupport.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { codeOnly, noComments, proseHas } from "./sourceScan.mjs";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SELF = path.basename(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("wasmSupport-selfcheck -- two independent facts, reported on their own evidence\n");

// ---- 1. THE CENSUS, AND THE ITEM'S OWN NUMBER CORRECTED ----------------------------------------------------
console.log("1. *** THE ITEM SAID '82 FILES TOUCH WASM'. THAT WAS THE LOOSEST READING AVAILABLE. ***");
{
    const walk = (dir, out = []) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name === "node_modules" || e.name === ".git" || (dir === ROOT && e.name === "vendor")) continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p, out);
            else if (/\.(js|mjs|html)$/.test(e.name)) out.push(p);
        }
        return out;
    };
    // *** EXCLUDING THIS ROUND'S OWN TWO NEW FILES, AND THAT IS THE FOURTH TIME A CENSUS OF MINE COUNTED
    // ITSELF. *** v4224's basis owner, v4225's meshLine file count, v4227's recording-gate count, now this:
    // it first read 84 and 68 because engine/wasmSupport.mjs and this gate both talk about wasm. The numbers
    // being reported are the ones that motivated the round, so they must be the numbers as they were.
    const ADDED_BY_THIS_ROUND = new Set([
        path.join(ROOT, "engine", "wasmSupport.mjs"),
        path.join(ROOT, "tools", "ship", SELF),
    ]);
    const files = walk(ROOT).filter((f) => !ADDED_BY_THIS_ROUND.has(f));
    let mentions = 0, inCode = 0, callsApi = 0, probes = 0;
    for (const f of files) {
        const raw = fs.readFileSync(f, "utf8");
        if (!/\.wasm|WebAssembly\./.test(raw)) continue;
        mentions++;
        // codeOnly() blanks strings AND comments, which is right for asking "is this a code shape at all".
        const code = codeOnly(raw).replace(/<!--[\s\S]*?-->/g, " ");
        if (/\.wasm|WebAssembly\./.test(raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").replace(/<!--[\s\S]*?-->/g, " "))) inCode++;
        if (/WebAssembly\.(instantiate|compile|Module|Instance|validate)/.test(code)) callsApi++;
        // *** codeOnly() BLANKS STRING LITERALS, AND THE THING BEING LOOKED FOR IS A STRING: THE IMPORT
        // SPECIFIER "../../engine/wasmSupport.mjs". *** This read 1 instead of 2 until it was switched to
        // noComments(), which strips comments and keeps content -- the same mistake v4223 made and named.
        if (/typeof WebAssembly|["']WebAssembly["'] in |wasmSupport/.test(noComments(raw))) probes++;
    }
    ok("!! 82 files mention .wasm or the WebAssembly API -- the item's number, and it is the loose one",
        mentions === 82, `${mentions} mention it`);
    ok("!! ...but 16 of those are comments and prose only; 66 mention it in live code",
        inCode === 66, `${inCode} in code, ${mentions - inCode} comment-only`);
    // *** AND MY OWN GREP GAVE 12, WHICH WAS WRONG, FOR THE FOURTH TIME IN THIS CLASS. *** A raw search for
    // /WebAssembly\./ matched wasm-demo.html, where the text is a SENTENCE -- "executed by the bridge's own
    // Node WebAssembly. No Docker" -- and the full stop matched the escaped dot. Same shape as the licence
    // scan that missed UNLICENSE and the /RANSAC/ that matched "transaction". codeOnly() blanks comments and
    // strings, so it counts calls rather than prose, and the honest number is ELEVEN.
    ok("!! ...and only ELEVEN actually call the WebAssembly API, most of them Node-side gates and tools",
        callsApi === 11, `${callsApi} call WebAssembly.instantiate/compile/Module/Instance -- my first grep said 12 and had matched a full stop`);
    ok("!! *** AND BEFORE THIS ROUND, ZERO OF ANY OF THEM ASKED WHETHER WebAssembly EXISTS ***",
        probes >= 2, `${probes} now consult a probe (box3dLoader and joltLoader); it was 0`);

    // The polyfill is refused, and the refusal is written down where it can be re-read.
    const src = fs.readFileSync(path.join(ROOT, "engine", "wasmSupport.mjs"), "utf8");
    // proseHas() and not a raw test: these are PROSE claims, and the file is wrapped at 110 columns, so
    // "no validation and no traps" is split across two lines. sourceScan already has the right instrument.
    ok("polywasm is REFUSED in writing, with the reason, rather than quietly not done",
        proseHas(src, /polywasm/) && proseHas(src, /REFUSED/) && proseHas(src, /no validation and no traps/),
        "3,725 lines, no validation, no traps, 'extremely slow' -- against a physics engine and a JS engine");
}

// ---- 2. THE SAME DEFECT, THE THIRD TIME ---------------------------------------------------------------------
console.log("\n2. *** THIS TREE ALREADY NAMED THIS DEFECT AND WROTE THE FIX DOWN. IT DID NOT TRAVEL. ***");
{
    const pw = fs.readFileSync(path.join(ROOT, "tools", "ship", "playwrightResolve.mjs"), "utf8");
    ok("!! playwrightResolve.mjs exists BECAUSE one message was printed for two different failures",
        proseHas(pw, /no chromium at <SHELL>/) && proseHas(pw, /pointed at a file sitting right there/));
    ok("...and its own header says the first fix stayed in one file and DID NOT TRAVEL",
        proseHas(pw, /It did not travel\./i), "then mpmGpuPage was caught doing it a second time");
    ok("!! browserSkipReason is the rule it settled on: two facts, each on its own evidence",
        proseHas(pw, /reported on their own evidence rather than collapsed into one guess/));
    const ws = fs.readFileSync(path.join(ROOT, "engine", "wasmSupport.mjs"), "utf8");
    ok("!! ...and THIS file is that rule applied to wasm, as a shared module so it travels this time",
        proseHas(ws, /browserSkipReason/) && proseHas(ws, /playwrightResolve/),
        "a fix written into box3dLoader.js would have been the fourth instance waiting to happen");
}

// ---- 3. THE PROBE -------------------------------------------------------------------------------------------
console.log("\n3. the probe: two questions, not one");
{
    _resetWasmProbe();
    const p = probeWasm();
    ok("in Node, wasm is present and usable", p.present === true && p.usable === true && p.reason === "");
    ok("wasmUsable() agrees, and there is nothing to report", wasmUsable() === true && wasmUnavailableReason() === "");
    ok("the probe caches -- it is called from a loader's hot path", probeWasm() === p, "same object");
    _resetWasmProbe();
    ok("...and the cache can be reset, or this gate could only ever see one environment", probeWasm() !== p);

    // explainWasmFailure with wasm working: the caller's own reason survives untouched.
    const own = "Box3D WASM not built yet -- run the build script.";
    const msg = explainWasmFailure(new Error("Failed to fetch"), own);
    ok("!! with wasm working, the caller's OWN reason is what comes back", msg.startsWith(own) && /Failed to fetch/.test(msg), msg.slice(0, 90));
    ok("...and a missing error object does not produce 'undefined' in a user-facing string",
        !/undefined/.test(explainWasmFailure(null, own)), explainWasmFailure(null, own));
}

// ---- 4. THE LOADERS, AS SOURCE ------------------------------------------------------------------------------
console.log("\n4. the two loaders that were measured misreporting");
{
    const b3 = fs.readFileSync(path.join(ROOT, "physics", "box3d", "box3dLoader.js"), "utf8");
    const jl = fs.readFileSync(path.join(ROOT, "physics", "jolt", "joltLoader.js"), "utf8");
    const tw = fs.readFileSync(path.join(ROOT, "world", "terrainWasm.js"), "utf8");
    // noComments() would keep the strings; here the PRESENCE of a call is the question, so codeOnly is right.
    ok("box3dLoader routes its failure through the shared explainer", /explainWasmFailure\(e,/.test(codeOnly(b3)));
    ok("...and still says the build script when the build really is what is missing", /build-box3d-wasm-clang\.sh/.test(b3),
        "the advice was not deleted, it was made conditional");
    ok("joltLoader asks BEFORE it touches wasm", /const probe = probeWasm\(\);/.test(codeOnly(jl)));
    ok("...and wraps the init() that actually touches it, which was outside the old try", /catch \(e\) \{ throw new Error\(explainWasmFailure/.test(codeOnly(jl)));
    ok("!! world/terrainWasm.js -- the one that was already right -- is NOT changed by this round",
        !/wasmSupport/.test(tw) && /using JS terrain path/.test(tw),
        "it try/catches the whole init, warns once and returns false; churning it would buy nothing");
}

// ---- 5 & 6. LIVE: A REAL BROWSER, WITH WebAssembly TAKEN AWAY ----------------------------------------------
console.log("\n5. *** THE MEASUREMENT THE ROUND IS BUILT ON: A REAL BROWSER WITH WebAssembly DELETED ***");
{
    const { chromium, from } = resolvePlaywright(createRequire(import.meta.url));
    const skip = browserSkipReason(chromium, from);
    if (skip) {
        console.log("  skip  the live sections: " + skip);
        console.log("        WITHOUT THEM THIS GATE PROVES ONLY THAT THE WIRING IS PRESENT, not that the message a");
        console.log("        person reads is the right one -- which is the entire claim. Sections 5 and 6 are the");
        console.log("        evidence; on a box with playwright they run.");
    } else {
        const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".html": "text/html", ".json": "application/json" };
        const server = http.createServer((req, res) => {
            const url = req.url.split("?")[0];
            if (url === "/__csp") {   // a page whose CSP omits 'wasm-unsafe-eval'
                res.writeHead(200, { "content-type": "text/html", "content-security-policy": "script-src 'self' 'unsafe-inline'" });
                return res.end("<!doctype html><body><script type=module>import { probeWasm } from '/engine/wasmSupport.mjs';" +
                    "window.__r={typeofSaysFine:typeof WebAssembly!=='undefined',probe:probeWasm()};</script>");
            }
            if (url === "/__plain") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<!doctype html><body>"); }
            const p = path.join(ROOT, decodeURIComponent(url));
            if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end("no"); }
            res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" });
            fs.createReadStream(p).pipe(res);
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const port = server.address().port;
        const browser = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        try {
            const askLoaders = async (killWasm) => {
                const page = await browser.newPage();
                if (killWasm) await page.addInitScript(() => { delete globalThis.WebAssembly; });
                await page.goto(`http://127.0.0.1:${port}/__plain`, { waitUntil: "domcontentloaded" });
                const out = await page.evaluate(async (port) => {
                    const r = { wasmPresent: typeof WebAssembly !== "undefined" };
                    try {
                        const { Box3DLoader } = await import(`http://127.0.0.1:${port}/physics/box3d/box3dLoader.js`);
                        const st = await new Box3DLoader().init();
                        r.box3d = { threw: false, ready: !!st.ready, reason: st.reason || "" };
                    } catch (e) { r.box3d = { threw: true, reason: String(e && e.message) }; }
                    try {
                        const m = await import(`http://127.0.0.1:${port}/physics/jolt/joltLoader.js`);
                        await m.createJoltBackend();
                        r.jolt = { threw: false, reason: "" };
                    } catch (e) { r.jolt = { threw: true, reason: String(e && e.message) }; }
                    return r;
                }, port);
                await page.close();
                return out;
            };

            const good = await askLoaders(false);
            ok("with WebAssembly present, box3d loads from the vendored build", good.box3d.ready === true, "ready:true");
            ok("...and Jolt makes a backend", good.jolt.threw === false);

            const gone = await askLoaders(true);
            ok("with WebAssembly deleted, the page really has none", gone.wasmPresent === false);
            // *** THE CHECK THIS ROUND EXISTS FOR. *** The build is on disk and worked seconds ago; the old
            // message told the reader to install clang and wasi-libc and rebuild it.
            ok("!! *** box3d NO LONGER TELLS YOU TO REBUILD A FILE THAT IS ALREADY THERE AND ALREADY WORKS ***",
                gone.box3d.ready === false && !/build-box3d-wasm-clang/.test(gone.box3d.reason) && /Lockdown Mode/.test(gone.box3d.reason),
                gone.box3d.reason.slice(0, 120));
            ok("!! ...and Jolt says what is wrong instead of throwing a bare ReferenceError",
                gone.jolt.threw === true && /Jolt needs WebAssembly/.test(gone.jolt.reason) && !/^WebAssembly is not defined$/.test(gone.jolt.reason),
                gone.jolt.reason.slice(0, 100));

            // ---- 6. THE CASE A `typeof` CHECK CANNOT SEE ----
            console.log("\n6. *** AND typeof WebAssembly IS NOT ENOUGH, WHICH IS WHY THE PROBE COMPILES ***");
            const page = await browser.newPage();
            await page.goto(`http://127.0.0.1:${port}/__csp`, { waitUntil: "networkidle" });
            const csp = await page.evaluate(() => window.__r || null);
            await page.close();
            ok("under a CSP without 'wasm-unsafe-eval', typeof WebAssembly STILL says everything is fine",
                csp && csp.typeofSaysFine === true, "which is the same misattribution one level down");
            ok("!! ...while compiling the eight bytes of an empty module is REFUSED by the browser",
                csp && csp.probe.present === true && csp.probe.usable === false,
                (csp && csp.probe.error || "").slice(0, 110));
            ok("!! ...and the reason names the CSP, not a missing build",
                csp && /Content-Security-Policy without 'wasm-unsafe-eval'/.test(csp.probe.reason) && /not a missing build/.test(csp.probe.reason));
        } finally { await browser.close(); server.close(); }
    }
}

console.log("\n----  WHAT THIS DOES NOT CLAIM");
console.log("      THAT THE TREE WORKS WITHOUT WebAssembly. It does not, and nothing here makes it. box3d and");
console.log("      Jolt are the physics backends and there is no wasm-free substitute for either; what changed");
console.log("      is that a person who hits this is told the true cause in the first sentence instead of being");
console.log("      sent to rebuild a working file. world/terrainWasm.js is the only loader in the tree with a");
console.log("      real fallback, and it had one before this round.");
console.log("      AND ONLY TWO LOADERS WERE WIRED. The other nine API callers are Node-side gates and tools,");
console.log("      where WebAssembly is always present and a probe would be ceremony. That is a judgement, not");
console.log("      a measurement: if one of them is ever run somewhere hostile it will need the same treatment.");

console.log("\nwasmSupport-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
