// tools/ship/claimCheck.mjs -- v3742
//
// *** WHAT THIS IS FOR. Across this session the handoff notes were found stale FIVE separate times, and every
// time a HUMAN OR A GREP caught it, never a tool: "pageReach is red at 104 vs 103" (green, and raycast.html
// had been filed SIXTY-EIGHT VERSIONS EARLIER), the v3707 trio, "the flip2d device has no instrument row"
// (it had one), "38 of 79 planted" (stale twice over). A NOTE THAT SURVIVES ITS OWN SUBJECT IS THE MOST
// EXPENSIVE KIND, because it sends somebody to redo closed work. ***
//
// The idea came from ClawMem (yoloshii, MIT), which detects contradictions between a new note and OLD NOTES
// using an LLM plus typed confidence penalties. *** SweK CAN DO SOMETHING STRICTLY STRONGER AND NEEDS NONE OF
// THEIR CODE: THE TREE ITSELF IS THE ANSWER KEY. "1003 gates" is not an opinion to be weighed against another
// opinion -- it is a COUNT, and the count can be re-derived. A claim checked against a model is checked
// against a guess; a claim checked against gateFiles() is checked. ***
//
// *** THE THIRD STATE IS THE WHOLE DESIGN. Every claim lands on AGREES / CONTRADICTED / UNCHECKABLE, and
// UNCHECKABLE IS NOT A PASS. A checker that silently ignored what it could not parse would report a clean bill
// for a file of nonsense -- the PROPOSED/UNGRADABLE/UNMEASURED distinction from v3698, where answering
// "nothing to do" because a census failed to LOAD is the most expensive possible lie because it LOOKS LIKE
// COMPLETION. So the unmatched remainder is COUNTED AND SHOWN. ***
//
// WHAT IT DELIBERATELY DOES NOT DO:
//   - IT DOES NOT EDIT ANYTHING. The curriculum proposer's no-write-path refusal (v3698) applies with full
//     force to anything that rewrites notes: a loop that both writes the record and grades it can mark its own
//     work passed. This module has no write path at all -- asserted by its gate.
//   - IT DOES NOT PARSE PROSE FOR MEANING. It matches a SHORT, NAMED LIST of numeric claim shapes. Prose-as-
//     data is unreadable by any check (twenty-plus instances in these notes), so the honest move is to admit
//     a narrow reader and report everything else as UNCHECKABLE rather than to pretend at comprehension.
//   - IT DOES NOT DECIDE WHO IS WRONG. A contradiction means the note and the tree disagree TODAY. Usually the
//     note is stale; sometimes the tree regressed. NAMING WHICH IS A PERSON'S JOB.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gateFiles } from "./staleness.mjs";
import { head, CHANGELOG_REL } from "./changelogSource.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const ROOT = path.resolve(ENG, "..");

/**
 * THE CLAIM SHAPES. Each is a regex with ONE capturing group holding the stated number, plus a derive() that
 * re-computes the truth FROM THE TREE. Keeping these few and specific is the point: a wide reader would
 * "understand" sentences it has no business understanding.
 * *** EVERY derive() IS THE TREE'S OWN SHARED FUNCTION WHERE ONE EXISTS -- gateFiles() rather than a second
 * spelling of "count the -selfcheck files". A checker that re-implements the thing it checks agrees with
 * itself (v3719: a regex over a registry is a second spelling of that registry). ***
 */
export const CLAIM_SHAPES = [
    {
        id: "gates",
        // *** NARROWED AT v3745 BY A FALSE POSITIVE THE TOOL FOUND IN MY OWN CHANGELOG. The v3745 entry says
        // "405 gates never timed" -- a claim about a SUBSET -- and the reader called it a claim that the build
        // has 405 gates, then CONTRADICTED it. TWO THINGS WEARING ONE LABEL, inside the checker built to catch
        // exactly that, one round after building it.
        // *** THE FIX IS NOT TO REWORD THE CHANGELOG. That is editing the record to please the checker, which
        // this file's own header forbids. The READER was wrong, so the reader narrowed: the number must sit at
        // a CLAUSE BOUNDARY -- end of line, or followed by . , ; ) -- so "1005 gates." reads as a claim and
        // "405 gates never timed" does not. A QUALIFIED PHRASE IS NOT A BARE COUNT. ***
        re: /\b(\d{3,5})\s+gates(?=\s*[.,;)]|\s*$)/gm,
        derive: () => gateFiles().length,
        note: "gateFiles() from staleness.mjs -- the same derivation buildKnowledgeIndex and affected.mjs use",
    },
    {
        id: "deviceNames",
        re: /\bDEVICE_NAMES\s+(\d{1,4})\b/g,
        derive: async () => (await import(pathToFileURL(path.join(ENG, "tools", "roundhouse", "devices.mjs")).href)).DEVICE_NAMES.length,
        note: "the registry's own export, not a regex over it",
    },
    {
        id: "instrumentRows",
        re: /\b(\d{1,4})\s+instrument rows\b/g,
        derive: async () => (await import(pathToFileURL(path.join(ENG, "physics", "instruments.mjs")).href)).INSTRUMENTS.length,
        note: "instruments.mjs's own array length",
    },
];

