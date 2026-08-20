// WebGLEngine/ev/esCoverage.js — what Endless Sky data are we actually loading?
//
// The adapter consumes a fixed set of ES root node types and silently ignores everything
// else. That is a reasonable design, but it means an ES data drop can contain content the
// engine never sees and never mentions. This module turns "I think we ignore some things"
// into a measured inventory.
//
//   import { coverageReport, HANDLED } from "./esCoverage.js";
//   const rep = coverageReport(parseESFiles(texts));
//   rep.unknown  -> [{ type: "phrase", count: 214 }, ...]
//
// It reports, it does not judge: an ignored node type is only a problem if you wanted it.

"use strict";

// Root node types the adapter consumes, and who consumes them. Kept as data (not derived
// from source at runtime) so the browser can use this module too. ev/tools/es-coverage.mjs
// ships a self-check that reads esData.js / esMissions.js and FAILS if any type listed here
// is not actually referenced there — so the list cannot quietly drift out of date.
const HANDLED = new Map([
    ["system", "esData.js — systems, links, stellar objects"],
    ["planet", "esData.js — spobs (landable worlds, landscapes)"],
    ["ship", "esData.js — ship stats, base/variant inheritance"],
    ["outfit", "esData.js — outfits + weapons (weapon child)"],
    ["government", "esData.js — govts, likes/dislikes"],
    ["trade", "esData.js — commodity price bands"],
    ["fleet", "esData.js / esFleets.js — ambient + mission fleets"],
    ["mission", "esMissions.js — lifecycle, filters, objectives"],
    ["event", "esMissions.js — world changes (link/unlink, etc.)"],
    ["shipyard", "esData.js — shipyard stock"],
    ["outfitter", "esData.js — outfitter stock"],
    ["person", "esData.js / esFleets.js — unique captains, weighted spawn"],
    ["phrase", "esData.js / esPhrase.js — the grammar behind hails, news, and inline text"],
    ["news", "esData.js / esVoice.js — spaceport stories, filtered per planet"],
    ["start", "esData.js / esAccount.js — where the pilot wakes up, and in whose debt"],
    ["conversation", "esData.js / esConversation.js — branching story, and its outcome"],
    ["substitutions", "esData.js / esSubs.js — conditional <token> text replacement"],
    ["wormhole", "esData.js — directed links; traversed on landing, drawn on the map"],
]);

// Mission child keys the runner reads. Anything else inside a `mission` block is ignored.
// Measured from esMissions.js's / esCombat.js's child()/children() call sites -- and the selfcheck now
// checks BOTH directions against those sources, because this table drifted twice in one release:
//
//   under-claimed: only "to offer" was listed, so `to accept` (102), `to complete` (100) and `to fail`
//     (174) were reported as ignored across the base game. All three are gated by esMissions. The report
//     said 376 mission keys were dropped that were not.
//   over-claimed:  "deadline" (400) and "invisible" (354) were listed and are read by nothing. The report
//     said they were consumed. They are not, and they are back in the ignored column where they belong.
//
// A coverage report that is wrong in our favour is worse than no coverage report, so the drift guard
// below is the point of this file, not a nicety.
const MISSION_KEYS = new Set([
    "name", "job", "repeat", "source", "destination", "cargo", "passengers",
    "landing", "assisting", "boarding", "stopover", "waypoint",
    // condition gates: every `to <block>` ES defines, all four evaluated by esMissions
    "to offer", "to accept", "to complete", "to fail",
    // dispatched triggers
    "on",
    // parsed for display / combat objectives
    "description", "npc",
    // v2173 -- a display rule: an invisible mission runs, it just never shows in the player's list
    "invisible",
    // v2211 -- SMUGGLING. `illegal <fine> [message]`, `stealth` (fail if discovered), and
    // `apparent payment` (what the mission SAYS it pays). `stealth` was already ignored-and-listed; it is
    // read now.
    "illegal", "stealth", "apparent payment",
    // v2205 -- WHICH mission gets offered. Four flags and a stable sort, and the runner obeys all of them.
    // `blocked` is the message shown when there is no room for a mission; the runner hands it to the caller,
    // which is the only thing that knows the size of the hold.
    "priority", "minor", "non-blocking", "offer precedence", "blocked",
    // v2174 -- the clock: a deadline now expires and fails the mission
    "deadline",
    // v2177 -- a mission's own <token> replacements, layered over the global ones
    "substitutions",
]);

