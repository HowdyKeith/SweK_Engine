// WebGLEngine/tools/ship/constantRows.mjs -- GATE ROWS WHOSE CONDITION CANNOT FAIL BECAUSE OF ANYTHING IN
// THIS TREE: the assertion is arithmetic over constants and built-in globals, and nothing else.
//
// *** THIS SESSION WROTE TWO OF THEM IN THREE ROUNDS AND FOUND BOTH BY SABOTAGE RATHER THAN BY READING. ***
//
//   v4648  a row meant to hold render/visibility.mjs's packer to an unsigned result asserted
//          `near > 0 && near < 4294967296 && shifted < 0`, where `shifted` was computed IN THE GATE. The
//          module-testing half saved it, but half the condition was a fact about JavaScript.
//   v4650  a row meant to hold render/edgeReveal.mjs's rounding convention read
//          `Math.round(2.5) !== Math.ceil(2.5 - 0.5)` and never called edgeColumn at all. A mutation
//          swapping the module's ceil for Math.round scored ZERO failing rows.
//
// Twice is a pattern and the tree had no detector for it, so this is the detector. It is deliberately the
// NARROWEST predicate that catches both: every free identifier in the condition is a built-in global. A row
// reading `reads === 0` is not flagged -- `reads` holds something the gate computed -- and that is why the
// obvious looser predicate was rejected. MEASURED: "the condition names no IMPORTED symbol" flags 21,533 of
// 28,865 rows, 75%, because most rows legitimately test a local holding a module's result. This one flags 5.
//
// ---- *** AND MOST OF WHAT IT FINDS IS NOT A DEFECT, WHICH IS THE POINT OF NAMING RATHER THAN CONDEMNING ***
//
// A gate whose module depends on a language guarantee is entitled to assert that guarantee, and four of the
// five do exactly that, each paired with a row that uses the module:
//
//   bz/tools/bz-protocol-selfcheck.mjs     a metre packs to 49 in double -- next row packs it to 50 in float32
//   tools/ship/grassField-selfcheck.mjs    ^ and imul truncate past 2^32, "which is what rescues it"
//   tools/ship/meshBVH-selfcheck.mjs  x2   0 * Infinity is NaN, and NaN fails every comparison
//
// The fifth was a stub: `ok("a no-model-pinned fleet is still READY...", (() => { return true; })())`, whose
// claim the very next row already made properly. It was removed in the round that added this file.
//
// So the census reports and ratchets; it does not judge. What it makes impossible is a row of this shape
// arriving unnoticed, which is the only thing that went wrong twice.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { codeOnly, regexAllowedHere, regexBody } from "./sourceScan.mjs";

/**
 * Identifiers that carry no information from the tree.
 *
 * *** globalThis IS DELIBERATELY ABSENT, AND ITS ABSENCE IS A MEASURED CORRECTION. *** The first draft listed
 * it and flagged tools/ship/brickShader-selfcheck.mjs's `globalThis.__uintAuto === true` -- a row that reads
 * state the module under test had set, which is exactly what a gate is supposed to do. Treating globalThis as
 * a constant makes every gate that stashes a result on it look vacuous. It is how this tree's browser-side
 * gates hand values back, so it is a source of information and not a literal.
 */
export const CONSTANT_GLOBALS = Object.freeze(new Set([
    "Math", "Number", "Object", "Array", "String", "Boolean", "JSON", "Date", "Set", "Map", "WeakMap",
    "RegExp", "Symbol", "BigInt", "Error", "Promise", "isNaN", "isFinite", "parseInt", "parseFloat",
    "NaN", "Infinity", "undefined", "null", "true", "false", "void", "typeof",
]));

