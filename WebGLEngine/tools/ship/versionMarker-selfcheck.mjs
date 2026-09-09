// WebGLEngine/tools/ship/versionMarker-selfcheck.mjs -- v4556
//
// Run: node tools/ship/versionMarker-selfcheck.mjs
//
// GATES tools/ship/versionMarker.js, the one definition of how to read a version marker out of a source file
// -- and, more importantly, RATCHETS the tree against growing a thirty-second one.
//
// The ship ritual PREPENDS a changelog block above main.js's `const ENGINE_VERSION`, and each block opens with
// a commented copy of the previous constant. So the live declaration sits BELOW its own history, and an
// unanchored reader takes the oldest comment. brain/brain.js has the same shape for BRAIN_BUILD, with
// commented copies on BOTH sides of the live line.
//
// *** MEASURED AT v4556: 51 REGEX READERS OF THESE MARKERS IN CODE, OF WHICH 32 RETURNED THE COMMENT -- v4487,
// EIGHT ROUNDS STALE -- ACROSS 31 FILES. *** Several are user-facing (status.mjs, ledger.mjs, emitOKF.mjs,
// fingerprintBridge.js), so reports, ledger entries, OKF bundles and fingerprints carried a version the tree
// had left behind.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import VM from "./versionMarker.js";
import { stripComments } from "../../vba/runtimeGap.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

console.log("versionMarker-selfcheck -- one definition of how to read a version marker\n");

// *** THE ONE FILE ALLOWED A SECOND SPELLING, BY NAME AND WITH ITS REASON. *** An exemption list that is not
// itself checked is how a ratchet turns into a wish, so this is one entry and the gate proves it EARNS it.
const EXEMPT = Object.freeze({
    "tools/ship/releaseLedger-selfcheck.mjs":
        "its subject IS the difference between an anchored read and an unanchored one, so it must hold both " +
        "spellings itself -- pointing both at the shared pattern made its own contrast vacuous",
});

// A second kind of holder, which is NOT a reader at all: a gate that searches another file's SOURCE for a
// marker pattern. It never runs the pattern against a version file, so it cannot return a stale answer.
const SEARCHERS = Object.freeze({
    "tools/roundhouse/androidUpdate-selfcheck.mjs":
        "it tests that androidUpdate.mjs reads the version at all, by looking for the pattern in its text -- " +
        "so the pattern is a needle here rather than a reader, and it was updated at v4556 to look for the " +
        "shared reader first because the conversion had left its original arm dead",
});

// =============================================================================================================
console.log("1. *** THE LIVE DECLARATION SITS BELOW ITS OWN COMMENTED HISTORY, WHICH IS THE WHOLE TRAP ***");
{
    const src = [
        '// const ENGINE_VERSION = "v4487";   // v4487 -- a changelog block the ritual prepends',
        '// const ENGINE_VERSION = "v4476";   // v4476 -- and another',
        'const ENGINE_VERSION = "v4535";   // v4535 -- the live one',
        '// const ENGINE_VERSION = "v4534";   // v4534 -- and one BELOW it too, as brain.js really has',
    ].join("\n");
    const loose = (src.match(/ENGINE_VERSION\s*=\s*"(v\d+)"/) || [])[1];
    const shared = VM.parseMarker(src, "ENGINE_VERSION");
    say(`an unanchored read of this fixture returns ${loose}; the shared reader returns ${shared}`);
    ok("!! *** THE UNANCHORED PATTERN TAKES THE OLDEST COMMENT AND THE SHARED ONE TAKES THE LIVE LINE ***",
        loose === "v4487" && shared === "v4535",
        `${loose} against ${shared}. This fixture is main.js's real shape: the ritual prepends above the ` +
        `constant, so "first match" means "oldest comment". Eight rounds of drift in the tree's own reading ` +
        `of itself, and every consumer downstream stamped with it.`);
    ok("!! ...and BOTH halves of the pattern are load-bearing, driven one at a time",
        (() => {
            const noNegLookahead = (src.match(/^.*ENGINE_VERSION\s*=\s*"(v\d+)"/m) || [])[1];   // m but no (?!//)
            const noMultiline = (src.match(/^(?!\s*\/\/).*ENGINE_VERSION\s*=\s*"(v\d+)"/) || [])[1];  // (?!//) but no m
            return noNegLookahead === "v4487" && noMultiline === undefined;
        })(),
        "dropping the comment lookahead gives v4487 -- `^` with `m` still matches the comment's own line. " +
        "Dropping the `m` flag gives NOTHING, because `^` then means string-start and the first line is a " +
        "comment. Neither half is decoration and a fixture that only removed one would miss the other.");
    ok("...and a file with no marker at all answers empty rather than throwing",
        VM.parseMarker("const SOMETHING_ELSE = 1;", "ENGINE_VERSION") === "" &&
        VM.parseMarker(null, "ENGINE_VERSION") === "",
        "readers all over this tree call these with whatever readFileSync gave them, so the empty answer is " +
        "the contract rather than a courtesy.");
}

