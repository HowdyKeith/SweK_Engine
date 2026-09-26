// render/holeFillTsl.mjs -- v4737 -- THE HOLES OF A GENERATED FRAME, FILLED, AS TSL: render/holeFill.mjs's fillHolesCPU
// with its default growth ("neighbourhood" -- the one render/holeFill.mjs did not measure as worse than doing nothing),
// both preferences and all five side modes. Graded by render/holeFillTsl-selfcheck.mjs against the CPU reference exactly:
// the side code, the vector, the depth and the mask, and the abstentions.
//
// *** THE FILL IS A GATHER, SO IT IS A FRAGMENT PASS ON BOTH BACKENDS. *** Each hole pixel searches its own (2r + 1)^2
// neighbourhood in the ORIGINAL mask -- the splat's output, never the fill's own writes -- for two things: the vector
// `prefer` chooses (the farther by default: a hole in a disocclusion is background) and the occluder (the NEAREST
// surface, and among equally near ones the spatially closest) that decides which frame the content is in. Nothing is
// scattered, so nothing needs a depth test or an atomic; render/holeFillWgsl.mjs is the same search on a compute stage.
//
// *** THE SCAN ORDER IS THE MIRROR'S, BECAUSE BOTH TIE RULES ARE "THE FIRST ONE FOUND KEEPS IT". *** fillHolesCPU walks
// dy from -r to r and dx inside it, replacing a candidate only on a STRICT improvement; the loop here is unrolled in the
// same order with the same strictness, so an equal depth leaves the first found alone on both. v4678's wrapped-occluder
// fixture exists because a one-sided occluder cannot tell the difference, and the gate carries it.
//
// *** THE DEPTH SIDE MODE'S FETCH IS floor(x + 0.5), Math.round, NOT round(). *** v4734 found render/holeFillWgsl.mjs
// splitting 64 of 256 side codes on round()'s tie to even; the gate carries that fixture too.
//
// Two passes read one search: `fieldNode` writes vec4(vx, vy, zbuf, filled-or-landed) -- the splat's own texel where it
// landed -- and `sideNode` writes vec4(side, abstained, newly filled, 1). The search is compiled into both rather than
// shared through a multiple-render-target pass: one graph a target is how every other pass in this tree is built. It is a
// LOOP, not unrolled -- the unrolled first draft put 81 copies of its body in each shader and compiled for most of a minute.
"use strict";
import { requireTsl } from "./temporalTsl.mjs";
import { SIDE_BLEND, SIDE_PREV, SIDE_CUR } from "./holeFill.mjs";

export const FILL_SIDES = Object.freeze(["depth", "derived", "blend", "prev", "cur"]);
export const MAX_FILL_RADIUS = 8;

/**
 * fillHolesCPU as two nodes over `splatTex` (w x h: vx, vy, zbuf, landed -- render/frameInterpTsl.mjs's targets.vec).
 * `depthPrev` and `depthCur` are textures (.x, clip depth) and REQUIRED by side "depth", as fillHolesCPU requires them.
 * uniforms.t is the time the side mode samples at.
 */
