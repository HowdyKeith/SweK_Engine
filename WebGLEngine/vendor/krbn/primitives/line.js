// A bare line segment / ray as a scene element. It is a drawn edge, not a
// surface: it has no silhouette and does not occlude (a 1-D set casts no area
// shadow), but it is occludABLE along its length — that visibility is resolved
// downstream by QI (docs/DESIGN.md §2.3, "Line segment / ray").
import { aabbFromPoints } from "../math/aabb.js";
import { autoName } from "../scene/auto-id.js";
export class Line {
    a;
    b;
    kind = "line";
    id;
    autoNamed;
    constructor(a, b, id) {
        this.a = a;
        this.b = b;
        this.autoNamed = id === undefined;
        this.id = id ?? autoName(this.kind);
    }
    bounds() {
        return aabbFromPoints([this.a, this.b]);
    }
    extractFeatures(_cam) {
        return [
            {
                type: "boundary",
                owner: this.id,
                curve: { kind: "line", a: this.a, b: this.b },
                attrs: {},
            },
        ];
    }
    hatchRegions(_cam, _light) {
        return [];
    }
    /** A 1-D segment has zero cross-section: nothing to hit, so it never occludes. */
    raycast(_ray) {
        return [];
    }
    projectedSilhouettes(_cam) {
        return [];
    }
}
//# sourceMappingURL=line.js.map