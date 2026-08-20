// WebGLEngine/ev/esLocation.js — Endless Sky's LocationFilter, once.
//
// There were three of these in the adapter, each a different subset, and the mission one was the worst:
// it silently ignored 773 filter keys across the base game, of which 567 were `not` blocks. A mission
// whose source is "any Republic world, NOT Earth" was being offered on Earth. Ignoring a `not` does not
// narrow a filter, it inverts it.
//
// The other two -- the person and news filters in esData -- honestly DROPPED anything they could not
// evaluate. That was the right instinct and the wrong cost: it threw away content. With a real filter,
// nothing is dropped and nothing is guessed.
//
// From endless-sky/source/LocationFilter.cpp at master. The rules that are easy to get wrong:
//
//   * `attributes` is a LIST OF SETS, not a set. Each line contributes one set; the sets AND together and
//     the names within a set OR (SetsIntersect). `attributes a b` means "a OR b", and two `attributes`
//     lines mean "both". The adapter's persons and news filters required ALL of them -- backwards.
//   * `not` and `neighbor` come in two shapes: a bare line introducing a nested block, or an inline
//     prefix (`not attributes "human"`). Both are one filter.
//   * A `not` filter fails the match if it MATCHES. A `neighbor` filter must match at least one system
//     LINKED to the one under test.
//   * Matching a PLANET checks attributes against the planet's own. Matching a SYSTEM checks them against
//     the system's attributes OR any of its planets'. A planet match delegates to the system match and
//     tells it not to re-check government, attributes and `not` -- they were checked against the planet.
//   * `near <system> [<min>] <max>` measures from a named system; `distance [<min>] <max>` from the
//     player's current system. Unreachable or too far is a failure, not a large number: ES's Distance()
//     returns -1 and then -1 < min.
//   * Defaults, from LocationFilter.h: a bare `near <sys>` means max 1 jump. `distance` has no default max.

"use strict";

const EMPTY = { planets: [], systems: [], governments: [], attributes: [], categories: [], near: null, distance: null, not: [], neighbor: [], visitedSystem: false, visitedPlanet: false, isEmpty: true };

// ES reads a key's values from the rest of its line AND from its children.
function valuesOf(node, from) {
    const out = node.tokens.slice(from);
    for (const g of (node.children || [])) for (const t of g.tokens) out.push(t);
    return out;
}

function emptyFilter() {
    return { planets: [], systems: [], governments: [], attributes: [], categories: [], near: null, distance: null, not: [], neighbor: [], visitedSystem: false, visitedPlanet: false, isEmpty: true };
}

function markNonEmpty(f) {
    f.isEmpty = !f.planets.length && !f.systems.length && !f.governments.length && !f.attributes.length
        && !f.categories.length && !f.near && !f.distance && !f.not.length && !f.neighbor.length
        && !f.visitedSystem && !f.visitedPlanet;
    return f;
}

// One line of a filter. `at` is 1 for a plain line, 2 when the line is prefixed with `not`/`neighbor`.
function loadChild(f, node, at) {
    const key = node.tokens[at - 1];
    if (key === "planet") f.planets.push(...valuesOf(node, at));
    else if (key === "system") f.systems.push(...valuesOf(node, at));
    else if (key === "government") f.governments.push(...valuesOf(node, at));
    else if (key === "category") f.categories.push(...valuesOf(node, at));
    else if (key === "attributes") {
        const set = valuesOf(node, at);
        if (set.length) f.attributes.push(set);   // ES: an empty attribute set is probably a typo
    } else if (key === "near" && node.tokens.length > at) {
        const n = node.tokens.length - at;
        f.near = { system: node.tokens[at], min: 0, max: 1 };   // LocationFilter.h: centerMaxDistance = 1
        if (n === 2) f.near.max = +node.tokens[at + 1] || 0;
        else if (n >= 3) { f.near.min = +node.tokens[at + 1] || 0; f.near.max = +node.tokens[at + 2] || 0; }
    } else if (key === "distance" && node.tokens.length > at) {
        const n = node.tokens.length - at;
        f.distance = { min: 0, max: +node.tokens[at] || 0 };
        if (n >= 2) { f.distance.min = +node.tokens[at] || 0; f.distance.max = +node.tokens[at + 1] || 0; }
    } else if (key === "visited") {
        if (node.tokens[at] === "planet") f.planetIsVisited = f.visitedPlanet = true;
        else f.visitedSystem = true;
    }
    // `outfits` and anything a plugin invents: not evaluated, and not silently treated as a match either
    // -- an unknown key adds no constraint, which is what ES does with it too (it prints a trace).
    return f;
}

