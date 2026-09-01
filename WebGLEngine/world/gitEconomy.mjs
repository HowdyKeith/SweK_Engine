// WebGLEngine/world/gitEconomy.mjs -- v4299 (Level 13)
//
// *** THE ECONOMY SIMULATOR, LET LOOSE IN THE GIT UNIVERSE. *** Keith: "could the simulator start their own trade
// routes among github planets? Not to be accurate, but just to start their own sea monkey life?"
//
// The bodies are the orrery's (world/orrery.mjs: vendored repositories, sized by bytes, placed by age). Each one
// is a MARKET in ev/esEconomy.js's universe shape: it stocks what it is made of -- source, binaries, data, docs,
// counted from its own file list -- and prices every good off COVERAGE, stock against need, with no price table
// anywhere. The traders are world/traderGraph.mjs's contributors, the people git says crossed between these
// repositories, each a real esEconomy player with credits, a hold and the same buy() and sell() the game's
// pilot uses. A trader docked at a body looks at every other body, picks the best margin per ton it can
// afford, fills its hold, flies there (chasing the body, which is moving), sells, and looks again. Selling
// raises the buyer's stock and lowers its price; buying does the opposite; so the best route moves, and the
// next trader goes somewhere else. That is the whole life: no script, no goal, prices and haulers.
//
// Idea reached via Kalcode/spaceprojectsim (MIT, "Copyright (c) 2026 Kalcode (David Clausen)"): a self-running
// space economy in Rust + Bevy whose markets price off a coverage model with shortage urgency and whose ships
// chase the highest-margin route. It is Rust and an ECS; none of it is vendored. What transfers is the SHAPE:
// agents with holds, markets with stock, prices that are consequences. The trading itself is esEconomy's,
// unchanged, so the game and the universe run one set of rules.
//
// *** NOT ACCURATE, AND SAID SO. *** Bytes are not tons, contributors are not haulers, and nothing here claims
// otherwise. What IS exact: every ton is accounted for (stock + holds + consumed - produced is constant to the
// unit), every credit a trader has is what it started with plus what it sold minus what it bought, the sim is
// deterministic from its seed, and a trader is always on a segment between two bodies that exist.
"use strict";
import { createEconomy, makeFlagship } from "../ev/esEconomy.js";
import { createConditionStore } from "../ev/esConditions.js";
import { positionAt } from "./orreryView.mjs";
import { traders as gitTraders } from "./traderGraph.mjs";

/** Four goods, by what a file is. Everything in a repo is one of these. */
export const GOODS = Object.freeze(["source", "binaries", "data", "docs"]);
const SOURCE = /\.(js|mjs|ts|tsx|jsx|c|cc|cpp|h|hpp|rs|go|py|java|kt|swift|m|mm|cs|glsl|wgsl|frag|vert|hlsl|cu|sh|bat|rb|php|lua|zig)$/i;
const BINARY = /\.(wasm|so|dll|dylib|a|o|bin|exe|apk|jar|class|node|wav|mp3|ogg|png|jpg|jpeg|gif|webp|ktx|ktx2|basis|glb|gltf|ttf|otf|woff|woff2|zip|gz|7z)$/i;
const DATA = /\.(json|jsonc|geojson|ndjson|csv|tsv|xml|yaml|yml|toml|lock|map|svg|sqlite|db|dat)$/i;
export function goodOf(path) { const p = String(path || ""); if (SOURCE.test(p)) return "source"; if (BINARY.test(p)) return "binaries"; if (DATA.test(p)) return "data"; return "docs"; }

/** Base prices per ton, the band esEconomy falls back to; pricing here never uses them directly. */
export const BASE = Object.freeze({ source: 100, binaries: 160, data: 80, docs: 60 });
/** A ton is this many bytes: a 1 MB body holds a few hundred tons, a 4 KB one a handful. */
export const BYTES_PER_TON = 4096;
/** Price = base * clamp(NEED / STOCK, floor, ceiling): shortage raises it, glut lowers it. The simulator's coverage idea. */
export const PRICE_FLOOR = 0.4, PRICE_CEIL = 3.0;

/** A seeded LCG, so a run is reproducible from its seed. */
export function rng(seed = 1) { let s = seed >>> 0 || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }

