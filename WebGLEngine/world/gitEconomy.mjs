// WebGLEngine/world/gitEconomy.mjs -- v4299 (Level 13), loops closed at v4300
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
// ---- v4300 -- THE LOOPS CLOSE ----------------------------------------------------------------------------
//
// Level 13 said what it was not: infinite market credit, nothing built, nobody bankrupt, the richest hauler only
// richer. Now: a market has a TREASURY and buys only what it can pay for; RECIPES turn goods into other goods
// at every market that has the inputs (source + data -> binaries; source -> docs; binaries + docs -> data), so
// stock is made and used, not only moved; every ship pays UPKEEP per day into a sink; a ship that cannot pay
// and holds nothing is BANKRUPT and leaves the sky. And the book still balances: tons as before (stock + holds
// + consumed - produced is the starting stock), and now credits too -- traders + treasuries + the upkeep sink
// - what production MINTED is the starting total, to the credit.
//
// *** THE FIRST RUN WITH THE SINK AND NO SOURCE DEFLATED THE UNIVERSE: *** 200 days at 40 credits a day of
// upkeep and every one of 14 treasuries stood at a few credits, because traders buy low and sell high, so
// money flows from markets to haulers and out through upkeep, and nothing puts any back. So a recipe run
// MINTS the base value of what it made into the market's treasury -- value added is the money source -- and
// UPKEEP IS PAID TO THE MARKET THE SHIP IS AT (fuel and crew are bought somewhere), so it circulates instead of
// vanishing: with upkeep as a pure sink the second run still ended with 14 empty treasuries and 430,000 credits
// in the holds of 22 haulers. Money now only enters (minting) and moves; the total is initial + minted.
//
// ---- AND THE CORE IS GENERIC ----------------------------------------------------------------------------
//
// makeEconomy(world) takes ANY set of bodies with a position function; makeGitEconomy() is the orrery's
// specialisation and world/universeEconomy.mjs the Endless Sky one. A body that moves (an orbiting repository)
// is chased tick by tick; a body that stands still (a star system) is reached at a time computed at departure,
// which is what lets the flight be integrated on the GPU (render/gpuHaul.mjs) with no state read back.
//
// Idea reached via Kalcode/spaceprojectsim (MIT, "Copyright (c) 2026 Kalcode (David Clausen)"): a self-running
// space economy in Rust + Bevy whose markets price off a coverage model with shortage urgency, whose ships
// chase the highest-margin route, and whose facilities run recipes, degrade and go broke. It is Rust and an
// ECS; none of it is vendored. What transfers is the SHAPE. The trading itself is esEconomy's, unchanged.
//
// *** NOT ACCURATE, AND SAID SO. *** Bytes are not tons, contributors are not haulers, and nothing here claims
// otherwise. What IS exact is the accounting, the determinism, and that a trader is always on a segment
// between two bodies that exist.
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
/**
 * v4300 -- what a market MAKES from what it has, once per production tick when the inputs are there and the
 * output is not already a glut. Tons in never equal tons out (a recipe is not a conservation law; the ledger
 * is), which is why consumed and produced are booked separately.
 */
export const RECIPES = Object.freeze([
    Object.freeze({ name: "build", in: Object.freeze({ source: 2, data: 1 }), out: Object.freeze({ binaries: 1 }) }),
    Object.freeze({ name: "document", in: Object.freeze({ source: 1 }), out: Object.freeze({ docs: 1 }) }),
    Object.freeze({ name: "measure", in: Object.freeze({ binaries: 1, docs: 1 }), out: Object.freeze({ data: 1 }) }),
]);
/** How often production runs, in ticks, and the defaults a world can override. */
export const DEFAULTS = Object.freeze({ speed: 2.5, holdTons: 40, credits: 5000, treasury: 30000, upkeep: 40, productionEvery: 8 });

/** A seeded LCG, so a run is reproducible from its seed. */
export function rng(seed = 1) { let s = seed >>> 0 || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }

