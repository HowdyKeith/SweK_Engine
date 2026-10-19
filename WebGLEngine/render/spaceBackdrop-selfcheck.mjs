// WebGLEngine/render/spaceBackdrop-selfcheck.mjs
//
// The page-side half of the baked space backdrop (render/spaceBackdrop.js), run in node against a recording stand-in
// for Three and for the canvas. The generators under it are gated already (nebulaSkybox-selfcheck, proceduralStar-
// selfcheck, cubeBake-selfcheck); what is pinned HERE is the part those cannot see:
//
//   * the bytes reach the texture unchanged and in the order Three reads them (a face-order slip is a seam in the sky
//     that no generator gate can see, because the generator is right and the hand-off is wrong);
//   * the backdrop is OFF and costs NOTHING until asked: no bake, the page's flat colour, nothing added to the scene;
//   * on and off again gives back the SAME flat colour object and does not bake twice;
//   * a bake that throws leaves the flat fill and a stated error and never a half-set scene;
//   * the star is seated at infinity FOR THE CAMERA THAT DRAWS IT -- recomputed per draw, from that camera's position and
//     far plane -- which is what makes one star right in every window of a multi-window page;
//   * the page's sky is fly3d's sky (same seed, size, temperature), checked against the page source.
//
// Run: node render/spaceBackdrop-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)
//
// SABOTAGE LOG (each applied to a scratch copy of render/spaceBackdrop.js, this gate run against it, the original untouched; the number is how many rows went red; 52 mutants, none left at 0):
//   M01 alpha 0 1; M02 faces reversed 2; M03 r/b swapped 2; M04 no colorSpace 1; M05 needsUpdate false 1; M06 eager bake 4; M07 no baked guard 3; M08 flat copy on off 5; M09 star always visible 3; M11 no live check 3;
//   M12 nebula error dropped 1; M13 star error dropped 1; M14 star ignores camera position 2; M15 fixed distance 3; M16 scale not by sin 3; M17 depthTest on 1; M18 depthWrite on 1; M19 renderOrder 0 1; M20 frustum
//   culled 1; M21 dir not normalised 7; M22 no zero-light guard 1; M23 hide inverted 5; M24 hide on failed bake 1; M25 dispose keeps star 1; M26 dispose frees nothing 1; M27 dispose keeps baked 1; M28 nebula time spans
//   both 1; M29 star at 256 3; M30 nebula seed 3; M31 star kelvin 2; M32 star angle 1; M33 NEBULA not frozen 1; M34 baker gets frozen opts 1; M35 toggle stuck 1; M36 set returns request 1; M37 no matrix update 1; M38 no
//   scale 3; M39 big star geometry 1; M40 star not in scene 1; M41 no flat at mount 2; M42 star wears nebula 1; M43 starTexture not kept 1; M44 limb coefficient 1; M45 limb law in shader 1; M46 star lookup by view 1;
//   M48 timing clock default 1; M49 describe loses the flat fill 2; M50 describe background by type 1; M51 describe faces zero 1; M52 describe star always visible 1; M53 describe hidden not inverted 3; M54 describe dir
//   shared array 1.
//   FOUR WENT 0 RED ALONG THE WAY AND EACH WAS RESOLVED: M34 (the baker handed the frozen shared parameters instead of a copy -- a baker that writes to its options would have thrown into the catch and silently left the
//   page flat), M42 (the star's shader wearing the NEBULA texture: the old row only asked for 'a six-image cube texture', which both are) and M54 (describe() handing back the star's own direction array) each got a row;
//   and M10 (the star mesh born visible) was EQUIVALENT -- set() writes the star's visibility in the same synchronous call that creates it -- so the redundant line was removed rather than excused. A mutant that added a
//   harmless property (castShadow) was not a mutant and was dropped.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as BD from "./spaceBackdrop.js";
import { bakeNebulaCubemap } from "./nebulaSkybox.js";
import { bakeStarCubemap, limbDarkening } from "./proceduralStar.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const MOD = BD;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// ---- the stand-ins -------------------------------------------------------------------------------------------------
function makeFake() {
    const T = { disposed: 0, geomDisposed: 0, matDisposed: 0 };
    class Color { constructor(hex) { this.hex = hex; this.isColor = true; } }
    class CubeTexture { constructor(images) { this.images = images; this.colorSpace = ""; this.needsUpdate = false; this.isCubeTexture = true; } dispose() { T.disposed++; } }
    class ShaderMaterial { constructor(p) { Object.assign(this, p); this.isShaderMaterial = true; } dispose() { T.matDisposed++; } }
    class SphereGeometry { constructor(r, w, h) { this.r = r; this.w = w; this.h = h; } dispose() { T.geomDisposed++; } }
    class Mesh {
        constructor(geometry, material) {
            this.geometry = geometry; this.material = material; this.visible = true; this.frustumCulled = true; this.renderOrder = 0;
            this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
            this.scale = { x: 1, y: 1, z: 1, setScalar(s) { this.x = this.y = this.z = s; } };
            this.matrixUpdates = 0;
        }
        updateMatrixWorld() { this.matrixUpdates++; }
        onBeforeRender() {}
    }
    const THREE = { Color, CubeTexture, ShaderMaterial, SphereGeometry, Mesh, SRGBColorSpace: "srgb" };
    const scene = { background: null, children: [], add(o) { this.children.push(o); }, remove(o) { this.children = this.children.filter((c) => c !== o); } };
    const canvases = [];
    const makeCanvas = (w, h) => {
        const cv = { width: w, height: h, img: null, getContext: () => ({ createImageData: (a, b) => ({ data: new Uint8ClampedArray(a * b * 4) }), putImageData: (img) => { cv.img = img; } }) };
        canvases.push(cv); return cv;
    };
    return { THREE, scene, makeCanvas, canvases, T };
}
const spyBaker = (log, name, size, filler) => (o) => {
    log.push({ name, opts: { ...o } });
    const faces = [];
    for (let f = 0; f < 6; f++) { const b = new Uint8Array(size * size * 3); for (let k = 0; k < b.length; k++) b[k] = filler(f, k); faces.push(b); }
    return { size, faces };
};
const thrower = (msg) => () => { throw new Error(msg); };
const mount = (extra = {}) => {
    const F = makeFake(), calls = [];
    const nb = extra.bakeNebula || spyBaker(calls, "nebula", 2, (f, k) => (f * 40 + k) & 255);
    const sb = extra.bakeStar || spyBaker(calls, "star", 2, (f, k) => (200 + f * 7 + k) & 255);
    const h = MOD.mountBackdrop(F.THREE, F.scene, { flat: 0x03060d, light: [30, 60, 40], makeCanvas: F.makeCanvas, bakeNebula: nb, bakeStar: sb, ...extra.opts });
    return { ...F, h, calls };
};

