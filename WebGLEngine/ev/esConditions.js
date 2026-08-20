// WebGLEngine/ev/esConditions.js — Endless Sky "conditions" engine: the integer variable store plus
// the test/action grammar that gates ES missions, events, and conversations. Pure logic, no DOM, so
// it is fully unit-testable. This is what missions/events/conversations will sit on next.
//
// Two halves:
//   1) a ConditionStore: string key -> integer, with DERIVED providers that intercept reserved keys
//      (credits, "reputation: <govt>", random, dates, "ships: <cat>", "outfit: <name>", visited, ...).
//   2) evaluators over esParse nodes:
//        evaluateTest(node, store)   -> bool   (a `to offer`/`to complete`/event `conditions` block)
//        applyActions(node, store)   -> {set:[...], skipped:[...]}   (an `on offer`/`on complete` block)
//
//   import { parseES } from "./esParse.js";
//   import { createConditionStore, evaluateTest, applyActions, testBlock, applyBlock } from "./esConditions.js";
//   const store = createConditionStore(player, uni);
//   if (testBlock(missionNode, "to offer", store)) applyBlock(missionNode, "on offer", store);
//
// Grammar (from the ES data): tests are `has "k"`, `not "k"`, `never`, `"k" OP expr`
// (OP in == != < > <= >=, and a bare `=` is treated as ==), grouped with `and {…}` / `or {…}`
// (sibling default = AND). Actions are `set "k"`, `clear "k"`, `"k" = expr`, `+= -= *= /= %=`,
// `"k" ++`, `"k" --`, and `"k" <?= expr` / `"k" >?= expr` (assign min / max). Expressions support
// + - * / % and parentheses; a bare word is a condition key, a number is itself.

"use strict";

const CMP = new Set(["==", "!=", "<", ">", "<=", ">=", "="]);
const ASSIGN = new Set(["=", "+=", "-=", "*=", "/=", "%=", "<?=", ">?="]);

function isNumeric(t) { return /^-?\d+(\.\d+)?$/.test(t); }
function trunc(n) { return Number.isFinite(n) ? Math.trunc(n) : 0; }

