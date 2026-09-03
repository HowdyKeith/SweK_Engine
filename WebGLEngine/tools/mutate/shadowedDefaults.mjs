// WebGLEngine/tools/mutate/shadowedDefaults.mjs -- v4394
//
// *** A DEFAULT WRITTEN TWICE ALONG ONE CALL EDGE, AND THE SECOND ONE DECIDES. ***
//
// v4392 found this by accident while trying to fix something else. physics/box3dLockstep.js writes
//
//     createESBox3D(opts.world, { shipHalf: opts.shipHalf || 30 })
//
// and physics/esBox3d.js, the module it just called, writes
//
//     const half = opts.shipHalf || 30;
//
// The same number, twice, on the two ends of one argument. Set the OUTER one to 0 and the outer expression
// becomes falsy, so the inner `|| 30` supplies 30 and the world sees no change at all. The mutation is not
// missed by a gate. It never reaches one. v4392 called it a no-op mutation and said, in its own footer, that
// the finding "generalises further than it is checked ... proved here for one pair and not censused."
//
// This is the census. It is small: EIGHTEEN sites in the whole tree, which is why it is worth having exactly.
//
// ---- TWO OPERATORS, TWO SEPARATE QUESTIONS, AND THE FIRST DRAFT OF THIS FILE CONFLATED THEM -------------------
//
// *** THE GATE'S OWN EXECUTION SECTION IS WHAT CAUGHT IT, ON THE FIRST RUN, AND THE CORRECTION IS THE ROUND. ***
// The draft said a caller who passes an explicit 0 gets the CALLEE's number. That is false whenever the outer
// expression is `||`, and it is `||` at sixteen of these eighteen sites. `opts.max || 32` with opts.max set to 0
// yields 32 -- the FORWARDER swallows the zero at the near end and the callee is never consulted at all. Two
// runs of brain/flowfieldCache.mjs settled it: `{ max: 0 }` gives 32, not brain/brainCache.mjs's 256.
//
// So there are two questions here and each is answered by a different operator in a different file.
//
// QUESTION ONE -- WHAT DOES A ZERO MUTATION OF THE OUTER LITERAL DO? This is the mutation sweep's question.
// Replace V with 0 in the source and run with the option ABSENT, which is the path every gate takes. The outer
// expression yields 0 either way and hands it to the callee, whose own default is W. The CALLEE's operator
// decides, and the two numbers decide the rest:
//
//   callee `||`, V === W   ERASED      `0 || W` is W, and W is V. The world is byte-identical. The literal
//                                      CANNOT BE FALSIFIED by a zero mutation, and a sweep that files it as a
//                                      survivor is reporting its own blindness as coverage.
//   callee `||`, V !== W   REDIRECTED  `0 || W` is W, which is not V, so the world DOES change and a gate can
//                                      catch it -- but what ran was the mutation V -> W, not V -> 0. The
//                                      experiment is legitimate and the sweep's LABEL for it is wrong.
//   callee `??`            HONOURED    `0 ?? W` is 0. The zero arrives intact, the mutation is the mutation the
//                                      sweep says it is, and there is nothing here to correct.
//
// QUESTION TWO -- WHERE DOES A CALLER'S EXPLICIT ZERO DIE? This is the `||`-swallows-zero defect, and it is the
// FORWARDER's operator that answers first:
//
//   forwarder `||`   the 0 dies AT THE NEAR END and becomes V. The callee is irrelevant. Sixteen of eighteen.
//   forwarder `??`   the 0 travels, and then the callee's operator decides whether it survives the far end too.
//
// The draft got question two wrong by answering it with question one's operator. Keeping both fields is the
// fix, because they genuinely are two different facts about one edge and no single verdict can carry both.
//
// ---- TWO STRIPPERS, AND THIS FILE NEEDS BOTH -------------------------------------------------------------------
//
// sourceScan.codeOnly() blanks comments AND string bodies, keeping length so a column still indexes. That is
// right for finding an IDIOM -- `x.k || 3` -- and it is CATASTROPHIC for the import graph, because it turns
// `from "./esBox3d.js"` into `from ""` and every edge in the tree disappears. The first draft of this file did
// exactly that and censused zero pairs, including the one pair v4392 had already proved by hand. noComments()
// keeps strings and is what an import scan needs. Same lesson as v4386, arrived at from the other side.
//
// ---- WHAT THIS CANNOT SEE, STATED RATHER THAN QUIETLY EXCLUDED --------------------------------------------------
//
//   - A DEFAULT THAT IS A NAMED CONSTANT. ai/OllamaClient.js writes `opts.timeoutMs ?? DEFAULT_TIMEOUT_MS`.
//     A literal scanner is blind to it, so an edge into that constructor is invisible. Counted, not guessed at.
//   - WHICH FUNCTION the consuming default is in. The scan is MODULE-level: it knows esBox3d.js defaults
//     shipHalf, not that createESBox3D() is where. When a module defaults one key in more than one place the
//     pairing is a coin toss, so those are AMBIGUOUS and get no verdict -- ai/OllamaClient.js has four
//     timeoutMs defaults and the naive pairing picked the one inside a method nobody on that edge calls.
//   - A DEFAULT THAT IS AN EXPRESSION. `?? 6 * 60 * 1000` is not the number 6, and a regex that stops at the
//     first literal will say it is. Those are UNRESOLVED.
//
// None of the three is rare enough to hand-wave, and all three make the census SMALLER, never larger: an
// undercount is the safe direction for a claim of the form "these sites cannot be falsified."
"use strict";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { codeOnly, noComments } from "../ship/sourceScan.mjs";

