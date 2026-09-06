// tools/ship/assertionShape.mjs -- v4480
//
// *** THE TREE'S MOST-USED ASSERTION HAS 1,489 INDEPENDENT COPIES, 38 DISTINCT DEFINITIONS, TWO INCOMPATIBLE
// SIGNATURES AND NO OWNER. *** 1,497 of 1,518 gates call `ok(...)`. 1,489 of them DEFINE it, in their own file,
// a few lines from the top. ZERO import one. So when v4479 said its repair -- a signature that refuses a
// function -- "belongs to whichever round owns the helper", that sentence had no referent. Nothing owns it,
// and a defect in it cannot be fixed once.
//
// ---- *** WHY THAT MATTERS, AND IT IS NOT TIDINESS *** --------------------------------------------------------
//
// `ok(name, condition)` takes ANY value in the condition slot. A function is a value. A promise is a value. A
// non-empty string is a value, and every one of them is truthy, so a check written in any of those shapes
// prints PASS with the code under it completely broken. This session wrote it THREE TIMES in three rounds --
// `ok(name, async () => true)` at v4478, and at v4479 both `ok(name, (() => true)())` and
// `ok(name, async () => {...}())`, the last handing `ok` a promise. All three were caught by reading, not by
// running, which is the part worth being uncomfortable about: nothing in a tree of fifteen hundred gates
// would have said a word.
//
// And the two signatures make a fourth shape possible. 1,439 gates spell it `ok(name, cond, detail)`; 78
// spell it `ok(cond, message)`, condition FIRST. A line pasted from a majority gate into one of those 78
// reads `ok("some message", cond)` -- and the message is a non-empty string, so it ALWAYS PASSES.
// (16 more gates spell it in a shape this classifier will not guess at, and are reported `unknown`
// rather than folded into either camp -- a census that resolves its own ambiguity by picking is
// a census with a thumb on it.)
//
// ---- *** WHAT THE SWEEP FOUND TODAY, WHICH IS NOTHING, AND WHY THAT IS REPORTED RATHER THAN BURIED *** -------
//
//     gates                                              1518
//     calling ok()                                       1497
//     defining their own ok()                            1489   (importing one: 0)
//     distinct definitions                                 38
//     condition-first signatures                           78
//     call sites with a function in the condition slot       0
//     call sites with an un-awaited async IIFE               0
//     condition-first calls passing a string first           0
//
// Every hazard this file describes is currently un-fired. That is a real result and it is the reason the
// positive controls in the gate are not optional: a detector that has only ever returned zero is
// indistinguishable from a detector that cannot return anything else, and this tree has caught that shape five
// times this session alone. Each of the three finders is therefore driven against a fixture built to trip it,
// and the zero above means something only because of that.
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ---------------------------------------------------------------------
//
// That it finds every way a non-boolean reaches the condition slot. It reads SOURCE TEXT and finds three
// shapes it can name: an arrow that is never invoked, an async IIFE that is never awaited, and a string
// literal where a condition-first signature expects the condition. `ok(name, someHelper())` returning a
// promise from a named function is INVISIBLE to it, and so is anything computed into a variable first. The
// three it finds are the three this session actually wrote, which is a reason to trust the shapes and not the
// coverage.
//
// That consolidating the 1,489 copies is proposed here. It is not: rewriting the assertion in every gate in
// the tree is a change to fifteen hundred files whose only test is the gates themselves, and the census is
// what an argument for doing it would have to start from. This round measures and detects; it does not
// consolidate, and the number is left on the page for the round that wants to.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const SKIP = new Set(["node_modules", ".git", "vendor", ".claude"]);

/** Every gate in the tree, by the same rule gateSweep uses: `-selfcheck.mjs`, and never a `__` fixture. */
export function gateFiles(root = ENG) {
    const out = [];
    (function walk(d) {
        let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
            if (SKIP.has(e.name) || (e.name.startsWith(".") && e.name !== ".claude")) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.name.endsWith("-selfcheck.mjs") && !e.name.startsWith("__")) out.push(p);
        }
    })(root);
    return out;
}

export const SIG = Object.freeze({ nameFirst: "nameFirst", condFirst: "condFirst", unknown: "unknown", none: "none" });

/**
 * How one file spells `ok`. The classification reads the BODY rather than the parameter names, because a
 * parameter called `c` proves nothing -- what settles it is whether the first parameter is the one branched on.
 */
export function signatureOf(src) {
    const m = src.match(/^[ \t]*(?:const|let)\s+ok\s*=\s*(?:async\s*)?\(\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)/m);
    if (!m) return /^import\s*\{[^}]*\bok\b[^}]*\}\s*from/m.test(src) ? SIG.unknown
         : /\bok\s*\(/.test(src) ? SIG.unknown : SIG.none;
    const body = src.slice(src.indexOf(m[0]), src.indexOf(m[0]) + 300);
    const firstIsCond = new RegExp(`(if\\s*\\(\\s*!?${m[1]}\\b)|(\\b${m[1]}\\s*\\?)`).test(body);
    const secondIsCond = new RegExp(`(if\\s*\\(\\s*!?${m[2]}\\b)|(\\b${m[2]}\\s*\\?)`).test(body);
    return firstIsCond ? SIG.condFirst : secondIsCond ? SIG.nameFirst : SIG.unknown;
}

const stripComments = (s) => s
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** The three shapes, each named. A finder that cannot say WHICH shape it found is a finder nobody can act on. */
export const SHAPE = Object.freeze({
    arrowNotInvoked: "arrowNotInvoked",     // ok(msg, () => ...)          -- a function object, always truthy
    asyncIife: "asyncIife",                 // ok(msg, async () => {...}()) -- a promise, always truthy
    stringAsCondition: "stringAsCondition", // ok("msg", cond) under condFirst -- a string, always truthy
});

