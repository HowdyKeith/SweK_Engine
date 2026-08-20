// render/depthProject.js
//
// THE ANSWER KEY FOR COMPOSITING (v3063), built before the compositing.
//
// v3045 said plainly that the ray marcher does not composite with the raster pass -- no depth exchange, so it
// draws the region alone -- and called that "its own round with its own answer key". This is that answer key.
// The round after this one can wire gl_FragDepth knowing what the right number is; doing it the other way round
// means eyeballing whether voxels look correctly buried in terrain, which is not a check.
//
// THE CLASSIC BUG THIS EXISTS TO CATCH. A marcher knows t, the distance ALONG THE RAY to the hit. Depth buffers
// store a function of the VIEW-SPACE Z -- the distance along the camera's forward axis. Those are the same
// number only for the pixel dead centre of the screen. Write t and everything bows toward the camera as you look
// away from centre, so voxels at the screen edge sink into terrain they should sit in front of. It renders. It
// looks almost right. It is wrong by a factor of 1/cos(angle from centre), which at a 60-degree field of view is
// about 15% at the corners.
//
//     zView = t * dot(rayDir, camForward)      <- the correction, one dot product
//
// The gate measures that error rather than describing it: zero on axis, growing with angle, and the corner value
// stated as a number.
//
// DEPTH IS NOT LINEAR, and that is the second thing a compositing round needs to know before it starts. The
// standard perspective mapping crowds almost all precision near the near plane. This module reports how many
// distinct binary24 depth values remain in the far half of the range, because "the depth test is flickering out
// there" is otherwise diagnosed as a bug in the marcher.
//
// Browser-safe: no imports, no DOM, no node builtins.

const f = Math.fround;

/** View-space depth (positive, along camera forward) -> NDC z in [-1, 1], the standard GL perspective mapping. */
export function viewToNdcDepth(zView, near, far) {
    if (!(zView > 0)) return -1;
    return ((far + near) / (far - near)) + ((-2 * far * near) / ((far - near) * zView));
}

/** NDC z -> the [0,1] value gl_FragDepth expects (glDepthRange defaults). */
export const ndcToWindow = (ndc) => (ndc + 1) * 0.5;
export const windowToNdc = (w) => w * 2 - 1;

/** Inverse of viewToNdcDepth, for round-tripping. */
export function ndcDepthToView(ndc, near, far) {
    return (2 * far * near) / ((far + near) - ndc * (far - near));
}

/**
 * THE FUNCTION COMPOSITING NEEDS. Given a marcher's hit distance t along a ray, return the window depth to write.
 *
 * rayDir and camFwd must both be unit vectors. The dot product is the whole correction: it converts distance
 * ALONG THE RAY into distance along the CAMERA AXIS, which is what the depth buffer is a function of.
 */
export function hitDepth(t, rayDir, camFwd, near, far) {
    const cos = rayDir[0] * camFwd[0] + rayDir[1] * camFwd[1] + rayDir[2] * camFwd[2];
    const zView = t * cos;
    if (!(zView > 0)) return { ok: false, reason: "hit is behind the camera plane (zView=" + zView + ")" };
    if (zView < near) return { ok: false, reason: "hit is nearer than the near plane; the raster pass would clip it too" };
    return { ok: true, zView, cos, ndc: viewToNdcDepth(zView, near, far), depth: ndcToWindow(viewToNdcDepth(zView, near, far)) };
}

/** The bug, kept callable so the gate can MEASURE the difference instead of asserting it exists. */
export function hitDepthWrong(t, rayDir, camFwd, near, far) {
    void rayDir; void camFwd;
    return { zView: t, depth: ndcToWindow(viewToNdcDepth(t, near, far)) };
}

/**
 * How much precision survives out there. Walks the view range and counts DISTINCT binary24 window-depth values
 * (24-bit is the common depth buffer), reporting the split between the near and far halves.
 * Returned, never asserted: it is a property of the projection, not of this code.
 */
export function depthResolution(near, far, samples = 20000) {
    const q = (z) => Math.round(ndcToWindow(viewToNdcDepth(z, near, far)) * 16777215);
    const nearHalf = new Set(), farHalf = new Set();
    const mid = (near + far) / 2;
    for (let i = 0; i <= samples; i++) {
        const z = near + (far - near) * (i / samples);
        (z < mid ? nearHalf : farHalf).add(q(z));
    }
    return {
        nearHalfCodes: nearHalf.size, farHalfCodes: farHalf.size,
        ratio: nearHalf.size / Math.max(farHalf.size, 1),
        midDepth: ndcToWindow(viewToNdcDepth(mid, near, far)),
    };
}

/** Single-precision mirror, since the shader computes this in highp float (see voxel/ddaFloat32.js, v3062). */
export function hitDepth32(t, rayDir, camFwd, near, far) {
    const cos = f(f(f(f(rayDir[0]) * f(camFwd[0])) + f(f(rayDir[1]) * f(camFwd[1]))) + f(f(rayDir[2]) * f(camFwd[2])));
    const zView = f(f(t) * cos);
    if (!(zView > 0)) return { ok: false, reason: "behind the camera plane" };
    const A = f(f(far + near) / f(far - near));
    const B = f(f(-2 * far * near) / f(f(far - near) * zView));
    const ndc = f(A + B);
    return { ok: true, zView, cos, ndc, depth: f(f(ndc + 1) * 0.5) };
}
