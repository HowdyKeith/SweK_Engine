// tools/groundtruth/traceField.js
//
// SweK as a 4D ground-truth generator -- the inversion of a method like Trace Anything. That kind of model is handed a
// video and has to ESTIMATE where every point went in 3D over time, because it does not know the truth. SweK is a
// simulation: it KNOWS the truth exactly. So instead of estimating trajectory fields from pixels, SweK emits them. It
// builds a deterministic moving scene in which every point's 3D track is known to the bit, projects those tracks through
// a pinhole camera to the 2D observations an estimator would actually see, and keeps the hidden depth. An estimator gets
// the 2D observations and must recover the 3D tracks; SweK grades the recovery against its own exact answer. The point is
// the thing this domain almost never has: a benchmark whose ground truth is not itself an estimate.
//
// Deterministic from a seed and reproducible; it uses trig and sqrt (orbits and a camera basis), so it is gated, not in
// the cross-architecture fingerprint.

const TAU = Math.PI * 2;
export function makeRng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// A deterministic moving point cloud: each point orbits a base position and drifts, so its 3D track over the frames is a
// known curve, not noise.
export function makeScene(seed, { nPoints = 80, nFrames = 32 } = {}) {
    const rng = makeRng(seed), tracks = [];
    for (let p = 0; p < nPoints; p++) {
        const bx = rng() * 4 - 2, by = rng() * 4 - 2, bz = rng() * 3 - 1.5;
        const r = 0.3 + rng() * 1.2, ph = rng() * TAU, sp = 0.5 + rng() * 1.5;
        const dx = (rng() - 0.5) * 0.8, dy = (rng() - 0.5) * 0.8, dz = (rng() - 0.5) * 0.6;
        const track = [];
        for (let f = 0; f < nFrames; f++) {
            const t = f / nFrames, a = ph + sp * TAU * t;
            track.push([bx + r * Math.cos(a) + dx * t, by + r * Math.sin(a) + dy * t, bz + 0.4 * Math.sin(a * 0.5) + dz * t]);
        }
        tracks.push(track);
    }
    return { seed, nPoints, nFrames, tracks };
}

// An arithmetic-only variant of the scene: position is a polynomial in t (base + vel*t + acc*t*t), using only + - * / so
// the tracks are bit-identical on every architecture. This is the scene that gets fingerprinted; makeScene keeps its trig
// orbits for the livelier on-screen version. Projection and the camera basis use only arithmetic and sqrt, both correctly
// rounded under IEEE-754, so the whole emitted ground truth off this scene is the same to the bit on any box in the fleet.
export function makeSceneArith(seed, { nPoints = 64, nFrames = 24 } = {}) {
    const rng = makeRng(seed), tracks = [];
    for (let p = 0; p < nPoints; p++) {
        const bx = rng() * 4 - 2, by = rng() * 4 - 2, bz = rng() * 3 - 1.5;
        const vx = rng() - 0.5, vy = rng() - 0.5, vz = (rng() - 0.5) * 0.6;
        const ax = (rng() - 0.5) * 0.8, ay = (rng() - 0.5) * 0.8, az = (rng() - 0.5) * 0.4;
        const track = [];
        for (let f = 0; f < nFrames; f++) { const t = f / nFrames, t2 = t * t; track.push([bx + vx * t + ax * t2, by + vy * t + ay * t2, bz + vz * t + az * t2]); }
        tracks.push(track);
    }
    return { seed, nPoints, nFrames, tracks };
}

// A pinhole camera. project maps a world point to (u, v, depth); unproject inverts it exactly GIVEN the depth.
const _sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const _len = (v) => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);   // explicit sqrt (bit-identical cross-arch), unlike Math.hypot
const _norm = (v) => { const m = _len(v) || 1; return [v[0] / m, v[1] / m, v[2] / m]; };
const _cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const _dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function makeCam(eye = [6, 4, 5], target = [0, 0, 0], up = [0, 0, 1], cx = 520, cy = 360, f = 280) {
    const fwd = _norm(_sub(target, eye)), right = _norm(_cross(fwd, up)), camUp = _cross(right, fwd);
    return { eye, fwd, right, camUp, cx, cy, f };
}
export const CAM = makeCam();