const ENG = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const SKIP = new Set(["node_modules", ".git", ".claude", "vendor", "dist", "build"]);

/** Question one: what a ZERO MUTATION of the outer literal does, decided by the CALLEE's operator. */
export const VERDICT = Object.freeze({
    ERASED: "ERASED", REDIRECTED: "REDIRECTED", HONOURED: "HONOURED",
    AMBIGUOUS: "AMBIGUOUS", UNRESOLVED: "UNRESOLVED",
});

/** Question two: where a CALLER's explicit zero dies, decided by the FORWARDER's operator first. */
export const ZERO_DIES = Object.freeze({ FORWARDER: "forwarder", CALLEE: "callee", NOWHERE: "nowhere" });

/**
 * Where an explicit `key: 0` from the caller stops being zero.
 *
 * The forwarder is asked first and usually answers, which is the whole correction above: a `||` forwarder
 * never emits a zero, so the callee's operator is not consulted and its default is unreachable on this edge.
 */
export function zeroDiesAt(fwdOp, calleeOp, fwdValue) {
    if (fwdOp === "||" && Number(fwdValue) !== 0) return ZERO_DIES.FORWARDER;
    return calleeOp === "||" ? ZERO_DIES.CALLEE : ZERO_DIES.NOWHERE;
}

/** Every .js/.mjs under the engine, in a stable order so two runs pair the same sites. */
export function sourceFiles(root = ENG) {
    const out = [];
    (function walk(dir) {
        let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
            if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) walk(full);
            else if (/\.(js|mjs)$/.test(e.name)) out.push(full);
        }
    })(root);
    return out;
}

/** Read once, strip twice -- see the header. `code` for idioms, `text` for import specifiers. */
export function readTree(files) {
    const code = new Map(), text = new Map();
    for (const f of files) {
        let raw; try { raw = fs.readFileSync(f, "utf8"); } catch { continue; }
        code.set(f, codeOnly(raw));
        text.set(f, noComments(raw));
    }
    return { code, text };
}

const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;

/** Imported binding name -> the resolved file it came from. Relative specifiers only; the rest are not ours. */
export function importBindings(file, text, code) {
    const out = new Map();
    const src = text.get(file) || "";
    let m; IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(src))) {
        if (!m[2].startsWith(".")) continue;
        const base = path.resolve(path.dirname(file), m[2]);
        let target = null;
        for (const cand of [base, base + ".js", base + ".mjs"]) if (code.has(cand)) { target = cand; break; }
        if (!target) continue;
        for (const part of m[1].split(",")) {
            const name = part.trim().split(/\s+as\s+/).pop().trim();
            if (name) out.set(name, target);
        }
    }
    return out;
}

