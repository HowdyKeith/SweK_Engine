// WebGLEngine/ev/esEconomy.js — Endless Sky economy: commodity trading with real per-system prices,
// plus shipyard/outfitter buying and selling. Works off the same condition store + player state the
// mission runner uses (credits and cargo live in the store), so trade, missions, and events stay in
// sync. Pure logic, DOM-free, unit-testable.
//
//   import { createEconomy, makeFlagship } from "./esEconomy.js";
//   const econ = createEconomy(uni, store, player);
//   econ.priceAt(systemId, "Food");           // local price (system trade, else commodity mid)
//   econ.buy("Food", 5, systemId);            // -> { ok, spent } / { ok:false, why }
//   econ.sell("Food", 5, systemId);
//   econ.shipsForSale(spob);  econ.outfitsForSale(spob);
//   econ.buyOutfit("Hyperdrive");  econ.sellOutfit("Hyperdrive");  econ.buyShip("Sparrow");
//
// Prices are real ES data: each system carries `trade <good> <price>`; commodities.txt gives the
// low/high band used as a fallback mid price. Outfit and ship `cost` are the real values.

"use strict";

// Recompute a flagship's motion from its base hull + installed outfits. Mirrors the derivation in
// esData pass 1b (kept in sync deliberately) so a ship's stats change correctly as you outfit it.
function deriveMotion(hull, outfitsMap, outfitByName) {
    let thrust = 0, turn = 0, drag = hull.drag || 1, extraMass = 0, shieldGen = 0;
    for (const name in outfitsMap) {
        const o = outfitByName[name]; const qty = outfitsMap[name]; if (!o || !qty) continue;
        thrust += (+o.thrust || +o["afterburner thrust"] || 0) * qty;
        turn += (+o.turn || 0) * qty;
        drag += (+o.drag || 0) * qty;
        extraMass += (+o.mass || 0) * qty;
        shieldGen += (+o["shield generation"] || 0) * qty;
    }
    const mass = Math.max(10, (hull.mass || 0) + extraMass);
    drag = Math.max(0.5, drag);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    return {
        mass, shieldRech: shieldGen,
        speed: clamp(Math.round((thrust / drag) * 6), 40, 900),
        accel: clamp(Math.round((thrust / mass) * 60), 2, 60),
        maneuver: clamp(Math.round((turn / mass) * 12), 3, 60),
    };
}

// Effective value of an attribute = hull base (for space attrs) + sum over installed outfits.
function effectiveAttr(flagship, attr, outfitByName) {
    let base = 0;
    if (attr === "cargo space") base = flagship.hull.cargoSpace || 0;
    else if (attr === "outfit space") base = flagship.hull.outfitSpace || 0;
    for (const name in flagship.outfits) { const o = outfitByName[name]; if (o && o[attr] != null) base += (+o[attr] || 0) * flagship.outfits[name]; }
    return base;
}

// Build a flagship object from a ship record (installs its default outfit loadout).
function makeFlagship(shipRecord) {
    const outfits = {};
    for (const it of (shipRecord.defaultOutfits || [])) outfits[it.name] = (outfits[it.name] || 0) + (it.qty || 1);
    return {
        name: shipRecord.name, base: shipRecord.name,
        hull: shipRecord.hull || { mass: shipRecord.mass || 100, drag: 1, cargoSpace: shipRecord.holds || 0, outfitSpace: shipRecord.freeMass || 0 },
        outfits,
        cost: shipRecord.cost || 0, category: shipRecord.category || "",
        crew: shipRecord.crew || 0, bunks: shipRecord.bunks || 0,
        shield: shipRecord.shield || 0, armor: shipRecord.armor || 0,
        speed: shipRecord.speed || 0, accel: shipRecord.accel || 0, maneuver: shipRecord.maneuver || 0,
        mass: shipRecord.mass || 100,
    };
}