function buildFilter(node) {
    const f = emptyFilter();
    if (!node) return f;
    for (const child of (node.children || [])) {
        const key = child.tokens[0];
        if (key === "not" || key === "neighbor") {
            const sub = key === "not" ? f.not : f.neighbor;
            // `not` alone on its line introduces a nested block; otherwise it prefixes one ordinary line.
            if (child.tokens.length === 1) sub.push(buildFilter(child));
            else sub.push(markNonEmpty(loadChild(emptyFilter(), child, 2)));
        } else loadChild(f, child, 1);
    }
    return markNonEmpty(f);
}

// A bare `source "Earth"` / `destination "Sol"` -- a name, not a filter.
function bareName(node) {
    return (node && node.tokens.length >= 2 && (!node.children || !node.children.length)) ? node.tokens[1] : null;
}

// --- matching --------------------------------------------------------------------------------------
// `env` supplies what only the caller knows:
//   systemById, spobs, govts        -- the universe
//   systemByName(name), planetByName(name)
//   jumpDist(fromId, toId)          -- hops, Infinity when unreachable
//   origin                          -- the player's system id, for `distance`
//   visitedSystems / visitedPlanets -- Sets of ids, optional
const lower = (x) => String(x).toLowerCase();
const inNames = (names, name) => names.some((n) => lower(n) === lower(name));

// ES's SetsIntersect: at least one name in the set is present.
function setIntersects(set, have) {
    const h = (have || []).map(lower);
    return set.some((a) => h.includes(lower(a)));
}

function jumps(env, fromId, toId) {
    if (fromId == null || toId == null) return Infinity;
    const d = env.jumpDist ? env.jumpDist(fromId, toId) : Infinity;
    return Number.isFinite(d) ? d : Infinity;
}

// ES: Distance() returns -1 when unreachable or beyond `max`, and the caller then tests `< min`. So a
// system that is too far fails whatever the minimum is -- including a minimum of zero.
function withinRange(env, centerId, systemId, min, max) {
    const d = jumps(env, centerId, systemId);
    if (!Number.isFinite(d) || d > max) return false;
    return d >= min;
}

function systemAttributes(env, system) {
    const out = [...(system.attributes || [])];
    for (const sp of (system.spobs || [])) {
        const full = env.spobs ? env.spobs[sp.id] : sp;
        if (full && full.attributes) out.push(...full.attributes);
    }
    return out;
}

function matchesSystem(f, system, env, didPlanet) {
    if (!f || !system) return false;
    if (f.categories.length) return false;                            // a ship filter never matches a place
    if (f.systems.length && !inNames(f.systems, system.name)) return false;
    if (f.visitedSystem && env.visitedSystems && !env.visitedSystems.has(system.id)) return false;

    if (!didPlanet) {
        if (f.governments.length) {
            const g = env.govts && env.govts[system.govt];
            if (!g || !inNames(f.governments, g.name)) return false;
        }
        // A system matches an attribute set if the SYSTEM or any of its planets carries one of the names.
        for (const set of f.attributes) if (!setIntersects(set, systemAttributes(env, system))) return false;
        for (const n of f.not) if (matchesSystem(n, system, env, false)) return false;
    }

    // Every `neighbor` filter must match at least one system linked to this one.
    for (const nb of f.neighbor) {
        let hit = false;
        for (const id of (system.links || [])) {
            const s = env.systemById[id];
            if (s && matchesSystem(nb, s, env, false)) { hit = true; break; }
        }
        if (!hit) return false;
    }

    if (f.near) {
        const c = env.systemByName(f.near.system);
        if (!c || !withinRange(env, c.id, system.id, f.near.min, f.near.max)) return false;
    }
    if (f.distance) {
        if (env.origin == null || !withinRange(env, env.origin, system.id, f.distance.min, f.distance.max)) return false;
    }
    return true;
}

