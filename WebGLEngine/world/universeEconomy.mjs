// WebGLEngine/world/universeEconomy.mjs -- v4300
//
// THE ECONOMY IN THE ENDLESS SKY UNIVERSE: 694 systems as markets, hundreds of haulers, on a STILL map -- so the
// flight is a function of time and render/gpuHaul.mjs can evaluate it on the GPU with nothing read back.
//
// Stock is not accurate and says so: a system is stocked by what it holds -- a star is source (energy, the raw
// thing), a planet is data and docs (people write things down), a station is binaries (things are built there)
// -- scaled so a system with many objects has more of everything. The point is a universe with gradients in it,
// so haulers have somewhere to go.
"use strict";
import { makeEconomy, marketsOfStocks, GOODS } from "./gitEconomy.mjs";
import { universeRecords } from "./universeBodies.mjs";

/** Tons a stellar object of each kind contributes to its system. */
export const YIELD = Object.freeze({ star: Object.freeze({ source: 30, binaries: 0, data: 2, docs: 0 }), planet: Object.freeze({ source: 4, binaries: 2, data: 12, docs: 14 }),
                                     station: Object.freeze({ source: 2, binaries: 18, data: 4, docs: 2 }), other: Object.freeze({ source: 3, binaries: 3, data: 3, docs: 3 }) });

/** Markets and positions from the universe records (world/universeBodies.mjs), one market per system. */
export function universeMarkets(U, kindsOfSystem) {
    const named = [];
    for (let i = 0; i < U.systems; i++) {
        const stock = { source: 0, binaries: 0, data: 0, docs: 0 };
        for (const k of kindsOfSystem[i] || []) for (const g of GOODS) stock[g] += (YIELD[k] || YIELD.other)[g];
        if (!GOODS.some((g) => stock[g] > 0)) stock.docs = 1;
        named.push({ name: U.names[i], stock, body: { index: i } });
    }
    return named;
}

/** Build it: `haulers` ships named after the systems they start at. */
export function makeUniverseEconomy(slim, { haulers = 300, seed = 11, speed = 20, ...opts } = {}) {
    const U = universeRecords(slim);
    const kinds = Array.from({ length: U.systems }, () => []);
    for (let i = U.systems; i < U.count; i++) kinds[U.systemOf[i]].push(U.kinds[i]);
    const markets = marketsOfStocks(universeMarkets(U, kinds), opts.treasury);
    const crew = Array.from({ length: haulers }, (_, i) => ({ name: `hauler ${i + 1}` }));
    const econ = makeEconomy({ markets, crew, moving: false, positionOf: (m) => [U.records[m.body.index * 4], U.records[m.body.index * 4 + 1]] }, { seed, speed, ...opts });
    return Object.assign(econ, { universe: U });
}