/** Stock from a body's file list: tons of each good, at least one ton of something. */
export function stockOfFiles(files, bytes = 0) {
    const stock = { source: 0, binaries: 0, data: 0, docs: 0 };
    for (const f of (files || [])) stock[goodOf(f.path)] += Math.max(1, Math.round((f.bytes || 0) / BYTES_PER_TON));
    if (!(files || []).length) stock.docs += Math.max(1, Math.round((bytes || 0) / BYTES_PER_TON));
    return stock;
}
/** Markets from bodies that each carry a `stock`; need is an even share of everything. */
export function marketsOfStocks(named, treasury = DEFAULTS.treasury) {
    const totals = { source: 0, binaries: 0, data: 0, docs: 0 };
    const markets = named.map((b, i) => { for (const g of GOODS) totals[g] += b.stock[g]; return { id: i + 1, name: b.name, body: b.body || null, stock: { ...b.stock }, need: null, trade: {}, credits: treasury, made: 0 }; });
    for (const m of markets) { m.need = {}; for (const g of GOODS) m.need[g] = Math.max(1, Math.round(totals[g] / markets.length)); }
    for (const m of markets) reprice(m);
    return markets;
}
/** Markets from an orrery system: one per body, stocked from its own files. */
export function marketsOf(system, treasury) { return marketsOfStocks((system.bodies || []).map((b) => ({ name: b.name, body: b, stock: stockOfFiles(b.files, b.bytes) })), treasury); }
/** The coverage price, recomputed whenever stock moves. */
export function reprice(m) { for (const g of GOODS) { const cov = Math.max(1, m.stock[g]) / m.need[g]; m.trade[g] = Math.round(BASE[g] * Math.max(PRICE_FLOOR, Math.min(PRICE_CEIL, 1 / cov))); } return m.trade; }

/**
 * The generic sim. `world` = { markets (from marketsOfStocks), crew: [{ name }], positionOf(market, tDays) ->
 * [x, y], moving: bool }. A moving world is chased per tick; a still one is reached at a time fixed at departure.
 */
