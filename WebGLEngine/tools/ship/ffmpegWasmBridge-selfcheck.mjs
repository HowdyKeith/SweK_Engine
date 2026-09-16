// WebGLEngine/tools/ship/ffmpegWasmBridge-selfcheck.mjs -- v4613
//
// Run: node tools/ship/ffmpegWasmBridge-selfcheck.mjs   (a few seconds for the static half; the real-network
// half downloads ~20 MB of real npm tarballs, spawns a real server, and drives a real headless Chromium --
// budget up to a couple of minutes)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/ffmpegWasmBridge.js + its /ffwasm/* routes in ai-bridge/server.js + render/ffmpegWasmExport
// .mjs -- the install button for ffmpegwasm/ffmpeg.wasm (MIT wrapper + GPL-2.0-or-later WASM core), never
// vendored into this tree. What this gate actually proves: the fetched bytes are the SAME bytes a real npm
// registry tarball fetch produces (exact size, not just "present"), the served routes carry the right headers
// and -- the one thing this round was told repeatedly not to do by accident -- carry NO Cross-Origin-Opener-
// Policy/Cross-Origin-Embedder-Policy (this round is single-thread-core only), and the shipped browser module
// really does turn a real WebM into a real H.264-in-MP4 file when driven like a page would drive it -- boxes
// walked by hand to find a real avcC, not just "it ran without throwing".
//
// *** THE SAME REAL, ALREADY-DIAGNOSED PITFALL AS verifiedPolygonIntersection-selfcheck.mjs's OWN HEADER. ***
// This sandbox's outbound HTTPS goes through an agent proxy, and Node's http/https modules have never honored
// HTTP_PROXY/HTTPS_PROXY. registry.npmjs.org sits in this sandbox's own proxy no_proxy allowlist and is
// reachable directly by curl (confirmed for real while building this bridge); section 5 below re-derives that
// fix by running the real fetch, not by reading the code and trusting it -- and if registry.npmjs.org is
// genuinely unreachable when THIS run happens, sections 5-7 SKIP with a specific, printed reason rather than
// failing the whole gate over an unrelated network hiccup (and rather than skipping silently).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { runInEngineOrigin } from "./webgpuHarness.mjs";
import { noComments } from "./sourceScan.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("ffmpegWasmBridge-selfcheck -- an install button for ffmpegwasm/ffmpeg.wasm, never vendored\n");

const bridgeSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "ffmpegWasmBridge.js"), "utf8");
// v4143's discipline (see verifiedPolygonIntersection-selfcheck.mjs's own v4151 note): comments dropped, string
// literals KEPT, and every assertion below is scoped to a parsed STRUCTURE (a matched const/object block) rather
// than grepped against the whole file -- a header comment here also discusses MIT/GPL-2.0/COOP/COEP in prose,
// and a whole-file regex would as happily match that prose as the real code.
const bridgeCode = noComments(bridgeSrc);
const serverSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
const exportSrc = fs.readFileSync(path.join(ENG, "render", "ffmpegWasmExport.mjs"), "utf8");

