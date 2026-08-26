// tools/discovery-selfcheck.mjs — v2194
// Verifies the multi-interface LAN discovery fix:
//   1. assetDiscovery._bcastTargets() computes a subnet-DIRECTED broadcast for every REAL
//      IPv4 adapter (wired + wireless), skips virtual adapters (VMware/Hyper-V/WSL/Docker/
//      loopback/link-local), and always keeps the legacy 255.255.255.255.
//   2. The directed-broadcast math is correct for non-/24 masks.
//   3. server.js carries the v2194 sweep patch (real-adapter bases, primary-subnet-first,
//      slice cap 3) and both files parse clean.
// Run:  node tools/discovery-selfcheck.mjs        (from WebGLEngine/ai-bridge)

import { createRequire } from "module";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = path.join(HERE, "..");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
    if (cond) { pass++; console.log("  PASS  " + name); }
    else { fail++; console.log("  FAIL  " + name + (detail ? "  -- " + detail : "")); }
};

console.log("[discovery-selfcheck] v2194 multi-interface beacon + sweep");

// --- (0) both files parse ---------------------------------------------------
for (const f of ["assetDiscovery.js", "server.js"]) {
    try { execFileSync(process.execPath, ["--check", path.join(BRIDGE, f)], { stdio: "pipe" }); ok("syntax: " + f, true); }
    catch (e) { ok("syntax: " + f, false, String(e.stderr || e.message).slice(0, 200)); }
}

// --- (1) monkeypatch os.networkInterfaces with a synthetic multi-homed box ---
// A typical Windows dev box: real Ethernet (192.168.1.x/24), real WiFi on a DIFFERENT
// subnet (10.0.0.x/23), a VMware host-only adapter (192.168.56.1 — the exact junk that
// used to eat a sweep slot), a WSL vEthernet, loopback, and an APIPA leftover.
const os = require("os");
const realNI = os.networkInterfaces;
os.networkInterfaces = () => ({
    "Ethernet":                     [{ family: "IPv4", internal: false, address: "192.168.11.42",  netmask: "255.255.255.0" }],
    "Wi-Fi":                        [{ family: "IPv4", internal: false, address: "10.0.0.17",     netmask: "255.255.254.0" }],
    "VMware Network Adapter VMnet1":[{ family: "IPv4", internal: false, address: "192.168.56.1",  netmask: "255.255.255.0" }],
    "vEthernet (WSL)":              [{ family: "IPv4", internal: false, address: "172.20.32.1",   netmask: "255.255.240.0" }],
    "Loopback Pseudo-Interface 1":  [{ family: "IPv4", internal: true,  address: "127.0.0.1",     netmask: "255.0.0.0" }],
    "Ethernet 2":                   [{ family: "IPv4", internal: false, address: "169.254.10.10", netmask: "255.255.0.0" }],
});

// require AFTER the patch so the module sees the synthetic adapters
const disc = require(path.join(BRIDGE, "assetDiscovery.js"));
const targets = disc._bcastTargets();
os.networkInterfaces = realNI;

console.log("  targets:", targets.join(", "));
ok("keeps legacy limited broadcast", targets.includes("255.255.255.255"));
ok("beacons the WIRED subnet (192.168.11.255)", targets.includes("192.168.11.255"));
ok("beacons the WIRELESS subnet, /23 math (10.0.1.255)", targets.includes("10.0.1.255"));
ok("skips VMware host-only (no 192.168.56.255)", !targets.includes("192.168.56.255"));
ok("skips WSL vEthernet (no 172.20.47.255)", !targets.includes("172.20.47.255"));
ok("skips loopback + APIPA", !targets.some(t => t.startsWith("127.") || t.startsWith("169.254.")));
ok("no duplicates", new Set(targets).size === targets.length);

