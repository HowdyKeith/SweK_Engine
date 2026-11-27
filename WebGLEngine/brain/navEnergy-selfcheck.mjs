// WebGLEngine/brain/navEnergy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/navEnergy-selfcheck.mjs      (a few seconds)
//
// THE GATE OF brain/navEnergy.mjs (PART 1 of brain/NAV_MISSIONS_WIP.md): the energy meter of a navigation flight.
//   1 THE POWER    wattsOf is the needs model's: the hotel load at rest; at full thrust and a forward speed, 200 + thrustMax x v / 0.5; reverse thrust at reverseFraction;
//                  out of the water no thrust; the speed THROUGH the water (a current moving with the boat halves the forward speed's share).
//   2 THE METER    on the same commands, the meter equals stepNeeds's energy drop to 1e-6 relative and the two trajectories agree; a flight under the meter is the flight without it.
//   3 THE RECORD   flyMetered adds energy, J per metre and the share of one battery (3 MJ), consistently.
// SABOTAGE LOG (2026-11-17; 7 mutants of brain/navEnergy.mjs, each alone, restored byte-identical): E1 reverse thrust unscaled (2 red), E2 the submerged fraction dropped (1),
//   E3 the current ignored in the forward speed (2), E4 the command not sanitized (1), E5 the METERED PILOT ignoring the current (0 red FIRST: check 1 computed the watts itself
//   instead of going through the meter; it now drives the real meteredPilot, then 1), E6 the meter altering the command (1), E7 the share over 12 MJ not 3 (1). And the check's
//   tolerance loosened to 10 percent (0 red FIRST: no row offered a near miss; a 0.1 percent bias row added, then 1).
"use strict";
import fs from "node:fs";
import * as E from "./navEnergy.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as NE from "../physics/mechanics/subNeeds.mjs";
import * as H from "./subHardNav.mjs";
import * as AP from "./autopilotSub.mjs";
import { meterMatchesNeeds, meterLeavesFlight } from "../tools/ship/navEnergyStudy.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
console.log("navEnergy-selfcheck -- the energy meter of a navigation flight\n");

const m = E.navModel(), sp = m.spec;
const st = (o = {}) => S.createState({ pos: [0, 0, -20], speed: 0, heading: 0, pitch: 0, bank: 0, gamma: 0, w: [0, 0, 0], model: m, ...o });
sec("1. THE POWER");
{
    ok("!! at rest with no thrust: the hotel load (200 W)", near(E.wattsOf(m, st(), { thrust: 0, rudder: 0, plane: 0 }).watts, NE.POWER.hotelW));
    const s2 = st({ speed: 2 }), fw = E.wattsOf(m, s2, { thrust: 1, rudder: 0, plane: 0 });
    ok("!! full thrust at 2 m/s forward: 200 + thrustMax x 2 / 0.5 (forward read from the state through the water)", near(fw.forward, 2, 1e-9) && near(fw.thrustN, sp.thrustMax) && near(fw.watts, 200 + (sp.thrustMax * 2) / 0.5, 1e-6), `${fw.watts.toFixed(1)} W`);
    const rv = E.wattsOf(m, s2, { thrust: -1, rudder: 0, plane: 0 });
    ok("!! reverse thrust is scaled by reverseFraction, and the power counts its magnitude", near(rv.thrustN, -sp.thrustMax * sp.reverseFraction) && near(rv.watts, 200 + Math.abs(rv.thrustN * 2) / 0.5, 1e-6));
    const cur = E.wattsOf(m, s2, { thrust: 1, rudder: 0, plane: 0 }, [1, 0, 0]);
    ok("!! a current of 1 m/s along the boat's path halves the forward speed through the water (2 -> 1)", near(cur.forward, 1, 1e-9));
    const air = E.wattsOf(m, st({ pos: [0, 0, 5] }), { thrust: 1, rudder: 0, plane: 0 });
    ok("  out of the water (5 m up) the propeller gives no thrust: the hotel load only", near(air.thrustN, 0) && near(air.watts, 200));
    ok("  a command beyond full is sanitized as the model sanitizes it (thrust 3 is thrust 1)", near(E.wattsOf(m, s2, { thrust: 3, rudder: 0, plane: 0 }).watts, fw.watts));
}

sec("2. THE METER");
{
    const r = meterMatchesNeeds();
    ok("!! on 900 ticks of the same commands (a turning target, a depth change, a speed ramp, a current): the trajectories agree and the meter equals stepNeeds's energy drop to 1e-6 relative", r.ok && r.same, `meter ${r.joules.toFixed(3)} J, needs ${r.drop.toFixed(3)} J`);
    ok("!! the check is tight: the same run with the meter's total 0.1 percent high fails it", meterMatchesNeeds(900, { bias: 1.001 }).ok === false);
    ok("!! a flight under the meter is the flight without it (status, ticks, path), for each of the three arms on DEV seed 1", meterLeavesFlight());
    const mp = E.meteredPilot((s, t) => ({ thrust: 0, rudder: 0, plane: 0 }), { dt: 0.5 }); mp.pilot(st(), {}, null); mp.pilot(st(), {}, null);
    ok("  the meter adds watts x dt per call (two calls at rest, dt 0.5: 200 J) and counts the ticks; a missing current is no current", near(mp.meter.joules, 200) && mp.meter.ticks === 2);
}

sec("3. THE RECORD");
{
    const sc = H.hardScenario(1, "hard-traffic"), r = E.flyMetered(sc, "any+predict");
    ok("!! flyMetered adds energy (positive), J per metre = energy / path, and the share of one 3 MJ battery", r.energy > 0 && near(r.jPerM, r.energy / r.path, 1e-9) && near(r.battery, r.energy / 3.0e6, 1e-12) && E.BATTERY_J === 3.0e6);
    const recipe = "S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 }))", hsrc = fs.readFileSync(new URL("./subHardNav.mjs", import.meta.url), "utf8"), esrc = fs.readFileSync(new URL("./navEnergy.mjs", import.meta.url), "utf8");
    ok("!! the meter's model is built with subHardNav's own recipe (the explorer, seabed 1000 m: the same line in both files), so the power is priced on the hull that flies", hsrc.includes(`(MODEL = ${recipe})`) && esrc.includes(`(MODEL = ${recipe})`) && m.spec.thrustMax === S.EXPLORER.thrustMax);
}

sec("4. THE SOURCE");
{
    const code = fs.readFileSync(new URL("./navEnergy.mjs", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! no clock and no Math.random", !/Math\.random|Date\.now|new Date|performance\.now/.test(code));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exitCode = fails ? 1 : 0;