function createEconomy(uni, store, player, hooks = {}) {
    const toast = hooks.toast || (() => {});
    const outfitByName = uni.outfitByName || {};
    const shipByName = uni.shipByName || {};

    if (!player.ship && player.fleet && player.fleet[0]) player.ship = player.fleet[0];
    // ensure the flagship has the fields the economy needs
    function fs() {
        let f = player.ship;
        if (f && !f.hull) f = player.ship = makeFlagship(shipByName[f.name] || f);
        return f;
    }
    function syncStoreSpaces() {
        const f = fs(); if (!f) return;
        f.attr = f.attr || {};
        f.attr["cargo space"] = effectiveAttr(f, "cargo space", outfitByName);
        // note: store's "cargo space" provider reads flagship.attr["cargo space"]
    }
    syncStoreSpaces();

    const credits = () => store.get("credits");
    const spend = (n) => store.add("credits", -n);
    const earn = (n) => store.add("credits", n);
    const cargoUsed = () => { let t = 0; for (const k in (player.cargo || {})) t += player.cargo[k]; return t; };
    const cargoSpace = () => effectiveAttr(fs(), "cargo space", outfitByName);
    const outfitSpaceFree = () => effectiveAttr(fs(), "outfit space", outfitByName);

    // ---- commodities ----
    function priceAt(systemId, commodity) {
        const sys = uni.systemById[systemId];
        if (sys && sys.trade && sys.trade[commodity] != null) return sys.trade[commodity];
        const c = uni.commodities[commodity];
        return c ? c.basePrice : 0;
    }
    function commodityList(systemId) {
        return Object.keys(uni.commodities).map((name) => ({ name, price: priceAt(systemId, name), have: (player.cargo && player.cargo[name]) || 0 }));
    }
    function buy(commodity, tons, systemId) {
        tons = Math.max(1, Math.floor(tons || 1));
        const price = priceAt(systemId, commodity);
        const room = cargoSpace() - cargoUsed();
        const affordable = price > 0 ? Math.floor(credits() / price) : 0;
        const n = Math.min(tons, room, affordable);
        if (n <= 0) return { ok: false, why: room <= 0 ? "no cargo space" : "not enough credits" };
        spend(n * price); player.cargo = player.cargo || {}; player.cargo[commodity] = (player.cargo[commodity] || 0) + n;
        return { ok: true, tons: n, spent: n * price, price };
    }
    function sell(commodity, tons, systemId) {
        const have = (player.cargo && player.cargo[commodity]) || 0;
        const n = Math.min(Math.max(1, Math.floor(tons || 1)), have);
        if (n <= 0) return { ok: false, why: "none to sell" };
        const price = priceAt(systemId, commodity);
        earn(n * price); player.cargo[commodity] -= n; if (!player.cargo[commodity]) delete player.cargo[commodity];
        return { ok: true, tons: n, earned: n * price, price };
    }

    // ---- outfitter ----
    function outfitsForSale(spob) {
        const names = new Set();
        for (const g of (spob.outfitterGroups || [])) for (const nm of (uni.outfitters[g] || [])) names.add(nm);
        return [...names].map((nm) => outfitByName[nm]).filter(Boolean);
    }
    function refreshFlagshipStats() {
        const f = fs(); if (!f) return;
        Object.assign(f, deriveMotion(f.hull, f.outfits, outfitByName));
        f.shield = f.hull.shields + effectiveAttr(f, "shield capacity", outfitByName);
        syncStoreSpaces();
    }
    function buyOutfit(name) {
        const o = outfitByName[name]; if (!o) return { ok: false, why: "no such outfit" };
        const cost = +o.cost || 0;
        if (credits() < cost) return { ok: false, why: "not enough credits" };
        // outfit space check: this outfit's "outfit space" is negative (consumes)
        const needs = -(+o["outfit space"] || 0);
        if (needs > outfitSpaceFree()) return { ok: false, why: "not enough outfit space" };
        const f = fs(); spend(cost); f.outfits[name] = (f.outfits[name] || 0) + 1; refreshFlagshipStats();
        return { ok: true, cost };
    }
    function sellOutfit(name) {
        const f = fs(); if (!f.outfits[name]) return { ok: false, why: "not installed" };
        const o = outfitByName[name]; const cost = +((o && o.cost) || 0);
        earn(cost); f.outfits[name]--; if (!f.outfits[name]) delete f.outfits[name]; refreshFlagshipStats();
        return { ok: true, refund: cost };
    }

    // ---- shipyard ----
    function shipsForSale(spob) {
        const names = new Set();
        for (const g of (spob.shipyardGroups || [])) for (const nm of (uni.shipyards[g] || [])) names.add(nm);
        return [...names].map((nm) => shipByName[nm]).filter(Boolean);
    }
    function buyShip(name) {
        const rec = shipByName[name]; if (!rec) return { ok: false, why: "no such ship" };
        const cost = +rec.cost || 0;
        const tradeIn = fs() ? Math.round((fs().cost || 0) * 0.5) : 0;   // simple trade-in of current hull
        if (credits() < cost - tradeIn) return { ok: false, why: "not enough credits" };
        spend(cost - tradeIn);
        player.ship = makeFlagship(rec); player.fleet = [player.ship];
        Object.assign(player.ship, deriveMotion(player.ship.hull, player.ship.outfits, outfitByName));
        syncStoreSpaces();
        toast("Purchased " + name);
        return { ok: true, cost, tradeIn };
    }

    return { priceAt, commodityList, buy, sell, outfitsForSale, buyOutfit, sellOutfit, shipsForSale, buyShip,
        cargoUsed, cargoSpace, outfitSpaceFree, flagship: fs, refreshFlagshipStats, effectiveAttr: (a) => effectiveAttr(fs(), a, outfitByName) };
}

if (typeof module !== "undefined" && module.exports) module.exports = { createEconomy, makeFlagship, deriveMotion };
export { createEconomy, makeFlagship, deriveMotion };
