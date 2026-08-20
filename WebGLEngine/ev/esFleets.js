// WebGLEngine/ev/esFleets.js — Endless Sky fleet spawner. The ES analogue of combat.js spawnFromDudes:
// it reads ES `fleet "Name" { government … variant [<w>] { "Ship" [n] … } }` definitions (kept by
// esData.js as uni.esFleets) and the per-system `fleet "Name" <period>` references (system.fleets), and
// turns them into the SAME ship entities combat.js/flightView.js already fly — tagged with government,
// player-stance team, and personality. Two entry points:
//
//   spawnFleet(spec, uni, around, opts)   -> ships for one fleet   (spec: {fleet|fleetNode, government, personality, count})
//   spawnAmbient(system, uni, around, opts)-> the system's ambient traffic mix (weighted by 1/period)
//
// Pure aside from the injected rng. Ships come out shaped exactly like combat.makeEnemy's output, so no
// change to the flight view or the shot pipeline is needed.

"use strict";

import { makeEnemy } from "./combat.js";
import { matchesSystem, makeEnv } from "./esLocation.js";   // v2179 -- one LocationFilter

// ES player-stance: a government is hostile if it always attacks or the player's standing is deeply
// negative; friendly if it never attacks (or standing is high); neutral otherwise. Mirrors the flags
// esData.js bakes onto each govt (alwaysAttack / neverAttack / xenophobic) plus its playerRep.
function esGovtStance(uni, govtId) {
    const g = uni && uni.govts && uni.govts[govtId];
    if (!g) return "neutral";
    const F = { alwaysAttack: 0x0004, neverAttack: 0x0040, xenophobic: 0x0001 };
    if (g.flags & (F.alwaysAttack | F.xenophobic)) return "hostile";
    if (g.flags & F.neverAttack) return "friendly";
    if ((g.playerRep || 0) <= -100) return "hostile";
    if ((g.playerRep || 0) >= 100) return "friendly";
    return "neutral";
}

// stance -> combat team, with a mission-objective hint: ships you must protect/help read as allies,
// ships you must kill/disable/board/capture read as hostile, everything else falls back to govt stance.
function teamFor(uni, govtId, objectiveHint) {
    if (objectiveHint === "friend") return "ally";
    if (objectiveHint === "foe") return "enemy";
    const s = esGovtStance(uni, govtId);
    return s === "hostile" ? "enemy" : (s === "friendly" ? "ally" : "neutral");
}

// A node here is a plain serialized {tokens, children} tree (no .get/.all helpers), same as esMissions
// walks. Small local accessors keep this file independent of esParse's live-node methods.
function kids(n, key) { const o = []; if (n && n.children) for (const c of n.children) if (c.tokens[0] === key) o.push(c); return o; }
function kid(n, key) { if (n && n.children) for (const c of n.children) if (c.tokens[0] === key) return c; return null; }

// Weighted pick over [{w, ...}]. Returns the chosen element, or null. rng injectable.
function pickWeighted(items, rng) {
    let total = 0; for (const it of items) total += (it.w > 0 ? it.w : 0);
    if (total <= 0) return items.length ? items[Math.floor(rng() * items.length)] : null;
    let r = rng() * total;
    for (const it of items) { const w = it.w > 0 ? it.w : 0; if ((r -= w) < 0) return it; }
    return items[items.length - 1];
}

// Expand one fleet node into a flat list of ship-model names (resolving one weighted variant). Each
// `variant [<weight>]` block lists `"Model" [count]` lines; `fighters`/`carried` ships are left to the
// carrier's loadout (not modelled here). Returns [] if the fleet has no usable variant.
function chooseVariant(fleetNode, rng) {
    const variants = kids(fleetNode, "variant").map((v) => ({ w: +v.tokens[1] || 1, node: v }));
    const v = pickWeighted(variants, rng);
    if (!v) return [];
    const models = [];
    for (const line of v.node.children) {
        const name = line.tokens[0]; if (!name) continue;
        const count = Math.max(1, +line.tokens[1] || 1);
        for (let i = 0; i < count; i++) models.push(name);
    }
    return models;
}

// Resolve a fleet spec to its node + government. `spec.fleetNode` (inline block) wins; else look up
// `spec.fleet` (a name) in uni.esFleets. Government precedence: explicit spec.government, then the
// fleet's own `government`, then independent (-1).
function resolveFleet(spec, uni) {
    const node = spec.fleetNode || (spec.fleet ? (uni.esFleets && uni.esFleets[spec.fleet]) : null) || null;
    let govtName = spec.government || null;
    if (!govtName && node) { const g = kid(node, "government"); if (g) govtName = g.tokens[1]; }
    const govt = govtName && uni.govtByName && uni.govtByName[govtName] ? uni.govtByName[govtName].id : -1;
    return { node, govt, govtName };
}

