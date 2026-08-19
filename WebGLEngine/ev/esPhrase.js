// WebGLEngine/ev/esPhrase.js — Endless Sky's phrase grammar.
//
// 867 root `phrase` nodes, the single largest thing the adapter ignored, and three other systems are
// built on it: every hail a government or a unique captain gives you, every spaceport `news` story
// (219 of them), and the ship and mission text that interpolates a phrase inline.
//
// The grammar, from endless-sky/source/Phrase.cpp at master:
//
//   phrase "name"          -- one SENTENCE. Several blocks may share a name; Get() picks one uniformly.
//     word                 -- a PART. Pick one child, weighted by its second token (min 1, default 1).
//       "text"  5          -- ...and a text choice may interpolate another phrase: "a ${colour} ship"
//       ""                 -- an empty choice is legal and deliberate
//     phrase               -- a PART whose choices are the NAMES of other phrases, also weighted
//       "other phrase" 2
//     replace              -- a PART that rewrites what has been built SO FAR, in order
//       "aa" "bb"
//
// Parts concatenate in order. A phrase that refers to itself, directly or through another, yields the
// empty string rather than infinite text -- ES resolves that at load; we resolve it at expansion with a
// visiting set, which also catches cycles a plugin introduces between two separately-loaded files.
//
// The registry is PLAIN DATA on purpose: it is baked into es-universe.json, so nothing here may hold a
// function or a node reference. `rng` is injected, so a co-op room seeded from (room, system) hears the
// same pirate say the same thing on every screen.

"use strict";

const MAX_DEPTH = 12;   // a cycle is caught by `visiting`; this bounds sheer nesting

// --- building ------------------------------------------------------------------------------------
// A text choice is a sequence of literal spans and phrase references: "a ${colour} ship" becomes
// [{t:"a "}, {p:"colour"}, {t:" ship"}]. ES splits it exactly this way (Phrase::Choice::Choice), and it
// is why a phrase name may not contain "${" or "}".
function parseInterpolation(text) {
    const seq = [];
    let start = 0;
    while (start < text.length) {
        const left = text.indexOf("${", start);
        if (left < 0) break;
        const right = text.indexOf("}", left);
        if (right < 0) break;
        if (left > start) seq.push({ t: text.slice(start, left) });
        seq.push({ p: text.slice(left + 2, right) });
        start = right + 1;
    }
    if (start < text.length) seq.push({ t: text.slice(start) });
    if (!seq.length) seq.push({ t: "" });      // a blank choice was desired
    return seq;
}

// Any node's children, read as a sentence: root `phrase`, and the inline bodies of `news { name }`,
// `news { message }` and `person { phrase }`, which use the identical grammar.
function buildSentence(node) {
    const parts = [];
    for (const child of (node && node.children) || []) {
        const key = child.tokens[0];
        if (!child.children || !child.children.length) continue;   // ES skips a childless part
        if (key === "word" || key === "phrase") {
            const choices = [];
            for (const g of child.children) {
                const w = g.tokens.length >= 2 ? Math.max(1, Math.trunc(+g.tokens[1]) || 1) : 1;
                choices.push(key === "phrase" ? { w, seq: [{ p: g.tokens[0] }] } : { w, seq: parseInterpolation(g.tokens[0]) });
            }
            if (choices.length) parts.push({ choices });
        } else if (key === "replace") {
            const replace = [];
            for (const g of child.children) replace.push([g.tokens[0], g.tokens.length >= 2 ? g.tokens[1] : ""]);
            if (replace.length) parts.push({ replace });
        }
        // anything else: ES prints a trace and skips. So do we.
    }
    return parts;
}

// All root `phrase` nodes -> { name: [sentence, ...] }. Repeating a name APPENDS a sentence; it does not
// replace one, which is how the base game spreads "merchant names" across several files.
function buildPhrases(root) {
    const out = {};
    for (const node of (root && root.children) || []) {
        if (node.tokens[0] !== "phrase" || node.tokens[1] == null) continue;
        const s = buildSentence(node);
        if (!s.length) continue;
        (out[node.tokens[1]] = out[node.tokens[1]] || []).push(s);
    }
    return out;
}

// --- expanding -----------------------------------------------------------------------------------
function pickWeighted(choices, rng) {
    let total = 0;
    for (const c of choices) total += c.w;
    let r = rng() * total;
    for (const c of choices) { r -= c.w; if (r < 0) return c; }
    return choices[choices.length - 1];
}

function expandSentence(parts, phrases, rng, visiting, depth) {
    let result = "";
    for (const part of parts) {
        if (part.choices) {
            for (const el of pickWeighted(part.choices, rng).seq)
                result += el.p != null ? expandPhrase(el.p, phrases, rng, visiting, depth + 1) : el.t;
        } else if (part.replace) {
            for (const [from, to] of part.replace) if (from) result = result.split(from).join(to);
        }
    }
    return result;
}

// A name that is missing, recursive, or nested too deep yields "" -- never a throw, never a loop. ES
// makes the same trade: silence beats infinite text on someone's screen.
function expandPhrase(name, phrases, rng = Math.random, visiting = new Set(), depth = 0) {
    const sentences = phrases && phrases[name];
    if (!sentences || !sentences.length || depth > MAX_DEPTH || visiting.has(name)) return "";
    visiting.add(name);
    const s = sentences.length === 1 ? sentences[0] : sentences[Math.min(sentences.length - 1, Math.floor(rng() * sentences.length))];
    const out = expandSentence(s, phrases, rng, visiting, depth);
    visiting.delete(name);
    return out;
}

// An inline body (news name/message, a person's hail) is a sentence, not a name.
function expandInline(parts, phrases, rng = Math.random) {
    if (!parts || !parts.length) return "";
    return expandSentence(parts, phrases, rng, new Set(), 0);
}

// Which names a registry refers to but does not define. A plugin that half-loads shows up here rather
// than as an empty hail nobody can explain.
function danglingRefs(phrases) {
    const missing = new Set();
    const walk = (parts) => {
        for (const part of parts || []) {
            if (!part.choices) continue;
            for (const c of part.choices) for (const el of c.seq)
                if (el.p != null && !phrases[el.p]) missing.add(el.p);
        }
    };
    for (const name in phrases) for (const s of phrases[name]) walk(s);
    return [...missing].sort();
}

export { buildPhrases, buildSentence, expandPhrase, expandInline, parseInterpolation, pickWeighted, danglingRefs, MAX_DEPTH };
if (typeof module !== "undefined" && module.exports)
    module.exports = { buildPhrases, buildSentence, expandPhrase, expandInline, parseInterpolation, pickWeighted, danglingRefs, MAX_DEPTH };
