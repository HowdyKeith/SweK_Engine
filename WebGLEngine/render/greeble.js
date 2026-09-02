// WebGLEngine/render/greeble.js — v3843 (Long Silence: greebling, as an exact partition)
//
// GREEBLING is the trick that makes a hull read as machinery: cover a big flat panel in smaller panels at
// slightly different depths and the eye reads scale, seams and purpose into it. Technique from TheLongSilence
// (MIT, (c) 2026 Anshu Chimala), which greebles its stations and structures; nothing copied, and the shape here
// is SweK's own -- a recursive split whose output is a PARTITION, which is the part that can be checked.
//
// THE PROPERTY WORTH HAVING, AND THE ONE THE GATE PINS: the panels TILE their parent EXACTLY. Their areas sum to
// the parent's area, none overlaps another, none escapes the parent. That is what separates greebling from
// scattering: a scatter leaves gaps and double-covers, and on a hull both read as holes and z-fighting. Nothing
// about the look is asserted here -- only that the surface is covered once.
//
// STATELESS, NOT A STREAM. Every split decision is a hash of the panel's own path through the recursion, so the
// result does not depend on traversal order and a subtree can be regenerated without replaying the ones before
// it. The hash is render/valueNoise.js's -- the same integer hash the skybox and the star share, rather than
// growing another PRNG in the tree.
//
// *** v4327 -- THIS COMMENT USED TO SAY "THE SKYBOX, THE STAR AND THE PLANET". THE PLANET IS NOT IN THAT LIST. ***
// world/procPlanet.js has always carried its OWN hash3, on a different mix and a quintic fade, and the two agree
// on none of 360 sampled lattice points. The tree has two value noises on purpose; render/valueNoise.js's header
// explains why converging them is a look change and not a cleanup.
//
// PURE: no Three, no GL, no DOM, no Math.random. Same seed -> identical panels. Gated in render/greeble-selfcheck.mjs.

import { hash3 } from "./valueNoise.js";   // v4327 -- the skybox lineage's integer hash, from its own file

const DEFAULTS = {
    seed: 4242,
    depth: 4,          // recursion levels; panels <= 2^depth
    minSize: 0.06,     // a panel is never split below this in either axis (in the parent's own units)
    jitter: 0.32,      // how far off centre a cut may land, as a fraction of the side
    tiers: 4,          // number of distinct extrusion depths
    step: 0.012,       // height of one tier
    flatChance: 0.35,  // fraction of panels left flush with the hull (tier 0)
    tone: 0.35,        // how much panel-to-panel brightness varies, 0..1
};
export function makeGreebleParams(opts = {}) { return { ...DEFAULTS, ...opts }; }

// A panel's own coordinates ARE its identity: two panels of the same subdivision cannot share a path code, and a
// path code is all the hash needs, so no counter and no traversal order enter the result.
const decide = (path, level, seed, salt) => hash3(path | 0, level | 0, salt | 0, seed | 0);

// Split a rectangle into panels. Always cuts the LONGER side, so panels cannot degenerate into slivers; refuses
// to cut when either half would fall under minSize, which is what terminates the recursion on small faces.
// Returns [{ x, y, w, h, path, level }] covering the input exactly.
export function panelSplit(rect, P) {
    const out = [];
    (function rec(x, y, w, h, level, path) {
        const cutAxisW = w >= h;
        const side = cutAxisW ? w : h;
        if (level >= P.depth || side < P.minSize * 2) { out.push({ x, y, w, h, path, level }); return; }
        const j = (decide(path, level, P.seed, 1) - 0.5) * 2 * P.jitter;
        let t = 0.5 + j;
        const tMin = P.minSize / side, tMax = 1 - tMin;
        if (tMin > tMax) { out.push({ x, y, w, h, path, level }); return; }
        t = t < tMin ? tMin : t > tMax ? tMax : t;
        const cut = side * t;
        if (cutAxisW) {
            rec(x, y, cut, h, level + 1, path * 2 + 1);
            rec(x + cut, y, w - cut, h, level + 1, path * 2 + 2);
        } else {
            rec(x, y, w, cut, level + 1, path * 2 + 1);
            rec(x, y + cut, w, h - cut, level + 1, path * 2 + 2);
        }
    })(rect.x, rect.y, rect.w, rect.h, 0, 1);
    return out;
}

