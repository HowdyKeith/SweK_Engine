// WebGLEngine/tools/ship/proseAudit-selfcheck.mjs — v3298
//
// Run: node tools/ship/proseAudit-selfcheck.mjs   (~6s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// THE ROUND v3177 ASKED FOR AND NOTHING HAD RUN. plasticBind carries the scar: a sentence had to be moved onto
// its own line before its gate could see it, because prose() collected only lines matching ^\s*// and a TRAILING
// comment was invisible. The file's note named the general question and left it open -- "nothing has checked
// whether any of the other gates using sourceScan are vacuous for this reason."
//
// THE ANSWER, MEASURED: no vacuous prose assertion exists in this tree. All 34 are positive assertions, so the
// blind spot made them FAIL loudly rather than pass silently -- a smaller finding than the note feared, and the
// honest one. The shape was still one `!` away from a silent pass, so the blind spot is fixed regardless and
// this gate keeps the answer true.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prose, proseHas, codeOnly } from "./sourceScan.mjs";
import { auditAll, assertionsIn, blindSpotSize } from "./proseAudit.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- 1. THE BLIND SPOT IS CLOSED -----------------------------------------------------------------------------
{
    ok("!! prose() now sees a TRAILING comment (the blind spot plasticBind had to work around)",
       prose("const a = 1; // trailing note") === "trailing note",
       "the matcher was anchored at ^\\s*// , so `code(); // note` returned nothing at all");
    ok("...and still sees a full-line comment and a block comment",
       prose("  // plain") === "plain" && /block/.test(prose("/* block */")));
}

// ---- 2. AND IT DID NOT BUY THAT BY MISREADING CODE AS COMMENT --------------------------------------------------
// Trailing comments need string awareness, which the anchored version got for free by never looking.
{
    const cases = [
        ['const u = "http://example.com";', "a URL inside a string"],
        ["const s = '// not a comment';", "a comment marker inside a string"],
        ["const t = `x // y`;", "a comment marker inside a template literal"],
        ["const re = /a\\/\\/b/;", "an escaped pair inside a regex literal"],
    ];
    const leaked = cases.filter(([src]) => prose(src) !== "");
    ok("!! no `//` inside a string, template or regex literal is read as a comment",
       leaked.length === 0,
       leaked.length ? "LEAKED: " + leaked.map(([s]) => s).join(" | ") : cases.map((c) => c[1]).join(", ") + " — all silent");
    ok("...and a real trailing comment on a line that ALSO contains a string is still found",
       prose('fetch("http://x"); // a cast opens a page') === "a cast opens a page");
}

// ---- 3. THE AUDIT ITSELF: NO VACUOUS ASSERTION IN THE TREE ------------------------------------------------------
{
    const a = auditAll({});
    ok("!! no prose assertion is TRIVIAL (none matches the empty string, so none holds against any file)",
       a.trivial.length === 0, a.trivial.map((r) => r.gate + " /" + r.pattern + "/").join("; ") || a.rows.length + " assertions checked");
    ok("!! none is INVISIBLE (none hunts text prose() cannot see — the plasticBind failure is extinct)",
       a.invisible.length === 0, a.invisible.map((r) => r.gate).join("; ") || "0 of " + a.rows.length);
    ok("!! none is MISDIRECTED (none also matches the CODE, which would test for an identifier while claiming to test for an explanation)",
       a.misdirected.length === 0, a.misdirected.map((r) => r.gate).join("; ") || "0 of " + a.rows.length);
    ok("!! and none is UNMATCHED (no gate is asserting prose its target does not contain)",
       a.unmatched.length === 0, a.unmatched.map((r) => r.gate + " -> " + r.target).join("; ") || "0 of " + a.rows.length);
    ok("the audit actually resolved most of its subjects (an audit that cannot see its subjects is not an audit)",
       a.sound.length >= 20 && a.unresolved.length <= 5,
       a.sound.length + " sound, " + a.htmlUnaudited.length + " HTML (not auditable this way, declared), " +
       a.alternative.length + " OR-branches, " + a.unresolved.length + " unresolved");
}

// ---- 4. THE AUDITOR'S OWN FALSE-FINDING MODES, EACH FIXED AND EACH PINNED ------------------------------------------
// This auditor accused sound gates three separate times before it was right. Every one of those is a shape it
// must keep handling, so each is checked directly rather than trusted to stay fixed.
{
    const src = fs.readFileSync(path.join(HERE, "proseAudit.mjs"), "utf8");
    ok("!! REASSIGNED VARIABLES resolve to the nearest PRECEDING read, not the last one in the file",
       /nearest preceding assignment/i.test(prose(src)) && /function targetAt/.test(src),
       "cast-selfcheck reads server.js into `src` then jellyfinBridge.js into the same name; last-wins graded the early assertions against the late file and called them failures");
    ok("!! OR'd ALTERNATIVES are folded into one claim",
       /a disjunction is satisfied by one branch/i.test(prose(src)),
       "brainWiring asserts the reason is recorded in EITHER file; grading the branches separately accused a passing gate. " +
       "THIS ASSERTION WAS ITSELF CAUGHT BY THE AUDIT: it first hunted a phrase that exists only in a STRING LITERAL " +
       "inside proseAudit.mjs, which prose() cannot see -- the exact plasticBind failure, reproduced by accident and " +
       "found automatically rather than by anyone noticing.");
    ok("!! HTML targets are declared UNAUDITABLE rather than silently graded",
       /HTML IS NOT JAVASCRIPT/i.test(prose(src)),
       "in a .html file the phrase is usually page text, so codeOnly() has nothing to strip and MISDIRECTED would fire on every one");
}

// ---- 5. THE BLIND SPOT HAD A SIZE, AND IT IS RECORDED --------------------------------------------------------------
{
    const b = blindSpotSize({});
    ok("the trailing-comment blind spot is measured rather than described",
       b.gainedChars > 1000 && b.filesGaining > 50,
       "trailing comments added " + b.gainedChars + " characters of prose across " + b.filesGaining + " of " + b.files +
       " files (+" + (b.gainedPct * 100).toFixed(1) + "%) — small in bulk, and it was enough to force a sentence onto its own line in plasticBind");
}

// ---- 6. THE EXTRACTOR FINDS BOTH CALL SHAPES ---------------------------------------------------------------------------
{
    const sample = 'ok("x", proseHas(src, /alpha/i));\nok("y", /beta/.test(prose(other)));';
    const found = assertionsIn(sample);
    ok("both proseHas(src, /re/) and /re/.test(prose(src)) are extracted, with their variables",
       found.length === 2 && found.some((f) => f.source === "alpha" && f.variable === "src") &&
       found.some((f) => f.source === "beta" && f.variable === "other"),
       found.map((f) => f.via + ":" + f.variable).join(", "));
}

console.log(fails ? ("[proseAudit-selfcheck] FAILED " + fails) : "[proseAudit-selfcheck] all passed");
process.exit(fails ? 1 : 0);
