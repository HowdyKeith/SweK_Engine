// WebGLEngine/ev/flightModel.js — pure flight physics for the EV-compatible engine. No WebGL, no DOM, fully
// deterministic and unit-testable. The classic EV feel: turn in place, thrust adds velocity in the facing
// direction, velocity is capped to the ship's top speed, and there's no friction — you drift and brake by turning
// around. Heading is degrees clockwise from "up"; world +y points down (matching spöb in-system coordinates), so
// the thrust direction for heading h is (sin h, -cos h).
//
//   import { stepFlight, headingVector, TURN_SCALE, shipFlightStats } from "./flightModel.js";
//   state = stepFlight(state, { turn:+1, thrust:true }, stats, dt);
//
// state = { x, y, vx, vy, heading }   (heading in degrees, 0..360)
// stats = { accel, speed, turn }      (turn = degrees/sec; speed/accel in world units)
// input = { turn:-1|0|1, thrust:bool }
//
// Milestone 5a.

const DEG = Math.PI / 180;
const TURN_SCALE = 3;   // Maneuver field -> deg/sec (Bible: Maneuver 10 ~= 30 deg/sec)

// Convert a raw shïp record (from evData.parseShip) into flight stats. Scales are tunable to match real EV feel on
// the rig; the model is exact, these constants set the units.
function shipFlightStats(ship, opts = {}) {
    const speedScale = opts.speedScale != null ? opts.speedScale : 1;
    const accelScale = opts.accelScale != null ? opts.accelScale : 1;
    return {
        accel: Math.max(0, (ship.accel || 0) * accelScale),
        speed: Math.max(1, (ship.speed || 0) * speedScale),
        turn: Math.max(1, (ship.maneuver || 0) * TURN_SCALE),
    };
}

function normDeg(d) { d %= 360; return d < 0 ? d + 360 : d; }
function headingVector(headingDeg) { const a = headingDeg * DEG; return { x: Math.sin(a), y: -Math.cos(a) }; }
function speedOf(state) { return Math.hypot(state.vx, state.vy); }

// Advance one tick. Returns a NEW state object (does not mutate the input).
function stepFlight(state, input, stats, dt) {
    if (!(dt > 0)) return { x: state.x, y: state.y, vx: state.vx, vy: state.vy, heading: normDeg(state.heading) };
    const heading = normDeg(state.heading + (input.turn || 0) * stats.turn * dt);
    let vx = state.vx, vy = state.vy;
    if (input.thrust) {
        const v = headingVector(heading), a = stats.accel * dt;
        vx += v.x * a; vy += v.y * a;
    }
    const sp = Math.hypot(vx, vy);
    if (sp > stats.speed && sp > 0) { const k = stats.speed / sp; vx *= k; vy *= k; }
    return { x: state.x + vx * dt, y: state.y + vy * dt, vx, vy, heading };
}

export { stepFlight, headingVector, speedOf, normDeg, shipFlightStats, TURN_SCALE };
