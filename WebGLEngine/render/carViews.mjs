// WebGLEngine/render/carViews.mjs -- v4589 (task 78): a view window per car -- first person, the turret's sight, the brain
//
// Keith asked for a window per car that a click switches between First Person, Turret view and GPU Brain view. The race pages
// had ONE inline orbit camera each and no second viewport anywhere on the device path (gl.viewport / scissor exist only in the
// legacy voxelrenderer's TV wall); gfx/device.js has had frame({ target }) since v4318 -- a whole frame drawn into a texture on
// both backends -- and frame({ read }) hands the bytes back, row 0 at the top on both. So a window is a small render target the
// SAME scene is drawn into with that car's camera, read back and put into a small 2D canvas beside the main one; nothing is
// drawn twice into one canvas and no new shader is written. The third view is not a camera at all: the car's two policies --
// the driver (brain/drivePolicy.mjs) and the gunner (brain/gunnerPolicy.mjs) -- run through the kernel's f32 twin layer by
// layer, and their features, hidden activations and outputs are drawn as bars on the 2D canvas, live, for the car in that
// window. That IS the GPU Brain's view of the race: the numbers the MLP layer computes for this car this tick.
//
// The readback is the cost, and it is said plainly: a 240 x 160 target per window, refreshed every VIEW_DRAW.refreshEvery main
// frames, is a few thousand pixels through mapAsync on WebGPU or readPixels on WebGL2 -- not the main canvas's rate, and the
// window says so in its label. The cameras are pure functions of the pose (and the turret) held headless by the gate.
"use strict";
import { rotateQ } from "./voxelBodies.mjs";
import { muzzle } from "../physics/turret.mjs";
import { mlpLayerCpu } from "./brainTsl.mjs";

export const VIEWS = Object.freeze(["first-person", "turret", "brain"]);
export const nextView = (v) => VIEWS[(VIEWS.indexOf(v) + 1) % VIEWS.length];
export const VIEW_DRAW = Object.freeze({
    width: 240, height: 160, fov: 1.1, near: 0.3, far: 600,
    seat: Object.freeze([0.35, 0.95, 0.4]),     // the driver's eye in the chassis frame: right of centre, above the roof line, forward of the axle
    ahead: 12,                                  // metres ahead the first-person camera looks
    turretUp: 0.25, turretBack: 0.15,           // the sight sits a little above and behind the pivot, looking along the barrel
    refreshEvery: 4,                            // main frames between window refreshes
    clear: Object.freeze([0.03, 0.05, 0.08, 1]),
});

const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

/** The first-person camera: the driver's seat, looking `ahead` metres along the chassis forward. */
export function firstPersonCamera(pose, G, { aspect = VIEW_DRAW.width / VIEW_DRAW.height, draw = VIEW_DRAW } = {}) {
    const eye = add(pose.pos, rotateQ(pose.quat, draw.seat)), forward = rotateQ(pose.quat, [0, 0, 1]), centre = add(eye, forward, draw.ahead);
    return { viewProj: G.multiply(G.perspective(draw.fov, aspect, draw.near, draw.far), G.lookAt(eye, centre)), eye, centre, forward };
}

/** The turret's sight: just above and behind the pivot, looking along the barrel. Turns with the turret and the car. */
export function turretCamera(pose, turret, G, { aspect = VIEW_DRAW.width / VIEW_DRAW.height, draw = VIEW_DRAW } = {}) {
    const mz = muzzle(pose, turret), up = rotateQ(mz.quat, [0, 1, 0]);
    const eye = add(add(mz.pivot, up, draw.turretUp), mz.dir, -draw.turretBack), centre = add(eye, mz.dir, draw.ahead);
    return { viewProj: G.multiply(G.perspective(draw.fov, aspect, draw.near, draw.far), G.lookAt(eye, centre)), eye, centre, forward: mz.dir };
}

/** The camera a view names, or null for the brain view (which is not a camera). */
export function cameraFor(view, pose, turret, G, opts) {
    if (view === "first-person") return firstPersonCamera(pose, G, opts);
    if (view === "turret") return turretCamera(pose, turret, G, opts);
    return null;
}

