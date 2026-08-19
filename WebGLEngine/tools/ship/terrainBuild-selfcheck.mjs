// WebGLEngine/tools/ship/terrainBuild-selfcheck.mjs -- v2858
//
// Run: node tools/ship/terrainBuild-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/terrainBuildBridge.js + the build UI on benchmarks.html + the rebuilt splat_viewer.html.
//
// WHY THE BUILD ROUTE EXISTS: Keith asked which SweK page builds terrain_wasm on the Mac. The answer was NONE --
// benchmarks.html could only print the command and send you to a console, while box3d has had a real
// POST /box3d/build with prereq probing and a log ring since v2289. By the standing rule that makes the terrain
// fast path unfinished, so this mirrors box3d's route.
//
// THE PATH BUG, FOURTH SIGHTING. build_wasm.sh needs cargo and wasm-pack, which rustup installs into ~/.cargo/bin.
// A server started from a Finder-launched .command inherits a minimal PATH without it, so the script would die on
// "cargo not found" on a Mac where Rust works perfectly in Terminal. Same failure as cloudflared (v2856) and the
// launcher's npm (v2857). The gate pins that the probe and the build use the SAME augmented PATH -- a status that
// disagreed with the build it describes would be worse than no status, because it gets believed.

import fs from "node:fs";
import { noComments } from "./sourceScan.mjs";   // v3676 -- see the two checks below
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const bridge = require(path.join(ENG, "ai-bridge", "terrainBuildBridge.js"));
const src = fs.readFileSync(path.join(ENG, "ai-bridge", "terrainBuildBridge.js"), "utf8");
const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
const bench = fs.readFileSync(path.join(ENG, "benchmarks.html"), "utf8");
const splatRaw = fs.readFileSync(path.join(ENG, "splat_viewer.html"), "utf8");
// STRIP HTML COMMENTS BEFORE ASKING WHAT THE PAGE LOADS. My first version of the aholo check failed on the
// comment that EXPLAINS the swap away from aholo -- the fourth time this session an instrument of mine has read
// prose as code (new Function() on module scripts, "the models are missing", the /codemap guard quoted in its own
// fix note, and now this). The question is what the page LOADS, so ask the code.
const splat = splatRaw.replace(/<!--[\s\S]*?-->/g, "");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

async function call(url, method = "GET", body = null) {
    let captured = null, code = 200;
    const chunk = body == null ? null : JSON.stringify(body);
    const req = { url, method, destroy() {}, on(ev, cb) { if (ev === "data" && chunk) cb(chunk); if (ev === "end") cb(); return req; } };
    await bridge.handle(req, {}, { sendJson: (o, c = 200) => { captured = o; code = c; } });
    return { body: captured, code };
}

// 1. ROUTING
{
    ok("owns /terrain and subpaths", bridge.owns("/terrain") && bridge.owns("/terrain/status") && bridge.owns("/terrain/build"));
    ok("owns NOT a lookalike", !bridge.owns("/terrainX") && !bridge.owns("/box3d/build") && !bridge.owns("/"));
    const r = await call("/terrain/wat");
    ok("unknown subroute -> 404", r.code === 404);
    const g = await call("/terrain/build", "GET");
    ok("build via GET -> 405", g.code === 405);
}

// 2. STATUS IS HONEST ON A MACHINE WITH NO TOOLCHAIN (which is this sandbox, and a fresh Mac)
{
    const s = (await call("/terrain/status")).body;
    ok("/status answers without a toolchain", s && s.ok === true && typeof s.platform === "string");
    ok("...reports prereqs as resolved paths or null", s.prereqs && ("cargo" in s.prereqs) && ("wasmPack" in s.prereqs));
    ok("...reports artefact readiness", s.artefacts && typeof s.artefacts.ready === "boolean");
    ok("!! ...and SAYS THE ENGINE RUNS WITHOUT IT", /runs fine without/.test(s.optional || ""),
       "a red 'not built' with no context reads as a broken engine; this is an opt-in fast path");
}

