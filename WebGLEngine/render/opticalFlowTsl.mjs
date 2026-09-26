// render/opticalFlowTsl.mjs -- v4740 -- MOTION FROM COLOUR ALONE, FOR A THREE.JS SCENE, AS TSL: render/luminancePyramid.mjs's
// luminancePyramidCPU and render/opticalFlow.mjs's opticalFlowCPU -- the coarse-to-fine block matcher FSR3 runs beside the
// game's motion vectors, for what those vectors do not describe (a shadow crossing a still floor, a texture scrolling on
// a still mesh, a reflection, a particle, UI). Graded by render/opticalFlowTsl-selfcheck.mjs against both mirrors on both of
// three's backends: every pyramid level, and the SAME VECTOR at every block, with no tolerance -- a flow field's integer
// part is an answer, not a measurement.
//
// ---- THE PYRAMID ----------------------------------------------------------------------------------------------------
// One target per level: level 0 is the frame's luma (render/temporalReject.mjs's 0.25 / 0.5 / 0.25, the tree's one
// definition), each level above it the 2 x 2 average of the one below at ceil(size / 2), the last row and column read
// twice at an odd size -- "CLAMPED, not dropped", the mirror's rule -- summed in its order: 0.25 * (((a + b) + c) + d).
//
// ---- THE SEARCH -----------------------------------------------------------------------------------------------------
// One pass per level into a target holding one texel per BLOCK: vec4(fx, fy, confidence, 1), the forward displacement
// prev -> cur in full-resolution pixels (the NEGATIVE of the search's own cur -> prev sense, negated at the one site the
// mirror negates it). Each texel reads the coarser level's answer as its guess, SEEDS the search with the guess's own
// score (v4673's defect: seeded with Infinity, the first candidate won every tie and a flat field reported the window's
// corner), walks the (2r + 1)^2 window keeping a candidate only on a STRICT improvement, refines to a sub-pixel vertex at
// level 0 only, clamped to half a pixel, and reports how much better than standing still it did.
//
// *** EVERY ROUNDING IS floor(x + 0.5), Math.round, AND NOT round(). *** v4734 found render/opticalFlowWgsl.mjs's round()
// tying to even at a block origin bx * block / scale that lands on a half -- 44 of 512 components, one by 79 pixels.
"use strict";
import { requireTsl } from "./temporalTsl.mjs";

/**
 * A pyramid for a w x h frame: levels target(s) from w x h down to 1 x 1, each vec4(luma, 0, 0, 1). build(renderer,
 * srcTex) fills it from an rgba texture. `levels` caps how many are built (the search needs only its own).
 */
export function makeLumaPyramid(THREE, TSL, { w, h, levels = Infinity }) {
    requireTsl(TSL);
    const { Fn, float, int, vec4, ivec2, textureLoad, screenCoordinate, min, floor } = TSL;
    const sizes = [[w, h]];
    while (sizes.length < levels && (sizes[sizes.length - 1][0] > 1 || sizes[sizes.length - 1][1] > 1)) {
        const [cw, ch] = sizes[sizes.length - 1]; sizes.push([Math.ceil(cw / 2), Math.ceil(ch / 2)]);
    }
    const targets = sizes.map(([lw, lh]) => new THREE.RenderTarget(lw, lh, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false }));
    const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false;
        const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return sc; };
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const downs = sizes.slice(1).map(([lw, lh], k) => {
        const [cw, ch] = sizes[k], below = targets[k].texture;
        return quad(Fn(() => {
            const x = floor(screenCoordinate.x), y = floor(screenCoordinate.y);
            const x0 = min(x.mul(2.0), float(cw - 1)), x1 = min(x.mul(2.0).add(1.0), float(cw - 1));
            const y0 = min(y.mul(2.0), float(ch - 1)), y1 = min(y.mul(2.0).add(1.0), float(ch - 1));
            const at = (xx, yy) => textureLoad(below, ivec2(int(xx), int(yy))).x;
            return vec4(float(0.25).mul(at(x0, y0).add(at(x1, y0)).add(at(x0, y1)).add(at(x1, y1))), 0.0, 0.0, 1.0);
        })());
    });
    const bases = new Map();
    return {
        sizes, targets, levels: sizes.length,
        async build(renderer, srcTex) {
            if (!bases.has(srcTex)) bases.set(srcTex, quad(Fn(() => {
                const c = textureLoad(srcTex, ivec2(int(screenCoordinate.x), int(screenCoordinate.y))).xyz;
                return vec4(c.x.mul(0.25).add(c.y.mul(0.5)).add(c.z.mul(0.25)), 0.0, 0.0, 1.0);
            })()));
            const prev = renderer.getRenderTarget();
            renderer.setRenderTarget(targets[0]); await renderer.renderAsync(bases.get(srcTex), ortho);
            for (let k = 0; k < downs.length; k++) { renderer.setRenderTarget(targets[k + 1]); await renderer.renderAsync(downs[k], ortho); }
            renderer.setRenderTarget(prev);
        },
        dispose() { for (const t of targets) t.dispose(); },
    };
}

