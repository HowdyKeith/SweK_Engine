// WebGLEngine/tools/ship/tunnelSpawn-selfcheck.mjs -- v2856
//
// Run: node tools/ship/tunnelSpawn-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/hostingBridge.js's cloudflared spawn path + server.html's tunnel panel.
//
// THE BUG THIS EXISTS FOR (Keith, on the Mac): click "Public tunnel" -> Start, and the panel flips straight to
// "no tunnel running". Two independent defects, and the second is the one that hid the first:
//
//   1. THE BINARY WAS NEVER FOUND. Windows spawns through a shell, so a PATH alias resolves. Everywhere else we
//      spawned the bare name "cloudflared" with shell:false, which resolves against THIS PROCESS'S PATH. A macOS
//      server launched with nohup/disown inherits a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin) with no
//      /opt/homebrew/bin -- which is exactly where `brew install cloudflared` puts it on Apple Silicon. The tool
//      is installed, works in Terminal, and is invisible to the server.
//
//   2. THE FAILURE REPORTED SUCCESS. spawn() does NOT throw on a missing binary -- it emits 'error' on the next
//      tick. So the try/catch never fired, tunnelStart set running:true and returned {ok:true, started:true} for
//      a process that never existed, then the async error flipped running:false. The page polled 1.5s later and
//      printed the generic "no tunnel running". THE ENOENT WAS IN THE LOG AND NOTHING CARRIED IT TO THE SCREEN.
//
// A control that reports success on a failure is worse than one that fails loudly -- it spends the user's time
// on the wrong hypothesis. This gate pins both halves, and it must run on Linux/macOS/Windows alike, so it never
// requires cloudflared to actually be present.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const BRIDGE = path.join(ENG, "ai-bridge", "hostingBridge.js");
const src = fs.readFileSync(BRIDGE, "utf8");
const html = fs.readFileSync(path.join(ENG, "server.html"), "utf8");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE LOOKUP: Homebrew's directories are actually searched ---------------------------------------------
{
    ok("Apple Silicon Homebrew bin is in the search list", /\/opt\/homebrew\/bin/.test(src),
       "the single most common place cloudflared lives on a modern Mac");
    ok("Intel Homebrew / usual bins are too", /\/usr\/local\/bin/.test(src) && /\/usr\/bin/.test(src));
    ok("a login shell is the last resort for non-standard prefixes", /-lc/.test(src) && /command -v/.test(src),
       "sh -lc sources the profile that puts Homebrew on PATH in the first place");
    ok("resolveBin exists and the spawn path uses it", /function resolveBin/.test(src) && /resolveBin\("cloudflared"\)/.test(src));
    ok("...and detection uses it too, so the panel and the button agree",
       /runProc\(resolveBin\(bin\)/.test(src),
       "a Start that resolves differently from the Detect beside it would contradict itself on screen");
}

// ---- 2. IT MUST NEVER BE WORSE THAN BEFORE ---------------------------------------------------------------------
{
    const bridge = require(BRIDGE);
    // resolveBin is internal; exercise it through the public surface instead. detect() must not throw or hang on
    // a machine where none of these tools exist -- which is this sandbox, and is also a fresh Mac.
    const d = await bridge.detect();
    ok("detect() answers on a machine with none of the tools installed", d && d.ok === true && typeof d.platform === "string",
       "platform=" + (d && d.platform));
    ok("...and reports cloudflared as a SHAPED object, not a bare truthy value",
       d.cloudflared && typeof d.cloudflared.installed === "boolean",
       "installed=" + (d.cloudflared && d.cloudflared.installed));
    // Windows behaviour is unchanged: still shelled, still the one-string command.
    ok("Windows keeps its shell path (unchanged)", /WIN \? "cloudflared" : resolveBin/.test(src) && /shell: WIN/.test(src));
}

// ---- 3. THE HONEST FAILURE: a spawn error becomes a REASON, not a shrug ----------------------------------------
{
    ok("the async 'error' handler sets a reason", /proc\.on\("error"[\s\S]{0,400}?_tunnel\.reason =/.test(src));
    ok("ENOENT is named and explains the PATH case", /ENOENT/.test(src) && /brew install cloudflared/.test(src) && /nohup/.test(src),
       "the message must distinguish 'not installed' from 'installed but invisible to this process'");
    ok("EACCES is distinguished from missing", /EACCES/.test(src));
    ok("a non-zero exit with no URL also produces a reason", /exited with code/.test(src));
    ok("tunnelStatus carries reason + resolved bin to the page", /reason: _tunnel\.reason/.test(src) && /bin: _tunnel\.bin/.test(src));
    // The idle case must still be an idle case -- a fresh status has no reason to report.
    const bridge = require(BRIDGE);
    const st = bridge.tunnelStatus();
    ok("a never-started tunnel reports running:false with NO invented reason", st.ok === true && st.running === false && !st.reason,
       "an idle panel must not accuse anything");
}

// ---- 4. THE PAGE: it renders the reason, and the dead truthiness test is gone -----------------------------------
{
    ok("the page renders st.reason when a start failed", /st\.reason/.test(html) && /could not start/.test(html));
    ok("!! the dead `!d.cloudflared` object test is GONE", !/if\(!d\.cloudflared\)\{/.test(html),
       "detect() returns an OBJECT, so that condition was ALWAYS false and the install hint had never once fired");
    ok("...replaced by the field that means what the name implies", /d\.cloudflared\.installed/.test(html));
    ok("the mac guidance reaches the screen, not just the source", /brew install cloudflared/.test(html));
    ok("the generic message survives for the genuinely idle case", /no tunnel running/.test(html),
       "a tunnel that was never started should still say so plainly");
}

// ---- 5. and the page still parses -------------------------------------------------------------------------------
{
    // This edit touched an inline script in server.html, and a broken one takes EVERY panel down, not just the
    // tunnel. So it must be checked -- but NOT by a parser written here.
    //
    // I WROTE ONE FIRST AND IT WAS WRONG, which is the whole reason this comment exists. `new Function(src)`
    // reported 5 of server.html's 29 inline scripts broken -- in the UNMODIFIED file as well as the edited one.
    // They are type="module" scripts, and new Function() cannot parse an `import` statement by construction. My
    // check was wrong, the page was fine, and a gate that cries wolf on a healthy tree gets ignored, which is the
    // lesson the browser-safety regex and the 169-file graveyard detector both already taught.
    //
    // The tree ALREADY has the right parser: tools/ship/pageParse.mjs, run under --experimental-vm-modules so
    // module scripts parse as modules. verify.mjs shells to it. So does this -- one parser, one verdict, and no
    // chance of this gate disagreeing with the ship gate about whether the console page is broken.
    const { execFileSync } = await import("node:child_process");
    let out = "", ranOk = true;
    try {
        out = execFileSync(process.execPath, ["--experimental-vm-modules", "tools/ship/pageParse.mjs"],
                           { cwd: ENG, encoding: "utf8", timeout: 180000, stdio: ["ignore", "pipe", "ignore"] });
    } catch (e) { ranOk = false; out = String((e && e.stdout) || (e && e.message) || ""); }
    const m = out.match(/pageParse: (\d+) inline scripts in (\d+) pages parse/);
    ok("every inline script parses (via the engine's OWN parser, not one written here)", ranOk && !!m,
       m ? m[1] + " scripts in " + m[2] + " pages" : out.slice(-160).trim());
}

console.log(fails ? "\ntunnelSpawn-selfcheck: " + fails + " FAILED" : "\ntunnelSpawn-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
