// WebGLEngine/render/flightViews.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A VIEW WINDOW PER CRAFT FOR THE FLIGHT AND SPACE FIGHTS, the way render/carViews.mjs gave one to each race car: a stack of small windows down the right of the page, one per aircraft (or ship), and a click on a window switches what it shows --
//
//   plane    the craft seen from outside: a chase camera behind and above it, along its heading and not its roll, looking at it -- so its pitch, bank and what it is shooting at can be seen
//   pilot    the pilot's seat: the eye a little above and ahead of the centre of mass, looking along the nose, up the craft's own up -- the view tilts when the craft rolls
//   gunner   the gun's sight (a fixed gun) or a gun seat's view (a turret): the eye looks along the gun, the reticle is where a round fired NOW would be at the target's range, and the lead pip is where the target will be
//            when a round fired now gets there (flightGuns.aimSolution -- the same solution a gunner brain slews toward)
//   brain    not a camera: the pilot's network, live -- its features, its hidden activations and its four outputs, as bars (the fruit fly's 34 neurons or the GPU Brain's two layers; the PD autopilot has no network, so its 18 features
//            and four outputs only) -- and a gunner's, when the craft has gun seats
//
// Everything here is a pure function of the craft's state: a camera is { eye, target, up, fov } (a vertical field of view, radians) and project() puts a world point on that camera's picture, so the geometry is held headless by
// render/flightViews-selfcheck.mjs and the page only hands the same camera to Three.js. WHAT IS NOT HERE, SAID PLAINLY: the drawing of the scene (the page does that) and any cockpit model -- the pilot's view has no canopy frame or
// instruments, only the horizon, the world and the reticle.
//
// CONVENTIONS are the flight model's: a craft's body has nose +X, up +Z and +Y to its LEFT; a quaternion is Hamilton [w, x, y, z]; the world is Z-up with the ground at z = 0.
"use strict";
import { rotateByQuat } from "../physics/mechanics/rigidBody6dof.mjs";
import * as G from "../physics/mechanics/flightGuns.mjs";
import { mlpLayerCpu } from "./brainTsl.mjs";

export const VIEWS = Object.freeze(["plane", "pilot", "gunner", "brain"]);
/** The view a click goes to from `view`; a craft with no gun (`hasGunner` false) skips the gunner's. */
export function nextView(view, hasGunner = true) {
    const list = hasGunner ? VIEWS : VIEWS.filter((v) => v !== "gunner");
    const i = list.indexOf(view);
    return list[(i + 1) % list.length];
}

export const VIEW_DRAW = Object.freeze({
    width: 240, height: 160, refreshEvery: 1,
    fovPlane: 0.95, fovPilot: 1.25, fovGunner: 0.55,
    chaseBack: 24, chaseUp: 7, chaseAhead: 6,        // metres: behind, above, and how far ahead of the craft the chase camera looks
    seat: Object.freeze([0.9, 0, 0.55]),             // the pilot's eye in the body frame (the trainer: above the wing, forward of the centre of mass)
    sightAhead: 60,                                  // the sight looks this far along the gun
    clear: Object.freeze([0.03, 0.05, 0.08, 1]),
});

const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const n = norm(a); return n > 1e-12 ? [a[0] / n, a[1] / n, a[2] / n] : [1, 0, 0]; };

/** The chase camera: behind the craft along its HEADING (the nose's direction flattened onto the ground; straight up or down falls back to the velocity's, then to +X) and above it, looking at a point `chaseAhead` ahead of the craft. World up is the camera's up. */
export function planeCamera(state, { draw = VIEW_DRAW } = {}) {
    const f = rotateByQuat(state.q, [1, 0, 0]);
    let flat = [f[0], f[1], 0];
    if (norm(flat) < 0.2) flat = [state.vel[0], state.vel[1], 0];
    flat = norm(flat) < 1e-6 ? [1, 0, 0] : unit(flat);
    const eye = [state.pos[0] - flat[0] * draw.chaseBack, state.pos[1] - flat[1] * draw.chaseBack, state.pos[2] + draw.chaseUp];
    return { eye, target: add(state.pos, flat, draw.chaseAhead), up: [0, 0, 1], fov: draw.fovPlane };
}