export function project(pt, cam = CAM) {
    const d = _sub(pt, cam.eye), zc = _dot(d, cam.fwd);
    return { u: cam.f * _dot(d, cam.right) / zc + cam.cx, v: cam.f * _dot(d, cam.camUp) / zc + cam.cy, depth: zc };
}
export function unproject(u, v, depth, cam = CAM) {
    const xc = (u - cam.cx) * depth / cam.f, yc = (v - cam.cy) * depth / cam.f, zc = depth;
    return [cam.eye[0] + xc * cam.right[0] + yc * cam.camUp[0] + zc * cam.fwd[0],
            cam.eye[1] + xc * cam.right[1] + yc * cam.camUp[1] + zc * cam.fwd[1],
            cam.eye[2] + xc * cam.right[2] + yc * cam.camUp[2] + zc * cam.fwd[2]];
}

// Deterministic occluders: a few drifting spheres that block the points behind them, so a track disappears when a solid
// gets between it and the camera -- the appearing-and-vanishing a real estimator has to survive.
export function makeOccluders(seed, nFrames = 32) {
    const rng = makeRng((seed ^ 0x9e3779b9) >>> 0), occ = [], count = 2 + (rng() * 2 | 0);
    for (let i = 0; i < count; i++) {
        occ.push({ base: [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1], drift: [(rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5, 0], r: 0.55 + rng() * 0.7 });
    }
    return occ;
}
function _occAt(o, f, nFrames) { const t = f / nFrames; return { c: [o.base[0] + o.drift[0] * t, o.base[1] + o.drift[1] * t, o.base[2] + o.drift[2] * t], r: o.r }; }

// Is pt visible from the camera at frame f -- i.e. does no occluder sphere sit between the eye and the point along the ray?
export function visibleAt(pt, occluders, f, nFrames, cam = CAM) {
    const dir = _sub(pt, cam.eye), distP = _len(dir) || 1e-9;
    const d = [dir[0] / distP, dir[1] / distP, dir[2] / distP];
    for (const o of occluders) {
        const s = _occAt(o, f, nFrames), m = _sub(cam.eye, s.c);
        const b = _dot(m, d), disc = b * b - (_dot(m, m) - s.r * s.r);
        if (disc < 0) continue;
        const t0 = -b - Math.sqrt(disc);              // ray entry into the sphere
        if (t0 > 1e-4 && t0 < distP - 1e-3) return false;  // solid sits in front of the point
    }
    return true;
}

// The emitted benchmark: the exact 3D tracks, the 2D observations an estimator sees, and the hidden depth (the answer to
// the ambiguity the estimator must resolve).
export function groundTruth(scene, cam = CAM, occluders = null) {
    const obs2d = [], depth = [], visible = occluders ? [] : null;
    for (let p = 0; p < scene.tracks.length; p++) {
        const tr = scene.tracks[p], o = [], dz = [], vs = occluders ? [] : null;
        for (let f = 0; f < tr.length; f++) {
            const pr = project(tr[f], cam); o.push([pr.u, pr.v]); dz.push(pr.depth);
            if (occluders) vs.push(visibleAt(tr[f], occluders, f, scene.nFrames, cam));
        }
        obs2d.push(o); depth.push(dz); if (occluders) visible.push(vs);
    }
    return { nPoints: scene.nPoints, nFrames: scene.nFrames, tracks3d: scene.tracks, obs2d, depth, visible };
}

// Render each frame to a depth raster by splatting the solid-visible points into a z-buffer. Two things fall out of one
// pass: the actual frame an estimator would consume (a depth image), and point-vs-point self-occlusion -- a point whose
// pixel is claimed by a nearer splat is behind a closer one, exactly the way a dense surface hides what is behind it. So
// the total visibility an estimator faces is a solid in the way OR a nearer point over the top.
export function renderFrames(scene, occluders = null, cam = CAM, { W = 128, H = 80, splatR = 2 } = {}) {
    const gt = groundTruth(scene, cam, occluders);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const tr of gt.obs2d) for (const [u, v] of tr) { if (u < minU) minU = u; if (u > maxU) maxU = u; if (v < minV) minV = v; if (v > maxV) maxV = v; }
    const rU = (maxU - minU) || 1, rV = (maxV - minV) || 1, mg = splatR + 2;
    const mapX = (u) => Math.round(mg + (u - minU) / rU * (W - 2 * mg));
    const mapY = (v) => Math.round(mg + (v - minV) / rV * (H - 2 * mg));
    const frames = [], renderedVisible = Array.from({ length: scene.nPoints }, () => []);
    for (let f = 0; f < scene.nFrames; f++) {
        const zbuf = new Float32Array(W * H).fill(Infinity), owner = new Int32Array(W * H).fill(-1);
        for (let p = 0; p < scene.nPoints; p++) {
            if (occluders && gt.visible && !gt.visible[p][f]) continue;   // hidden behind a solid: not drawn
            const px = mapX(gt.obs2d[p][f][0]), py = mapY(gt.obs2d[p][f][1]), z = gt.depth[p][f];
            for (let dy = -splatR; dy <= splatR; dy++) for (let dx = -splatR; dx <= splatR; dx++) {
                if (dx * dx + dy * dy > splatR * splatR) continue;
                const x = px + dx, y = py + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
                const i = y * W + x; if (z < zbuf[i]) { zbuf[i] = z; owner[i] = p; }
            }
        }
        frames.push(zbuf);
        for (let p = 0; p < scene.nPoints; p++) {
            const i = mapY(gt.obs2d[p][f][1]) * W + mapX(gt.obs2d[p][f][0]);
            const solidVisible = !occluders || !gt.visible || gt.visible[p][f];
            renderedVisible[p].push(solidVisible && owner[i] === p);   // survived the z-test at its own centre
        }
    }
    return { W, H, nFrames: scene.nFrames, frames, renderedVisible };
}