// =============================================================================================================
console.log("\n2. *** IT READS THE REAL TREE, AND BOTH MARKERS HAVE THE SAME TRAP ***");
{
    const ev = VM.engineVersion(ENG), bb = VM.brainBuild(ENG);
    const mainSrc = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
    const brainSrc = fs.readFileSync(path.join(ENG, "brain", "brain.js"), "utf8");
    const looseE = (mainSrc.match(/ENGINE_VERSION\s*=\s*"(v\d+)"/) || [])[1];
    const looseB = (brainSrc.match(/BRAIN_BUILD\s*=\s*"(v\d+)"/) || [])[1];
    say(`main.js: shared ${ev}, unanchored ${looseE};  brain/brain.js: shared ${bb}, unanchored ${looseB}`);
    ok("!! *** ON THE REAL FILES THE TWO READINGS STILL DISAGREE, so this is not a fixture-only defect ***",
        /^v\d+$/.test(ev) && /^v\d+$/.test(bb) && looseE !== ev && looseB !== bb,
        `the tree is at ${ev} and an unanchored reader of main.js says ${looseE}; brain is at ${bb} and an ` +
        `unanchored reader says ${looseB}. IF THIS ROW EVER GOES GREEN BY THE TWO AGREEING, the changelog ` +
        `convention has changed and this whole ratchet should be re-examined rather than trusted.`);
    ok("...and the two markers agree with each other, which is what the ship ritual bumps together",
        ev === bb,
        `ENGINE_VERSION ${ev} and BRAIN_BUILD ${bb}. They are bumped as a pair; a disagreement here means one ` +
        `of the two bumps was missed, which is a different defect this row would surface.`);
}

// =============================================================================================================
console.log("\n3. *** THE RATCHET: NO SECOND SPELLING MAY COME BACK, AND THE ONE EXEMPTION MUST EARN IT ***");
{
    const SKIP = /node_modules|\.git|vendor|dist|build|\.min\./;
    const files = [];
    (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name); if (SKIP.test(p)) continue;
        if (e.isDirectory()) walk(p); else if (/\.(mjs|js|cjs)$/.test(e.name)) files.push(p); } })(ENG);
    // *** COMMENTS ARE STRIPPED FIRST. *** main.js's changelog QUOTES these patterns in prose, and the first
    // pass of this round's census counted that prose as readers -- three phantom offenders in main.js alone and
    // three more in brain/brain.js, an 87/44/35 reading where the truth is 51/32/31. Counting a pattern
    // narrated in a comment as an instance of the pattern is this tree's most repeated census defect.
    // *** THE RATCHET MUST MATCH A CAPTURING READER, NOT ANY MENTION. *** The first draft flagged 18 files
    // and 8 of them were not readers at all: `/ENGINE_VERSION_FOR_HISTORY/` and `/ENGINE_VERSION_FOR_BENCH/`
    // look up a FUNCTION NAME, `/no ENGINE_VERSION marker/` and `/not readable here|no ENGINE_VERSION/` match
    // MESSAGES, `/root:|ENGINE_VERSION|"name"/` is an alternation over text, and one gate searches source for
    // the pattern with every metacharacter ESCAPED. A ratchet that cries on those gets switched off, so it is
    // narrowed to the shape that actually reads a marker: a quoted "v<digits>" CAPTURE beside the marker name.
    const LOOSE = /\/[^\/\n]*(?:ENGINE_VERSION|BRAIN_BUILD)[^\/\n]{0,24}=[^\/\n]{0,16}\\d/;
    const offenders = [];
    for (const f of files) {
        const rel = path.relative(ENG, f).replace(/\\/g, "/");
        if (rel === "tools/ship/versionMarker.js" || rel === "tools/ship/versionMarker-selfcheck.mjs") continue;
        const code = stripComments(fs.readFileSync(f, "utf8"));
        if (LOOSE.test(code)) offenders.push(rel);
    }
    const unexpected = offenders.filter((f) => !(f in EXEMPT) && !(f in SEARCHERS));
    say(`${files.length} source files scanned; ${offenders.length} still spell a marker pattern themselves`);
    ok("!! *** NO FILE OUTSIDE THE NAMED EXEMPTION SPELLS A MARKER PATTERN OF ITS OWN ***",
        unexpected.length === 0,
        unexpected.length ? "UNEXPECTED: " + unexpected.join(", ")
            : `the only file that still does is ${Object.keys(EXEMPT).join(", ")}, and it is exempt because ` +
              `${Object.values(EXEMPT)[0]}. 31 files were converted at v4556; this row is what stops a ` +
              `thirty-second appearing, which is how the first thirty-one appeared.`);
    ok("!! ...and the exemption is EARNED, not asserted: that file's two spellings really do disagree",
        (() => {
            const rel = Object.keys(EXEMPT)[0];
            const code = stripComments(fs.readFileSync(path.join(ENG, rel), "utf8"));
            const lits = [...code.matchAll(/\/(?:[^\/\\\n]|\\.)*ENGINE_VERSION(?:[^\/\\\n]|\\.)*\/[gimsuy]*/g)]
                .map((m) => m[0]);
            if (lits.length < 2) return false;
            const mainSrc = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
            const answers = new Set(lits.map((l) => {
                const b = l.lastIndexOf("/");
                let re; try { re = new RegExp(l.slice(1, b), l.slice(b + 1).replace("g", "")); } catch { return null; }
                return (mainSrc.match(re) || [])[1] ?? null;
            }));
            return lits.length === 2 && answers.size === 2;
        })(),
        "an exemption nobody checks is how a ratchet becomes a wish. Its two literals are run against the real " +
        "main.js and must return DIFFERENT answers -- if they ever agree, that gate has stopped proving " +
        "anything and its exemption expires with it.");
}

