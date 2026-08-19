import type { Camera, Ray, Vec2, Vec3 } from "./types.js";
export interface CameraFrame {
    right: Vec3;
    up: Vec3;
    /** forward = from eye toward target (the view direction) */
    forward: Vec3;
}
export declare function cameraFrame(cam: Camera): CameraFrame;
/** 3×4 projection matrix (row-major, 12 entries). */
export type Proj = readonly number[];
/** Build the world→screen 3×4 projection matrix for the camera. */
export declare function projectionMatrix(cam: Camera): Proj;
/** Project a world point to pixel coordinates. `w` is the homogeneous depth
 *  (>0 in front of the camera for perspective; constant 1 for ortho). */
export declare function projectPoint(P: Proj, p: Vec3): {
    point: Vec2;
    w: number;
};
/**
 * Inverse of {@link projectPoint}: the world-space viewing ray through a pixel.
 * Perspective rays fan out from the eye; orthographic rays are parallel along the
 * view axis, offset across the image plane. Used by the visibility stage to map a
 * screen crossing back onto a feature's supporting geometry (docs/DESIGN.md §2.4).
 */
export declare function unproject(cam: Camera, pixel: Vec2): Ray;
//# sourceMappingURL=camera.d.ts.map