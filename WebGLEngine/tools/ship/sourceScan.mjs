// WebGLEngine/tools/ship/sourceScan.mjs -- v3045, regex-literal-aware since v4031
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
// Deliberately NOT a parser. It is a lexical strip that handles the three JS string forms, both comment forms,
// and (since v4031) regex literals well enough not to desync on one.
//
// *** v4031 -- "IT WILL MANGLE A REGEX LITERAL CONTAINING A QUOTE" WAS NOT A CORNER CASE. IT WAS THE WHOLE FILE,
// AND 179 OTHERS. *** ai-bridge/gpuBrainBridge.js has, at what was then line 269, `.replace(/^["']|["']$/g, "")`.
// The old lexer had no notion of a regex literal at all: it saw a bare `/` that was neither `//` nor `/*` and
// fell through as a plain character, so when it reached the `'` sitting inside the character class `["']` it
// spuriously OPENED STRING MODE -- and then hunted for the next matching quote ANYWHERE LATER IN THE FILE. From
// that point every codeOnly()/noComments() caller was reading garbage for the rest of the file, silently: a
// gate hunting a FORBIDDEN pattern past that point would find nothing, not because nothing was there but
// because the lexer had stopped looking at real code at all. Measured across this tree: 180 files mis-lexed the
// same way, including tools/ship/proseAudit.mjs, whose own main block sourceScan-selfcheck.mjs's v3681 test
// already named as a casualty by number rather than fixing.
//
// THE HEURISTIC, LIFTED FROM prose()'S OWN stripToComment() BELOW RATHER THAN INVENTED FRESH: a bare `/` starts
// a regex literal, not division, when the code immediately before it ends with one of `= ( , : [ ! & | ? { ;`
// (an operator or opener -- the position after those can only be the START of an expression) OR with one of a
// short list of keywords that also start an expression (return/typeof/instanceof/in/of/new/delete/void/throw/
// yield/case/do/else/default/await). That second half is NEW here: stripToComment's punctuation-only version
// would miss `return /^x/.test(s)`, and MEASURED across this tree, "return /" appears as literal text in 46
// files -- common enough that punctuation alone was not going to be enough for the general case, even though
// it happened to be enough for THIS bug's one trigger (which sits right after `.replace(`).
//
// NOT A FULL PARSER, AND SAID SO: `x = 5\n/foo/.test(a)` -- a regex-literal STATEMENT immediately after a bare
// numeric literal with no semicolon -- will still misread as division, because nothing here tracks automatic
// semicolon insertion. That pattern does not occur searched for across this tree; the old, total failure on
// ANY quote-bearing regex was categorically worse and is what this closes.
const REGEX_ALLOWED_KEYWORDS = new Set([
    "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw",
    "yield", "case", "do", "else", "default", "await",
]);

/**
 * Would a bare `/` at the current position start a REGEX LITERAL rather than mean division/an operator, judged
 * from `out` -- the text already emitted by the scanner up to (not including) this `/`. Looks only at the
 * trailing run of non-whitespace in `out`, mirroring stripToComment()'s line-local version but over the whole
 * stream rather than one line, and extended with the keyword list above.
 */
function regexAllowedHere(out) {
    let j = out.length - 1;
    while (j >= 0 && /\s/.test(out[j])) j--;
    if (j < 0) return true;                              // start of file/expression: nothing to divide
    const c = out[j];
    if (/[A-Za-z0-9_$]/.test(c)) {
        let k = j;
        while (k >= 0 && /[A-Za-z0-9_$]/.test(out[k])) k--;
        const word = out.slice(k + 1, j + 1);
        if (/^[0-9]/.test(word)) return false;             // a NUMBER just ended: division
        return REGEX_ALLOWED_KEYWORDS.has(word);           // an IDENTIFIER ended: regex only after a keyword that starts an expression
    }
    if (c === ")" || c === "]") return false;              // a grouped or indexed VALUE just ended: division
    return true;                                            // an operator/opener (or `}` closing a block): regex allowed
}

/**
 * Given `src` and the index of a `/` already judged a regex start, locate its closing `/` and the end of its
 * trailing flags. CHARACTER-CLASS AWARE: a `/` inside `[...]` (e.g. `/[/]/`) does not end the literal, which
 * stripToComment()'s own inline version below was NOT, before this became the one place both live.
 *
 * Returns null when no legitimate close is found before a literal newline -- a regex literal cannot contain
 * one unescaped, so hitting one means the `/` was misjudged as a regex start. THAT IS THE SAFETY VALVE: a
 * caller that gets null falls back to treating the `/` as a plain character, so a wrong "yes" here can never
 * cost more than the one `/` it was wrong about -- never a cascade through the rest of the file.
 *
 * @returns {{closeAt:number, end:number}|null} closeAt is the index OF the closing `/`; end is just past the
 *          trailing flags (so `src.slice(i, end)` is the whole literal, and `src.slice(closeAt, end)` is just
 *          "/" + flags, which is what a caller blanking the body wants to keep).
 */
function regexBody(src, i) {
    let j = i + 1, inClass = false;
    for (; j < src.length; j++) {
        const c = src[j];
        if (c === "\n") return null;
        if (c === "\\") { j++; continue; }
        if (c === "[") { inClass = true; continue; }
        if (c === "]") { inClass = false; continue; }
        if (c === "/" && !inClass) break;
    }
    if (j >= src.length || src[j] !== "/") return null;
    const closeAt = j;
    let end = j + 1;
    while (end < src.length && /[a-zA-Z]/.test(src[end])) end++;   // trailing flags: g, i, m, s, u, y...
    return { closeAt, end };
}

/** Source with comments, string/template literals, and regex literal BODIES blanked out (delimiters and flags
 *  kept, as with a string's quotes), line structure preserved. */
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
            if (c === "/" && regexAllowedHere(out)) {
                const r = regexBody(src, i);
                if (r) {
                    // BLANKED LIKE A STRING'S CONTENT: keep the opening "/", the closing "/", and any flags --
                    // drop the pattern between them. "/" + (closing "/" through end of flags) does exactly that.
                    out += "/" + src.slice(r.closeAt, r.end);
                    i = r.end;
                    continue;
                }
            }
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
            if (c === "/" && regexAllowedHere(out)) {
                const r = regexBody(src, i);
                // KEPT VERBATIM, unlike codeOnly: this function only strips comments, never content -- a
                // regex literal's pattern is TEXT the code contains, the same reasoning that keeps string
                // contents here (v3052, in this function's own docstring below).
                if (r) { out += src.slice(i, r.end); i = r.end; continue; }
            }
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
//
// v4031 -- USES THE SHARED regexAllowedHere/regexBody NOW, not its own weaker inline version. The inline
// version's punctuation-only heuristic (no keywords, so `return /x\/y/` would misjudge the `/` after "return"
// as division) and its char-class-blind scan (a `/` inside `[...]` would end the literal early) were BOTH
// narrower than what codeOnly()/noComments() now need, and a prior version of this file carried three
// independently-drifting regex-literal heuristics for the same question. One is enough.
function stripToComment(line) {
    let inS = null, esc = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (esc) { esc = false; continue; }
        if (c === "\\") { esc = true; continue; }
        if (inS) { if (c === inS) inS = null; continue; }
        if (c === '"' || c === "'" || c === "`") { inS = c; continue; }
        if (c === "/" && line[i + 1] === "/") return line.slice(i + 2);
        if (c === "/" && regexAllowedHere(line.slice(0, i))) {
            const r = regexBody(line, i);
            if (r) i = r.end - 1;   // -1: the for-loop's own i++ lands exactly at end
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
