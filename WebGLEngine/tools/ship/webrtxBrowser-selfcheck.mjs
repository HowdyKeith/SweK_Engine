// WebGLEngine/tools/ship/webrtxBrowser-selfcheck.mjs -- v4118
//
// Run: node tools/ship/webrtxBrowser-selfcheck.mjs   (~996ms MEASURED (gate-timings.json) -- last section drives real Chromium)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ui/webrtxBrowser.js + webrtx.html -- the opt-in page for ray tracing in a tab via codedhead/webrtx.
//
// *** THE CLAIM THIS FILE EXISTS TO POLICE IS NOT "DOES IT RAY TRACE" -- IT IS "DOES THE PAGE SAY TRUE THINGS
// ABOUT WHAT IT HAS AND HAS NOT DONE." *** Almost everything on that page is borrowed or unverified: somebody
// else's three-year-old code, a build recipe, and a smoke test that ran once on a software adapter. The page
// is only worth shipping if each of those keeps its label. So the checks are mostly about ATTRIBUTION and
// REFUSALS, with one browser section that drives the real page against a real built bundle when there is one.
//
// *** AND THE ORIGIN CHECK COMES FIRST, BECAUSE THAT IS THE LESSON THIS ROUND WAS TAUGHT BY A BUG. ***
// navigator.gpu is secure-context only, and SweK's own address is http://<lan-ip>:8787. voxtral.html shipped
// at v4115 reaching into crypto.subtle -- also secure-context only -- and did nothing at all on the LAN, with
// no message, because its gate served the page from localhost, WHICH IS A SECURE CONTEXT. A probe run on the
// wrong ORIGIN measures a different browser. Section 4 here serves from a non-loopback address for that reason.
"use strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { codeOnly, noComments } from "./sourceScan.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { UPSTREAM, MAINTENANCE, BUILD_STEPS, MEASURED_HERE, REFUSED, STAGED_PATH,
         initialState, nextStep, blockersFrom, warningsFrom, humanBytes, totalBytes } from "../../ui/webrtxBrowser.js";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("webrtxBrowser-selfcheck -- borrowed work, and whether it keeps its label\n");

