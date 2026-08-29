// WebGLEngine/tools/ship/verifiedPolygonIntersection-selfcheck.mjs -- v4143
//
// Run: node tools/ship/verifiedPolygonIntersection-selfcheck.mjs   (a few seconds for the static half; up to
// half a minute for the live half, which fetches 4 real files over the network and drives a real browser)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/verifiedPolygonIntersectionBridge.js + vpi.html -- the install button for
// schildep/verified-polygon-intersection (MIT), never vendored into this tree. Lower risk than its neighbours
// on the same shelf (grdpwasm, galaxy-profile): no build, no subprocess, no port of its own -- four static
// files fetched and served. What this gate actually proves: the fetched bytes are the SAME bytes measured by
// cloning upstream directly (exact size, not just "present"), the served page really is cross-origin-isolated
// (this server's own COOP/COEP headers, not upstream's service-worker workaround), and the Lean-proved
// algorithm really computes something when driven like a person would drive it -- not just that a WASM file
// loaded without throwing.
//
// *** THE REAL BUG THIS GATE'S OWN FIRST DRAFT FOUND, WORTH RECORDING HERE TOO: *** the bridge's first version
// used Node's built-in require("https").get() to fetch the four files, and it failed with "socket connection
// was closed unexpectedly" -- not a fluke. This sandbox's outbound HTTPS goes through an agent proxy
// (HTTPS_PROXY is set in the environment), and Node's http/https modules have never honored HTTP_PROXY/
// HTTPS_PROXY -- a Node-wide gap, not something specific to this sandbox. A user behind a REAL corporate proxy
// would hit the identical silent failure. curl DOES read those env vars (confirmed: curl -sS on the same URL
// succeeded, exact byte match) and every install script in this tree already shells out to curl for downloads
// -- section 6 below re-derives that fix by running the real fetch, not by reading the code and trusting it.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("verifiedPolygonIntersection-selfcheck -- an install button for somebody else's MIT repo, never vendored\n");

const bridgeSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "verifiedPolygonIntersectionBridge.js"), "utf8");
const pageSrc = fs.readFileSync(path.join(ENG, "vpi.html"), "utf8");
const serverSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");

// ---- 1. UPSTREAM FACTS ARE RECORDED, AND THE LICENCE WAS ACTUALLY READ ---------------------------------------
{
    console.log("1. UPSTREAM FACTS RECORDED, LICENCE VERIFIED BY READING IT");
    ok("!! *** bridge names MIT and states the licence text was actually read, not inferred from a badge ***",
        /license: LICENSE/.test(bridgeSrc) && /licenseVerified.*LICENSE fetched.*read.*1067 bytes.*MIT License/s.test(bridgeSrc));
    const m = bridgeSrc.match(/PINNED_COMMIT\s*=\s*"([0-9a-f]{40})"/);
    ok("!! *** PINNED_COMMIT is a real 40-char SHA, not a branch name ***", !!m, m ? m[1] : "no match");
    ok("   ...and MAINTENANCE.howChecked names git, proving activity was measured rather than guessed",
        /howChecked:.*git clone \(unshallowed\)/.test(bridgeSrc));
}

