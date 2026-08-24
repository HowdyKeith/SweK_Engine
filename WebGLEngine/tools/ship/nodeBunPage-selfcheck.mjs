// WebGLEngine/tools/ship/nodeBunPage-selfcheck.mjs -- v3967
//
// Run: node tools/ship/nodeBunPage-selfcheck.mjs   (needs Chromium; skips cleanly without it)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** node-bun.html EXISTS BECAUSE THE ANSWER TO "DOES SweK WORK UNDER BUN" WAS A PARAGRAPH IN A CHANGELOG. ***
// Keith: "I thought something was not working when we selected Bun as default instead of Node." A claim about a
// runtime that lives in prose cannot be checked on the box where it matters, and the box where it matters is
// Windows -- which is precisely the platform the measurement was NOT taken on.
//
// WHAT THIS DEFENDS is that the page keeps ASKING rather than TELLING:
//   - the runtime readout comes from /runtime, not from a hardcoded sentence
//   - the Bun button is disabled when bun is not on PATH, because a preference for a runtime that is not there
//     is the one failure mode that looks like nothing happening at all
//   - the surface buttons spawn the real tool under both runtimes
//   - and the route behind them takes a RUNTIME FROM AN ALLOWLIST, never a command from the query string
//
// That last one is the only line here that is about safety rather than honesty, and it is the one worth being
// loud about: this box exposes a tunnel, and a diagnostic route that ran what it was told would be a remote
// shell with a stethoscope drawn on it.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { noComments, codeOnly } from "./sourceScan.mjs";
import { SECTIONS } from "./pageSections.mjs";

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("nodeBunPage-selfcheck -- the Node/Bun page asks the box rather than telling it\n");

const PAGE = path.join(ROOT, "node-bun.html");
ok("the page exists", fs.existsSync(PAGE));
if (!fs.existsSync(PAGE)) { console.log("\n1 FAILED"); process.exit(1); }
const page = fs.readFileSync(PAGE, "utf8");
// *** SCOPED TO THE <script> BLOCK, NOT THE WHOLE HTML FILE -- A SECOND TRAP, FOUND ON THIS GATE'S FIRST RUN. ***
// noComments/codeOnly are JS lexers, and this page's own PROSE originally contained "ai-bridge/*Bridge.js" --
// plain text, a glob spelled in a sentence -- which the lexer reads as a block-comment OPENER regardless of
// context. It swallowed everything from there to the next stray "*/", which cut nc.length from 11105 to 5175
// and made every check below fail on a page that was correct. Fixed two ways: the prose was reworded so the
// page carries no unintentional /* for the NEXT tool that reads it, and the scan is scoped to the script block
// so prose elsewhere on the page cannot do this again.
const scriptStart = page.lastIndexOf("<script>");
const scriptEnd = page.indexOf("</script>", scriptStart);
if (scriptStart < 0 || scriptEnd < 0) { console.log("  FAIL  could not find the page's <script> block\n1 FAILED"); process.exit(1); }
const pageCode = noComments(page.slice(scriptStart, scriptEnd));
const server = noComments(fs.readFileSync(path.join(ROOT, "ai-bridge", "server.js"), "utf8"));

// ---- 1. it is reachable, which is the defect this session keeps finding -------------------------------------
{
    const sec = SECTIONS.find((s) => s.id === "systools");
    ok("!! it is REGISTERED in System Tools -- Keith asked for it there by name",
        !!sec && sec.pages.includes("node-bun.html"), sec ? sec.pages.length + " pages in the drawer" : "no systools section");
    // The registry moves an EXISTING anchor; a page claimed with no <a> to move renders one fewer link and the
    // drawer looks fine. v3959 spent a round on the report that hides this.
    const sv = fs.readFileSync(path.join(ROOT, "server.html"), "utf8");
    ok("!! ...and server.html carries an anchor for the mover to MOVE",
        /href="\/node-bun\.html"/.test(sv),
        "a registry entry with no anchor is a claimed page that never appears -- the mover moves, it does not build");
}