/**
 * opticalFlowCPU over two pyramids: flow(renderer, curPyr, prevPyr) writes `target` (bw x bh: fx, fy, conf, 1). The
 * pyramids must hold at least min(levels, their own) levels, which makeOpticalFlow's own pyramids do.
 */
export function makeOpticalFlow(THREE, TSL, { w, h, block = 8, searchRadius = 4, levels = 3, subpixel = true }) {
    requireTsl(TSL);
    if (!(block >= 2) || block !== Math.floor(block)) throw new Error(`render/opticalFlowTsl: block must be a whole number of pixels, at least 2 -- got ${block}`);
    if (!(searchRadius >= 1) || searchRadius !== Math.floor(searchRadius)) throw new Error(`render/opticalFlowTsl: searchRadius must be a whole number of pixels, at least 1 -- got ${searchRadius}`);
    if (!(levels >= 1) || levels !== Math.floor(levels)) throw new Error(`render/opticalFlowTsl: levels must be a whole number, at least 1 -- got ${levels}`);
    const { Fn, Loop, float, int, vec4, ivec2, textureLoad, screenCoordinate, clamp, floor, abs, max, min, select } = TSL;
    const bw = Math.ceil(w / block), bh = Math.ceil(h / block);
    const cur = makeLumaPyramid(THREE, TSL, { w, h, levels }), prev = makeLumaPyramid(THREE, TSL, { w, h, levels });
    const top = Math.min(levels, cur.levels) - 1;
    const flat = () => new THREE.RenderTarget(bw, bh, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const flows = [flat(), flat()];
    const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false;
        const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return sc; };
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const n = block, R = searchRadius;
    // level L's pass: reads the coarser level's answer from `guessTex` (null at the top, where the guess is zero)
    const levelNode = (L, guessTex) => Fn(() => {
        const [lw, lh] = cur.sizes[L], a = cur.targets[L].texture, b = prev.targets[L].texture, scale = 1 << L;
        const bx = floor(screenCoordinate.x), by = floor(screenCoordinate.y);
        const lum = (tex, x, y) => textureLoad(tex, ivec2(int(clamp(x, 0.0, float(lw - 1))), int(clamp(y, 0.0, float(lh - 1))))).x;
        // sad(), in the mirror's order: y outer, x inner, each term |a - b|. *** ITS LOOP IS NAMED, AND THE CANDIDATE LOOP'S TOO. ***
        // TSL names a Loop's index by its place in the call -- i, then j -- and not by its depth, so two nested Loops are
        // both `i`; the candidate's offsets are expressions of the outer one, emitted where they are used, which is inside
        // the inner loop, where `i` is the inner one's. The first draft searched with the patch's own pixel index as its
        // offset and was wrong at 693 of 868 blocks. There are two defences and EITHER ALONE IS ENOUGH, which the sabotages
        // measured (0 red for each removed alone): the names, and the offsets made variables in the outer loop's own scope
        // (.toVar() below), so no expression of `c` is left to be emitted inside the inner one. Both are kept; the next
        // nested Loop this tree writes will have one of them or the other to forget.
        const sad = (ax, ay, sx, sy) => {
            const s = float(0.0).toVar();
            Loop({ start: int(0), end: int(n * n), type: "int", condition: "<", name: "p" }, ({ p }) => {
                const yy = float(p.div(n)), xx = float(p.sub(p.div(n).mul(n)));
                s.addAssign(abs(lum(a, ax.add(xx), ay.add(yy)).sub(lum(b, sx.add(xx), sy.add(yy)))));
            });
            return s;
        };
        const ox = floor(bx.mul(block).div(scale).add(0.5)), oy = floor(by.mul(block).div(scale).add(0.5));      // Math.round
        const g = guessTex ? textureLoad(guessTex, ivec2(int(bx), int(by))) : vec4(0.0);
        const gx = floor(g.x.negate().div(scale).add(0.5)), gy = floor(g.y.negate().div(scale).add(0.5));
        const bdx = gx.toVar(), bdy = gy.toVar();
        const best = sad(ox, oy, ox.add(gx), oy.add(gy)).toVar();                      // SEEDED with the guess's own score
        const w2 = 2 * R + 1;
        Loop({ start: int(0), end: int(w2 * w2), type: "int", condition: "<", name: "c" }, ({ c }) => {
            // y outer, x inner, as the mirror walks it: where candidates tie exactly -- content constant along a line, the
            // aperture problem in its pure form -- the first one scanned is the one kept, so the order is part of the answer
            const dy = float(c.div(w2).sub(R)).toVar(), dx = float(c.sub(c.div(w2).mul(w2)).sub(R)).toVar();
            const s = sad(ox, oy, ox.add(gx).add(dx), oy.add(gy).add(dy));
            const better = s.lessThan(best);                                            // STRICTLY: a tie leaves the guess
            bdx.assign(select(better, gx.add(dx), bdx)); bdy.assign(select(better, gy.add(dy), bdy)); best.assign(select(better, s, best));
        });
        let subx = float(0.0), suby = float(0.0);
        if (L === 0 && subpixel) {
            const px = (dx, dy) => sad(ox, oy, ox.add(bdx).add(dx), oy.add(bdy).add(dy));
            const vertex = (m, c, p) => { const den = m.sub(c.mul(2.0)).add(p), d = m.sub(p).div(den.mul(2.0));
                return select(abs(den).greaterThan(1e-9).and(abs(d).lessThanEqual(0.5)), d, float(0.0)); };
            subx = vertex(px(-1, 0), best, px(1, 0)); suby = vertex(px(0, -1), best, px(0, 1));
        }
        const still = sad(ox, oy, ox, oy);
        const conf = select(still.greaterThan(1e-6), max(float(0.0), min(float(1.0), still.sub(best).div(still))), float(0.0));
        return vec4(bdx.mul(scale).add(subx).negate(), bdy.mul(scale).add(suby).negate(), conf, 1.0);
    })();
    // the top level reads no guess; each level below reads the target the level above wrote
    const passes = [];
    for (let L = top, k = 0; L >= 0; L--, k++) passes.push({ L, out: flows[k % 2], sc: quad(levelNode(L, L === top ? null : flows[(k + 1) % 2].texture)) });
    return {
        bw, bh, block, levels: top + 1, pyramids: { cur, prev },
        /** The target holding the finest level's answer. */
        get target() { return passes[passes.length - 1].out; },
        /** Build both pyramids from rgba textures and search. */
        async flow(renderer, curTex, prevTex) {
            await cur.build(renderer, curTex); await prev.build(renderer, prevTex);
            const keep = renderer.getRenderTarget();
            for (const p of passes) { renderer.setRenderTarget(p.out); await renderer.renderAsync(p.sc, ortho); }
            renderer.setRenderTarget(keep);
        },
        dispose() { cur.dispose(); prev.dispose(); for (const f of flows) f.dispose(); },
    };
}
