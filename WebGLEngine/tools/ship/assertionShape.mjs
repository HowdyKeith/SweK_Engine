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

import * as TR from "./treeRead.mjs";

export const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// (the old walker's SKIP set retired with it at v4548 -- see gateFiles below)

/** Every gate in the tree, by the same rule gateSweep uses: `-selfcheck.mjs`, and never a `__` fixture. */
// v4548 -- filtered out of tools/ship/treeRead.mjs's single cached walk instead of walking again. VERIFIED
// BEFORE SWITCHING, not assumed: the old walker's 1,602 gates and the filtered tree's 1,602 are the same set
// AND THE SAME ORDER, zero either way -- which matters because recordDrift-selfcheck picks gateFiles()[0] as
// its sample gate, so a reordering would have silently changed what that fixture tests. treeRead-selfcheck
// keeps asserting it. The old rule skipped .git and dot-directories and did NOT skip dist/; the new one is
// the other way round, and the two agree because no gate lives in either place.
export function gateFiles(root = ENG) {
    return TR.treePaths(root).filter((p) => {
        const n = p.split(/[\\/]/).pop();
        return n.endsWith("-selfcheck.mjs") && !n.startsWith("__");
    });
}

export const SIG = Object.freeze({ nameFirst: "nameFirst", condFirst: "condFirst", unknown: "unknown", none: "none" });

/**
 * How one file spells `ok`. The classification reads the BODY rather than the parameter names, because a
 * parameter called `c` proves nothing -- what settles it is whether the first parameter is the one branched on.
 */
export function signatureOf(src) {
    // *** v4647e -- THE `function ok(...)` FORM WAS NEVER RECOGNISED, AND IT IS NOT RARE. *** This matched
    // only `const|let ok = (a, b`, so ev/esFlight3dMath-selfcheck.mjs -- which writes
    // `function ok(cond, msg) { ... }` and is perfectly ordinary condition-first code -- classified as
    // UNKNOWN. Harmless while the only shapes needed a string literal first; the moment boolAsName arrived it
    // meant every correct call in such a file was scanned under the WRONG ORDER and reported as a swap. Found
    // by the gate on the first live run of the new shape, which is what the gate is for.
    const m = src.match(/^[ \t]*(?:const|let)\s+ok\s*=\s*(?:async\s*)?\(\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)/m)
           || src.match(/^[ \t]*(?:async\s+)?function\s+ok\s*\(\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)/m);
    if (!m) return /^import\s*\{[^}]*\bok\b[^}]*\}\s*from/m.test(src) ? SIG.unknown
         : /\bok\s*\(/.test(src) ? SIG.unknown : SIG.none;
    const body = src.slice(src.indexOf(m[0]), src.indexOf(m[0]) + 300);
    const firstIsCond = new RegExp(`(if\\s*\\(\\s*!?${m[1]}\\b)|(\\b${m[1]}\\s*\\?)`).test(body);
    const secondIsCond = new RegExp(`(if\\s*\\(\\s*!?${m[2]}\\b)|(\\b${m[2]}\\s*\\?)`).test(body);
    return firstIsCond ? SIG.condFirst : secondIsCond ? SIG.nameFirst : SIG.unknown;
}

/**
 * String and template BODIES replaced by filler of the same length, so offsets are preserved and nothing
 * inside a literal can be mistaken for code. Quotes are kept, which is what lets looksLikeCondition go on
 * recognising "this argument is a name" by its opening character.
 */