/** Project a world point through a column-major viewProj to pixels (row 0 at the top), or null behind the camera. */
export function projectTo(vp, p, W, H) {
    const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12], y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13], w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
    if (!(w > 0)) return null;
    return [(x / w * 0.5 + 0.5) * W, (1 - (y / w * 0.5 + 0.5)) * H];
}

/**
 * A policy's activations through the kernel's f32 twin: { input, hidden, output } for a module with layersOf(w) --
 * an N-stage sequence, not a fixed 2. `hidden` is the state right before the LAST stage (the output projection),
 * so a 2-stage policy (drivePolicy: encoder, decoder) reads exactly as before, and an N-stage one (gunnerPolicy's
 * encoder + weight-tied recurrent steps + decoder) reports the TRUE post-recurrence state that actually feeds the
 * decoder -- not the pre-recurrence value a hardcoded 2-layer read would have shown.
 */
export function activationsOf(policy, w, x) {
    const layers = policy.layersOf(w), input = Float32Array.from(x);
    let hidden = input;
    for (let i = 0; i < layers.length - 1; i++) hidden = mlpLayerCpu(layers[i], hidden, 1);
    const raw = mlpLayerCpu(layers[layers.length - 1], hidden, 1);
    return { input, hidden, output: Float32Array.from(raw, (v) => Math.tanh(v)) };
}

/** The rows the brain panel draws: one per layer per policy, each value already in [-1, 1] or scaled to it. */
export function brainRows({ driver = null, gunner = null } = {}) {
    const rows = [];
    const push = (who, act, names, outNames) => {
        if (!act) return;
        rows.push({ who, layer: "features", names, values: Array.from(act.input) });
        rows.push({ who, layer: "hidden", names: Array.from(act.hidden, (_, i) => "h" + i), values: Array.from(act.hidden) });
        rows.push({ who, layer: "outputs", names: outNames, values: Array.from(act.output) });
    };
    if (driver) push("driver", driver.act, driver.names, ["steer", "drive"]);
    if (gunner) push("gunner", gunner.act, gunner.names, ["yaw", "pitch", "fire", "drop", "ignite"]);   // v4590: the slick outputs
    return rows;
}

/** Draw the rows as bars on a 2D context of w x h: returns the number of bars drawn. A value's bar is signed about a centre line. */
export function drawBrainPanel(ctx, w, h, rows, { title = "" } = {}) {
    ctx.fillStyle = "#050805"; ctx.fillRect(0, 0, w, h);
    const rowH = Math.max(10, Math.floor((h - 14) / Math.max(1, rows.length))), pad = 46; let y = 12, bars = 0;
    ctx.font = "9px ui-monospace,Menlo,monospace"; ctx.fillStyle = "#9fb2d4"; ctx.fillText(title.slice(0, 40), 3, 9);
    for (const r of rows) {
        ctx.fillStyle = "#5f7aa0"; ctx.fillText(`${r.who[0]} ${r.layer}`, 3, y + rowH - 3);
        const n = r.values.length, bw = Math.max(2, Math.floor((w - pad - 4) / n) - 1), mid = y + rowH / 2;
        for (let i = 0; i < n; i++) {
            const v = Math.max(-1, Math.min(1, r.values[i] / (r.layer === "hidden" ? 2 : 1))), bh = Math.abs(v) * (rowH / 2 - 1), x = pad + i * (bw + 1);
            ctx.fillStyle = v >= 0 ? "#59d1ff" : "#f6a623"; ctx.fillRect(x, v >= 0 ? mid - bh : mid, bw, Math.max(1, bh)); bars++;
        }
        y += rowH;
    }
    return bars;
}

/** The label under a window: the car, the view, and what the view costs. */
export function windowLabel(i, name, view, draw = VIEW_DRAW) {
    return `${i + 1}. ${name} -- ${view}${view === "brain" ? " (the policies' activations, live)" : ` (${draw.width} x ${draw.height}, read back every ${draw.refreshEvery} frames)`} -- click to switch`;
}
