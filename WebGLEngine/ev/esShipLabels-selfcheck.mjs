// WebGLEngine/ev/esShipLabels-selfcheck.mjs — v3831 (Long Silence, Slug ship labels — the answer key)
//
// The one thing that can go silently wrong in a nameplate pass is the geometry: a label that drifts off its
// ship, sits upside down, paints for a ship behind the camera, or grows with distance instead of shrinking. None
// of that is visible in a screenshot until it is already wrong, so it is pinned here against constructed values
// — Node-only, against the real esShipLabelsCore.js and the real IBM Plex font the page loads. The GPU draw
// (SlugFontGPU / SlugTextBatch) needs a context and stays Keith's to see; every number it depends on is checked
// here first.
//
// Run: node ev/esShipLabels-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mulMat4Vec4, projectToScreen, labelText, sizeForDepth, placeOrthoRows } from "./esShipLabelsCore.js";
import { parseFont } from "../text/slugFont.js";
import { layoutText } from "../text/slugText.js";

let pass = 0, fail = 0;
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
function ok(c, m) { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } }

// A perspective matrix in THREE.Matrix4.elements order (column-major), so projectToScreen is exercised through
// exactly the array a page hands it from camera.projectionMatrix.elements. Derived, not typed from a reference.
function perspective(fovyDeg, aspect, nearP, farP) {
    const f = 1 / Math.tan((fovyDeg * Math.PI / 180) / 2);
    return [
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (farP + nearP) / (nearP - farP), -1,
        0, 0, (2 * farP * nearP) / (nearP - farP), 0,
    ];
}
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
// matrixWorldInverse for a camera sitting at (0,0,cz) looking down -z: translate the world by -cz on z.
const viewAt = (cz) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -cz, 1];

// 1) mulMat4Vec4 -- identity is a no-op; a translation moves the point; column-major order is honoured.
{
    const a = mulMat4Vec4(IDENT, 3, -4, 5, 1);
    ok(a.x === 3 && a.y === -4 && a.z === 5 && a.w === 1, "mulMat4Vec4 identity is a no-op");
    const t = mulMat4Vec4(viewAt(5), 0, 0, 0, 1);
    ok(t.x === 0 && t.y === 0 && t.z === -5 && t.w === 1, "mulMat4Vec4 applies a column-major translation");
}

// 2) PROJECTION -- centre, signs, and the behind-camera cull. fovy 90/aspect 1 makes the focal length exactly 1,
//    so a point one unit in front lands at the exact viewport centre and the arithmetic is checkable by hand.
{
    const P = perspective(90, 1, 0.1, 100), VW = 800, VH = 600;
    const c = projectToScreen(P, IDENT, 0, 0, -1, VW, VH);
    ok(c.visible && near(c.x, 400) && near(c.y, 300), "point on axis, one unit ahead -> exact viewport centre");
    ok(near(c.w, 1), "clip.w equals the eye distance in front of the camera");

    const rgt = projectToScreen(P, IDENT, 0.5, 0, -1, VW, VH);
    ok(rgt.visible && rgt.x > 400, "world +x -> screen right");
    const up = projectToScreen(P, IDENT, 0, 0.5, -1, VW, VH);
    ok(up.visible && up.y < 300, "world +y (up) -> screen UP (smaller y) -- the y-flip a plant removes");

    const behind = projectToScreen(P, IDENT, 0, 0, 1, VW, VH);   // a unit BEHIND the camera
    ok(!behind.visible && behind.w <= 0, "a ship behind the camera is NOT drawn (clip.w <= 0)");

    // PLANT: keep the ndc arithmetic but drop the clip.w<=0 guard -> the behind point paints on-screen mirrored.
    const nx = -0 /* clip.x */, wBad = behind.w;
    const mirroredOnScreen = ((nx / wBad) * 0.5 + 0.5) * VW;   // finite pixel from a point behind you
    ok(Number.isFinite(mirroredOnScreen), "control: without the w-guard a behind-camera point yields a finite (wrong) pixel");
}

// 3) VIEW IS APPLIED -- a moved camera changes depth and can push a point out of the frustum.
{
    const P = perspective(60, 16 / 9, 0.1, 500), VW = 1280, VH = 720;
    const origin = projectToScreen(P, viewAt(5), 0, 0, 0, VW, VH);     // camera at z=5 sees the origin ahead
    ok(origin.visible && near(origin.w, 5), "camera at z=5 sees the origin 5 units ahead");
    const behindNow = projectToScreen(P, viewAt(5), 0, 0, 6, VW, VH);  // world z=6 is 1 unit BEHIND that camera
    ok(!behindNow.visible, "a world point behind the moved camera is culled (view matrix is applied)");
}