// ---- 2. the readout is asked for, not asserted ----------------------------------------------------------------
ok("!! the runtime shown is READ FROM /runtime, not written into the page",
    /get\("\/runtime"\)/.test(pageCode) || /fetch\([^)]*\/runtime/.test(pageCode),
    "a page that states which runtime is running is a page that will be wrong on the next box");
ok("the optional-dependency table is built from /runtime's own feature list",
    /rt\.features/.test(pageCode) && /renderDeps/.test(pageCode));

// *** THE FAILURE MODE THAT LOOKS LIKE NOTHING. *** Preferring Bun on a box without Bun does not error: the
// launcher falls back to Node and the setting silently does nothing, which is exactly the shape of "I switched
// it and something was off".
ok("!! *** the Bun button is DISABLED when bun is not on PATH ***",
    /setBun"\)\.disabled = !bunAvail/.test(pageCode),
    "a preference for a runtime that is not installed fails by doing nothing, which is the hardest kind to notice");
ok("!! ...and the mismatch is SAID OUT LOUD when the flag and the box disagree",
    /rt\.useBun && !bunAvail/.test(pageCode),
    "the launcher falls back to Node and the setting appears to have done nothing");

// ---- 3. the buttons run the real thing ------------------------------------------------------------------------
ok("!! the surface buttons call the route that spawns tools/ship/bunSurface.mjs",
    /\/runtime\/surface\?rt=/.test(pageCode) && /runSurface\("node"\)/.test(pageCode) && /runSurface\("bun"\)/.test(pageCode),
    "the whole point is answering the question ON THIS BOX rather than inheriting a Linux answer");
ok("the tool it runs is actually in the tree", fs.existsSync(path.join(ROOT, "tools", "ship", "bunSurface.mjs")));

// ---- 4. THE SAFETY LINE ----------------------------------------------------------------------------------------
{
    const route = (server.match(/\/runtime\/surface[\s\S]{0,1400}/) || [""])[0];
    ok("!! *** the route picks the runtime from an ALLOWLIST, never from the query string ***",
        /=== "bun" \? "bun" : "node"/.test(route),
        "a route that spawned what it was told would be a remote shell -- and this box exposes a tunnel");
    ok("!! ...and the SCRIPT it runs is fixed, not supplied by the caller",
        /bunSurface\.mjs/.test(route) && !/searchParams\.get\("(cmd|script|exec|path)"\)/.test(route));
    // Node is spawned as THIS process's own executable: a box can be running the bridge under a Node that is
    // not the one on PATH, and the runtime serving the page is the one being asked about.
    ok("Node is spawned as process.execPath, not the name on PATH", /process\.execPath/.test(route),
        "the bridge may be running under a Node that is not first on PATH");
    ok("a box without bun gets an explanation rather than a spawn error", /not on PATH on this box/.test(server));
}

// ---- 5. the claim the page makes about ws, which is the one dependency finding --------------------------------
// Pinned because it is the actionable half of the whole survey: eleven optional packages were probed and exactly
// one behaves differently, and the difference is not cosmetic -- server.js falls back to a null-object wss.
ok("!! the page names `ws` as the dependency Bun ships built in", /built into Bun/.test(page) && /\bws\b/.test(page));
ok("!! ...and server.js really does fall back to a null-object WebSocket server without it",
    /WebSocketServer = require\("ws"\)/.test(server) && /clients: new Set\(\)/.test(server),
    "without ws the bridge BOOTS and live push is silently off -- which is why this is worth a line on a page");

// ---- 6. and the caveat that matters more than the result -------------------------------------------------------
ok("!! the page says the measurement was LINUX and the rig is Windows",
    /Linux/.test(page) && /Windows/.test(page),
    "a green run in a Linux sandbox is evidence about that sandbox; Bun's Windows surface is its weakest");

console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
process.exit(fails ? 1 : 0);
