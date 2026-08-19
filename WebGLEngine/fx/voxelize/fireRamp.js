// fx/voxelize/fireRamp.js -- the temperature ramp, in one place.
//
// This started as a tidy-up of "lava is written three times" and the inventory corrected the claim, which is worth
// recording because it changes what the right fix is:
//
//   * blobulator.html and box3d-blobs.html carried BYTE-IDENTICAL copies of this six-stop ramp. That is the real
//     duplication, and folding it costs nothing visually because there was never any difference to lose.
//   * firePalette (fx/voxelize/pageVoxels.js) is NOT a third copy. It is a different function with a different
//     meaning: an ASH ramp over burn progress, running fresh [1.00,0.85,0.35] -> spent grey [0.22,0.20,0.20]. It
//     belongs to the burn simulation and is left exactly alone.
//
// This one is temperature: cold [0.06,0,0] through dark red, red, orange, yellow, to white hot [1,1,0.86]. Six stops
// against the ash ramp's three, and it carries both ends a real fire has -- black when there is no heat, white when
// there is too much. That is why the fold promotes it rather than demoting it.
"use strict";
const RAMP = [[0.0, 0.06, 0.0, 0.0], [0.22, 0.55, 0.04, 0.0], [0.45, 1.0, 0.22, 0.0], [0.68, 1.0, 0.55, 0.08], [0.85, 1.0, 0.82, 0.32], [1.0, 1.0, 1.0, 0.86]];

// h: 0 = cold, 1 = white hot. `out` is optional so the hot paths can avoid allocating per vertex.
function blackbodyRamp(h, out) {
    const o = out || [0, 0, 0];
    let x = h; if (!(x > 0)) x = 0; else if (x > 1) x = 1;
    for (let i = 0; i < RAMP.length - 1; i++) {
        const a = RAMP[i], b = RAMP[i + 1];
        if (x <= b[0]) { const t = (x - a[0]) / ((b[0] - a[0]) || 1);
            o[0] = a[1] + (b[1] - a[1]) * t; o[1] = a[2] + (b[2] - a[2]) * t; o[2] = a[3] + (b[3] - a[3]) * t; return o; }
    }
    o[0] = 1; o[1] = 1; o[2] = 0.86; return o;
}
export { blackbodyRamp, RAMP };
