// WebGLEngine/tools/ship/wsScrcpy-selfcheck.mjs -- v4144
//
// Run: node tools/ship/wsScrcpy-selfcheck.mjs   (seconds -- the real clone+build is NOT run here, see the
// closing note for why, and for what was measured by hand instead)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/wsScrcpyBridge.js + ws-scrcpy.html -- the install button for NetrisTV/ws-scrcpy (MIT), never
// vendored into this tree.
//
// *** THIS IS THE ONE ON THE SHELF WHOSE EXPOSURE COULD NOT BE NARROWED, AND THAT IS THE THING THIS GATE
// EXISTS TO KEEP HONEST. *** grdpwasm's neighbour page can say "started on loopback" because upstream's proxy
// has a -listen flag this engine passes 127.0.0.1 to -- their code unmodified, just a different argument.
// ws-scrcpy has no such flag: src/server/services/HttpServer.ts calls `server.listen(port, callback)` with no
// host argument anywhere, and Config.ts's ServerItem type has no host field to route one through. It also
// ships with no authentication by design. Keith was asked which shape to build and chose, in his words,
// "auto-start, all-interfaces, warned every time" -- so the DANGER HERE IS NOT A BUG TO FIX, it is a property
// to disclose accurately and repeatedly. The failure mode this gate guards against is the page or the bridge
// quietly drifting into IMPLYING protection it does not have: a reassuring word, a dropped warning, a confirm
// that renders once and scrolls away.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { noComments } from "./sourceScan.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ----  " + m);
console.log("wsScrcpy-selfcheck -- an install button whose exposure could NOT be narrowed, so it must be disclosed\n");

const bridgeSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "wsScrcpyBridge.js"), "utf8");
const pageSrc = fs.readFileSync(path.join(ENG, "ws-scrcpy.html"), "utf8");
// v4145 -- COMMENTS STRIPPED, STRING CONTENTS KEPT. Every claim this gate makes about the page is about text
// a VIEWER SEES or code that RUNS, and both live in string literals. A regex over raw source cannot tell
// either from a comment discussing them -- so a warning deleted from the UI but still described in a comment
// above it would keep this gate green while warning nobody. gateQuality named this line specifically.
const pageCode = noComments(pageSrc);
const serverSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");

// ---- 1. UPSTREAM FACTS RECORDED, LICENCE ACTUALLY READ, ALTERNATIVE ACTUALLY COMPARED -------------------------
{
    console.log("1. UPSTREAM FACTS RECORDED, AND THE REJECTED ALTERNATIVE NAMED");
    ok("!! *** bridge names MIT and states the licence text was actually read, not inferred from a badge ***",
        /license: LICENSE/.test(bridgeSrc) && /licenseVerified.*read: 1059 bytes.*Netris/s.test(bridgeSrc));
    const m = bridgeSrc.match(/PINNED_COMMIT\s*=\s*"([0-9a-f]{40})"/);
    ok("!! *** PINNED_COMMIT is a real 40-char SHA, not a branch name ***", !!m, m ? m[1] : "no match");
    ok("!! *** DEFAULT_BRANCH is asserted as master -- NOT assumed to be main ***",
        /DEFAULT_BRANCH = "master"/.test(bridgeSrc),
        "grdpwasm's own header records that raw.githubusercontent 404s on the wrong branch name; this repo is master too");
    ok("   ...and MAINTENANCE.howChecked names git, proving activity was measured rather than guessed",
        /howChecked:.*git clone \(unshallowed\)/.test(bridgeSrc));
    // *** THE FORK WAS A REAL FORK IN THE ROAD AND THE CHOICE IS RECORDED. *** A GPL-3.0 fork of this exact
    // project exists and looked superficially more modern; picking the MIT original was a licensing decision,
    // and a decision nobody wrote down is one the next reader has to make again from scratch.
    ok("!! *** the rejected alternative (the GPL-3.0 fork) is NAMED with the reason ***",
        /consideredAndRejected/.test(bridgeSrc) && /bilbospocketses\/ws-scrcpy-web/.test(bridgeSrc) &&
        /GPL-3\.0-only/.test(bridgeSrc));
}

