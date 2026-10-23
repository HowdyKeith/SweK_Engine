// WebGLEngine/render/seaThree.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// *** THE PHYSICS SEA AS A THREE.JS MESH, FOR ANY PAGE THAT HAS WATER. *** Step 3 of ocean-src-integration.
// world/oceanWater.mjs makes the cheap default water out of physics/ocean/oceanSurface.mjs: every vertex is a point of the Gerstner surface a hull floats on. This is its three.js face: a BufferGeometry
// whose position, normal and colour attributes are those arrays (refilled in place each frame by refillWater), a material with the foam painted into vertex colours, and heightAt() so the page's
// ships, buoys and shells ask the SAME surface what is drawn. It works on every GPU, which the opt-in GPU sea (ocean-sea.html, sea-host.html) does not, and it is what battleship3d.html and
// sub-aquarium.html draw.
//
// THREE is passed in (the pages load it from vendor/three or a CDN fallback), so this module imports no renderer and runs in node for its geometry. `scale` stretches a wave field made for metres to a page
// whose unit is not a metre: heights and horizontal displacement scale together, so the shape is kept and the labels are on the page's grid.
"use strict";
import { buildWater, refillWater } from "../world/oceanWater.mjs";

/** The calm sea the battleship page wants: the physics generator with a lower total slope and a shorter longest wave than the default 60 m / 0.6. */
export const CALM_OPTIONS = Object.freeze({ n: 6, longest: 40, shortest: 8, wind: 0.35, spread: 1.0, totalSlope: 0.28 });

/**
 * @param THREE   the three.js namespace
 * @param surface physics/ocean/oceanSurface.mjs createSurface(...)
 * @param opts    { half (m), n (cells per side), color, foamColor, opacity, scale, shininess, t }
 * @returns { mesh, geometry, water, update(t), heightAt(x, z, t), dispose() }
 */
export function createSeaMesh(THREE, surface, { half = 80, n = 48, color = 0x0a3b46, foamColor = 0xeaf6f4, opacity = 0.64, shininess = 90, t = 0, depthWrite = false } = {}) {
    const water = buildWater(surface, { half, n, t });
    const geometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(water.positions, 3), normal = new THREE.BufferAttribute(water.normals, 3), colour = new THREE.BufferAttribute(new Float32Array(water.count * 3), 3);
    geometry.setAttribute("position", position); geometry.setAttribute("normal", normal); geometry.setAttribute("color", colour);
    geometry.setIndex(new THREE.BufferAttribute(water.indices, 1));
    const base = new THREE.Color(color), foam = new THREE.Color(foamColor);
    const paint = () => {
        const c = colour.array, f = water.foam;
        for (let v = 0; v < water.count; v++) { const k = f[v]; c[v * 3] = base.r + (foam.r - base.r) * k; c[v * 3 + 1] = base.g + (foam.g - base.g) * k; c[v * 3 + 2] = base.b + (foam.b - base.b) * k; }
        colour.needsUpdate = true;
    };
    paint();
    // the displaced surface can leave its static bounding sphere; a sea this size is always in view, so frustum culling is off rather than recomputed
    const material = new THREE.MeshPhongMaterial({ vertexColors: true, transparent: opacity < 1, opacity, shininess, specular: 0x8ffcff, side: THREE.DoubleSide, depthWrite });
    const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.renderOrder = 2;
    return {
        mesh, geometry, water, material,
        /** carry the sea to time t: positions, normals and the foam colour, in place */
        update(tt) { refillWater(water, surface, tt); position.needsUpdate = true; normal.needsUpdate = true; paint(); return tt; },
        /** the surface height at world (x, z) -- the physics surface's own, the one the mesh is a sample of */
        heightAt(x, z, tt) { return surface.sample(x, z, tt).h; },
        dispose() { geometry.dispose(); material.dispose(); },
    };
}

/** The bench report. */
export function reportLines() {
    return ["[seaThree] the physics sea as a three.js mesh: " + (CALM_OPTIONS.n) + " waves, longest " + CALM_OPTIONS.longest + " m, total slope " + CALM_OPTIONS.totalSlope + " (the calm option set); refilled in place each frame",
        "  heightAt(x, z, t) is the surface the mesh samples; foam is painted into vertex colours; works on every GPU"];
}
