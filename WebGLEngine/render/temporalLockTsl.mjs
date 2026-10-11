// render/temporalLockTsl.mjs -- v4730, v4732
//
// THE LOCK FOR A THREE.JS SCENE, AS TSL: render/temporalLock.mjs's ring (pushLuma, shadingShiftCPU, lumaMean,
// lumaInstability) and, from v4732, its LOCK LIFE (ridgesCPU, newLocksCPU, lockCandidatesFromRing, advanceLocks,
// lockRelaxation, activeMask). Graded by render/temporalLockTsl-selfcheck.mjs. Written into render/temporalTsl.mjs
// first and split out the same round, when that module's gate grew past the sweep's 20 s cap.
"use strict";
import { requireTsl } from "./temporalTsl.mjs";
// ================================================================================================================
// v4730 -- THE LOCK RING: render/temporalLock.mjs's pushLuma and shadingShiftCPU -- what fsr.html's chain runs for
// FSR2's lock stage. A per-pixel ring of 2 x period lumas, REPROJECTED through the motion field every frame, whose
// newer half against its older half is the shading-shift mask the history factor takes. (temporalLock.mjs's
// advanceLocks and lockRelaxation -- lock life and the clamp relaxation -- had no caller in this tree, fsr.html
// included, so v4730 did not port them. v4732 does; see the lock-life block below.)
//
// *** THE RING IS PACKED FOUR SLOTS TO A TEXEL, ONE SLICE PER FOUR SLOTS STACKED DOWN THE TARGET. *** Texel
// (x, s*h + y) holds slots 4s..4s+3 of pixel (x, y), so a w x h ring of F slots is one w x (h * ceil(F/4)) float
// target -- 64 slots at a 2x upscale is sixteen slices. The push shifts every slot down by one: slots 4s..4s+2 read
// the NEXT component of the same slice and slot 4s+3 reads the first of the next slice, so each output texel is two
// bilinear fetches, not four. The fourth channel is data, so the pass is NoBlending like every pass here.
//
// The fill count is its own target (pushLuma's `filled`, capped at 255, read at the NEAREST texel -- floor(u*w), the
// rule temporalLock.mjs chose over round() for the tie reason v4728 met again in the resolve).
// ================================================================================================================

/**
 * The ring for one w x h field: `push(renderer)` reprojects it through `motionTex` and appends this frame's luma of
 * `currentTex`; `shading(renderer, target)` writes shadingShiftCPU's mask as vec4(mask, 0, 0, 1). `period` must be
 * jitterPhaseCount(ratio), as makeLumaState requires. Targets ping-pong internally.
 */
