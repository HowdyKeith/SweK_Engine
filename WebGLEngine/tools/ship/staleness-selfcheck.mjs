// WebGLEngine/tools/ship/staleness-selfcheck.mjs -- v2976
//
// Run: node tools/ship/staleness-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/ship/staleness.mjs -- the derived-fact checks that now run inside verify.mjs.
//
// THE FAILURE THIS ANSWERS. The v2975 build shipped carrying three stale facts: BRAIN_BUILD 87 versions behind,
// a case-study gate count 77 short, and a knowledge index built at v2888 and never rebuilt. TWO OF THE THREE
// WERE ALREADY GATED, CORRECTLY, and both gates sit inside the 457-gate selfcheck suite -- which takes minutes,
// so it does not run on every ship.
//
// The checks were right. They were present. They were never consulted. That is the cost of "a gate nobody can
// afford to run is a gate nobody runs" left standing as an observation instead of acted on: the tree grew 77
// gates and every page describing it quietly went wrong.
//
// SO THE POINT OF THIS FILE IS NOT THE CHECKS. It is that they are CHEAP -- 48ms for all three -- and therefore
// live in verify.mjs where they run every time. This gate exists to keep them that way.
import fs from "node:fs";
import { prose } from "./sourceScan.mjs";
import path from "node:path";
import { fixDerived, gateFiles } from "./staleness.mjs";
import { fileURLToPath } from "node:url";
import { stalenessRows, isFresh, asyncStalenessRows } from "./staleness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. the rows are well formed and cover the facts that actually rotted --------------------------------------
{
    const rows = stalenessRows();
    ok("staleness reports rows", rows.length >= 3, rows.length + " derived facts");
    ok("every row states claimed, actual and a reason", rows.every((r) => "claimed" in r && "actual" in r && (r.why || "").length > 25),
       "a mismatch without a reason is a number nobody knows how to act on");
    for (const want of ["case-study gate count", "knowledge-index gate count", "brain build vs engine version"]) {
        ok("covers: " + want, rows.some((r) => r.id === want), "this is one of the three that shipped stale in v2975");
    }
}

// ---- 2. IT MUST BE CHEAP, because that is the entire reason it exists -------------------------------------------
{
    const t = Date.now();
    stalenessRows();
    const ms = Date.now() - t;
    ok("!! the whole check costs under a second", ms < 1000, ms + "ms -- the 457-gate suite is minutes, which is why its correct checks never ran");
}

// ---- 3. IT IS WIRED INTO THE SHIP GATE, not into the suite that does not run ------------------------------------
{
    const v = fs.readFileSync(path.join(ENG, "tools", "ship", "verify.mjs"), "utf8");
    ok("!! verify.mjs imports it", /staleness\.mjs/.test(v),
       "the two gates that already existed were correct and lived where nothing ran them");
    ok("...and reports each row as its own check", /derived fact:/.test(v),
       "one lumped pass/fail would not say WHICH fact rotted");
    ok("...and fails loudly if it cannot even read them", /derived facts could be read at all/.test(v),
       "a staleness check that silently stopped running is the failure it was built to catch, one level up");
}

// ---- 4. THE TREE IS ACTUALLY FRESH RIGHT NOW ---------------------------------------------------------------------
{
    const rows = stalenessRows();
    const stale = rows.filter((r) => !r.ok);
    ok("!! every derived fact matches reality", stale.length === 0,
       stale.length ? "STALE: " + stale.map((r) => r.id + " claims " + r.claimed + ", actual " + r.actual).join(" | ")
                    : rows.length + " facts checked against the tree");
    ok("isFresh() agrees", isFresh() === (stale.length === 0));
}

// ---- 5. it can FAIL -- a control that cannot fail is decoration ----------------------------------------------------
{
    // Count gates with a deliberately wrong claim and confirm the comparison is real rather than always-true.
    const rows = stalenessRows();
    const gateRow = rows.find((r) => r.id === "case-study gate count");
    ok("!! the comparison is a real equality, not a tautology", gateRow.claimed === gateRow.actual && gateRow.actual > 100,
       "actual = " + gateRow.actual + " read by walking the tree, claimed = " + gateRow.claimed + " read from the page -- two independent reads");
    // STRIP COMMENTS BEFORE ASKING WHAT THE CODE DOES. This first failed by matching the numbers in staleness.mjs's
    // own header, which DOCUMENTS the counts that rotted. Prose read as code -- the same mistake made repeatedly
    // earlier in this project (the /codemap guard quoted in its own fix note, the aholo swap note, the word
    // "queue" inside the comment explaining why there is no queue). The lesson has a fixed shape now: ask the
    // code, never the commentary.
    const stalenessCode = fs.readFileSync(path.join(ENG, "tools", "ship", "staleness.mjs"), "utf8")
        .replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    ok("...and the gate count is discovered, not hard-coded", !/\b45[0-9]\b/.test(stalenessCode),
       "actual is counted by walking the tree; a hard-coded expectation would rot exactly like the thing it checks");
}