// `to` is the only two-word block verb in a mission, and it is two words in ES's own grammar:
// `to offer` / `to accept` / `to complete` / `to fail`. Naming the key by its first token alone lumped
// four distinct blocks into one row called "to", which is how three implemented gates hid inside a
// number that looked like a gap. An unknown `to visit` from a plugin now names itself.
function missionChildKey(c) {
    const t = (c && c.tokens) || [];
    const k = (c && c.key) ?? t[0] ?? "";
    if (k === "to" && t[1]) return "to " + t[1];
    return k;
}

function tally(list) {
    const m = new Map();
    for (const k of list) m.set(k, (m.get(k) || 0) + 1);
    return [...m.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

// root: the { children: [...] } tree from parseES / parseESFiles.
function coverageReport(root, opts = {}) {
    const kids = (root && root.children) || [];
    const handledKeys = [], unknownKeys = [];
    const missionChildUnknown = [];

    for (const n of kids) {
        const k = (n && (n.key ?? (n.tokens && n.tokens[0]))) || "";
        if (!k) continue;
        if (HANDLED.has(k)) {
            handledKeys.push(k);
            if (k === "mission" && opts.deep !== false) {
                for (const c of (n.children || [])) {
                    const ck = missionChildKey(c);
                    if (!ck) continue;
                    if (MISSION_KEYS.has(ck)) continue;
                    missionChildUnknown.push(ck);
                }
            }
        } else {
            unknownKeys.push(k);
        }
    }

    const handled = tally(handledKeys), unknown = tally(unknownKeys);
    const handledTotal = handledKeys.length, unknownTotal = unknownKeys.length;
    const total = handledTotal + unknownTotal;
    return {
        total, handledTotal, unknownTotal,
        pctHandled: total ? (100 * handledTotal / total) : 100,
        handled, unknown,
        missionChildUnknown: tally(missionChildUnknown),
    };
}

// Plain-text table. Kept here so the baker, the CLI, and any page render it identically.
function formatCoverage(rep) {
    const L = [];
    const pad = (s, n) => String(s).padEnd(n);
    const num = (s, n) => String(s).padStart(n);
    L.push(`ES data coverage: ${rep.handledTotal}/${rep.total} root nodes consumed (${rep.pctHandled.toFixed(1)}%)`);
    L.push("");
    L.push(pad("consumed", 14) + num("count", 8) + "  by");
    for (const r of rep.handled) L.push(pad(r.type, 14) + num(r.count, 8) + "  " + (HANDLED.get(r.type) || ""));
    if (rep.unknown.length) {
        L.push("");
        L.push(`IGNORED root node types (${rep.unknownTotal} nodes) — present in the data, never loaded:`);
        L.push(pad("type", 14) + num("count", 8));
        for (const r of rep.unknown) L.push(pad(r.type, 14) + num(r.count, 8));
    } else {
        L.push("");
        L.push("No ignored root node types — the adapter consumes everything in this data set.");
    }
    if (rep.missionChildUnknown.length) {
        L.push("");
        L.push("Ignored keys INSIDE mission blocks (the runner never reads these):");
        L.push(pad("key", 14) + num("count", 8));
        for (const r of rep.missionChildUnknown) L.push(pad(r.type, 14) + num(r.count, 8));
    }
    return L.join("\n");
}

export { HANDLED, MISSION_KEYS, missionChildKey, coverageReport, formatCoverage };
