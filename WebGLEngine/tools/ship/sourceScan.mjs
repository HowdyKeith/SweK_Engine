// WebGLEngine/tools/ship/sourceScan.mjs -- v3045
//
// READ CODE, NOT PROSE. One helper, because I have now made the same mistake four times in one session:
//
//   rleVolumeCache gate   reported a legitimate line because the COMMENT above it quoted the pattern it forbids
//   singleSource gate     reported three files whose headers DOCUMENT the regex they are policing
//   renderQaDoor gate     reported rigRunner.js as a second spawner because it quotes the command in job text
//   rleRegionVolume gate  reported a DOM global because an ERROR MESSAGE contains the word "window"
//
// Every one of those is a gate scanning source text and hitting the sentence that explains the rule instead of a
// violation of it. The failure is systematic, not careless: a gate that forbids an idiom has to NAME that idiom
// to be maintainable, so its own source is guaranteed to contain the thing it looks for. Any gate that greps
// shipping source should strip comments and string literals first, and now there is one place that does it.
//
// Deliberately NOT a parser. It is a lexical strip that handles the three JS string forms and both comment
// forms; it will mangle a regex literal containing a quote, which is why it returns text for GREPPING and must
// never be used to reconstruct runnable code.

/** Source with comments and string/template literals blanked out, line structure preserved. */
export function codeOnly(src) {
    let out = "";
    let i = 0;
    const n = src.length;
    let mode = null;      // null | "line" | "block" | "'" | '"' | "`"
    while (i < n) {
        const c = src[i], d = src[i + 1];
        if (mode === null) {
            if (c === "/" && d === "/") { mode = "line"; i += 2; continue; }
            if (c === "/" && d === "*") { mode = "block"; i += 2; continue; }
            if (c === "'" || c === '"' || c === "`") { mode = c; out += c; i++; continue; }
            out += c; i++; continue;
        }
        if (mode === "line") { if (c === "\n") { mode = null; out += "\n"; } i++; continue; }
        if (mode === "block") { if (c === "*" && d === "/") { mode = null; i += 2; continue; } if (c === "\n") out += "\n"; i++; continue; }
        // inside a string literal
        if (c === "\\") { i += 2; continue; }
        if (c === mode) { out += c; mode = null; i++; continue; }
        if (c === "\n") out += "\n";
        i++;
    }
    return out;
}

/** true when the pattern appears in actual code rather than in a comment or a string. */
export function codeHas(src, re) { return re.test(codeOnly(src)); }

/**
 * v3726 -- THE ARGUMENT OF A CALL WHOSE OPEN PAREN HAS JUST BEEN CONSUMED: walk forward counting parens and
 * stop at the matching close.
 *
 * *** THIS WAS A PRIVATE CONST INSIDE gateQuality-selfcheck AND IS NOW THE ONE DECLARATION, because a second
 * copy of a source-text utility is precisely what v3681 removed when unboundBuiltin was found carrying its own
 * codeOnly that did not strip line comments while its docstring promised to. Two copies of a walker drift the
 * same way and nothing compares them. *** gateQuality imports it now; its census reading is UNCHANGED, which
 * is what its own selfcheck asserts.
 *
 * A FIXED-WIDTH WINDOW CANNOT DO THIS (v3677 measured it): it either truncates a nested call or reaches the
 * next one, and BOTH failures read as a verdict rather than as an error.
 */
export function argOf(src, i) {
    let depth = 1, out = "";
    for (; i < src.length && depth > 0; i++) {
        const c = src[i];
        if (c === "(") depth++;
        else if (c === ")") { depth--; if (!depth) break; }
        out += c;
    }
    return out;
}

/** Lines of real code matching the pattern -- for a gate that wants to REPORT what it found. */
export function codeLines(src, re) {
    return codeOnly(src).split("\n").map((l, i) => ({ line: i + 1, text: l })).filter((r) => re.test(r.text));
}

/**
 * Comments stripped, STRING LITERALS KEPT. v3052 -- codeOnly() blanks strings too, so it cannot see
 * addEventListener("pagehide", ...) at all: the event name IS a string. A gate built on codeOnly to find that
 * listener passed vacuously, and only its own sabotage check exposed it. Use this when the thing you are looking
 * for is TEXT the code contains (an event name, a URL, a route); use codeOnly when it is an IDIOM.
 */