// =============================================================================================================
console.log("\n4. *** AND THE CONVERTED READERS STILL ANSWER IN THE SHAPE THEIR CALLERS EXPECT ***");
{
    // Three call sites consumed DIGITS, because their old pattern captured `v(\d+)`. The shared pattern
    // captures `(v\d+)`, so those sites strip the v -- and a conversion that missed one would hand parseInt
    // the string "v4535" and get NaN, silently, in a version number nobody looks at twice.
    const mainSrc = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
    const captured = (mainSrc.match(VM.markerRe("ENGINE_VERSION")) || [])[1];
    const asDigits = parseInt(String(captured).replace(/^v/, ""), 10);
    say(`the shared pattern captures ${JSON.stringify(captured)}; the numeric consumers want ${asDigits}`);
    ok("!! the shared capture keeps the v, and stripping it gives a real number rather than NaN",
        captured === VM.engineVersion(ENG) && Number.isFinite(asDigits) && asDigits > 4000,
        `parseInt("${captured}", 10) alone is ${parseInt(captured, 10)} -- NaN -- which is what the three ` +
        `digit-consuming sites (codemapBridge, sysadminBridge, releaseLedger) would have silently become. ` +
        `That is the failure a mechanical conversion produces and a syntax check cannot see.`);
    const numeric = ["ai-bridge/codemapBridge.js", "ai-bridge/sysadminBridge.js"];
    ok("...and both numeric consumers strip it explicitly, in code, rather than by luck",
        numeric.every((rel) => /replace\(\/\^v\/, ""\)/.test(fs.readFileSync(path.join(ENG, rel), "utf8"))),
        numeric.join(" and ") + " each call parseInt on a v-stripped string. Named here so that moving one " +
        "back to the raw capture goes red rather than returning NaN into a report.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\n*** WHAT THE CONVERSION EXPOSED, WHICH IS WORTH MORE THAN THE CONVERSION: *** " +
    "tools/ship/registerDrift-selfcheck.mjs holds the register's audit to being no more than 12 rounds old, " +
    "and it was GREEN -- because its reader returned v4487 and the audit was frozen at v4487, so a stale " +
    "record measured against a stale reading of the tree reported zero drift. Fixing the reader made it say " +
    "48 rounds, which was true all along. A freshness check whose clock is as stale as the thing it checks " +
    "cannot fire, and nothing but a correct reader would ever have shown it. " +
    "\nNOT DONE HERE: the artefacts already emitted under the wrong reading -- OKF bundles, ledger entries, " +
    "fingerprints, bench collections -- are NOT retro-corrected. They record what the tree said at the time, " +
    "and rewriting them would be inventing a history in which this defect never happened.");
process.exit(fails ? 1 : 0);
