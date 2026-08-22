// tools/ship/phonePeerTransfer-selfcheck.mjs
//
// Run: node tools/ship/phonePeerTransfer-selfcheck.mjs   (~0.1s)
//
// v3169 -- THE PHONE PEERS COULD NOT MOVE A FILE, and "registered" was not "working".
//
// v3166 put copyparty in the Auto-Install registry and said the front door was not built. Keith read that as
// the peers being able to transfer, which is a FAIR READING OF THE WORD REGISTERED and the reason this gate
// asserts the difference: detect() said MISSING, autoRun was FALSE, and the two phone pages mentioned copyparty
// ZERO TIMES. One registry entry is an OPTION, not a capability.
//
// *** AND THE PORT QUESTION HAS A SHARP ANSWER: THERE IS NO ALLOCATOR, DELIBERATELY. ***
//
// The tree HAS a freePort() in portHandoff.js and IT IS A KILL -- it frees a port by TERMINATING WHATEVER HOLDS
// IT. Reaching for that here would kill an unrelated process to start a file server: the worst way to resolve a
// collision, and it would look like a crash to whoever owned the port. Walking to the next free number instead
// would hand somebody a URL THAT CHANGES BETWEEN SESSIONS. So the port is PROBED and a collision is REPORTED.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const B = createRequire(import.meta.url)(path.join(ENG, "ai-bridge", "copypartyBridge.js"));
const src = fs.readFileSync(path.join(ENG, "ai-bridge", "copypartyBridge.js"), "utf8");
const pages = ["android-peer.html", "ios-peer.html"].map((p) => ({ p, s: fs.readFileSync(path.join(ENG, p), "utf8") }));

// ---- 1. THE PORT IS PROBED, NOT CLAIMED AND NOT SEIZED -----------------------------------------------------
{
    ok("!! the default is copyparty's own 3923, and it collides with nothing SweK claims",
        B.DEFAULT_PORT === 3923 && !(3923 in B.OURS) && B.OURS[8787] && B.OURS[8080],
        "8787 is the engine bridge and 8080 is spaceprojectsim; 1143/8188/9200/1984/8000/2283 are also spoken " +
        "for. 3923 is free of all of them, which is why it stays the default rather than being invented");

    ok("!! the port is tested BY TRYING TO BIND, which is what a server actually does",
        /net\.createServer\(\)/.test(src) && /s\.listen\(port, host\)/.test(src) && await B.portFree(B.DEFAULT_PORT) === true,
        "a connect-probe answers 'is something accepting', and BINDING answers 'can I have it' -- they differ " +
        "on a socket bound to another interface, and only the second is the question being asked");

    ok("!! *** freePort() IS NOT USED, AND THAT IS THE DESIGN ***",
        // *** ASSERTED BY WHAT IS NOT IMPORTED, WHICH IS STRONGER AND HAS NO PROSE PROBLEM. ***
        // My first version tested for the CALL and failed on MY OWN COMMENT explaining why there isn't one --
        // a check counting its own warning, which v3153 recorded and I did again. My second stripped comments
        // inline, and commentFalsePass FLAGGED IT AS GENUINE: a code idiom tested against file content is the
        // exact hazard shape that gate exists to find, and it was right. YOU CANNOT CALL freePort WITHOUT
        // REQUIRING THE MODULE THAT EXPORTS IT, so the import is the load-bearing fact and it needs no
        // stripping at all.
        !/require\(["'][^"']*portHandoff[^"']*["']\)/.test(src) &&
        /portHandoff\.js and IT IS A KILL/i.test(src),
        "the tree's freePort frees a port by TERMINATING WHATEVER HOLDS IT. Calling it here would kill an " +
        "unrelated process to start a file server, and to its owner that is indistinguishable from a crash");

    ok("!! and there is NO auto-allocator, deliberately",
        !/port\+\+|nextFreePort|for \(let p = /.test(src),
        "walking to the next free number would hand somebody a URL THAT CHANGES BETWEEN SESSIONS. A collision " +
        "is REPORTED for a human to resolve -- slower, and it is the same answer tomorrow");

    ok("...and a port held by US is distinguished from one held by a stranger",
        /portHeldBy: free \? null : \(OURS\[port\] \|\| "something not part of SweK"\)/.test(src),
        "'busy' is not an answer. 'the SweK engine bridge' means move copyparty; 'something not part of SweK' " +
        "means you already have something there on purpose -- two different next actions");
}

// ---- 2. THREE FACTS ON THEIR OWN EVIDENCE ------------------------------------------------------------------------
{
    const st = await B.status();
    ok("!! installed, port-free and who-holds-it are SEPARATE answers",
        typeof st.installed === "boolean" && typeof st.portFree === "boolean" && "portHeldBy" in st,
        "installed=" + st.installed + " portFree=" + st.portFree + " on this box. v3040's law from the tunnel " +
        "checkbox: TWO INDEPENDENT FACTS RESTORED FROM ONE PIECE OF EVIDENCE is how a control comes to lie, and " +
        "collapsing these into 'ready / not ready' is that failure with a nicer label");

    ok("!! the iOS command is READ-ONLY and the Android one is not, on purpose",
        /-v \.::r"/.test(src) && /-v \.::rw"/.test(src) && st.aShell.includes("::r") && !st.aShell.includes("::rw"),
        "a phone in a pocket on a shared network is the wrong place for a writable share by default. The " +
        "warning is carried WITH the command rather than filed under documentation");

    ok("!! and the danger is stated in the payload, not left to the reader",
        /gives EVERYONE on the network read\/write/.test(src) && st.warning.length > 40,
        "copyparty's own README says running it bare gives everyone read/write to the current folder. A front " +
        "door that omitted that would be handing somebody a loaded tool politely");
}

// ---- 3. THE FRONT DOOR EXISTS ON BOTH PAGES ----------------------------------------------------------------------
{
    ok("!! BOTH phone pages have the section -- they mentioned file transfer ZERO times before",
        pages.every((x) => /id="cpCheck"/.test(x.s) && /\/economy\/copyparty/.test(x.s)),
        pages.map((x) => x.p).join(" and ") + ". A MODULE WITH NO CALLER IS UNFINISHED, and a registry entry " +
        "with no page is the same thing one level up");

    ok("!! each page names the environment it actually runs in",
        /Termux/.test(pages[0].s) && /a-Shell/.test(pages[1].s),
        "copyparty runs in Termux on Android and a-Shell on iOS. One page telling an iPhone user to open Termux " +
        "would be a front door onto a wall");

    ok("!! the page says SweK does NOT start or install it",
        pages.every((x) => /SweK does not start it and does not install it for you/.test(x.s)),
        "autoRun is off because a file server that starts itself is a decision about what is exposed and to " +
        "whom. Saying so on the page stops the next person reading the button as 'go'");

    ok("...and the markup balances on both",
        pages.every((x) => (x.s.match(/<div\b/g) || []).length === (x.s.match(/<\/div>/g) || []).length),
        "v3162's stray </div> did not throw -- it silently reparents everything after it, and nothing here " +
        "renders HTML");
    console.log("  ----  WHAT THIS BOX CANNOT SHOW: a transfer. copyparty is NOT installed here (detect says");
    console.log("  ----  missing), so the checker exercises the REFUSALS. Whether a phone actually serves files");
    console.log("  ----  is Keith's to see -- and the button now reports install, port, and holder separately");
    console.log("  ----  rather than one green light that could be lying about any of the three.");
}

console.log();
if (fails) { console.log("phonePeerTransfer-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("phonePeerTransfer-selfcheck: all checks pass");