// Export the ground truth in the shape a method like Trace Anything speaks: a trajectory field of 3D control points over
// time, plus a per-point-per-frame confidence -- except here the control points are exact and the confidence is the TRUE
// visibility (1 where the camera really saw the point, 0 where a solid or a nearer point hid it). That is precisely the
// target such a model is trying to produce, so its own output.pt can be laid against this and scored. The camera goes
// along so their viewer can place it.
export function exportTraceAnything(scene, occluders = null, cam = CAM) {
    const gt = groundTruth(scene, cam, occluders), rend = renderFrames(scene, occluders, cam);
    const confidence = [];
    for (let p = 0; p < scene.nPoints; p++) { const row = []; for (let f = 0; f < scene.nFrames; f++) row.push(rend.renderedVisible[p][f] ? 1 : 0); confidence.push(row); }
    return {
        format: "trace-anything-compatible/v1",
        note: "SweK ground truth as a trajectory field. control_points are the EXACT 3D tracks; confidence is the true visibility (1 = the camera saw it, 0 = occluded by a solid or a nearer point). Maps to Trace Anything output.pt: control_points -> 3D control points, confidence -> confidence maps. observations_2d is the estimator's input.",
        nPoints: scene.nPoints, nFrames: scene.nFrames,
        control_points: gt.tracks3d,
        confidence,
        observations_2d: gt.obs2d,
        camera: { intrinsics: { f: cam.f, cx: cam.cx, cy: cam.cy }, extrinsics: { eye: cam.eye, forward: cam.fwd, right: cam.right, up: cam.camUp } },
    };
}

// Score a method's estimated control points against a SweK export, over the points the camera actually saw.
export function scoreTraceAnythingOutput(estControlPoints, exportObj) {
    const vis = exportObj.confidence.map((row) => row.map((c) => c > 0.5));
    return scoreEstimate(estControlPoints, exportObj.control_points, vis);
}

// Grade an estimated set of 3D tracks against the truth: the standard 3D end-point error, plus how much of it lands close.
// If a visibility mask is given, also report the error over only the points the camera could actually see.
export function scoreEstimate(estTracks, truthTracks, visible = null) {
    const errs = [], visErrs = []; let visCount = 0;
    for (let p = 0; p < truthTracks.length; p++) for (let f = 0; f < truthTracks[p].length; f++) {
        const e = estTracks[p][f], t = truthTracks[p][f];
        const ex = e[0]-t[0], ey = e[1]-t[1], ez = e[2]-t[2], d = Math.sqrt(ex*ex + ey*ey + ez*ez);
        errs.push(d);
        if (visible && visible[p][f]) { visErrs.push(d); visCount++; }
    }
    errs.sort((a, b) => a - b);
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    const within = (thr) => errs.filter((e) => e <= thr).length / errs.length;
    const out = { epe: mean, median: errs[Math.floor(errs.length / 2)], within01: within(0.1), within05: within(0.5), n: errs.length };
    if (visible) { out.epeVisible = visErrs.length ? visErrs.reduce((a, b) => a + b, 0) / visErrs.length : 0; out.visibleFrac = visCount / errs.length; }
    return out;
}