// ---- 2. REFUSED LIST NAMES THE REAL PROPERTIES, NOT A COPY-PASTE OF grdpwasm's -------------------------------
{
    console.log("\n2. REFUSED LIST NAMES *** THIS TOOL'S OWN *** RISKS, NOT ITS NEIGHBOURS'");
    // *** v4145 -- ALL FOUR OF THESE MATCHED PROSE AGAINST RAW SOURCE, AND gateQuality CAUGHT TWO OF THEM. ***
    // A bare phrase regex tested against the whole bridge file cannot tell a REFUSED entry from a sentence in
    // a comment that happens to discuss one, and it silently stops matching the moment somebody wraps the
    // string across two lines. That is the trap this tree names commentFalsePass, and writing three fresh
    // instances of it while shipping v4143/v4144 is exactly how the debt got to 48 against a baseline of 40.
    //
    // *** AND THE FIRST DRAFT OF THIS VERY NOTE QUOTED THE BROKEN CALL VERBATIM, WHICH PUT IT BACK. ***
    // gateQuality finds a prose regex literal and then looks for where it is applied -- ANYWHERE in the file,
    // comments included. So a comment demonstrating the wrong form re-created an offender that the code below
    // no longer contains, and the count went 8 -> 7 instead of 8 -> 6. The same shape as v4139, where the note
    // removing five frozen decimals quoted all five and took the header from five claims to eight. The rule
    // that falls out: DESCRIBE the broken form, never spell it -- an example in a comment is still an instance.
    //
    // THE FIX IS NOT A DIFFERENT REGEX, IT IS NOT READING RAW SOURCE. The REFUSED array is a structure, so it
    // is parsed into `what:`/`why:` pairs and the checks assert against THOSE -- which is both immune to
    // comment text and a stronger claim: the entry has to be in the list, not merely somewhere in the file.
    const refusedBlock = (bridgeSrc.match(/const REFUSED = Object\.freeze\(\[([\s\S]*?)\n\]\);/) || [, ""])[1];
    const refusedWhats = [...refusedBlock.matchAll(/what:\s*"([^"]*)"/g)].map((m) => m[1]);
    const refusedText = refusedBlock.replace(/\s+/g, " ");   // whys are multi-line concatenations; flatten once
    const refuses = (re) => refusedWhats.some((w) => re.test(w));
    ok("!! refuses to vendor source into the tree or a release zip", refuses(/vendoring the repo's source/));
    ok("!! refuses to rebuild from source (states WHY -- avoids a slow Lean+emscripten toolchain install for output already built)",
        refuses(/rebuilding the WASM from source/) && /Lean 4 toolchain/.test(refusedText));
    ok("!! refuses to patch their JS/WASM to remove the service worker", refuses(/patching their JS\/WASM/));
    ok("!! refuses to run any commit but the pinned one", refuses(/running any commit other than the pinned one/));
    // *** THIS TOOL HAS NO BIND-ADDRESS RISK, AND THE ABSENCE IS CHECKED RATHER THAN LEFT IMPLICIT. *** grdpwasm's
    // REFUSED list is dominated by an open-relay finding; copying that entry here would misdescribe a bridge
    // that opens no socket of its own at all. *** THIS FILE'S OWN FIRST DRAFT FAILED ITSELF HERE: *** scoping the
    // check to the WHOLE FILE matched the header comment's own explanation of why there is no bind risk ("no
    // port of its own to bind") -- the same prose-vs-structure trap, caught once by hand before shipping and
    // then re-introduced four lines above it, which is why the whole section reads the structure now.
    ok("!! *** and REFUSED lists no bind-address / loopback entry, because this bridge opens no socket of its own ***",
        refusedWhats.length > 0 && refusedWhats.every((w) => !/loopback|bind/i.test(w)),
        "unlike grdpwasm, nothing here spawns a process or listens on a port -- four files are fetched and served through the ENGINE's own existing port. REFUSED whats: " + JSON.stringify(refusedWhats));
}

// ---- 3. STAGED OUTSIDE THE TREE, LIKE EVERY OTHER INSTALL BUTTON HERE ------------------------------------------
{
    console.log("\n3. STAGED OUTSIDE THE ENGINE TREE");
    const srcDirLine = bridgeSrc.match(/const SRC_DIR = process\.env\.VPI_SRC_DIR \|\| (.+);/);
    ok("!! *** default SRC_DIR resolves under the home directory, not under the project root ***",
        !!srcDirLine && /os\.homedir\(\)/.test(srcDirLine[1]) && /\.voxelbridge/.test(srcDirLine[1]));
    const defaultSrcDir = path.join(os.homedir(), ".voxelbridge", "verified-polygon-intersection");
    const PROJECT_ROOT = path.resolve(ENG, "..");
    ok("   ...and that resolved path really is outside PROJECT_ROOT, checked rather than assumed",
        defaultSrcDir !== PROJECT_ROOT && !defaultSrcDir.startsWith(PROJECT_ROOT + path.sep),
        "PROJECT_ROOT=" + PROJECT_ROOT + " SRC_DIR=" + defaultSrcDir);
}

// ---- 4. THE PAGE SURFACES PROVENANCE FROM THE BRIDGE, NOT HARDCODED ---------------------------------------------
{
    console.log("\n4. THE PAGE SURFACES WHOSE WORK THIS IS FROM THE BRIDGE'S OWN status()");
    ok("!! page renders repo/author/licence from u.* fields returned by /vpi/status, not hardcoded strings",
        /u\.repo/.test(pageSrc) && /u\.author/.test(pageSrc) && /u\.license/.test(pageSrc));
    ok("   ...and renders the REFUSED list rather than only stating it in a code comment nobody visits",
        /s\.refused/.test(pageSrc) && /\$\("refused"\)/.test(pageSrc));
    ok("!! the page explicitly explains the COOP/COEP header decision, not just the licence table",
        /Cross-Origin-Opener-Policy/.test(pageSrc) && /service worker/i.test(pageSrc));
}

// ---- 5. ROUTES EXIST, ARE LAZILY REQUIRED, AND THE ARTEFACT ROUTE CANNOT WALK OUT OF SRC_DIR --------------------
{
    console.log("\n5. SERVER ROUTES, AND PATH SAFETY ON THE STATIC ONE");
    for (const r of ["/vpi/status", "/vpi/install", "/vpi/app/"]) {
        ok("!! " + r + " is wired in server.js", serverSrc.includes('"' + r + '"') || serverSrc.includes("'" + r + "'"));
    }
    ok("!! *** the artefact route matches the request against a FIXED list inside the bridge (readArtefact), never joins it onto a filesystem path ***",
        /vpi\.readArtefact\(want \|\| "index\.html"\)/.test(serverSrc),
        "mirrors /voxtral/engine/<name>'s own path-safety pattern -- an attacker-controlled request string can only ever hit one of four known names");
    ok("   ...and sets Cross-Origin-Opener-Policy + Cross-Origin-Embedder-Policy on every response under the route, not just index.html",
        /"Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp"/.test(serverSrc));
    // Live check that readArtefact really refuses an unknown name -- a regex reading "it looks gated" is not
    // the same claim as the function actually returning null for something outside its list.
    delete require_.cache[require_.resolve("../../ai-bridge/verifiedPolygonIntersectionBridge.js")];
    const bridge0 = require_("../../ai-bridge/verifiedPolygonIntersectionBridge.js");
    ok("!! readArtefact(\"../../../etc/passwd\") returns null -- not a file, not a throw", bridge0.readArtefact("../../../etc/passwd") === null);
    ok("!! readArtefact(\"not-a-real-file.txt\") returns null", bridge0.readArtefact("not-a-real-file.txt") === null);
}

// ---- 6. *** LIVE: A REAL FETCH OF ALL FOUR FILES, VERIFIED BYTE-EXACT AGAINST A DIRECT git clone *** ------------
{
    console.log("\n6. *** LIVE INSTALL, INTO A THROWAWAY DIRECTORY, VERIFIED BYTE-EXACT ***");
    let curlOk = false;
    try { require_("node:child_process").execFileSync("curl", ["--version"], { timeout: 5000 }); curlOk = true; } catch {}
    if (!curlOk) {
        report("SKIPPED -- no curl found on this host");
        report("*** THAT IS A SKIP AND NOT A PASS: this is the section that proves the bridge actually fetches real files.");
    } else {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vpi-gate-"));
        process.env.VPI_SRC_DIR = tmp;
        delete require_.cache[require_.resolve("../../ai-bridge/verifiedPolygonIntersectionBridge.js")];
        const bridge = require_("../../ai-bridge/verifiedPolygonIntersectionBridge.js");

        const startRes = bridge.install();
        ok("!! install() returns immediately (fire-and-poll), not after the job finishes",
            startRes.ok && startRes.started);

        let job = null;
        for (let i = 0; i < 40 && !(job && job.job && job.job.done); i++) {
            await new Promise((r) => setTimeout(r, 1000));
            job = bridge.installStatus();
        }
        ok("!! *** install job actually finished (4 real network fetches) within budget ***",
            !!job && job.job && job.job.done, job && job.job ? "code=" + job.job.code : "still running");
        ok("!! *** and it succeeded ***", !!job && job.job && job.job.done && job.job.code === 0, job && job.job ? job.job.log.slice(-400) : "");

        // *** EXACT SIZE, NOT JUST "ABOVE THE MINIMUM". *** minBytes in ARTEFACTS exists to catch a truncated
        // fetch; this section holds the EXACT sizes measured by cloning upstream directly (see the bridge's own
        // header), so a corrupted-but-still-large fetch would be caught here even though built() would pass it.
        const EXACT = { "index.html": 17182, "coi-serviceworker.min.js": 3009, "lean_app.js": 81370, "lean_app.wasm": 1167066 };
        for (const [rel, size] of Object.entries(EXACT)) {
            let actual = -1;
            try { actual = fs.statSync(path.join(tmp, rel)).size; } catch {}
            ok("!! " + rel + " is EXACTLY " + size + " bytes (measured by cloning upstream unshallowed, not guessed)",
                actual === size, "got " + actual);
        }
        ok("!! bridge.built() agrees all four are present and above minBytes", bridge.built());

        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
        delete process.env.VPI_SRC_DIR;
    }
}

// ---- 7. *** LIVE: THE PAGE, DRIVEN IN A REAL BROWSER AGAINST THE REAL server.js -- COMPUTES A REAL RESULT *** ---
{
    console.log("\n7. *** THE PAGE, DRIVEN IN A REAL BROWSER -- crossOriginIsolated, AND A REAL INTERSECTION COMPUTED ***");
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    let curlOk = false;
    try { require_("node:child_process").execFileSync("curl", ["--version"], { timeout: 5000 }); curlOk = true; } catch {}
    if (skip || !curlOk) {
        report("SKIPPED -- " + (skip || "no curl found"));
    } else {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vpi-page-gate-"));
        const GATE_PORT = "19788";
        const env = Object.assign({}, process.env, { PORT: GATE_PORT, VPI_SRC_DIR: tmp });
        const { spawn } = require_("node:child_process");
        const srv = spawn(process.execPath, [path.join(ENG, "ai-bridge", "server.js")], { env, stdio: ["ignore", "pipe", "pipe"] });
        let port = null, buf = "";
        srv.stdout.on("data", (d) => { buf += d.toString(); if (buf.includes(":" + GATE_PORT)) port = GATE_PORT; });
        for (let i = 0; i < 40 && !port; i++) await new Promise((r) => setTimeout(r, 250));

        if (!port) {
            report("SKIPPED -- could not determine the port server.js bound to");
        } else {
            const base = "http://127.0.0.1:" + port;
            // Install via the real route first (not bridge.install() directly), so this section also proves the
            // HTTP layer, not just the module.
            let installOk = false;
            try { const r = await fetch(base + "/vpi/install", { method: "POST" }); installOk = (await r.json()).ok; } catch {}
            let built = false;
            for (let i = 0; i < 40 && !built; i++) {
                await new Promise((r) => setTimeout(r, 1000));
                try { const s = await (await fetch(base + "/vpi/status")).json(); built = s.built; } catch {}
            }
            ok("!! install triggered over the real HTTP route, and finishes within budget", installOk && built);

            // Headers, checked via a plain fetch with NO JavaScript execution -- proves the headers are real HTTP
            // response headers this server sends, independent of anything a service worker could fake.
            let headers = null;
            try { headers = Object.fromEntries((await fetch(base + "/vpi/app/index.html")).headers); } catch {}
            ok("!! *** Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy are real HTTP headers on a plain fetch (no JS, no service worker involved) ***",
                headers && headers["cross-origin-opener-policy"] === "same-origin" && headers["cross-origin-embedder-policy"] === "require-corp");

            const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
            const pg = await (await b.newContext()).newPage();
            const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message)));
            await pg.goto(base + "/vpi/app/index.html", { waitUntil: "load" }).catch(() => {});

            const isolated = await pg.evaluate(() => window.crossOriginIsolated).catch(() => null);
            ok("!! *** window.crossOriginIsolated is true -- this server's headers did the job, no service worker reload needed ***", isolated === true);

            await pg.waitForFunction(() => { const s = document.getElementById("status"); return s && !s.textContent.includes("Loading"); }, { timeout: 15000 }).catch(() => {});
            const loadedText = await pg.$eval("#status", (e) => e.textContent).catch(() => "");
            ok("!! *** the Lean/WASM runtime actually initialized (status moved past \"Loading WASM module\") ***",
                !/Loading/.test(loadedText), loadedText);

            // Draw two real overlapping unit squares via genuine pointer events -- (0,0)-(4,0)-(4,4)-(0,4) and
            // (2,2)-(6,2)-(6,6)-(2,6), the same fixture verified by hand while building this bridge. A 4x4
            // square overlapping a 4x4 square offset by (2,2) intersects in an exact 2x2 square -- REAL Lean-
            // proved geometry, not a canned response.
            const rect = await pg.evaluate(() => { const r = document.getElementById("canvas").getBoundingClientRect(); return { left: r.left, top: r.top }; }).catch(() => null);
            let finalStatus = "", hasGreen = false;
            if (rect) {
                const SCALE = 40, ORIGIN = { x: 50, y: 550 };
                const toPixel = (ux, uy) => ({ x: rect.left + ux * SCALE + ORIGIN.x, y: rect.top + ORIGIN.y - uy * SCALE });
                const tapAll = async (pts) => { for (const p of pts) { await pg.mouse.move(p.x, p.y); await pg.mouse.down(); await pg.mouse.up(); await pg.waitForTimeout(40); } };
                await tapAll([[0, 0], [4, 0], [4, 4], [0, 4]].map(([x, y]) => toPixel(x, y)));
                await pg.click("#btn-finish").catch(() => {});
                await tapAll([[2, 2], [6, 2], [6, 6], [2, 6]].map(([x, y]) => toPixel(x, y)));
                await pg.click("#btn-finish").catch(() => {});
                await pg.waitForTimeout(300);
                finalStatus = await pg.$eval("#status", (e) => e.textContent).catch(() => "");
                hasGreen = await pg.evaluate(() => {
                    const c = document.getElementById("canvas"), ctx = c.getContext("2d");
                    const img = ctx.getImageData(0, 0, c.width, c.height).data;
                    for (let i = 0; i < img.length; i += 4) { if (Math.abs(img[i] - 44) < 20 && Math.abs(img[i + 1] - 160) < 20 && Math.abs(img[i + 2] - 44) < 20) return true; }
                    return false;
                }).catch(() => false);
            }
            ok("!! *** the LEAN-PROVED algorithm computed a real intersection from real pointer-drawn polygons ***",
                /Intersection: 1 boundary component/.test(finalStatus), "status: " + finalStatus);
            ok("   ...and the computed result actually rendered (green result-colour pixels present on canvas)", hasGreen);

            ok("!! no script error in the page", errs.length === 0, errs.join(" | "));
            await b.close();
        }
        try { srv.kill(); } catch {}
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    }
}

console.log("\n" + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
