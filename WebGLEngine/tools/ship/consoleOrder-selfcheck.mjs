// WebGLEngine/tools/ship/consoleOrder-selfcheck.mjs -- v3360
//
// *** NEWEST FIRST, AND A BURST STAYS IN THE ORDER IT ARRIVED. *** Reversing the line list would have been one
// line and WRONG: the eight [relay] lines that land together describe one startup IN SEQUENCE, and read
// backwards they are nonsense. So only the ORDER OF BURSTS is reversed.
//
// The grouping rule is EXTRACTED FROM server.html AND EVALUATED, not re-implemented here -- a second copy would
// be a second definition of "what counts as one burst", and the two would disagree the first time either moved.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const srv = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

// Pull the real helpers out of the page and run them.
const grab = (name) => {
    const i = srv.indexOf("function " + name);
    if (i < 0) return null;
    let d = 0, j = srv.indexOf("{", i);
    for (let k = j; k < srv.length; k++) { if (srv[k] === "{") d++; else if (srv[k] === "}") { d--; if (!d) return srv.slice(i, k + 1); } }
    return null;
};
const src = "var BURST_MS = 1500;\n" + grab("_srcOf") + "\n" + grab("_burstsOf") + "\nreturn _burstsOf;";
const burstsOf = new Function(src)();

ok("!! the grouping rule was extracted from server.html and runs", typeof burstsOf === "function",
    "a second implementation here would be a second definition of what counts as one burst");

// --- the case Keith named: a block of [relay] lines arriving together ---
const relay = [];
for (let i = 0; i < 8; i++) relay.push({ text: "[relay] line " + i, t: 1000 + i * 5 });
const g = burstsOf(relay);
ok("!! *** eight [relay] lines arriving together are ONE burst ***", g.length === 1 && g[0].lines.length === 8,
    "they describe one startup in sequence -- split or reversed, they are nonsense");
ok("...and their order inside it is UNCHANGED",
    g[0].lines.map((l) => l.text).join("|") === relay.map((l) => l.text).join("|"),
    "this is the whole point: newest FIRST between bursts, arrival order WITHIN one");

// --- the case that makes the time window load-bearing ---
const twoBursts = burstsOf([
    { text: "[relay] early", t: 1000 },
    { text: "[relay] later", t: 1000 + 60000 },
]);
ok("!! *** two [relay] bursts a minute apart do NOT merge ***", twoBursts.length === 2,
    "same tag is not enough. Merging them would drag the older line to the top with the newer one, which is " +
    "exactly the ordering this round exists to fix");

const mixed = burstsOf([
    { text: "[relay] a", t: 1000 }, { text: "[relay] b", t: 1002 },
    { text: "[sys] c", t: 1003 }, { text: "[relay] d", t: 1004 },
]);
ok("...and a different source starts a new burst even at the same instant",
    mixed.length === 3 && mixed[0].lines.length === 2,
    "otherwise one interleaved source would swallow another's lines into its block");

const untagged = burstsOf([{ text: "no tag here", t: 1 }, { text: "nor here", t: 2 }]);
ok("...and untagged lines are never grouped with each other",
    untagged.length === 2,
    "an empty source is not a source. Grouping on it would batch unrelated lines that merely lacked a prefix");

// --- the two consequences of flipping the order, both easy to forget ---
ok("!! *** the sticky edge moved to the TOP ***",
    /var atTop = els\.log\.scrollTop <= 8/.test(noComments(srv)) && /if \(atTop\) els\.log\.scrollTop = 0/.test(noComments(srv)),
    "keeping the old atBottom test would have pinned the view to the OLDEST line and looked like the log had " +
    "frozen");

ok("!! *** and the line cap now trims the OTHER END ***",
    /removeChild\(els\.log\.lastChild\)/.test(noComments(srv)) && !/removeChild\(els\.log\.firstChild\)/.test(noComments(srv)),
    "newest-first puts the OLDEST line last. Trimming the front would have deleted the NEWEST lines the instant " +
    "the log filled -- the cap silently becoming a censor");

ok("...and each burst is inserted at the top, oldest first, so the newest ends up above",
    /insertBefore\(_frag, els\.log\.firstChild\)/.test(noComments(srv)));

// --- the two moves ---
ok("!! the GPU Brain chip is in the peer row, not pinned over the page",
    /My Cameras<\/button><div id="gpuBrainStatus"/.test(srv) && !/position:fixed;left:12px;bottom:12px/.test(srv),
    "it was position:fixed bottom-left and OVERLAPPED the console and the status bar in both screenshots -- a " +
    "fixed element sits on top of whatever the page grows into");

ok("!! Keep awake is in System Tools, and only once",
    srv.indexOf('id="kaWrap"') > srv.indexOf("System Tools") && srv.split('id="kaWrap"').length === 2,
    "it is a system STATE that stays on until turned off, not a control you press -- and a move that left a " +
    "copy behind would give one checkbox two homes");

console.log(failed ? "consoleOrder-selfcheck: " + failed + " FAILED" : "consoleOrder-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