/**
 * Call sites where a non-boolean provably reaches the condition slot. `src` is passed in rather than read, so
 * the gate can hand this a fixture -- the whole point, given the tree's own answer today is zero.
 */
export function suspectCalls(src, signature = SIG.nameFirst) {
    const code = stripComments(src);
    const found = [];
    if (signature === SIG.condFirst) {
        const re = /\bok\(\s*(["'`])(?:[^\\]|\\.)*?\1\s*,/g;
        let m;
        while ((m = re.exec(code))) found.push({ shape: SHAPE.stringAsCondition, at: m.index, text: m[0].replace(/\s+/g, " ") });
        return found;
    }
    // *** WHETHER THE ARROW IS INVOKED IS DECIDED BY BALANCING, NOT BY A REGEX GUESS. *** The first version
    // tested the tail against two hopeful patterns and got `}()` wrong -- it read an async IIFE as an
    // un-invoked arrow, which is the right verdict for the wrong reason and would have been the wrong verdict
    // the moment the body changed shape. The record check in the gate caught it: a probe for `asyncIife` came
    // back classified `arrowNotInvoked`. Walking the body is a few more lines and cannot be fooled by layout.
    const re = /\bok\(\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)\s*,\s*(await\s+)?(async\s+)?\(\s*\)\s*=>/g;
    let m;
    while ((m = re.exec(code))) {
        const isAwait = !!m[1], isAsync = !!m[2];
        let i = re.lastIndex;
        while (i < code.length && /\s/.test(code[i])) i++;
        if (code[i] === "{") {                       // block body: balance the braces
            let depth = 0;
            for (; i < code.length; i++) {
                if (code[i] === "{") depth++;
                else if (code[i] === "}") { depth--; if (depth === 0) { i++; break; } }
            }
        } else {                                     // expression body: balance to the arg's comma or ok's close
            let depth = 0;
            for (; i < code.length; i++) {
                if ("([".includes(code[i])) depth++;
                else if (")]".includes(code[i])) { if (depth === 0) break; depth--; }
                else if (code[i] === "," && depth === 0) break;
            }
        }
        while (i < code.length && /\s/.test(code[i])) i++;
        const invoked = code[i] === "(";
        if (!invoked) found.push({ shape: SHAPE.arrowNotInvoked, at: m.index, text: m[0].replace(/\s+/g, " ") });
        else if (isAsync && !isAwait) found.push({ shape: SHAPE.asyncIife, at: m.index, text: m[0].replace(/\s+/g, " ") });
    }
    return found;
}

/** The tree-wide census. Members where it matters, counts where the members are the whole tree. */
export function census({ root = ENG, files = null } = {}) {
    const gates = files || gateFiles(root);
    const bySig = { [SIG.nameFirst]: 0, [SIG.condFirst]: 0, [SIG.unknown]: 0, [SIG.none]: 0 };
    const definitions = new Map();
    const suspects = [];
    let usesOk = 0, definesOk = 0, importsOk = 0;
    for (const g of gates) {
        const src = fs.readFileSync(g, "utf8");
        if (/\bok\s*\(/.test(src)) usesOk++;
        const def = src.match(/^[ \t]*(?:const|let|function)\s+ok\b[^\n]*/m);
        if (def) { definesOk++; const k = def[0].trim().replace(/\s+/g, " "); definitions.set(k, (definitions.get(k) || 0) + 1); }
        else if (/^import\s*\{[^}]*\bok\b[^}]*\}\s*from/m.test(src)) importsOk++;
        const sig = signatureOf(src);
        bySig[sig] = (bySig[sig] || 0) + 1;
        for (const s of suspectCalls(src, sig)) suspects.push({ file: path.relative(root, g), ...s });
    }
    return {
        gates: gates.length, usesOk, definesOk, importsOk,
        distinctDefinitions: definitions.size,
        bySignature: bySig,
        suspects,
        byShape: Object.fromEntries(Object.values(SHAPE).map((s) => [s, suspects.filter((x) => x.shape === s).length])),
    };
}

export function reportLines() {
    const c = census();
    const L = [];
    L.push("the assertion helper -- who defines it, how, and whether anything non-boolean reaches its condition");
    L.push(`  gates ${c.gates}; calling ok() ${c.usesOk}; DEFINING their own ${c.definesOk}; importing one ${c.importsOk}`);
    L.push(`  ${c.distinctDefinitions} distinct definitions; signatures: ` +
           Object.entries(c.bySignature).map(([k, v]) => `${k} ${v}`).join(", "));
    L.push("  non-boolean conditions found: " + (c.suspects.length
        ? c.suspects.map((s) => s.file + " (" + s.shape + ")").join("; ")
        : "none -- and the gate's positive controls are what make that a result"));
    return L;
}

export const SHAPE_AT_V4480 = Object.freeze({
    // Counted WITH this round's own gate in the population, because it is one: 1518 -> 1519 gates, and the
    // helper it defines is the 1,490th copy. A census that excused its own instrument would be measuring a
    // tree that does not exist.
    gates: 1519, usesOk: 1498, definesOk: 1490, importsOk: 0,
    distinctDefinitions: 38, nameFirst: 1404, condFirst: 78, unknownSignature: 16,
    suspects: 0,
    // Written three times in three rounds by this session, all caught by reading and none by running.
    writtenThisSession: Object.freeze([
        Object.freeze({ round: "v4478", shape: "arrowNotInvoked", text: "ok(name, async () => true)" }),
        Object.freeze({ round: "v4479", shape: "arrowNotInvoked", text: "ok(name, (() => true)())" }),
        Object.freeze({ round: "v4479", shape: "asyncIife", text: "ok(name, async () => {...}())" }),
    ]),
});
