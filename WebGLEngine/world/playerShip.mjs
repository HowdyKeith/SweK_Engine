// WebGLEngine/world/playerShip.mjs -- v4317 (Level 17)
//
// LEVEL 17: YOU, IN YOUR OWN SHIP, IN THE GIT UNIVERSE. The user's hull already flies as the Wedge race; this puts
// the PERSON in it. The player's ship is a crew member the sim does not route (`manual: true` in world/gitEconomy.mjs):
// the economy never departs it and never docks it, its position is the page's to set each frame from these
// controls, and what it does to the economy -- landing, buying, selling, launching -- goes in as INTERVENTIONS
// (land / trade / launch), so it is journaled, replayed and lockstepped like anything else. Position is not in the
// state hash (positions never were); the trades are, so two peers watching one person fly agree on every credit.
//
// The flight model is deliberately the smallest one that is a model: thrust along the heading, a turn rate, a
// linear drag, integrated per frame. ev/esFlight3dMath.js and the EV flight view carry the game's full model; this
// is the cockpit for the orrery's plane, and its gate is about the LEDGER, not the aerodynamics.
"use strict";

import { GOODS } from "./gitEconomy.mjs";

export const FLIGHT = Object.freeze({ thrust: 3.0, turn: 2.4, drag: 0.6, landRadius: 0.45 });

/** The flight state and its integrator. `controls` = { thrust: 0..1, turn: -1..1 }. */
export function makeFlight({ x = 0, y = 0, yaw = 0 } = {}, params = FLIGHT) {
    const s = { x, y, vx: 0, vy: 0, yaw, landed: null };
    return {
        state: s,
        step(dt, controls = {}) {
            if (s.landed != null) return s;   // on the ground nothing moves; launch() lifts
            const th = Math.max(0, Math.min(1, controls.thrust || 0)), tu = Math.max(-1, Math.min(1, controls.turn || 0));
            s.yaw += tu * params.turn * dt;
            s.vx += Math.cos(s.yaw) * th * params.thrust * dt; s.vy += Math.sin(s.yaw) * th * params.thrust * dt;
            const k = Math.max(0, 1 - params.drag * dt); s.vx *= k; s.vy *= k;
            s.x += s.vx * dt; s.y += s.vy * dt;
            return s;
        },
        /** The nearest market within landRadius of the ship, or null. `positionOf(market)` is the economy's. */
        nearest(markets, positionOf) { let best = null, bd = params.landRadius; for (const m of markets) { const p = positionOf(m); const d = Math.hypot(p[0] - s.x, p[1] - s.y); if (d < bd) { bd = d; best = m; } } return best; },
        land(market, positionOf) { const p = positionOf(market); s.x = p[0]; s.y = p[1]; s.vx = 0; s.vy = 0; s.landed = market.id; },
        launch() { s.landed = null; },
    };
}

/**
 * The cockpit's economic side: what the ship may do at the market it is landed on, and the interventions that do
 * it. `economy` is the sim, `shipIndex` the player's seat. Every action is an intervention (journaled); the
 * economy validates it (a manual ship may only trade where it is landed).
 */
export function makeCockpit(economy, shipIndex, { intervene = null } = {}) {
    const iv = intervene || ((kind, args) => economy.intervene(kind, args));
    const ship = () => economy.ships[shipIndex];
    return {
        get ship() { return ship(); },
        land(marketId) { iv("land", { ship: shipIndex, market: marketId }); },
        launch() { iv("launch", { ship: shipIndex }); },
        buy(good, tons) { iv("trade", { ship: shipIndex, good, tons: Math.abs(Math.round(tons)) }); },
        sell(good, tons) { iv("trade", { ship: shipIndex, good, tons: -Math.abs(Math.round(tons)) }); },
        /** The trade screen: prices here, the hold, the credits, what could be bought or sold. */
        screen() { const s = ship(); const m = s.at ? economy.uni.systemById[s.at] : null; if (!m || !s.landed) return null;
            const credits = s.store.get("credits"), holdTons = economy.opts.holdTons, held = GOODS.reduce((a, g) => a + (s.player.cargo[g] || 0), 0);
            return { market: m.name, marketId: m.id, credits, held, holdTons, goods: GOODS.map((g) => ({ good: g, price: m.trade[g], stock: m.stock[g], have: s.player.cargo[g] || 0, canBuy: Math.min(m.stock[g], holdTons - held, Math.floor(credits / Math.max(1, m.trade[g]))), canSell: Math.min(s.player.cargo[g] || 0, Math.floor(m.credits / Math.max(1, m.trade[g]))) })) }; },
    };
}
/** A scripted flight for the gate and a demo: the controls per step for `steps` steps toward a target, then land. */
export function flyTo(flight, target, { dt = 1 / 30, maxSteps = 600 } = {}) {
    let steps = 0;
    while (steps++ < maxSteps) {
        const s = flight.state, want = Math.atan2(target[1] - s.y, target[0] - s.x);
        let d = want - s.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        const dist = Math.hypot(target[0] - s.x, target[1] - s.y), speed = Math.hypot(s.vx, s.vy);
        flight.step(dt, { turn: Math.max(-1, Math.min(1, d * 3)), thrust: Math.abs(d) < 0.5 && speed < dist * 1.5 + 0.2 ? 1 : 0 });
        if (dist < FLIGHT.landRadius * 0.8) return { arrived: true, steps };
    }
    return { arrived: false, steps };
}