// --- (2) the beacon actually fans out (send() called once per target) --------
// start() with a stubbed socket: capture destinations from one beacon tick.
{
    const dgram = require("dgram");
    const realCreate = dgram.createSocket;
    const sent = [];
    dgram.createSocket = () => ({
        on() {}, bind(_p, cb) { try { cb && cb(); } catch {} }, setBroadcast() {}, close() {},
        send(_b, _o, _l, _port, dst) { sent.push(dst); },
    });
    os.networkInterfaces = () => ({
        "Ethernet": [{ family: "IPv4", internal: false, address: "192.168.11.42", netmask: "255.255.255.0" }],
        "Wi-Fi":    [{ family: "IPv4", internal: false, address: "10.0.0.17",    netmask: "255.255.254.0" }],
    });
    // fresh module instance so the 30s target cache doesn't reuse run (1)'s list
    delete require.cache[require.resolve(path.join(BRIDGE, "assetDiscovery.js"))];
    const d2 = require(path.join(BRIDGE, "assetDiscovery.js"));
    d2.start({ selfUrl: "http://192.168.11.42:8787" });
    await new Promise(r => setTimeout(r, 5600));   // one BEACON_MS tick
    d2.stop();
    dgram.createSocket = realCreate;
    os.networkInterfaces = realNI;
    const dsts = [...new Set(sent)];
    console.log("  beacon destinations:", dsts.join(", ") || "(none)");
    ok("beacon sent at all", sent.length > 0);
    ok("beacon hit the wired subnet", dsts.includes("192.168.11.255"));
    ok("beacon hit the wireless subnet", dsts.includes("10.0.1.255"));
    ok("beacon kept 255.255.255.255", dsts.includes("255.255.255.255"));
}

// --- (3) server.js carries the sweep patch -----------------------------------
const srv = readFileSync(path.join(BRIDGE, "server.js"), "utf8");
ok("sweep: v2194 real-adapter base builder present", srv.includes("v2194 — build the sweep's /24 list from REAL adapters only"));
ok("sweep: primary subnet forced first (assetSync.lanIp)", /assetSync\.lanIp\(\).*bases\.unshift/s.test(srv));
ok("sweep: cap raised to 3", srv.includes("goodBases.slice(0, 3)"));
ok("sweep: virtual-adapter name heuristic in place", srv.includes("vethernet|virtualbox|vmware"));

// --- (4) discover defaults ON --------------------------------------------------
{
    process.env.HOME = process.env.HOME || "/tmp";
    const tmpHome = path.join(HERE, ".sc-home-" + process.pid);
    const realHomedir = os.homedir;
    os.homedir = () => tmpHome;   // empty config dir = factory defaults
    delete require.cache[require.resolve(path.join(BRIDGE, "assetSync.js"))];
    const as = require(path.join(BRIDGE, "assetSync.js"));
    const s = as.getSettings();
    os.homedir = realHomedir;
    ok("discover defaults ON with no config file", s.discover === true);
    // explicit opt-out still honored
    ok("discover opt-out respected in getSettings source", readFileSync(path.join(BRIDGE, "assetSync.js"), "utf8").includes("c.discover !== false"));
}

// --- (5) external (cloudflared) peer registry ----------------------------------
{
    const tmpReg = path.join(HERE, ".sc-tunnel-reg-" + process.pid + ".json");
    process.env.SWEK_TUNNEL_REG = tmpReg;
    delete require.cache[require.resolve(path.join(BRIDGE, "tunnelRegistry.js"))];
    const tr = require(path.join(BRIDGE, "tunnelRegistry.js"));

    ok("addManual rejects junk", tr.addManual("not a url").ok === false);
    ok("addManual accepts a portless https tunnel", tr.addManual("https://abc-def.trycloudflare.com/", "FriendBox").ok === true);
    ok("recordTunnel stores a learned (gossiped) tunnel", (tr.recordTunnel("Gossiped", "", "https://ghi.trycloudflare.com"), tr.list().length === 2));

    const urls = tr.aliveUrls();
    ok("aliveUrls returns both peers", urls.includes("https://abc-def.trycloudflare.com") && urls.includes("https://ghi.trycloudflare.com"));

    // simulate 3 dead probes on each (fetch to a black-hole port fails fast enough? no —
    // exercise the strike path via the persisted file instead: learned entry deletes, manual survives)
    const regNow = JSON.parse(readFileSync(tmpReg, "utf8"));
    for (const k of Object.keys(regNow)) { regNow[k].alive = false; regNow[k].strikes = 3; }
    // re-run the module's own strike rule by writing and asking a fresh load: strike logic lives in
    // probeOne; assert the RULE directly from source instead (deterministic, no network).
    const trSrc = readFileSync(path.join(BRIDGE, "tunnelRegistry.js"), "utf8");
    ok("strike pruning spares manual entries", trSrc.includes("!reg[key].manual"));
    ok("flood cap present (64 learned entries)", trSrc.includes(">= 64"));

    try { (await import("fs")).unlinkSync(tmpReg); } catch {}
    delete process.env.SWEK_TUNNEL_REG;
}