/** Markets from an orrery system: one per body, stocked from its own files. */
export function marketsOf(system) {
    const bodies = system.bodies || [];
    const totals = { source: 0, binaries: 0, data: 0, docs: 0 };
    const markets = bodies.map((b, i) => {
        const stock = { source: 0, binaries: 0, data: 0, docs: 0 };
        for (const f of (b.files || [])) stock[goodOf(f.path)] += Math.max(1, Math.round((f.bytes || 0) / BYTES_PER_TON));
        if (!(b.files || []).length) stock.docs += Math.max(1, Math.round((b.bytes || 0) / BYTES_PER_TON));
        for (const g of GOODS) totals[g] += stock[g];
        return { id: i + 1, name: b.name, body: b, stock, need: null, trade: {} };
    });
    // need = an even share of everything: a body wants what the universe has, spread evenly. A body made of
    // source has a glut of it (cheap to buy there) and none of the binaries it needs (dear to sell there).
    for (const m of markets) { m.need = {}; for (const g of GOODS) m.need[g] = Math.max(1, Math.round(totals[g] / markets.length)); }
    for (const m of markets) reprice(m);
    return markets;
}
/** The coverage price, recomputed whenever stock moves. */
export function reprice(m) { for (const g of GOODS) { const cov = Math.max(1, m.stock[g]) / m.need[g]; m.trade[g] = Math.round(BASE[g] * Math.max(PRICE_FLOOR, Math.min(PRICE_CEIL, 1 / cov))); } return m.trade; }

/**
 * Build the sim. `system` from buildOrrery; `opts.seed`; `opts.traders` overrides the crew (default: git's
 * traders, and a hauler per body so a small universe still has life). Speed is in orrery units per day.
 */
