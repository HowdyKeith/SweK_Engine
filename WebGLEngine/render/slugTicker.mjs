// WebGLEngine/render/slugTicker.mjs -- v4497
//
// *** A 3-D TICKER OF SLUG GLYPHS AS BOX3D BODIES (task 43). *** Each inked glyph of a laid-out string becomes one
// rigid box in vendor/box3d (its half extents from the glyph's bbox at a world scale), dropped onto a floor and
// pushed along the ticker's axis; when a body passes the far end it is set back to the near end (swk_body_set_transform).
// Each glyph is one SlugDeviceBatch built at the ORIGIN (its quad centred), and each frame it is drawn with rows =
// P * V * B applied to (x, y, 0, 1) -- the body's transform B from box3d's [x, y, z, qx, qy, qz, qw], the camera's V and
// P as 4x4s here -- so a tumbling glyph is the projective case task 42 held (render/slugProjective.mjs) with a
// different matrix every frame and nothing new in the shader. The plumbing is pure and gated headless
// (tools/ship/slugTicker-selfcheck.mjs): the 4x4 helpers against hand cases, rowsFor against slugProjective's
// perspectiveRows for the same placement, the bodies' extents against the glyph bboxes, the world stepped in node
// through the same adapter shape as box3dLoader's handle with transforms finite and bodies at rest on the floor
// and the run deterministic (stateHash); then the page's frame on both backends against the perspective-correct
// model per body. slug-ticker.html is the page.
"use strict";
import { layoutText, buildVertices } from "../text/slugText.js";

/* ---------------------------------------------------------------------------------------------------------
 * 4x4 matrices, ROW-MAJOR as sixteen numbers: m[r * 4 + c]. Column vectors: v' = M v.
 * ------------------------------------------------------------------------------------------------------- */
export const mat4 = {
    identity: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    multiply(a, b) { const o = new Array(16); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { let s = 0; for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c]; o[r * 4 + c] = s; } return o; },
    apply(m, v) { const x = v[0], y = v[1], z = v[2], w = v.length > 3 ? v[3] : 1; return [m[0] * x + m[1] * y + m[2] * z + m[3] * w, m[4] * x + m[5] * y + m[6] * z + m[7] * w, m[8] * x + m[9] * y + m[10] * z + m[11] * w, m[12] * x + m[13] * y + m[14] * z + m[15] * w]; },
    translation: (x, y, z) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1],
    scale: (s) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1],
    /** from a position and a unit quaternion [qx, qy, qz, qw] -- box3d's transform order, three's Quaternion.set order */
    fromPosQuat(p, q) {
        const [x, y, z, w] = q, xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
        return [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy), p[0],
                2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx), p[1],
                2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy), p[2],
                0, 0, 0, 1];
    },
    perspective(fov, aspect, near, far) { const f = 1 / Math.tan(fov / 2); return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, -(far + near) / (far - near), -2 * far * near / (far - near), 0, 0, -1, 0]; },
    /** a camera at `eye` looking at `target` with `up`: the view matrix (world -> eye, -z forward) */
    lookAt(eye, target, up = [0, 1, 0]) {
        const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], norm = (v) => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; }, cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        const f = norm(sub(target, eye)), s = norm(cross(f, up)), u = cross(s, f);
        return [s[0], s[1], s[2], -dot(s, eye), u[0], u[1], u[2], -dot(u, eye), -f[0], -f[1], -f[2], dot(f, eye), 0, 0, 0, 1];
    },
};

/** the shader's rows from a 4x4 acting on (x, y, 0, 1): each row keeps (x, y, -, w) -- the z column is what a point on the z = 0 plane never sees */
export function rowsFor(M) { return new Float32Array([M[0], M[1], 0, M[3], M[4], M[5], 0, M[7], M[8], M[9], 0, M[11], M[12], M[13], 0, M[15]]); }

/* ---------------------------------------------------------------------------------------------------------
 * The bodies: one box per inked glyph, the glyph's quad centred at its body's origin
 * ------------------------------------------------------------------------------------------------------- */
export const TICKER = Object.freeze({
    text: "SweK 3D ticker Sphinx of black quartz 42", size: 0.22,   // the glyph quads are built at this size: one em is 0.22 world units
    depth: 0.05,                      // half thickness of a glyph box, world units
    speed: 1.2,                       // world units a second along +x, the conveyor's drive
    lane: 2.4,                        // the visible run on x is [-lane, +lane]; the loop is the longer of that and the string
    dropHeight: 0.6,                  // spawn height above the floor
    gravity: Object.freeze([0, -9.8, 0]),
    dt: 1 / 60, substeps: 4,
});

/**
 * Plan the glyph bodies from a layout: for each inked glyph the half extents [hx, hy, hz] (bbox halves at the size,
 * plus the ticker depth), the spawn position along x (glyph centre offset by the layout, from -lane), the batch's
 * one-glyph stream built with the quad CENTRED at the origin so the body transform places it.
 */
