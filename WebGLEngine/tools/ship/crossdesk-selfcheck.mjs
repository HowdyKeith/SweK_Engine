// WebGLEngine/tools/ship/crossdesk-selfcheck.mjs -- v2980
//
// Run: node tools/ship/crossdesk-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/crossdeskBridge.js + its panel -- a SECOND remote-desktop option, added BESIDE RustDesk.
//
// THE RULE THIS GATE EXISTS FOR: ADDING AN OPTION MUST NOT REMOVE ONE. Keith asked for CrossDesk in addition,
// explicitly not instead of, and the easy failure is a "second option" that quietly takes over a shared config
// file, a shared port or a shared button. So the two are asserted independent: separate prefix, separate config
// path, and RustDesk's own surface still present and untouched.
//
// AND THE FLOOR CHECK IS THE REASON THE BRIDGE IS MORE THAN A LAUNCH BUTTON. CrossDesk documents HIGHER minimum
// OS versions than RustDesk -- macOS 14 on Apple Silicon, 15 on Intel, Windows 10 64-bit, Ubuntu 22.04. An older
// Mac is exactly the machine you find that out on, after installing, configuring, and failing to connect. The
// bridge reports it up front, and where it genuinely cannot tell -- a non-Ubuntu Linux, whose kernel version says
// nothing about the distro -- it returns NULL rather than guessing. An unknown reported as a pass is the whole
// failure mode.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const cd = require(path.join(ENG, "ai-bridge", "crossdeskBridge.js"));
const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
const html = fs.readFileSync(path.join(ENG, "server.html"), "utf8");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

async function call(url, method = "GET") {
    let body = null, code = 200;
    const req = { url, method, destroy() {}, on(ev, cb) { if (ev === "end") cb(); return req; } };
    await cd.handle(req, {}, { sendJson: (o, c = 200) => { body = o; code = c; } });
    return { body, code };
}

// ---- 1. IT IS AN ADDITION, NOT A REPLACEMENT ---------------------------------------------------------------------
{
    ok("!! RustDesk's bridge is still required by the server", /require\("\.\/rustdeskBridge\.js"\)/.test(server),
       "adding an option must not remove one");
    ok("!! ...and its panel is still on the page", /data-tab="rustdesk"/.test(html) && /data-panel="rustdesk"/.test(html));
    ok("CrossDesk is a separate tab beside it", /data-tab="crossdesk"/.test(html) && /data-panel="crossdesk"/.test(html));
    ok("!! the two use DIFFERENT config files", !cd.DEFAULTS.hasOwnProperty("idServer") && /crossdesk\.json/.test(
        fs.readFileSync(path.join(ENG, "ai-bridge", "crossdeskBridge.js"), "utf8")),
       "a shared config would let either one clobber the other's servers");
    ok("...and different route prefixes", cd.owns("/crossdesk/status") && !cd.owns("/rustdesk/status"));
}

// ---- 2. THE PLATFORM FLOOR, WHICH IS THE POINT ---------------------------------------------------------------------
{
    const f = cd.PLATFORM_FLOOR;
    ok("the documented floor is recorded as DATA", !!(f.win32 && f.darwin && f.linux), "not prose in a comment");
    ok("!! ...with its SOURCE named", /README|system-requirements/i.test(f.source || ""),
       "a version requirement with no provenance is a number someone remembered");
    ok("macOS splits Apple Silicon from Intel", f.darwin.appleSilicon === 14 && f.darwin.intel === 15,
       "14 on Apple Silicon, 15 on Intel -- they genuinely differ and conflating them would mislabel half the Macs");

    const p = cd.platformCheck();
    ok("platformCheck answers for this machine", p && ("meets" in p) && (p.detail || "").length > 10, p.detail);
    ok("!! ...and returns NULL where it cannot tell, rather than guessing",
       [true, false, null].includes(p.meets) && (process.platform !== "linux" || p.meets === null),
       "on Linux the floor is a DISTRO version and the kernel does not tell you it -- an unknown reported as a pass is the failure this exists to prevent");
}

// ---- 3. STATUS SAYS WHAT IT DOES AND DOES NOT COVER -------------------------------------------------------------------
{
    const s = (await call("/crossdesk/status")).body;
    ok("/status answers", s && s.ok === true);
    ok("...reporting install state and the floor", typeof s.installed === "boolean" && "platformOk" in s);
    ok("!! ...and states what it does NOT provide", /Android or iOS/i.test(s.vsRustDesk || ""),
       "control FROM a phone, not INTO one -- the gap that is the reason RustDesk stays");
    ok("...and what it uniquely adds", /web client/i.test(s.vsRustDesk || ""));
    ok("unknown subroute -> 404", (await call("/crossdesk/nope")).code === 404);
    ok("launch via GET -> 405", (await call("/crossdesk/launch", "GET")).code === 405);
}

// ---- 4. THE WEB CLIENT NEEDS NO BINARY, which is the capability being added -------------------------------------------
{
    const w = (await call("/crossdesk/web")).body;
    ok("!! the web client is reachable without any local install", w.ok && /^https?:\/\//.test(w.url || ""), w.url);
    ok("...and says why that matters", /nothing installed/i.test(w.note || ""));
    // With no binary present, launch must refuse with a fix rather than throwing.
    if (!cd.crossdeskBin()) {
        const r = cd.launch();
        ok("!! launching without a binary refuses with the fix", r.ok === false && /Install|build/i.test(r.message || ""),
           "and it says RustDesk is unaffected, because a failed second option must not read as a broken first one");
        ok("...and names RustDesk as still available", /RustDesk is unaffected/i.test(r.message || ""));
    } else {
        ok("a binary is present, so the refusal path is not exercised here", true);
    }
}

// ---- 5. NO INVENTED URI SCHEME ---------------------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "crossdeskBridge.js"), "utf8")
        .replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    ok("!! it does NOT invent a crossdesk:// URI", !/crossdesk:\/\//.test(src),
       "RustDesk documents rustdesk://; CrossDesk documents no scheme, and inventing one would be a link that silently does nothing");
}

// ---- 6. wired in ------------------------------------------------------------------------------------------------------
{
    ok("server.js requires and dispatches it", /require\("\.\/crossdeskBridge\.js"\)/.test(server) && /crossdeskBridge\.owns\(/.test(server));
    ok("the panel shows the floor before the buttons", html.indexOf('id="cdPlat"') < html.indexOf('id="cdLaunch"'),
       "a requirement stated after the action is a requirement nobody reads");
}

console.log(fails ? "\ncrossdesk-selfcheck: " + fails + " FAILED" : "\ncrossdesk-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