// Spawn one fleet (or `count` copies of it) as combat entities around a point. `objectiveHint` biases
// team ("friend"/"foe"/undefined). Ships get `_fleet`, `govt`, `team`, and a spread ring position.
function spawnFleet(spec, uni, around, opts = {}) {
    const rng = opts.rng || Math.random;
    const { node, govt } = resolveFleet(spec, uni);
    if (!node) return [];
    const out = [];
    const copies = Math.max(1, spec.count || 1);
    const hint = opts.objectiveHint || spec.objectiveHint;
    const team = teamFor(uni, govt, hint);
    let seq = opts.seq0 || 0;
    for (let c = 0; c < copies && out.length < (opts.cap || 40); c++) {
        const models = chooseVariant(node, rng);
        for (const model of models) {
            if (out.length >= (opts.cap || 40)) break;
            const cls = uni.shipByName && uni.shipByName[model]; if (!cls) continue;
            const ang = rng() * Math.PI * 2, r = (opts.minR || 900) + rng() * (opts.spread || 700);
            const e = makeEnemy(cls, uni.weapons || {}, around.x + Math.cos(ang) * r, around.y + Math.sin(ang) * r,
                { ...opts, id: ++seq, rnd: rng, govt, team });
            e._fleet = spec.fleet || "(inline)";
            if (team !== "enemy") { e.vx = (rng() - 0.5) * 40; e.vy = (rng() - 0.5) * 40; }   // traffic drifts
            out.push(e);
        }
    }
    return out;
}

// Spawn a single explicit ship (mission `ship "Model" "Given Name"`). Returns one entity or null.
function spawnShip(spec, uni, around, opts = {}) {
    const rng = opts.rng || Math.random;
    const cls = uni.shipByName && uni.shipByName[spec.model]; if (!cls) return null;
    const govt = spec.government && uni.govtByName && uni.govtByName[spec.government] ? uni.govtByName[spec.government].id : -1;
    const team = teamFor(uni, govt, opts.objectiveHint || spec.objectiveHint);
    const ang = rng() * Math.PI * 2, r = (opts.minR || 900) + rng() * (opts.spread || 700);
    const e = makeEnemy(cls, uni.weapons || {}, around.x + Math.cos(ang) * r, around.y + Math.sin(ang) * r,
        { ...opts, id: opts.id || 1, rnd: rng, govt, team });
    if (spec.name) e.name = spec.name;
    if (team !== "enemy") { e.vx = (rng() - 0.5) * 40; e.vy = (rng() - 0.5) * 40; }
    return e;
}

// Ambient traffic for a system: read its `fleet "Name" <period>` refs and spawn a handful, weighting a
// fleet's chance by 1/period (ES respawns a fleet roughly every `period` frames, so a smaller period
// means denser traffic). `target` (opts.count) caps how many fleets to instantiate this entry.
function spawnAmbient(system, uni, around, opts = {}) {
    const rng = opts.rng || Math.random;
    const refs = (system && system.fleets) || [];
    if (!refs.length || !uni.esFleets) return [];
    const weighted = refs.map((r) => ({ w: r.period > 0 ? 1 / r.period : 1, fleet: r.name })).filter((r) => uni.esFleets[r.fleet]);
    if (!weighted.length) return [];
    const nFleets = opts.count != null ? opts.count : (1 + Math.floor(rng() * 3));   // 1..3 fleets by default
    const cap = opts.maxShips || 18;
    const out = [];
    let seq = 0, guard = 0;
    while (out.length < cap && out.length < cap && guard++ < nFleets * 3 + 12 && seq < nFleets) {
        const choice = pickWeighted(weighted, rng); if (!choice) break;
        seq++;
        const ships = spawnFleet({ fleet: choice.fleet }, uni, around, { ...opts, rng, seq0: out.length, cap: cap - out.length });
        for (const s of ships) out.push(s);
    }
    return out.slice(0, cap);
}