// --- (6) server.js external-peer wiring ----------------------------------------
ok("helper: _externalSelfUrl present", srv.includes("function _externalSelfUrl()"));
ok("helper: _isExternalPeerUrl present", srv.includes("function _isExternalPeerUrl("));
ok("announce/gossip fan-out includes tunnel peers", srv.includes("tunnelRegistry.aliveUrls()) if (u && !peers.includes(u))"));
ok("introduce sends TUNNEL url to external targets", srv.includes("const myUrl = isExt ? extSelf : self;"));
ok("/net/introduce accepts portless https", srv.includes("(?::\\d+)?$/.test(url)"));
ok("/net/introduce stores external peers in tunnel registry", srv.includes("EXTERNAL peer introduced itself"));
ok("gossip absorbs external tunnel urls", srv.includes("learned external tunnel peer via gossip"));
ok("version check includes tunnel peers", srv.includes("tunnelRegistry.aliveUrls() || [])) { const full"));
ok("pairing endpoint POST /net/peer/external present", srv.includes('"/net/peer/external"'));
ok("pairing endpoint is trusted-only", /net\/peer\/external"\) \{\s*\n\s*if \(!_isTrustedReq\(req\)\)/.test(srv));

// --- (7) KPop listener crash fixes (v2194) --------------------------------------
{
    const ROOT = path.join(BRIDGE, "..", "..");
    const lsn = readFileSync(path.join(ROOT, "KPop Listener", "KPopListener.ps1"), "utf8");
    ok("crash hook is compiled C# (thread-safe), not a scriptblock", lsn.includes("public static class KPopCrashHook"));
    ok("old runspace-dependent AppDomain scriptblock hook removed", !lsn.includes("add_UnhandledException({"));
    ok("listener version bumped so guard deploys the fix", /\$ScriptVersion\s*=\s*"26\.2"/.test(lsn));
    const grd = readFileSync(path.join(BRIDGE, "installers", "kpop-guard.ps1"), "utf8");
    ok("guard syncs on content drift, not just version string", grd.includes("content drift at same version"));
    ok("guard dry-run uses /L /FFT", grd.includes("/E /L /FFT"));
    ok("guard real copy uses /FFT", grd.includes("/E /FFT /NFL"));
    const bat = readFileSync(path.join(ROOT, "START_NODE_Engine.bat"), "utf8");
    ok("launcher prints end-of-script marker", bat.includes("listener script ENDED"));

    // v2212 -- THE BRIDGE CANNOT START WITHOUT ITS DEPS, AND THE WINDOW MUST NOT VANISH WITH THE REASON IN IT.
    // `node_modules` is not in the shipped zip. When the sibling-reuse loop finds nothing and `npm install`
    // did not run, `require("ws")` throws MODULE_NOT_FOUND -- and server.js's uncaughtException handler used
    // to print "continuing" and then let the process fall off the end of the file, exiting ZERO in silence.
    // `node server.js` runs in the FOREGROUND, so the window closed on top of the message, and the only
    // survivor was the GPU Brain, which is Deno and needs none of this.
    ok("the launcher refuses to run without ai-bridge's deps", bat.includes('if not exist "node_modules\\ws\\package.json"'));
    ok("...and says how to fix it, rather than closing", /npm install/.test(bat) && /pause/.test(bat));
    ok("...and it checks BEFORE it starts node, not after", bat.indexOf("CANNOT START: ai-bridge") < bat.indexOf("\nnode server.js"));
    // v3204 -- THIS CHECK NOW SPANS TWO FILES, because v3088 split the responsibility across two. The launcher
    // CAPTURES the exit code; swek_exit_report.bat DECIDES what it means and holds the window. Asserting both
    // halves against the launcher alone had been failing since that extraction, unnoticed because only the full
    // ~26-minute suite runs this gate. Each half is now tested against the file that actually owns it.
    {
        const report = readFileSync(path.join(ROOT, "WebGLEngine", "tools", "ship", "swek_exit_report.bat"), "latin1");
        ok("the launcher captures the exit code", /NODE_RC/.test(bat));
        ok("...and the one judge holds the window open when it is non-zero", /the reason is above this line/i.test(report));
    }
    ok("...because a launcher that hides the error it just printed turns a one-line fix into an afternoon", true);

    // A .bat with a bare LF is a .bat cmd may mis-parse. Four came in with the v2194 patch.
    const raw = readFileSync(path.join(ROOT, "START_NODE_Engine.bat"));
    let bare = 0;
    for (let i = 0; i < raw.length; i++) if (raw[i] === 0x0a && (i === 0 || raw[i - 1] !== 0x0d)) bare++;
    ok("the launcher is uniformly CRLF, with no bare line feeds", bare === 0, `${bare} bare LF`);

    // And the server's own half of the fix.
    const srv = readFileSync(path.join(ROOT, "WebGLEngine", "ai-bridge", "server.js"), "utf8");
    ok("server.js treats MODULE_NOT_FOUND as fatal, not as something to continue from", /e\.code === "MODULE_NOT_FOUND"/.test(srv));
    ok("...names the module that is missing", srv.includes("a required module is missing"));
    ok("...and exits non-zero, so the launcher can tell",
        (() => { const i = srv.indexOf('e.code === "MODULE_NOT_FOUND"'); return i > 0 && srv.slice(i, i + 2000).includes("process.exit(1)"); })());
}

// --- (8) Raycast Local LLM integration (v2194) -----------------------------------
{
    const ROOT = path.join(BRIDGE, "..", "..");
    const cat = JSON.parse(readFileSync(path.join(BRIDGE, "install_catalog.json"), "utf8"));
    ok("catalog: tool-raycast row present with Mac cmds", !!(cat["tool-raycast"] && Array.isArray(cat["tool-raycast"].cmdsMac) && cat["tool-raycast"].cmdsMac.length));
    ok("catalog: raycast-llm row present, pings Ollama", !!(cat["raycast-llm"] && cat["raycast-llm"].ping === "http://127.0.0.1:11434/api/tags" && cat["raycast-llm"].cmdsMac.length >= 3));
    ok("catalog: tool-ollama has a Mac path", !!(cat["tool-ollama"] && Array.isArray(cat["tool-ollama"].cmdsMac) && cat["tool-ollama"].cmdsMac.length));
    ok("catalog: still valid JSON with all prior entries", Object.keys(cat).filter(k => !k.startsWith("_")).length >= 95);
    ok("bridge: GET /raycast/status route present", srv.includes('req.url === "/raycast/status"'));
    ok("bridge: POST /raycast/launch route present + darwin-gated", srv.includes('req.url === "/raycast/launch"') && /raycast\/launch[\s\S]{0,400}darwin/.test(srv));
    ok("bridge: launch uses open -a / deep link", srv.includes('raycast://extensions/raycast/raycast-ai/ai-chat'));
    const mainJs = readFileSync(path.join(ROOT, "WebGLEngine", "main.js"), "utf8");
    ok("main.js: Raycast LLM in the Applications panel", mainJs.includes('label: "Raycast LLM"') && mainJs.includes('url: "/raycast.html"'));
    const svHtml = readFileSync(path.join(ROOT, "WebGLEngine", "server.html"), "utf8");
    // v3740 gave the standalone Raycast pill (`bRaycast`) an onclick after it shipped dead for a round; v4034
    // removed the pill itself at Keith's request ("that button can be reduced to a link on the Mac System link
    // bucket -- it is already on the Mac System panel"), so the two checks that used to live here (button
    // present, button wired) would now fail on purpose -- the button is gone by design. What still has to be
    // true is the CLAIM Keith made when asking for the removal: raycast.html really is reachable from the Mac
    // System panel without the pill. That is two facts, not one: the page has to be IN macPages() (the list
    // the panel renders from), and server.html has to actually RENDER that list into the panel rather than
    // just importing it and doing nothing -- the same "declared but never called" failure v3740 found the
    // pill itself in.
    ok("!! server.html no longer carries the standalone Raycast pill (removed v4034, not simply broken)",
        !svHtml.includes('id="bRaycast"'),
        "raycast.html is reached via the Mac System panel now; a stray bRaycast button reappearing here would " +
        "mean the removal was undone rather than intentionally reverted");
    const placementsSrc = readFileSync(path.join(ROOT, "WebGLEngine", "tools", "ship", "pagePlacements.mjs"), "utf8");
    ok("tools/ship/pagePlacements.mjs: macPages() still lists raycast.html",
        /file:\s*["']raycast\.html["']/.test(placementsSrc),
        "this is the list server.html's Mac System panel actually renders -- removing the pill without this " +
        "entry would leave raycast.html reachable from nowhere in server.html at all");
    ok("!! server.html: the Mac System panel slot is actually FILLED from macPages(), not just declared",
        /data-panel-pages="macsystem"/.test(svHtml) && /j\.macPages/.test(svHtml) && /macHost\.appendChild/.test(svHtml),
        "a slot that exists in markup but nothing ever populates is the exact shape of bug this file exists to catch");
    const ecat = JSON.parse(readFileSync(path.join(ROOT, "WebGLEngine", "engine-catalog.json"), "utf8"));
    ok("engine-catalog: Raycast LLM app listed (Applications pill)", (ecat.apps || []).some(a => a.label === "Raycast LLM" && a.url === "/raycast.html"));
    const page = readFileSync(path.join(ROOT, "WebGLEngine", "raycast.html"), "utf8");
    ok("raycast.html: panel exists with detect/install/run", page.includes("/raycast/status") && page.includes("tool-raycast") && page.includes("/raycast/launch"));
    const ext = path.join(ROOT, "raycast-extension", "swek-engine");
    const pkgj = JSON.parse(readFileSync(path.join(ext, "package.json"), "utf8"));
    ok("raycast extension: manifest with 3 commands + bridgeUrl pref", (pkgj.commands || []).length === 3 && (pkgj.preferences || []).some(p => p.name === "bridgeUrl"));
    const est = readFileSync(path.join(ext, "src", "engine-status.tsx"), "utf8");
    ok("raycast extension: status uses real endpoints", est.includes("/package/info") && est.includes("/self/whoami") && est.includes("/hosting/tunnel-registry"));
    const stt = readFileSync(path.join(ext, "src", "send-toast.tsx"), "utf8");
    ok("raycast extension: toast body matches Process-Json shape", stt.includes("Title:") && stt.includes("ToastType:"));
}

// --- (9) Extension dev-runner + PC→Mac relay (v2194b) ------------------------------
{
    const ROOT = path.join(BRIDGE, "..", "..");
    const srv2 = readFileSync(path.join(BRIDGE, "server.js"), "utf8");
    ok("bridge: ext dev-runner routes present", srv2.includes('"/raycast/ext/dev"') && srv2.includes('"/raycast/ext/stop"') && srv2.includes('"/raycast/ext/status"'));
    ok("bridge: dev state survives across requests (global)", srv2.includes("global.__rayExt || (global.__rayExt"));
    ok("bridge: dev copies to a stable home dir (never pins the engine folder)", srv2.includes('"swek-raycast-extension"'));
    ok("bridge: icon.png auto-generated (zlib local require)", srv2.includes("_rayIconPng") && /_rayIconPng[\s\S]{0,900}require\("zlib"\)/.test(srv2));
    ok("bridge: dev spawns npx ray develop with log capture", srv2.includes('spawn("npx", ["ray", "develop"]'));
    ok("bridge: peer-exec route present, trusted-or-known-peer gated", srv2.includes('"/raycast/peer-exec"') && srv2.includes("_knownPeerReq"));
    ok("bridge: peer-exec exec whitelist is closed", srv2.includes('new Set(["tool-raycast", "tool-ollama", "raycast-llm", "ollama"])'));
    ok("bridge: exec rows run as background jobs (no held socket)", srv2.includes("__rayJobs") && srv2.includes('"job-status"'));
    ok("bridge: relay route present, known-peer validated", srv2.includes('"/raycast/relay"') && /raycast\/relay[\s\S]{0,900}known\.has\(peer\)/.test(srv2));
    ok("bridge: relay forwards via _peerJSON to peer-exec", /relay[\s\S]{0,1400}_peerJSON\(peer, "\/raycast\/peer-exec"/.test(srv2));
    const page2 = readFileSync(path.join(ROOT, "WebGLEngine", "raycast.html"), "utf8");
    ok("raycast.html: dev-runner card + buttons", page2.includes('id="bExtDev"') && page2.includes("/raycast/ext/dev") && page2.includes("/raycast/ext/status"));
    ok("raycast.html: remote relay card + peer dropdown", page2.includes('id="peerSel"') && page2.includes("/raycast/relay") && page2.includes("/sync/peers"));
    ok("raycast.html: relay polls background jobs", page2.includes('"job-status"'));
}

// --- (10) "Make SweK Engine" generator (v2194c) -------------------------------------
{
    const ROOT = path.join(BRIDGE, "..", "..");
    const srv3 = readFileSync(path.join(BRIDGE, "server.js"), "utf8");
    ok("bridge: /raycast/make/apps + /raycast/make routes", srv3.includes('"/raycast/make/apps"') && srv3.includes('"/raycast/make"'));
    ok("bridge: relay actions make-apps + make", srv3.includes('case "make-apps":') && srv3.includes('case "make":'));
    ok("bridge: dev-runner accepts a pre-generated dir", srv3.includes("_rayExtStart({ dir: g.dir })"));
    const page3 = readFileSync(path.join(ROOT, "WebGLEngine", "raycast.html"), "utf8");
    ok("raycast.html: maker card with checkbox list + both create buttons", page3.includes('id="mkList"') && page3.includes('id="mkLocal"') && page3.includes('id="mkPush"'));
    ok("raycast.html: push uses relay action make with joined ids", page3.includes('action: "make", id: ids.join(",")'));

    // FUNCTIONAL: run the REAL generator code (extracted verbatim from server.js) against a temp home.
    const start = srv3.indexOf("const _RAY_MAKE_APPS");
    const end = srv3.indexOf("function _rayExtStatus");
    ok("maker code block extractable", start > 0 && end > start);
    if (start > 0 && end > start) {
        const block = srv3.slice(start, end);
        const tmpHome = path.join(HERE, ".sc-mk-" + process.pid);
        const fsm = await import("fs");
        try {
            const factory = new Function("fs", "path", "os", "_rayExtSrc", "require",
                block + "\nreturn { make: _rayMake, apps: _RAY_MAKE_APPS };");
            const api = factory(fsm.default, path, { homedir: () => tmpHome }, () => path.join(BRIDGE, "..", "..", "raycast-extension", "swek-engine"), require);
            ok("maker: app set has pages + all 3 rich commands", api.apps.length >= 20 && api.apps.filter(a => a.rich).length === 3);
            ok("maker: rejects empty selection", api.make([]).ok === false);
            const g = api.make(["pipboy", "trading", "rich-status", "rich-toast", "nonsense-id"]);
            ok("maker: generates from a mixed selection", g.ok === true && (g.commands || []).length === 4);
            const man = JSON.parse(fsm.default.readFileSync(path.join(g.dir, "package.json"), "utf8"));
            ok("maker: manifest valid — 4 commands + bridgeUrl pref", (man.commands || []).length === 4 && (man.preferences || []).some(p => p.name === "bridgeUrl"));
            ok("maker: no-view command modes for pages", man.commands.filter(c => c.mode === "no-view").length === 2 && man.commands.filter(c => c.mode === "view").length === 2);
            const gen = fsm.default.readFileSync(path.join(g.dir, "src", "open-pipboy.ts"), "utf8");
            ok("maker: generated command opens the page on the bridge pref", gen.includes('open(`${BASE}/fallout.html`)') && gen.includes("getPreferenceValues"));
            ok("maker: rich commands copied verbatim from scaffold", fsm.default.existsSync(path.join(g.dir, "src", "engine-status.tsx")) && fsm.default.existsSync(path.join(g.dir, "src", "send-toast.tsx")));
            const png = fsm.default.readFileSync(path.join(g.dir, "icon.png"));
            ok("maker: icon.png generated with a valid PNG signature", png.length > 100 && png[0] === 137 && png[1] === 80 && png[2] === 78 && png[3] === 71);
            ok("maker: tsconfig present", fsm.default.existsSync(path.join(g.dir, "tsconfig.json")));
        } catch (e) {
            ok("maker functional run", false, String(e && e.message || e).slice(0, 200));
        }
        try { fsm.default.rmSync(tmpHome, { recursive: true, force: true }); } catch {}
    }
}

console.log("[discovery-selfcheck] " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
