// WebGLEngine/render/sceneLabels.mjs -- v4477 (the 3D orrery, step 5)
//
// *** WHICH RECORDS OF A GPU-DRIVEN SCENE GET A LABEL, AND WHERE ON THE SCREEN. *** Pure: records in, a list of
// screen-space labels out, nothing drawn. orrery-gpu.html hands the list to render/slugDevice.mjs batches (the
// device text of v4460, first consumed by ev/esShipLabels.js at v4463) and draws them in a begin() frame over the
// scene, on WebGPU or WebGL2 alike.
//
// THE RULE IS THE CULL'S OWN. A record is "near" when its angular metric -- radius over distance to the eye, the
// number render/gpuDriven.mjs cullLodCpuOne computes -- reaches the threshold the scene's near rung switches on.
// So the set of labelled bodies IS the set drawn at the near level of detail, and the gate holds the two counts
// equal on the cull's own twin rather than agreeing on a second rule. A picked record is labelled whatever its
// size, because the pointer is on it.
//
// The projection is ev/esShipLabelsCore.js projectToScreen, the same function the ship labels use, so a label sits
// where that module puts one: above the body by most of the text's height, centred on its x. A record behind the
// camera or outside the NDC box is not labelled (projectToScreen's `visible`); the cull tests a SPHERE against the
// frustum and this tests a POINT, so a body whose centre is just off-screen is drawn without a label -- stated,
// and measured in the gate at the edge rather than assumed away.
//
// NOT CLAIMED: collision between labels, a leader line, fading with distance.
"use strict";
import { projectToScreen, placeOrthoRows } from "../ev/esShipLabelsCore.js";

export { placeOrthoRows };
/** The label's text size in device pixels, and the characters the atlas must carry for the orrery's names. */
export const LABEL_PX = 14;
export const LABEL_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 %#.-_/(),";

/** The cull's angular metric for one record: radius over distance to the eye. */
export function metricOf(records, i, eye) {
    const x = records[i * 4], y = records[i * 4 + 1], z = records[i * 4 + 2], r = records[i * 4 + 3];
    const d = Math.max(Math.hypot(x - eye[0], y - eye[1], z - eye[2]), 1e-6);
    return r / d;
}

/**
 * The labels for a frame.
 * @param records  Float32Array of vec4 (x, y, z, radius) -- the scene's records at this time (the twin's, or a readback)
 * @param names    one per record
 * @param o.proj, o.view   the frame's matrices (column-major, gpuDriven's)
 * @param o.eye            the camera's eye
 * @param o.width, o.height   the viewport in device pixels
 * @param o.count          how many records to consider (default all)
 * @param o.kinds          optional per-record kind; only records of kind `o.kind` (default 0, a body) are labelled by nearness
 * @param o.threshold      the near rung's metric -- labelled when metric >= threshold
 * @param o.picked         a record id labelled regardless of its size or kind (null for none)
 * @param o.max            at most this many labels, the largest metrics first, the picked one always kept
 * @returns [{ id, name, sx, sy, metric, w, picked }]  sorted largest metric first
 */
export function labelsFor(records, names, { proj, view, eye, width, height, count = null, kinds = null, kind = 0, threshold = 0, picked = null, max = 24, px = LABEL_PX } = {}) {
    const n = count == null ? records.length / 4 : Math.min(count, records.length / 4);
    const out = [];
    for (let i = 0; i < n; i++) {
        const isPicked = picked != null && i === picked;
        if (!isPicked && kinds && kinds[i] !== kind) continue;
        const metric = metricOf(records, i, eye);
        if (!isPicked && !(metric >= threshold)) continue;
        const p = projectToScreen(proj, view, records[i * 4], records[i * 4 + 1], records[i * 4 + 2], width, height);
        if (!p.visible) continue;
        // the body's projected radius in pixels, from the metric and the projection's focal length (proj[5] = f = 1/tan(fov/2))
        const rpx = metric * proj[5] * height / 2;
        out.push({ id: i, name: names ? String(names[i] == null ? i : names[i]) : String(i), sx: p.x, sy: p.y - rpx - px * 0.35, metric, w: p.w, picked: isPicked });
    }
    out.sort((a, b) => (b.picked - a.picked) || (b.metric - a.metric) || (a.id - b.id));
    return max != null && out.length > max ? out.slice(0, max) : out;
}

/** Where a batch's origin goes for a label: centred on sx, its baseline above sy by most of its height (the ship labels' placement). */
export function rowsFor(label, laidWidth, width, height, px = LABEL_PX) {
    return placeOrthoRows(width, height, label.sx - laidWidth / 2, label.sy - px * 0.9);
}