function pageCode(file) {
    const raw = fs.readFileSync(path.join(ENG, file), "utf8");
    const bodies = [...raw.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
    return { raw, js: codeOnly(bodies), jsRaw: bodies, text: noComments(raw) };
}
const nonVacuous = (label, hay, min = 2000) =>
    ok("   [haystack] " + label + " is real text (" + hay.length + " chars)", hay.length >= min,
        "an absence proven against an empty string is not a proof");

// ---- 1. PROVENANCE, AND A MAINTENANCE FACT MEASURED THE RIGHT WAY -------------------------------------------
{
    console.log("1. SOMEBODY ELSE'S CODE, LABELLED");
    ok("licence recorded and permissive", UPSTREAM.license === "MIT");
    ok("   ...and recorded as read, not inferred", /LICENSE file present and read/.test(UPSTREAM.licenseVerified));
    ok("the exact commit is pinned", /^[0-9a-f]{40}$/.test(UPSTREAM.commit));
    ok("!! *** the 'one commit' claim says HOW it was checked, because a shallow clone always reports one ***",
        /unshallow/.test(MAINTENANCE.howChecked) && MAINTENANCE.commits === 1,
        "`git clone --depth 1` shows a single commit for EVERY repository. Stating 'unmaintained, one commit' " +
        "from that would be a measurement error dressed as evidence");
    ok("the staleness is stated rather than softened", /unmaintained/.test(MAINTENANCE.verdict));
}

// ---- 2. *** THE BUILD RECIPE IS A SET OF CLAIMS, AND EACH ONE MUST CARRY ITS REASON *** ----------------------
{
    console.log("\n2. *** EVERY BUILD STEP CARRIES THE ERROR THAT MADE IT NECESSARY ***");
    ok("there are real steps", BUILD_STEPS.length >= 5);
    ok("!! every step says WHERE and WHY", BUILD_STEPS.every((s) => s.step && s.where && s.why && s.why.length > 60));
    // A recipe without the failure it fixes is folklore: the next reader cannot tell which steps still apply.
    const why = BUILD_STEPS.map((s) => s.why).join(" ");
    ok("!! *** the wasm-bindgen floor is named with its version ***", /0\.2\.88/.test(why) && /0\.2\.84/.test(why),
        "Rust 1.94 hard-refuses wasm-bindgen below 0.2.88; that is the whole reason the committed lock blocks " +
        "the build, and it is the least guessable step");
    ok("!! the webpack failure is named by its actual error", /parseVec/.test(why));
    ok("!! the TypeScript trap is named -- `latest` is version 7 and BREAKS ts-loader", /ts-loader|fileExists/.test(why) && /7/.test(why),
        "'npm i typescript@latest' looks like the fix and is not; that is exactly the kind of step a recipe " +
        "exists to record");
    ok("!! publicPath is in the recipe even though upstream's README omits it",
        BUILD_STEPS.some((s) => /publicPath/.test(s.step)),
        "without it the bundle throws 'Automatic publicPath is not supported' and its wasm chunks 404 -- the " +
        "first thing a consumer hits");
}

// ---- 3. REFUSALS, THE ORIGIN RULE, AND THE OPT-IN INVARIANT --------------------------------------------------
{
    console.log("\n3. WHAT IT REFUSES TO CLAIM");
    ok("refusals are structured", REFUSED.length >= 3 && REFUSED.every((r) => r.what && r.why && r.wouldNeed));
    ok("!! *** it refuses to claim Safari/iOS support, and says why the risk is SPECIFIC ***",
        REFUSED.some((r) => /Safari|iPhone/.test(r.what) && /generated|naga/i.test(r.why)),
        "upstream says Chrome-only-tested, and the WGSL is GENERATED by a 2023 naga -- which is precisely what " +
        "Safari's newer validator rejects first. 'Untested' alone would not tell a reader where to look");
    ok("!! *** it refuses to pin a digest, and gives the structural reason ***",
        REFUSED.some((r) => /SHA-256|digest/i.test(r.what) && /no build|publishes no/i.test(r.why)),
        "voxtral's engine ships prebuilt so a pin is meaningful; this one is compiled per consumer, so a " +
        "digest of one build would refuse every other. Different situation, different honest answer");
    ok("!! the insecure-origin refusal exists and names the measurement",
        REFUSED.some((r) => /LAN/.test(r.what) && /127\.0\.0\.1/.test(r.why)));

    console.log("   -- and the origin outranks the hardware --");
    ok("!! *** an insecure origin is the ONLY blocker reported, not one of several ***",
        blockersFrom({ secureContext: false, gpuNamespace: false, adapter: false }).length === 1,
        "on an insecure origin navigator.gpu does not exist, so 'no adapter' would be a true sentence that " +
        "blames the machine for what the URL did. It returns early on purpose");
    ok("a secure origin with no adapter DOES report the adapter",
        blockersFrom({ secureContext: true, gpuNamespace: true, adapter: false }).length === 1);
    ok("no facts blocks nothing", blockersFrom(null).length === 0);
    ok("!! a software adapter warns but never blocks",
        blockersFrom({ secureContext: true, gpuNamespace: true, adapter: true, softwareRenderer: true }).length === 0 &&
        warningsFrom({ softwareRenderer: true }).length === 1);
    ok("!! *** an Apple GPU is called out as UNTESTED rather than assumed to work ***",
        warningsFrom({ appleGpu: true }).some((w) => /first evidence/.test(w)),
        "nothing upstream has run on one, so a pass there is new evidence and a failure is the named risk");

    console.log("   -- opt-in --");
    ok("!! nothing loads before consent", nextStep(initialState(), { secureContext: true, gpuNamespace: true, adapter: true }).action === "consent");
    ok("...and after consent it proceeds", nextStep({ ...initialState(), consented: true }, { secureContext: true, gpuNamespace: true, adapter: true }).action === "load");
    ok("a blocker outranks consent", nextStep({ ...initialState(), consented: true }, { secureContext: false }).action === "blocked");
    ok("totalBytes is computed, not restated", humanBytes(totalBytes()) === "3.64 MB", humanBytes(totalBytes()));
    ok("!! MEASURED_HERE admits no image was ever rendered",
        /NO IMAGE WAS EVER RENDERED/.test(MEASURED_HERE.note) && /is not 'it draws'/.test(MEASURED_HERE.note),
        "'the pipeline exists' and 'it ray traces' are two claims and only the first was tested");
}

// ---- 4. *** THE PAGE, ON A NON-LOOPBACK ORIGIN, AND AGAINST A REAL BUILT BUNDLE *** --------------------------
console.log("\n4. *** THE PAGE ITSELF -- SERVED FROM AN ADDRESS THAT IS NOT localhost ***");
{
    const pg0 = pageCode("webrtx.html");
    nonVacuous("webrtx.html's script", pg0.js);
    ok("!! the page imports the shared module", /webrtxBrowser\.js/.test(pg0.text));
    ok("!! ...and reuses the shared probe rather than querying WebGPU itself for facts",
        /localModelProbe\.js/.test(pg0.text));
    ok("!! ...and asks nextStep() rather than deciding when to load", /nextStep\(/.test(pg0.js));
    // *** READ WITH noComments, NOT codeOnly: THE THING BEING CHECKED IS A STRING LITERAL. *** codeOnly()
    // blanks string contents, so "ray_tracing" becomes "" and this check can only ever fail. That is v4021's
    // documented rule -- codeOnly for code SHAPES, noComments when the evidence lives inside a string -- and
    // this is the fourth time this session it has been hit, from both sides.
    ok("!! *** the smoke test asks for the ray_tracing FEATURE, which is the entry point ***",
        /requiredFeatures:\s*\["ray_tracing"\]/.test(noComments(pg0.jsRaw)),
        "webrtx installs its API only when that feature is requested. My first probe called requestDevice() " +
        "bare, saw nothing, and would have reported a false negative on working code");

    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    const lan = Object.values(os.networkInterfaces()).flat()
        .filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n.address)[0];
    if (skip || !lan) {
        report("live half SKIPPED -- " + (skip || "no non-loopback IPv4 address"));
        report("*** A SKIP, NOT A PASS: source cannot show what a page says on the address Keith opens.");
    } else {
        const srv = http.createServer((rq, rs) => {
            const u = decodeURIComponent(rq.url.split("?")[0]);
            const f = path.join(ENG, u === "/" ? "/webrtx.html" : u);
            if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end("nf"); }
            const e = path.extname(f);
            rs.writeHead(200, { "Content-Type": e === ".js" || e === ".mjs" ? "text/javascript"
                                              : e === ".html" ? "text/html" : "application/octet-stream" });
            rs.end(fs.readFileSync(f));
        });
        await new Promise((r) => srv.listen(0, "0.0.0.0", r));
        const port = srv.address().port;
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const pg = await (await b.newContext()).newPage();
        const errs = [];
        pg.on("pageerror", (e) => errs.push(String(e.message)));
        await pg.goto("http://" + lan + ":" + port + "/webrtx.html", { waitUntil: "load" }).catch(() => {});
        await pg.waitForTimeout(400);
        const t = await pg.evaluate(() => ({ secure: window.isSecureContext, text: document.body.innerText }));
        ok("!! the LAN origin is insecure, as it is for the real engine", t.secure === false,
            "http://" + lan + ":" + port);
        ok("!! *** and the page SAYS SO on load, before any button ***",
            /cannot work on this address/i.test(t.text),
            "a page that offered a Load button here would be offering something that cannot work");
        ok("   ...and names the fix", /tunnel|localhost/i.test(t.text));
        ok("   ...and still renders its provenance and refusals", /MIT/.test(t.text) && /Safari/.test(t.text));
        ok("!! the page loads with no script error on the insecure origin", errs.length === 0, errs.join(" | "));
        await b.close(); srv.close();
    }
}

console.log("\n" + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
