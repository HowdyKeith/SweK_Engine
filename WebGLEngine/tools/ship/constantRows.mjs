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
import { noComments } from "./sourceScan.mjs";

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
    const noStrings = cond.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, " ");
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
 * *** THIS EXISTS BECAUSE THE EXTRACTION IS NOT RELIABLE AND PRETENDING OTHERWISE PRODUCED NINE ROWS, SIX OF
 * THEM SHRAPNEL. *** sourceScan.mjs's noComments cuts a regex literal containing an escaped slash -- `\/` ends
 * with the two characters that start a line comment -- so conditions like `/\|\|""\//.test(x)` arrive here
 * truncated to `/\|\|""\`. A fragment has no identifiers left, so it reads as constant, and the census
 * reported `/61`, `/3` and `/470` as rows that cannot fail.
 *
 * Those are not findings about the tree; they are findings about the scanner. They are counted as UNRESOLVED
 * and named, which is kernelReach.mjs's rule for producers it cannot import: a census that quietly drops what
 * it could not read is reporting a smaller number than it measured.
 */
export function isParsable(cond) {
    try { new Function(`return (${cond});`); return true; } catch { return false; }
}

/**
 * Pull out each `ok("label", <condition>, ...)` call's condition, by balancing brackets rather than by regex.
 * A regex cannot find the second argument of a call whose first argument is a template literal containing
 * commas, which describes most rows in this tree.
 */
export function conditionsOf(src) {
    const t = noComments(src);
    const out = [];
    const re = /\bok\(\s*(`|"|')/g;
    let m;
    while ((m = re.exec(t))) {
        const q = m[1];
        let i = m.index + m[0].length;
        while (i < t.length) { if (t[i] === "\\") { i += 2; continue; } if (t[i] === q) break; i++; }
        i++;
        while (i < t.length && /[\s+]/.test(t[i])) i++;      // a label may be several strings concatenated
        if (t[i] !== ",") continue;
        i++;
        let depth = 0; const start = i;
        // *** REGEX LITERALS AND STRINGS ARE SKIPPED WHOLE, AND THE FIRST DRAFT DID NEITHER. *** A condition
        // like `/\|\|""/.test(x)` contains quotes, brackets and commas that are TEXT; balancing through them
        // cut conditions mid-pattern and the fragments -- `/61`, `/3`, `!/"fluid\/multigridGPU\.js"` -- had
        // no identifiers left and so read as constant. The census reported nine rows, four of them shrapnel.
        // A slash starts a regex when the previous meaningful character cannot end an expression.
        let prev = "";
        while (i < t.length) {
            const c = t[i];
            if (c === '"' || c === "'" || c === "`") {
                const q2 = c; i++;
                while (i < t.length) { if (t[i] === "\\") { i += 2; continue; } if (t[i] === q2) break; i++; }
                i++; prev = q2; continue;
            }
            if (c === "/" && !"])}".includes(prev) && !/[A-Za-z0-9_$]/.test(prev)) {
                i++;
                let cls = false;
                while (i < t.length) {
                    if (t[i] === "\\") { i += 2; continue; }
                    if (t[i] === "[") cls = true;
                    else if (t[i] === "]") cls = false;
                    else if (t[i] === "/" && !cls) break;
                    i++;
                }
                i++;
                while (i < t.length && /[a-z]/.test(t[i])) i++;    // flags
                prev = "/"; continue;
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