// 4) labelText -- class name plus integrity; unknown maxima drop to the name alone rather than a fake percent.
{
    ok(labelText({ name: "Raider", shield: 80, armor: 60, maxShield: 80, maxArmor: 60 }) === "Raider 100%", "full hull -> 100%");
    ok(labelText({ name: "Corsair", shield: 0, armor: 40, maxShield: 60, maxArmor: 40 }) === "Corsair 40%", "damaged hull rounds to a percent");
    ok(labelText({ cls: { name: "Marauder" }, shield: 5, armor: 0, maxShield: 120, maxArmor: 90 }) === "Marauder 2%", "reads cls.name and rounds 2.38% -> 2%");
    ok(labelText({ name: "Wreck" }) === "Wreck", "no maxima -> name alone, no fabricated percent");
    ok(labelText({}) === "Ship", "nameless ship falls back to 'Ship'");
}

// 5) sizeForDepth -- equals ref at refW, monotone DECREASING in distance, clamps flat at both ends.
{
    const o = { ref: 22, refW: 60, min: 9, max: 40 };
    ok(near(sizeForDepth(60, o), 22), "size equals ref at the reference distance");
    ok(near(sizeForDepth(120, o), 11), "twice as far -> half the size");
    ok(sizeForDepth(40, o) > sizeForDepth(80, o), "nearer ship draws a larger label");
    ok(sizeForDepth(1, o) === 40, "very near clamps to max");
    ok(sizeForDepth(100000, o) === 9, "very far clamps to min");
    ok(sizeForDepth(-3, o) === 9, "a non-positive depth is treated as far (min), never negative");
}

// 6) placeOrthoRows -- the label's origin lands where asked, text runs left-to-right, and ascenders go UP. The
//    last is the property a y-flip plant breaks, so it is shown holding for the real rows and FAILING for a
//    flipped copy -- a check that could not fail on a bad matrix would be no check.
{
    const VW = 800, VH = 600, ox = 120, oy = 380;
    const R = placeOrthoRows(VW, VH, ox, oy);
    // clip of a local point (lx, ly): (R0.x*lx + R0.w, R1.y*ly + R1.w)
    const clipX = (lx) => R[0] * lx + R[3];
    const clipY = (ly) => R[5] * ly + R[7];
    ok(near(clipX(0), (2 / VW) * ox - 1, 1e-6), "origin x lands at the requested pixel");   // 1e-6: rows are f32
    ok(near(clipY(0), 1 - (2 / VH) * oy, 1e-6), "origin y (baseline) lands at the requested pixel");
    ok(clipX(50) > clipX(0), "text runs left-to-right");
    const ascendsHonest = clipY(10) > clipY(0);          // font +y is up -> larger clip y
    ok(ascendsHonest, "ascenders rise above the baseline (row1.y > 0)");
    const flipped = Float32Array.from(R); flipped[5] = -flipped[5];   // the upside-down plant
    const ascendsFlipped = flipped[5] * 10 + flipped[7] > flipped[7];
    ok(ascendsHonest && !ascendsFlipped, "control: a y-flipped matrix FAILS the ascender check");
}

// 7) THE REAL FONT PATH the page uses runs headless -- parse the shipped TTF and lay a label out. Width must be
//    positive, a longer label must be wider (so the centre offset width/2 is meaningful), and the glyph count is
//    the plain character count for this Latin-advance layout.
{
    const here = dirname(fileURLToPath(import.meta.url));
    const ab = readFileSync(join(here, "..", "vendor", "fonts", "IBMPlexSerif-Regular.ttf"));
    const font = parseFont(ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength));
    const a = layoutText(font, "Raider 100%", { size: 24 });
    const b = layoutText(font, "Marauder 100%", { size: 24 });
    ok(a.width > 0, "label lays out to a positive width (" + a.width.toFixed(1) + " px)");
    ok(a.glyphs.length === "Raider 100%".length, "one glyph per character in the label");
    ok(b.width > a.width, "a longer class name lays out wider -- the centre offset tracks the text");
    ok(layoutText(font, "X", { size: 48 }).width > layoutText(font, "X", { size: 24 }).width, "the same glyph is wider at a larger size (resolution-independent scaling)");
}

console.log(`esShipLabels-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