/** The text between `(` at `open` and its matching `)`, or null when the call is unbalanced. */
export function callArguments(src, open) {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") { depth--; if (depth === 0) return src.slice(open + 1, i); }
    }
    return null;
}

// `key: <anything>.key || 3` -- the backreference is what makes it a FORWARD rather than a fresh option.
const FORWARD_RE = /([A-Za-z_$][\w$]*)\s*:\s*(?:[\w$.]+\.)?\1\s*(\|\||\?\?)\s*(-?\d+(?:\.\d+)?)/g;
// `something.key || 3` NOT in a `key:` property position -- a read, which is what a consumer does.
const CONSUME_RE = /(?:^|[^\w.$:])[\w$]+\.([A-Za-z_$][\w$]*)\s*(\|\||\?\?)\s*(-?\d+(?:\.\d+)?)/g;
// A default that is a NAMED constant rather than a literal: invisible to the two above, counted separately.
const NAMED_RE = /(?:^|[^\w.$:])[\w$]+\.([A-Za-z_$][\w$]*)\s*(?:\|\||\?\?)\s*([A-Z][A-Z0-9_]{2,})\b/g;

/** Is the literal at `at` (length `len`) part of a larger arithmetic expression? Then it is not the default. */
function truncatedExpression(src, at, len) {
    const after = src.slice(at + len).replace(/^[ \t]+/, "");
    return /^(\*\*|[*/%+\-])/.test(after);
}

/** Every consuming default in one module, module-wide -- see the header on why that is the honest granularity. */
export function consumingSites(file, code) {
    const out = [];
    const lines = (code.get(file) || "").split("\n");
    for (let i = 0; i < lines.length; i++) {
        CONSUME_RE.lastIndex = 0;
        let m;
        while ((m = CONSUME_RE.exec(lines[i]))) {
            const at = m.index + m[0].length - m[3].length;
            out.push({ key: m[1], op: m[2], value: m[3], line: i + 1,
                       truncated: truncatedExpression(lines[i], at, m[3].length) });
        }
    }
    return out;
}

/** Consuming defaults whose value is a named constant. Not pairable, but the count is the blind spot's size. */
export function namedConstantSites(file, code) {
    const out = [];
    const lines = (code.get(file) || "").split("\n");
    for (let i = 0; i < lines.length; i++) {
        NAMED_RE.lastIndex = 0;
        let m;
        while ((m = NAMED_RE.exec(lines[i]))) out.push({ key: m[1], constant: m[2], line: i + 1 });
    }
    return out;
}

/**
 * Forwarding sites: a `key: opts.key || V` written INSIDE the argument list of a call to an imported binding.
 *
 * The import edge is the whole point. Grouping by option NAME alone finds 768 pairs in this tree and almost all
 * of them are coincidence -- `x`, `width`, `steps` and `timeoutMs` are defaulted in dozens of unrelated modules
 * that never call one another. Requiring the callee to be a binding imported from the module that holds the
 * other default takes it to eighteen, and those eighteen are edges that actually exist.
 */
export function forwardingSites(file, code, text) {
    const bindings = importBindings(file, text, code);
    if (!bindings.size) return [];
    const src = code.get(file) || "";
    const out = [];
    for (const [callee, target] of bindings) {
        const re = new RegExp("(?:^|[^\\w.$])" + callee.replace(/[$]/g, "\\$") + "\\s*\\(", "g");
        let m;
        while ((m = re.exec(src))) {
            const open = src.indexOf("(", m.index);
            const args = callArguments(src, open);
            if (args == null) continue;
            FORWARD_RE.lastIndex = 0;
            let w;
            while ((w = FORWARD_RE.exec(args))) {
                const abs = open + 1 + w.index + w[0].length - w[3].length;
                out.push({
                    key: w[1], op: w[2], value: w[3], callee, target,
                    line: src.slice(0, abs).split("\n").length,
                    truncated: truncatedExpression(src, abs, w[3].length),
                });
            }
        }
    }
    return out;
}