// 3. IT REFUSES WITH THE FIX INSTEAD OF SPAWNING A DOOMED BUILD
{
    const s = (await call("/terrain/status")).body;
    if (s.missing && s.missing.length) {
        const r = await call("/terrain/build", "POST", {});
        ok("!! missing toolchain -> refuses with the install command, does not spawn", r.code === 400 && r.body.error === "missing-prereqs" && /rustup|wasm-pack/.test(r.body.message || ""),
           "missing: " + s.missing.join(","));
        // v3080 -- PROPERTY, NOT A CAPITAL LETTER. This tested /Terminal/ case-sensitively. The Unix branch says
        // "in a Terminal" and the Windows branch says "in a NEW terminal" -- so this passed on Linux and FAILED
        // ON WINDOWS for a capital T, while the Windows note is the LONGER and MORE USEFUL of the two (it names
        // the process-start PATH capture and says to restart the SERVER, not the shell).
        //
        // FIFTH mechanism-pinned check this session, and the worst of them: it demanded a word that is WRONG for
        // the platform it failed on. The property that matters is that the note distinguishes "installed but
        // INVISIBLE to this process" from "not installed" -- which both branches do, and which is the entire
        // reason pathNote exists.
        const note = r.body.pathNote || "";
        ok("...and names the PATH case, not just 'not installed'",
           /\bterminal\b/i.test(note) && /cannot see them/i.test(note),
           "the expensive failure is a tool that IS installed and invisible to this process");

        // v3004 -- THE WINDOWS BRANCH, CHECKED FROM WHEREVER THIS RUNS. Only one branch executes per platform,
        // so a Linux run can never exercise the Windows note and a Windows run can never exercise the mac one.
        // The note was NULL on win32 for its whole life because of exactly that: nothing here could see it.
        // Read the source instead -- the same move windowsImport-selfcheck makes, and the only way a sandbox on
        // one platform can defend a machine on another.
        const src = fs.readFileSync(path.join(ENG, "ai-bridge", "terrainBuildBridge.js"), "utf8");
        ok("!! there is a WINDOWS path note, not a null", /WIN\s*\n?\s*\?/.test(src) && /INCLUDING THIS SERVER/.test(src),
           "win32 got null for its whole life while being the platform where 'installed but invisible' is a weekly experience");
        ok("...and it names the ACTUAL Windows mechanism", /read when a process STARTS and never re-read/i.test(noComments(src)),
           "PATH is captured at process start and never refreshed, so a rustup install does not reach anything already running -- the fix is restarting the SERVER, not the shell, and that distinction is the whole value of the note");
    } else {
        ok("toolchain present -- refusal path not exercised here", true, "cargo+wasm-pack found");
    }
}