export function makeEconomy(world, opts = {}) {
    const o = { ...DEFAULTS, ...opts }, seed = o.seed == null ? 7 : o.seed;
    const rnd = rng(seed);
    const markets = world.markets;
    if (!markets.length) throw new Error("economy: no bodies to trade between");
    const uni = { commodities: {}, systems: markets, systemById: {}, spobs: {}, ships: [], outfits: {}, outfitByName: {}, shipByName: {}, shipyards: {}, outfitters: {} };
    for (const g of GOODS) uni.commodities[g] = { id: g, name: g, low: BASE[g] * PRICE_FLOOR, high: BASE[g] * PRICE_CEIL, basePrice: BASE[g] };
    for (const m of markets) uni.systemById[m.id] = m;
    const hull = { name: "Hauler", hull: { mass: 100, drag: 2, cargoSpace: o.holdTons, outfitSpace: 0 }, defaultOutfits: [], cost: 0 };
    const ships = world.crew.map((c, i) => {
        const player = { conditions: {}, credits: o.credits, cargo: {}, ship: makeFlagship(hull), fleet: [] };
        const store = createConditionStore(player, uni);
        const econ = createEconomy(uni, store, player);
        const at = 1 + Math.floor(rnd() * markets.length);
        return { id: i, name: c.name, player, store, econ, at, to: null, from: null, progress: 0, x: 0, y: 0, cargoGood: null, log: [], trips: 0, spent: 0, earned: 0, upkeepPaid: 0, idle: 0, bankrupt: false, t0: 0, arriveT: 0, fromPos: [0, 0], toPos: [0, 0] };
    });
    const ledger = { produced: { source: 0, binaries: 0, data: 0, docs: 0 }, consumed: { source: 0, binaries: 0, data: 0, docs: 0 }, upkeep: 0, minted: 0, recipesRun: 0, bankruptcies: 0 };
    let t = 0, tick = 0, dayPaid = 0, flightDirty = true;
    const events = [];
    const posOf = (m, td) => world.positionOf(m, td);
    const initialTons = GOODS.reduce((a, g) => a + markets.reduce((s, m) => s + m.stock[g], 0), 0);
    const initialCredits = ships.length * o.credits + markets.reduce((s, m) => s + m.credits, 0);

    /**
     * The best route from a market: the good and destination with the highest margin per ton, among what the
     * destination can PAY for. The 5% preference noise is a PURE HASH of (tick, ship, market, good), not a draw
     * from the seeded stream: an observer calling bestRoute() to check a choice must not change the choice.
     */
    const hashNoise = (a, b, c, d) => { let h = (a * 374761393 + b * 668265263 + c * 2246822519 + d * 3266489917 + seed) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) / 4294967296; };
    function bestRoute(ship) {
        const here = uni.systemById[ship.at]; let best = null;
        for (const m of markets) { if (m.id === here.id) continue;
            for (let gi = 0; gi < GOODS.length; gi++) { const g = GOODS[gi]; const buyP = here.trade[g], sellP = m.trade[g], margin = sellP - buyP; if (margin <= 0 || here.stock[g] <= 0) continue;
                if (m.credits < sellP) continue;                     // a market that cannot pay is not a destination
                const score = margin * (1 + 0.05 * hashNoise(tick, ship.id, m.id, gi));
                if (!best || score > best.score) best = { good: g, to: m.id, margin, score, buyP, sellP }; } }
        return best;
    }
    function dock(ship, atId) {
        const m = uni.systemById[atId];
        for (const g of GOODS) { const have = ship.player.cargo[g] || 0; if (!have) continue;
            // the treasury caps the sale: a market buys what it can pay for, and the rest stays in the hold
            const canPay = Math.floor(m.credits / Math.max(1, m.trade[g])); const n = Math.min(have, canPay); if (n <= 0) { events.push(`${m.name} cannot pay for ${ship.name}'s ${g}`); continue; }
            const r = ship.econ.sell(g, n, m.id); if (r.ok) { m.stock[g] += r.tons; m.credits -= r.earned; ship.earned += r.earned; ship.log.push({ tick, sold: r.tons, good: g, at: m.name, price: r.price }); events.push(`${ship.name} sold ${r.tons} t of ${g} at ${m.name} for ${r.earned}`); } }
        reprice(m); ship.at = atId; ship.to = null; ship.trips++; flightDirty = true;
    }
    function depart(ship) {
        const route = bestRoute(ship); const here = uni.systemById[ship.at];
        const go = (toId) => { ship.from = ship.at; ship.to = toId; ship.progress = 0; ship.idle = 0; ship.t0 = t; ship.fromPos = posOf(here, t); ship.toPos = posOf(uni.systemById[toId], t);
            const dist = Math.max(1e-6, Math.hypot(ship.toPos[0] - ship.fromPos[0], ship.toPos[1] - ship.fromPos[1])); ship.arriveT = t + dist / o.speed; flightDirty = true; };
        if (!route) { ship.idle++; if (ship.idle > 3 && markets.length > 1) { let to; do { to = 1 + Math.floor(rnd() * markets.length); } while (to === ship.at); go(to); events.push(`${ship.name} wanders from ${here.name} to ${uni.systemById[to].name}`); } return; }
        const want = Math.min(o.holdTons, here.stock[route.good]);
        const r = ship.econ.buy(route.good, want, here.id);
        if (!r.ok) { ship.idle++; return; }
        here.stock[route.good] -= r.tons; here.credits += r.spent; reprice(here); ship.spent += r.spent; ship.cargoGood = route.good;
        go(route.to);
        ship.log.push({ tick, bought: r.tons, good: route.good, at: here.name, price: r.price, to: uni.systemById[route.to].name });
        events.push(`${ship.name} bought ${r.tons} t of ${route.good} at ${here.name} for ${r.spent}, bound for ${uni.systemById[route.to].name} (margin ${route.margin}/t)`);
    }
    /** Production: every market runs every recipe it can, once, when the output is not already a glut. */
    function produce() {
        for (const m of markets) {
            let moved = false;
            for (const rc of RECIPES) {
                if (!GOODS.every((g) => (m.stock[g] || 0) >= (rc.in[g] || 0))) continue;
                if (Object.keys(rc.out).some((g) => m.stock[g] >= m.need[g] * 2)) continue;
                for (const g in rc.in) { m.stock[g] -= rc.in[g]; ledger.consumed[g] += rc.in[g]; }
                for (const g in rc.out) { m.stock[g] += rc.out[g]; ledger.produced[g] += rc.out[g]; const mint = BASE[g] * rc.out[g]; m.credits += mint; ledger.minted += mint; }
                m.made += 1; ledger.recipesRun += 1; moved = true;
            }
            // a market also USES a little of what it is short of, so a shortage stays a shortage until somebody hauls
            for (const g of GOODS) if (m.stock[g] > 0 && m.stock[g] < m.need[g] && tick % (o.productionEvery * 2) === 0) { m.stock[g] -= 1; ledger.consumed[g] += 1; moved = true; }
            if (moved) reprice(m);
        }
    }
    /** Upkeep, once per whole day, paid to the market the ship is at or came from; one that cannot pay and holds nothing is finished. */
    function upkeep() {
        for (const ship of ships) { if (ship.bankrupt) continue;
            const due = o.upkeep, have = ship.store.get("credits"), pay = Math.min(due, Math.max(0, have));
            if (pay > 0) { ship.store.add("credits", -pay); ship.upkeepPaid += pay; ledger.upkeep += pay; uni.systemById[ship.to != null ? ship.from : ship.at].credits += pay; }
            const holds = GOODS.reduce((a, g) => a + (ship.player.cargo[g] || 0), 0);
            if (pay < due && holds === 0 && ship.to == null) { ship.bankrupt = true; ledger.bankruptcies++; flightDirty = true; events.push(`${ship.name} is bankrupt at ${uni.systemById[ship.at].name} with ${ship.store.get("credits")} cr`); } }
    }
    /** One step of `dtDays`. */
    function step(dtDays = 0.25) {
        t += dtDays; tick++;
        if (tick % o.productionEvery === 0) produce();
        if (Math.floor(t) > dayPaid) { dayPaid = Math.floor(t); upkeep(); }
        for (const ship of ships) {
            if (ship.bankrupt) continue;
            if (ship.to == null) { depart(ship); const p = posOf(uni.systemById[ship.at], t); ship.x = p[0]; ship.y = p[1]; continue; }
            if (world.moving) {
                const a = posOf(uni.systemById[ship.from], t), b = posOf(uni.systemById[ship.to], t);
                const dist = Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]));
                ship.progress = Math.min(1, ship.progress + o.speed * dtDays / dist);
                ship.x = a[0] + (b[0] - a[0]) * ship.progress; ship.y = a[1] + (b[1] - a[1]) * ship.progress;
            } else {
                // a still world: the flight is a function of time alone, which is what render/gpuHaul.mjs evaluates
                ship.progress = Math.min(1, (t - ship.t0) / Math.max(1e-9, ship.arriveT - ship.t0));
                ship.x = ship.fromPos[0] + (ship.toPos[0] - ship.fromPos[0]) * ship.progress; ship.y = ship.fromPos[1] + (ship.toPos[1] - ship.fromPos[1]) * ship.progress;
            }
            if (ship.progress >= 1) dock(ship, ship.to);
        }
        return { t, tick };
    }
    /** Every ton and every credit: both totals are the starting totals, always. */
    function accounting() {
        const stock = {}, holds = {}; let total = 0;
        for (const g of GOODS) { stock[g] = markets.reduce((s, m) => s + m.stock[g], 0); holds[g] = ships.reduce((s, sh) => s + (sh.player.cargo[g] || 0), 0); total += stock[g] + holds[g] + ledger.consumed[g] - ledger.produced[g]; }
        const traderCredits = ships.reduce((s, sh) => s + sh.store.get("credits"), 0), treasuries = markets.reduce((s, m) => s + m.credits, 0);
        const creditsTotal = traderCredits + treasuries - ledger.minted;   // upkeep circulates: it is in a treasury
        const perShipOk = ships.every((s) => s.store.get("credits") === o.credits + s.earned - s.spent - s.upkeepPaid);
        return { stock, holds, ledger, total, initialTons, tonsConserved: total === initialTons, traderCredits, treasuries, creditsTotal, initialCredits, creditsConserved: creditsTotal === initialCredits, creditsOk: perShipOk && creditsTotal === initialCredits,
                 bankrupt: ships.filter((s) => s.bankrupt).length, active: ships.filter((s) => !s.bankrupt).length, brokeMarkets: markets.filter((m) => m.credits < Math.min(...GOODS.map((g) => m.trade[g]))).length };
    }
    /** Instance records for a GPU-driven scene: one small quad per ship, bankrupt ships at radius 0. */
    function records(radius = 0.12) { const r = new Float32Array(ships.length * 4); ships.forEach((s, i) => r.set([s.x, s.y, 0.05, s.bankrupt ? 0 : radius], i * 4)); return r; }
    /**
     * v4300 -- the flight as a function of time, for a STILL world: per ship (fromX, fromY, toX, toY, t0, arriveT,
     * radius, active). A GPU pass evaluates the same lerp from these and the clock; dirty flips when any ship
     * departs, docks or goes bankrupt, so a caller re-uploads only then.
     */
    function flightElements(radius = 0.12) { const e = new Float32Array(ships.length * 8); ships.forEach((s, i) => { const inFlight = s.to != null && !s.bankrupt; const at = inFlight ? null : posOf(uni.systemById[s.at], t);
        e.set(inFlight ? [s.fromPos[0], s.fromPos[1], s.toPos[0], s.toPos[1], s.t0, s.arriveT, radius, 1] : [at[0], at[1], at[0], at[1], t, t + 1, s.bankrupt ? 0 : radius, s.bankrupt ? 0 : 1], i * 8); }); return e; }
    return { markets, ships, uni, step, accounting, records, flightElements, events, bestRoute, produce, get t() { return t; }, get tick() { return tick; }, get flightDirty() { return flightDirty; }, clearFlightDirty() { flightDirty = false; },
             names: ships.map((s) => s.name), moving: !!world.moving, opts: o,
             describe(i) { const s = ships[i]; if (!s) return ""; if (s.bankrupt) return `${s.name}: bankrupt`; const m = uni.systemById[s.at], d = s.to ? uni.systemById[s.to] : null; const cargo = Object.entries(s.player.cargo).map(([g, n]) => `${n} t ${g}`).join(", ") || "empty";
                 return d ? `${s.name}: ${cargo}, ${m.name} -> ${d.name}, ${(s.progress * 100).toFixed(0)}%, ${s.store.get("credits")} cr` : `${s.name}: docked at ${m.name}, ${cargo}, ${s.store.get("credits")} cr`; },
             describeMarket(id) { const m = uni.systemById[id]; return m ? `${m.name}: ${GOODS.map((g) => g + " " + m.trade[g] + " (" + m.stock[g] + " t)").join(", ")}, treasury ${m.credits} cr, ${m.made} runs` : ""; } };
}

/** The orrery's economy: repositories as moving markets, git's contributors plus a hauler per body as crew. */
export function makeGitEconomy(system, opts = {}) {
    const markets = marketsOf(system, opts.treasury);
    const crew = opts.traders || [...gitTraders().map((t) => ({ name: t.name || t.id, from: t.repos })), ...markets.map((m) => ({ name: "hauler of " + m.name, from: [] }))];
    return makeEconomy({ markets, crew, moving: true, positionOf: (m, td) => { const p = positionAt(m.body, td); return [p.x, p.y]; } }, opts);
}
