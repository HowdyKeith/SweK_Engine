// WebGLEngine/tools/ship/steamdeckPeer-selfcheck.mjs -- v4147
//
// Run: node tools/ship/steamdeckPeer-selfcheck.mjs   (seconds; one optional live-browser section)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES steamdeck-peer.html + its header button + the mDNS guard that made the claim true.
//
// Keith: "can we legitimately put a Steam Deck Peer button after the iOS Peer button" -- then, on being told
// the Deck outranks both phones, "we could put the Steam Deck button before Android". THE ORDER IS THE CLAIM:
// iOS runs a subset in Safari, Android runs a subset under Termux, and a Deck runs ai-bridge/server.js ITSELF.
// A button placed to match that is making an assertion about capability, so this file checks the assertion
// rather than the button's existence.
//
// *** THE HARD PART OF THIS PAGE IS NOT WHAT IT CLAIMS, IT IS WHAT IT REFUSES TO. *** No physical Steam Deck
// has ever run any of it. Rows measured on generic x86_64 Linux are worth something because that IS what a Deck
// is; rows that depend on an RDNA2 GPU, a read-only SteamOS root, Distrobox or Game Mode are reasoned from
// Valve's documentation and are NOT measurements. The page marks which is which per row, and the checks below
// exist so that distinction cannot quietly erode into a page that sounds verified.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { prose } from "./sourceScan.mjs";   // the mDNS measurement lives in a COMMENT, and comments wrap

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("steamdeckPeer-selfcheck -- the peer that runs the engine itself, and the half nobody has verified\n");

const page = fs.readFileSync(path.join(ENG, "steamdeck-peer.html"), "utf8");
const server = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
const bridge = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");

// ---- 1. THE BUTTON, AND THE ORDER THAT IS THE CLAIM ------------------------------------------------------
{
    console.log("1. THE BUTTON EXISTS AND SITS WHERE ITS CLAIM PUTS IT");
    ok("!! server.html carries a Steam Deck Peer button pointing at the page",
        /id="steamdeckPeerBtn"[^>]*href="\/steamdeck-peer\.html"/.test(server));
    const iDeck = server.indexOf('id="steamdeckPeerBtn"');
    const iDroid = server.indexOf('id="androidPeerBtn"');
    const iIos = server.indexOf('id="iosPeerBtn"');
    ok("!! *** the three peer buttons read in DESCENDING capability: Deck, then Android, then iOS ***",
        iDeck > 0 && iDroid > 0 && iIos > 0 && iDeck < iDroid && iDroid < iIos,
        "Deck@" + iDeck + " Android@" + iDroid + " iOS@" + iIos + ". The order asserts a ranking the pages " +
        "themselves make: a Deck hosts the engine, the phones are guests in a browser or a sandbox.");
    ok("   ...and the button's tooltip carries the unverified caveat, not just the capability boast",
        /id="steamdeckPeerBtn"[^>]*title="[^"]*no physical Deck has ever run it/i.test(server),
        "a tooltip that only sold the capability would be the page's honest half stripped off at the door");
}

// ---- 2. THE PAGE SEPARATES MEASURED FROM REASONED, PER ROW ------------------------------------------------
{
    console.log("\n2. *** MEASURED AND REASONED ARE MARKED APART, WHICH IS THE WHOLE POINT OF THE PAGE ***");
    ok("!! the page states plainly that no physical Deck has ever run this",
        /No physical Steam Deck has ever run any of this/i.test(page));
    const measured = (page.match(/<b>MEASURED<\/b>/g) || []).length;
    const unverified = (page.match(/<b>NOT VERIFIED ON HARDWARE\.<\/b>/g) || []).length;
    ok("!! *** BOTH kinds of row actually exist -- a page with only one kind is selling or apologising ***",
        measured >= 3 && unverified >= 3, measured + " MEASURED row(s), " + unverified + " NOT VERIFIED row(s)");
    ok("   ...and the unverified rows name what is missing, rather than hedging generically",
        /RDNA2/.test(page) && /read-only/.test(page) && /Game Mode/.test(page),
        "an RDNA2 GPU, SteamOS's read-only root and Game Mode are the three things this box does not have");
    // THE GATE AND THE PAGE MUST NOT DRIFT ON THE DISCLOSURE. The page says steamdeckLaunch-selfcheck makes the
    // same admission; if that gate ever stops making it, this check turns the page's cross-reference into a lie.
    const launchGate = fs.readFileSync(path.join(ENG, "tools", "ship", "steamdeckLaunch-selfcheck.mjs"), "utf8");
    ok("!! *** the page cites steamdeckLaunch-selfcheck's own disclosure, and that disclosure is still there ***",
        /steamdeckLaunch-selfcheck/.test(page) && /NOT RUN HERE: the actual Steam Deck/.test(launchGate),
        "two places saying 'unverified' can drift apart; this is the check that notices");
}

