// WebGLEngine/ev/esVoice.js — the two things Endless Sky says to you.
//
// Both are phrase grammars (ev/esPhrase.js) with a rule for choosing which one to expand:
//
//   HAILS   a unique captain speaks for herself; anyone else speaks for their government, and which of
//           its four hails you get depends on whether that government likes you and whether the ship is
//           disabled. 261 hail phrase names across 126 governments.
//   NEWS    a spaceport story, filtered to the planet you landed on. 218 items, each with a name and one
//           or more messages; a `to show` condition gates 62 of them.
//
// Pure and rng-injected: a co-op room seeded from (room, system) hears the same pirate say the same
// thing on every screen.

"use strict";

import { expandPhrase, expandInline } from "./esPhrase.js";
import { matchesPlanet, makeEnv } from "./esLocation.js";   // v2179 -- one LocationFilter

// --- hails ---------------------------------------------------------------------------------------
// ES (Ship::GetHail via AI::Hail): friendly/hostile, and a separate pair for a disabled ship.
function hailPhraseName(govt, opts = {}) {
    const h = govt && govt.hails;
    if (!h) return null;
    if (opts.disabled) return (opts.hostile ? h.hostileDisabled : h.friendlyDisabled) || (opts.hostile ? h.hostile : h.friendly) || null;
    return (opts.hostile ? h.hostile : h.friendly) || null;
}

// What this ship says when you hail it. A person's own `phrase` outranks its government's -- being
// Marauding Max is the whole point of being Marauding Max.
function hailFor(uni, ship, opts = {}) {
    const rng = opts.rng || Math.random;
    const phrases = (uni && uni.phrases) || {};
    if (ship && ship._person && uni && uni.persons) {
        const p = uni.persons.find((x) => x.name === ship._person);
        if (p && p.hail) { const t = expandInline(p.hail, phrases, rng); if (t) return t; }
    }
    const govt = ship && ship.govt != null && uni && uni.govts ? uni.govts[ship.govt] : null;
    const name = hailPhraseName(govt, opts);
    return name ? expandPhrase(name, phrases, rng) : "";
}

// --- news ----------------------------------------------------------------------------------------
// v2179 -- the real LocationFilter, the same one missions and persons use. `system` is passed for the
// caller's convenience; the filter reads the planet's own `_systemId`.
function newsMatches(filter, planet, system, uni) {
    if (!filter) return false;
    if (filter.isEmpty) return true;                       // `news` with no `location` is told everywhere
    const p = planet && planet._systemId == null && system ? { ...planet, _systemId: system.id } : planet;
    return matchesPlanet(filter, p, makeEnv(uni, {}));
}

// Everything this planet could tell you today. `gate` evaluates a `to show` condition node; if the
// caller has no condition store, an item that needs one is left out rather than shown regardless.
function newsFor(uni, planet, system, gate) {
    const out = [];
    for (const item of (uni && uni.news) || []) {
        if (!newsMatches(item.filter, planet, system, uni)) continue;
        if (item.toShow && !(gate && gate(item.toShow))) continue;
        out.push(item);
    }
    return out;
}

// One story, expanded. Returns null when the spaceport has nothing to say, which is most of the galaxy.
function pickNews(uni, planet, system, opts = {}) {
    const rng = opts.rng || Math.random;
    const list = newsFor(uni, planet, system, opts.gate);
    if (!list.length) return null;
    const item = list[Math.floor(rng() * list.length)];
    const phrases = (uni && uni.phrases) || {};
    const one = (arr) => expandInline(arr[Math.floor(rng() * arr.length)], phrases, rng);
    return { id: item.id, name: one(item.names), message: one(item.messages) };
}

export { hailPhraseName, hailFor, newsMatches, newsFor, pickNews };
if (typeof module !== "undefined" && module.exports)
    module.exports = { hailPhraseName, hailFor, newsMatches, newsFor, pickNews };