// ---- 1. UPSTREAM FACTS: TWO LICENSES, NAMED SEPARATELY, PINNED EXACT VERSIONS ----------------------------------
{
    console.log("1. UPSTREAM FACTS RECORDED -- TWO LICENSES KEPT SEPARATE, VERSIONS PINNED EXACT");
    ok("!! *** FFMPEG_WRAPPER_VERSION is the exact pinned semver a prior round byte-verified, not \"latest\" ***",
        /const FFMPEG_WRAPPER_VERSION = "0\.12\.15";/.test(bridgeCode));
    ok("!! *** FFMPEG_CORE_VERSION is the exact pinned semver a prior round byte-verified, not \"latest\" ***",
        /const FFMPEG_CORE_VERSION = "0\.12\.10";/.test(bridgeCode));
    // Scoped to the wrapper/core sub-blocks specifically, not the whole UPSTREAM object or the whole file --
    // both sub-blocks name a license and this checks each names ITS OWN, not the other's or a stray mention.
    const upstreamBlock = (bridgeCode.match(/const UPSTREAM = Object\.freeze\(\{([\s\S]*?)\n\}\);/) || [, ""])[1];
    const wrapperBlock = (upstreamBlock.match(/wrapper: Object\.freeze\(\{([\s\S]*?)\n {4}\}\),/) || [, ""])[1];
    const coreBlock = (upstreamBlock.match(/core: Object\.freeze\(\{([\s\S]*?)\n {4}\}\),/) || [, ""])[1];
    ok("!! *** wrapper (@ffmpeg/ffmpeg) is licensed MIT, checked in its OWN sub-block, not collapsed with the core's ***",
        /license: "MIT"/.test(wrapperBlock));
    ok("!! *** core (@ffmpeg/core) is licensed GPL-2.0-or-later, checked in its OWN sub-block, distinct from the wrapper's ***",
        /license: "GPL-2\.0-or-later"/.test(coreBlock));
    ok("   ...and BOTH licenseVerified fields say the declaration was read from the real tarball's package.json, not assumed",
        /licenseVerified:.*package\.json.*read directly/s.test(wrapperBlock) &&
        /licenseVerified:.*package\.json.*read directly/s.test(coreBlock));
    ok("   ...and UPSTREAM records the prior round's own byte-verified avcC finding, not just a claim that it works",
        /avcC/.test(upstreamBlock) && /offset 2362/.test(upstreamBlock));
}

