// WebGLEngine/world/racePolicies.mjs -- v4317 (Level 17)
//
// LEVEL 17: RACES THAT ACT, NOT ONLY LOOK. Level 15 gave every owner a race and every race an architecture; a race
// was a costume. Here each race gets an ECONOMY OF ITS OWN -- a route policy (which leg a docked ship takes, through
// the same candidates() the learner sees) and TRAITS the economy honours at the dock: a discount an undercutter
// gives, a hold a hoarder keeps, a raid a raider makes. The fleet id that already rides in every record is the
// switch; nothing new travels to the GPU, and the sim stays a deterministic function of its seed and journal.
//
// The measurement is tools/ship/racesAct-selfcheck.mjs: the ledger with each race switched OFF (its ships greedy),
// against all races on. A race whose absence changes nothing in a hundred days is a costume, and the gate says so
// by name. Every trait keeps the books closed: a discount is a smaller sale (the treasury keeps the difference),
// a hold is a sale that does not happen, a raid moves tons from a port to a hold.
"use strict";

import { GOODS } from "./gitEconomy.mjs";

/** Greedy: the largest margin, as bestRoute() has always done (without its 5% preference noise -- a policy is pure). */
export const greedy = () => (cs) => { let k = -1, best = 0; cs.forEach((c, i) => { if (c.margin > best) { best = c.margin; k = i; } }); return k < 0 ? null : k; };
/** The hoarder: buys the SCARCEST good here (lowest stock against need at the destination), and holds it until it sells at 1.6x. */
export const hoarder = () => (cs) => { let k = -1, best = -Infinity; cs.forEach((c, i) => { const scarcity = c.needThere / Math.max(1, c.stockThere); const s = scarcity * (1 + c.margin / 200); if (s > best) { best = s; k = i; } }); return k < 0 ? null : k; };
/** The scholar: carries docs only, the best docs margin; nothing else is worth its hold. */
export const docsOnly = () => (cs) => { let k = -1, best = 0; cs.forEach((c, i) => { if (c.good === "docs" && c.margin > best) { best = c.margin; k = i; } }); return k < 0 ? null : k; };
/** The undercutter: greedy on the route, and sells at a discount (a trait the dock honours), so it always finds a buyer and earns less per ton. */
export const undercutter = greedy;
/** The raider: goes where the STOCK is -- the best-stocked destination -- and takes a tenth of the port's best good on arrival, paying nothing. */
export const raider = () => (cs) => { let k = -1, best = -Infinity; cs.forEach((c, i) => { const s = c.stockThere * 10 + c.margin; if (s > best) { best = s; k = i; } }); return k < 0 ? null : k; };
/** The nearest-first hauler: the shortest leg with any margin at all -- many trips, small ones. */
export const nearest = () => (cs) => { let k = -1, best = Infinity; cs.forEach((c, i) => { if (c.margin > 0 && c.dist < best) { best = c.dist; k = i; } }); return k < 0 ? null : k; };

/**
 * The races' economies, by race name (render/fleets.mjs RACES). `policy(economy)` builds the route policy;
 * `traits` are what the dock honours: sellDiscount (0..1 of the price the ship accepts), holdUntil (a sale
 * happens only when the sell price is this many times the buy price), raid (a tenth of a docked hold, once per
 * arrival). A race not named here is greedy with no traits -- the Level 14 hauler.
 */
export const RACE_ECONOMIES = Object.freeze({
    Union: Object.freeze({ policy: greedy, traits: {}, note: "the Level 14 hauler: the largest margin, no traits -- the control" }),
    Wedge: Object.freeze({ policy: nearest, traits: {}, note: "nearest first: short legs, many trips" }),
    Pixel: Object.freeze({ policy: greedy, traits: { sellDiscount: 0.85 }, note: "the undercutter: always finds a buyer, at 85% of the price" }),
    Loft: Object.freeze({ policy: hoarder, traits: { holdUntil: 1.6 }, note: "the hoarder: buys what is scarce and holds it until 1.6x" }),
    Voxel: Object.freeze({ policy: docsOnly, traits: {}, note: "the scholar: docs only" }),
    Holo: Object.freeze({ policy: greedy, traits: {}, note: "greedy -- a look, not yet a behaviour" }),
    Krbn: Object.freeze({ policy: raider, traits: { raid: 0.1 }, note: "the raider: goes where the stock is, takes a tenth of the port's best good on arrival" }),
    Glyph: Object.freeze({ policy: nearest, traits: { sellDiscount: 0.95 }, note: "nearest first, a small discount" }),
    Cells: Object.freeze({ policy: greedy, traits: {}, note: "greedy -- a look, not yet a behaviour" }),
    Chaos: Object.freeze({ policy: hoarder, traits: { holdUntil: 1.3 }, note: "a hoarder with less patience" }),
});
/** The races that DO something different from the control (a policy other than greedy, or a trait). */
export function actingRaces() { return Object.entries(RACE_ECONOMIES).filter(([n, r]) => r.policy !== greedy || Object.keys(r.traits).length).map(([n]) => n); }

/**
 * Crew entries for an economy with the races acting: `names` and `fleetOf` (from render/fleets.mjs fleetsForNames)
 * and the race list; `off` is a set of race names switched back to greedy (the gate's control). The policies that
 * need the economy (the raider looks at who is docked where) are bound after the economy exists, through the
 * `bindTo` hook the entry carries -- gitEconomy calls it if present.
 */
export function crewForRaces(names, fleetOf, races, { off = new Set() } = {}) {
    return names.map((name, i) => {
        const race = races[fleetOf[i]] ? races[fleetOf[i]].name : null;
        // a race switched OFF is the pure greedy policy with no traits -- the control -- and not the built-in bestRoute,
        // whose 5% preference noise would make even a costume's absence "change something"
        const eco = (race && RACE_ECONOMIES[race] && !off.has(race)) ? RACE_ECONOMIES[race] : { policy: greedy, traits: {} };
        const entry = { name, race, traits: { ...eco.traits }, policy: null };
        entry.bindTo = (economy) => { entry.policy = eco.policy(economy); return entry.policy; };
        return entry;
    });
}