export function makeLumaRing(THREE, TSL, { w, h, period, currentTex, motionTex, scale = 1, strength = 1 }) {
    requireTsl(TSL);
    if (!Number.isInteger(period) || period < 1) throw new Error("render/temporalLockTsl: makeLumaRing's period must be a positive integer -- pass jitterPhaseCount(ratio), as makeLumaState requires");
    const { Fn, float, int, vec4, ivec2, uniform, textureLoad, screenCoordinate, clamp, floor, min, abs, select } = TSL;
    const F = 2 * period, S = Math.ceil(F / 4);
    const flat = (hh) => new THREE.RenderTarget(w, hh, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const ring = [flat(h * S), flat(h * S)], filled = [flat(h), flat(h)];
    const u = { w: uniform(float(w)), h: uniform(float(h)), n: uniform(float(0)), F: uniform(float(F)),
                scale: uniform(float(scale)), strength: uniform(float(strength)) };
    const px = (y) => ivec2(int(floor(screenCoordinate.x)), int(y));
    // shared: where this pixel's surface was last frame, and whether that is usable (pushLuma's `usable`)
    const reproject = (x, y) => {
        const m = textureLoad(motionTex, ivec2(int(x), int(y)));
        const hu = x.add(0.5).div(u.w).add(m.x), hv = y.add(0.5).div(u.h).add(m.y);
        const usable = u.n.greaterThan(0.5).and(m.z.notEqual(0.0)).and(hu.greaterThanEqual(0.0)).and(hu.lessThan(1.0))
            .and(hv.greaterThanEqual(0.0)).and(hv.lessThan(1.0));
        return { hu, hv, usable };
    };
    const lumaAt = (x, y) => { const c = textureLoad(currentTex, ivec2(int(x), int(y))).xyz; return c.x.mul(0.25).add(c.y.mul(0.5)).add(c.z.mul(0.25)); };
    const pushNode = (prevRing) => Fn(() => {
        const row = floor(screenCoordinate.y), s = floor(row.div(u.h)), y = row.sub(s.mul(u.h)), x = floor(screenCoordinate.x);
        const l = lumaAt(x, y), { hu, hv, usable } = reproject(x, y);
        // sampleScalar, over a whole slice at once
        const bx = hu.mul(u.w).sub(0.5), by = hv.mul(u.h).sub(0.5), x0 = floor(bx), y0 = floor(by), fx = bx.sub(x0), fy = by.sub(y0);
        const at = (xx, yy, slice) => textureLoad(prevRing, ivec2(int(clamp(xx, 0.0, u.w.sub(1.0))), int(slice.mul(u.h).add(clamp(yy, 0.0, u.h.sub(1.0))))));
        const bil = (slice) => at(x0, y0, slice).mul(float(1.0).sub(fx)).mul(float(1.0).sub(fy)).add(at(x0.add(1.0), y0, slice).mul(fx).mul(float(1.0).sub(fy)))
            .add(at(x0, y0.add(1.0), slice).mul(float(1.0).sub(fx)).mul(fy)).add(at(x0.add(1.0), y0.add(1.0), slice).mul(fx).mul(fy));
        const here = bil(s), next = bil(min(s.add(1.0), float(S - 1)));
        const shifted = [here.y, here.z, here.w, next.x];
        const out = shifted.map((v, c) => {
            const k = s.mul(4.0).add(c);
            const val = select(k.equal(u.F.sub(1.0)), l, select(k.greaterThanEqual(u.F), float(0.0), v));
            return select(usable, val, select(k.greaterThanEqual(u.F), float(0.0), l));
        });
        return vec4(out[0], out[1], out[2], out[3]);
    })();
    const filledNode = (prevFilled) => Fn(() => {
        const x = floor(screenCoordinate.x), y = floor(screenCoordinate.y), { hu, hv, usable } = reproject(x, y);
        const nx = clamp(floor(hu.mul(u.w)), 0.0, u.w.sub(1.0)), ny = clamp(floor(hv.mul(u.h)), 0.0, u.h.sub(1.0));   // nearestTexel
        const was = textureLoad(prevFilled, ivec2(int(nx), int(ny))).x;
        return vec4(select(usable, min(float(255.0), was.add(1.0)), float(0.0)), 0.0, 0.0, 1.0);
    })();
    // every slot of pixel (x, y), in slot order; each slice fetched once
    const slots = (ringTex, x, y) => {
        const out = [];
        for (let sl = 0; sl < S; sl++) {
            const v = textureLoad(ringTex, ivec2(int(x), int(y.add(u.h.mul(sl)))));
            for (let c = 0; c < 4; c++) if (sl * 4 + c < F) out.push([v.x, v.y, v.z, v.w][c]);
        }
        return out;
    };
    const shadingNode = (ringTex, filledTex) => Fn(() => {
        const x = floor(screenCoordinate.x), y = floor(screenCoordinate.y);
        const P = period;
        let mNew = float(0.0), mOld = float(0.0);
        // lumaMean and lumaMeanPrev, summed in slot order as the mirror sums them
        slots(ringTex, x, y).forEach((comp, k) => { if (k >= P) mNew = mNew.add(comp); else mOld = mOld.add(comp); });
        const full = textureLoad(filledTex, ivec2(int(x), int(y))).x.greaterThanEqual(u.F);
        const r = clamp(u.strength.mul(abs(mNew.div(P).sub(mOld.div(P)))).div(u.scale), 0.0, 1.0);
        return vec4(select(full, r, float(0.0)), 0.0, 0.0, 1.0);
    })();
    // v4732: lumaMean -- the newer period's mean, the jitter-free field lockCandidatesFromRing runs the ridge test over
    // -- and lumaInstability, the mean absolute deviation about it that advanceLocks' instability kill reads. Neither
    // looks at the fill count, as neither mirror does.
    const meanOf = (all) => { let m = float(0.0); for (let k = period; k < F; k++) m = m.add(all[k]); return m.div(period); };
    const meanNode = (ringTex) => Fn(() => {
        const x = floor(screenCoordinate.x), y = floor(screenCoordinate.y);
        return vec4(meanOf(slots(ringTex, x, y)), 0.0, 0.0, 1.0);
    })();
    const instabilityNode = (ringTex) => Fn(() => {
        const x = floor(screenCoordinate.x), y = floor(screenCoordinate.y), all = slots(ringTex, x, y);
        const m = meanOf(all).toVar();
        let a = float(0.0); for (let k = period; k < F; k++) a = a.add(abs(all[k].sub(m)));
        return vec4(a.div(period), 0.0, 0.0, 1.0);
    })();
    const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false;
        const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return sc; };
    // push k writes ring[k % 2] from ring[1 - k % 2]; the scenes are built once per direction
    const pushSc = [quad(pushNode(ring[1].texture)), quad(pushNode(ring[0].texture))];
    const fillSc = [quad(filledNode(filled[1].texture)), quad(filledNode(filled[0].texture))];
    const shadeSc = [quad(shadingNode(ring[0].texture, filled[0].texture)), quad(shadingNode(ring[1].texture, filled[1].texture))];
    const meanSc = [quad(meanNode(ring[0].texture)), quad(meanNode(ring[1].texture))];
    const instSc = [quad(instabilityNode(ring[0].texture)), quad(instabilityNode(ring[1].texture))];
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    let pushes = 0;
    const draw = async (renderer, scs, target) => {
        const prev = renderer.getRenderTarget();
        renderer.setRenderTarget(target); await renderer.renderAsync(scs[(pushes + 1) % 2], ortho);
        renderer.setRenderTarget(prev);
    };
    return {
        F, S, period, uniforms: u,
        get pushes() { return pushes; },
        /** The target holding the NEWEST ring and fill count (valid after the first push). */
        get ring() { return ring[(pushes + 1) % 2]; },
        get filled() { return filled[(pushes + 1) % 2]; },
        async push(renderer) {
            const prev = renderer.getRenderTarget(), k = pushes % 2;
            u.n.value = pushes;
            renderer.setRenderTarget(ring[k]); await renderer.renderAsync(pushSc[k], ortho);
            renderer.setRenderTarget(filled[k]); await renderer.renderAsync(fillSc[k], ortho);
            renderer.setRenderTarget(prev);
            pushes++;
        },
        async shading(renderer, target) { await draw(renderer, shadeSc, target); },
        /** lumaMean of the newest ring, as vec4(mean, 0, 0, 1) -- the field lockCandidatesFromRing takes. */
        async mean(renderer, target) { await draw(renderer, meanSc, target); },
        /** lumaInstability of the newest ring, as vec4(spread, 0, 0, 1) -- what advanceLocks' instabilityKill reads. */
        async instability(renderer, target) { await draw(renderer, instSc, target); },
        dispose() { for (const t of [...ring, ...filled]) t.dispose(); },
    };
}