/**
 * Keywords that are syntax rather than values, so they must not count as free identifiers either way.
 *
 * *** `of` AND `in` ARE NOT HERE, AND LEAVING THEM IN COST FOUR FALSE POSITIVES. *** They are keywords only
 * in a `for` head; everywhere else they are ordinary identifiers, and tools/ship/kernelReach-selfcheck.mjs
 * names a local helper `of`. Filtering them by NAME erased the only thing four of its rows read, and the
 * census reported `of("A_WGSL").reach && ...` as a condition nothing in the tree can influence.
 *
 * Leaving them out means a genuine `for (const x of xs)` inside a condition contributes a free identifier
 * that is not a built-in, so that row is NOT flagged. That is the safe direction: this census under-reports
 * rather than accuses, which is the only way a scanner survives the objection tools/ship/vacuity.mjs raises
 * against scanners of this kind.
 */
const KEYWORDS = new Set(["new", "return", "const", "let", "var", "function", "await", "async",
                          "if", "else", "for", "while", "do", "instanceof", "delete", "yield", "this"]);

/**
 * The free identifiers of a condition: what it could possibly read.
 *
 * String literals go first, because a condition testing text against a regex says nothing by containing the
 * word "Math". Then PROPERTY NAMES after a single dot -- `a.Math` reads a property of `a`, not the global --
 * and the "single" matters: `...vs` is a SPREAD and not a property access, and stripping it as one made the
 * first draft report 56 rows instead of 5, because every `Math.max(...vs)` lost its `vs`.
 */
export function freeIdentifiers(cond) {
    // *** REGEX BODIES GO TOO, AND THE FIRST ATTEMPT AT THIS WAS A REGEX -- ONE ROUND AFTER v4652 SHIPPED A
    // ROUND ABOUT NOT DOING THAT. *** A pattern's own words are TEXT, exactly as a string's are:
    // `/[\\/]vendor/.test(path)` no more depends on something called `vendor` than `"vendor".length` does.
    // But a REGEX cannot find a regex literal. Written as `/ ... body ... /`, requiring at least one body
    // character, it skipped the EMPTY regexes codeOnly leaves behind and then matched from the first slash to
    // the last -- so `//.test(noComments(hb)) && codeHas(hb, //)` had `noComments`, `hb` and `codeHas` eaten
    // and read as constant. Nine false positives, 11 rows becoming 20, every one of them a row that does
    // depend on the tree.
    //
    // sourceScan.mjs exports the two primitives that answer this, and this is the second time in two rounds
    // that importing them rather than re-deriving them was the fix.
    let noRegex = "", k = 0;
    while (k < cond.length) {
        if (cond[k] === "/" && regexAllowedHere(noRegex)) {
            const r = regexBody(cond, k);
            if (r) { noRegex += " "; k = r.end; continue; }
        }
        noRegex += cond[k]; k++;
    }
    const noStrings = noRegex.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, " ");
    const noProps = noStrings.replace(/(^|[^.])\.\s*[A-Za-z_$][A-Za-z0-9_$]*/g, "$1 ");
    return [...new Set(noProps.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || [])].filter((x) => !KEYWORDS.has(x));
}

/** True when nothing in `cond` can carry a value from the tree. A condition with NO identifiers at all -- a pure literal -- counts. */
export function isConstantCondition(cond) {
    const ids = freeIdentifiers(cond);
    return ids.every((x) => CONSTANT_GLOBALS.has(x));
}

/**
 * Whether `cond` is a complete JavaScript expression, decided by asking the parser rather than by a heuristic.
 *
 * *** THIS EXISTS BECAUSE THE EXTRACTION IS NOT RELIABLE, AND v4651 BLAMED THE WRONG FILE FOR IT. ***
 *
 * That round wrote here -- and in its gate, its closing and its commit message -- that "sourceScan.mjs's
 * noComments cuts a regex literal containing an escaped slash". *** THAT IS FALSE AND IT WAS NEVER TESTED. ***
 * noComments handles regex literals explicitly, through regexAllowedHere and regexBody, and MEASURED on the
 * exact shape accused -- `/\|\|""\//.test(s)` -- it returns the source unchanged, byte for byte.
 *
 * The fault was in conditionsOf below, which hand-rolled its own regex heuristic instead of importing those
 * two. A wrong attribution against a SHARED instrument is the worst kind: it sends the next reader to repair
 * a file that is not broken, and leaves the one that is. The correction is recorded here rather than quietly
 * swapped, because the claim shipped.
 *
 * Conditions this scanner still cannot parse are counted as UNRESOLVED and named, which is kernelReach.mjs's
 * rule for producers it cannot import: a census that quietly drops what it could not read is reporting a
 * smaller number than it measured.
 */