// ---------------------------------------------------------------------------------------------------
// Store with derived providers. player is the mutable game state; uni is the loaded universe (for
// value lookups like net worth). Providers are tried in order on every get/set; the first match wins.
// ---------------------------------------------------------------------------------------------------
function createConditionStore(player, uni, opts = {}) {
    player = player || {};
    player.conditions = player.conditions || {};
    player.reputation = player.reputation || {};
    player.visitedSystems = player.visitedSystems || new Set();
    player.visitedPlanets = player.visitedPlanets || new Set();
    player.licenses = player.licenses || new Set();
    player.cargo = player.cargo || {};
    const rng = opts.rng || Math.random;

    const flagship = () => player.ship || (player.fleet && player.fleet[0]) || null;
    const fleet = () => player.fleet || (player.ship ? [player.ship] : []);
    const outfitCount = (name) => {
        let n = 0;
        for (const s of fleet()) { const o = s && s.outfits; if (o && o[name]) n += o[name]; }
        return n;
    };
    const shipCount = (cat) => fleet().filter((s) => !cat || (s && s.category === cat)).length;
    const flagAttr = (attr) => { const f = flagship(); return f && f.attr && f.attr[attr] != null ? +f.attr[attr] : (f && f[attr] != null ? +f[attr] : 0); };

    // Derived providers: { test(key)->bool, get(key)->int, set?(key,val) }
    const providers = [
        { test: (k) => k === "credits", get: () => trunc(player.credits || 0), set: (k, v) => { player.credits = trunc(v); } },
        { test: (k) => k === "net worth", get: () => {
            let w = trunc(player.credits || 0);
            for (const s of fleet()) w += trunc((s && s.cost) || 0);
            return w;
        } },
        { test: (k) => k.startsWith("reputation: "), get: (k) => trunc(player.reputation[k.slice(12)] || 0), set: (k, v) => { player.reputation[k.slice(12)] = trunc(v); } },
        { test: (k) => k === "random", get: () => Math.floor(rng() * 100) },   // fresh 0..99 each read
        { test: (k) => k === "day", get: () => (player.date && player.date.day) || 0 },
        { test: (k) => k === "month", get: () => (player.date && player.date.month) || 0 },
        { test: (k) => k === "year", get: () => (player.date && player.date.year) || 0 },
        { test: (k) => k === "days since epoch", get: () => (player.date && player.date.epochDay) || 0 },
        { test: (k) => k === "days since start", get: () => (player.date && player.date.epochDay || 0) - (player.startEpochDay || 0) },
        { test: (k) => k === "days since year start", get: () => (player.date && player.date.dayOfYear) || 0 },
        { test: (k) => k === "ships", get: () => shipCount(null) },
        { test: (k) => k.startsWith("ships: "), get: (k) => shipCount(k.slice(7)) },
        { test: (k) => k.startsWith("outfit: "), get: (k) => outfitCount(k.slice(8)) },
        { test: (k) => k.startsWith("flagship: "), get: (k) => flagAttr(k.slice(10)) },
        { test: (k) => k === "cargo space", get: () => flagAttr("cargo space") },
        { test: (k) => k === "passenger space" || k === "bunks", get: () => flagAttr("bunks") },
        { test: (k) => k.startsWith("cargo: "), get: (k) => trunc(player.cargo[k.slice(7)] || 0), set: (k, v) => { player.cargo[k.slice(7)] = trunc(v); } },
        { test: (k) => k === "passengers", get: () => trunc(player.passengers || 0), set: (k, v) => { player.passengers = trunc(v); } },
        { test: (k) => k.startsWith("license: "), get: (k) => player.licenses.has(k.slice(9)) ? 1 : 0, set: (k, v) => { const n = k.slice(9); if (v) player.licenses.add(n); else player.licenses.delete(n); } },
        { test: (k) => k.startsWith("visited planet: "), get: (k) => player.visitedPlanets.has(k.slice(16)) ? 1 : 0, set: (k, v) => { const n = k.slice(16); if (v) player.visitedPlanets.add(n); else player.visitedPlanets.delete(n); } },
        { test: (k) => k.startsWith("visited system: "), get: (k) => player.visitedSystems.has(k.slice(16)) ? 1 : 0, set: (k, v) => { const n = k.slice(16); if (v) player.visitedSystems.add(n); else player.visitedSystems.delete(n); } },
        { test: (k) => k.startsWith("planet: "), get: (k) => (player.planetName && player.planetName === k.slice(8)) ? 1 : 0 },
        { test: (k) => k.startsWith("system: "), get: (k) => (player.systemName && player.systemName === k.slice(8)) ? 1 : 0 },
    ];
    const provFor = (k) => { for (const p of providers) if (p.test(k)) return p; return null; };

    return {
        get(key) {
            const p = provFor(key);
            if (p) return trunc(p.get(key));
            const v = player.conditions[key];
            return v == null ? 0 : trunc(v);
        },
        set(key, val) {
            val = trunc(val);
            const p = provFor(key);
            if (p && p.set) { p.set(key, val); return; }
            if (p && !p.set) return;   // read-only derived (e.g. random, net worth): ignore writes
            player.conditions[key] = val;
        },
        add(key, delta) { this.set(key, this.get(key) + trunc(delta)); },
        has(key) { return this.get(key) !== 0; },
        erase(key) { const p = provFor(key); if (p && p.set) p.set(key, 0); else delete player.conditions[key]; },
        snapshot() { return Object.assign({}, player.conditions); },
        player, uni,
    };
}

// ---------------------------------------------------------------------------------------------------
// Expression evaluator over a token array. Bare word -> condition key (store.get), number -> itself.
// Supports + - * / % and ( ). Shunting-yard to RPN, then evaluate. Integer semantics (ES uses int64).
// ---------------------------------------------------------------------------------------------------
const PREC = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2 };
function evalExpr(tokens, store) {
    if (!tokens.length) return 0;
    if (tokens.length === 1) return isNumeric(tokens[0]) ? +tokens[0] : store.get(tokens[0]);
    const out = [], ops = [];
    for (const t of tokens) {
        if (t === "(") ops.push(t);
        else if (t === ")") { while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop()); ops.pop(); }
        else if (PREC[t] != null) { while (ops.length && PREC[ops[ops.length - 1]] >= PREC[t]) out.push(ops.pop()); ops.push(t); }
        else out.push(t);
    }
    while (ops.length) out.push(ops.pop());
    const st = [];
    for (const t of out) {
        if (PREC[t] != null) {
            const b = st.pop(), a = st.pop();
            st.push(t === "+" ? a + b : t === "-" ? a - b : t === "*" ? a * b : t === "/" ? (b ? a / b : 0) : (b ? a % b : 0));
        } else st.push(isNumeric(t) ? +t : store.get(t));
    }
    return trunc(st.pop());
}