// Quantised extrusion: a panel's depth is always an exact multiple of the tier step, and a declared fraction of
// panels stay flush. Quantising is not a detail -- panels at arbitrary depths read as noise, while a few shared
// depths read as plating.
export function panelDepth(panel, P) {
    const r = decide(panel.path, panel.level, P.seed, 7);
    if (r < P.flatChance) return 0;
    const tier = 1 + Math.floor(((r - P.flatChance) / (1 - P.flatChance)) * P.tiers);
    return Math.min(tier, P.tiers) * P.step;
}

// Per-panel brightness multiplier around 1, so neighbouring plates differ slightly without any panel going dark.
export function panelTone(panel, P) {
    return 1 + (decide(panel.path, panel.level, P.seed, 13) - 0.5) * P.tone;
}

// The whole greeble of one rectangle: panels with their depth and tone.
export function greebleFace(rect, opts = {}) {
    const P = makeGreebleParams(opts);
    return panelSplit(rect, P).map((p) => ({ ...p, depth: panelDepth(p, P), tone: panelTone(p, P) }));
}

// ---- greebling a box in 3D ----
// The six faces of an axis-aligned box, each as { axis, sign, u, v } where u/v are the axis indices the face's
// rectangle runs along. Face order is +X, -X, +Y, -Y, +Z, -Z, matching the cubemap convention used elsewhere.
const BOX_FACES = [
    { axis: 0, sign: +1, u: 2, v: 1 }, { axis: 0, sign: -1, u: 2, v: 1 },
    { axis: 1, sign: +1, u: 0, v: 2 }, { axis: 1, sign: -1, u: 0, v: 2 },
    { axis: 2, sign: +1, u: 0, v: 1 }, { axis: 2, sign: -1, u: 0, v: 1 },
];

// Greeble all six faces of a box of the given size (full extents, centred on the origin). Returns axis-aligned
// plates as { center:[x,y,z], size:[x,y,z], face, tone } -- ready for one instanced box draw. A plate of depth 0
// is dropped: it is flush with the hull and would only z-fight with it.
export function greebleBox(size, opts = {}) {
    const P = makeGreebleParams(opts);
    const plates = [];
    for (let f = 0; f < BOX_FACES.length; f++) {
        const F = BOX_FACES[f];
        const su = size[F.u], sv = size[F.v], half = size[F.axis] * 0.5;
        // each face gets its own seed so opposite faces are not mirror images of one another
        const panels = greebleFace({ x: 0, y: 0, w: 1, h: 1 }, { ...P, seed: (P.seed ^ (f * 0x9e3779b1)) | 0 });
        for (const p of panels) {
            if (p.depth <= 0) continue;
            const d = p.depth * Math.min(su, sv);       // depth scales with the face, so a small face keeps its proportions
            const center = [0, 0, 0], ext = [0, 0, 0];
            center[F.u] = (p.x + p.w * 0.5 - 0.5) * su; ext[F.u] = p.w * su;
            center[F.v] = (p.y + p.h * 0.5 - 0.5) * sv; ext[F.v] = p.h * sv;
            center[F.axis] = F.sign * (half + d * 0.5); ext[F.axis] = d;
            plates.push({ center, size: ext, face: f, tone: p.tone });
        }
    }
    return plates;
}

// Total area of a panel list -- the gate's arithmetic, exported because the front door wants it too (it is how a
// hull reports how much of itself is plated).
export function panelArea(panels) { let a = 0; for (const p of panels) a += p.w * p.h; return a; }