// ---- 1. the page's sky is fly3d's sky -------------------------------------------------------------------------------
{
    ok(MOD.NEBULA.seed === 0xBEEF && MOD.NEBULA.size === 256, "the nebula is seed 0xBEEF at 256, fly3d's own");
    ok(MOD.STAR.seed === 909 && MOD.STAR.kelvin === 6200, "the star is seed 909 at 6200 K, fly3d's own");
    ok(Object.isFrozen(MOD.NEBULA) && Object.isFrozen(MOD.STAR), "the sky's parameters are frozen, so a page cannot change the shared sky by accident");
    const fly = fs.readFileSync(path.join(here, "..", "es-box3d-fly3d.html"), "utf8");
    ok(/buildNebulaSky\(0xBEEF\)/.test(fly) && /bakeNebulaCubemap\(\{\s*seed,\s*size:\s*256\s*\}\)/.test(fly), "fly3d's source still bakes the nebula at seed 0xBEEF, size 256 (the sky these pages share)");
    ok(/bakeStarCubemap\(\{\s*seed:\s*909,\s*kelvin:\s*6200/.test(fly), "fly3d's source still bakes the star at seed 909, 6200 K");
    ok(near(MOD.STAR_ANGLE, 130 / 1400, 1e-3), "the star's angular radius is fly3d's 130/1400 rad (" + MOD.STAR_ANGLE + ")");
}

// ---- 2. the bytes reach the canvases unchanged, in order ---------------------------------------------------------------
{
    const F = makeFake(), size = 3;
    const faces = []; for (let f = 0; f < 6; f++) { const b = new Uint8Array(size * size * 3); for (let k = 0; k < b.length; k++) b[k] = (f * 31 + k * 5 + 1) & 255; faces.push(b); }
    const cvs = MOD.faceCanvases(faces, size, F.makeCanvas);
    ok(cvs.length === 6 && cvs.every((c) => c.width === size && c.height === size), "six square canvases of the baked size");
    let exact = true, alpha = true;
    for (let f = 0; f < 6; f++) {
        const d = cvs[f].img.data;
        for (let k = 0, p = 0; k < faces[f].length; k += 3, p += 4) {
            if (d[p] !== faces[f][k] || d[p + 1] !== faces[f][k + 1] || d[p + 2] !== faces[f][k + 2]) exact = false;
            if (d[p + 3] !== 255) alpha = false;
        }
    }
    ok(exact, "every canvas texel is the face's own RGB (face k -> canvas k: the generator's [+X,-X,+Y,-Y,+Z,-Z] order is Three's CubeTexture order, untouched)");
    ok(alpha, "every texel is opaque (alpha 255)");
}

// ---- 3. OFF AND FREE until asked ---------------------------------------------------------------------------------------
{
    const m = mount();
    ok(m.scene.background === m.h.flat && m.h.flat.isColor && m.h.flat.hex === 0x03060d, "mounted: the background is the page's flat colour, as a Color");
    ok(m.calls.length === 0 && m.canvases.length === 0, "mounted: NOTHING is baked and no canvas exists (calls " + m.calls.length + ", canvases " + m.canvases.length + ")");
    ok(m.scene.children.length === 0, "mounted: nothing was added to the scene");
    ok(m.h.on === false && m.h.texture === null && m.h.bakeMs === null, "mounted: off, no texture, no timing");
}

// ---- 4. turned on: one bake of each, the right parameters, the texture, the star -----------------------------------------
{
    const m = mount();
    const r = m.h.set(true);
    ok(r === true && m.h.on === true, "set(true) answers true and the handle is on");
    ok(m.calls.length === 2 && m.calls[0].name === "nebula" && m.calls[1].name === "star", "exactly one bake of each, the nebula first (" + m.calls.map((c) => c.name).join(",") + ")");
    ok(m.calls[0].opts.seed === 0xBEEF && m.calls[0].opts.size === 256, "the nebula is asked for seed 0xBEEF at 256");
    ok(m.calls[1].opts.seed === 909 && m.calls[1].opts.kelvin === 6200 && m.calls[1].opts.size === 128, "the star is asked for seed 909, 6200 K, 128");
    ok(m.scene.background === m.h.texture && m.h.texture.isCubeTexture && m.h.texture.images.length === 6, "the background is the six-image cube texture");
    ok(m.h.texture.colorSpace === "srgb", "the texture is declared sRGB (a bake in sRGB bytes read as linear is a washed-out sky)");
    ok(m.h.texture.needsUpdate === true, "the texture is flagged for upload");
    ok(m.h.star && m.h.star.visible === true && m.scene.children.includes(m.h.star), "the star is in the scene and visible");
    ok(m.h.star.material.uniforms.uStar.value.isCubeTexture && m.h.star.material.uniforms.uStar.value.images.length === 6, "the star wears its own six-face cube texture");
    ok(m.h.bakeMs && typeof m.h.bakeMs.nebula === "number" && typeof m.h.bakeMs.star === "number", "the two bake times are recorded");
    const starTex = m.h.star.material.uniforms.uStar.value;
    ok(starTex !== m.h.texture && starTex.images[0].img.data[0] === 200 && m.h.texture.images[0].img.data[0] === 0, "the star wears the texture baked from the STAR generator (its first texel is the star baker's 200) and the sky the nebula's (0): not one texture twice");
    m.h.set(true);
    ok(m.calls.length === 2, "turning it on twice bakes once (" + m.calls.length + " bakes)");
}

// ---- 4b. a baker that scribbles on its options does not break the shared sky -----------------------------------------------
{
    const scribble = (o) => { o.seed = -1; o.size = 2; return { size: 2, faces: Array.from({ length: 6 }, () => new Uint8Array(12)) }; };
    const m = mount({ bakeNebula: scribble, bakeStar: scribble });
    const r = m.h.set(true);
    ok(r === true && m.h.error === null, "a baker that writes to the options it is handed still bakes (it gets a copy, not the frozen shared parameters): " + (m.h.error || "no error"));
    ok(MOD.NEBULA.seed === 0xBEEF && MOD.NEBULA.size === 256 && MOD.STAR.seed === 909 && MOD.STAR.size === 128, "...and the shared sky's parameters are what they were");
}

// ---- 5. off again: the SAME flat colour, no re-bake; toggle ----------------------------------------------------------
{
    const m = mount(); m.h.set(true); const tex = m.h.texture;
    const r = m.h.set(false);
    ok(r === false && m.h.on === false, "set(false) answers false");
    ok(m.scene.background === m.h.flat && m.h.flat.hex === 0x03060d, "off again: the background is the very flat Color object it started as, not an equal copy");
    ok(m.h.star.visible === false, "off again: the star is hidden");
    m.h.set(true);
    ok(m.h.texture === tex && m.calls.length === 2, "on again: the same texture, no new bake (" + m.calls.length + " bakes)");
    m.h.toggle(); ok(m.h.on === false && m.scene.background === m.h.flat, "toggle() turns it off");
    m.h.toggle(); ok(m.h.on === true && m.scene.background === tex, "toggle() turns it on");
}

// ---- 5b. what the page hands its gate -------------------------------------------------------------------------------------------
{
    const a = { visible: true }, m = mount({ opts: { hide: [a] } });
    const d0 = m.h.describe();
    ok(d0.flat === 0x03060d, "described: the flat fill is the page's own colour, as given (" + d0.flat + ")");
    ok(d0.on === false && d0.baked === false && d0.background === "flat" && d0.faces === 0 && d0.star === null && d0.hidden[0] === false && d0.bakeMs === null && d0.error === null, "described before: off, not baked, flat, no faces, no star, nothing hidden " + JSON.stringify(d0));
    m.h.set(true);
    const d1 = m.h.describe();
    ok(d1.on === true && d1.baked === true && d1.background === "nebula" && d1.faces === 6 && d1.faceSize === 2 && d1.star && d1.star.visible === true && d1.hidden[0] === true && d1.bakeMs && d1.bakeMs.nebula >= 0, "described on: nebula background, six faces of the baked size, the star visible, the page's own stars hidden " + JSON.stringify(d1));
    ok(near(Math.hypot(...d1.star.dir), 1, 1e-12), "...and the star direction it reports is the unit vector");
    d1.star.dir[0] = 99; d1.flat = 0;
    const d1b = m.h.describe();
    ok(near(d1b.star.dir[0], 0.38411, 1e-4) && near(m.h.dir[0], 0.38411, 1e-4) && d1b.flat === 0x03060d, "...and it is a COPY: scribbling on what describe() returned moves neither the star nor the reported flat fill");
    m.h.set(false);
    const d2 = m.h.describe();
    ok(d2.on === false && d2.baked === true && d2.background === "flat" && d2.star.visible === false && d2.hidden[0] === false, "described off again: flat, still baked (kept for the next switch-on), the star hidden, the page's stars back");
    m.scene.background = { other: true };
    ok(m.h.describe().background === "other", "a background somebody else set is called 'other', not 'flat'");
}

// ---- 6. a bake that fails leaves the flat fill and says so ---------------------------------------------------------------
{
    const m = mount({ bakeNebula: thrower("no memory") });
    let r, threw = false;
    try { r = m.h.set(true); } catch (e) { threw = true; }
    ok(!threw, "a failing nebula bake does not throw out of set(true)");
    ok(r === false && m.h.on === false && m.scene.background === m.h.flat, "a failing nebula bake leaves the page on its flat colour, off");
    ok(/nebula/.test(m.h.error || "") && /no memory/.test(m.h.error || ""), "...and the error names the nebula and the reason (" + m.h.error + ")");
    ok(!(m.h.star && m.h.star.visible), "...and no star shows over a flat sky that did not take the backdrop");

    const s = mount({ bakeStar: thrower("bad star") });
    const r2 = s.h.set(true);
    ok(r2 === true && s.scene.background === s.h.texture && s.h.star === null, "a failing star bake keeps the nebula and has no star");
    ok(/star/.test(s.h.error || "") && /bad star/.test(s.h.error || ""), "...and the error names the star (" + s.h.error + ")");
}

// ---- 7. the star is at infinity, for the camera that draws it ---------------------------------------------------------------
{
    const m = mount(); m.h.set(true);
    const st = m.h.star, L = [30, 60, 40], n = Math.hypot(...L), u = L.map((v) => v / n);
    ok(near(Math.hypot(...m.h.dir), 1, 1e-12) && m.h.dir.every((v, i) => near(v, u[i], 1e-12)), "the star direction is the light's direction, normalised");
    const draw = (cam) => st.onBeforeRender(null, m.scene, cam);
    const camA = { position: { x: 5, y: -7, z: 11 }, far: 5000 };
    draw(camA);
    const DA = 5000 * MOD.STAR_DISTANCE;
    ok(near(st.position.x, 5 + u[0] * DA, 1e-6) && near(st.position.y, -7 + u[1] * DA, 1e-6) && near(st.position.z, 11 + u[2] * DA, 1e-6), "drawn from camera A, the star is at A's position plus the light direction times half of A's far plane");
    ok(near(st.scale.x, DA * Math.sin(MOD.STAR_ANGLE), 1e-6), "...and its radius subtends the star's angle at that distance (" + st.scale.x.toFixed(3) + ")");
    const camB = { position: { x: -3000, y: 200, z: 90 }, far: 40000 };
    draw(camB);
    const DB = 40000 * MOD.STAR_DISTANCE;
    ok(near(st.position.x, -3000 + u[0] * DB, 1e-6) && near(st.position.y, 200 + u[1] * DB, 1e-6) && near(st.position.z, 90 + u[2] * DB, 1e-6), "drawn next from camera B (another window), it follows B, not A");
    ok(near(st.scale.x, DB * Math.sin(MOD.STAR_ANGLE), 1e-6), "...and B's far plane sets B's distance and radius");
    ok(st.matrixUpdates >= 2, "its world matrix is refreshed at each draw (" + st.matrixUpdates + " updates for 2 draws)");
    // the angle on screen does not depend on which camera: radius over distance is the same
    ok(near(st.scale.x / DB, Math.sin(MOD.STAR_ANGLE), 1e-12), "the star subtends the same angle from every window, whatever the far plane");
    ok(st.material.depthTest === false && st.material.depthWrite === false, "the star neither reads nor writes depth (every craft paints over it)");
    ok(st.renderOrder < 0 && st.frustumCulled === false, "the star is drawn first and never culled");
    ok(st.geometry.r === 1, "the star's geometry is the unit sphere (the radius is the draw's scale)");
    // the shader's limb law is the gated one: uLimb is 1 - limbDarkening(0), and the fragment applies 1 - uLimb*(1 - mu)
    ok(near(st.material.uniforms.uLimb.value, 1 - limbDarkening(0), 1e-12), "the shader's limb coefficient is proceduralStar.limbDarkening's default (" + st.material.uniforms.uLimb.value + ")");
    ok(/1\.0\s*-\s*uLimb\*\(1\.0-mu\)/.test(st.material.fragmentShader) && /textureCube\(uStar,\s*vN\)/.test(st.material.fragmentShader), "the fragment shader applies that law to the cube texture lookup");
}

// ---- 8. the light option, and the default -----------------------------------------------------------------------------------
{
    const m = mount({ opts: { light: [500, -300, 400] } });
    const n = Math.hypot(500, -300, 400);
    ok(near(m.h.dir[0], 500 / n, 1e-12) && near(m.h.dir[1], -300 / n, 1e-12) && near(m.h.dir[2], 400 / n, 1e-12), "the battleship's sun position becomes the star's direction");
    const d = mount({ opts: { light: undefined } }), n2 = Math.hypot(30, 60, 40);
    ok(near(d.h.dir[0], 30 / n2, 1e-12) && near(d.h.dir[1], 60 / n2, 1e-12), "with no light given the star takes fly3d's (30, 60, 40)");
    const z = mount({ opts: { light: [0, 0, 0] } });
    ok(z.h.dir.every((v) => Number.isFinite(v)), "a zero light vector does not make the direction NaN");
}

// ---- 9. objects hidden while it is on -----------------------------------------------------------------------------------------
{
    const a = { visible: true }, b = { visible: true };
    const m = mount({ opts: { hide: [a, b] } });
    ok(a.visible && b.visible, "before: the page's own star shell is showing");
    m.h.set(true); ok(!a.visible && !b.visible, "on: the page's own stars are hidden (two skies is clutter)");
    m.h.set(false); ok(a.visible && b.visible, "off: they are back");
    const f = mount({ bakeNebula: thrower("x"), opts: { hide: [a] } });
    f.h.set(true); ok(a.visible, "a failed bake does not hide the page's own stars (nothing replaced them)");
}

// ---- 10. the clock measures the right stretches ---------------------------------------------------------------------------------
{
    const seq = [100, 110, 130]; let i = 0;
    const m = mount({ opts: { now: () => seq[i++] } });
    m.h.set(true);
    ok(m.h.bakeMs.nebula === 10 && m.h.bakeMs.star === 20, "bakeMs.nebula is the nebula stretch (10) and bakeMs.star the star's (20): " + JSON.stringify(m.h.bakeMs));
}

// ---- 11. dispose ----------------------------------------------------------------------------------------------------------------
{
    const m = mount(); m.h.set(true); const st = m.h.star;
    m.h.dispose();
    ok(m.T.disposed === 2, "dispose frees both textures (" + m.T.disposed + ")");
    ok(m.T.geomDisposed === 1 && m.T.matDisposed === 1, "...and the star's geometry and material");
    ok(!m.scene.children.includes(st) && m.h.star === null, "...and takes the star out of the scene");
    ok(m.scene.background === m.h.flat && m.h.on === false, "...and leaves the flat fill");
    m.h.set(true); ok(m.calls.length === 4 && m.h.on === true, "after dispose a new set(true) bakes afresh (" + m.calls.length + " bakes)");
}

// ---- 12. the real generators, through the hand-off -------------------------------------------------------------------------------
{
    const fnv = (bytes) => { let h = 0x811c9dc5; for (let k = 0; k < bytes.length; k++) { h ^= bytes[k]; h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
    const run = () => {
        const F = makeFake();
        const h = MOD.mountBackdrop(F.THREE, F.scene, { flat: 0x03060d, makeCanvas: F.makeCanvas, bakeNebula: bakeNebulaCubemap, bakeStar: bakeStarCubemap });
        const t0 = performance.now(); h.set(true); const ms = performance.now() - t0;
        return { F, h, ms };
    };
    const a = run(), b = run();
    ok(a.F.canvases.length === 12 && a.F.canvases.slice(0, 6).every((c) => c.width === 256) && a.F.canvases.slice(6).every((c) => c.width === 128), "real bake: six canvases at 256 for the nebula and six at 128 for the star");
    const dig = a.F.canvases.slice(0, 6).map((c) => fnv(c.img.data));
    const dig2 = b.F.canvases.slice(0, 6).map((c) => fnv(c.img.data));
    ok(dig.every((v, i) => v === dig2[i]), "the same sky twice: every nebula face byte-identical");
    ok(new Set(dig).size === 6, "the six faces are six different pictures");
    ok(a.F.canvases.slice(0, 6).every((c) => { let lit = 0; for (let p = 0; p < c.img.data.length; p += 4) if (c.img.data[p] + c.img.data[p + 1] + c.img.data[p + 2] > 60) lit++; return lit > 20; }), "every nebula face has stars or cloud in it (not a flat fill)");
    ok(a.h.on && a.ms < 5000, "the real bake finishes and is on (" + a.ms.toFixed(0) + " ms here)");
    console.log("  info  real bake through the hand-off: " + a.ms.toFixed(0) + " ms; nebula " + a.h.bakeMs.nebula.toFixed(0) + " ms, star " + a.h.bakeMs.star.toFixed(0) + " ms; nebula face digests " + dig.map((v) => v.toString(16)).join(" "));
}

console.log(fail ? "spaceBackdrop-selfcheck: " + fail + " FAILED, " + pass + " passed" : "spaceBackdrop-selfcheck: all " + pass + " checks pass");
process.exit(fail ? 1 : 0);