export function noComments(src) {
    let out = "", i = 0, mode = null;
    while (i < src.length) {
        const c = src[i], d = src[i + 1];
        if (mode === null) {
            if (c === "/" && d === "/") { mode = "line"; i += 2; continue; }
            if (c === "/" && d === "*") { mode = "block"; i += 2; continue; }
            if (c === "'" || c === '"' || c === "`") { mode = c; out += c; i++; continue; }
            out += c; i++; continue;
        }
        if (mode === "line") { if (c === "\n") { mode = null; out += "\n"; } i++; continue; }
        if (mode === "block") { if (c === "*" && d === "/") { mode = null; i += 2; continue; } if (c === "\n") out += "\n"; i++; continue; }
        out += c;
        if (c === "\\") { out += src[i + 1] || ""; i += 2; continue; }
        if (c === mode) mode = null;
        i++;
    }
    return out;
}

/**
 * v3090 -- 46 INSTANCES OF ONE SHAPE IS A MISSING PRIMITIVE, NOT 46 MISTAKES.
 *
 * The prose-as-code trap has been hit eleven times and RATCHETED since v3071 at 46 gates that hunt a sentence in
 * shipping source with a long contiguous regex. Every one breaks the same way: a comment gets re-wrapped across
 * two lines during an edit, the sentence is still present and still correct, and the regex stops matching text
 * that never changed meaning. The gate then reports the code as undocumented.
 *
 * Each of those 46 could be fixed by hand with `src.replace(/\n\s*\/\/\s?/g, " ")`, and v3084 is the argument
 * against doing only that: the reason people keep writing the fragile form is that it is the shortest thing to
 * type. MAKE THE CORRECT ONE THE EASY ONE. `prose(src)` is one call and it is what a gate wants nearly every
 * time it reaches for a comment -- the comment text, with line-wrapping and indentation gone, so a regex sees
 * the sentence the author wrote rather than the shape the editor left it in.
 *
 * DELIBERATELY NOT codeOnly's INVERSE. codeOnly() blanks comments AND strings to ask "is this idiom in the
 * code"; noComments() drops comments to ask "does the code contain this text". prose() keeps ONLY comments, so a
 * gate asking "does this file EXPLAIN itself" cannot accidentally match the implementation it is asking about --
 * which is the mirror of the trap, and would pass for exactly the wrong reason.
 */
// v3286 -- *** TRAILING COMMENTS WERE INVISIBLE, AND THAT WAS THE BLIND SPOT v3177 NAMED. ***
// The line matcher was /^\s*\/\/\s?(.*)$/ -- anchored at the start of the line -- so `code(); // note` returned
// nothing at all. plasticBind carries the scar: a sentence had to be MOVED ONTO ITS OWN LINE for its gate to be
// able to see it, and the file says so. A gate hunting a trailing comment could never match, which for a
// POSITIVE assertion means a loud failure and for a NEGATED one would mean a silent pass. (Audited: all nine
// prose assertions in this tree are positive, so nothing was passing vacuously -- but the shape was one
// `!` away from it, and the fix is the same either way.)
//
// TRAILING COMMENTS NEED STRING AWARENESS, which the anchored version got for free by never looking: `"http://x"`
// and `const re = /a\/\/b/` both contain `//` and neither is a comment. So the scan walks the line tracking
// quote and regex-literal state instead of reaching for a regex, because the thing being parsed is exactly the
// thing regexes are bad at.
function stripToComment(line) {
    let inS = null, esc = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (esc) { esc = false; continue; }
        if (c === "\\") { esc = true; continue; }
        if (inS) { if (c === inS) inS = null; continue; }
        if (c === '"' || c === "'" || c === "`") { inS = c; continue; }
        if (c === "/" && line[i + 1] === "/") return line.slice(i + 2);
        // a regex literal: skip to its close so a `//` inside it is not read as a comment
        if (c === "/" && /[=(,:[!&|?{;]\s*$/.test(line.slice(0, i))) {
            let j = i + 1, e = false;
            for (; j < line.length; j++) {
                if (e) { e = false; continue; }
                if (line[j] === "\\") { e = true; continue; }
                if (line[j] === "/") break;
            }
            i = j;
        }
    }
    return null;
}
export function prose(src) {
    const out = [];
    // line comments AND trailing comments, with the marker and leading indentation stripped so wrapping collapses
    for (const line of String(src).split(/\r?\n/)) {
        const m = line.match(/^\s*\/\/\s?(.*)$/);
        if (m) { out.push(m[1]); continue; }
        const t = stripToComment(line);
        if (t !== null) out.push(t.replace(/^\s/, ""));
    }
    // block comments, flattened the same way
    for (const m of String(src).matchAll(/\/\*[\s\S]*?\*\//g)) {
        out.push(m[0].replace(/^\/\*+|\*+\/$/g, "").replace(/^\s*\*\s?/gm, ""));
    }
    return out.join(" ").replace(/\s+/g, " ").trim();
}

/** Ask whether the file EXPLAINS something, immune to how the comment happens to be wrapped. */
export function proseHas(src, re) { return re.test(prose(src)); }