function matchesPlanet(f, planet, env) {
    if (!f || !planet) return false;
    if (f.categories.length) return false;
    if (f.visitedPlanet && env.visitedPlanets && !env.visitedPlanets.has(planet.id)) return false;

    if (f.governments.length) {
        const g = env.govts && env.govts[planet.govt];
        if (!g || !inNames(f.governments, g.name)) return false;
    }
    if (f.planets.length && !inNames(f.planets, planet.name)) return false;
    // Against a planet, an attribute set is checked against the PLANET's attributes only.
    for (const set of f.attributes) if (!setIntersects(set, planet.attributes)) return false;
    for (const n of f.not) if (matchesPlanet(n, planet, env)) return false;

    const sys = planet._systemId != null ? env.systemById[planet._systemId] : null;
    if (!sys) return false;
    return matchesSystem(f, sys, env, true);   // government, attributes and `not` were checked above
}

// An empty filter matches everything, which is what a mission with no `source` block means.
function matches(f, planet, env) { return !f || f.isEmpty ? true : matchesPlanet(f, planet, env); }

// --- the environment a filter needs -----------------------------------------------------------------
// Name lookups and a jump-distance BFS, memoized on the universe so three callers do not build three of
// them. `origin` is the only per-call part: it is what `distance` measures from.
const ENV_CACHE = new WeakMap();
function makeEnv(uni, opts = {}) {
    let base = ENV_CACHE.get(uni);
    if (!base) {
        const systemByName = new Map(), planetByName = new Map();
        for (const s of uni.systems || []) systemByName.set(s.name, s);
        for (const id in (uni.spobs || {})) planetByName.set(uni.spobs[id].name, uni.spobs[id]);
        const dist = new Map();   // "from:to" -> hops
        const jumpDist = (from, to) => {
            if (from === to) return 0;
            const key = from + ":" + to;
            if (dist.has(key)) return dist.get(key);
            const seen = new Set([from]);
            let frontier = [from], d = 0;
            while (frontier.length && d < 60) {
                d++;
                const next = [];
                for (const id of frontier) {
                    const s = uni.systemById[id];
                    if (!s) continue;
                    for (const l of (s.links || [])) {
                        if (seen.has(l)) continue;
                        dist.set(from + ":" + l, d);
                        if (l === to) return d;
                        seen.add(l); next.push(l);
                    }
                }
                frontier = next;
            }
            dist.set(key, Infinity);
            return Infinity;
        };
        base = { systemById: uni.systemById, spobs: uni.spobs, govts: uni.govts,
            systemByName: (n) => systemByName.get(n), planetByName: (n) => planetByName.get(n), jumpDist };
        ENV_CACHE.set(uni, base);
    }
    return { ...base, origin: opts.origin != null ? opts.origin : null,
        visitedSystems: opts.visitedSystems || null, visitedPlanets: opts.visitedPlanets || null };
}

export { buildFilter, bareName, matchesPlanet, matchesSystem, matches, setIntersects, emptyFilter, makeEnv, EMPTY };
if (typeof module !== "undefined" && module.exports)
    module.exports = { buildFilter, bareName, matchesPlanet, matchesSystem, matches, setIntersects, emptyFilter, makeEnv, EMPTY };