export function makeGitEconomy(system, { seed = 7, traders = null, speed = 2.5, holdTons = 40, credits = 5000, produce = true } = {}) {
    const rnd = rng(seed);
    const markets = marketsOf(system);
    if (!markets.length) throw new Error("gitEconomy: no bodies to trade between");
    const uni = { commodities: {}, systems: markets, systemById: {}, spobs: {}, ships: [], outfits: {}, outfitByName: {}, shipByName: {}, shipyards: {}, outfitters: {} };
    for (const g of GOODS) uni.commodities[g] = { id: g, name: g, low: BASE[g] * PRICE_FLOOR, high: BASE[g] * PRICE_CEIL, basePrice: BASE[g] };
    for (const m of markets) uni.systemById[m.id] = m;
    const hull = { name: "Hauler", hull: { mass: 100, drag: 2, cargoSpace: holdTons, outfitSpace: 0 }, defaultOutfits: [], cost: 0 };
    const crew = traders || [...gitTraders().map((t) => ({ name: t.name || t.id, from: t.repos })), ...markets.map((m) => ({ name: "hauler of " + m.name, from: [] }))];
    const ships = crew.map((c, i) => {
        const player = { conditions: {}, credits, cargo: {}, ship: makeFlagship(hull), fleet: [] };
        const store = createConditionStore(player, uni);
        const econ = createEconomy(uni, store, player);
        const at = 1 + Math.floor(rnd() * markets.length);
        return { id: i, name: c.name, player, store, econ, at, to: null, from: null, progress: 0, x: 0, y: 0, cargoGood: null, log: [], trips: 0, spent: 0, earned: 0, idle: 0 };
    });
    const ledger = { produced: { source: 0, binaries: 0, data: 0, docs: 0 }, consumed: { source: 0, binaries: 0, data: 0, docs: 0 } };
    let t = 0, tick = 0;
    const events = [];
    const posOf = (m, td) => { const p = positionAt(m.body, td); return [p.x, p.y]; };
    const initialTons = GOODS.reduce((a, g) => a + markets.reduce((s, m) => s + m.stock[g], 0), 0);

    /**
     * The best route from a market: the good and destination with the highest margin per ton. The 5% preference
     * noise is a PURE HASH of (tick, ship, market, good), not a draw from the seeded stream: an observer calling
     * bestRoute() to check a choice must not change the choice, and a gate did exactly that at Level 13.
     */
    const hashNoise = (a, b, c, d) => { let h = (a * 374761393 + b * 668265263 + c * 2246822519 + d * 3266489917 + seed) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) / 4294967296; };
    function bestRoute(ship) {
        const here = uni.systemById[ship.at]; let best = null;
        for (const m of markets) { if (m.id === here.id) continue;
            for (let gi = 0; gi < GOODS.length; gi++) { const g = GOODS[gi]; const buyP = here.trade[g], sellP = m.trade[g], margin = sellP - buyP; if (margin <= 0 || here.stock[g] <= 0) continue;
                const score = margin * (1 + 0.05 * hashNoise(tick, ship.id, m.id, gi));
                if (!best || score > best.score) best = { good: g, to: m.id, margin, score, buyP, sellP }; } }
        return best;
    }
    function dock(ship, atId) {
        const m = uni.systemById[atId];
        for (const g of GOODS) { const have = ship.player.cargo[g] || 0; if (!have) continue;
            const r = ship.econ.sell(g, have, m.id); if (r.ok) { m.stock[g] += r.tons; ship.earned += r.earned; ship.log.push({ tick, sold: r.tons, good: g, at: m.name, price: r.price }); events.push(`${ship.name} sold ${r.tons} t of ${g} at ${m.name} for ${r.earned}`); } }
        reprice(m); ship.at = atId; ship.to = null; ship.trips++;
    }
    function depart(ship) {
        const route = bestRoute(ship); const here = uni.systemById[ship.at];
        if (!route) { ship.idle++; if (ship.idle > 3 && markets.length > 1) { let to; do { to = 1 + Math.floor(rnd() * markets.length); } while (to === ship.at); ship.from = ship.at; ship.to = to; ship.progress = 0; ship.idle = 0; events.push(`${ship.name} wanders from ${here.name} to ${uni.systemById[to].name}`); } return; }
        const want = Math.min(holdTons, here.stock[route.good]);
        const r = ship.econ.buy(route.good, want, here.id);
        if (!r.ok) { ship.idle++; return; }
        here.stock[route.good] -= r.tons; reprice(here); ship.spent += r.spent; ship.cargoGood = route.good;
        ship.from = ship.at; ship.to = route.to; ship.progress = 0; ship.idle = 0;
        ship.log.push({ tick, bought: r.tons, good: route.good, at: here.name, price: r.price, to: uni.systemById[route.to].name });
        events.push(`${ship.name} bought ${r.tons} t of ${route.good} at ${here.name} for ${r.spent}, bound for ${uni.systemById[route.to].name} (margin ${route.margin}/t)`);
    }
    /** One step of `dtDays`. Markets drift a little toward what they make (produce) and away from what they need (consume). */
    function step(dtDays = 0.25) {
        t += dtDays; tick++;
        if (produce && tick % 8 === 0) for (const m of markets) for (const g of GOODS) {
            const made = m.stock[g] > m.need[g] ? 1 : 0, used = m.stock[g] > 0 && m.stock[g] < m.need[g] ? 1 : 0;
            m.stock[g] += made - used; ledger.produced[g] += made; ledger.consumed[g] += used; if (made || used) reprice(m); }
        for (const ship of ships) {
            if (ship.to == null) { depart(ship); const p = posOf(uni.systemById[ship.at], t); ship.x = p[0]; ship.y = p[1]; continue; }
            const a = posOf(uni.systemById[ship.from], t), b = posOf(uni.systemById[ship.to], t);
            const dist = Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]));
            ship.progress = Math.min(1, ship.progress + speed * dtDays / dist);
            ship.x = a[0] + (b[0] - a[0]) * ship.progress; ship.y = a[1] + (b[1] - a[1]) * ship.progress;
            if (ship.progress >= 1) dock(ship, ship.to);
        }
        return { t, tick };
    }
    /** Every ton, everywhere: stock + holds + consumed - produced equals the starting stock, always. */
    function accounting() {
        const stock = {}, holds = {}; let total = 0;
        for (const g of GOODS) { stock[g] = markets.reduce((s, m) => s + m.stock[g], 0); holds[g] = ships.reduce((s, sh) => s + (sh.player.cargo[g] || 0), 0); total += stock[g] + holds[g] + ledger.consumed[g] - ledger.produced[g]; }
        const creditsOk = ships.every((s) => s.store.get("credits") === credits + s.earned - s.spent);
        return { stock, holds, ledger, total, initialTons, tonsConserved: total === initialTons, creditsOk };
    }
    /** Instance records for the GPU-driven scene: one small quad per ship at its position, in the orrery's plane. */
    function records(radius = 0.12) { const r = new Float32Array(ships.length * 4); ships.forEach((s, i) => r.set([s.x, s.y, 0.05, radius], i * 4)); return r; }
    return { markets, ships, uni, step, accounting, records, events, bestRoute, get t() { return t; }, get tick() { return tick; }, names: ships.map((s) => s.name),
             describe(i) { const s = ships[i]; if (!s) return ""; const m = uni.systemById[s.at], d = s.to ? uni.systemById[s.to] : null; const cargo = Object.entries(s.player.cargo).map(([g, n]) => `${n} t ${g}`).join(", ") || "empty";
                 return d ? `${s.name}: ${cargo}, ${m.name} -> ${d.name}, ${(s.progress * 100).toFixed(0)}%, ${s.store.get("credits")} cr` : `${s.name}: docked at ${m.name}, ${cargo}, ${s.store.get("credits")} cr`; } };
}