export function glyphBodies(font, entryFor, opts = {}) {
    const T = { ...TICKER, ...opts };
    const laid = layoutText(font, T.text, { size: T.size });
    const bodies = [];
    for (const g of laid.glyphs) {
        const e = entryFor(g.glyphIndex); if (!e || e.empty) continue;
        const bb = e.bbox, s = g.size;
        const cx = g.x + (bb.x0 + bb.x1) / 2 * s, cy = g.y + (bb.y0 + bb.y1) / 2 * s;
        const hx = (bb.x1 - bb.x0) / 2 * s, hy = (bb.y1 - bb.y0) / 2 * s;
        const built = buildVertices([{ ...g, x: -(bb.x0 + bb.x1) / 2 * s, y: -(bb.y0 + bb.y1) / 2 * s }], entryFor, { color: opts.color || [1, 1, 1, 1] });   // white unless told: the gate's key is coverage alone
        bodies.push({ codepoint: g.codepoint, glyphIndex: g.glyphIndex, half: [hx, hy, T.depth], centre: [cx, cy], built, quad: { x0: -hx, x1: hx, y0: -hy, y1: hy } });
    }
    // spawn positions: the glyph centres along x with the string starting at -lane, each above the floor by the drop; the loop
    // is the string's length plus a lane's breathing room, so the head never wraps into its own tail
    const loop = Math.max(2 * T.lane, laid.width * T.size + T.lane);
    for (const b of bodies) b.spawn = [-T.lane + b.centre[0], b.half[1] + T.dropHeight, 0];
    return { laid, bodies, plan: { ...T, loop } };
}

/* ---------------------------------------------------------------------------------------------------------
 * The world: an adapter over the wasm module's emscripten-shaped furniture (physics/box3d/box3dNode.mjs's mod()
 * in node, the browser loader's module in a page), call for call the subset of box3dLoader's handle the ticker uses
 * ------------------------------------------------------------------------------------------------------- */
export function worldFromModule(m, gravity = TICKER.gravity) {
    m._swk_world_create(gravity[0], gravity[1], gravity[2]);
    let xfPtr = 0, xfCap = 0, vPtr = 0, vCap = 0;
    return {
        addBox({ type = "dynamic", pos = [0, 0, 0], half = [0.5, 0.5, 0.5], density = 1 } = {}) {
            const t = type === "dynamic" ? 1 : type === "kinematic" ? 2 : 0;
            const i = m._swk_body_box(t, pos[0], pos[1], pos[2], half[0], half[1], half[2], density); if (i < 0) throw new Error("box3d: body limit reached"); return i;
        },
        setVelocity(i, v) { m._swk_body_set_velocity(i, v[0], v[1], v[2]); },
        setTransform(i, p, q = [0, 0, 0, 1]) { m._swk_body_set_transform(i, p[0], p[1], p[2], q[0], q[1], q[2], q[3]); },
        setFriction(i, mu) { if (m._swk_body_set_friction) m._swk_body_set_friction(i, mu); },
        step(dt = TICKER.dt, sub = TICKER.substeps) { m._swk_world_step(dt, sub); },
        bodyCount() { return m._swk_body_count(); },
        readTransforms() { const n = m._swk_body_count(), bytes = n * 7 * 4; if (bytes > xfCap) { if (xfPtr) m._free(xfPtr); xfPtr = m._malloc(bytes); xfCap = bytes; } m._swk_transforms(xfPtr); return new Float32Array(m.HEAPF32.buffer, xfPtr, n * 7).slice(); },
        readVelocities() { const n = m._swk_body_count(), bytes = n * 3 * 4; if (bytes > vCap) { if (vPtr) m._free(vPtr); vPtr = m._malloc(bytes); vCap = bytes; } m._swk_velocities(vPtr); return new Float32Array(m.HEAPF32.buffer, vPtr, n * 3).slice(); },
        stateHash() { return m._swk_state_hash() >>> 0; },
        destroy() { if (xfPtr) m._free(xfPtr); if (vPtr) m._free(vPtr); xfPtr = vPtr = 0; xfCap = vCap = 0; m._swk_world_destroy(); },
    };
}

/** build the ticker's world: a floor long enough for the loop and one box per glyph; returns { floor, ids } */
export function spawnTicker(world, bodies, plan) {
    const floor = world.addBox({ type: "static", pos: [0, -0.5, 0], half: [plan.loop + plan.lane, 0.5, 4] });
    const ids = bodies.map((b) => { const i = world.addBox({ type: "dynamic", pos: b.spawn, half: b.half, density: 1 }); world.setVelocity(i, [plan.speed, 0, 0]); return i; });
    return { floor, ids };
}

/**
 * One tick: the conveyor drives every body's x velocity to the ticker speed (y and z left to the solver, so drops and
 * collisions still tumble), the world steps, and any body past +lane is set back by the loop length keeping its height,
 * spin and orientation. Returns { xf, wrapped }.
 */
export function tickTicker(world, ids, plan) {
    const vel = world.readVelocities();
    for (const i of ids) world.setVelocity(i, [plan.speed, vel[i * 3 + 1], vel[i * 3 + 2]]);
    world.step(plan.dt, plan.substeps);
    const xf = world.readTransforms(); let wrapped = 0;
    for (const i of ids) { const o = i * 7; if (xf[o] > plan.lane) { world.setTransform(i, [xf[o] - plan.loop, xf[o + 1], xf[o + 2]], [xf[o + 3], xf[o + 4], xf[o + 5], xf[o + 6]]); wrapped++; } }
    return { xf: wrapped ? world.readTransforms() : xf, wrapped };
}

/** the camera and the per-body rows for one frame: P * V * B for each body's transform */
export function cameraFor(W, H, opts = {}) {
    const eye = opts.eye || [0, 0.9, 2.5], target = opts.target || [0, 0.15, 0];
    return mat4.multiply(mat4.perspective(opts.fov || 0.8, W / H, 0.1, 100), mat4.lookAt(eye, target));
}
export function bodyRows(PV, xf, i) { const o = i * 7; return rowsFor(mat4.multiply(PV, mat4.fromPosQuat([xf[o], xf[o + 1], xf[o + 2]], [xf[o + 3], xf[o + 4], xf[o + 5], xf[o + 6]]))); }