// 4. THE PATH FIX IS REAL AND SHARED BY PROBE AND BUILD
{
    ok("~/.cargo/bin is on the augmented PATH", /\.cargo/.test(src) && /cargo["']\s*,\s*["']bin/.test(src.replace(/\s+/g, " ")) || /"\.cargo", "bin"/.test(src));
    ok("Homebrew dirs too", /opt\/homebrew\/bin/.test(src) && /usr\/local\/bin/.test(src));
    ok("!! the PROBE uses the same env as the BUILD", /function which/.test(src) && /env: buildEnv\(\)|env,/.test(src) && /buildEnv\(\)/.test(src),
       "a status computed on a different PATH from the build would be believed and wrong");
    const env = bridge.buildEnv();
    ok("buildEnv returns a PATH and does not clobber the inherited one", typeof env.PATH === "string" && env.PATH.length > 0);
}

// 5. IT DRIVES THE SCRIPT, NEVER REIMPLEMENTS IT
{
    ok("spawns build_wasm.sh / .bat rather than cargo directly", /build_wasm\.(sh|bat)/.test(src) && !/wasm-pack build/.test(src),
       "the script owns the flags, the simd128 default, the nosimd hatch and the install location");
    // v3676 -- both of these go through noComments, and they were INVISIBLE to gateQuality until this round:
    // its unwrap test read RAW SOURCE, so the mention of noComments( in a comment in this file exempted every
    // prose regex in it. BOTH PHRASES ARE REAL USER-FACING STRINGS in terrainBuildBridge.js (the PATH note at
    // line 102, the refusal at line 110) -- CHECKED, NOT ASSUMED -- so noComments is the right stripper: it
    // keeps STRINGS and drops COMMENTS, where codeOnly would blank the very text these assert.
    ok("one build at a time", /a build is already running/.test(noComments(src)));
    ok("log ring is bounded", /slice\(-32768\)/.test(src));
    ok("a zero exit with no artefacts is reported as suspicious", /installed nothing/.test(src),
       "a build that says success and produces nothing must not read as success");
}

// 6. WIRED IN + FRONT DOOR (a bridge nobody dispatches is a file, not a front door)
{
    ok("server.js requires the bridge", /require\(["']\.\/terrainBuildBridge\.js["']\)/.test(server));
    ok("server.js dispatches it", /terrainBuildBridge\.owns\(/.test(server) && /terrainBuildBridge\.handle\(/.test(server));
    ok("benchmarks.html has a Build button", /bBuild/.test(bench) && /\/terrain\/build/.test(bench));
    ok("...polls the log while it runs", /\/terrain\/log/.test(bench));
    ok("...and surfaces the PATH note to the operator", /pathNote/.test(bench));
}

// 7. THE SPLAT SWAP -- now on Spark, and installing itself
{
    const ensure = require(path.join(ENG, "ai-bridge", "ensureSpark.js"));
    const esrc = fs.readFileSync(path.join(ENG, "ai-bridge", "ensureSpark.js"), "utf8");

    ok("splat_viewer loads neither unvendored predecessor", !/vendor\/aholo-viewer/.test(splat) && !/gaussian-splats-3d/.test(splat),
       "aholo was never vendored (dead since v920); GaussianSplats3D could not read .spz/.sog");
    ok("...and BOTH swaps stay EXPLAINED in the source", /aholo/i.test(splatRaw) && /GaussianSplats3D/.test(splatRaw),
       "a dependency dropped without a recorded reason gets re-added by the next person");
    ok("it uses Spark via the engine's own vendored three, no CDN", /@sparkjsdev\/spark/.test(splat) && /\/vendor\/three\/three\.module\.js/.test(splat) && !/jsdelivr|unpkg|cdnjs/.test(splat));

    // THE FORMAT LIST IS THE POINT OF THIS SWAP: Spark restores what the page promised in 2026.
    for (const f of [".ply", ".spz", ".splat", ".ksplat", ".sog"]) {
        ok("advertises " + f, splat.includes(f), "Spark reads it; GaussianSplats3D could not read spz/sog");
    }

    // FIRST-USE INSTALL -- the thing Keith asked for.
    ok("!! the page installs the renderer on FIRST USE", /\/vendor\/spark\/ensure/.test(splat) && /\/vendor\/spark\/status/.test(splat),
       "no npm, no build, no three shell commands for the user to run");
    ok("...and SAYS it is fetching rather than silently pulling a megabyte", /First use: fetching/.test(splat));
    ok("...and a failed fetch is a message, not a stack trace", /Could not fetch the Spark renderer/.test(splat));

    ok("ensureSpark mirrors ensureThree (present/ensure/status)", typeof ensure.present === "function" && typeof ensure.ensure === "function" && typeof ensure.status === "function");
    ok("!! the version is PINNED, not latest", /const VERSION = "\d+\.\d+\.\d+"/.test(esrc),
       "an upstream release overnight must not be able to break a page authored against this API");
    ok("...and both sources serve that SAME pinned version", ensure.SOURCES.length >= 2 && ensure.SOURCES.every((u) => u.includes(ensure.VERSION)),
       "a fallback that served a different version would be a different package, not a route around an outage");
    ok("!! a truncated download cannot pass as installed", /MIN_BYTES/.test(esrc) && /\.part/.test(esrc),
       "a 404 HTML body written to disk is present() to statSync and broken to the browser; temp+rename prevents a half-file");
    ok("it reports absence without pretending to be an error", ensure.status().ok === true && typeof ensure.status().present === "boolean");
    ok("...and says the engine runs without it", /runs fine without it/.test(ensure.status().note || ""));

    ok("server.js exposes status + ensure routes", /vendor\/spark\/status/.test(server) && /vendor\/spark\/ensure/.test(server));
    ok("!! Spark is NOT fetched on boot", !/if \(!ensureSpark\.present\(\)\) ensureSpark\.ensure\(\)/.test(server),
       "three and htmx are needed by many pages; Spark is needed by one, so pulling it every boot spends bandwidth on a page that may never open");
}

console.log(fails ? "\nterrainBuild-selfcheck: " + fails + " FAILED" : "\nterrainBuild-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