export function isParsable(cond) {
    // *** THE WRAPPER IS ASYNC, AND A PLAIN ONE MIS-REPORTED 235 CONDITIONS AS UNPARSABLE. *** Most rows in
    // this tree that await something put the await INSIDE the condition -- `(await probe(...)).error === "x"`
    // -- which is a perfectly good expression and a syntax error inside a non-async function. Reporting those
    // as "could not be read" would be blaming the tree for a limit of the test, which is the same mistake
    // this file's own isParsable docstring records one level up.
    // codeOnly leaves a regex literal as `//` plus its flags -- delimiters kept, body blanked -- and `//`
    // opens a LINE COMMENT to any JavaScript parser, so the rest of the condition would vanish and every row
    // containing a regex would read as unparsable. An empty regex literal cannot occur in real source (`//`
    // is always a comment there), so restoring a one-character body is unambiguous rather than a guess.
    // Done as a SCAN and not a regex: the first attempt was a lookahead over slashes and it took the
    // unresolved count from 59 to 5,444, because it could not tell an empty regex from a division or from
    // the slash inside a path. regexAllowedHere and regexBody already answer exactly that question.
    let parseable = "", k = 0;
    while (k < cond.length) {
        if (cond[k] === "/" && regexAllowedHere(parseable)) {
            const r = regexBody(cond, k);
            if (r) {
                const body = cond.slice(k + 1, r.closeAt);
                parseable += "/" + (body === "" ? "x" : body) + cond.slice(r.closeAt, r.end);
                k = r.end; continue;
            }
        }
        parseable += cond[k]; k++;
    }
    try { new Function(`return (async () => (${parseable}));`); return true; } catch { return false; }
}

/**
 * Pull out each `ok("label", <condition>, ...)` call's condition, by balancing brackets rather than by regex.
 * A regex cannot find the second argument of a call whose first argument is a template literal containing
 * commas, which describes most rows in this tree.
 */
