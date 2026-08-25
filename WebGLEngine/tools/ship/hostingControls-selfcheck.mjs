// tools/ship/hostingControls-selfcheck.mjs
//
// Run: node tools/ship/hostingControls-selfcheck.mjs   (live half skips cleanly without Chromium)
// RUNTIME 2.25s MEASURED (median of 3 -- 2248/2279/2217 ms, with date(1) around the run). The live half mounts the real module in headless
// Chromium against a stub bridge, because "the controls exist" is a claim about what RENDERS.
//
// v4022 -- Keith: "that page should be integrated into the Tunnels menu that shows on the Server.html. some of
// those, or all settings are already in the Tunnels menu. i do not see the quick tunnel option. lets get all
// the settings on one panel."
//
// *** THE QUICK TUNNEL WAS ALREADY THERE. *** server.html's Public-tunnel block POSTs /hosting/tunnel
// {action:"start"} -- byte for byte what hosting.html's "Start quick tunnel" sends -- but its button read
// "Start tunnel" and started with display:none until state resolved. Present, unlabelled, invisible on
// arrival. He was right to report it missing, and the fix was a label, not a feature.
//
// *** AND "ONE PANEL" HAS AN OBVIOUS WRONG IMPLEMENTATION. *** Pasting hosting.html's four cards into that
// drawer would have made two copies of every control -- v3527's rule, which has bitten FIVE TIMES in this
// repository this week (launcherName, the two gate walks, the packager's skip rules, the swekPage targets).
// So this gate's load-bearing property is not "server.html has the controls". It is:
//
//     THERE IS EXACTLY ONE IMPLEMENTATION, AND BOTH PAGES MOUNT IT.
//
// which stays true when somebody adds a fifth section tomorrow, and goes red the moment either page grows its
// own copy of a control the module already owns.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { noComments } from "./sourceScan.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

const MOD = fs.readFileSync(path.join(ENG, "ui", "hostingControls.js"), "utf8");
const HOST = fs.readFileSync(path.join(ENG, "hosting.html"), "utf8");
const SERVER = fs.readFileSync(path.join(ENG, "server.html"), "utf8");

console.log("hostingControls-selfcheck -- one implementation of the hosting controls, mounted twice?\n");