export function fillHolesNodes(TSL, splatTex, { w, h, radius = 4, prefer = "farther", side = "derived", nearerIsLess = true,
                                               depthPrev = null, depthCur = null, t = 0.5 }) {
    requireTsl(TSL);
    if (!Number.isInteger(radius) || radius < 1 || radius > MAX_FILL_RADIUS)
        throw new Error(`render/holeFillTsl: radius must be a whole number of pixels from 1 to ${MAX_FILL_RADIUS} -- the search reads (2r + 1)^2 taps a pixel; got ${radius}`);
    if (prefer !== "farther" && prefer !== "nearer") throw new Error(`render/holeFillTsl: prefer must be "farther" or "nearer" -- got ${JSON.stringify(prefer)}`);
    if (!FILL_SIDES.includes(side)) throw new Error(`render/holeFillTsl: side must be one of ${FILL_SIDES.join(", ")} -- got ${JSON.stringify(side)}`);
    if (side === "depth" && (!depthPrev || !depthCur))
        throw new Error('render/holeFillTsl: side "depth" needs depthPrev and depthCur -- it is render/temporalReject.mjs\'s disocclusion comparison, and there is nothing to compare without them');
    const { Fn, Loop, float, int, vec4, ivec2, uniform, textureLoad, screenCoordinate, clamp, floor, select } = TSL;
    const u = { w: uniform(float(w)), h: uniform(float(h)), t: uniform(float(t)) };
    // "farther" is the LARGER depth where nearer is less; a build-time choice, as it is a constant of the call
    const farther = (a, b) => (nearerIsLess ? a.greaterThan(b) : a.lessThan(b));
    const wants = prefer === "farther" ? farther : (a, b) => farther(b, a);
    const search = () => {
        const x = floor(screenCoordinate.x), y = floor(screenCoordinate.y);
        const here = textureLoad(splatTex, ivec2(int(x), int(y)));
        const isHole = here.w.lessThan(0.5);
        const bFound = float(0.0).toVar(), bz = float(0.0).toVar(), bvx = float(0.0).toVar(), bvy = float(0.0).toVar();
        const oFound = float(0.0).toVar(), oz = float(0.0).toVar(), od = float(0.0).toVar(), ox = float(0.0).toVar(), oy = float(0.0).toVar(),
              ovx = float(0.0).toVar(), ovy = float(0.0).toVar();
        // ONE loop over the (2r + 1)^2 taps, row-major -- dy outer, dx inner, the mirror's scan order -- rather than the
        // taps unrolled: the first draft unrolled them, compiled 81 copies of the body into every fill shader, and the gate
        // spent 48 s compiling (render/holeFillTsl-selfcheck.mjs's log)
        const n = 2 * radius + 1;
        Loop({ start: int(0), end: int(n * n), type: "int", condition: "<" }, ({ i }) => {
            const iy = i.div(n), ix = i.sub(iy.mul(n));
            const dx = float(ix.sub(radius)), dy = float(iy.sub(radius));
            const xx = x.add(dx), yy = y.add(dy);
            const inb = xx.greaterThanEqual(0.0).and(xx.lessThan(u.w)).and(yy.greaterThanEqual(0.0)).and(yy.lessThan(u.h));
            const k = textureLoad(splatTex, ivec2(int(clamp(xx, 0.0, u.w.sub(1.0))), int(clamp(yy, 0.0, u.h.sub(1.0)))));
            const cand = inb.and(k.w.greaterThan(0.5));
            const take = cand.and(bFound.lessThan(0.5).or(wants(k.z, bz)));
            bz.assign(select(take, k.z, bz)); bvx.assign(select(take, k.x, bvx)); bvy.assign(select(take, k.y, bvy));
            bFound.assign(select(cand, float(1.0), bFound));
            const d2 = dx.mul(dx).add(dy.mul(dy));
            const takeO = cand.and(oFound.lessThan(0.5).or(farther(oz, k.z)).or(k.z.equal(oz).and(d2.lessThan(od))));
            oz.assign(select(takeO, k.z, oz)); od.assign(select(takeO, d2, od));
            ox.assign(select(takeO, xx, ox)); oy.assign(select(takeO, yy, oy));
            ovx.assign(select(takeO, k.x, ovx)); ovy.assign(select(takeO, k.y, ovy));
            oFound.assign(select(cand, float(1.0), oFound));
        });
        const filled = isHole.and(bFound.greaterThan(0.5));
        // the side, for a pixel that was filled; a landed pixel is SIDE_BLEND, as fillHolesCPU leaves it
        let sideV, abst;
        if (side === "blend" || side === "prev" || side === "cur") {
            sideV = float(side === "blend" ? SIDE_BLEND : side === "prev" ? SIDE_PREV : SIDE_CUR); abst = float(0.0);
        } else if (side === "depth") {
            const at = (tex, px, py) => textureLoad(tex, ivec2(int(clamp(floor(px.add(0.5)), 0.0, u.w.sub(1.0))), int(clamp(floor(py.add(0.5)), 0.0, u.h.sub(1.0))))).x;
            const pOcc = farther(bz, at(depthPrev, x.sub(u.t.mul(bvx)), y.sub(u.t.mul(bvy))));
            const cOcc = farther(bz, at(depthCur, x.add(float(1.0).sub(u.t).mul(bvx)), y.add(float(1.0).sub(u.t).mul(bvy))));
            const toCur = pOcc.and(cOcc.not()), toPrev = cOcc.and(pOcc.not());
            sideV = select(toCur, float(SIDE_CUR), select(toPrev, float(SIDE_PREV), float(SIDE_BLEND)));
            abst = select(toCur.or(toPrev), float(0.0), float(1.0));
        } else {
            // "derived": does the occluder's own motion carry it AWAY from this hole, or TOWARD it?
            const dot = ovx.mul(x.sub(ox)).add(ovy.mul(y.sub(oy)));
            sideV = select(dot.lessThan(0.0), float(SIDE_CUR), select(dot.greaterThan(0.0), float(SIDE_PREV), float(SIDE_BLEND)));
            abst = select(dot.equal(0.0), float(1.0), float(0.0));
        }
        return { here, filled, bvx, bvy, bz, sideV, abst };
    };
    const fieldNode = Fn(() => {
        const s = search();
        return select(s.filled, vec4(s.bvx, s.bvy, s.bz, 1.0), s.here);
    })();
    const sideNode = Fn(() => {
        const s = search();
        return select(s.filled, vec4(s.sideV, s.abst, 1.0, 1.0), vec4(float(SIDE_BLEND), 0.0, 0.0, 1.0));
    })();
    return { fieldNode, sideNode, uniforms: u };
}