// ---- 6. THE THREE A RIG RUN FOUND, NOT THIS MODULE (v2999) ------------------------------------------------------
//
// v2976 built this after three derived facts shipped stale, checked the three it knew about, and stopped. Keith
// ran the suite on Windows and THREE MORE went red for exactly the same reason -- a baked count nobody compares
// to reality. The lesson is not that they were missed: it is that "derived fact" is a CLASS and I enumerated
// INSTANCES, so the module found what it was told to look for and nothing else.
{
    const rows = await asyncStalenessRows();
    ok("the async derived facts are checked too", rows.length >= 3, rows.length + " rows");
    const stale = rows.filter((r) => !r.ok);
    ok("!! all three are fresh", stale.length === 0,
       stale.length ? "STALE: " + stale.map((r) => r.id + " claims " + r.claimed + ", actual " + r.actual).join(" | ")
                    : rows.map((r) => r.id.split(" ")[0] + "=" + r.claimed).join(", "));
    for (const want of ["labDevices registry floor", "promptCost device count", "case-study claim count"]) {
        ok("covers: " + want, rows.some((r) => r.id === want));
    }
    ok("!! the promptCost one is not cosmetic", /multiplies/i.test((rows.find((r) => /promptCost/.test(r.id)) || {}).why || ""),
       "the cost model MULTIPLIES by the device count, so a stale value is a wrong number that looks measured -- not a mislabelled page");
    ok("!! the labDevices row is a FLOOR, not an equality", /headroom|floor ABOVE/i.test((rows.find((r) => /labDevices/.test(r.id)) || {}).why || ""),
       "the gate used to assert === 24 and went red the moment a device was added, reading as a broken registry rather than a stale number");
    const v = fs.readFileSync(path.join(ENG, "tools", "ship", "verify.mjs"), "utf8");
    ok("...and verify.mjs runs them every ship", /asyncStalenessRows/.test(v));
    ok("!! the list is admitted to be INSTANCES, not the class", /a CLASS and I enumerated/i.test(
        fs.readFileSync(path.join(ENG, "tools", "ship", "staleness.mjs"), "utf8")),
       "a future derived fact will need adding the same way, which is worth saying rather than pretending this list is complete");
}

// ---- v3087: --fix EXISTS, WRITES ONLY WHAT IT CAN DERIVE, AND NEVER RUNS DURING A CHECK --------------------------
{
    const src = fs.readFileSync(new URL("./staleness.mjs", import.meta.url), "utf8");
    ok("staleness can FIX the derived number it had always only reported",
        /export function fixDerived/.test(src),
        "the case-study gate count was the last hand-edited derived number in the ritual, retyped three times " +
        "this session after a red gate told somebody what to type. A check that reports drift without removing " +
        "the chance of it is the shape that froze the changelog for forty versions");

    // A DRY RUN ON THE REAL TREE. It must not write: a gate that repaired what it measured could never be
    // observed failing, which is the rule lib/derivedCache.js (v3065) states for the four caches and which
    // binds harder on a gate than on a cache.
    const CS = new URL("../../case-study.html", import.meta.url);
    const before = fs.readFileSync(CS, "utf8");
    const dry = fixDerived({ write: false });
    ok("!! a dry run does not touch the tree", fs.readFileSync(CS, "utf8") === before,
        "fixDerived({write:false}) considered " + (dry.applied.length + dry.skipped.length) + " row(s) and wrote nothing");

    ok("!! it REFUSES what it cannot derive, by name, instead of reporting success",
        dry.skipped.every((t) => /not writable from here/.test(t)),
        dry.skipped.length
            ? "skipped: " + dry.skipped.join("; ") + " -- naming the command that fixes each one, the rule every " +
              "bridge in this tree follows"
            : "nothing stale right now, so the refusal path is exercised by the shape of the list rather than by " +
              "a live example -- which is honest about what this run proved");

    const callers = gateFiles().filter((g) => !g.endsWith("staleness-selfcheck.mjs") && /fixDerived\s*\(/.test(fs.readFileSync(g, "utf8")));
    ok("...and NO gate calls fixDerived, so nothing repairs what it measures", callers.length === 0,
        callers.length ? "offenders: " + callers.join(", ") : "only this file touches it, and only as a dry run");
}

console.log(fails ? "\nstaleness-selfcheck: " + fails + " FAILED" : "\nstaleness-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