export function conditionsOf(src) {
    // *** codeOnly, NOT noComments, AND THE DIFFERENCE IS 216 ROWS THAT WERE NEVER IN THE TREE. ***
    //
    // noComments keeps STRING CONTENTS, which is right for finding text a file mentions and wrong for finding
    // calls a file MAKES. Several gates build gate source as string literals -- tools/ship/gateMutation-
    // selfcheck.mjs plants a decoy that "counts failures and never reports them" to prove its probe catches
    // one -- and every ok(...) inside such a fixture was counted here as a row of the tree. MEASURED, that
    // file read as 8 always-true rows out of 17, a 47% inflation, and every one of the eight was a line in a
    // string being written to a temporary file.
    //
    // codeOnly blanks string contents and regex bodies, keeping the delimiters and the line structure, so a
    // fixture's ok( disappears and a real one does not. The cost is that a regex literal becomes `//`, which
    // isParsable has to know about -- see its note.
    const t = codeOnly(src);
    const out = [];
    const re = /\bok\(\s*(`|"|')/g;
    let m;
    while ((m = re.exec(t))) {
        const q = m[1];
        let i = m.index + m[0].length;
        while (i < t.length) { if (t[i] === "\\") { i += 2; continue; } if (t[i] === q) break; i++; }
        i++;
        // *** A LABEL MAY BE SEVERAL STRINGS CONCATENATED, AND THE FIRST VERSION OF THIS ONLY CLAIMED TO
        // HANDLE THAT. *** It skipped whitespace and `+` and then required a COMMA -- but after the `+` comes
        // the NEXT STRING, not a comma, so every such row was silently skipped and the `+` in that character
        // class did nothing at all. A sabotage removing it scored zero because the code was already inert.
        // Dead code defended by a comment describing what it does not do is worse than no code, because a
        // reader checking whether the case is handled finds a sentence saying yes.
        for (;;) {
            while (i < t.length && /\s/.test(t[i])) i++;
            if (t[i] !== "+") break;
            i++;
            while (i < t.length && /\s/.test(t[i])) i++;
            const q3 = t[i];
            if (q3 !== '"' && q3 !== "'" && q3 !== "`") break;
            i++;
            while (i < t.length) { if (t[i] === "\\") { i += 2; continue; } if (t[i] === q3) break; i++; }
            i++;
        }
        while (i < t.length && /\s/.test(t[i])) i++;
        if (t[i] !== ",") continue;
        i++;
        let depth = 0; const start = i;
        // *** STRINGS AND REGEX LITERALS ARE SKIPPED WHOLE, USING sourceScan.mjs's OWN TWO PRIMITIVES. ***
        //
        // The first draft hand-rolled the regex test as `prev is not )]} and not alphanumeric`. That is a
        // THIRD copy of a heuristic sourceScan.mjs exports precisely so there is one, and its header says why
        // in as many words: "Rewriting this heuristic a second time would be exactly the '179 files mis-lexed
        // the same way' defect this file's own header is about". The copy was also worse than the original in
        // three ways it had no idea about -- regexAllowedHere knows that a `}` CAN precede a regex, that
        // `return /x/` is a regex because `return` is in its keyword list, and that `<` is not a safe opener
        // because .html source contains `</tag>`. Every one of those was a condition this census mis-read.
        let prev = "";
        while (i < t.length) {
            const c = t[i];
            if (c === '"' || c === "'" || c === "`") {
                const q2 = c; i++;
                while (i < t.length) { if (t[i] === "\\") { i += 2; continue; } if (t[i] === q2) break; i++; }
                i++; prev = q2; continue;
            }
            if (c === "/" && regexAllowedHere(t.slice(start, i))) {
                const r = regexBody(t, i);
                if (r) { i = r.end; prev = "/"; continue; }
            }
            if ("([{".includes(c)) depth++;
            else if (")]}".includes(c)) { if (depth === 0) break; depth--; }
            else if (c === "," && depth === 0) break;
            if (!/\s/.test(c)) prev = c;
            i++;
        }
        const cond = t.slice(start, i).trim();
        if (cond && cond.length <= 4000) out.push({ cond, index: start });
    }
    return out;
}

/**
 * Census `files` ({path, text}) for conditions nothing in the tree can influence, in THREE classes, because
 * lumping them was measured to be useless.
 *
 *   expr        a computed expression over built-ins only -- `Math.round(2.5) !== Math.ceil(2.5 - 0.5)`.
 *               FIVE tree-wide. This is the class that caught both of this session's defects and the only
 *               one worth a tight ratchet.
 *   alwaysTrue  the literal `true`. A row that cannot fail, whatever its label claims.
 *   alwaysFalse the literal `false`. A row that cannot PASS -- which is a deliberate idiom here, the forced
 *               red a gate prints when its subject could not be reached at all ("*** NOT A PASS. *** The
 *               adapter path has not run"). Counted so the count is known, never condemned.
 *
 * The first draft returned one list and it came back with hundreds of entries, nearly all of them the third
 * class, which buries the five that matter. A census whose headline number is dominated by a deliberate idiom
 * is a census nobody reads.
 */
export function constantRows(files) {
    const expr = [], alwaysTrue = [], alwaysFalse = [], unresolved = [];
    let scanned = 0;
    for (const f of files) {
        for (const { cond, index } of conditionsOf(f.text)) {
            scanned++;
            const row = { file: f.path, cond, index };
            if (cond === "true") alwaysTrue.push(row);
            else if (cond === "false") alwaysFalse.push(row);
            else if (!isParsable(cond)) unresolved.push(row);
            else if (isConstantCondition(cond)) expr.push(row);
        }
    }
    return { scanned, expr, alwaysTrue, alwaysFalse, unresolved, rows: expr };
}

/** Read a gate list off disk in the shape constantRows wants. */
export function readGates(paths, root) {
    return paths.map((p) => ({ path: path.relative(root, p), text: fs.readFileSync(p, "utf8") }));
}