// ================================================================================================================
// v4732 -- LOCK LIFE: render/temporalLock.mjs's ridgesCPU, newLocksCPU, lockCandidatesFromRing, advanceLocks,
// lockRelaxation and activeMask, and the `relax` input render/temporalTsl.mjs's accumulateNode gained to take them.
// A lock marks a pixel holding a feature THINNER THAN A PIXEL -- a strict luma extremum along either axis -- and
// relaxes the neighbourhood clamp there for `life` frames, so the history keeps the feature through the jitter phases
// that miss it. v4728 measured the clamp taking half the accumulation's gain on such detail; this is the tree's answer.
//
// *** WHAT IT BUYS IS CONTENT'S, AND THE DRIVER'S DEFAULT FOLLOWS THE MEASUREMENT. *** v4732 ran the chain on the CPU
// from device renders, 64 -> 128, 48 frames: on fsr-three.html's own scene -- a knot and stripes 1.6 render pixels
// wide -- REMOVING THE CLAMP ENTIRELY moves the still picture 0.013 dB, so no lock can buy anything there; on seven
// wires 0.4 render pixels wide, locks from the ring buy 1.09 dB (16.84 -> 17.93), more than no clamp at all (17.79).
// fx/fsr/fsrTemporalLocks-selfcheck.mjs holds both on the device, through the driver.
//
// *** THE RIDGE TEST'S HORIZONTAL WALK WRAPS ACROSS ROWS, BECAUSE THE MIRROR'S DOES, AND THE PORT KEEPS IT. ***
// ridgesCPU walks a LINEAR index: `j = i + step * k` with step +/-1, so at x = 1 the second step left is pixel
// (w - 1, y - 1) and at x = w - 2 the second step right is (0, y + 1). That is only reached when the first neighbour
// is inside the margin (the plateau walk), and it reads a pixel on the far side of the frame. It is a quirk of the
// reference rather than a design, but a port that "fixed" it would disagree with every CPU gate in the lock arc, so
// the wrap is written out -- and the gate counts how many decisions it touched.
//
// NOT CARRIED: ridgesCPU's PER-PIXEL margin (render/ringFloor.mjs's field; every caller in the tree passes a number),
// and the counts every CPU function returns beside its mask -- a fragment pass has no counter, and the gate counts.
// ================================================================================================================