// ---- 3. EVERY CAPABILITY THE PAGE CLAIMS IS BACKED BY A FILE THAT EXISTS ----------------------------------
{
    console.log("\n3. THE CLAIMS ARE CHECKED AGAINST THE TREE, NOT TAKEN ON THE PAGE'S WORD");
    for (const rel of ["install-steamdeck.sh", "start-steamdeck.sh", path.join("brain", "start-brain-steamdeck.sh")]) {
        ok("!! the launcher the page tells you to run exists: " + rel, fs.existsSync(path.join(ENG, rel)));
    }
    const start = fs.readFileSync(path.join(ENG, "start-steamdeck.sh"), "utf8");
    ok("!! the page's claim that the launcher PREFERS Bun is true of the launcher",
        /command -v bun[\s\S]{0,80}RUNTIME="bun"/.test(start),
        "this is load-bearing: it is WHY the Bun-gated mDNS skip mattered on a Deck at all");
    const brain = fs.readFileSync(path.join(ENG, "brain", "start-brain-steamdeck.sh"), "utf8");
    ok("!! the page's claim of a Vulkan pin WITH a CPU fallback is true of the brain script",
        /WGPU_BACKEND=vulkan/.test(brain) && /BRAIN_BACKEND=cpu/.test(brain),
        "the fallback is why an unproven GPU costs capability and never a working brain -- the page says so");
}