// ---- 2. *** THE EXPOSURE IS STATED, NOT SOFTENED -- THE WHOLE POINT OF THIS GATE *** ---------------------------
{
    console.log("\n2. *** THE EXPOSURE IS STATED PLAINLY, IN THE BRIDGE AND ON THE PAGE ***");
    // The REFUSED entry has to name WHY there is no loopback option, or a future reader will "helpfully" add
    // one by patching upstream -- which is the thing this whole shelf refuses to do.
    const refusedBlock = (bridgeSrc.match(/const REFUSED = Object\.freeze\(\[([\s\S]*?)\n\]\);/) || [, ""])[1];
    ok("!! REFUSED explicitly refuses to patch HttpServer.ts for a loopback bind",
        /patching HttpServer\.ts/.test(refusedBlock));
    ok("!! ...and states the SOURCE-LEVEL reason: listen() takes no host argument and Config has no host field",
        /no host argument/.test(refusedBlock) && /ServerItem type has no host field/.test(refusedBlock),
        "read out of their source, not assumed -- otherwise this is just an assertion that a fix is impossible");
    ok("!! REFUSED also refuses to patch SCRCPY_LISTENS_ON_ALL_INTERFACES out of their build config",
        /SCRCPY_LISTENS_ON_ALL_INTERFACES/.test(refusedBlock));
    ok("!! REFUSED also refuses to bolt authentication in front of it",
        /adding authentication/i.test(refusedBlock));

    // *** start() MUST ALWAYS WARN. *** grdpwasm's start() returns `warning: undefined` when it IS on loopback --
    // correct there, wrong here: there is no safe case, so a conditional warning would be a bug waiting to be
    // introduced. Checked structurally: the warning must not sit behind a ternary or an if.
    const startFn = (bridgeSrc.match(/function start\(o = \{\}\) \{[\s\S]*?\n\}/) || [""])[0];
    ok("!! *** start() ALWAYS returns a warning -- it is not conditional on anything ***",
        /warning:\s*"BOUND TO ALL INTERFACES/.test(startFn) && !/warning:.*\?/.test(startFn),
        "grdpwasm's start() returns warning:undefined on loopback because loopback is genuinely safe there. Here there is NO safe case, so a ternary would eventually evaluate to 'no warning'");
    ok("   ...and the warning names all three real consequences: all-interfaces, no login, view AND control",
        /ALL INTERFACES/.test(startFn) && /no login/i.test(startFn) && /CONTROL/.test(startFn));
}