/** The pilot's seat: the eye at `seat` in the body frame, looking along the nose, with the craft's own up (the picture rolls with the craft). */
export function pilotCamera(state, { draw = VIEW_DRAW } = {}) {
    const eye = add(state.pos, rotateByQuat(state.q, draw.seat)), fwd = rotateByQuat(state.q, [1, 0, 0]);
    return { eye, target: add(eye, fwd, draw.sightAhead), up: rotateByQuat(state.q, [0, 0, 1]), fov: draw.fovPilot };
}

/** The sight of a fixed gun: the pilot's eye looking along the gun's axis (flightGuns.muzzleOf: the nose 0.05 rad down), up the craft's own up. */
export function gunSightCamera(state, { draw = VIEW_DRAW, spec = G.GUN } = {}) {
    const eye = add(state.pos, rotateByQuat(state.q, draw.seat)), m = G.muzzleOf(state, spec);
    return { eye, target: add(eye, m.dir, draw.sightAhead), up: rotateByQuat(state.q, [0, 0, 1]), fov: draw.fovGunner };
}

/** A gun seat's view (physics/mechanics/gunSeats.mjs): the eye 0.4 m behind the muzzle along the gun, looking along it, up the craft's own up (made perpendicular to the gun). `muzzle` is gunSeats.muzzleOfSeat's { pos, dir }. */
export function seatCamera(state, muzzle, { draw = VIEW_DRAW } = {}) {
    const dir = unit(muzzle.dir), eye = add(muzzle.pos, dir, -0.4);
    let up = rotateByQuat(state.q, [0, 0, 1]); up = add(up, dir, -dot(up, dir));
    if (norm(up) < 1e-6) up = rotateByQuat(state.q, [1, 0, 0]);
    return { eye, target: add(eye, dir, draw.sightAhead), up: unit(up), fov: draw.fovGunner };
}

/** The camera a view names for a craft, or null for the brain view (which is not a camera). `gun` is { muzzle } for a seat, or omitted for the fixed gun. */
export function cameraFor(view, state, opts = {}) {
    if (view === "plane") return planeCamera(state, opts);
    if (view === "pilot") return pilotCamera(state, opts);
    if (view === "gunner") return opts.muzzle ? seatCamera(state, opts.muzzle, opts) : gunSightCamera(state, opts);
    return null;
}

/** The camera's own axes: { f (forward), r (right), u (up) }, orthonormal. */
export function basisOf(cam) {
    const f = unit(sub(cam.target, cam.eye)), r = unit(cross(f, cam.up)), u = cross(r, f);
    return { f, r, u };
}

/** A world point on the camera's picture of w x h pixels (row 0 at the top): [x, y, depth] or null when it is behind the eye (within 0.1 m of its plane). Depth is the distance along the view direction. */
export function project(cam, p, W, H) {
    const { f, r, u } = basisOf(cam), d = sub(p, cam.eye), z = dot(d, f);
    if (!(z > 0.1)) return null;
    const t = Math.tan(cam.fov / 2), aspect = W / H, x = dot(d, r) / (z * t * aspect), y = dot(d, u) / (z * t);
    return [(x * 0.5 + 0.5) * W, (1 - (y * 0.5 + 0.5)) * H, z];
}

/**
 * What the gunner's window draws over the picture: where the gun points on the screen (`bore`, the centre of a sight that looks along the gun), where a round fired now would be at the target's range (`pipper`, the point on the
 * gun's line that far out, dropped by the round's fall), and where the target will be when it gets there (`lead`, flightGuns.aimSolution's point), each as [x, y] pixels or null when off the picture or behind the eye; with the
 * range in metres and the time of flight in seconds (null when no round can reach the target). `muzzle` is { pos, vel, dir } as flightGuns.muzzleOf; `target` is { pos, vel }.
 */