/** The ridge test over any scalar field `fieldAt(x, y)` (a node): ridgesCPU's decide, unrolled to maxPlateau steps. */
function ridgeTest(TSL, fieldAt, u, maxPlateau) {
    const { float, floor, select, screenCoordinate } = TSL;
    const x = floor(screenCoordinate.x), y = floor(screenCoordinate.y), c = fieldAt(x, y);
    // -1, 0 or +1: the FIRST neighbour along the walk that differs by more than the margin, 0 when the walk leaves the
    // frame or ends inside a plateau. Built from the far end back, so the nearest decisive step wins.
    const decide = (sx, sy) => {
        let r = float(0.0);
        for (let k = maxPlateau; k >= 1; k--) {
            let nx = x.add(sx * k), ny = y.add(sy * k);
            if (sx !== 0) {    // the linear index wraps into the neighbouring row, as the mirror's does
                const left = nx.lessThan(0.0), right = nx.greaterThanEqual(u.w);
                ny = select(left, ny.sub(1.0), select(right, ny.add(1.0), ny));
                nx = select(left, nx.add(u.w), select(right, nx.sub(u.w), nx));
            }
            const out = ny.lessThan(0.0).or(ny.greaterThanEqual(u.h));
            const dv = fieldAt(nx, ny).sub(c);
            const decisive = out.or(dv.greaterThan(u.margin)).or(dv.lessThan(u.margin.negate()));
            r = select(decisive, select(out, float(0.0), select(dv.greaterThan(u.margin), float(1.0), float(-1.0))), r);
        }
        return r;
    };
    const L = decide(-1, 0), R = decide(1, 0), U = decide(0, -1), D = decide(0, 1);
    const interior = x.greaterThanEqual(1.0).and(x.lessThan(u.w.sub(1.0))).and(y.greaterThanEqual(1.0)).and(y.lessThan(u.h.sub(1.0)));
    const ax = interior.and(L.equal(R)).and(L.notEqual(0.0)), ay = interior.and(U.equal(D)).and(U.notEqual(0.0));
    return { ridge: ax.or(ay), ax, ay };
}

function checkRidge(margin, maxPlateau, who) {
    if (!(typeof margin === "number" && margin >= 0)) throw new Error(`render/temporalLockTsl: ${who}'s margin must be a non-negative number -- the per-pixel field ridgesCPU also takes is not carried`);
    if (!Number.isInteger(maxPlateau) || maxPlateau < 1 || maxPlateau > 8)
        throw new Error(`render/temporalLockTsl: ${who}'s maxPlateau must be an integer from 1 to 8 -- the walk is unrolled; got ${maxPlateau}`);
}

function ridgeOut(TSL, t) {
    const { vec4, select, float } = TSL, b = (v) => select(v, float(1.0), float(0.0));
    return vec4(b(t.ridge), b(t.ax), b(t.ay), 1.0);
}

/**
 * ridgesCPU over a scalar field texture's .x (lumaMean from makeLumaRing's `mean`, or a depth buffer, as
 * depthRidgesCPU runs it): vec4(ridge, axisX, axisY, 1), each 0 or 1 -- the mirror's { data, axisX, axisY }.
 */
