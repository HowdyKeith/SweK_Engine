// Self-check for ev/esEconomy.js. Synthetic checks always run; pass an ES data/ dir to test real prices:
//   node es-economy-selfcheck.mjs /path/to/endless-sky/data
import { parseESFiles } from "../esParse.js";
import { buildUniverseFromES } from "../esData.js";
import { createConditionStore } from "../esConditions.js";
import { createEconomy, makeFlagship } from "../esEconomy.js";
import fs from "fs"; import path from "path";
let pass = 0, fail = 0; const ok = (n, c) => c ? pass++ : (fail++, console.log("  FAIL:", n));

// synthetic: one commodity, two systems with different prices, a tiny freighter
const uni = { source: "endless-sky",
  commodities: { Food: { id: "Food", name: "Food", low: 100, high: 600, basePrice: 350 } },
  systems: [{ id: 1, name: "Cheap", trade: { Food: 100 }, spobs: [] }, { id: 2, name: "Dear", trade: { Food: 500 }, spobs: [] }],
  systemById: {}, spobs: {}, ships: [], outfits: {}, outfitByName: {}, shipByName: {}, shipyards: {}, outfitters: {} };
uni.systemById = { 1: uni.systems[0], 2: uni.systems[1] };
const shuttle = { name: "Hauler", hull: { mass: 100, drag: 2, cargoSpace: 10, outfitSpace: 50 }, defaultOutfits: [], cost: 100000, shield: 100, armor: 100, speed: 100, accel: 10, maneuver: 10, mass: 100 };
uni.shipByName["Hauler"] = shuttle;
const player = { conditions: {}, credits: 10000, cargo: {}, ship: makeFlagship(shuttle), fleet: [] };
const store = createConditionStore(player, uni);
const econ = createEconomy(uni, store, player);
ok("cargo space from hull", econ.cargoSpace() === 10);
const b = econ.buy("Food", 10, 1);
ok("buy 10 Food @100", b.ok && b.tons === 10 && b.spent === 1000);
ok("credits down", store.get("credits") === 9000);
ok("can't exceed cargo space", econ.buy("Food", 5, 1).ok === false);
const s = econ.sell("Food", 10, 2);
ok("sell 10 Food @500", s.ok && s.earned === 5000);
ok("net profit 4000", store.get("credits") === 14000);
ok("fallback to mid price when system has none", econ.priceAt(999, "Food") === 350);

const dir = process.argv[2];
if (dir && fs.existsSync(dir)) {
  const gather = (d) => { let o = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith("_")) continue; const p = path.join(d, e.name); if (e.isDirectory()) o = o.concat(gather(p)); else if (e.name.endsWith(".txt")) o.push(p); } return o; };
  const U = buildUniverseFromES(parseESFiles(gather(dir).map((f) => fs.readFileSync(f, "utf8"))));
  const priced = U.systems.filter((s) => s.trade && s.trade["Food"] != null);
  ok("real systems carry prices", priced.length > 100);
  let shipyardPlanets = 0; for (const sy of U.systems) for (const sp of sy.spobs) if (sp.canBuyShips) shipyardPlanets++;
  ok("real planets have shipyards", shipyardPlanets > 0);
  console.log(`  (real: ${priced.length} priced systems, ${Object.keys(U.commodities).length} commodities, ${Object.keys(U.shipyards).length} shipyard groups, ${shipyardPlanets} shipyard planets)`);
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