/**
 * *** A QUOTATION IS NOT A CLAIM, AND THE TOOL FOUND THAT OUT ON ITS OWN CHANGELOG ENTRY. The v3742 entry
 * QUOTES three past numbers as examples of staleness -- "999 gates", "DEVICE_NAMES 84", "150 instrument rows"
 * -- and the first reader called all three CONTRADICTIONS. They are reports of what an older entry said, not
 * assertions about this build. Same shape as the dated-record problem one level up: TWO THINGS WEARING ONE
 * LABEL, here a CLAIM and a QUOTATION OF A CLAIM. ***
 *
 * *** AND THE TEMPTING FIX WAS THE WRONG ONE: I could have deleted the numerals from my own changelog and the
 * tool would have gone green. THAT IS EDITING THE RECORD TO PLEASE THE CHECKER -- reward hacking in miniature,
 * and the exact failure the tennis-xgboost autoresearch run documented. THE RECORD INFORMS THE TOOL, NEVER THE
 * OTHER WAY ROUND. ***
 *
 * Spans inside double quotes are skipped. NARROW ON PURPOSE: it does not try to understand attribution, only
 * to notice quotation marks. A claim someone quotes without them is still read as a claim, and that is a
 * KNOWN LIMIT reported here rather than papered over.
 */
export function quotedSpans(text) {
    const spans = [];
    // *** THE QUOTE IS SPELLED \u0022 ON PURPOSE, AND IT IS NOT STYLE. sourceScan's lexer DESYNCS ON A REGEX
    // LITERAL CONTAINING A QUOTE -- a KNOWN LIMIT these notes name by name -- and the first version of this
    // line (a bare " inside the character class) silently broke codeOnly() FOR THE REST OF THIS FILE, which
    // turned its own gate's mechanism check red. THE DOCUMENTED LIMIT, TRIGGERED BY THE FILE THAT CITES IT. ***
    const re = /\u0022[^\u0022\n]{0,200}\u0022/g;
    let m;
    while ((m = re.exec(text)) !== null) spans.push([m.index, m.index + m[0].length]);
    return spans;
}

/** Pull every claim of a known shape out of a body of text. */
export function extractClaims(text) {
    const out = [];
    const quoted = quotedSpans(text);
    const inQuote = (i) => quoted.some(([a, b]) => i >= a && i < b);
    for (const shape of CLAIM_SHAPES) {
        const re = new RegExp(shape.re.source, "g");
        let m;
        while ((m = re.exec(text)) !== null) {
            if (inQuote(m.index)) continue;
            out.push({ id: shape.id, stated: Number(m[1]), at: m.index, text: m[0] });
        }
    }
    return out;
}

/**
 * *** THE UNCHECKABLE COUNT, AND IT IS DERIVED RATHER THAN GUESSED: every line carrying a digit that produced
 * NO claim. A line with a number this reader did not recognise is exactly the case that must not be silently
 * dropped -- it is where the next stale claim will live. ***
 */
export function unreadableLines(text) {
    const claimed = new Set();
    for (const c of extractClaims(text)) {
        claimed.add(text.slice(0, c.at).split("\n").length - 1);
    }
    const lines = text.split("\n");
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        if (!/\d/.test(lines[i])) continue;      // no number at all -- not a numeric claim, not this tool's business
        if (claimed.has(i)) continue;
        out.push(i + 1);
    }
    return out;
}

/** Re-derive each shape once. A derivation that THROWS is reported, never treated as agreement. */
export async function deriveAll() {
    const truth = {};
    for (const shape of CLAIM_SHAPES) {
        try { truth[shape.id] = { value: await shape.derive(), error: null }; }
        catch (e) { truth[shape.id] = { value: null, error: (e && e.message) || String(e) }; }
    }
    return truth;
}