// --- persons: the unique captains ----------------------------------------------------------------
// ES (Engine::SpawnPersons, GameRules): every frame it rolls 1-in-`personSpawnPeriod` (36000, i.e. about
// ten minutes at 60fps) to ATTEMPT a spawn; on success it weight-picks among the persons eligible for the
// current system, with an extra weight of `noPersonSpawnWeight` (1000) meaning "nobody today". A person is
// eligible if it is not destroyed, not already placed, the system has hyperspace links (persons arrive
// through one), and its LocationFilter matches. Default frequency is 100.
//
// We have no per-frame spawn tick -- flightView spawns once, on entry. So the ATTEMPT roll is converted:
// over `dwellFrames` of flying, ES would attempt roughly dwellFrames/36000 times. Default 3600 frames =
// one minute of flight = a 10% chance of an attempt per system entry. That number is the one dial here,
// and it is the only place we depart from ES. Everything after the attempt -- the weights, the 1000, the
// eligibility rules -- is theirs, unchanged.
const PERSON_SPAWN_PERIOD = 36000;
const NO_PERSON_SPAWN_WEIGHT = 1000;

// v2179 -- the real LocationFilter, the same one missions and news use. A person's `system` block is a
// filter over SYSTEMS, so it is matched as one: an attribute set is satisfied by the system's own
// attributes OR by any of its planets'.
function personMatches(person, system, uni) {
    const f = person.filter;
    if (!f || f.isEmpty) return true;
    return matchesSystem(f, system, makeEnv(uni, {}), false);
}

function personEligible(person, system, uni, isDestroyed) {
    if (!person || !(person.frequency > 0) || !person.classes || !person.classes.length) return false;
    if (!system || !(system.links || []).length) return false;      // they enter through a link
    if (isDestroyed && isDestroyed(person.name)) return false;      // dead is dead: ES persons do not respawn
    return personMatches(person, system, uni);
}

// Which person (if any) shows up. Pure: the roll is `rng`, the destroyed set is a callback. Returns null
// far more often than not, which is the point -- a unique captain you meet every jump is not unique.
function pickPerson(system, uni, opts = {}) {
    const rng = opts.rng || Math.random;
    const list = (uni && uni.persons) || [];
    if (!list.length || !system) return null;
    const dwell = opts.dwellFrames != null ? opts.dwellFrames : 3600;
    if (rng() >= Math.min(1, dwell / PERSON_SPAWN_PERIOD)) return null;          // no attempt this entry
    const eligible = list.filter((p) => personEligible(p, system, uni, opts.isDestroyed));
    let sum = 0; for (const p of eligible) sum += p.frequency;
    if (!sum) return null;
    let r = Math.floor(rng() * (sum + NO_PERSON_SPAWN_WEIGHT));
    for (const p of eligible) { r -= p.frequency; if (r < 0) return p; }
    return null;                                                                  // "nobody" won the roll
}

// Build one person's ships as combat entities. The flagship leads; the rest are its wing. Every ship is
// tagged `_person` so a kill can be recorded against the name, and `_unique` so nothing respawns it.
function spawnPerson(person, uni, around, opts = {}) {
    const rng = opts.rng || Math.random;
    const team = teamFor(uni, person.govt, opts.objectiveHint);
    const out = [];
    let seq = opts.seq0 || 0;
    for (const cls of person.classes) {
        const ang = rng() * Math.PI * 2, r = (opts.minR || 1200) + rng() * (opts.spread || 600);
        const e = makeEnemy(cls, uni.weapons || {}, around.x + Math.cos(ang) * r, around.y + Math.sin(ang) * r,
            { ...opts, id: ++seq, rnd: rng, govt: person.govt, team });
        e.name = cls.name;
        e._person = person.name;
        e._unique = true;
        out.push(e);
    }
    return out;
}

// The whole thing, as flightView's spawn hook wants it: roll, and build if somebody turned up.
function spawnPersons(system, uni, around, opts = {}) {
    const p = pickPerson(system, uni, opts);
    return p ? spawnPerson(p, uni, around, opts) : [];
}

export { esGovtStance, teamFor, chooseVariant, resolveFleet, spawnFleet, spawnShip, spawnAmbient, pickWeighted,
    personMatches, personEligible, pickPerson, spawnPerson, spawnPersons, PERSON_SPAWN_PERIOD, NO_PERSON_SPAWN_WEIGHT };
if (typeof module !== "undefined" && module.exports) module.exports = { esGovtStance, teamFor, chooseVariant, resolveFleet, spawnFleet, spawnShip, spawnAmbient, pickWeighted,
    personMatches, personEligible, pickPerson, spawnPerson, spawnPersons, PERSON_SPAWN_PERIOD, NO_PERSON_SPAWN_WEIGHT };