export function gunsight(cam, muzzle, target, W, H, spec = G.GUN) {
    const bore = project(cam, add(cam.eye, unit(sub(cam.target, cam.eye)), 100), W, H);
    const out = { bore: bore && [bore[0], bore[1]], pipper: null, lead: null, range: null, tof: null, onScreen: false };
    if (!target) return out;
    const sol = G.aimSolution(muzzle, target.pos, target.vel, spec);
    out.range = norm(sub(target.pos, muzzle.pos));
    if (!sol) return out;
    out.tof = sol.t;
    const t = sol.t, v = add(muzzle.vel, muzzle.dir, spec.muzzleSpeed), there = [muzzle.pos[0] + v[0] * t, muzzle.pos[1] + v[1] * t, muzzle.pos[2] + v[2] * t - 0.5 * G.GRAVITY * t * t];
    const pip = project(cam, there, W, H), lead = project(cam, sol.point, W, H);
    out.pipper = pip && [pip[0], pip[1]]; out.lead = lead && [lead[0], lead[1]];
    out.onScreen = !!(lead && lead[0] >= 0 && lead[0] <= W && lead[1] >= 0 && lead[1] <= H);
    return out;
}

/** A policy's activations on one feature vector: { input, hidden (the state before the output stage), output (the four controls in [-1, 1]: pitch, roll, yaw, and throttle mapped from 0..1) }. `policy` is pilotFlightPolicy or pilotFlightMlp. */
export function pilotActivations(policy, w, x) {
    const layers = policy.layersOf(w), input = Float32Array.from(x);
    let hidden = input;
    for (let i = 0; i < layers.length - 1; i++) hidden = mlpLayerCpu(layers[i], hidden, 1);
    const c = policy.forward(w, input);
    return { input, hidden, output: Float32Array.of(c.pitch, c.roll, c.yaw, c.throttle * 2 - 1) };
}

/** The rows the brain window draws: one per layer, in the shape carViews.drawBrainPanel takes ({ who, layer, names, values }). A pilot with no network (the PD autopilot) has features and outputs only. */
export function pilotRows({ who = "pilot", act, featureNames, outputNames }) {
    const rows = [{ who, layer: "features", names: featureNames, values: Array.from(act.input) }];
    if (act.hidden && act.hidden !== act.input) rows.push({ who, layer: "hidden", names: Array.from(act.hidden, (_, i) => "h" + i), values: Array.from(act.hidden) });
    rows.push({ who, layer: "outputs", names: outputNames, values: Array.from(act.output) });
    return rows;
}

/** The label under a window: the craft, the view, and what the view costs. */
export function windowLabel(i, name, view, draw = VIEW_DRAW) {
    const what = { plane: "from outside, behind and above", pilot: "the pilot's seat", gunner: "the gun's sight, the lead pip", brain: "the network, live" }[view] || view;
    return `${i + 1}. ${name} -- ${view} (${what}) -- click to switch`;
}

export function reportLines() {
    const s = { pos: [0, 0, 300], vel: [45, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0] }, p = pilotCamera(s), pl = planeCamera(s), at = project(pl, s.pos, VIEW_DRAW.width, VIEW_DRAW.height);
    return ["[flightViews] a view window per craft: plane, pilot, gunner, brain -- cameras and projection as pure functions of the craft's state",
        `  a level craft heading 0: the chase eye is ${pl.eye.map((v) => v.toFixed(0)).join(", ")}, the pilot's ${p.eye.map((v) => v.toFixed(2)).join(", ")} looking along +X; the craft is at (${at[0].toFixed(0)}, ${at[1].toFixed(0)}) of ${VIEW_DRAW.width} x ${VIEW_DRAW.height} in the chase window`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