// ---- 4. *** THE mDNS GUARD: THE FIX THAT MADE ONE OF THE PAGE'S ROWS TRUE *** -----------------------------
{
    console.log("\n4. *** THE Bun mDNS GUARD IS NARROWED TO WINDOWS, WHICH IS WHERE ITS BUG LIVES ***");
    // v1147's own comment names the cause as a Bun-on-WINDOWS panic, and the condition checked only the
    // runtime -- so every Bun run lost .local discovery, and start-steamdeck.sh prefers Bun.
    ok("!! *** the skip requires BOTH Bun AND win32, not Bun alone ***",
        /if \(_isBunRuntime && process\.platform === "win32"\) \{/.test(bridge),
        "a Deck gave up mDNS to dodge a Windows bug it can never hit");
    ok("   ...and the Windows workaround is still intact for the platform that reported the panic",
        /Bun\/Windows socket panic/.test(bridge),
        "narrowing a guard must not delete it -- this box cannot test Windows, so Windows keeps its workaround");
    // *** AND THIS LINE'S FIRST DRAFT WAS ITSELF A commentFalsePass, ONE ROUND AFTER v4145 PAID THAT DEBT DOWN
    // TO ITS BASELINE. *** It matched "9 service types" against raw source, and the phrase spans a comment line
    // break ("browsing 9 service / types"), so it could never match however true the sentence was. The target
    // IS a comment, so it is read through prose(), which flattens the wrapping -- the same reader crtPass and
    // galaxyProfile were given at v4145. Writing the bug again while the fix was still warm is the argument for
    // the helper existing rather than for remembering the rule.
    const bridgeProse = prose(bridge);
    ok("!! ...and the narrowing records that it was MEASURED rather than argued from the old comment",
        /MEASURED BEFORE NARROWING/.test(bridgeProse) && /9 service types/.test(bridgeProse),
        "the reading, not the reasoning: Bun on Linux browsed 9 service types and did not panic");
    // LIVE, on whatever runtime is running this gate, as long as it is not Windows: the modules the guard
    // controls must actually start. A source-shape check alone would pass a tree where mdnsDiscovery threw.
    if (process.platform === "win32") {
        report("SKIPPED the live start -- this IS Windows, the one platform whose workaround stays in place");
    } else {
        let started = false, err = "";
        try {
            const mdns = require_(path.join(ENG, "ai-bridge", "mdnsDiscovery.js"));
            mdns.start();
            started = true;
        } catch (e) { err = String((e && e.message) || e); }
        ok("!! *** mdnsDiscovery.start() really runs on this non-Windows box, so the guard is safe to narrow ***",
            started, err || "started without throwing");
        try { require_(path.join(ENG, "ai-bridge", "mdnsDiscovery.js")).stop?.(); } catch {}
    }
}

// ---- 5. *** THE DETECTOR: DRIVEN WITH REAL FIXTURES, INCLUDING THE ONES IT MUST REFUSE *** ------------------
{
    console.log("\n5. *** DETECTING A DECK -- AND, MORE IMPORTANTLY, THE CASES IT MUST NOT CLAIM ***");
    // Keith asked whether the resolution could be read on load. It can, and it is the only signal a Deck in
    // Desktop Mode volunteers -- its user agent is ordinary Linux Chromium. But a resolution is a hint, so the
    // fixtures below include the ones that MUST fall through, which is where a sniffer earns or loses its keep.
    const { classify, peerPageFor, STEAMDECK_PANEL } = await import("../../ui/deviceKind.mjs");
    const LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36";
    const deck = { maxTouchPoints: 5, screen: { width: 1280, height: 800 }, devicePixelRatio: 1 };

    ok("!! the panel constant matches Valve's published spec (LCD and OLED are the same pixels)",
        STEAMDECK_PANEL.w === 1280 && STEAMDECK_PANEL.h === 800,
        STEAMDECK_PANEL.w + "x" + STEAMDECK_PANEL.h);
    ok("!! *** a handheld Deck is recognised: Linux + the panel + touch ***",
        classify(LINUX, deck).kind === "steamdeck" && classify(LINUX, deck).confident === true,
        classify(LINUX, deck).why);
    ok("!! ...and a SCALED desktop still reports the panel it physically has",
        classify(LINUX, { maxTouchPoints: 5, screen: { width: 1024, height: 640 }, devicePixelRatio: 1.25 }).kind === "steamdeck",
        "1024x640 at DPR 1.25 IS 1280x800 -- reading CSS pixels alone would have missed a Deck with SteamOS scaling on");
    ok("!! *** the GPU route works WITHOUT the panel, which is what covers a DOCKED Deck ***",
        classify(LINUX, { maxTouchPoints: 0, screen: { width: 3840, height: 2160 }, devicePixelRatio: 1, gpu: "AMD Radeon Graphics (RADV VANGOGH)" }).kind === "steamdeck",
        "docked to 4K the panel test cannot fire, and the GPU has not changed -- the two routes cover each other");

    // *** THE REFUSALS. A detector is only worth its highlight if these stay `desktop`. ***
    const mustNotBeDeck = [
        ["an ordinary Linux workstation", { maxTouchPoints: 0, screen: { width: 1920, height: 1080 }, devicePixelRatio: 1 }],
        ["a 1280x800 Linux box with NO touchscreen", { maxTouchPoints: 0, screen: { width: 1280, height: 800 }, devicePixelRatio: 1 }],
        ["a docked Deck with no GPU string available", { maxTouchPoints: 0, screen: { width: 3840, height: 2160 }, devicePixelRatio: 1 }],
        ["a Linux box with no screen info at all", { maxTouchPoints: 5 }],
    ];
    for (const [label, nav] of mustNotBeDeck) {
        const k = classify(LINUX, nav).kind;
        ok("!! REFUSES to call it a Deck: " + label, k === "desktop", "got " + k);
    }
    ok("   ...and a docked Deck reading as `desktop` is CORRECT, not a miss",
        classify(LINUX, { maxTouchPoints: 0, screen: { width: 3840, height: 2160 }, devicePixelRatio: 1 }).kind === "desktop",
        "it is driving an external display and being used as a desktop; a missed highlight costs nothing, a wrong one costs trust");

    ok("!! the kind maps to this page, and the mapping is what server.html highlights on",
        peerPageFor("steamdeck") === "/steamdeck-peer.html" && /steamdeckPeerBtn/.test(server));
    ok("!! *** and the detector still NEVER navigates -- it only highlights, as it has since v3704 ***",
        !/location\s*=|location\.href\s*=|location\.replace/.test(
            (server.match(/const \{ detect, peerPageFor \}[\s\S]*?<\/script>/) || [""])[0]),
        "a detector that redirects is hostile the moment it is wrong, and this one is unverified on hardware");
}

// ---- 6. LIVE: THE PAGE RENDERS AND THE HONEST HALF IS VISIBLE ----------------------------------------------
{
    console.log("\n6. THE PAGE, IN A REAL BROWSER");
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) { report("SKIPPED -- " + skip); }
    else {
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL });
        const pg = await (await b.newContext()).newPage();
        const errs = [];
        pg.on("pageerror", (e) => errs.push(String(e.message)));
        await pg.setContent(page, { waitUntil: "load" });
        const rows = await pg.evaluate(() => document.querySelectorAll("table tr").length).catch(() => 0);
        ok("!! the capability tables render as real rows", rows >= 12, rows + " row(s) across the ladder and the table");
        const warned = await pg.evaluate(() =>
            (document.querySelector(".unverified")?.textContent || "").includes("No physical Steam Deck")).catch(() => false);
        ok("!! *** the unverified card is IN THE RENDERED PAGE, not only in the source ***", warned);
        ok("   ...and no script error", errs.length === 0, errs.join(" | "));
        await b.close();
    }
}

console.log("\n  ----  NOT PROVEN HERE, AND THE PAGE SAYS THE SAME: a physical Steam Deck. This gate runs on generic");
console.log("  ----  x86_64 Linux, which is what a Deck IS -- so the server, beacon, mDNS and takeover rows carry real");
console.log("  ----  weight. The RDNA2 GPU, the read-only root, Distrobox and Game Mode do not, and are marked");
console.log("  ----  unverified on the page rather than smoothed over. The first Deck to run install-steamdeck.sh");
console.log("  ----  settles them, and this gate should gain the readings the day that happens.");

console.log("\n" + (fails ? fails + " FAILED" : "steamdeckPeer-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