export function ridgesNode(TSL, fieldTex, { w, h, margin = 0.05, maxPlateau = 2 }) {
    requireTsl(TSL); checkRidge(margin, maxPlateau, "ridgesNode");
    const { Fn, float, int, ivec2, uniform, textureLoad, clamp } = TSL;
    const u = { w: uniform(float(w)), h: uniform(float(h)), margin: uniform(float(margin)) };
    const at = (x, y) => textureLoad(fieldTex, ivec2(int(clamp(x, 0.0, u.w.sub(1.0))), int(clamp(y, 0.0, u.h.sub(1.0))))).x;
    const node = Fn(() => ridgeOut(TSL, ridgeTest(TSL, at, u, maxPlateau)))();
    return { node, uniforms: u };
}

/**
 * newLocksCPU: the ridge test over ONE frame's luma (the ring's 0.25/0.5/0.25). Kept because it needs no ring --
 * at a 2x upscale the ring is 64 slots a pixel -- and v4732 measured it at least matching the ring's candidates on
 * the scenes the quality gate draws; render/temporalLock.mjs records where it does not (a 0.4 px line on a still
 * camera, found by no single frame).
 */
export function newLocksNode(TSL, currentTex, { w, h, margin = 0.05, maxPlateau = 2 }) {
    requireTsl(TSL); checkRidge(margin, maxPlateau, "newLocksNode");
    const { Fn, float, int, ivec2, uniform, textureLoad, clamp } = TSL;
    const u = { w: uniform(float(w)), h: uniform(float(h)), margin: uniform(float(margin)) };
    const at = (x, y) => { const c = textureLoad(currentTex, ivec2(int(clamp(x, 0.0, u.w.sub(1.0))), int(clamp(y, 0.0, u.h.sub(1.0))))).xyz;
        return c.x.mul(0.25).add(c.y.mul(0.5)).add(c.z.mul(0.25)); };
    const node = Fn(() => ridgeOut(TSL, ridgeTest(TSL, at, u, maxPlateau)))();
    return { node, uniforms: u };
}

/**
 * advanceLocks as a node: vec4(life, 0, 0, 1). `state` is last frame's life (.x); the lock is carried from the
 * NEAREST texel it reprojects to (floor(u*w), nearestTexel's rule) and decays by one, dies where the field is invalid
 * or leaves the frame, where `disocclusion`.x > 0, and where `instability`.x > instabilityKill; `newLocks`.x > 0 sets
 * it to `life`. uniforms.n is the number of advances before this one -- 0 reads the state as empty, which is what
 * makeLockState's fresh zeros are. An instability kill of Infinity (the mirror's default) is left out of the node.
 */
export function advanceLocksNode(TSL, { state, motion, disocclusion = null, instability = null, newLocks = null },
                                 { w, h, life = 4, instabilityKill = Infinity }) {
    requireTsl(TSL);
    if (!(life > 0)) throw new Error(`render/temporalLockTsl: life must be a positive number of frames -- got ${life}`);
    const kill = instability && Number.isFinite(instabilityKill);
    const { Fn, float, int, vec4, ivec2, uniform, textureLoad, screenCoordinate, clamp, floor, max, select } = TSL;
    const u = { w: uniform(float(w)), h: uniform(float(h)), life: uniform(float(life)), n: uniform(float(0)) };
    if (kill) u.instabilityKill = uniform(float(instabilityKill));
    const node = Fn(() => {
        const x = floor(screenCoordinate.x), y = floor(screenCoordinate.y), here = ivec2(int(x), int(y));
        const m = textureLoad(motion, here);
        const hu = x.add(0.5).div(u.w).add(m.x), hv = y.add(0.5).div(u.h).add(m.y);
        const usable = u.n.greaterThan(0.5).and(m.z.notEqual(0.0)).and(hu.greaterThanEqual(0.0)).and(hu.lessThan(1.0))
            .and(hv.greaterThanEqual(0.0)).and(hv.lessThan(1.0));
        const nx = clamp(floor(hu.mul(u.w)), 0.0, u.w.sub(1.0)), ny = clamp(floor(hv.mul(u.h)), 0.0, u.h.sub(1.0));
        let carried = select(usable, max(float(0.0), textureLoad(state, ivec2(int(nx), int(ny))).x.sub(1.0)), float(0.0));
        if (disocclusion) carried = select(textureLoad(disocclusion, here).x.greaterThan(0.0), float(0.0), carried);
        if (kill) carried = select(textureLoad(instability, here).x.greaterThan(u.instabilityKill), float(0.0), carried);
        const next = newLocks ? select(textureLoad(newLocks, here).x.greaterThan(0.0), u.life, carried) : carried;
        return vec4(next, 0.0, 0.0, 1.0);
    })();
    return { node, uniforms: u };
}