export function maskStrings(src) {
    // v4781 -- the output is built in parts and the last significant character is CARRIED, not re-found: the first
    // version asked prevSignificant(out) at every "/", scanning a growing string backwards, and the census spent a
    // third of recordDrift-selfcheck's time here. Byte-identical output over every .mjs and .js in the tree.
    const parts = [];
    let i = 0, last = "";
    const emit = (t) => { parts.push(t); for (let k = t.length - 1; k >= 0; k--) if (!/\s/.test(t[k])) { last = t[k]; break; } };
    while (i < src.length) {
        const ch = src[i];
        if (ch === '"' || ch === "'" || ch === "`") {
            const q = ch; let body = q; i++;
            while (i < src.length && src[i] !== q) {
                if (src[i] === "\\") { body += "xx"; i += 2; continue; }
                body += src[i] === "\n" ? "\n" : "x";     // newlines kept so line offsets survive
                i++;
            }
            if (i < src.length) { body += q; i++; }
            emit(body);
            continue;
        }
        // *** AND REGEX LITERALS, BECAUSE ONE OF THEM BROKE THE BALANCER ON THE FIRST REAL TEST. ***
        // ok(!/scaled\(/.test(q), "name") was MISSED: the `\(` inside the pattern counted as an open paren,
        // so firstArgOf never found the top-level comma. Two of my own three swaps were caught and this was
        // the third. A `/` starting a literal is told from division by what precedes it -- after an operator
        // or an opening bracket a regex can start and a division cannot.
        if (ch === "/" && /[([{,;=!&|?:+\-*%~^<>]|^$/.test(last)) {
            let body = "/", inClass = false; i++;
            while (i < src.length && (inClass || src[i] !== "/")) {
                if (src[i] === "\\") { body += "xx"; i += 2; continue; }
                if (src[i] === "[") inClass = true; else if (src[i] === "]") inClass = false;
                if (src[i] === "\n") break;                 // an unterminated literal is not one
                body += "x"; i++;
            }
            if (i < src.length && src[i] === "/") { body += "/"; i++; }
            emit(body);
            continue;
        }
        // a run of plain characters at once: everything up to the next quote or slash
        let j = i + 1;
        while (j < src.length && src[j] !== '"' && src[j] !== "'" && src[j] !== "`" && src[j] !== "/") j++;
        emit(src.slice(i, j)); i = j;
    }
    return parts.join("");
}

const stripComments = (s) => s
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** The three shapes, each named. A finder that cannot say WHICH shape it found is a finder nobody can act on. */
export const SHAPE = Object.freeze({
    arrowNotInvoked: "arrowNotInvoked",     // ok(msg, () => ...)          -- a function object, always truthy
    asyncIife: "asyncIife",                 // ok(msg, async () => {...}()) -- a promise, always truthy
    stringAsCondition: "stringAsCondition", // ok("msg", cond) under condFirst -- a string, always truthy
    // *** v4647e -- THE MIRROR, WHICH WAS MISSING FOR THE 1,629 FILES THAT ARE nameFirst. ***
    // stringAsCondition catches the swap under condFirst -- 91 files. Under nameFirst, suspectCalls only ever
    // looked for the two ARROW shapes and ASSUMED the first argument was a name; a call written
    // ok(cond, "name") sailed through, printing "PASS true" forever. The census read suspects: 0 while THREE
    // shipped in one session, all in nameFirst files, all mine. The detector covered the smaller population
    // by a factor of eighteen and its zero was read as an all-clear.
    boolAsName: "boolAsName",               // ok(cond, "msg") under nameFirst -- the name slot holds a boolean
});

/**
 * The first argument of a call, by BALANCING to the top-level comma rather than by a regex guess -- the same
 * discipline the arrow walk below uses and for the same reason: layout must not decide a verdict.
 * Returns null when the call does not close.
 */
export function firstArgOf(code, openParenIndex) {
    let depth = 0, i = openParenIndex;
    const start = openParenIndex + 1;
    for (; i < code.length; i++) {
        const ch = code[i];
        if (ch === "\"" || ch === "'" || ch === "`") {          // skip a string whole
            const q = ch; i++;
            while (i < code.length && code[i] !== q) { if (code[i] === "\\") i++; i++; }
            continue;
        }
        if (ch === "(" || ch === "[" || ch === "{") depth++;
        else if (ch === ")" || ch === "]" || ch === "}") { if (--depth === 0) return code.slice(start, i); }
        else if (ch === "," && depth === 1) return code.slice(start, i);
    }
    return null;
}

/** Does this argument text look like a CONDITION rather than a name? Conservative on purpose: a name in this
 *  tree is a string or template literal, sometimes concatenated, and never a comparison. */
export function looksLikeCondition(arg) {
    const t = String(arg || "").trim();
    if (!t) return false;
    if (/^["'`]/.test(t)) return false;                       // a literal name, concatenated or not
    // *** A NAME CAN BE BUILT, AND THE TREE BUILDS ONE. *** glbConformance-selfcheck writes
    // ok((code.startsWith(...) ? "!! " : "   ") + code + " -- " + what, hit, ...) -- a ternary CHOOSING A
    // PREFIX, concatenated into a name. It was the only survivor of the first tree-wide run and it is not a
    // defect. Anything joined to a string literal is a name being assembled, whatever decided its parts.
    if (/\+\s*["'`]|["'`]\s*\+/.test(t)) return false;
    return /===|!==|==|!=|<=|>=|&&|\|\||\.test\(|\.includes\(|\.every\(|\.some\(|^!/.test(t);
}

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
    // *** THE MIRROR OF stringAsCondition, FOR THE 1,629 nameFirst FILES. *** Everything below assumes the
    // first argument is a string literal, because the regex requires one -- so a call written the other way
    // round was never examined at all. Balanced rather than pattern-matched, and conservative: a name here is
    // a string or template literal, never a comparison.
    // *** MASKED FIRST, BECAUSE THE FIRST RUN OVER THE TREE FOUND SIX AND FOUR WERE TEXT IN A STRING. ***
    // gateQuality-selfcheck PINS example calls as data -- pinned("ok(\\"five knobs...\\", ... === 5)") -- and a
    // scan that reads source as one flat string counts those as calls. Same species as a census matching its
    // own prose, which this tree has now met three rounds running. String bodies are replaced with filler of
    // the SAME LENGTH so every offset below still points at the real source.
    // *** AND IT DOES NOT RUN ON AN UNKNOWN SIGNATURE, WHICH IS THE WHOLE SAFETY. *** This shape is entirely
    // a claim about WHICH SLOT the condition is in. A file whose order could not be read is one where that
    // claim cannot be made, and guessing nameFirst there turns every correct condition-first call into a
    // reported swap -- a flood, in a detector running over sixteen hundred files. The arrow shapes below are
    // safe under a guess because they require a string literal first; this one is not.
    const masked = signature === SIG.nameFirst ? maskStrings(code) : "";
    for (const m0 of masked.matchAll(/\bok\(/g)) {
        const open = m0.index + m0[0].length - 1;
        const arg = firstArgOf(masked, open);
        if (arg !== null && looksLikeCondition(arg)) {
            found.push({ shape: SHAPE.boolAsName, at: m0.index,
                         text: ("ok(" + arg.replace(/\s+/g, " ")).slice(0, 80) });
        }
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
// *** v4647q -- `shapes: false` EXISTS BECAUSE ONE CALLER WAS PAYING FOR A DERIVATION IT NEVER READ. ***
//
// The swap scan below (suspectCalls, per gate) is the expensive half of this census: it masks every string
// and regex literal in all 1,631 nameFirst files character by character. recordDrift.mjs's "assertionShape
// census" check calls census() and reads exactly TWO fields off it, `definesOk` and `gates` -- neither of
// which the scan contributes to. It paid for the whole walk and threw the result away.
//
// MEASURED: the census costs 648 ms with the scan and 269 ms without, and recordDrift-selfcheck is a SWEPT
// gate, so that 379 ms comes straight off the 3,000 ms budget it has to finish inside. It had gone 1803 ms
// on main to 2711 ms here and taken recordReach-selfcheck's 800 ms margin row red with it.
//
// *** AND THIS IS THE SAME SHAPE THE ROUND BEFORE LAST FOUND IN quickSweep's reconcile, *** where `kind` and
// `name` were stored on every row and read by nothing -- established by deleting them and watching two gates
// stay green. A derivation nobody reads is not free here; it is 379 ms on a clock somebody else is spending.
//
// null RATHER THAN []: `suspects: []` means "the scan ran and found nothing", which is this file's whole
// headline result and must stay distinguishable from "the scan did not run". Same distinction world/orrery.mjs
// draws between UNPAPERED and unchecked, and reachedLicences draws with licenceExists. A caller that reads
// .suspects off a shapes:false census gets null and cannot mistake it for a clean bill.
export function census({ root = ENG, files = null, shapes = true } = {}) {
    const gates = files || gateFiles(root);
    const bySig = { [SIG.nameFirst]: 0, [SIG.condFirst]: 0, [SIG.unknown]: 0, [SIG.none]: 0 };
    const definitions = new Map();
    const suspects = [];
    let usesOk = 0, definesOk = 0, importsOk = 0;
    // *** COUNTED INSIDE THE LOOP, BECAUSE TWO SABOTAGES PROVED A FLAG CANNOT REPORT ON ITSELF. ***
    // The first draft returned `shapesScanned: shapes` -- the ARGUMENT, echoed back. Sabotaging census to
    // accept shapes:false and scan anyway went ZERO RED, because nulling `suspects` on the way out preserves
    // the output contract while paying the whole 379 ms; and sabotaging it to skip the scan ALWAYS also went
    // zero, because an empty array is still an array. A flag that reports the flag measures nothing. This
    // counts the files the scan actually walked, so "was the work done" is answered by the work.
    let filesScanned = 0;
    for (const g of gates) {
        const src = TR.textOf(g);   // v4548: out of the shared memo, not a fourth read of the same file
        if (/\bok\s*\(/.test(src)) usesOk++;
        const def = src.match(/^[ \t]*(?:const|let|function)\s+ok\b[^\n]*/m);
        if (def) { definesOk++; const k = def[0].trim().replace(/\s+/g, " "); definitions.set(k, (definitions.get(k) || 0) + 1); }
        else if (/^import\s*\{[^}]*\bok\b[^}]*\}\s*from/m.test(src)) importsOk++;
        const sig = signatureOf(src);
        bySig[sig] = (bySig[sig] || 0) + 1;
        if (shapes) {
            filesScanned++;
            for (const s of suspectCalls(src, sig)) suspects.push({ file: path.relative(root, g), ...s });
        }
    }
    return {
        gates: gates.length, usesOk, definesOk, importsOk,
        distinctDefinitions: definitions.size,
        bySignature: bySig,
        filesScanned,
        suspects: shapes ? suspects : null,
        byShape: shapes
            ? Object.fromEntries(Object.values(SHAPE).map((s) => [s, suspects.filter((x) => x.shape === s).length]))
            : null,
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
    // v4526 MERGE -- RE-TAKEN on the merged tree: this branch's sixty-five gates joined the population (1525 -> 1590) and
    // five rows moved with them; distinctDefinitions, unknownSignature and suspects did not, which is the discriminating shape.
    // v4527 -- RE-TAKEN: one gate (raceKnob) joined, and exactly the four rows a gate that uses ok(name, cond) moves, moved by one.
    // v4528 -- RE-TAKEN: one gate (raceReplayBake) joined, and the same four rows moved by one again.
    // v4529 -- RE-TAKEN: one gate (ribbonRoad) joined, the same four rows by one.
    // v4530 -- RE-TAKEN: one gate (crashDamage) joined, the same four rows by one.
    // v4536 -- RE-TAKEN: one gate (uvUnwrap) joined, and the same four rows moved by one. Fifth round running
    // in which a single new gate moves gates/usesOk/definesOk/nameFirst by exactly one and moves nothing else,
    // which is what makes the other five rows worth keeping: they are the ones that would say a gate arrived
    // with a DIFFERENT shape, and they have now stayed still across six arrivals.
    // v4537 -- RE-TAKEN: one gate (uvLscm) joined, the same four rows by one, seventh arrival running.
    // v4539 -- RE-TAKEN: one gate (splitSum) joined, the same four rows by one, eighth arrival running.
    // v4543 -- RE-TAKEN: one gate (navmesh) joined, the same four rows by one, NINTH arrival running. The
    // five rows that have now stayed still across nine consecutive arrivals are the ones carrying the
    // information: distinctDefinitions, condFirst, unknownSignature, importsOk and suspects would each move
    // if a gate turned up written in a different shape, and none of them has.
    // v4544 -- RE-TAKEN: one gate (terrainWalk) joined, the same four rows by one, TENTH arrival running.
    // v4545 -- RE-TAKEN: one gate (navWiring) joined, the same four rows by one, ELEVENTH arrival running.
    // v4546 -- RE-TAKEN: one gate (navWiringLive) joined, the same four rows by one, TWELFTH arrival running.
    // v4547 -- RE-TAKEN: one gate (engineSceneBot) joined, the same four rows by one, THIRTEENTH arrival
    // running -- and this one is the arrival most likely to have moved the OTHER five, because it is the
    // first gate in the tree that boots index.html and reads its assertions out of a page rather than out of
    // a fixture. It did not: it is written in the same shape as the other 1,473.
    // v4548 -- RE-TAKEN: TWO gates (treeRead, recordReach) joined, the same four rows by TWO, FOURTEENTH
    // arrival. The round's third new file is tools/ship/recordReach.mjs, a module rather than a gate, and it
    // moves none of these -- which is the distinction these nine rows exist to make.
    // v4550 -- RE-TAKEN: one gate (glbConformance) joined, the same four rows by one, FIFTEENTH arrival.
    // v4551 -- RE-TAKEN, AND FIVE ARRIVALS LATE. *** THE RECORD WAS RED FOR FIVE CONSECUTIVE ROUNDS AND
    // NOTHING RAN IT. *** The FSR arc (fsr, motionVectors, jitter, temporalAccumulate, temporalResolve) added
    // one gate per round; each round ran gateSweep, instruments and sweepCoverage and called that the ritual,
    // and this record is not in that set. So the drift did not announce itself once -- it accumulated to
    // gates 1605 -> 1610 and was found only because v4551 went looking. That is the SAME fault v4548 recorded
    // under the title "the ship ritual does not check half its own records"; finding it once did not stop it
    // recurring, because the repair there was to re-take the records and not to make the ritual reach them.
    // The four rows moved by FIVE, one per arrival, and the other five rows did not move at all -- across five
    // gates in five different subsystems (a CPU upscaler, a matrix reprojection, a Halton sequence, a history
    // blend, a resampling kernel), TWENTIETH arrival running with no gate written in a different shape.
    // v4552 -- RE-TAKEN: one gate (temporalReject) joined, the same four rows by one, TWENTY-FIRST arrival --
    // and the first re-taken because a CHECK SAID SO rather than because a round went looking. v4551 added the
    // sixth row to recordDrift's pre-flight after this record drifted five rounds unnoticed; this round ran it
    // before the verify and it named all four obligations at once. The other five rows have still never moved.
    // v4553 -- RE-TAKEN: one gate (temporalLock) joined, the same four rows by one, TWENTY-SECOND arrival,
    // and the second round running that the pre-flight prompted rather than a search. The other five rows have
    // still never moved.
    // v4554 -- RE-TAKEN: one gate (temporalDepthLock) joined, the same four rows by one, TWENTY-THIRD
    // arrival, third round running that the pre-flight prompted. The other five rows have still never moved.
    // v4555 -- RE-TAKEN: one gate (temporalCoherentLock) joined, the same four rows by one, TWENTY-FOURTH
    // arrival, fourth round running that the pre-flight prompted. The other five rows have still never moved.
    // v4556 -- RE-TAKEN: one gate (temporalRidgePhase) joined, the same four rows by one, TWENTY-FIFTH
    // arrival, fifth round running that the pre-flight prompted. The other five rows have still never moved.
    // v4557 -- RE-TAKEN: one gate (temporalRidgeMargin) joined, the same four rows by one, TWENTY-SIXTH
    // arrival, sixth round running that the pre-flight prompted. The other five rows have still never moved.
    // v4558 -- RE-TAKEN: one gate (temporalRingFloor) joined, the same four rows by one, TWENTY-SEVENTH
    // arrival, seventh round running that the pre-flight prompted. The other five rows have still never moved.
    // v4559 -- RE-TAKEN: one gate (temporalRingContent) joined, the same four rows by one, TWENTY-EIGHTH
    // arrival, eighth round running that the pre-flight prompted. The other five rows have still never moved.
    // v4560 -- RE-TAKEN: one gate (ringFloor) joined, the same four rows by one, TWENTY-NINTH arrival, ninth
    // round running that the pre-flight prompted. The other five rows have still never moved.
    // v4561 -- RE-TAKEN: one gate (ringFloorCost) joined, the same four rows by one, THIRTIETH arrival, tenth
    // round running that the pre-flight prompted. The other five rows have still never moved.
    // v4562 -- RE-TAKEN: one gate (ringFloorPerspective) joined, the same four rows by one, THIRTY-FIRST
    // arrival, eleventh round running that the pre-flight prompted. The other five rows have never moved.
    // v4563 -- RE-TAKEN: one gate (ringFloorMargin) joined, the same four rows by one, THIRTY-SECOND
    // arrival, twelfth round running that the pre-flight prompted. The other five rows have never moved.
    // v4564 -- RE-TAKEN: one gate (ringFloorControl) joined, the same four rows by one, THIRTY-THIRD
    // arrival, thirteenth round running that the pre-flight prompted. The other five rows have never moved.
    // v4565 -- RE-TAKEN: one gate (ringFloorStep) joined, the same four rows by one, THIRTY-FOURTH arrival,
    // fourteenth round running that the pre-flight prompted. The other five rows have never moved.
    // v4566 -- RE-TAKEN: one gate (ringFloorLight) joined, the same four rows by one, THIRTY-FIFTH arrival,
    // fifteenth round running that the pre-flight prompted. The other five rows have never moved.
    // v4567 -- RE-TAKEN: one gate (ringFloorYaw) joined, the same four rows by one, THIRTY-SIXTH arrival,
    // sixteenth round running that the pre-flight prompted. The other five rows have never moved.
    // v4568 -- RE-TAKEN: one gate (ringFloorStat) joined, the same four rows by one, THIRTY-SEVENTH arrival,
    // seventeenth round running that the pre-flight prompted. The other five rows have never moved.
    // v4569 -- RE-TAKEN: one gate (ringFloorDevice) joined, the same four rows by one, THIRTY-EIGHTH arrival,
    // eighteenth round running that the pre-flight prompted. The other five rows have never moved.
    // v4570 -- RE-TAKEN: one gate (kernelAudit) joined, the same four rows by one, THIRTY-NINTH arrival,
    // nineteenth round running that the pre-flight prompted. The other five rows have never moved.
    // v4580 -- RE-TAKEN: one gate (timingProvenance) joined, the same four rows by one, FORTIETH arrival,
    // twentieth round running that the pre-flight prompted. The other five rows have never moved.
    // v4581 -- RE-TAKEN: one gate (budgetProvenance) joined, the same four rows by one, FORTY-FIRST arrival,
    // twenty-first round running that the pre-flight prompted. The other five rows have never moved.
    // v4582 -- RE-TAKEN: one gate (skipReading) joined, the same four rows by one, FORTY-SECOND arrival,
    // twenty-second round running that the pre-flight prompted. The other five rows have never moved.
    // v4583 -- RE-TAKEN: one gate (runnerReach) joined, the same four rows by one, FORTY-THIRD arrival,
    // twenty-third round running that the pre-flight prompted. The other five rows have never moved.
    // v4584 -- RE-TAKEN: one gate (walkerParity) joined, the same four rows by one, FORTY-FOURTH arrival,
    // twenty-fourth round running that the pre-flight prompted. The other five rows have never moved.
    // v4585 -- RE-TAKEN: one gate (redAction) joined, the same four rows by one, FORTY-FIFTH arrival,
    // twenty-fifth round running that the pre-flight prompted. The other five rows have never moved.
    // v4588 -- RE-TAKEN: one gate (fsrGPU) joined, and FIVE rows moved rather than four, because nameFirst is
    // the fifth. *** THE PRE-FLIGHT PROMPTED THREE OF THEM AND THE GATE FOUND THE FOURTH. *** recordDrift's
    // assertionShape row compares `gates` and `definesOk` and reports "1644 vs 1644, copies 1615 vs 1615"; this
    // file's own gate compares ALL NINE and went red with "DRIFTED: nameFirst 1515 -> 1516". The label on that
    // row already says "not the four this compared", so the narrowness is recorded rather than discovered -- but
    // it is the same shape v4587 found in the knowledge-index check one round earlier: a cheap pre-view that
    // answers a smaller question than the gate it previews, read as though it answered the same one.
    // v4589 -- RE-TAKEN: one gate (kernelReach) joined, the same five rows by one, and the pre-flight named three
    // while the gate names all nine, the same split recorded a round ago.
    // v4590 -- RE-TAKEN: one gate (temporalGPU) joined, the same five rows by one.
    // v4592 -- RE-TAKEN: one gate (motionVectorsGPU) joined, the same five rows by one again.
    // v4593 -- RE-TAKEN: one gate (temporalRejectGPU) joined. Five rounds running, five rows by one each time.
    // v4552 -- RE-TAKEN: one gate (detourScale) joined, the same four rows by one, SIXTEENTH arrival.
    // v4554 -- RE-TAKEN: one gate (surfaceProbe) joined, the same four rows by one, SEVENTEENTH arrival.
    // v4555 -- RE-TAKEN: one gate (chunk) joined, the same four rows by one, EIGHTEENTH arrival.
    // v4556 -- RE-TAKEN: one gate (versionMarker) joined, the same four rows by one, NINETEENTH arrival.
    // v4557 -- RE-TAKEN: one gate (ritualCoherence) joined, the same four rows by one, TWENTIETH arrival.
    // v4559 -- RE-TAKEN: one gate (pipboyItems) joined, the same four rows by one, TWENTY-FIRST arrival.
    // v4560 -- RE-TAKEN: one gate (xatlasRef) joined, the same four rows by one, TWENTY-SECOND arrival.
    // v4563 -- RE-TAKEN: one gate (fluidSystem) joined, the same four rows by one, TWENTY-THIRD arrival.
    // v4564 -- RE-TAKEN: one gate (sourceExtensions) joined, the same four rows by one, TWENTY-FOURTH.
    // v4566 -- RE-TAKEN: one gate (inputSets) joined, the same four rows by one, TWENTY-FIFTH -- AND
    // distinctDefinitions MOVED for the first time in ten arrivals, 38 -> 39. The new gate spells its own
    // ok() with a default argument (`(name, cond, detail = "")`) that no existing gate uses verbatim, so it
    // is a thirty-ninth distinct text rather than a thirty-eighth copy. Worth a line: this row is the one
    // that would notice a tree drifting toward everybody inventing their own assertion helper, and every
    // previous arrival had reused one.
    // v4569 -- RE-TAKEN: one gate (exactHash) joined, the same four rows by one, TWENTY-SIXTH arrival --
    // and distinctDefinitions moved AGAIN, 39 -> 40, for the second round running after ten that did not.
    // The new gate spells `ok(n, c, d = "")` where v4566's spelled `(name, cond, detail = "")`: same shape,
    // different parameter names, so it is a fortieth distinct text. Two in a row is worth watching -- this
    // row exists to notice a tree drifting toward everybody inventing their own assertion helper.
    // v4572 -- RE-TAKEN for one new gate, tools/ship/recordShape-selfcheck.mjs: gates 1616 -> 1617,
    // usesOk 1595 -> 1596, definesOk 1587 -> 1588, nameFirst 1488 -> 1489. distinctDefinitions holds
    // at 40 -- the new gate uses the ok(name, cond, detail) shape already counted, which is the
    // point of that row: a gate adding a FORTY-FIRST spelling of the same idea is the thing worth
    // noticing, and this one does not.
    // v4572b -- RE-TAKEN for tools/ship/recordProvenance-selfcheck.mjs: 1617 -> 1618 and the three
    // rows that follow a gate by one. distinctDefinitions holds at 40 for the second round running.
    // v4573 -- RE-TAKEN for tools/ship/importClosure-selfcheck.mjs: 1618 -> 1619 and the three rows
    // that follow a gate by one. distinctDefinitions holds at 40 for the THIRD round running.
    // v4575 -- RE-TAKEN for physics/render/conductorFresnel-selfcheck.mjs: 1619 -> 1620 and the three
    // rows that follow a gate by one. distinctDefinitions holds at 40 for the FOURTH round running,
    // and this one is a render gate rather than a tools/ship one, which is the harder case for it.
    // v4576 -- RE-TAKEN for tools/ship/recordTier-selfcheck.mjs: 1620 -> 1621 and the three rows that
    // follow a gate by one. distinctDefinitions holds at 40 for the FIFTH round running.
    // v4577 -- RE-TAKEN for physics/raceKnob-selfcheck.mjs: 1621 -> 1622 and the three rows that follow a
    // gate by one. distinctDefinitions holds at 40 for the SIXTH round running, and this gate is in physics/
    // rather than tools/ship/ -- it lives beside its module on purpose, because registryOrphans derives an
    // instrument's module from its gate path.
    // v4577 -- RE-TAKEN for physics/raceKnob-selfcheck.mjs: 1621 -> 1622.
    // v4579 -- RE-TAKEN for tools/ship/starField-selfcheck.mjs: 1622 -> 1623 and the three rows that follow a
    // gate by one. distinctDefinitions holds at 40 for the SEVENTH round running.
    // v4580 -- RE-TAKEN for tools/ship/skyStars-selfcheck.mjs: 1623 -> 1624 and the three rows that follow a
    // gate by one. distinctDefinitions holds at 40 for the EIGHTH round running.
    // v4582 -- RE-TAKEN for tools/ship/zipWriter-selfcheck.mjs: 1624 -> 1625 and the three rows that follow a
    // gate by one. NOT THIS ROUND'S GATE -- it arrived on main in commit c3f1fecb (the release zip's pure-Node
    // writer) and is re-taken here because that commit and this one merged, and the tree has to be green for
    // whichever lands second. distinctDefinitions holds at 40 for the NINTH round running.
    // 2026-09-14 -- RE-TAKEN after a prior session fixed dozens of gates across the tree, adding 25 gates
    // (1625 -> 1650) between this record and the tree: usesOk 1604 -> 1629, definesOk 1596 -> 1621,
    // nameFirst 1497 -> 1522 -- the same three-rows-move-together pattern every earlier arrival showed, now
    // scaled up because many gates landed instead of one. distinctDefinitions ALSO moved, 40 -> 41: one of
    // the new definitions is not verbatim-identical to an existing one, so it is a forty-first distinct text
    // rather than reuse. importsOk, condFirst, unknownSignature and suspects held at 0, 91, 16 and 0 --
    // verified against a fresh `census()` run (node -e importing tools/ship/assertionShape.mjs) before this
    // edit, independent of the failing gate's own printed numbers.
    // v4622 -- RE-TAKEN: 1650 -> 1656 (usesOk 1629 -> 1635, definesOk 1621 -> 1627, nameFirst 1522 -> 1528),
    // the same three-rows-move-together pattern, six gates landing across this branch's own unshipped rounds
    // since the record above was taken -- tools/ship/ffmpegWasmBridge-selfcheck.mjs is this round's own; the
    // other five arrived in earlier rounds on the same branch. condFirst, unknownSignature, suspects and
    // distinctDefinitions held at 91, 16, 0 and 41 -- verified against a fresh census() run, independent of
    // the failing gate's own printed numbers.
    // v4584 -- RE-TAKEN on the tree merged with main at v4583 (this history diverged from the branch above at
    // 1625): one gate (fleetRouting) joined, the same four rows by one.
    // v4585 -- RE-TAKEN: one gate (labHome) joined, the same four rows by one.
    // v4586 -- RE-TAKEN: one gate (labKnobs) joined, the same four rows by one.
    // v4587 -- RE-TAKEN with the three sibling gates of the v4586 knob modules (physics/apsidalKnob-, impactKnob-,
    // hologramKnob-selfcheck.mjs): 1628 -> 1631 gates, and usesOk, definesOk and nameFirst each by three; nothing else moved.
    // v4588 -- RE-TAKEN with the turret copilot's three gates (physics/turret-, brain/gunnerPolicy-, tools/ship/raceTurret-selfcheck.mjs):
    // 1631 -> 1634 gates, and usesOk, definesOk and nameFirst each by three; nothing else moved.
    // v4589 -- RE-TAKEN: one gate (tools/ship/carViews-selfcheck.mjs) joined, the same four rows by one.
    // v4590 -- RE-TAKEN: one gate (physics/slick-selfcheck.mjs) joined, the same four rows by one.
    // v4591 -- RE-TAKEN: one gate (world/buildingTopple-selfcheck.mjs) joined, the same four rows by one.
    // v4592 -- RE-TAKEN: one gate (physics/spellAmmo-selfcheck.mjs) joined, the same four rows by one.
    // v4622-merge -- RE-TAKEN on this branch's actual merge of origin/main: the two histories above are BOTH
    // real, diverged at 1625, and this round's own merge joins them -- so the final reading is neither one
    // alone but a fresh census() over the merged tree: 1656 -> 1669, usesOk 1635 -> 1648, definesOk 1627 ->
    // 1640, nameFirst 1528 -> 1541 -- the same three-rows-move-together pattern. importsOk, condFirst,
    // unknownSignature, suspects and distinctDefinitions held at 0, 91, 16, 0 and 41.
    // v4623 -- RE-TAKEN 1669 -> 1670 for tools/ship/murmurKit-selfcheck.mjs, the kit's gate. usesOk,
    // definesOk and nameFirst move with it, which is the same three-rows-together pattern the note above
    // records: one new gate that names its subject first is counted by all four.
    // v4626 -- RE-TAKEN 1670 -> 1671 for tools/ship/murmurSpecies-selfcheck.mjs.
    // v4630 -- RE-TAKEN 1671 -> 1672 for tools/ship/murmurSpecies2-selfcheck.mjs, the species gate split
    // off BEFORE the fifth species would have crossed the budget. tools/ship/murmurSpeciesFrames.mjs is a
    // MODULE and not a gate, so it moves runtimeGap's file count by two and this one by one.
    // v4632 -- RE-TAKEN 1672 -> 1674 for TWO gates: tools/ship/murmurSpecies3-selfcheck.mjs (opal and abyss)
    // and tools/ship/murmurSpecies4-selfcheck.mjs (droplet, split out of gate two in the same round because
    // its swell pair cost a paired 206-287 ms against a 3,000 ms ceiling). The second was NOT a new subject:
    // its five rows moved out of tools/ship/murmurSpecies2-selfcheck.mjs, so the tree gained one gate FILE
    // and no new rows -- which is exactly the kind of move that makes a count of gates and a count of claims
    // disagree, and is why this record carries both.
    // v4634 -- RE-TAKEN 1674 -> 1675 for tools/ship/murmurSpecies5-selfcheck.mjs, carrying nebula and
    // tempest. ONE gate for TWO species, which is the shape murmur's own pairing makes possible: the two
    // files call a byte-identical kit set and every row in the gate is a comparison between them.
    // v4636 -- RE-TAKEN 1675 -> 1677 for TWO gates: tools/ship/murmurSpecies6-selfcheck.mjs (fathom) and
    // tools/ship/murmurSpecies7-selfcheck.mjs (geode). TWO gates for TWO species where the round before
    // managed one for two, and the difference is arithmetic rather than temperament: nebula and tempest
    // share a compiled shader's worth of subject matter, while fathom's rows need a three-species ridge
    // control and geode's need a travelling foil, so the pair written as one gate came in at 5,064 ms
    // against a 3,000 ms budget. Trimming the control from ten species to five landed at 3,499 and to four
    // at 3,161 -- still over. THE COUNT OF GATES AND THE COUNT OF SUBJECTS DISAGREE HERE FOR A REASON THE
    // BUDGET DECIDED, which is the same reason v4632's droplet split made them disagree the other way.
    // v4637 -- RE-TAKEN 1677 -> 1679 for TWO gates: tools/ship/murmurSpecies8-selfcheck.mjs (arc) and
    // tools/ship/murmurSpecies9-selfcheck.mjs (sol). TWO GATES FOR TWO SPECIES AGAIN, and again the split is
    // arithmetic: written as one, the pair's first draft of the arc half alone already ran 3,030 ms against a
    // 3,000 ms ceiling. THE TWO SHARE MORE MACHINERY THAN ANY PAIR YET -- sol.ts says its prominences are
    // "solved the way arc's filament is", and the closed-form tube they both call moved into the kit as
    // mhTube this round -- and they still could not share a gate, because what a gate costs is COMPILES and
    // FRAMES, not source lines. The count of gates and the count of shared code disagree here in the
    // opposite direction from v4632's droplet split, which is the third distinct way this record has watched
    // those two numbers come apart.
    // v4638 -- RE-TAKEN 1679 -> 1681 for tools/ship/murmurSpecies10-selfcheck.mjs (aura) and …Species11
    // (flux). A FOURTH consecutive round of two gates for two species -- and the FIRST where the pair was
    // never going to fit in one for a reason other than the budget: the two gates measure along DIFFERENT
    // AXES. aura's rows integrate over the whole interior (a sum and two percentiles); flux's read the frame
    // ROW BY ROW, because its whole claim is vertical. Sharing a file would have meant sharing frames, and
    // frames chosen for one axis are the wrong frames for the other -- which is the same lesson the
    // not-graded note in …Species11 records from the other side.
    // v4639 -- RE-TAKEN 1681 -> 1683 for tools/ship/murmurSpecies12-selfcheck.mjs (duet) and …Species13
    // (chorus). SIXTEEN of murmur's eighteen species are now ported and graded, across THIRTEEN species
    // gates -- and the count of gates has exceeded the count of PAIRS for five rounds running, because since
    // v4636 no two species have shared one. The reason has changed each time (compiles, then frames, then
    // measurement axes) and the record keeps both numbers for that reason.
    // v4641 -- RE-TAKEN 1685 -> 1687 for tools/ship/murmurLive-selfcheck.mjs and …Live2-selfcheck.mjs. The
    // PAIR count does not move with them and that is the point of keeping both numbers: these two gates have
    // one subject between them -- mh_live arriving in the picture -- and they are two files only because four
    // species in one gate measured 2,772 ms against a 3,000 ms ceiling. A count of gates has never been a
    // count of claims, and here it is not a count of subjects either, in the opposite direction to v4640's.
    // v4640 -- RE-TAKEN 1683 -> 1685 for tools/ship/murmurSpecies14-selfcheck.mjs (prism) and …Species15
    // (helix). *** WITH THESE TWO ALL EIGHTEEN OF murmur-web's SPECIES ARE PORTED AND GATED, across fifteen
    // species gates and one kit gate. *** And the last pair is the one where this record's two counts finally
    // say something uncomfortable: FOUR of that pair's rows are not four claims about shaders. Two grade the
    // CONSTANT TABLES and say so in their own titles, because sabotaging the shaders left them green. A count
    // of gates has never been a count of claims; this is the first round where it is not even a count of
    // SUBJECTS, and the gates carry that in their text rather than in this note alone.
    // v4644 -- RE-TAKEN 1687 -> 1689 for tools/ship/murmurIgnite-selfcheck.mjs and …Ignite2-selfcheck.mjs.
    // The SAME shape as v4641's two: one subject -- the SUCCESS flash arriving in pixels -- split across two
    // files because a species costs about 195 ms and four of them would have crossed the 3,000 ms ceiling.
    // What is different this round is that the split carries a claim rather than only a cost: the sibling
    // holds the two heroes whose SUCCESS is NOT the common case, so the pair is "the rule and the
    // exceptions" and reads as two subjects even though it is gating one term.
    // *** v4645 -- RE-DERIVED AT THE main MERGE, which is the only honest way to take this table. *** The two
    // lines re-took it independently: main's rounds through v4644 and the fsr line's five unshipped rounds,
    // each note correct for a tree holding its own new gates and NEITHER correct for the tree holding both.
    // 1689 -> 1751, and the same four rows move together by exactly 62 -- gates, usesOk, definesOk, nameFirst
    // -- because 62 gates arrived and every one of them uses the tree's own assertion shape. THE FOUR THAT DID
    // NOT MOVE ARE THE READING: distinctDefinitions holds at 41, condFirst at 91, unknownSignature at 16 and
    // suspects at 0, so not one of the 62 invented a forty-second spelling of ok(). That is what this census
    // is for, and it is why the row compares all nine rather than the headline.
    // *** RE-TAKEN AT THE MERGE OF origin/claude/exported-functions-mesh-render-exui0d INTO v4697, AND AGAIN
    // NEITHER SIDE'S NUMBER WAS RIGHT -- the v4645 and v4667 lesson a third time. *** This line carried 1775;
    // that branch carried 1856; the merged tree is the union and is neither. Both re-take histories are kept
    // below because each records which gates moved which rows. READ THE LABELS WITH CARE: that branch never
    // bumped ENGINE_VERSION, so its v4646-v4773 labels COLLIDE with this line's v4647-v4679 -- two different
    // "v4647" notes about two different gates. They are that branch's round names, not this tree's versions.
    // ---- this line (main, through v4697) ----
    // *** v4647 -- RE-DERIVED AFTER THIS SESSION'S OWN SIX GATES, AND THE SIGNATURE IS THE ONE ABOVE AGAIN. ***
    // adapterRecord, capsuleSettle, colliderFromGLB, dxcResolve, ensureDxc and failLines arrived across the
    // v4646-v4647 rounds. The same four rows move together by exactly 6 -- gates, usesOk, definesOk,
    // nameFirst -- and THE FOUR READING ROWS DO NOT MOVE AT ALL: distinctDefinitions holds at 41, condFirst
    // at 91, unknownSignature at 16, suspects at 0. So not one of the six invented a forty-second spelling
    // of ok(), which is the thing this census is actually for.
    //
    // *** AND THE ROUNDS THAT ADDED THEM NEVER LOOKED. *** This row was red on BOTH boxes when a full verify
    // was finally run: red here, and red in Keith's gen-9 sweep, where the drift pre-flight named it in so
    // many words -- "assertionShape census: gates 1751 vs 1756". The gates were added one round at a time,
    // each round running the gates it touched, and nothing ran the census that counts them. That is what a
    // pre-flight is for and it only helps somebody who runs it.
    // *** v4647e -- FIVE FILES STOPPED BEING UNREADABLE, WHICH IS THE REPAIR'S WHOLE MEASURABLE EFFECT. ***
    // signatureOf matched only `const|let ok = (a, b` and never the `function ok(a, b)` declaration, so five
    // files carrying perfectly ordinary helpers classified as UNKNOWN. unknownSignature 16 -> 11, of which
    // four are condFirst (91 -> 95) and one nameFirst (1629 -> 1630).
    //
    // IT WAS HARMLESS UNTIL THIS ROUND AND THEN IT WAS NOT. While every shape needed a string literal in the
    // first slot, scanning an unknown file under the wrong order found nothing. boolAsName is a claim about
    // WHICH SLOT holds the condition, so on ev/esFlight3dMath-selfcheck.mjs -- `function ok(cond, msg)`, read
    // as nameFirst -- it reported every CORRECT call as a swap. Found by this gate on the new shape's first
    // live run, and the shape now refuses to run at all on an unknown signature.
    // *** v4647g -- RE-TAKEN, AND FOR THE FIRST TIME IN FIFTEEN ARRIVALS IT IS condFirst THAT MOVED. ***
    // tools/ship/cliArgs-selfcheck.mjs joined: gates 1757 -> 1758, usesOk 1736 -> 1737, definesOk 1728 ->
    // 1729 as usual -- but nameFirst HELD at 1630 and condFirst went 95 -> 96, because the new gate defines
    // `const ok = (c, name, detail)`. Every note above this one says "the same four rows by one" and names
    // nameFirst as the fourth; this arrival is the counter-example those notes were waiting for, and the
    // census reported it without being asked. That is exactly what the five steady rows exist to do: say
    // that a gate turned up written in a DIFFERENT shape. distinctDefinitions, unknownSignature, importsOk
    // and suspects did not move, so the new file is the minority shape and not a new shape.
    //
    // It is left in that shape deliberately. 96 files is a live population, SHAPE.stringAsCondition covers
    // the swap under condFirst, and rewriting a file to make a census duller is the wrong direction.
    // v4647p -- RE-TAKEN: tools/ship/sweepRotation-selfcheck.mjs joined. gates/usesOk/definesOk by one and
    // nameFirst by one -- the ordinary shape, and the counter-example to v4647g's condFirst arrival two
    // rounds ago. The other five rows did not move.
    // *** v4667 -- RE-TAKEN AT THE MERGE, AND NEITHER SIDE'S NUMBER WAS RIGHT. *** Both lines re-took this
    // census over their own tree while the other was adding gates, so HEAD carried 1762 and origin/main
    // carried its own figure, and the merged tree is neither -- it is the union. A merge that picked a side
    // here would ship a census of half a tree under a whole tree's name. Re-derived below over the merged
    // tree; both re-take histories are kept because each one records which gates moved which rows.
    // ---- this branch's line ----
    // v4663 -- RE-TAKEN: tools/ship/wasmTeardown-selfcheck.mjs joined. gates/usesOk/definesOk by one and
    // nameFirst by one -- the ordinary shape again, and the round that added it converted 48 OTHER gates'
    // last line from process.exit() to process.exitCode without moving a single row here, which is the
    // reassuring half: this census is about how a gate ASSERTS, and how it leaves is not that.
    // v4664 -- RE-TAKEN: tools/ship/thrownRow-selfcheck.mjs joined. The ordinary four by one again.
    // v4666 -- RE-TAKEN: tools/ship/declaredCost-selfcheck.mjs joined. The ordinary four by one, again.
    // ---- the murmuration line ----
    // v4650 -- RE-TAKEN 1759 -> 1760 for tools/ship/murmurTempo-selfcheck.mjs. ONE gate, not the pairs the
    // last three orb rounds added, and the reason is the shape of what it grades: mh_live, mh_state and the
    // SUCCESS shell each needed species RENDERED to be graded, and a species is one WGSL compile, which is
    // what forced those rounds into two files apiece. This one's subject is a NUMBER the host computes, so
    // three of its four sections are pure CPU and the fourth renders two species to turn seconds into light.
    // v4653 -- RE-TAKEN 1760 -> 1762 for tools/ship/murmurDrive-selfcheck.mjs and …Drive2-selfcheck.mjs.
    // A PAIR AGAIN, and for the third time in the orb arc the split was forced by the clock rather than by
    // the subject: five species measured 4,307 ms against a 3,000 ms ceiling, three measured 2,772 -- the
    // exact figure at which tools/ship/murmurLive-selfcheck.mjs was split, for the recorded reason that 8%
    // of margin is over once a contended sweep's 10% is allowed for -- and two measure about 2,300. What is
    // different this time is that the pair carries a real division of subject as well: one gate holds a
    // GEOMETRY claim graded in f64 and the other holds the half a frame can actually show.
    // v4654 -- RE-TAKEN 1762 -> 1763 for tools/ship/murmurClock-selfcheck.mjs. ONE gate, not the pairs the
    // last three orb rounds needed, and the reason is the same one murmurTempo had: the subject is a NUMBER
    // the host computes, so three of its four sections are pure CPU and the fourth renders a single species.
    // A round whose claim is arithmetic does not pay a WGSL compile per species to make it.
    // v4655 -- RE-TAKEN 1763 -> 1764 for tools/ship/murmurClock2-selfcheck.mjs. A PAIR after all, and the
    // clock forced it exactly as it forced the last three: the subject needs THREE species rendered (nebula
    // and tempest share a builder, flux, helix) because the three clocks this round repaired do not live on
    // one body, and three WGSL compiles measure 3,056-3,242 ms on this box against a murmurKit that measures
    // 2,705 here and is RECORDED at 2,035 -- a box drift of 1.33, so about 2,300-2,440 recorded, under the
    // 2,772 at which this tree splits. Putting them in murmurClock instead would have added those three
    // compiles to its existing one and gone over the 3,000 ms ceiling, which does not make a gate slow, it
    // makes it not run.
    // v4656 -- RE-TAKEN 1764 -> 1765 for tools/ship/murmurGesture-selfcheck.mjs. ONE gate again, and the
    // clock allowed it: three species RENDERED is the same three compiles murmurClock2 pays, and the CPU
    // half was brought under the line by MEMOISING the state walks two sections both wanted -- 3,519 ms to
    // 3,135 on this box, which against a murmurKit measuring 2,861 here and RECORDED at 2,035 (drift 1.41)
    // is about 2,230 recorded. Computing the same 21 walks twice was a tenth of the budget spent on
    // arithmetic already done, which is a cheaper thing to find than a second gate file.
    // v4658 -- RE-TAKEN 1765 -> 1766 for tools/ship/murmurComplete-selfcheck.mjs. ONE gate, and it renders
    // FOUR species of the seven the round touched: each is a WGSL compile, seven measured 4,373 ms against a
    // 3,000 ms ceiling and four measure 2,969. The three left out are not dropped -- arc and aura are carried
    // by the source census in section 3, and opal was already moving before this round because it has an
    // ignition shell. What the four are chosen FOR is stated where they are listed: the two largest gains,
    // the one overshoot, and the species carrying both shapes at once.
    // v4659 -- RE-TAKEN 1766 -> 1767 for tools/ship/murmurIgniteAxis-selfcheck.mjs. A SECOND gate for the
    // same signal rather than more rows in murmurComplete's, and the clock decided it: that gate renders
    // four species at 2,969 ms and these are four more, which is four more WGSL compiles and would have put
    // one file over the 3,000 ms ceiling. The split is also the subject's: one gate holds the flash's effect
    // on light that is ALREADY THERE and the other holds the figure it sends TRAVELLING.
    // v4660 -- RE-TAKEN 1767 -> 1768 for tools/ship/murmurIgniteFour-selfcheck.mjs. A THIRD ignition gate,
    // and the reason is the subject rather than the clock this time: v4659's four figures are ONE shape on
    // four axes and share a table, while these four are four different shapes -- a von Mises going round
    // aura, a sequence of windows down fathom's shells, a flat lift on geode with no sweep in it, and a
    // trail decay on comet that adds no light at all. Four shapes in one gate is four sets of rows that
    // share nothing; putting them in the axis gate would also have been four more WGSL compiles on a file
    // already measuring 2,736 ms. This one measures 2,690 with its four species.
    // v4667 -- RE-TAKEN OVER THE MERGED TREE: gates 1768 -> 1771, usesOk 1747 -> 1750, definesOk 1739 ->
    // 1742, nameFirst 1640 -> 1643. The union of two lines that had each re-taken over their own tree --
    // +3 gates from this branch (wasmTeardown, thrownRow, declaredCost) on top of the murmuration line's
    // count, and the ordinary four-by-one shape three times over. condFirst and unknownSignature held.
    // v4677 -- RE-TAKEN 1771 -> 1773. TWO gates, and THE RECORD CAUGHT ITS OWN ROUND'S OMISSION: v4676 added
    // tools/ship/cloneProvision-selfcheck.mjs and did NOT re-take this, so the tree shipped one gate ahead of
    // the record and this line was already red at b826aea8 before v4677 touched anything. v4677 adds
    // tools/ship/exitBusy-selfcheck.mjs. Both move gates/usesOk/definesOk/nameFirst by one each and move
    // nothing else -- the same four rows, for the twenty-somethingth consecutive arrival, which is what keeps
    // the other five rows worth comparing. THE DRIFT WAS NOT A FOREIGN BRANCH'S: both gates are this session's,
    // and the honest reading is that the previous round forgot the step, not that someone else moved the tree.
    // v4678 -- RE-TAKEN 1773 -> 1774 for tools/ship/deadlineLeak-selfcheck.mjs. ONE gate, and the same four rows
    // by one each: gates, usesOk, definesOk, nameFirst. The other five held, as they have through every arrival.
    // v4679 -- RE-TAKEN 1774 -> 1775 for tools/ship/boxTimings-selfcheck.mjs. ONE gate, the same four rows by
    // one each, the other five unmoved -- the shape that says the patterns discriminate rather than track size.
    // ---- the exported-functions-mesh-render branch (labels are that branch's, see above) ----
    // ITS FOUR "HELD" ROWS ARE THE PRE-v4647e FIGURES (condFirst 91, unknownSignature 16) because that branch
    // never had this line's `function ok(...)` repair to signatureOf; over the merged tree the repair applies
    // to its gates too, and none of its 105 arrivals changed signature under it -- all read nameFirst either way.
    // v4646 -- 1751 -> 1752 for render/objectMotionGPU-selfcheck.mjs, the arc's object-aware motion vectors.
    // One gate, and the four rows that move together move by exactly one again -- gates, usesOk, definesOk,
    // nameFirst -- while distinctDefinitions holds at 41, condFirst at 91, unknownSignature at 16 and suspects
    // at 0. It is a gate under render/ rather than tools/ship/, which is where this census's walk has found
    // most of its population, and it spells ok() the same way anyway: the shape is the tree's, not a folder's.
    // v4647 -- 1752 -> 1753 for render/temporalLockGPU-selfcheck.mjs, the runner for the temporal arc's last
    // six kernels. One gate, the same four rows moving by one, and the other four holding: distinctDefinitions
    // 41, condFirst 91, unknownSignature 16, suspects 0. Two rounds running under render/ rather than
    // tools/ship/ and no forty-second spelling of ok() either time.
    // v4648 -- 1753 -> 1754 for render/visibilityGPU-selfcheck.mjs, the id buffer's producer. Third round
    // running under render/ and the same four rows move by one while the other four hold, which is now the
    // shape this census reports rather than a coincidence: distinctDefinitions 41, condFirst 91,
    // unknownSignature 16, suspects 0.
    // v4649 -- 1754 -> 1755 for tools/ship/fsrPageObjects-selfcheck.mjs, fsr.html's object-motion camera,
    // split out of fsrPageDevice-selfcheck for the sweep budget. Same four rows by one; the other four hold.
    // v4650 -- 1755 -> 1756 for render/edgeReveal-selfcheck.mjs, the explanation of v4649's alternation.
    // Four rows by one, four hold. Fourth round running with that shape.
    // v4651 -- 1756 -> 1757 for tools/ship/constantRows-selfcheck.mjs, the census of rows that cannot fail.
    // Fifth round running with the same four rows moving by one. THIS ONE IS A SIBLING OF THIS FILE: both
    // walk every gate and read its ok() calls -- this census asks what SHAPE the call has, that one asks
    // whether its condition can be influenced by anything in the tree.
    // v4654 -- 1757 -> 1758 for tools/ship/runnerCallers-selfcheck.mjs, the census of compute runners that
    // only a gate imports. Sixth round running with the same four rows moving by one and the other four held.
    // v4657 -- 1758 -> 1759 for render/reactiveGPU-selfcheck.mjs, the factor pass's third input.
    // v4661 -- 1759 -> 1760 for tools/ship/fsrPageClocks-selfcheck.mjs, the scene clock and the history's age.
    // v4664 -- 1760 -> 1761 for render/dilateGPU-selfcheck.mjs, FSR2's dilated depth and motion.
    // v4673 -- 1763 -> 1764 for render/opticalFlow-selfcheck.mjs, FSR3's first pass.
    // v4672 -- 1762 -> 1763 for tools/ship/fsr2Coverage-selfcheck.mjs, the FSR2 pass census.
    // v4668 -- 1761 -> 1762 for render/luminancePyramid-selfcheck.mjs, FSR2's luminance pyramid. nameFirst
    // bumped in the SAME edit this time, which it was not at v4661 or v4664.
    // Seventh round running with the same four rows by one and the other four held -- and this round bumped
    // THREE of the four on its first pass and shipped the fourth only because the gate went red on it.
    // nameFirst is the one a hand-edit forgets: it is the shape count, not a gate count, so nothing about
    // "I added one gate" reminds you of it. *** AND v4664 FORGOT IT AGAIN, THREE ROUNDS AFTER THIS
    // SENTENCE WAS WRITTEN. *** Same field, same verify, same repair. Twice now the pre-flight passed and
    // this row caught it, which is the division of labour working and is also the reason the sentence is
    // not enough on its own. The pre-flight cannot see it either -- recordDrift compares four
    // fields and this row compares all nine, which is exactly why that row says so in its own text.
    // v4676 -- 1764 -> 1765 for render/flowReconcile-selfcheck.mjs, FSR3's reconciliation of the two motion
    // fields. Eighth consecutive round with the same four rows moving by exactly one and the other four
    // held. nameFirst bumped in the same edit, unprompted, which is the third round in a row it has been --
    // so the note above has stopped describing the failure and started describing the habit that replaced it.
    // v4677 -- 1765 -> 1766 for render/frameInterp-selfcheck.mjs, the first generated frame in this tree.
    // Ninth round running with the same four rows by one and the other four held.
    // v4678 -- 1766 -> 1767 for render/holeFill-selfcheck.mjs. Tenth round running with the same four rows
    // by one and the other four held.
    // v4681 -- 1767 -> 1768 for tools/ship/fsrPageGen-selfcheck.mjs, FSR3's frame generation on the page.
    // Eleventh round running with the same four rows by one and the other four held.
    // v4683 -- 1768 -> 1769 for tools/ship/fsrPageField-selfcheck.mjs, the fifth page gate. Twelfth round
    // running with the same four rows by one and the other four held.
    // v4684 -- 1769 -> 1771 for tools/ship/pairedStats-selfcheck.mjs and tools/ship/fsrPageConfirm-selfcheck.mjs.
    // TWO gates in one round, so the four rows move by TWO and not by one -- the first time in thirteen rounds
    // that the step is not exactly one, and it is stated here so the pattern's break is not read as a slip.
    // v4685 -- 1771 -> 1772 for render/flowReconcileGPU-selfcheck.mjs, FSR3's reconciliation on the device.
    // v4686 -- 1772 -> 1773 for render/frameInterpGPU-selfcheck.mjs, frame generation on the device.
    // v4687 -- 1773 -> 1774 for render/holeFillGPU-selfcheck.mjs, the hole filler on the device. Fifteenth
    // round running with the same four rows moving together; the only round that broke the pattern was v4684,
    // which added two gates and moved them by two, and said so here rather than letting the step look like a slip.
    // v4690 -- 1774 -> 1775 for render/genGate-selfcheck.mjs, the learned gate's apparatus. Sixteenth round
    // running with the same four rows moving together.
    // v4691 -- 1775 -> 1776 for tools/ship/genGateMeasure-selfcheck.mjs, the pre-registered held-out test.
    // v4693 -- 1776 -> 1777 for tools/ship/genGateCalibrate-selfcheck.mjs, the operating-point test.
    // v4696 -- 1777 -> 1778 for tools/ship/genGateTransfer-selfcheck.mjs, the round where a control fired.
    // v4697 -- 1778 -> 1779 for tools/ship/fsrContent-selfcheck.mjs, the census of what fsr.html's seven scenes
    // actually contain. Seventeenth round running with the same four rows moving together by one.
    // v4698 -- 1779 -> 1780 for tools/ship/foldStats-selfcheck.mjs, the seven-fold statistic gated on synthetic
    // data in its pre-registration's round. Eighteenth round running with the four rows moving together by one.
    // v4699 -- 1780 -> 1781 for tools/ship/genGateFoldsMeasure-selfcheck.mjs, H4's measurement re-derived from its
    // committed data. Nineteenth round running with the four rows moving together by one.
    // v4701 -- 1781 -> 1782 for tools/ship/genGateAbsoluteMeasure-selfcheck.mjs, H5 re-derived from its committed
    // data. (v4700 added no gate and held the four rows, so this is the twentieth round of the pattern, not the
    // twenty-first.)
    // v4702 -- 1782 -> 1783 for tools/ship/genGateRule-selfcheck.mjs, the parameter-free rule gated on synthetic frames.
    // v4703 -- 1783 -> 1784 for tools/ship/genGateRuleMeasure-selfcheck.mjs, H6 re-derived from the two caches.
    // v4704 -- 1784 -> 1785 for tools/ship/genGateVerdicts-selfcheck.mjs, the page's verdict table graded and driven.
    // v4705 -- 1785 -> 1786 for tools/ship/frameGate-selfcheck.mjs, the frame-level question's statistic and harvest.
    // v4706 -- 1786 -> 1787 for tools/ship/frameGateMeasure-selfcheck.mjs, H7 re-derived and C12 re-harvested.
    // v4707 -- 1787 -> 1788 for tools/ship/frameHoles-selfcheck.mjs, H8's statistic on synthetic frames.
    // v4708 -- 1788 -> 1789 for tools/ship/frameHolesMeasure-selfcheck.mjs, H8 re-derived and C12 re-harvested.
    // v4709 -- 1789 -> 1790 for tools/ship/frameHoled-selfcheck.mjs, H9's statistic and C21, the ratio proven honoured.
    // v4710 -- 1790 -> 1791 for tools/ship/frameHoledMeasure-selfcheck.mjs, H9 re-derived with C12 and C21 on its cells.
    // v4711 -- 1791 -> 1792 for tools/ship/frameVertical-selfcheck.mjs, the slab's new direction proven and H10 declared.
    // v4712 -- 1792 -> 1793 for tools/ship/frameVerticalMeasure-selfcheck.mjs, H10 re-derived with C12 and C22 on its cell.
    // v4713 -- 1793 -> 1794 for tools/ship/frameVerdicts-selfcheck.mjs, H7-H10 as the page states them, graded and driven.
    // v4714 -- 1794 -> 1795 for tools/ship/frameGain-selfcheck.mjs, H11's document, score and statistic, no declared data.
    // v4715 -- 1795 -> 1796 for tools/ship/frameGainMeasure-selfcheck.mjs, H11 re-derived with C12 and C23 on both cells.
    // v4716 -- 1796 -> 1797 for tools/ship/frameReverse-selfcheck.mjs, H12's and H13's document and statistic, no declared data.
    // v4717 -- 1797 -> 1798 for tools/ship/frameReverseMeasure-selfcheck.mjs, H12 and H13 re-derived with C12 and C24.
    // v4718 -- 1798 -> 1799 for tools/ship/frameSway-selfcheck.mjs, the page's new slab path proven and H14 declared on it.
    // v4719 -- 1799 -> 1800 for tools/ship/frameSwayMeasure-selfcheck.mjs, H14 re-derived with C25, C26 and C12.
    // v4720 -- 1800 -> 1801 for tools/ship/frameSwayRep-selfcheck.mjs, H15's document, statistic and C26, no declared data.
    // v4721 -- 1801 -> 1802 for tools/ship/frameSwayRepMeasure-selfcheck.mjs, H15 re-derived with C25, C26 and C12.
    // v4722 -- 1802 -> 1803 for tools/ship/frameDisagree-selfcheck.mjs, H16's document, signal and qualifier, no declared data.
    // v4723 -- 1803 -> 1804 for tools/ship/frameDisagreeMeasure-selfcheck.mjs, H16 re-derived with C25, C26 and C12.
    // v4726 -- 1804 -> 1805 for fx/fsr/fsrTsl-selfcheck.mjs, FSR1 as TSL nodes held to fx/fsr/fsr.js on both of three's backends.
    // v4727 -- 1805 -> 1806 for render/temporalTsl-selfcheck.mjs, the temporal chain's inputs for a three.js scene held to motionVectorsCPU and objectMotionCPU.
    // v4730 -- 1806 -> 1808 for render/temporalClipTsl-selfcheck.mjs and render/temporalLockTsl-selfcheck.mjs, the depth clip and the lock ring split out of render/temporalTsl-selfcheck.mjs when it passed the 20 s cap.
    // v4731 -- 1808 -> 1811 for render/reactiveTsl-selfcheck.mjs, fx/fsr/fsrTemporalTsl-selfcheck.mjs and fx/fsr/fsrTemporalQuality-selfcheck.mjs -- the reactive mask, FSR2's composition over three.js, and what it buys.
    // v4732 -- 1811 -> 1812 for fx/fsr/fsrTemporalLocks-selfcheck.mjs -- what FSR2's lock life and clamp relaxation buy a three.js scene, measured through the driver on both backends.
    // v4733 -- 1812 -> 1814 for fx/fsr/fsrTemporalHalf-selfcheck.mjs and fx/fsr/fsrTemporalHalfQuality-selfcheck.mjs -- FSR2's chain at the half precision it ships with: the stall derived, the composition at half, and what half costs.
    // v4734 -- 1814 -> 1815 for render/shaderRound-selfcheck.mjs -- every round() in a shipped shader, each with a verdict, after the fourth tie-to-even divergence.
    // v4735 -- 1815 -> 1816 for fx/fsr/fsrTemporalLockGhost-selfcheck.mjs -- FSR2's default locks on a pixel-scale texture under a moving occluder: the ghost is real with the clamp alone, and both masks remove it.
    // v4736 -- 1816 -> 1817 for render/frameInterpTsl-selfcheck.mjs -- FSR3's frame generation for a three.js scene begins: the splat as a depth-tested draw and the warp, held to interpolateFrameCPU exactly.
    // v4737 -- 1817 -> 1818 for render/holeFillTsl-selfcheck.mjs -- the holes of a generated frame filled as TSL, fillHolesCPU exactly, and the whole splat-fill-warp against interpolateFrameCPU({ fill }).
    // v4738 -- 1818 -> 1819 for fx/fsr/fsrFrameGen-selfcheck.mjs -- FSR3's frame generation driver on a three.js scene against a frame rendered at the midpoint, a cross-fade and a repeated frame.
    // v4739 -- 1819 -> 1820 for tools/ship/pageShot-selfcheck.mjs -- a three.js page shot presented on WebGPU on this box, against the flags that lose the device.
    // v4740 -- 1820 -> 1821 for render/opticalFlowTsl-selfcheck.mjs -- FSR3's optical flow for a three.js scene: the luma pyramid and the block matcher as TSL, the same vector as opticalFlowCPU at every graded block.
    // v4741 -- 1821 -> 1823 for render/flowReconcileTsl-selfcheck.mjs and fx/fsr/fsrFrameGenFlow-selfcheck.mjs -- the reconciliation as TSL, per block and per pixel, and what it buys a generated frame.
    // v4742 -- 1823 -> 1824 for fx/fsr/fsr3Tsl-selfcheck.mjs -- FSR3's frame generation on FSR2's upscaled frames, against a frame rendered at the midpoint.
    // v4743 -- 1824 -> 1826 for render/framePacer-selfcheck.mjs and fx/fsr/fsr3Pacing-selfcheck.mjs -- when each frame is shown: FSR3's half-way frame against timed generation, in ms and in dB.
    // v4744 -- 1826 -> 1827 for fx/fsr/fsrFrameGenArc-selfcheck.mjs -- motion on the arc for frame generation, and the chord-vs-arc error measured before it was built.
    // v4745 -- 1827 -> 1828 for fx/fsr/fsrFrameGenScene-selfcheck.mjs -- shadows, a reflection and a HUD drawn by three.js, between two frames: the still-surface margin and FSR3's UI composition.
    // v4746 -- 1828 -> 1830 for render/flicker-selfcheck.mjs and fx/fsr/fsrFlicker-selfcheck.mjs -- flicker between real and generated frames: the measure, and FSR3 against native frames.
    // v4747 -- 1830 -> 1831 for fx/fsr/fsr3Late-selfcheck.mjs -- a late real frame through FSR3 and the pacer on the device.
    // v4748 -- 1831 -> 1833 for render/flowCost-selfcheck.mjs and fx/fsr/fsrFlowCost-selfcheck.mjs -- what the optical flow reads, and the device's time held to it.
    // v4750 -- 1833 -> 1834 for fx/fsr/fsrFrameGenWorld-selfcheck.mjs -- a still surface judged in the world, under a panning camera.
    // v4751 -- 1834 -> 1835 for fx/fsr/fsr3Hold-selfcheck.mjs -- FSR3 holding the two newest pairs through a late frame.
    // v4752 -- 1835 -> 1836 for fx/fsr/fsrFrameGenParticles-selfcheck.mjs -- particles through the generator, instanced and in one buffer.
    // v4753 -- 1836 -> 1837 for fx/fsr/fsrFlowGrid-selfcheck.mjs -- the optical flow with each level on its own block grid, in the generator.
    // v4755 -- 1837 -> 1838 for fx/fsr/fsrFrameGenUi-selfcheck.mjs -- a translucent, moving UI over a generated frame.
    // v4756 -- 1838 -> 1839 for fx/fsr/fsr3LiveClock-selfcheck.mjs -- FSR3 paced on requestAnimationFrame's own timestamps.
    // v4757 -- 1839 -> 1840 for render/temporalTslMeshes-selfcheck.mjs -- skinned and morphed meshes and an orthographic camera through the motion stage.
    // v4758 -- 1840 -> 1841 for fx/fsr/fsrFlowSeed-selfcheck.mjs -- the optical flow seeded with the application's vectors, in the generator.
    // v4759 -- 1841 -> 1842 for fx/fsr/fsrFlowStill-selfcheck.mjs -- standing still as a flow guess, in the generator.
    // v4760 -- 1842 -> 1844 for render/translucentLayer-selfcheck.mjs and fx/fsr/fsrFrameGenTranslucent-selfcheck.mjs -- translucent things as a layer drawn at t.
    // v4761 -- 1844 -> 1845 for render/temporalTslZoo-selfcheck.mjs -- BatchedMesh, sprites, and meshes sharing one program through the motion stage.
    // v4762 -- 1845 -> 1846 for render/temporalTslCompute-selfcheck.mjs -- particles a compute pass moves, through the motion stage.
    // v4763 -- 1846 -> 1847 for tools/ship/threeUpstream-selfcheck.mjs -- the three.js bug-report drafts, held to their reproductions.
    // v4764 -- 1847 -> 1848 for tools/ship/realGpuRun-selfcheck.mjs -- the FSR gates on a real GPU, and a report that names it.
    // v4765 -- 1848 -> 1849 for fx/fsr/fsrFrameGenBackdrop-selfcheck.mjs -- what reads the frame behind it, drawn over the generated frame.
    // v4766 -- 1849 -> 1850 for tools/ship/fsrThreeWorld-selfcheck.mjs -- the demo page showing what the recent rounds took, wired and presented.
    // v4767 -- 1850 -> 1851 for fx/fsr/fsrFrameGenLayerCost-selfcheck.mjs -- what the translucent layer costs, and one quad in place of a geometry pass.
    // v4768 -- 1851 -> 1852 for fx/fsr/fsrFlowRetry-selfcheck.mjs -- the flow's blocks the window did not explain, searched again wider.
    // v4769 -- 1852 -> 1853 for fx/fsr/fsrFrameGenReach-selfcheck.mjs -- where the flow lost to the vectors on pans: holes left black, and a fill that reaches 16.
    // v4770 -- 1853 -> 1854 for render/temporalTslNodes-selfcheck.mjs -- sprites turned by a node, sized points on a sprite, and a position node over skins and morphs.
    // v4772 -- 1854 -> 1855 for render/temporalTslMany-selfcheck.mjs -- the motion stage past 1024 instances: the previous matrices a texture.
    // v4773 -- 1855 -> 1856 for tools/ship/threeUpstreamPaths-selfcheck.mjs -- the three.js patches on the paths their drafts' reproductions skip.
    // AT THE MERGE -- RE-DERIVED BY RUNNING census() OVER THE MERGED TREE, not by adding the two notes up,
    // and the two agree exactly, which is the check: gates 1775 -> 1880, usesOk 1754 -> 1859, definesOk
    // 1746 -> 1851, nameFirst 1647 -> 1752 -- this line's figures plus that branch's 105 gates (all new files,
    // none overlapping this line's 24 since the merge base, every one nameFirst under the repaired
    // signatureOf). The rows that did not move are this line's: distinctDefinitions 41, condFirst 96,
    // unknownSignature 11, suspects 0. So that branch's 91/16 were the old classifier's reading, not a
    // disagreement about the tree, and none of its hundred and five invented a forty-second spelling of ok().
    // v4778 -- AT THE RTX MERGE, RE-DERIVED BY RUNNING census() OVER THE MERGED TREE: gates 1880 -> 1925, usesOk
    // 1859 -> 1904, definesOk 1851 -> 1896 -- that line's 45 gates, all new files. nameFirst 1752 -> 1796 (+44) and
    // condFirst 96 -> 97 (+1): tools/ship/gltfConformance-selfcheck.mjs defines `ok = (c, m)` and calls it that way
    // throughout, so it is the forty-second distinct spelling (41 -> 42) and it is self-consistent, which is what the
    // suspects row (still 0) asks. unknownSignature holds at 11.
    // v4778 -- 1925 -> 1926 for tools/ship/fsrCaches-selfcheck.mjs -- the FSR caches in their own folder, out of the
    // release zip, installable on request. usesOk 1904 -> 1905, definesOk 1896 -> 1897, nameFirst 1796 -> 1797; the
    // rest hold (measured with census()).
    // Round A (the camera boom) -- 1926 -> 1927 for camera/cameraBoom-selfcheck.mjs. usesOk 1905 -> 1906, definesOk
    // 1897 -> 1898, nameFirst 1797 -> 1798, the same four rows by one; the rest hold (measured with census(), and the
    // gate's own drift row named exactly these four).
    // the lock-sums round -- 1927 -> 1929 for render/temporalLockSums-selfcheck.mjs and render/temporalLockSumsTsl-selfcheck.mjs.
    // usesOk, definesOk and nameFirst each by two; the rest hold (the gate's own drift row named exactly these four).
    // the splat-collision round -- 1929 -> 1930 for tools/ship/splatVoxelWorld-selfcheck.mjs. usesOk, definesOk and
    // nameFirst each by one; the rest hold (the gate's own drift row named exactly these four).
    // the denoiser arc, round 1 -- 1930 -> 1931 for brain/conv2d-selfcheck.mjs. usesOk, definesOk and nameFirst each by
    // one; the rest hold (the gate's own drift row named exactly these four).
    // the denoiser arc, round 2 -- 1931 -> 1937 for the six gates of render/denoiseScenes, denoiseFilter, denoiseStats,
    // denoiseNet, denoiseStudy and brain/convNet. usesOk, definesOk and nameFirst each by six; the rest hold.
    // the denoiser arc, round 4 -- 1937 -> 1938 for render/denoiseTemporal-selfcheck.mjs. usesOk, definesOk and nameFirst
    // each by one; the rest hold (the gate's own drift row named exactly these four).
    gates: 1938, usesOk: 1917, definesOk: 1909, importsOk: 0,
    distinctDefinitions: 42, nameFirst: 1809, condFirst: 97, unknownSignature: 11,
    suspects: 0,
    // Written three times in three rounds by this session, all caught by reading and none by running.
    writtenThisSession: Object.freeze([
        Object.freeze({ round: "v4478", shape: "arrowNotInvoked", text: "ok(name, async () => true)" }),
        Object.freeze({ round: "v4479", shape: "arrowNotInvoked", text: "ok(name, (() => true)())" }),
        Object.freeze({ round: "v4479", shape: "asyncIife", text: "ok(name, async () => {...}())" }),
    ]),
});