/**
 * The verdict for one edge. `consumers` is every consuming default for this key in the target module.
 *
 * AMBIGUOUS comes FIRST and deliberately: a module with two defaults for one key cannot be paired without
 * knowing which function was called, and guessing would put a confident wrong answer into a census whose whole
 * value is that its eighteen rows can be read by hand.
 */
export function verdictFor(fwd, consumers) {
    if (consumers.length !== 1) return { verdict: VERDICT.AMBIGUOUS, consumer: null, why: consumers.length + " consuming defaults for this key in the callee module" };
    const c = consumers[0];
    if (fwd.truncated || c.truncated) return { verdict: VERDICT.UNRESOLVED, consumer: c, why: "a default is an expression, not a literal" };
    if (c.op === "??") return { verdict: VERDICT.HONOURED, consumer: c, why: "the callee uses ??, so a mutated 0 reaches the world as 0" };
    if (Number(c.value) === Number(fwd.value)) return { verdict: VERDICT.ERASED, consumer: c, why: "the callee uses || and repeats the same number, so a zero mutation is a no-op" };
    return { verdict: VERDICT.REDIRECTED, consumer: c, why: "the callee uses || and a DIFFERENT number, so the mutation that actually runs is " + fwd.value + " -> " + c.value + ", not " + fwd.value + " -> 0" };
}

/** Every edge in the tree, verdict attached, sorted so the row order is a property of the tree not the walk. */
export function scan(root = ENG) {
    const files = sourceFiles(root);
    const { code, text } = readTree(files);
    const consumersByFile = new Map();
    const consumersFor = (f) => {
        if (!consumersByFile.has(f)) consumersByFile.set(f, consumingSites(f, code));
        return consumersByFile.get(f);
    };
    const rows = [], seen = new Set();
    for (const f of files) {
        for (const fwd of forwardingSites(f, code, text)) {
            const consumers = consumersFor(fwd.target).filter((c) => c.key === fwd.key);
            if (!consumers.length) continue;
            const v = verdictFor(fwd, consumers);
            const from = path.relative(root, f), to = path.relative(root, fwd.target);
            const id = `${from}:${fwd.line}:${fwd.key}:${to}`;
            if (seen.has(id)) continue;
            seen.add(id);
            rows.push({
                key: fwd.key, from, fromLine: fwd.line, fromOp: fwd.op, fromValue: fwd.value,
                callee: fwd.callee, to, toLine: v.consumer ? v.consumer.line : null,
                toOp: v.consumer ? v.consumer.op : null, toValue: v.consumer ? v.consumer.value : null,
                verdict: v.verdict, why: v.why,
                zeroDies: v.consumer ? zeroDiesAt(fwd.op, v.consumer.op, fwd.value) : null,
            });
        }
    }
    rows.sort((a, b) => (a.from + a.key).localeCompare(b.from + b.key) || a.fromLine - b.fromLine);
    let named = 0;
    const byName = new Map();
    for (const f of files) {
        named += namedConstantSites(f, code).length;
        // THE CONTROL: the same question asked WITHOUT the import edge -- group every default by option name
        // and pair anything that shares one. This is the number the edge requirement has to beat, and it is
        // derived here rather than remembered in a comment, so it moves when the tree does.
        for (const c of consumersFor(f)) {
            if (!byName.has(c.key)) byName.set(c.key, []);
            byName.get(c.key).push(f);
        }
    }
    let naive = 0;
    for (const sites of byName.values()) {
        const distinct = new Set(sites);
        if (distinct.size > 1) naive += sites.length * (distinct.size - 1);
    }
    return { rows, files: files.length, namedConstantDefaults: named, naiveNamePairs: naive };
}

