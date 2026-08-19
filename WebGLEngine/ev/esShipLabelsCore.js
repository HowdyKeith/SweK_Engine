// WebGLEngine/ev/esShipLabelsCore.js — v3831 (Long Silence, Slug ship labels — the pure core)
//
// THE PART OF THE SHIP-LABEL PASS WITH NO GL AND NO THREE.JS IN IT, so a gate can pin the one thing that can go
// silently wrong: the map from a ship's world position to a pixel on the label overlay, and the placement of the
// laid-out glyphs at that pixel. es-box3d-fly3d.html draws the ships with Three.js; this projects the SAME world
// point the hull uses through the SAME camera and hands back a screen pixel, a depth (for the size ladder) and a
// visibility flag. The Three.js side (ev/esShipLabels.js) does the atlas, the overlay canvas and the Slug draw;
// it imports these and does nothing to the numbers itself.
//
// Conventions, fixed here once:
//   matrix order  : column-major, 16 floats, exactly THREE.Matrix4.elements (so a page passes
//                   camera.projectionMatrix.elements and camera.matrixWorldInverse.elements straight in)
//   clip -> ndc   : divide by clip.w; a point with clip.w <= 0 is AT OR BEHIND the camera and is NOT drawn --
//                   dropping that test is the classic bug that paints a label for a ship behind you at a
//                   mirrored on-screen position, so it is a named, gated property here.
//   screen        : (0,0) top-left, y DOWN (canvas convention), device pixels

// Column-major 4x4 (THREE.Matrix4.elements order) times a vec4. Returns {x,y,z,w}.
export function mulMat4Vec4(m, x, y, z, w = 1) {
    return {
        x: m[0] * x + m[4] * y + m[8]  * z + m[12] * w,
        y: m[1] * x + m[5] * y + m[9]  * z + m[13] * w,
        z: m[2] * x + m[6] * y + m[10] * z + m[14] * w,
        w: m[3] * x + m[7] * y + m[11] * z + m[15] * w,
    };
}

// Project a world point through view then projection onto a vw x vh viewport in device pixels.
// Returns { visible, x, y, w, ndcZ }:
//   visible  false when the point is at/behind the camera (clip.w <= 0) OR outside the [-1,1] ndc box
//   x, y     device-pixel position (top-left origin, y down); meaningful only when clip.w > 0
//   w        clip.w == eye distance in front of the camera, the input to the size ladder
//   ndcZ     normalised depth, kept for a caller that wants to sort labels front-to-back
export function projectToScreen(proj, view, wx, wy, wz, vw, vh) {
    const e = mulMat4Vec4(view, wx, wy, wz, 1);        // eye space
    const c = mulMat4Vec4(proj, e.x, e.y, e.z, e.w);   // clip space
    if (!(c.w > 0)) return { visible: false, x: 0, y: 0, w: c.w, ndcZ: 0 };
    const nx = c.x / c.w, ny = c.y / c.w, nz = c.z / c.w;
    const onScreen = nx >= -1 && nx <= 1 && ny >= -1 && ny <= 1;
    return {
        visible: onScreen,
        x: (nx * 0.5 + 0.5) * vw,
        y: (0.5 - ny * 0.5) * vh,   // ndc +y (up) -> smaller screen y (up). The y-flip a plant would remove.
        w: c.w,
        ndcZ: nz,
    };
}

// The label a ship shows: its class name and an integrity percent from shield+armor over their maxima. When the
// maxima are unknown the honest label is the name alone rather than a fabricated 0% or 100%.
export function labelText(ship) {
    const name = (ship && (ship.name || (ship.cls && ship.cls.name))) || "Ship";
    const cur = num(ship && ship.shield) + num(ship && ship.armor);
    const max = num(ship && ship.maxShield) + num(ship && ship.maxArmor);
    if (!(max > 0)) return name;
    const pct = Math.max(0, Math.min(100, Math.round((100 * cur) / max)));
    return name + " " + pct + "%";
}
function num(v) { return typeof v === "number" && isFinite(v) ? v : 0; }

// The size ladder — the whole reason Slug is worth its per-fragment cost here instead of a bitmap font. The SAME
// packed atlas draws a near ship's label large and a far one small with no re-bake, because there is no baked
// resolution. size = ref * (refW / w), clamped: it equals `ref` at w == refW, is monotone DECREASING in w, and
// clamps flat past the ends so a ship in your face or far across the map still reads.
export function sizeForDepth(w, opts = {}) {
    const ref  = opts.ref  === undefined ? 22 : opts.ref;    // px at the reference distance
    const refW = opts.refW === undefined ? 60 : opts.refW;   // eye distance that draws at `ref`
    const min  = opts.min  === undefined ? 9  : opts.min;
    const max  = opts.max  === undefined ? 40 : opts.max;
    if (!(w > 0)) return min;
    return Math.max(min, Math.min(max, (ref * refW) / w));
}

// Rows of an orthographic matrix (the (m.x, m.y, -, m.w) form the Slug shader reads) that maps the label's OWN
// pixel coordinates onto the viewport with its origin (pen x = 0, baseline y = 0) placed at screen pixel
// (ox, oy). Font-space y is UP, so row1.y is POSITIVE: ascenders rise above the baseline on screen. A negative
// row1.y would flip the type upside down, which is exactly the plant the gate rules out.
//   local (0,0)            -> clip (row0.w, row1.w)
//   local x increasing     -> clip x increasing   (text runs left-to-right)
//   local y increasing (up)-> clip y increasing   (ascenders go up)
export function placeOrthoRows(vw, vh, ox, oy) {
    return new Float32Array([
        2 / vw, 0, 0, (2 / vw) * ox - 1,
        0, 2 / vh, 0, 1 - (2 / vh) * oy,
        0, 0, 0, 0,
        0, 0, 0, 1,
    ]);
}