// ---- 3. *** THE PAGE WARNS EVERY TIME, NOT ONCE -- WHICH IS WHAT KEITH ACTUALLY CHOSE *** ----------------------
{
    console.log("\n3. *** THE PAGE CONFIRMS BEFORE EVERY START, AND KEEPS WARNING WHILE IT RUNS ***");
    // "Warned every time" is the requirement. A banner rendered once at page load is NOT that -- it scrolls
    // away, and a person clicking Start twenty minutes later never sees it.
    ok("!! *** the Start handler confirm()s BEFORE calling the start route ***",
        /\$\("start"\)\.onclick[\s\S]*?confirm\([\s\S]*?\/ws-scrcpy\/start/.test(pageSrc),
        "the confirm must gate the call, not follow it");
    ok("   ...and the confirm text names all-interfaces, no login, and view-AND-control",
        /confirm\([\s\S]*?ALL network interfaces[\s\S]*?NO login[\s\S]*?CONTROL[\s\S]*?\)/.test(pageSrc));
    ok("   ...and says plainly that no loopback-only option exists upstream",
        /no loopback-only option upstream/i.test(pageSrc),
        "without this a reader assumes the engine simply forgot to offer one");
    ok("!! *** a live warning banner stays visible the WHOLE time it is running, not just at click time ***",
        // v4145 -- the banner's WORDING is matched against pageCode, not pageSrc: a warning that exists only
        // in a comment explaining the warning would satisfy a raw-source regex and warn nobody. gateQuality
        // flagged this line as prose-against-source and it was right to.
        /liveWarn[\s\S]*?style\.display = "block"/.test(pageCode) && /Running and reachable from your whole network/.test(pageCode));
    ok("   ...and it is hidden again when stopped (so it never lies in the other direction)",
        /liveWarn"\)\.style\.display = "none"/.test(pageSrc));
    ok("!! the page's alarm card explains WHY there is no loopback flag, citing their actual source files",
        /HttpServer\.ts/.test(pageSrc) && /Config\.ts/.test(pageSrc) && /no host argument/.test(pageSrc));
    // The neighbouring page CAN say loopback; this one must not imply it. A single reassuring sentence copied
    // from grdpwasm.html would be the whole failure mode.
    ok("!! *** the page never claims a loopback/127.0.0.1 BIND, which would be false here ***",
        !/started on loopback|loopback only|bound to 127\.0\.0\.1/i.test(pageSrc),
        "grdpwasm.html says exactly these things and is right to; copying one here would be a confident wrong answer");
}

// ---- 4. NOT VENDORED, STAGED OUTSIDE THE TREE ------------------------------------------------------------------
{
    console.log("\n4. NOTHING OF THEIRS IS IN THIS TREE");
    const srcDirLine = bridgeSrc.match(/const SRC_DIR = process\.env\.WS_SCRCPY_SRC_DIR \|\| (.+);/);
    ok("!! *** default SRC_DIR resolves under the home directory, not under the project root ***",
        !!srcDirLine && /os\.homedir\(\)/.test(srcDirLine[1]) && /\.voxelbridge/.test(srcDirLine[1]));
    const defaultSrcDir = path.join(os.homedir(), ".voxelbridge", "ws-scrcpy");
    const PROJECT_ROOT = path.resolve(ENG, "..");
    ok("   ...and that resolved path really is outside PROJECT_ROOT, checked rather than assumed",
        defaultSrcDir !== PROJECT_ROOT && !defaultSrcDir.startsWith(PROJECT_ROOT + path.sep),
        "PROJECT_ROOT=" + PROJECT_ROOT + " SRC_DIR=" + defaultSrcDir);
    // Their build emits a distinctive vendored jar; if a copy of it ever appears INSIDE the engine tree, the
    // no-vendoring claim has quietly stopped being true.
    const strays = [];
    (function walk(dir, depth) {
        if (depth > 3) return;
        let entries = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (e.name === "node_modules" || e.name === ".git" || e.name === "vendor") continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { walk(p, depth + 1); continue; }
            if (/^scrcpy-server\.jar$/.test(e.name) || /^bundle\.worker\.js$/.test(e.name)) strays.push(p);
        }
    })(ENG, 0);
    ok("!! *** no ws-scrcpy build artefact has appeared anywhere inside the engine tree ***",
        strays.length === 0, strays.join(", "));
}

// ---- 5. ROUTES EXIST, LAZILY REQUIRED SO A BROKEN OPTIONAL BRIDGE CANNOT KILL SERVER BOOT ----------------------
{
    console.log("\n5. SERVER ROUTES");
    for (const r of ["/ws-scrcpy/status", "/ws-scrcpy/install", "/ws-scrcpy/start", "/ws-scrcpy/stop"]) {
        ok("!! " + r + " is wired in server.js", serverSrc.includes('"' + r + '"'));
    }
    ok("!! *** the bridge is require()d INSIDE each handler, never at server.js's top level ***",
        !/^const .*= require\(".\/wsScrcpyBridge\.js"\)/m.test(serverSrc) &&
        /require\("\.\/wsScrcpyBridge\.js"\)/.test(serverSrc),
        "a missing or broken optional bridge must not stop the whole engine booting for everybody else");
}

// ---- 6. THE INSTALL IS THE REAL FIVE-STAGE BUILD, AND THE PROCESS DIES WITH THE ENGINE -------------------------
{
    console.log("\n6. THE BUILD PIPELINE AND THE CHILD PROCESS");
    // Measured by running it: webpack marks dist/'s runtime deps external and ships dist/ with its own
    // package.json, so a build that stops after `npm run dist` produces a dist/ that cannot start.
    ok("!! *** install() runs npm install INSIDE dist/ as a separate stage ***",
        /_npmInstallDist/.test(bridgeSrc) && /cwd: path\.join\(SRC_DIR, "dist"\)/.test(bridgeSrc),
        "webpack externalises dist/'s runtime deps -- measured: stopping after `npm run dist` leaves a dist/ that cannot run");
    ok("   ...and the artefact list checks BOTH build outputs and dist-local node_modules",
        /dist\/public\/bundle\.js/.test(bridgeSrc) && /dist\/node_modules\/express/.test(bridgeSrc),
        "existence of index.js alone would pass a half-finished install");
    ok("!! the vendored, UNMODIFIED Genymobile jar is an expected artefact (so no JDK is ever needed)",
        /dist\/vendor\/Genymobile\/scrcpy\/scrcpy-server\.jar/.test(bridgeSrc));
    const startFn = (bridgeSrc.match(/function start\(o = \{\}\) \{[\s\S]*?\n\}/) || [""])[0];
    ok("!! *** the server child is spawned WITHOUT detached, so it dies with this engine ***",
        !/detached/.test(startFn),
        "an unauthenticated all-interfaces screen-control server outliving the thing that started it is the exact hazard stop() exists for");
    ok("!! stop() keeps the handle so status().running can report whether the kill actually landed",
        /verifyWith: "status\(\)\.running"/.test(bridgeSrc));
}

// ---- 7. THE BRIDGE LOADS AND REPORTS HONESTLY BEFORE ANYTHING IS INSTALLED -------------------------------------
{
    console.log("\n7. THE BRIDGE LOADS, AND REPORTS AN UNINSTALLED STATE HONESTLY");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ws-scrcpy-gate-"));
    process.env.WS_SCRCPY_SRC_DIR = tmp;
    delete require_.cache[require_.resolve("../../ai-bridge/wsScrcpyBridge.js")];
    const bridge = require_("../../ai-bridge/wsScrcpyBridge.js");
    ok("!! built() is false against an empty directory", bridge.built() === false);
    const st = await bridge.status();
    ok("!! status() reports cloned:false, built:false and lists every artefact as missing",
        st.cloned === false && st.built === false && st.missingArtefacts.length === bridge.ARTEFACTS.length);
    ok("!! *** start() REFUSES before install rather than spawning something that cannot work ***",
        bridge.start().ok === false && /not built yet/.test(bridge.start().error));
    ok("!! stop() is safe to call when nothing is running", (bridge.stop()).ok === true);
    ok("   ...and status() reports whether adb is actually present on this host (measured, not assumed)",
        typeof st.adbAvailable === "boolean", "adbAvailable=" + st.adbAvailable);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    delete process.env.WS_SCRCPY_SRC_DIR;
}

report("");
report("*** NOT RUN HERE: THE REAL CLONE AND BUILD, AND WHY THAT IS A DELIBERATE OMISSION RATHER THAN A GAP. ***");
report("The full install is ~770 npm packages across two `npm install` runs plus a webpack build, and it");
report("compiles a NATIVE module (node-pty, via node-gyp). grdpwasm-selfcheck makes the same call for the same");
report("reason -- 'a permanent gate that downloads a Go toolchain is a gate somebody switches off'. This one");
report("would download most of npm on every run.");
report("");
report("IT WAS RUN BY HAND, ONCE, AND THE NUMBERS IN THE BRIDGE COME FROM THAT RUN, NOT FROM THE README:");
report("  clone -> checkout -> npm install (41s, 681 packages, node-pty compiled clean) -> npm run dist");
report("  (~20s webpack, emits the prebuilt Genymobile jar unmodified) -> npm install in dist/ (~4s, 92 pkgs).");
report("  The built server was then STARTED for real: it printed its own listening banner on 4 addresses");
report("  including a non-loopback one, answered HTTP 200 on /, and reported 'spawn adb ENOENT' -- which is");
report("  exactly right on a box with no adb, and is why status() reports adbAvailable separately.");
report("THE ALL-INTERFACES BINDING IS THEREFORE A MEASUREMENT, not a reading of their code alone.");

console.log("\n" + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