/** Counts DERIVED from the rows. v4387's lesson: a total typed beside the rows it totals drifts away from them. */
export function census(rows) {
    const out = { ERASED: 0, REDIRECTED: 0, HONOURED: 0, AMBIGUOUS: 0, UNRESOLVED: 0, total: rows.length };
    for (const r of rows) out[r.verdict]++;
    return out;
}

/** The sites a zero mutation cannot falsify BEHAVIOURALLY -- see AGREEMENT below for the check that can. */
export function unfalsifiable(rows) { return rows.filter((r) => r.verdict === VERDICT.ERASED); }

/**
 * *** THE ERASED EDGES, FROZEN, SO THAT A ZERO MUTATION AT ANY OF THEM GOES RED BY NAME. ***
 *
 * A behavioural gate cannot catch these -- that is what ERASED means -- but a check that READS THE SOURCE can,
 * and v4392 hand-wrote exactly one: physics/lockstepConstants-selfcheck.mjs greps both files for the shipHalf
 * literal and asserts they match. That is why the v4390 sweep record shows box3dLockstep.js:21's zero mutant
 * as CAUGHT while this file's own analysis says the world never sees it. Both are right, and the first draft
 * of the gate wrote "cannot be caught by any gate, present or future", which the tree's own recorded sweep
 * refutes on the very row it was talking about.
 *
 * So the correct reading of an ERASED row is not "stop counting it". It is: THIS EDGE NEEDS AN AGREEMENT CHECK,
 * because nothing else can make the two numbers agree and nothing else can notice when they stop. Freezing the
 * list generalises v4392's single hand-written pair to all of them, including the two `cell` sites in
 * ui/physicsMontage.js, which had no check of any kind -- no gate in the tree mentions voxelizePage at all.
 *
 * Keyed WITHOUT line numbers on purpose: a line number moves whenever anything above it does, and a check that
 * goes red on an unrelated edit above the line it cares about teaches people to re-freeze it without looking.
 */
export const ERASED_AT_V4394 = Object.freeze([
    Object.freeze({ key: "shipHalf", from: "physics/box3dLockstep.js", to: "physics/esBox3d.js", value: "30" }),
    Object.freeze({ key: "cell", from: "ui/physicsMontage.js", to: "fx/voxelize/pageVoxels.js", value: "6" }),
    Object.freeze({ key: "lat0", from: "ui/radarManager.js", to: "ui/radarProjection.js", value: "0" }),
    Object.freeze({ key: "lon0", from: "ui/radarManager.js", to: "ui/radarProjection.js", value: "0" }),
    Object.freeze({ key: "range", from: "ui/radarManager.js", to: "ui/radarProjection.js", value: "1" }),
]);

/**
 * Which frozen edges still agree, and which have drifted. A drifted edge is the finding: two numbers that were
 * the same when this list was written are no longer the same, and no behavioural test can tell you.
 *
 * `missing` is as serious as `drifted`: an edge that has vanished from the census means either the call was
 * removed (fine, drop the entry) or the scanner stopped seeing it (not fine, and silent).
 */
export function agreement(rows, frozen = ERASED_AT_V4394) {
    const held = [], drifted = [], missing = [];
    for (const f of frozen) {
        const seen = rows.filter((r) => r.key === f.key && r.from === f.from && r.to === f.to);
        if (!seen.length) { missing.push(f); continue; }
        for (const r of seen) {
            if (r.verdict === VERDICT.ERASED && r.fromValue === f.value) held.push({ ...f, line: r.fromLine });
            else drifted.push({ ...f, line: r.fromLine, now: r.fromValue, callee: r.toValue, verdict: r.verdict });
        }
    }
    return { held, drifted, missing };
}

/** Where the caller's explicit zero dies, counted from the rows. Question two, kept apart from question one. */
export function zeroCensus(rows) {
    const out = { forwarder: 0, callee: 0, nowhere: 0, unpaired: 0, orForwarders: 0 };
    for (const r of rows) {
        r.zeroDies ? out[r.zeroDies]++ : out.unpaired++;
        if (r.fromOp === "||") out.orForwarders++;
    }
    return out;
}
