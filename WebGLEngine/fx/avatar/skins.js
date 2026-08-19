// fx/avatar/skins.js -- what the blob is MADE of. Until now there was exactly one material in the tree: firePalette,
// the lava/fire skin. This makes it a set -- lava, ice, crystal, gas -- behind one interface, so a skin works the same
// on Avataro, the pet, the herd, the blobulator and the voxel path, because they all end up as marched triangles.
//
// A skin answers two questions per triangle: what colour, and how to composite. Each material earns its look from a
// different physical idea rather than just a different hue:
//   lava    -- heat: firePalette (the existing one, now wrapped instead of special-cased)
//   ice     -- subsurface scatter: light bleeds THROUGH thin parts, so it brightens where the body is thin, not where
//              the light hits. That's why ice reads as ice and not as blue plastic.
//   crystal -- faceting: the normal is SNAPPED to a fixed direction table before shading, so smooth curvature breaks
//              into flat faces with a hard specular. Pairs naturally with the flat-shaded triangles we already make.
//   gas     -- no surface at all: additive, translucent, density animated, never depth-sorted.
"use strict";
import { blackbodyRamp } from "../voxelize/fireRamp.js";

// 26 directions (every -1/0/1 combination, normalized). Snapping to a fixed table is what makes faceting IDEMPOTENT:
// a normal that's already a facet snaps to itself (its dot with itself is 1), so re-shading never drifts.
const FACETS = (() => { const o = []; for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) { if (!x && !y && !z) continue; const l = Math.hypot(x, y, z); o.push([x / l, y / l, z / l]); } return o; })();
function quantizeNormal(n) { let best = FACETS[0], bd = -2; for (const f of FACETS) { const d = n[0] * f[0] + n[1] * f[1] + n[2] * f[2]; if (d > bd) { bd = d; best = f; } } return best; }
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;

const lerp = (a, b, t) => a + (b - a) * t;

// lava -- heat, on the shared TEMPERATURE ramp (fx/voxelize/fireRamp.js). v2438: this used to borrow firePalette,
// which is an ash ramp over burn progress -- the wrong curve for a molten surface, and it topped out at yellow and
// bottomed out at grey. The six-stop temperature ramp runs dark red to white hot, which is what lava actually does.
const _lavaC = [0, 0, 0];
function shadeLava({ lit, pos, t }) { const heat = clamp01(0.30 + lit * 0.55 + Math.sin(pos[1] * 2.6 - t * 1.4) * 0.15); const c = blackbodyRamp(heat, _lavaC); return [clamp01(c[0]), clamp01(c[1]), clamp01(c[2]), 1]; }
// ice -- subsurface scatter: it brightens where the body is THIN, because light passes through thin parts. And it can
// MELT: melt hands the surface over to lava, so a body doesn't switch materials, it turns into one.
function shadeIce({ lit, thickness, pos, t, melt }) {
    const thin = clamp01(1 - thickness), bleed = thin * thin * 0.75, crackle = 0.05 * Math.sin(pos[0] * 9 + pos[2] * 7 + t * 0.2);
    const ice = [clamp01(0.50 * lit + bleed * 0.85 + crackle), clamp01(0.72 * lit + bleed * 0.95 + crackle), clamp01(0.92 * lit + bleed + crackle), clamp01(0.92 - thin * 0.22)];
    const m = clamp01(melt || 0); if (m <= 0) return ice;
    const l = shadeLava({ lit, pos, t });
    return [lerp(ice[0], l[0], m), lerp(ice[1], l[1], m), lerp(ice[2], l[2], m), lerp(ice[3], l[3], m)];
}
function shadeCrystal({ lit, normal }) { const spec = Math.pow(Math.max(0, normal[1] * 0.55 + normal[2] * 0.83), 14); return [clamp01(0.34 * lit + spec * 0.9), clamp01(0.56 * lit + spec), clamp01(0.86 * lit + spec), 1]; }
function shadeGas({ lit, pos, t }) { const dens = 0.30 + 0.22 * Math.sin(pos[0] * 2.1 + t * 1.1) * Math.cos(pos[2] * 1.9 - t * 0.7); return [clamp01(0.42 + lit * 0.34), clamp01(0.30 + lit * 0.42), clamp01(0.70 + lit * 0.25), clamp01(Math.max(0.05, dens) * 0.55)]; }

const SKINS = {
    lava: { name: "lava", blend: "solid", facet: false, shade: shadeLava },
    ice: { name: "ice", blend: "solid", facet: false, shade: shadeIce },
    crystal: { name: "crystal", blend: "solid", facet: true, shade: shadeCrystal },
    gas: { name: "gas", blend: "additive", facet: false, shade: shadeGas }
};

// INCLUSIONS -- the narrator's carved-mouth trick used as geology. Negative metaballs placed INSIDE a body subtract
// from the field, hollowing out voids; wear crystal over them and you get flaws suspended in the stone.
function makeInclusions(n, opts = {}) {
    const rng = opts.rng || Math.random, R = opts.radius == null ? 0.62 : opts.radius, c = opts.center || [0, 0, 0];
    const out = [];
    for (let i = 0; i < n; i++) {
        const u = rng() * 2 - 1, th = rng() * Math.PI * 2, r = R * Math.cbrt(rng()), sq = Math.sqrt(1 - u * u);
        out.push({ id: "incl" + i, neg: true, p: [c[0] + r * sq * Math.cos(th), c[1] + r * sq * Math.sin(th), c[2] + r * u], r: (opts.size == null ? 0.16 : opts.size) * (0.6 + rng() * 0.8) });
    }
    return out;
}

// a skin can follow the persona, or the section of a script -- so a long read changes material as it changes subject
const SKIN_FOR_PERSONA = { both: "persona", avataro: "crystal", avatarina: "lava" };
const SKIN_FOR_SECTION = ["persona", "crystal", "gas", "lava", "ice"];
function skinForPersona(p) { return SKIN_FOR_PERSONA[p] || "persona"; }
function skinForSection(i) { return SKIN_FOR_SECTION[Math.abs(i | 0) % SKIN_FOR_SECTION.length]; }

// shade one triangle through a skin. The renderer hands over what it already knows; the skin decides the rest.
function shadeTri(skin, o) {
    const s = typeof skin === "string" ? SKINS[skin] : skin; if (!s) return [1, 1, 1, 1];
    const normal = s.facet ? quantizeNormal(o.normal || [0, 1, 0]) : (o.normal || [0, 1, 0]);
    return s.shade({ lit: o.lit == null ? 1 : o.lit, normal, thickness: o.thickness == null ? 1 : o.thickness, pos: o.pos || [0, 0, 0], t: o.t || 0, depth: o.depth || 0, melt: o.melt || 0 });
}
const SKIN_NAMES = Object.keys(SKINS);
export { SKINS, SKIN_NAMES, shadeTri, quantizeNormal, FACETS, makeInclusions, skinForPersona, skinForSection, SKIN_FOR_PERSONA, SKIN_FOR_SECTION };
