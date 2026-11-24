// WebGLEngine/brain/navEnergy.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is PART 1 of brain/NAV_MISSIONS_WIP.md, written before this file;
// the study is tools/ship/navEnergyStudy.mjs; the gate is brain/navEnergy-selfcheck.mjs)
//
// THE ENERGY METER OF A NAVIGATION FLIGHT. A pilot wrapper that adds, at every tick, the power the submarine needs model charges (physics/mechanics/subNeeds.mjs: the hotel load
// plus |thrust x forward speed through the water| / efficiency, with the thrust the sanitized command gives at the submerged fraction) and changes nothing in the flight. The gate
// holds it equal to stepNeeds's own energy drop. No clock, no Math.random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as NE from "../physics/mechanics/subNeeds.mjs";
import { worldToBody } from "../physics/mechanics/rigidBody6dof.mjs";
import * as AP from "./autopilotSub.mjs";
import * as H from "./subHardNav.mjs";

export const BATTERY_J = NE.CLASSES.battery.capacityJ;
let MODEL = null;
/** The model the navigation flights fly (subHardNav's: the explorer with a 1000 m seabed). */
export const navModel = () => MODEL || (MODEL = S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })));
/** The needs model's power for a command at a state in a current: { watts, thrustN, forward }. */
export function wattsOf(model, state, cmd, current = [0, 0, 0]) {
    const san = S.sanitize(cmd), s = model.spec, frac = S.submerged(model, state.pos[2]);
    const thrustN = s.thrustMax * (san.thrust >= 0 ? san.thrust : san.thrust * s.reverseFraction) * frac;
    const rel = [state.vel[0] - current[0], state.vel[1] - current[1], state.vel[2] - current[2]], forward = worldToBody(state.q, rel)[0];
    return { watts: NE.power(thrustN, forward), thrustN, forward };
}
/** A metered pilot: { pilot(state, target, current), meter: { joules, ticks } }. `dt` is the flight's tick. */
export function meteredPilot(base = (s, t, c) => AP.decide(s, t, c), { model = navModel(), dt = S.DT } = {}) {
    const meter = { joules: 0, ticks: 0 };
    const pilot = (s, target, cv) => { const cmd = base(s, target, cv); meter.joules += wattsOf(model, s, cmd, cv || [0, 0, 0]).watts * dt; meter.ticks++; return cmd; };
    return { pilot, meter };
}
/** One metered flight: flyHard's record plus { energy (J), jPerM (J per metre of path, null with no path), battery (energy over one battery) }. */
export function flyMetered(sc, arm, { base, ...o } = {}) {
    const mp = meteredPilot(base), rec = H.flyHard(mp.pilot, sc, arm, o);
    return { ...rec, energy: mp.meter.joules, jPerM: rec.path > 0 ? mp.meter.joules / rec.path : null, battery: mp.meter.joules / BATTERY_J };
}
