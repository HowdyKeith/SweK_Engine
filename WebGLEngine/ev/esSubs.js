// WebGLEngine/ev/esSubs.js — Endless Sky's `<token>` text substitutions.
//
// Every piece of story text in the game is written with holes in it: "Here, <payment>." / "Captain
// <last>." / "escort the <npc> to <destination>". Until now those holes were printed as written.
//
// Two sources, from endless-sky/source/TextReplacements.cpp at master:
//
//   HARD-CODED   <first> <last> <ship> <model> <planet> <system> <payment> ... supplied by the caller,
//                because only the caller knows the mission, the ship, and the pilot.
//   `substitutions`   a root node (3 in the base game) of `"<key>" "replacement" { <conditions> }`.
//                Each entry whose conditions hold sets subs[key]; a later entry overrides an earlier one,
//                so the list is written general-first and specific-last. Keys must begin with '<'.
//
// A handful of keys are RESERVED and a `substitutions` block may not redefine them: ES applies those
// last, after everything else, and letting data shadow them would let a plugin rewrite the pilot's name.

"use strict";

const RESERVED = new Set([
    "<first>", "<last>", "<original first>", "<original last>",
    "<ship>", "<model>", "<flagship>", "<flagship model>",
    "<previous system>", "<previous planet>", "<current system>", "<current planet>",
    "<start planet>", "<start system>", "<start date>", "<start long date>",
    "<start credits>", "<start credit score>", "<start debt>",
]);

// The root `substitutions` nodes, flattened in file order. Conditions are kept as nodes and tested at
// use time, not load time -- the same key can mean different things before and after a war starts.
function buildSubstitutions(root) {
    const out = [];
    for (const node of (root && root.children) || []) {
        if (node.tokens[0] !== "substitutions" || !node.children) continue;
        for (const c of node.children) {
            if (c.tokens.length < 2) continue;                 // a key with no replacement
            const key = c.tokens[0];
            if (!key || key[0] !== "<") continue;              // ES requires the angle bracket
            if (RESERVED.has(key)) continue;                   // data may not shadow the pilot's own name
            out.push({ key, replacement: c.tokens[1], conditions: c.children && c.children.length ? c : null });
        }
    }
    return out;
}

// Collapse the list against the condition store. Later wins, exactly as ES's map assignment does.
function substitutionMap(list, test) {
    const map = {};
    for (const s of list || []) {
        if (s.conditions && !(test && test(s.conditions))) continue;
        map[s.key] = s.replacement;
    }
    return map;
}

// One left-to-right pass. A replacement is never rescanned, so a substitution whose text contains
// "<planet>" cannot be expanded again -- which is what stops two data entries referring to each other
// from looping forever. An unknown token is left exactly as written; it is somebody's bug, not ours to
// silently delete.
function applySubstitutions(text, map) {
    if (!text || !map) return text || "";
    let out = "", i = 0;
    while (i < text.length) {
        const lt = text.indexOf("<", i);
        if (lt < 0) { out += text.slice(i); break; }
        const gt = text.indexOf(">", lt);
        if (gt < 0) { out += text.slice(i); break; }
        const key = text.slice(lt, gt + 1);
        out += text.slice(i, lt);
        out += Object.prototype.hasOwnProperty.call(map, key) ? map[key] : key;
        i = gt + 1;
    }
    return out;
}

// The keys only the caller can fill. Everything is a string by the time it reaches the text.
function playerSubstitutions(opts = {}) {
    const m = {};
    const put = (k, v) => { if (v != null && v !== "") m[k] = String(v); };
    put("<first>", opts.first); put("<last>", opts.last);
    put("<original first>", opts.first); put("<original last>", opts.last);
    put("<ship>", opts.ship); put("<model>", opts.model);
    put("<flagship>", opts.ship); put("<flagship model>", opts.model);
    put("<system>", opts.system); put("<planet>", opts.planet);
    put("<current system>", opts.system); put("<current planet>", opts.planet);
    put("<origin>", opts.origin); put("<destination>", opts.destination);
    put("<start planet>", opts.startPlanet); put("<start system>", opts.startSystem);
    put("<start date>", opts.startDate); put("<start long date>", opts.startDate);
    if (opts.credits != null) put("<start credits>", Number(opts.credits).toLocaleString());
    if (opts.creditScore != null) put("<start credit score>", opts.creditScore);
    if (opts.debt != null) put("<start debt>", Number(opts.debt).toLocaleString());
    if (opts.payment != null) put("<payment>", Number(opts.payment).toLocaleString() + " credits");
    if (opts.fine != null) put("<fine>", Number(opts.fine).toLocaleString() + " credits");
    put("<npc>", opts.npc); put("<commodity>", opts.commodity); put("<date>", opts.date);
    if (opts.tons != null) put("<tons>", opts.tons + (opts.tons === 1 ? " ton" : " tons"));
    if (opts.passengers != null) put("<bunks>", opts.passengers);
    return m;
}

export { RESERVED, buildSubstitutions, substitutionMap, applySubstitutions, playerSubstitutions };
if (typeof module !== "undefined" && module.exports)
    module.exports = { RESERVED, buildSubstitutions, substitutionMap, applySubstitutions, playerSubstitutions };