// Evaluate one comparison line: [ ...left..., OP, ...right... ]. Returns bool.
function evalComparison(tokens, store) {
    let i = tokens.findIndex((t) => CMP.has(t));
    if (i < 0) return store.has(tokens[0]);   // a bare key is truthy-test
    const op = tokens[i];
    const l = evalExpr(tokens.slice(0, i), store), r = evalExpr(tokens.slice(i + 1), store);
    switch (op) {
        case "==": case "=": return l === r;
        case "!=": return l !== r;
        case "<": return l < r;
        case ">": return l > r;
        case "<=": return l <= r;
        case ">=": return l >= r;
    }
    return false;
}

// Evaluate a condition-set NODE (its children are the test list; siblings AND, `or{}` groups OR).
function evaluateChildren(children, store, mode = "and") {
    if (!children || !children.length) return true;   // empty test = always true
    const results = [];
    for (const c of children) {
        const k = c.tokens[0];
        if (k === "never") results.push(false);
        else if (k === "has") results.push(store.has(c.tokens[1]));
        else if (k === "not") results.push(!store.has(c.tokens[1]));
        else if (k === "and") results.push(evaluateChildren(c.children, store, "and"));
        else if (k === "or") results.push(evaluateChildren(c.children, store, "or"));
        else results.push(evalComparison(c.tokens, store));
    }
    return mode === "or" ? results.some(Boolean) : results.every(Boolean);
}
function evaluateTest(node, store) { return node ? evaluateChildren(node.children, store, "and") : true; }

// ---------------------------------------------------------------------------------------------------
// Action applier. Runs the condition-mutating verbs in an `on offer`/`on complete` block and reports
// the rest (log/dialog/payment/event/conversation/…) as skipped, for the mission runner to handle.
// ---------------------------------------------------------------------------------------------------
function applyActions(node, store) {
    const set = [], skipped = [];
    if (!node || !node.children) return { set, skipped };
    for (const c of node.children) {
        const t = c.tokens, k0 = t[0];
        if (k0 === "set") { store.set(t[1], 1); set.push([t[1], "=", 1]); continue; }
        if (k0 === "clear") { store.set(t[1], 0); set.push([t[1], "=", 0]); continue; }
        // key-first assignments: [key, OP, ...expr]  or  [key, "++" | "--"]
        const op = t[1];
        if (op === "++") { store.add(t[0], 1); set.push([t[0], "+=", 1]); continue; }
        if (op === "--") { store.add(t[0], -1); set.push([t[0], "-=", 1]); continue; }
        if (ASSIGN.has(op)) {
            const rhs = evalExpr(t.slice(2), store);
            const cur = store.get(t[0]);
            let v = cur;
            switch (op) {
                case "=": v = rhs; break;
                case "+=": v = cur + rhs; break;
                case "-=": v = cur - rhs; break;
                case "*=": v = cur * rhs; break;
                case "/=": v = rhs ? Math.trunc(cur / rhs) : cur; break;
                case "%=": v = rhs ? cur % rhs : cur; break;
                case "<?=": v = Math.min(cur, rhs); break;
                case ">?=": v = Math.max(cur, rhs); break;
            }
            store.set(t[0], v); set.push([t[0], op, rhs]);
            continue;
        }
        skipped.push(t);   // not a condition mutation (mission/event verb)
    }
    return { set, skipped };
}

// Convenience: run a named sub-block (e.g. "to offer", "on complete") of a mission/event node.
function findChild(node, key) { if (!node || !node.children) return null; for (const c of node.children) if (c.tokens.join(" ") === key || c.tokens[0] === key) return c; return null; }
function testBlock(node, key, store) { return evaluateTest(findChild(node, key), store); }
function applyBlock(node, key, store) { return applyActions(findChild(node, key), store); }

if (typeof module !== "undefined" && module.exports)
    module.exports = { createConditionStore, evaluateTest, applyActions, evalExpr, testBlock, applyBlock, findChild };
export { createConditionStore, evaluateTest, applyActions, evalExpr, testBlock, applyBlock, findChild };
