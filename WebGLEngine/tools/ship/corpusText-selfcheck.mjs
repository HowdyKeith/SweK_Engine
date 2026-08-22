// tools/ship/corpusText-selfcheck.mjs
//
// Run: node tools/ship/corpusText-selfcheck.mjs   (~0.6s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3099 -- A RESEARCH AGENT NEEDS TEXT, AND THE DASHBOARD IS NOT TEXT.
//
// Keith worked out why local-deep-researcher pointed at server.html would not work: it is a LIVE DASHBOARD that
// renders from API calls at runtime, so a crawler gets a shell with a script tag. Correct, and worth a number:
// server.html is 480,729 bytes and yields about 18,000 after script, style and markup are stripped -- and what
// survives is menu labels and button captions. A crawler pointed at the richest surface in the project reads a
// navigation bar.
//
// THE TEXT WAS NEVER MISSING. BACKLOG.md alone is 2.1 MB of prose about why every decision was made, including
// the negative results, which are the part no other artifact records. It was simply never served AS text.
// corpus.mjs concatenates the sources Keith named, labels each block with its provenance and the reason it is
// included, and writes WebGLEngine/corpus.txt -- which the bridge already serves, so the thing has a URL rather
// than being a file somebody has to be told about.
//
// v3900 -- textYield NOW TAKES { html } AND THE CORPUS PASSES false. The paragraph below describes what it
// does to an HTML DASHBOARD, which is still exactly right for server.html and no longer applies to the corpus:
// Markdown and JSON have no markup to strip, and every `<` in the changelog is prose. Applying the HTML rules
// to it removed 95% of BACKLOG.md and the corpus SHIPPED that way -- see corpus.mjs's note at textYield.
//
// WHAT textYield DOES AND DOES NOT MEASURE, because a ratio is easy to over-read. It strips script and style
// ELEMENTS and then all markup, and answers "how much of this file survives as prose". That is a DETECTOR FOR
// MARKUP SHELLS. Applied to plain text it UNDER-reports, because angle brackets in prose and in code samples
// get eaten as if they were tags -- the corpus scores about 52% for exactly that reason, not because half of it
// is markup. So the assertion below is on ABSOLUTE READABLE BYTES, with the ratio used only where it is doing
// the job it is good at: telling a dashboard apart from a document.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCorpus, corpusSources, textYield } from "./corpus.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const { text, blocks, missing } = buildCorpus();
const corpus = textYield(text, { html: false });   // v3900 -- Markdown + JSON, not markup
const dash = textYield(fs.readFileSync(path.join(ENG, "server.html"), "utf8"));

// ---- 1. THE FINDING, MEASURED -------------------------------------------------------------------------------------
{
    ok("!! server.html is a dashboard, not a document",
        dash.ratio < 0.10,
        dash.bytes + " bytes yielding " + dash.text + " of text (" + (100 * dash.ratio).toFixed(1) + "%). This is " +
        "the number behind Keith's diagnosis: a crawler pointed at it gets a shell, and what little survives is " +
        "button captions rather than content");

    ok("!! the corpus carries two orders of magnitude more readable text",
        corpus.text > 50 * dash.text,
        corpus.text.toLocaleString() + " readable bytes against the dashboard's " + dash.text.toLocaleString() +
        " -- " + Math.round(corpus.text / dash.text) + "x. THE TEXT WAS NEVER MISSING; BACKLOG.md alone is 2.1 MB " +
        "of reasoning. It was never served as text");

    // THE RATIO IS NOT A QUALITY SCORE AND THIS FILE REFUSES TO TREAT IT AS ONE.
    ok("...and the corpus ratio is BELOW 100% for a stated reason, not a suspicious one",
        corpus.ratio > 0.4 && corpus.ratio < 1.0,
        (100 * corpus.ratio).toFixed(1) + "%. WHAT IS LEFT IS WHITESPACE COLLAPSE AND NOTHING ELSE: the corpus " +
        "is Markdown and JSON, so textYield is called with html:false and no tag rule touches it. *** UNTIL " +
        "v3900 THIS READ 10.6% AND THE NOTE HERE BLAMED ANGLE BRACKETS. IT WAS THE <script> RULE, which ate " +
        "3,447,633 characters -- 95% -- of BACKLOG.md, because the changelog DISCUSSES `<script src>` and a " +
        "non-greedy span closed on a </script> thousands of lines later. v3126 learned that exact shape when " +
        "the same construction deleted 965,179 characters of server.js, and this file kept it. *** The ratio " +
        "stays below 100% because collapsing runs of whitespace is real, and the assertion above is on " +
        "absolute bytes because a ratio was never the claim");
}

// ---- 2. EVERY BLOCK SAYS WHERE IT CAME FROM AND WHY ----------------------------------------------------------------
{
    ok("every source states its reason for being included",
        corpusSources().every((s) => typeof s.why === "string" && s.why.length > 40),
        corpusSources().length + " sources. A block with no stated reason is a block nobody can prune later, and " +
        "a corpus that grows without justification becomes the dashboard problem in a different form");

    ok("the corpus labels each block's provenance in the output",
        (text.match(/^SOURCE: /gm) || []).length === blocks,
        blocks + " labelled blocks. An agent quoting this needs to know whether a line came from the changelog " +
        "or from a derived index -- one is somebody's reasoning, the other is a machine's summary of it");

    ok("!! a missing source is SKIPPED and NAMED, never faked",
        missing.length === 0,
        missing.length ? "missing: " + missing.join(", ") : "all " + blocks + " sources present. A corpus that " +
        "silently omitted a file would leave an agent confidently answering from a hole");
}

// ---- 3. IT DOES NOT PRE-DECIDE WHAT MATTERS -------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(HERE, "corpus.mjs"), "utf8");
    ok("!! the builder does not summarise, rank or excerpt",
        !/\.slice\(0,\s*\d{2,}\)/.test(src.replace(/\/\/.*$/gm, "")) && /raw\.trim\(\)/.test(src),
        "whole files, concatenated. A research agent does its own reading -- a corpus that pre-decided what " +
        "mattered would be answering the question it was fetched to help with, and would do it invisibly");

    ok("...and it is served rather than merely written",
        /corpus\.txt/.test(src) && /WebGLEngine/.test(src),
        "written into WebGLEngine/, which the bridge already serves, so the artifact has a URL. For a thing " +
        "whose entire purpose is to be fetched, the URL IS the front door -- rendering it in a page would be " +
        "the dashboard problem all over again");
}

console.log();
if (fails) { console.log("corpusText-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("corpusText-selfcheck: all checks pass");