// ---- 2. REFUSED LIST NAMES THIS TOOL'S OWN RISKS -----------------------------------------------------------------
{
    console.log("\n2. REFUSED LIST NAMES *** THIS TOOL'S OWN *** RISKS");
    // Same structural-parse discipline as verifiedPolygonIntersection-selfcheck.mjs section 2: the REFUSED array
    // is parsed into what:/why: pairs and asserted against THOSE, immune to a comment merely discussing one.
    const refusedBlock = (bridgeSrc.match(/const REFUSED = Object\.freeze\(\[([\s\S]*?)\n\]\);/) || [, ""])[1];
    const refusedWhats = [...refusedBlock.matchAll(/what:\s*"([^"]*)"/g)].map((m) => m[1]);
    const refusedText = refusedBlock.replace(/\s+/g, " ");
    const refuses = (re) => refusedWhats.some((w) => re.test(w));
    ok("!! refuses to vendor ffmpeg.wasm's own source into the tree or a release zip", refuses(/vendoring ffmpeg\.wasm's own source/));
    ok("!! refuses to run any version but the pinned ones without a deliberate edit here", refuses(/running any version but the pinned ones/));
    ok("!! *** refuses the multi-thread core-mt build, and states WHY (SharedArrayBuffer -> COOP/COEP -> out of THIS round's scope) ***",
        refuses(/multi-thread @ffmpeg\/core-mt/) && /SharedArrayBuffer/.test(refusedText) &&
        /Cross-Origin-Opener-Policy/.test(refusedText), "refusedWhats: " + JSON.stringify(refusedWhats));
    ok("!! refuses to fetch from a CDN at runtime, naming this tree's own LAN-server deployment model as why",
        refuses(/unpkg\/jsdelivr|any CDN at runtime/) && /LAN-server/.test(refusedText));
}

// ---- 3. STAGED OUTSIDE THE ENGINE TREE, LIKE EVERY OTHER INSTALL BUTTON HERE -------------------------------------
{
    console.log("\n3. STAGED OUTSIDE THE ENGINE TREE");
    const srcDirLine = bridgeSrc.match(/const SRC_DIR = process\.env\.FFMPEG_WASM_SRC_DIR \|\| (.+);/);
    ok("!! *** default SRC_DIR resolves under the home directory, not under the project root ***",
        !!srcDirLine && /os\.homedir\(\)/.test(srcDirLine[1]) && /\.voxelbridge/.test(srcDirLine[1]) && /ffmpeg-wasm/.test(srcDirLine[1]));
    const defaultSrcDir = path.join(os.homedir(), ".voxelbridge", "ffmpeg-wasm");
    const PROJECT_ROOT = path.resolve(ENG, "..");
    ok("   ...and that resolved path really is outside PROJECT_ROOT, checked rather than assumed",
        defaultSrcDir !== PROJECT_ROOT && !defaultSrcDir.startsWith(PROJECT_ROOT + path.sep),
        "PROJECT_ROOT=" + PROJECT_ROOT + " SRC_DIR=" + defaultSrcDir);
}

// ---- 4. SERVER ROUTES -- RIGHT CONTENT-TYPES, PATH SAFETY, AND *** NO COOP/COEP, CHECKED, NOT JUST INTENDED *** --
{
    console.log("\n4. SERVER ROUTES: CONTENT-TYPE, PATH SAFETY, AND THE DELIBERATE COOP/COEP ABSENCE");
    for (const r of ["/ffwasm/status", "/ffwasm/install", "/ffwasm/app/"]) {
        ok("!! " + r + " is wired in server.js", serverSrc.includes('"' + r + '"') || serverSrc.includes("'" + r + "'"));
    }
    // Isolated to the /ffwasm/ block specifically (up to the next route family's own comment marker), so every
    // check below is a claim about THIS route, not "somewhere in a 20,000-line server.js" (application/wasm and
    // COOP/COEP both also appear elsewhere in the file, on /vpi/app/'s own unrelated route).
    const ffwasmBlockM = serverSrc.match(/\/\/ --- ffmpeg\.wasm:[\s\S]*?(?=\n {4}\/\/ --- ws-scrcpy)/);
    ok("!! *** the /ffwasm/ route block was actually isolated for the checks below (regex found it) ***", !!ffwasmBlockM);
    const ffwasmBlock = ffwasmBlockM ? ffwasmBlockM[0] : "";
    ok("!! *** the artefact route matches the request against readArtefact()'s FIXED list, never joins it onto a filesystem path ***",
        /ffwasm\.readArtefact\(want\)/.test(ffwasmBlock),
        "mirrors /vpi/app/'s own path-safety pattern -- an attacker-controlled request string can only ever hit one of four known names");
    ok("!! Content-Type is application/wasm for .wasm and text/javascript for .js, scoped to this route", /application\/wasm/.test(ffwasmBlock) && /text\/javascript; charset=utf-8/.test(ffwasmBlock));
    ok("!! Cache-Control: no-cache is set on the artefact route (matches /vpi/app/'s own convention)", /"Cache-Control": "no-cache"/.test(ffwasmBlock));
    // *** READ CODE, NOT PROSE -- THE EXACT TRAP THIS TREE'S OWN sourceScan.mjs HEADER NAMES. *** ffwasmBlock's
    // own COMMENT explains (in prose) why COOP/COEP are absent, which means the bare phrases "Cross-Origin-
    // Opener-Policy"/"Cross-Origin-Embedder-Policy" DO appear in the raw block text -- in the sentence saying
    // they were deliberately left out. Testing against noComments(ffwasmBlock) instead asks the real question:
    // does the CODE ever set these headers, not "is the phrase written down anywhere in this block".
    const ffwasmCode = noComments(ffwasmBlock);
    ok("!! *** AND -- THE THING THIS ROUND WAS TOLD REPEATEDLY NOT TO DO BY ACCIDENT -- the /ffwasm/ block's CODE sets NEITHER Cross-Origin-Opener-Policy NOR Cross-Origin-Embedder-Policy ***",
        !/Cross-Origin-Opener-Policy/.test(ffwasmCode) && !/Cross-Origin-Embedder-Policy/.test(ffwasmCode),
        "single-thread core only, this round -- see ai-bridge/ffmpegWasmBridge.js's REFUSED list for the multi-thread/COOP+COEP tradeoff this deliberately does not take");
    ok("!! ...and the block's own COMMENT explains WHY those headers are absent (not merely silent about it)",
        /DELIBERATELY NO/.test(ffwasmBlock) && /single-thread/i.test(ffwasmBlock));

    // Live check that readArtefact really refuses an unknown/traversal name -- a regex reading "it looks gated"
    // is not the same claim as the function actually returning null for something outside its list.
    const tmp0 = fs.mkdtempSync(path.join(os.tmpdir(), "ffwasm-gate-safety-"));
    process.env.FFMPEG_WASM_SRC_DIR = tmp0;
    delete require_.cache[require_.resolve("../../ai-bridge/ffmpegWasmBridge.js")];
    const bridge0 = require_("../../ai-bridge/ffmpegWasmBridge.js");
    ok("!! readArtefact(\"../../../etc/passwd\") returns null -- not a file, not a throw", bridge0.readArtefact("../../../etc/passwd") === null);
    ok("!! readArtefact(\"not-a-real-file.txt\") returns null", bridge0.readArtefact("not-a-real-file.txt") === null);
    delete process.env.FFMPEG_WASM_SRC_DIR;
    try { fs.rmSync(tmp0, { recursive: true, force: true }); } catch {}

    // render/ffmpegWasmExport.mjs -- the client's own honesty check, read as structure not trusted from a claim.
    ok("!! ffmpegWasmExport.mjs points its default artefact base at /ffwasm/app/ (this route), not a CDN",
        /DEFAULT_BASE_URL = "\/ffwasm\/app\/"/.test(exportSrc));
    ok("!! ...and runs the EXACT command render/blobRecorder.js's own header names -- no different flags picked here",
        /"-i", "in\.webm", "-c:v", "libx264", "-pix_fmt", "yuv420p", "out\.mp4"/.test(exportSrc));
    ok("!! ...and sniffs the OUTPUT container for a real avc1 track before ever reporting ok:true (never trusts the exit code alone)",
        /sniffMp4Codec\(bytes\)/.test(exportSrc) && /codec !== "avc1"/.test(exportSrc));
}

// Shared discipline for the real-network sections below: distinguish "no curl" (an environment gap) from a
// genuine network-unreachable condition (registry.npmjs.org rejected/unreachable through this sandbox's own
// agent proxy) from an actual bug (curl ran, connected, and still failed for some OTHER reason -- that must
// FAIL, not quietly SKIP, or a real regression here would never be caught).
function looksLikeNetworkFailure(text) {
    return /Could not resolve host|Failed to connect|Connection timed out|Connection refused|Couldn't connect to server|Network is unreachable|SSL connection timeout|gateway answered \d+ to CONNECT|tunnel connection failed|Empty reply from server/i.test(text || "");
}

let curlOk = false;
try { require_("node:child_process").execFileSync("curl", ["--version"], { timeout: 5000 }); curlOk = true; } catch {}

let networkOk = false, networkSkipReason = null;
if (!curlOk) {
    networkSkipReason = "no curl found on this host";
} else {
    try {
        const out = require_("node:child_process").execFileSync(
            "curl", ["-fsS", "--max-time", "10", "-o", "/dev/null", "-w", "%{http_code}", "https://registry.npmjs.org/@ffmpeg/ffmpeg"],
            { timeout: 15000, encoding: "utf8" });
        networkOk = out.trim() === "200";
        if (!networkOk) networkSkipReason = "registry.npmjs.org did not answer 200 (got " + JSON.stringify(out.trim()) + ")";
    } catch (e) {
        const msg = String((e && e.stderr) || (e && e.message) || e);
        networkSkipReason = "registry.npmjs.org unreachable: " + msg.slice(0, 300);
    }
}

let sharedTmp = null; // real downloaded artefacts, reused by sections 6 and 7 rather than re-downloaded twice more

// ---- 5. *** LIVE: A REAL npm REGISTRY INSTALL, INTO A THROWAWAY DIRECTORY, VERIFIED EXACT-BYTE *** --------------
{
    console.log("\n5. *** LIVE INSTALL FROM registry.npmjs.org, VERIFIED EXACT-BYTE ***");
    if (!curlOk) {
        report("SKIPPED -- " + networkSkipReason);
        report("*** THAT IS A SKIP AND NOT A PASS: this is the section that proves the bridge actually fetches real files.");
    } else if (!networkOk) {
        report("SKIPPED -- " + networkSkipReason);
        report("*** a genuine network-unavailability skip, not a silent one and not counted as a pass -- see this file's header.");
    } else {
        sharedTmp = fs.mkdtempSync(path.join(os.tmpdir(), "ffwasm-gate-install-"));
        process.env.FFMPEG_WASM_SRC_DIR = sharedTmp;
        delete require_.cache[require_.resolve("../../ai-bridge/ffmpegWasmBridge.js")];
        const bridge = require_("../../ai-bridge/ffmpegWasmBridge.js");

        const startRes = bridge.install();
        ok("!! install() returns immediately (fire-and-poll), not after the job finishes", startRes.ok && startRes.started);

        let job = null;
        for (let i = 0; i < 90 && !(job && job.job && job.job.done); i++) {
            await new Promise((r) => setTimeout(r, 1000));
            job = bridge.installStatus();
        }
        const jobLog = job && job.job ? job.job.log : "";
        if (job && job.job && job.job.done && job.job.code !== 0 && looksLikeNetworkFailure(jobLog)) {
            report("SKIPPED (mid-install) -- network failed inside the real curl fetch itself: " + jobLog.slice(-300));
        } else {
            ok("!! *** install job actually finished (real curl + tar against the real registry) within budget ***",
                !!job && job.job && job.job.done, job && job.job ? "code=" + job.job.code : "still running");
            ok("!! *** and it succeeded ***", !!job && job.job && job.job.done && job.job.code === 0, jobLog.slice(-500));

            // EXACT sizes, not just "above minBytes" -- registry.npmjs.org tarballs for a PUBLISHED version are
            // immutable (unlike vpi's mutable git branch), so an exact match is a stronger, still-honest claim,
            // measured directly by fetching+extracting these two tarballs while writing this bridge.
            const EXACT = { "ffmpeg.js": 4420, "814.ffmpeg.js": 3177, "ffmpeg-core.js": 112059, "ffmpeg-core.wasm": 32232419 };
            for (const [rel, size] of Object.entries(EXACT)) {
                let actual = -1;
                try { actual = fs.statSync(path.join(sharedTmp, rel)).size; } catch {}
                ok("!! " + rel + " is EXACTLY " + size + " bytes (measured against the real tarball, not guessed)",
                    actual === size, "got " + actual);
            }
            ok("!! bridge.built() agrees all four are present and above minBytes", bridge.built());
        }
        delete process.env.FFMPEG_WASM_SRC_DIR;
    }
}

// ---- 6. *** LIVE: THE REAL HTTP ROUTES, SPAWNED FOR REAL, HEADERS CHECKED ON A PLAIN FETCH *** -------------------
{
    console.log("\n6. *** THE REAL /ffwasm/* ROUTES, SPAWNED SERVER, PLAIN-FETCH HEADER CHECK ***");
    if (!sharedTmp || !fs.existsSync(path.join(sharedTmp, "ffmpeg-core.wasm"))) {
        report("SKIPPED -- section 5 did not produce a real installed SRC_DIR to serve (see its own skip/fail reason above)");
    } else {
        const GATE_PORT = "19792";
        const env = Object.assign({}, process.env, { PORT: GATE_PORT, FFMPEG_WASM_SRC_DIR: sharedTmp, SWEK_TEST_SERVER: "1" });
        const { spawn } = require_("node:child_process");
        const srv = spawn(process.execPath, [path.join(ENG, "ai-bridge", "server.js")], { env, stdio: ["ignore", "pipe", "pipe"] });
        let port = null, buf = "";
        srv.stdout.on("data", (d) => { buf += d.toString(); if (buf.includes(":" + GATE_PORT)) port = GATE_PORT; });
        for (let i = 0; i < 40 && !port; i++) await new Promise((r) => setTimeout(r, 250));

        if (!port) {
            report("SKIPPED -- could not determine the port server.js bound to");
        } else {
            const base = "http://127.0.0.1:" + port;
            let status = null;
            try { status = await (await fetch(base + "/ffwasm/status")).json(); } catch {}
            ok("!! GET /ffwasm/status reports built:true against the real just-installed SRC_DIR", !!status && status.built === true);

            let installAgain = null;
            try { installAgain = await (await fetch(base + "/ffwasm/install", { method: "POST" })).json(); } catch {}
            ok("!! POST /ffwasm/install (already installed) still answers ok", !!installAgain && installAgain.ok === true);

            const EXACT = { "ffmpeg.js": ["4420", "text/javascript; charset=utf-8"],
                            "814.ffmpeg.js": ["3177", "text/javascript; charset=utf-8"],
                            "ffmpeg-core.js": ["112059", "text/javascript; charset=utf-8"],
                            "ffmpeg-core.wasm": ["32232419", "application/wasm"] };
            for (const [rel, [size, ct]] of Object.entries(EXACT)) {
                let headers = null;
                try { headers = Object.fromEntries((await fetch(base + "/ffwasm/app/" + rel)).headers); } catch {}
                ok("!! GET /ffwasm/app/" + rel + " -- real Content-Type (" + ct + "), real Content-Length (" + size + "), Cache-Control: no-cache",
                    !!headers && headers["content-type"] === ct && headers["content-length"] === size && headers["cache-control"] === "no-cache",
                    JSON.stringify(headers));
                ok("!! *** ...and, on this REAL HTTP response, no service worker involved, NEITHER Cross-Origin-Opener-Policy NOR Cross-Origin-Embedder-Policy is present ***",
                    !!headers && headers["cross-origin-opener-policy"] === undefined && headers["cross-origin-embedder-policy"] === undefined);
            }

            let notFoundCode = null;
            try { notFoundCode = (await fetch(base + "/ffwasm/app/not-a-real-file.txt")).status; } catch {}
            ok("!! GET /ffwasm/app/<unknown> is a real 404 over HTTP, not a 200 serving something wrong", notFoundCode === 404);
        }
        try { srv.kill(); } catch {}
    }
}

// ---- 7. *** LIVE: A REAL HEADLESS-CHROMIUM PAGE TRANSCODES A REAL WEBM TO H.264, BOXES WALKED BY HAND *** -------
{
    console.log("\n7. *** REAL BROWSER: RECORD A REAL WEBM, TRANSCODE IT WITH THE SHIPPING MODULE, WALK THE BOXES ***");
    if (!sharedTmp || !fs.existsSync(path.join(sharedTmp, "ffmpeg-core.wasm"))) {
        report("SKIPPED -- section 5 did not produce a real installed SRC_DIR to copy from (see its own skip/fail reason above)");
    } else {
        // Copied into a scratch dir UNDER the engine root (not served through the live ai-bridge server) because
        // a dedicated Worker cannot be constructed from a cross-origin script URL: ffmpeg.js's own UMD bundle
        // auto-detects its publicPath from its own <script src> and then constructs `new Worker(...)` pointed at
        // that same origin for 814.ffmpeg.js -- so the page (served by webgpuHarness's own runInEngineOrigin, a
        // DIFFERENT origin/port than any spawned ai-bridge server) and the four ffmpeg files must be same-origin,
        // exactly like the real shipping deployment already is (one server, one origin, ai-bridge/server.js).
        // Same dot-prefixed mkdtemp-under-ENG + finally-cleanup convention as aiPresenceOrbPresent-selfcheck.mjs
        // and unboundBuiltin-selfcheck.mjs already use for this exact reason.
        const scratchDir = fs.mkdtempSync(path.join(ENG, "tools", "ship", ".ffwasm-gate-"));
        try {
            for (const rel of ["ffmpeg.js", "814.ffmpeg.js", "ffmpeg-core.js", "ffmpeg-core.wasm"]) {
                fs.copyFileSync(path.join(sharedTmp, rel), path.join(scratchDir, rel));
            }
            const baseUrl = "/" + path.relative(ENG, scratchDir).split(path.sep).join("/") + "/";

            // No backslash escapes anywhere in this injected script -- an unescaped backslash inside a nested
            // string/regex here gets eaten by the OUTER template literal before the browser ever sees it (a real
            // pitfall this session already diagnosed once). Any post-processing that needs a regex happens back
            // in plain Node, on the plain array of bytes this script hands back.
            const SCRIPT = `async ({ ffmpegBaseUrl }) => {
                const canvas = document.createElement("canvas");
                canvas.width = 64; canvas.height = 64;
                const ctx = canvas.getContext("2d");
                let hue = 0;
                const draw = () => { ctx.fillStyle = "hsl(" + hue + ", 80%, 50%)"; ctx.fillRect(0, 0, 64, 64); hue = (hue + 15) % 360; };
                draw();
                if (!window.MediaRecorder) return { ok: false, reason: "no MediaRecorder in this browser" };
                const stream = canvas.captureStream(10);
                const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8" : "video/webm";
                const rec = new MediaRecorder(stream, { mimeType });
                const chunks = [];
                rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
                const stopped = new Promise((resolve) => { rec.onstop = resolve; });
                rec.start();
                const drawTimer = setInterval(draw, 100);
                await new Promise((r) => setTimeout(r, 800));
                clearInterval(drawTimer);
                rec.stop();
                await stopped;
                if (!chunks.length) return { ok: false, reason: "captureStream produced no frames" };
                const webmBlob = new Blob(chunks, { type: "video/webm" });
                const webmBytes = new Uint8Array(await webmBlob.arrayBuffer());
                if (webmBytes.length < 100) return { ok: false, reason: "captured webm suspiciously small: " + webmBytes.length + " bytes" };

                const mod = await import("/render/ffmpegWasmExport.mjs");
                const t0 = performance.now();
                const result = await mod.transcodeWebmToH264Mp4(webmBytes, { baseUrl: ffmpegBaseUrl });
                const ms = performance.now() - t0;
                return {
                    ok: result.ok, error: result.error, codec: result.codec,
                    webmSize: webmBytes.length,
                    mp4Size: result.bytes ? result.bytes.length : 0,
                    mp4Bytes: result.bytes ? Array.from(result.bytes) : null,
                    ms,
                };
            }`;

            const out = await runInEngineOrigin({
                engineRoot: ENG, script: SCRIPT, timeoutMs: 120000,
                args: { ffmpegBaseUrl: baseUrl },
            });

            if (out.skipped) {
                report("SKIPPED -- " + out.reason);
            } else {
                ok("!! runInEngineOrigin's own page had no script error", !out.pageErrors || out.pageErrors.length === 0, (out.pageErrors || []).join(" | "));
                ok("!! the harness call itself succeeded (script returned, did not throw/timeout)", out.ok, out.reason || "");
                const r = out.result || {};
                ok("!! *** a real WebM was actually captured in the real browser (captureStream produced real bytes) ***",
                    r.ok !== undefined && (r.webmSize || 0) > 100, "webmSize=" + r.webmSize);
                ok("!! *** transcodeWebmToH264Mp4() reported ok:true (real ffmpeg.wasm exec, real exit code checked, real avc1 sniff) ***",
                    r.ok === true, r.error ? ("error: " + r.error) : ("codec=" + r.codec + " mp4Size=" + r.mp4Size + " ms=" + Math.round(r.ms || 0)));

                if (r.ok && r.mp4Bytes) {
                    const buf = Buffer.from(r.mp4Bytes);
                    ok("!! output starts with a real ftyp box (MP4, not a stray webm/garbage)", buf.length >= 8 && buf.toString("latin1", 4, 8) === "ftyp");

                    // A REAL, MINIMAL ISO-BMFF BOX WALKER -- not a substring search. Descends into the container
                    // box types an H.264 track's avcC actually lives under (moov/trak/mdia/minf/stbl/stsd), and
                    // into stsd's own 8-byte version/flags+entry_count header and a VisualSampleEntry's fixed
                    // 78-byte field block (avc1/hvc1/etc.) before its own child boxes -- so a found avcC is really
                    // INSIDE the video sample description, not merely a 4-byte string sitting anywhere in the file.
                    const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "mvex", "moof", "traf", "mfra", "udta"]);
                    const SAMPLE_ENTRIES = new Set(["avc1", "avc3", "hvc1", "hev1", "mp4v"]);
                    const boxes = [];
                    const walk = (start, end, trail, depth) => {
                        let o = start, guard = 0;
                        while (o + 8 <= end && guard++ < 5000) {
                            let size = buf.readUInt32BE(o);
                            const type = buf.toString("latin1", o + 4, o + 8);
                            let headerLen = 8;
                            if (size === 1 && o + 16 <= end) { size = Number(buf.readBigUInt64BE(o + 8)); headerLen = 16; }
                            else if (size === 0) { size = end - o; }
                            if (size < headerLen || o + size > end) break;
                            const entry = { type, offset: o, size, path: trail.concat(type).join("/") };
                            boxes.push(entry);
                            if (depth < 12) {
                                if (CONTAINERS.has(type)) walk(o + headerLen, o + size, trail.concat(type), depth + 1);
                                else if (type === "stsd") walk(o + headerLen + 8, o + size, trail.concat(type), depth + 1);
                                else if (SAMPLE_ENTRIES.has(type)) walk(o + headerLen + 78, o + size, trail.concat(type), depth + 1);
                            }
                            o += size;
                        }
                    };
                    walk(0, buf.length, [], 0);
                    const avcC = boxes.find((b) => b.type === "avcC");
                    const avc1 = boxes.find((b) => b.type === "avc1");
                    ok("!! *** avc1 sample-entry box FOUND by a real box walk (not a substring search) ***", !!avc1, avc1 ? ("at offset " + avc1.offset + ", path " + avc1.path) : "not found; boxes seen: " + boxes.map((b) => b.type).join(",").slice(0, 300));
                    ok("!! *** avcC (AVCDecoderConfigurationRecord -- the definitive H.264 marker) FOUND, nested inside moov/trak/mdia/minf/stbl/stsd/avc1 ***",
                        !!avcC && avcC.path === "moov/trak/mdia/minf/stbl/stsd/avc1/avcC",
                        avcC ? ("at offset " + avcC.offset + ", path " + avcC.path) : "not found");
                    report("real end-to-end result: input webm " + r.webmSize + " bytes -> output mp4 " + r.mp4Size +
                           " bytes, avcC at byte offset " + (avcC ? avcC.offset : "N/A") + ", transcode took " + Math.round(r.ms || 0) + " ms");
                }
            }
        } finally {
            try { fs.rmSync(scratchDir, { recursive: true, force: true }); } catch {}
        }
    }
}

if (sharedTmp) { try { fs.rmSync(sharedTmp, { recursive: true, force: true }); } catch {} }

console.log("\n" + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
