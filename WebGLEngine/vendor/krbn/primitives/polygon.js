// A planar polygon (also serves as a bounded Plane). Its outline is exact edge
// geometry; its interior is a hatch region (docs/DESIGN.md §2.3 / §2.6). Unlike a
// Line, a polygon has area and therefore occludes — its ray–plane + point-in-
// polygon test is the first real occluder feeding the visibility stage.
import { aabbFromPoints } from "../math/aabb.js";
import { basisFromNormal, toPlaneCoords } from "../math/basis.js";
import { dot, normalize, sub } from "../math/vec3.js";
import { projectPoint, projectionMatrix } from "../math/camera.js";
import { autoName } from "../scene/auto-id.js";
import { EPS_ABS } from "../curve/epsilon.js";
/** Newell's method — a stable planar normal even for slightly non-planar input. */
function newellNormal(v) {
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < v.length; i++) {
        const c = v[i];
        const n = v[(i + 1) % v.length];
        nx += (c[1] - n[1]) * (c[2] + n[2]);
        ny += (c[2] - n[2]) * (c[0] + n[0]);
        nz += (c[0] - n[0]) * (c[1] + n[1]);
    }
    return normalize([nx, ny, nz]);
}
export class Polygon {
    vertices;
    normal;
    kind = "polygon";
    id;
    autoNamed;
    style;
    frame;
    constructor(vertices, id, style) {
        if (vertices.length < 3)
            throw new Error("Polygon needs at least 3 vertices");
        this.vertices = vertices;
        this.normal = newellNormal(vertices);
        this.autoNamed = id === undefined;
        this.id = id ?? autoName(this.kind);
        this.style = { hatchMode: style?.hatchMode ?? "single", hatchAngle: style?.hatchAngle ?? 45 };
        this.frame = basisFromNormal(vertices[0], this.normal);
    }
    bounds() {
        return aabbFromPoints(this.vertices);
    }
    extractFeatures(_cam) {
        // The boundary as one closed chained polyline (already ordered).
        const pts = [...this.vertices, this.vertices[0]];
        return [
            {
                type: "boundary",
                owner: this.id,
                curve: { kind: "polyline", pts },
                attrs: {},
            },
        ];
    }
    hatchRegions(cam, light) {
        const P = projectionMatrix(cam);
        const outline = {
            kind: "polyline",
            pts: this.vertices.map((v) => projectPoint(P, v).point),
        };
        // Lambertian tone: brighter (less hatch) where the face points at the light.
        const diffuse = Math.max(0, dot(this.normal, [-light.direction[0], -light.direction[1], -light.direction[2]]));
        const tone = Math.min(1, Math.max(0, 1 - diffuse));
        return [
            {
                owner: this.id,
                outline,
                mode: this.style.hatchMode,
                angle: this.style.hatchAngle,
                tone,
            },
        ];
    }
    /** Closed-form ray–plane hit, accepted only if inside the polygon. */
    raycast(ray) {
        const denom = dot(ray.dir, this.normal);
        if (Math.abs(denom) <= EPS_ABS)
            return []; // ray parallel to the plane
        const t = dot(sub(this.vertices[0], ray.origin), this.normal) / denom;
        const point = [
            ray.origin[0] + t * ray.dir[0],
            ray.origin[1] + t * ray.dir[1],
            ray.origin[2] + t * ray.dir[2],
        ];
        if (!this.containsPoint(point))
            return [];
        // Orient the reported normal to oppose the incoming ray (outward-facing hit).
        const facing = denom < 0;
        const n = facing ? this.normal : [-this.normal[0], -this.normal[1], -this.normal[2]];
        return [{ t, point, normal: n, frontFacing: facing }];
    }
    projectedSilhouettes(cam) {
        // The occluding contour of a flat face is its boundary; hand the projected
        // edges to the QI stage as crossing-event curves.
        const P = projectionMatrix(cam);
        const s = this.vertices.map((v) => projectPoint(P, v).point);
        const out = [];
        for (let i = 0; i < s.length; i++) {
            out.push({ kind: "line", a: s[i], b: s[(i + 1) % s.length] });
        }
        return out;
    }
    // --- helpers ------------------------------------------------------------
    /** Point-in-polygon in the face's own plane coordinates (2-D crossing test). */
    containsPoint(p) {
        const [px, py] = toPlaneCoords(this.frame, p);
        let inside = false;
        const uv = this.vertices.map((v) => toPlaneCoords(this.frame, v));
        for (let i = 0, j = uv.length - 1; i < uv.length; j = i++) {
            const [xi, yi] = uv[i];
            const [xj, yj] = uv[j];
            const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
            if (intersects)
                inside = !inside;
        }
        return inside;
    }
}
//# sourceMappingURL=polygon.js.map