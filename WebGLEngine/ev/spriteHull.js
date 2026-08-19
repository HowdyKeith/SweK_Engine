// WebGLEngine/ev/spriteHull.js — v3828 (Long Silence, sprite-lofted hulls)
//
// The Three.js half of turning a ship's top-down art into a hull: draw the sprite to a canvas, read its alpha,
// run the pure silhouette pipeline (spriteHullCore), build a THREE.Shape and bevel-extrude it into a flat plate,
// then lay it down so the nose is +X and thickness is up. ES art is fetched at runtime by ev/esSprites.js (GPLv3,
// nothing bundled); if it can't load, the caller keeps the procedural hull. This scales for free -- every ES
// ship already has art, so this is a serviceable 3D hull with zero new asset sourcing.

import * as THREE from "/vendor/three/three.module.js";
import { esLoadImage } from "/ev/esSprites.js";
import { silhouetteToHull } from "/ev/spriteHullCore.js";

const MAX_PX = 96;   // bound the readback raster

// Build a hull Group from a loaded HTMLImage;  { color, depth, size, yaw } optional.  Returns null on empty art.
export function hullFromImage(img, opts = {}) {
    if (!img || typeof document === "undefined") return null;
    let sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
    const sc = Math.min(1, MAX_PX / Math.max(sw, sh)); sw = Math.max(1, Math.round(sw * sc)); sh = Math.max(1, Math.round(sh * sc));
    const cv = document.createElement("canvas"); cv.width = sw; cv.height = sh;
    const ctx = cv.getContext("2d");
    let rgba;
    try { ctx.drawImage(img, 0, 0, sw, sh); rgba = ctx.getImageData(0, 0, sw, sh).data; }
    catch (e) { return null; }   // tainted canvas (CORS) -> can't read pixels -> procedural fallback
    const size = opts.size || 2.2;
    const hull = silhouetteToHull(rgba, sw, sh, { size, rays: opts.rays || 56, threshold: opts.threshold });
    if (!hull) return null;

    const shape = new THREE.Shape();
    shape.moveTo(hull.points[0].x, hull.points[0].y);
    for (let i = 1; i < hull.points.length; i++) shape.lineTo(hull.points[i].x, hull.points[i].y);
    shape.closePath();

    const depth = opts.depth || Math.max(0.28, size * 0.16);
    const geo = new THREE.ExtrudeGeometry(shape, {
        depth, bevelEnabled: true, bevelThickness: depth * 0.6, bevelSize: size * 0.05, bevelSegments: 2, steps: 1,
    });
    geo.center();
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: opts.color != null ? opts.color : 0x9fb4c8, metalness: 0.65, roughness: 0.4, flatShading: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;   // shape XY -> world XZ (flat); extrude depth -> world +Y (up)

    const g = new THREE.Group(); g.add(mesh);
    if (opts.yaw) g.rotation.y = (opts.yaw || 0) * Math.PI / 180;   // optional facing correction (art is already +X-nosed)
    return g;
}

// Load an ES sprite path ("ship/sparrow") and loft it. Cached per path+color. Returns a Group or null.
const _cache = new Map();
export async function spriteHull(spritePath, opts = {}) {
    if (!spritePath) return null;
    const key = spritePath + "|" + (opts.color != null ? opts.color : "def") + "|" + (opts.yaw || 0);
    if (_cache.has(key)) { const tpl = _cache.get(key); return tpl ? tpl.clone(true) : null; }
    const img = await esLoadImage(spritePath);
    const g = img ? hullFromImage(img, opts) : null;
    _cache.set(key, g);
    return g ? g.clone(true) : null;
}

export function clearSpriteHullCache() { _cache.clear(); }