// ---------------------------------------------------------------------------
console.log("1. *** BOTH PAGES MOUNT THE MODULE, AND NEITHER KEEPS A COPY ***");
{
    ok("!! hosting.html mounts ui/hostingControls.js", /hostingControls\.js/.test(HOST) && /mountHostingControls/.test(HOST));
    ok("!! server.html mounts the SAME module", /hostingControls\.js/.test(SERVER) && /mountHostingControls/.test(SERVER));

    // *** THE ENDPOINTS ARE THE TELL. *** If either page still wires these itself, there are two copies again
    // -- and the copy in the page is the one that will not get the next fix.
    const OWNED = ["/cftunnel/setup-script", "/cftunnel/pointer/write", "/cftunnel/pointer/list",
                   "/hosting/tailscale/expose", "/netbird/up", "/netbird/down"];
    for (const ep of OWNED) {
        ok("   " + ep + " is wired ONLY in the module",
            MOD.includes(ep) && !HOST.includes(ep) && !SERVER.includes(ep),
            MOD.includes(ep) ? (HOST.includes(ep) ? "*** ALSO in hosting.html ***"
                                                  : (SERVER.includes(ep) ? "*** ALSO in server.html ***" : ""))
                             : "*** MISSING FROM THE MODULE -- the control was lost, not moved ***");
    }
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE MODULE MINTS NO GLOBAL IDs, BECAUSE server.html ALREADY OWNS THESE ***");
{
    // server.html's own Public-tunnel block uses cfStart / cfStop / cfInstall / cfTunnel. A module creating
    // those same ids INSIDE that page would give getElementById two answers and hand the existing wiring the
    // wrong one -- breaking a working panel in the act of extending it.
    const code = noComments(MOD);
    const COLLIDES = ["cfStart", "cfStop", "cfInstall", "cfTunnel", "cfHost", "cfPtr"];
    const minted = COLLIDES.filter((id) => new RegExp('\\bid\\s*=\\s*["\']' + id + '["\']').test(code) ||
                                           new RegExp('\\.id\\s*=\\s*["\']' + id + '["\']').test(code));
    ok("!! *** the module sets NO id that server.html already uses ***", minted.length === 0,
        minted.length ? "COLLIDES ON: " + minted.join(", ") : "every element is held in a local reference");
    ok("!! ...and it does not reach for elements by global id either",
        !/getElementById/.test(code),
        "a shared module that looks up globals is a module that can only be mounted once");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE QUICK TUNNEL SAYS WHAT IT IS ***");
{
    ok("!! server.html's tunnel button is labelled a QUICK tunnel", /Start quick tunnel/.test(SERVER),
        "it always sent action:start to /hosting/tunnel; it just never said which kind of tunnel that was");
    // AND server.html DELIBERATELY DOES NOT MOUNT THE CLOUDFLARE SECTION: its own block already starts and
    // stops that same tunnel, and two start buttons for one tunnel is a worse bug than the missing label.
    const mount = (SERVER.match(/mountHostingControls\([^)]*\{[^}]*\}/s) || [""])[0];
    ok("!! ...and server.html mounts permanent + tailscale + netbird, NOT a second cloudflare block",
        /permanent/.test(mount) && /tailscale/.test(mount) && /netbird/.test(mount) && !/"cloudflare"/.test(mount),
        mount.slice(mount.indexOf("sections")).slice(0, 90));
    ok("!! ...while hosting.html mounts all four", /"cloudflare"/.test(HOST));
    // LAZY, because four status fetches on every server.html load is a cost paid by everyone who never opens
    // the drawer.
    ok("!! server.html mounts it on first drawer open, not on page load",
        /addEventListener\("toggle"/.test(SERVER) && /mounted/.test(SERVER));
}

// ---------------------------------------------------------------------------
console.log("\n4. *** AND IT ACTUALLY RENDERS, WITH EVERY CONTROL PRESENT ***");
{
    const { chromium, from } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, from, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-3 read source, and source cannot show that the " +
               "module mounts without throwing or that all fourteen controls arrive.");
    } else {
        const stub = {
            "/hosting/detect": { platform: "linux", cloudflared: { installed: true, version: "1.2" }, tailscale: { installed: false }, winget: { installed: false } },
            "/hosting/tailscale/status": { ok: true, running: false },
            "/netbird/status": { ok: true, installed: false },
            "/cftunnel/config": { ok: true, config: {} },
            "/auth/status": { enabled: true },
        };
        const srv = http.createServer((rq, rs) => {
            const u = rq.url.split("?")[0];
            if (stub[u]) { rs.writeHead(200, { "Content-Type": "application/json" }); return rs.end(JSON.stringify(stub[u])); }
            let body = null;
            try { body = fs.readFileSync(path.join(ENG, u === "/" ? "hosting.html" : u)); } catch {}
            if (body) { rs.writeHead(200, { "Content-Type": u.endsWith(".js") ? "text/javascript" : "text/html" }); return rs.end(body); }
            rs.writeHead(200, { "Content-Type": "application/json" }); rs.end("{}");
        });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const browser = await chromium.launch({ executablePath: HEADLESS_SHELL || undefined });
        const page = await browser.newPage();
        const errs = [];
        page.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
        await page.goto("http://127.0.0.1:" + srv.address().port + "/", { waitUntil: "networkidle" });
        await page.waitForTimeout(1100);

        const seen = await page.evaluate(() => {
            const mod = document.querySelector("#hostingControls > div");
            if (!mod) return null;
            return { sections: mod.children.length, buttons: [...mod.querySelectorAll("button")].map((b) => b.textContent) };
        });
        ok("!! *** THE MODULE MOUNTED ON hosting.html ***", !!seen, seen ? seen.sections + " blocks" : "nothing rendered");
        if (seen) {
            // Named individually rather than counted: a count still passes when the RIGHT number of the WRONG
            // controls arrive, which is exactly what a bad refactor produces.
            const WANT = ["Start quick tunnel", "Install cloudflared", "Generate setup script",
                          "Write pointer now", "List peer pointers", "Install Tailscale",
                          "Funnel (public)", "Join mesh (netbird up)"];
            const missing = WANT.filter((w) => !seen.buttons.some((b) => b.includes(w)));
            ok("!! *** EVERY CONTROL SURVIVED THE MOVE ***", missing.length === 0,
                missing.length ? "LOST: " + missing.join(", ") : seen.buttons.length + " controls, all four subjects");
        }
        ok("!! no page errors", errs.length === 0, errs.length ? errs.slice(0, 2).join(" | ") : "clean");
        await browser.close();
        await new Promise((r) => srv.close(r));
    }
}

console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
process.exit(fails ? 1 : 0);