/** lockRelaxation as a node: vec4(clamp(life / lifeMax, 0, 1), 0, 0, 1) -- accumulateNode's `relax`. */
export function lockRelaxationNode(TSL, state, { life = 4 } = {}) {
    requireTsl(TSL);
    if (!(life > 0)) throw new Error(`render/temporalLockTsl: life must be a positive number of frames -- got ${life}`);
    const { Fn, float, int, vec4, ivec2, uniform, textureLoad, screenCoordinate, clamp, floor } = TSL;
    const u = { life: uniform(float(life)) };
    const node = Fn(() => vec4(clamp(textureLoad(state, ivec2(int(floor(screenCoordinate.x)), int(floor(screenCoordinate.y)))).x.div(u.life), 0.0, 1.0), 0.0, 0.0, 1.0))();
    return { node, uniforms: u };
}

/** activeMask as a node: vec4(life > 0 ? 1 : 0, 0, 0, 1). */
export function activeMaskNode(TSL, state) {
    requireTsl(TSL);
    const { Fn, float, int, vec4, ivec2, textureLoad, screenCoordinate, floor, select } = TSL;
    const node = Fn(() => vec4(select(textureLoad(state, ivec2(int(floor(screenCoordinate.x)), int(floor(screenCoordinate.y)))).x.greaterThan(0.0), float(1.0), float(0.0)), 0.0, 0.0, 1.0))();
    return { node };
}

/**
 * The lock state across frames: makeLockState, advanceLocks, lockRelaxation and activeMask over a ping-pong pair.
 * `advance(renderer)` steps it once from `candidatesTex` (a ridge target, .x) through `motionTex`, killing on
 * `disocclusionTex` and `instabilityTex` where given; `relaxation(renderer, target)` and `active(renderer, target)`
 * write the newest state's relax and mask. `state` is the target holding the newest life.
 */
export function makeLockLife(THREE, TSL, { w, h, motionTex, candidatesTex = null, disocclusionTex = null, instabilityTex = null,
                                           life = 4, instabilityKill = Infinity }) {
    requireTsl(TSL);
    const flat = () => new THREE.RenderTarget(w, h, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const st = [flat(), flat()];
    const quad = (node) => { const m = new THREE.NodeMaterial(); m.fragmentNode = node; m.blending = THREE.NoBlending; m.depthTest = false; m.depthWrite = false;
        const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m)); return sc; };
    // advance k writes st[k % 2] from st[1 - k % 2]
    const adv = [1, 0].map((from) => advanceLocksNode(TSL, { state: st[from].texture, motion: motionTex, disocclusion: disocclusionTex,
                                                              instability: instabilityTex, newLocks: candidatesTex }, { w, h, life, instabilityKill }));
    const rel = [0, 1].map((k) => lockRelaxationNode(TSL, st[k].texture, { life }));
    const act = [0, 1].map((k) => activeMaskNode(TSL, st[k].texture));
    const advSc = adv.map((a) => quad(a.node)), relSc = rel.map((r) => quad(r.node)), actSc = act.map((a) => quad(a.node));
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    let frames = 0;
    const draw = async (renderer, sc, target) => { const prev = renderer.getRenderTarget(); renderer.setRenderTarget(target); await renderer.renderAsync(sc, ortho); renderer.setRenderTarget(prev); };
    return {
        life, uniforms: { advance: adv.map((a) => a.uniforms), relaxation: rel.map((r) => r.uniforms) },
        /** The ping-pong pair: advance k writes targets[k % 2]. */
        targets: st,
        get frames() { return frames; },
        /** The target holding the NEWEST life (valid after the first advance). */
        get state() { return st[(frames + 1) % 2]; },
        async advance(renderer) { const k = frames % 2; adv[k].uniforms.n.value = frames; await draw(renderer, advSc[k], st[k]); frames++; },
        async relaxation(renderer, target) { await draw(renderer, relSc[(frames + 1) % 2], target); },
        async active(renderer, target) { await draw(renderer, actSc[(frames + 1) % 2], target); },
        dispose() { for (const t of st) t.dispose(); },
    };
}