/**
 * @returns {{ agrees, contradicted, unresolved, uncheckableLines, claims, truth }}
 * `unresolved` = a claim whose OWN derivation failed. That is neither agreement nor contradiction and it gets
 * its own bucket, because folding it into either would be a verdict the run did not earn.
 */
export async function checkText(text) {
    const claims = extractClaims(text);
    const truth = await deriveAll();
    const agrees = [], contradicted = [], unresolved = [];
    for (const c of claims) {
        const t = truth[c.id];
        if (!t || t.error !== null) { unresolved.push({ ...c, why: t ? t.error : "no derivation" }); continue; }
        (c.stated === t.value ? agrees : contradicted).push({ ...c, actual: t.value });
    }
    return { agrees, contradicted, unresolved, uncheckableLines: unreadableLines(text), claims, truth };
}

/**
 * *** THE DISTINCTION THAT ALMOST SHIPPED WRONG, AND IT IS THE OLDEST SHAPE IN THESE NOTES: A DATED RECORD IS
 * NOT A CLAIM ABOUT NOW. My first run pointed this at the newest TWELVE changelog entries and reported TEN
 * CONTRADICTIONS -- "999 gates", "DEVICE_NAMES 84", "150 instrument rows". EVERY ONE OF THOSE WAS TRUE WHEN IT
 * WAS WRITTEN. BACKLOG.md is APPEND-ONLY HISTORY: an entry describes the build it shipped, not this one.
 * Reporting history as contradiction is the same error as a REMEMBERED RESULT read as a CURRENT MEASUREMENT,
 * with the sign flipped -- and it would have made the tool cry wolf on its own changelog forever. ***
 *
 * SO ONLY THE NEWEST ENTRY IS PRESENT-TENSE, and that is enforced here rather than left to whoever passes an
 * argument. Older entries are available as HISTORY, where a disagreement is expected and is reported as DRIFT
 * (interesting: it shows which numbers move) rather than as a defect.
 */
export function isPresentTense(entryIndex) { return entryIndex === 0; }

/** The changelog is the notes that live IN the tree, so it is the corpus this tool can reach. */
export function backlogHead(entries = 1) {
    // *** v4002 -- READ docs/CHANGELOG.md, NOT BACKLOG.md. *** The latter is on no machine and in no commit;
    // this tool has been returning null and exiting 1 with "nothing to check" for as long as that has been
    // true. The split is shared now rather than spelled here: entries are `## Since vNNNN`, and the private
    // `src.split(/^## v/m)` above could not have matched one even after the path was fixed -- TWO bugs, one
    // of which would have hidden the fix for the other.
    return head(ROOT, entries);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    // *** THE CLI TAKES NO ENTRY COUNT FOR THE PRESENT-TENSE CHECK. Passing one was how the false
    // contradictions happened. `--history N` is a SEPARATE, DIFFERENTLY-LABELLED report. ***
    const histArg = process.argv.indexOf("--history");
    const text = backlogHead(1);
    if (!text) { console.log("[claimCheck] " + CHANGELOG_REL + " not found or has no entries -- nothing to check, and that is UNCHECKABLE, not clean"); process.exit(1); }
    checkText(text).then(async (r) => {
        console.log("[claimCheck] the NEWEST changelog entry, read as a claim about THIS build:");
        for (const c of r.agrees) console.log("  AGREES        " + c.text + "   (tree says " + c.actual + ")");
        for (const c of r.contradicted) console.log("  CONTRADICTED  " + c.text + "   *** TREE SAYS " + c.actual + " ***");
        for (const c of r.unresolved) console.log("  UNRESOLVED    " + c.text + "   derivation failed: " + c.why);
        console.log("  UNCHECKABLE   " + r.uncheckableLines.length + " line(s) carry a number this reader does not recognise" +
                    " -- NOT a pass, just unread");
        console.log("[claimCheck] " + r.agrees.length + " agree, " + r.contradicted.length + " contradicted, " +
                    r.unresolved.length + " unresolved");
        if (histArg > 0) {
            const n = Number(process.argv[histArg + 1]) || 10;
            const h = await checkText(backlogHead(n));
            console.log("\n[claimCheck] --history " + n + ": DRIFT, NOT DEFECTS. A changelog entry describes the " +
                        "build it shipped, so a disagreement here is the number MOVING, which is what a changelog is for.");
            for (const c of h.contradicted) console.log("  DRIFT  " + c.text + "   (now " + c.actual + ")");
            console.log("  " + h.agrees.length + " unchanged since they were written, " + h.contradicted.length + " moved");
        }
        process.exit(r.contradicted.length ? 1 : 0);
    });
}
